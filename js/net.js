'use strict';
// ================== ONLINE (WebRTC entre dos navegadores, sin servidor propio) ==================
// El anfitrión simula el partido y envía el estado; el invitado manda sus controles.
// La conexión se arma intercambiando dos códigos (copiar y pegar por WhatsApp, mail, etc.).
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
let pc = null, dc = null, netMode = 'coop', snapTimer = 0, inTimer = 0, netSnap = null, netLastScore = '';

async function packDesc(desc) {
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  try {
    if (window.CompressionStream) {
      const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = new Uint8Array(await new Response(cs).arrayBuffer());
      let bin = ''; buf.forEach(b => bin += String.fromCharCode(b));
      return 'PA1' + btoa(bin);
    }
  } catch (e) { /* sin compresión */ }
  return 'PA0' + btoa(unescape(encodeURIComponent(json)));
}
async function unpackDesc(code) {
  code = code.trim();
  const tag = code.slice(0, 3), body = code.slice(3);
  if (tag === 'PA1') {
    const bin = atob(body), buf = Uint8Array.from(bin, c => c.charCodeAt(0));
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(ds).text());
  }
  if (tag === 'PA0') return JSON.parse(decodeURIComponent(escape(atob(body))));
  throw new Error('Código inválido');
}
function iceDone(conn) {
  return new Promise(res => {
    if (conn.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 4000);
    conn.addEventListener('icegatheringstatechange', () => { if (conn.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}
function watchPc(conn) {
  conn.oniceconnectionstatechange = () => {
    if (conn !== pc) return;
    if (conn.iceConnectionState === 'failed') netStatus('No se pudo conectar: alguna de las dos redes bloquea la conexión directa. Prueben en la misma red Wi-Fi o desde otra conexión.');
  };
}
function netStatus(text) { const el = $('onStatus'); if (el) el.textContent = text; }
function netClose() {
  try { dc && dc.close(); } catch (e) { /* */ }
  try { pc && pc.close(); } catch (e) { /* */ }
  pc = dc = null; netRole = null; guestIdx = -1; netSnap = null;
}
function netSend(o) { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(o)); }

// ---- anfitrión ----
async function hostCreate(mode) {
  netClose(); netMode = mode;
  pc = new RTCPeerConnection(ICE); watchPc(pc);
  dc = pc.createDataChannel('padel');
  bindChannel('host');
  await pc.setLocalDescription(await pc.createOffer());
  netStatus('Generando código…');
  await iceDone(pc);
  netStatus('Mandale este código a tu amigo y pegá abajo el código de respuesta.');
  return packDesc(pc.localDescription);
}
async function hostAccept(code) {
  const desc = await unpackDesc(code);
  await pc.setRemoteDescription(desc);
  netStatus('Conectando…');
}
// ---- invitado ----
async function guestJoin(code) {
  netClose();
  pc = new RTCPeerConnection(ICE); watchPc(pc);
  pc.ondatachannel = e => { dc = e.channel; bindChannel('guest'); };
  await pc.setRemoteDescription(await unpackDesc(code));
  await pc.setLocalDescription(await pc.createAnswer());
  netStatus('Generando respuesta…');
  await iceDone(pc);
  netStatus('Mandale este código de respuesta al anfitrión y esperá.');
  return packDesc(pc.localDescription);
}

function bindChannel(role) {
  const ch = dc; // los eventos de una conexión vieja no deben afectar a la actual
  ch.onopen = () => {
    if (dc !== ch) return;
    netStatus('¡Conectados!');
    if (role === 'host') startOnlineHost();
  };
  ch.onclose = () => {
    if (dc !== ch || !netRole) return;
    showMsg('DESCONECTADO', 'Se cortó la conexión', '#ff7a7a');
    setTimeout(() => { if (dc === ch) { netClose(); toMenu(); } }, 1800);
  };
  ch.onmessage = e => { if (dc !== ch) return; const m = JSON.parse(e.data); role === 'host' ? hostOnMsg(m) : guestOnMsg(m); };
}

function startOnlineHost() {
  netRole = 'host';
  const rating = DIFF_RATING[settings.diff];
  const rival = pick(ROSTER);
  let t0, t1;
  if (netMode === 'coop') {
    t0 = userTeam(null, 'net'); t0.players[1].n = 'INVITADO'; t0.name = `${settings.name} / INVITADO`;
    t1 = rosterTeam(rival, rating);
  } else {
    t0 = userTeam(Object.assign({}, PARTNERS[0], { r: rating }));
    t1 = rosterTeam(rival, rating, 'net'); t1.players[0].n = 'INVITADO'; t1.name = 'INVITADO / ' + rival.players[1].n; t1.short = 'INVITADO';
  }
  configureMatch({ mode: 'online', label: 'Online', teams: [t0, t1] });
  const gp = players.find(p => p.ctrl === 'net');
  netSend({ t: 'start', cfg: { teams: match.teams, games: match.games, bestOf: match.bestOf, golden: match.golden, label: match.label }, guest: gp.id, settings: { court: settings.court, venue: settings.venue } });
  match.onEnd = w => showOverStats([{ label: 'REVANCHA', fn: () => { startOnlineHost(); } }, { label: 'MENÚ', fn: () => { netClose(); toMenu(); }, sec: true }]);
  hideAll(); beginMatch();
}
function hostOnMsg(m) {
  const gp = players.find(p => p.ctrl === 'net');
  if (!gp) return;
  if (m.t === 'in') { pads.net.x = clamp(m.x, -1, 1); pads.net.y = clamp(m.y, -1, 1); }
  else if (m.t === 'press') humanPress(gp, m.k);
  else if (m.t === 'call') callBall(gp, m.w);
  else if (m.t === 'tac') cycleMate(gp);
}
const SWING_KINDS = ['side', 'back', 'over', 'serve'];
function netTick(dt) {
  if (netRole !== 'host' || !dc || dc.readyState !== 'open') return;
  snapTimer -= dt; if (snapTimer > 0) return; snapTimer = 0.05;
  const gp = players.find(p => p.ctrl === 'net');
  const r2 = v => Math.round(v * 100) / 100;
  netSend({
    t: 's', st: state, b: [r2(ball.x), r2(ball.y), r2(ball.z), ball.shotSpin],
    p: players.map(p => [r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.swingT), SWING_KINDS.indexOf(p.swingKind), r2(p.jumpT), r2(p.celebrate), p.celebrateWin ? 1 : 0, Math.round(p.stamina), (ik => ik ? [r2(ik.x), r2(ik.y), r2(ik.z), r2(ik.dx), r2(ik.dz), r2(ik.w)] : 0)(ikState(p))]),
    sc: score, srv: servingTeam, f: faults, mm: mateMode,
    who: plan.who ? plan.who.id : -1,
    lm: (state === 'rally' && rally && rally.bounces === 0 && plan.landing && gp && plan.team === gp.team) ? [r2(plan.landing.x), r2(plan.landing.z)] : null,
    m: gp && gp.netMeter !== undefined ? gp.netMeter : null, h: gp ? hintText(gp) : '',
    stats: state === 'over' ? stats : undefined,
    ev: netOut.splice(0),
  });
}

// ---- invitado ----
function guestOnMsg(m) {
  if (m.t === 'start') {
    netRole = 'guest'; guestIdx = m.guest;
    Object.assign(settings, m.settings); applyVenue();
    configureMatch(Object.assign(m.cfg, { mode: 'online' }));
    score = { pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tiebreak: false };
    hideAll(); showHUD(true); state = 'client'; netLastScore = '';
    $('overOv').classList.add('hidden');
    updateHUD();
  } else if (m.t === 's') { netSnap = m; for (const e of m.ev) guestEvent(e); if (m.stats) stats = m.stats; }
}
function guestEvent(e) {
  switch (e.t) {
    case 'msg': showMsg(e.a, e.b, e.c); break;
    case 'sfx': if (sfx[e.n]) sfx[e.n](...e.a); break;
    case 'say': speak(e.s, e.p); break;
    case 'tm': setMeter('p1', true, e.o, e.l, e.c); break;
    case 'tip': showTip(e.s, e.d); break;
    case 'tvs': tvSpeed(e.l, e.k); break;
    case 'tvl': tvLower(e.a, e.b); break;
    case 'bubble': callFrom = players[e.p]; $('call').textContent = e.s; $('call').style.opacity = 1; callTimer = 1.2; break;
    case 'replay': $('replayBadge').classList.toggle('hidden', !e.on); break;
    case 'intro': introT = 0; showIntro(true); sfx.fanfare(); break;
    case 'introEnd': showIntro(false); break;
    case 'over': setTimeout(() => {
      const iWon = players[guestIdx].team === e.w;
      showOverStats([{ label: 'MENÚ', fn: () => { netClose(); toMenu(); } }], iWon ? '¡VICTORIA!' : 'DERROTA', iWon);
    }, 300); break;
  }
}
const camFlipped = () => netRole === 'guest' && guestIdx >= 0 && players[guestIdx].team === 1;
function clientTick(dt) {
  simTime += dt;
  if (typeof readInputs === 'function') readInputs();
  // controles: si la cámara está invertida (juego desde el otro lado) se invierten los ejes
  inTimer -= dt;
  if (inTimer <= 0) { inTimer = 1 / 30; const f = camFlipped() ? -1 : 1; netSend({ t: 'in', x: pads.p1.x * f, y: pads.p1.y * f }); }
  const s = netSnap; if (!s) return;
  const k = Math.min(1, dt * 18);
  ball.x = lerp(ball.x, s.b[0], k); ball.y = lerp(ball.y, s.b[1], k); ball.z = lerp(ball.z, s.b[2], k); ball.shotSpin = s.b[3];
  players.forEach((p, i) => {
    const a = s.p[i];
    p.x = lerp(p.x, a[0], k); p.z = lerp(p.z, a[1], k); p.vx = a[2]; p.vz = a[3];
    if (a[4] > 0 && (p.swingT === 0 || a[4] < p.swingT - 0.3)) { p.swingT = a[4]; p.swingKind = SWING_KINDS[a[5]] || 'side'; }
    if (a[6] > 0 && p.jumpT === 0) p.jumpT = a[6];
    p.celebrate = a[7]; p.celebrateWin = !!a[8]; p.stamina = a[9];
    p.replayIK = a[10] ? { x: a[10][0], y: a[10][1], z: a[10][2], dx: a[10][3], dz: a[10][4], w: a[10][5] } : null;
  });
  state = s.st === 'over' ? 'over' : s.st; // para animaciones y marcador
  servingTeam = s.srv; faults = s.f; mateMode[0] = s.mm[0]; mateMode[1] = s.mm[1];
  plan.who = s.who >= 0 ? players[s.who] : null;
  plan.landing = s.lm ? { x: s.lm[0], z: s.lm[1] } : null; plan.team = s.lm ? players[guestIdx].team : -1;
  rally = s.lm ? { bounces: 0 } : null;
  const sc = JSON.stringify(s.sc); if (sc !== netLastScore) { netLastScore = sc; score = s.sc; updateHUD(); }
  setMeter('p1', s.m !== null && s.m !== undefined, s.m || 0);
  const h = $('hint'); h.style.display = s.h ? 'block' : 'none'; h.textContent = s.h;
}
// el invitado envía sus pulsaciones
function guestPress(kind) { netSend({ t: 'press', k: kind }); }
function guestCall(w) { netSend({ t: 'call', w }); }
function guestTac() { netSend({ t: 'tac' }); }
