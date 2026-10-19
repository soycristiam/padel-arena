'use strict';
// Marcador, medidores, mensajes, presentación y estadísticas.

// ================== HUD ==================
function updateHUD() {
  if (!score || !match) return;
  $('sbHead').textContent = (match.label || 'PÁDEL ARENA · EXHIBICIÓN').toUpperCase();
  for (const t of [0, 1]) {
    $('name' + t).textContent = teamName(t);
    const el = $('sets' + t); el.innerHTML = '';
    score.sets.forEach(s => { const sp = document.createElement('span'); sp.textContent = s[t]; el.appendChild(sp); });
    const sp = document.createElement('span'); sp.className = 'cur'; sp.textContent = score.games[t]; el.appendChild(sp);
    $('pts' + t).textContent = ptsLabel(t);
    $('row' + t).classList.toggle('serving', servingTeam === t);
  }
  // chips de táctica del compañero
  const chips = [];
  for (const p of localHumans()) {
    const mate = partnerOf(p);
    if (mate && !isHuman(mate)) chips.push(`<div>${p.name}: compañero <b>${mateMode[p.team]}</b> <span>${isTouch ? '· botón TÁCTICA' : p.ctrl === 'p1' ? '· T táctica · Q ¡Tuya! · E ¡Mía!' : '· 0 táctica · 8 ¡Tuya! · 9 ¡Mía!'}</span></div>`);
  }
  if (netRole === 'guest' && guestIdx >= 0) chips.push(`<div>Compañero: <b>${mateMode[players[guestIdx].team]}</b> <span>· T táctica · Q ¡Tuya!</span></div>`);
  $('mate').innerHTML = chips.join(''); $('mate').style.display = chips.length ? 'block' : 'none';
  paintBoard();
}
function paintBoard() {
  const { ctx: x, canvas: c } = boardTex.userData;
  x.fillStyle = '#05121a'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#0d2a33'; x.fillRect(0, 0, c.width, 34);
  x.fillStyle = '#8fb3bd'; x.font = `700 24px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText(score.tiebreak ? 'PÁDEL ARENA · TIE-BREAK' : (match.label || 'PÁDEL ARENA').toUpperCase().slice(0, 34), 14, 18);
  for (const t of [0, 1]) {
    const y = 64 + t * 56;
    x.fillStyle = servingTeam === t ? '#d6f542' : 'transparent'; x.fillRect(12, y - 6, 10, 12);
    x.fillStyle = '#e8f4f7'; x.font = `700 32px ${FONT}`; x.textAlign = 'left';
    x.fillText(teamName(t).toUpperCase().slice(0, 22), 32, y + 2);
    x.textAlign = 'center';
    score.sets.forEach((s, i) => { x.fillStyle = '#8fb3bd'; x.fillText(s[t], 360 + i * 30, y + 2); });
    x.fillStyle = '#ffffff'; x.fillText(score.games[t], 360 + score.sets.length * 30, y + 2);
    x.fillStyle = '#d6f542'; x.fillRect(448, y - 24, 56, 48);
    x.fillStyle = '#0b1a10'; x.font = `800 36px ${FONT}`; x.fillText(ptsLabel(t), 476, y + 2);
  }
  boardTex.needsUpdate = true;
}

// ---- medidores de timing (uno por humano local) ----
const meters = {};
function meterEl(view) {
  if (meters[view]) return meters[view];
  const el = document.createElement('div'); el.className = 'tmeter ' + view;
  el.innerHTML = '<div class="tm-label"></div><div class="tm-bar"><i class="tm-good"></i><i class="tm-perf"></i><b class="tm-needle"></b></div><div class="tm-ends"><span>TEMPRANO</span><span>TARDE</span></div>';
  document.body.appendChild(el);
  meters[view] = { el, label: el.querySelector('.tm-label'), needle: el.querySelector('.tm-needle'), good: el.querySelector('.tm-good'), perf: el.querySelector('.tm-perf'), hold: 0 };
  return meters[view];
}
function layoutMeters() {
  const L = METER_LEVELS[settings.meter] || METER_LEVELS.normal;
  const two = localHumans().length > 1;
  for (const v of ['p1', 'p2']) {
    const m = meterEl(v);
    const pw = L.perf / 0.3 * 100, gw = L.good / 0.3 * 100;
    m.perf.style.left = (50 - pw / 2) + '%'; m.perf.style.width = pw + '%';
    m.good.style.left = (50 - gw / 2) + '%'; m.good.style.width = gw + '%';
    m.el.style.left = two ? (v === 'p1' ? '27%' : '73%') : '50%';
  }
}
const needlePct = off => (50 + clamp(-off / 0.3, -1, 1) * 50) + '%';
function setMeter(view, live, needleOff, label, color) {
  const m = meterEl(view);
  if (label !== undefined) { m.label.textContent = label; m.label.style.color = color || '#fff'; m.hold = 0.9; m.el.classList.add('on'); if (needleOff !== null) m.needle.style.left = needlePct(needleOff); return; }
  if (m.hold > 0) return;
  if (!live) { m.el.classList.remove('on'); return; }
  m.label.textContent = ''; m.el.classList.add('on'); m.needle.style.left = needlePct(needleOff);
}
function showTiming(p, dt, tq, name) {
  const label = dt === null ? '¡AIRE!' : `${tq.label} · ${name}`, col = dt === null ? '#ff7a7a' : tq.col;
  if (p.ctrl === 'net') { emit({ t: 'tm', l: label, c: col, o: dt === null ? 0 : dt }); return; }
  setMeter(p.ctrl, true, dt === null ? 0 : dt, label, col);
}
// Valor en vivo del medidor de un humano (null = oculto)
function liveMeter(p) {
  if (!(state === 'rally' && rally && canTeamHit(p.team) && plan.who === p && Math.hypot(ball.x - p.x, ball.z - p.z) < 3.2)) return null;
  return timingOffset(p) - SWING;
}
function updateMeters(dt) {
  for (const v of Object.keys(meters)) { const m = meters[v]; if (m.hold > 0) { m.hold -= dt; if (m.hold <= 0) m.el.classList.remove('on'); } }
  if (netRole === 'guest') return;
  for (const p of humans()) {
    const off = liveMeter(p);
    if (p.ctrl === 'net') { p.netMeter = off; continue; }
    setMeter(p.ctrl, off !== null, off);
  }
  for (const v of ['p1', 'p2']) if (!localHumans().some(p => p.ctrl === v) && meters[v]) meters[v].el.classList.remove('on');
}

// ---- energía ----
function updateEnergy() {
  const list = netRole === 'guest' ? [players[guestIdx]] : localHumans();
  const el = $('energy');
  if (!list.length || !list[0] || state === 'idle') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  let html = '';
  for (const p of list) {
    const v = Math.round(p.stamina);
    html += `<div class="en-row"><span>${p.name.split(' ').pop()}</span><div class="en-bar"><i style="width:${v}%;background:${v < 40 ? '#ff7a4a' : v < 70 ? '#ffd23f' : '#d6f542'}"></i></div></div>`;
  }
  if (el._last !== html) { el.innerHTML = html; el._last = html; }
}

// ---- bocadillo, mensajes, pistas ----
const _v3 = new THREE.Vector3();
function updateCall(dt) {
  if (callTimer <= 0) return;
  callTimer -= dt; if (callTimer <= 0) { $('call').style.opacity = 0; return; }
  const p = callFrom || players[0];
  _v3.set(p.x, 2.65, p.z).project(camera);
  const el = $('call'); el.style.left = ((_v3.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _v3.y) / 2 * innerHeight) + 'px';
}
let msgTimer = 0;
function showMsg(t, s, color) {
  const el = $('msg'); el.querySelector('.t').textContent = t; el.querySelector('.t').style.color = color || '#fff';
  el.querySelector('.s').textContent = s || ''; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  el.style.opacity = 1; msgTimer = 1.9;
  emit({ t: 'msg', a: t, b: s, c: color });
}
let tipTimer = 0;
function showTip(text, dur = 4) {
  const el = $('tip'); el.textContent = text; el.classList.add('on'); tipTimer = dur;
  emit({ t: 'tip', s: text, d: dur });
}
function play(name, ...args) { if (sfx[name]) sfx[name](...args); emit({ t: 'sfx', n: name, a: args }); }
function say(text, prio) { speak(text, prio); emit({ t: 'say', s: text, p: prio }); }

function hintText(p) {
  if (state !== 'serve' || !server) return '';
  const nth = faults ? '2º SAQUE' : '1er SAQUE';
  if (server === p) {
    const key = p.ctrl === 'p2' ? 'PUNTO (.)' : p.ctrl === 'net' ? 'ESPACIO' : isTouch ? 'tocá GOLPE' : 'ESPACIO';
    return `${nth} · ${key} para sacar (izq./der. para apuntar)`;
  }
  return `${nth} · saca ${server.name}`;
}
function updateHint() {
  if (netRole === 'guest') return;
  const h = $('hint');
  let txt = '';
  if (state === 'serve' && server) txt = hintText(isHuman(server) && server.ctrl !== 'net' ? server : (localHumans()[0] || players[0]));
  if (state === 'intro') txt = isTouch ? 'Tocá para empezar' : 'ESPACIO para empezar';
  h.style.display = txt ? 'block' : 'none'; h.textContent = txt;
}

// ---- presentación (tarjetas) ----
function showIntro(on) {
  const el = $('intro');
  if (!on) { el.classList.add('hidden'); return; }
  const card = t => {
    const T = match.teams[t];
    return `<div class="in-team t${t}"><div class="in-flag">${T.flag || ''}</div><div class="in-name">${T.name}</div>` +
      `<div class="in-chips">${T.players.map(p => `<span>${p.n}${p.style ? ' · ' + STYLES[p.style].name : ''}</span>`).join('')}</div></div>`;
  };
  el.innerHTML = `<div class="in-label">${(match.label || 'EXHIBICIÓN').toUpperCase()}</div>${card(0)}<div class="in-vs">VS</div>${card(1)}`;
  el.classList.remove('hidden');
}

// ---- estadísticas al final ----
function statsHTML() {
  if (!stats) return '';
  const T = stats.teams, pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const rows = [
    ['Puntos ganados', T[0].pts, T[1].pts], ['Golpes ganadores', T[0].winners, T[1].winners], ['Errores no forzados', T[0].ue, T[1].ue],
    ['Saques directos', T[0].aces, T[1].aces], ['Dobles faltas', T[0].df, T[1].df],
    ['% primer saque', pct(T[0].firstIn, T[0].firstTot), pct(T[1].firstIn, T[1].firstTot)], ['Remates por 3 / por 4', T[0].x3, T[1].x3],
  ];
  let h = `<table class="st"><tr><th></th><th>${teamShort(0)}</th><th>${teamShort(1)}</th></tr>` +
    rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('') +
    `<tr><td>Punto más largo</td><td colspan="2">${stats.longest} golpes</td></tr></table>`;
  const hs = Object.entries(stats.humans);
  if (hs.length) {
    h += '<div class="st-humans">';
    for (const [id, s] of hs) {
      h += `<div class="st-h"><div class="st-hn">${s.name}</div><canvas class="heat" data-id="${id}" width="120" height="200"></canvas>` +
        `<div>Golpes: ${s.hits}</div><div>Perfectos: ${pct(s.perfect, s.hits)}</div><div>Buenos: ${pct(s.good, s.hits)}</div></div>`;
    }
    h += '</div>';
  }
  return h;
}
// mapa de calor de dónde picaron tus golpes (pista rival vista desde arriba)
function drawHeatmaps(root) {
  root.querySelectorAll('canvas.heat').forEach(cv => {
    const s = stats.humans[cv.dataset.id]; const x = cv.getContext('2d'), W = cv.width, H = cv.height;
    x.fillStyle = COURT_COLORS[settings.court] || '#2257e6'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.5; x.strokeRect(1, 1, W - 2, H - 2);
    const sy = H - SERVICE / HZ * H; x.beginPath(); x.moveTo(0, sy); x.lineTo(W, sy); x.moveTo(W / 2, sy); x.lineTo(W / 2, H); x.stroke();
    x.fillStyle = '#fff'; x.fillRect(0, H - 3, W, 3); // red
    for (const [lx, lz] of s.landings) {
      const px = (lx + HX) / (2 * HX) * W, py = H - lz / HZ * H;
      const g = x.createRadialGradient(px, py, 0, px, py, 12); g.addColorStop(0, 'rgba(214,245,66,.75)'); g.addColorStop(1, 'rgba(214,245,66,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, 12, 0, Math.PI * 2); x.fill();
    }
  });
}
