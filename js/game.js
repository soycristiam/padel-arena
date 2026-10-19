'use strict';
// ================== ESTADO DEL PARTIDO ==================
// state: idle | intro | serve | rally | pointEnd | replay | over | client
let state = 'idle';
let paused = false, stateTimer = 0;
let rally = null, score = null, stats = null;
let servingTeam = 0, teamServeIdx = [0, 0], faults = 0;
let server = null, serveSide = 1, serveWait = 0, pendingReserve = false;
let plan = { team: -1, who: null, target: null, landing: null, timer: 0 };
let matchWinner = -1, camMode = 0, simTime = 0, shotId = 0, pointShots = 0;
const incoming = { threat: 0 };
const mateMode = ['AUTO', 'AUTO'];                          // táctica del compañero IA de cada equipo
const mateCall = [{ who: null, until: 0 }, { who: null, until: 0 }]; // ¡Tuya! / ¡Mía!
let match = null;      // configuración del partido actual (la arma modes.js)
let netRole = null;    // null | 'host' | 'guest'
const netOut = [];     // eventos para el invitado online
const emit = e => { if (netRole === 'host') netOut.push(e); };

// ================== JUGADORES ==================
const SKINS = [0xe0ac85, 0xc68b62, 0xe7b893, 0xb07a52, 0x8d5a3b, 0xf1c9a5];
const HAIRS = [0x2b1d14, 0x111111, 0x5a3a1f, 0x0e0e0e, 0x8a6b3e, 0x3b2a1a];
const players = [0, 1, 2, 3].map(i => ({
  id: i, team: i < 2 ? 0 : 1, homeLane: [-1, 1, 1, -1][i], name: 'JUGADOR ' + (i + 1),
  ctrl: 'ai', active: true, skill: skillFromRating(0.5), style: 'completo', weak: null, stats: humanStats(),
  x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, lane: 1, swingT: 0, swingKind: 'side', phase: 0, yaw: i < 2 ? Math.PI : 0,
  cool: 0, stamina: 100, celebrate: 0, celebrateWin: false, jumpT: 0, mesh: null, ring: null, sprite: null,
  colors: [0x23c4d6, 0x1d2733, SKINS[i], HAIRS[i]], paddle: 0xff3b3b, hitBuffer: null, weakMisses: 0,
}));
const teamOf = t => players.filter(p => p.team === t && p.active);
const isHuman = p => p.ctrl !== 'ai';
const humans = () => players.filter(p => p.active && isHuman(p));
const localHumans = () => players.filter(p => p.active && (p.ctrl === 'p1' || p.ctrl === 'p2'));
const partnerOf = p => teamOf(p.team).find(q => q !== p) || null;
const pads = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, net: { x: 0, y: 0 } };
const RING_COLORS = { p1: 0x3ad1e6, p2: 0xff9f1c, net: 0xd36bff };
const NAME_COLORS = { p1: '#9ff0fb', p2: '#ffd08a', net: '#ecb6ff' };

function buildPlayerMeshes() {
  for (const p of players) {
    if (p.mesh) scene.remove(p.mesh.group);
    const seed = p.id * 7 + (p.name || '').length;
    p.mesh = makePlayerMesh({ shirt: p.colors[0], shorts: p.colors[1], skin: p.colors[2], hair: p.colors[3], paddle: p.paddle,
      accent: p.accent !== undefined ? p.accent : p.colors[1], shoe: p.colors[0], number: 3 + seed % 17, hairStyle: p.hairStyle || HAIR_STYLES[seed % HAIR_STYLES.length] });
    p.mesh.group.visible = p.active; scene.add(p.mesh.group);
    if (p.ring) { scene.remove(p.ring); p.ring = null; }
    if (p.sprite) { scene.remove(p.sprite); p.sprite = null; }
    const view = viewCtrl(p);
    if (p.active && view) {
      p.ring = makeRing(RING_COLORS[view]); p.ring.visible = true;
      p.sprite = makeNameSprite(p.name.split(' ').pop().slice(0, 12), NAME_COLORS[view]);
    }
  }
  if (typeof attachRealModel === 'function') players.forEach(attachRealModel);
}
// Cómo se ve el control de un jugador desde esta pantalla (el invitado online se ve a sí mismo como p1).
function viewCtrl(p) {
  if (netRole === 'guest') return p.id === guestIdx ? 'p1' : (p.ctrl !== 'ai' ? 'p2' : null);
  return p.ctrl === 'ai' ? null : p.ctrl;
}
let guestIdx = -1;

// ================== PARTIDO ==================
function newMatch() {
  score = { pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tiebreak: false };
  stats = {
    teams: [0, 1].map(() => ({ pts: 0, winners: 0, ue: 0, df: 0, aces: 0, x3: 0, firstIn: 0, firstTot: 0 })),
    longest: 0, humans: {},
  };
  for (const p of humans()) stats.humans[p.id] = { name: p.name, hits: 0, perfect: 0, good: 0, landings: [] };
  servingTeam = match.firstServe || 0; teamServeIdx = [0, 0]; faults = 0; matchWinner = -1;
  mateMode[0] = mateMode[1] = 'AUTO'; mateCall[0].until = mateCall[1].until = 0;
  players.forEach(p => { p.stamina = 100; p.weakMisses = 0; p.tipShown = false; });
  setupPoint();
  if (match.intro) { state = 'intro'; introT = 0; showIntro(true); sfx.fanfare(); emit({ t: 'intro' }); }
  updateHUD();
}

function ptsLabel(t) {
  const s = score; if (!s) return '0';
  if (s.tiebreak) return String(s.pts[t]);
  const a = s.pts[t], b = s.pts[1 - t];
  if (!match.golden && a >= 3 && b >= 3) { if (a === b) return '40'; return a > b ? 'AD' : '40'; }
  return ['0', '15', '30', '40', '40'][Math.min(a, 4)];
}

function setupPoint() {
  const st = servingTeam;
  const sTeam = teamOf(st);
  server = sTeam[teamServeIdx[st] % sTeam.length];
  const even = (score.pts[0] + score.pts[1]) % 2 === 0;
  serveSide = (st === 0 ? 1 : -1) * (even ? 1 : -1);        // lado x del sacador (derecha en puntos pares)
  const ss = st === 0 ? 1 : -1, rs = -ss;
  const mate = sTeam.find(p => p !== server);
  server.x = serveSide * 2.3; server.z = ss * 9.0;
  if (mate) { mate.x = -serveSide * 2.6; mate.z = ss * 4.2; }
  const rt = 1 - st, rTeam = teamOf(rt);
  const receiver = rTeam.find(p => Math.sign(p.homeLane) === -serveSide) || rTeam[0];
  const rmate = rTeam.find(p => p !== receiver);
  receiver.x = -serveSide * 2.4; receiver.z = rs * 8.9;
  if (rmate) { rmate.x = serveSide * 2.5; rmate.z = rs * 6.3; }
  players.forEach(p => {
    p.vx = p.vz = 0; p.lane = Math.sign(p.x) || p.homeLane; p.swingT = 0; p.tx = p.x; p.tz = p.z;
    p.yaw = p.team === 0 ? Math.PI : 0; p.hitBuffer = null; p.celebrate = 0; p.jumpT = 0; p.pending = null; p.contact = null; p.prepW = 0; p.tapDone = false; p.tapT = 0; p.splitT = 0;
  });
  rally = null; Object.assign(ball, { out: false, vx: 0, vy: 0, vz: 0, spin: 0, side: 0, shotSpin: 0, kick: false, kicked: false, outVia: '' });
  ballHist.length = 0; mateCall[0].until = mateCall[1].until = 0;
  plan = { team: -1, who: null, target: null, landing: null, timer: 0 };
  state = 'serve'; serveWait = !isHuman(server) ? rnd(1.0, 1.6) : 0;
  trailPos.length = 0; replay.frames.length = 0; replay.pending = false; pointShots = 0;
  setCrowdLevel(0.025);
  updateHUD();
}

function nextServer() { teamServeIdx[servingTeam] ^= 1; servingTeam ^= 1; }
const teamName = t => match ? match.teams[t].name : '';
const teamShort = t => match ? (match.teams[t].short || match.teams[t].name) : '';

// ¿El próximo punto puede decidir el partido para el equipo t?
function isMatchPoint(t) {
  const s = score, o = 1 - t, N = match.games;
  const winsGame = s.tiebreak ? (s.pts[t] >= 6 && s.pts[t] - s.pts[o] >= 1)
    : (match.golden ? s.pts[t] >= 3 : (s.pts[t] >= 3 && s.pts[t] - s.pts[o] >= 1));
  if (!winsGame) return false;
  const g = s.games[t] + 1;
  const winsSet = s.tiebreak || (g >= N && g - s.games[o] >= 2);
  return winsSet && s.setsWon[t] + 1 >= (match.bestOf === 3 ? 2 : 1);
}

// kind: winner | error | ace | df | other
function endPoint(winner, reason, kind = 'other') {
  if (state !== 'rally' && state !== 'serve') return;
  if (match.hooks && match.hooks.point && match.hooks.point(winner, reason, kind)) return;
  state = 'pointEnd'; stateTimer = 2.1; marker.visible = false;
  const s = score, o = 1 - winner, loser = 1 - winner;
  // estadísticas
  const T = stats.teams;
  T[winner].pts++;
  if (kind === 'winner' || kind === 'ace') T[winner].winners++;
  if (kind === 'ace') T[winner].aces++;
  if (kind === 'error') T[loser].ue++;
  if (kind === 'df') T[loser].df++;
  if (/POR [34]/.test(reason)) T[winner].x3++;
  stats.longest = Math.max(stats.longest, pointShots);
  // celebraciones
  players.forEach(p => { if (p.active) { p.celebrate = 1.7; p.celebrateWin = p.team === winner; } });

  s.pts[winner]++;
  let sub = `Punto para ${teamShort(winner)}`, big = false, voice = null;
  if (/POR 3/.test(reason)) voice = '¡Por tres! ¡Increíble!';
  else if (/POR 4/.test(reason)) voice = '¡Por cuatro!';
  else if (kind === 'ace') voice = 'Saque directo';
  else if (kind === 'df') voice = 'Doble falta';
  else if (pointShots >= 10) voice = '¡Qué punto!';
  else if (kind === 'winner' && rally && rally.shot === 'vibora') voice = '¡Qué víbora!';
  else if (kind === 'winner' && rally && rally.shot === 'bandeja') voice = '¡Gran bandeja!';
  let gameWon = false;
  if (s.tiebreak) gameWon = s.pts[winner] >= 7 && s.pts[winner] - s.pts[o] >= 2;
  else gameWon = match.golden ? s.pts[winner] >= 4 : (s.pts[winner] >= 4 && s.pts[winner] - s.pts[o] >= 2);
  if (gameWon) {
    const wasTB = s.tiebreak;
    s.games[winner]++; s.pts = [0, 0]; s.tiebreak = false;
    sub = `Juego ${teamShort(winner)} · ${s.games[0]}-${s.games[1]}`;
    voice = voice || `Juego para ${teamShort(winner).toLowerCase()}`;
    const N = match.games, g = s.games;
    if ((g[winner] >= N && g[winner] - g[o] >= 2) || wasTB) {
      s.sets.push([...g]); s.setsWon[winner]++; s.games = [0, 0];
      sub = `Set para ${teamShort(winner)} · ${g[0]}-${g[1]}`; big = true; voice = `Set para ${teamShort(winner).toLowerCase()}`;
      if (s.setsWon[winner] >= (match.bestOf === 3 ? 2 : 1)) {
        matchWinner = winner; stateTimer = 2.8; sub = `¡${teamShort(winner)} gana el partido!`;
        voice = `¡Partido! Ganan ${teamShort(winner).toLowerCase()}`;
      }
    } else if (g[0] === N && g[1] === N) { s.tiebreak = true; sub += ' · TIE-BREAK'; voice = 'Tie break'; }
    nextServer(); big = true;
  } else if (s.tiebreak && (s.pts[0] + s.pts[1]) % 2 === 1) nextServer();
  if (matchWinner < 0) {
    if (isMatchPoint(0) || isMatchPoint(1)) { sub += ' · PUNTO DE PARTIDO'; if (!voice || !gameWon) voice = voice || 'Punto de partido'; }
    else if (!s.tiebreak && match.golden && s.pts[0] === 3 && s.pts[1] === 3) { sub += ' · PUNTO DE ORO'; voice = voice || 'Punto de oro'; }
  }
  const humanWon = teamOf(winner).some(isHuman);
  const col = humanWon || !teamOf(loser).some(isHuman) ? '#d6f542' : '#ff7a7a';
  showMsg(reason, sub, col);
  if (voice) say(voice, big || /POR/.test(reason));
  if (kind === 'error') { play('ooh'); crowdJump = 0.3; }
  else { play('cheer', big || /POR/.test(reason) || pointShots >= 9); crowdJump = big ? 2.2 : (humanWon ? 1.2 : 0.6) + Math.min(1.2, pointShots * 0.08); }
  if (pointShots >= 6 || kind === 'winner') play('applause', clamp(pointShots / 8, 0.5, 1.5));
  fxPointWon(winner, reason, kind);
  // repetición
  const special = /POR [34]/.test(reason) || pointShots >= 9 || (kind === 'winner' && rally && OVERHEAD.has(rally.shot));
  replay.pending = netRole !== 'guest' && replay.frames.length > 30 &&
    (settings.replays === 'todas' ? pointShots >= 2 : settings.replays === 'destacadas' && special);
  if (replay.pending) stateTimer = Math.max(stateTimer, 2.4);
  updateHUD();
}

function serveFault(reason) {
  if (match.hooks && match.hooks.point && match.hooks.point(1 - servingTeam, 'FALTA', 'fault')) return;
  if (faults === 0) {
    faults = 1; play('fault');
    showMsg('FALTA', reason + ' · segundo saque', '#ffb347');
    state = 'pointEnd'; stateTimer = 1.4; marker.visible = false; rally = null; pendingReserve = true;
  } else {
    faults = 0; play('fault');
    endPoint(1 - servingTeam, 'DOBLE FALTA', 'df');
  }
}

// ================== GOLPES ==================
function pickGapX(team) {
  const opp = teamOf(1 - team);
  let best = 0, bestS = -1;
  for (const cx of [-3.8, -2, 0, 2, 3.8]) {
    const s = (opp.length ? Math.min(...opp.map(o => Math.abs(cx - o.x))) : 3) + rnd(0, 1.8);
    if (s > bestS) { bestS = s; best = cx; }
  }
  return best;
}

const SHOT_NAMES = { drive: 'DRIVE', slice: 'CORTADO', volley: 'VOLEA', lob: 'GLOBO', drop: 'DEJADA', smash: 'REMATE', x3: 'REMATE POR 3', bandeja: 'BANDEJA', vibora: 'VÍBORA', serve: 'SAQUE', feed: 'MÁQUINA' };
const OVERHEAD = new Set(['smash', 'x3', 'bandeja', 'vibora']);

// tq = calidad de timing de un humano ({err, pow, good}); opts = tiro forzado (máquina de entrenamiento)
function shoot(pl, shot, aimX = 0, aimY = 0, tq = null, opts = null) {
  const dir = pl.team === 0 ? -1 : 1;
  const from = { x: ball.x, y: Math.max(ball.y, 0.15), z: ball.z };
  const human = isHuman(pl), d = pl.skill;
  const hdist = Math.hypot(ball.x - pl.x, ball.z - pl.z);
  let tx, tz, speedH = null, T = null, clear = NET_H + 0.13, spin = 0, side = 0, kick = false;
  let err, pow = 1;
  if (!human) { err = d.err * (1 + incoming.threat * 2.5); pow = d.power; }
  else {
    const hs = pl.stats;
    err = (tq ? tq.err : 0.28) * hs.errMul; pow = (tq ? tq.pow : 1) * hs.power;
    err += Math.max(0, hdist - 1.05) * 0.9;                       // golpe estirado
    if (pl.stamina < 40) err += (40 - pl.stamina) / 40 * 0.25;     // cansancio
  }
  if (shot === 'x3' && !(!human ? Math.random() < 0.7 : (tq && tq.good && Math.abs(pl.z) < 6))) shot = 'smash';
  if (opts) {
    ({ tx, tz } = opts); speedH = opts.speedH || null; T = opts.T || null; spin = opts.spin || 0; clear = opts.clear || clear; err = 0;
  } else if (shot === 'serve') {
    const bs = -serveSide;
    if (!human) tx = bs * rnd(1.2, 3.9); else tx = clamp(bs * 2.6 + aimX * 1.7, bs > 0 ? 0.6 : -4.4, bs > 0 ? 4.4 : -0.6);
    tz = dir * (!human ? rnd(4.6, 6.1) : clamp(5.5 + aimY * 0.8, 3.5, 6.3));
    speedH = rnd(13.5, 16) * (human ? pl.stats.power : d.power); clear = NET_H + 0.18; err *= !human ? 0.35 : 0.6; spin = -0.3;
    if (!human && Math.random() < d.ue * 1.3) tz = dir * rnd(7.3, 8.2);
  } else {
    if (!human) tx = pickGapX(pl.team); else tx = aimX !== 0 ? aimX * 3.5 : rnd(-1.6, 1.6);
    switch (shot) {
      case 'drive':
        tz = dir * (!human ? rnd(6.6, 9.0) : clamp(7.7 + aimY * 1.0, 6.2, 9.2));
        speedH = !human ? rnd(14, 18) : (aimY > 0.3 ? 20 : 16.5);
        spin = !human ? rnd(0.2, 0.6) : (aimY > 0.3 ? 0.8 : 0.4); break;
      case 'slice':
        tz = dir * (!human ? rnd(7.2, 9.0) : clamp(7.9 + aimY * 0.8, 6.5, 9.3)); speedH = 13; spin = -0.7; clear = NET_H + 0.1; break;
      case 'volley': tz = dir * rnd(6.2, 8.6); speedH = !human ? 15 : (aimY > 0.3 ? 18 : 15); spin = -0.15; break;
      case 'lob': tz = dir * rnd(8.4, 9.4); T = rnd(1.75, 2.05); clear = 2.6; spin = 0.3; break;
      case 'drop': tz = dir * rnd(1.4, 2.6); speedH = 8; clear = NET_H + 0.12; spin = -1; break;
      case 'smash': tz = dir * rnd(5.5, 8.6); speedH = 24; clear = NET_H + 0.1; spin = 0.1; break;
      case 'x3':
        tx = (aimX !== 0 ? Math.sign(aimX) : (Math.sign(ball.x) || 1)) * 2.6; tz = dir * 4.2;
        speedH = 20; clear = NET_H + 0.1; kick = true; err *= 0.4; break;
      case 'bandeja': tz = dir * rnd(7.6, 9.2); speedH = 14; spin = -0.8; clear = NET_H + 0.2; break;
      case 'vibora':
        if (!human) tx = (Math.sign(tx) || 1) * 3.6; else tx = (aimX !== 0 ? Math.sign(aimX) : (Math.random() < 0.5 ? -1 : 1)) * 3.6;
        tz = dir * rnd(6.8, 8.6); speedH = 18; spin = -0.5; side = Math.sign(tx) * 0.9; clear = NET_H + 0.15; break;
    }
    if (speedH) speedH *= pow;
    if (!human && Math.random() < d.ue) { if (Math.random() < 0.5) tz = dir * rnd(10.4, 11.5); else tx = (Math.sign(tx) || 1) * rnd(5.5, 6.3); }
  }
  tx += gauss() * err; tz += gauss() * err * 0.8;
  const v = solveShot(from, tx, tz, speedH, T, clear, spin, side);
  ball.x = from.x; ball.y = from.y; ball.z = from.z;
  ball.vx = v.vx; ball.vy = v.vy; ball.vz = v.vz;
  Object.assign(ball, { out: false, outVia: '', spin, side, shotSpin: spin, kick, kicked: false });
  shotId++; ballHist.length = 0; pointShots++;
  const spd = Math.hypot(v.vx, v.vy, v.vz);
  const TH = { smash: 0.32, x3: 0.32, vibora: 0.2, bandeja: 0.08, slice: 0.08, serve: 0.02, drop: 0.12, lob: 0.04, feed: 0 };
  incoming.threat = TH[shot] !== undefined ? TH[shot] : Math.max(0, spd - 15) * 0.025 + (shot === 'volley' ? 0.05 : 0) + spin * 0.05;
  if (human && shot !== 'serve') incoming.threat += Math.max(0, 0.6 - err) * 0.12; // buen golpe = más presión
  incoming.fast = spd > 18 || shot === 'smash';
  const wasWall = rally && rally.wallTouched;
  rally = { hitter: pl.team, receiving: 1 - pl.team, crossed: false, bounces: 0, serve: shot === 'serve', boxSign: -serveSide,
    t: 0, net: false, shot, x3: kick, by: pl, outside: false, wallTouched: false };
  if (shot === 'serve' && faults === 0 && stats) stats.teams[pl.team].firstTot++;
  // animación
  // si no venía haciendo el swing (saque, máquina), se ve desde el impacto
  if (!(pl.swingT > 0)) pl.swingT = TC;
  pl.swingKind = OVERHEAD.has(shot) ? 'over' : shot === 'serve' ? 'serve' : sideFor(pl, ball);
  if ((shot === 'smash' || shot === 'x3' || shot === 'vibora') && !(pl.jumpT > 0)) { pl.jumpT = 0.5; pl.jumpH = clamp(ball.y - 2.2, 0.12, 0.55); }
  setContact(pl, ball, simTime, { x: v.vx, z: v.vz });
  // último acomodo: si el cuerpo quedó lejos de la posición natural para pegarle, se completa el paso
  if (pl.mesh && shot !== 'serve') {
    const ip = idealBodyPos(pl, ball, pl.contact.side), ex = ip.x - pl.x, ez = ip.z - pl.z, dd = Math.hypot(ex, ez);
    if (dd > 0.25) { const mv = Math.min(0.7, dd - 0.25) / dd; pl.x += ex * mv; pl.z += ez * mv; }
  }
  pl.cool = 0.5;
  if (human) {
    pl.stamina = Math.max(0, pl.stamina - 2);
    if (stats && stats.humans[pl.id] && shot !== 'serve') {
      const h = stats.humans[pl.id]; h.hits++; if (tq && tq.label === 'PERFECTO') h.perfect++; else if (tq && tq.good) h.good++;
    }
  }
  // pelotazo en el centro de la pala o en el marco (timing malo o golpe muy estirado)
  const sweet = human ? !(tq && !tq.good) && hdist < 1.3 : Math.random() < 0.88;
  if (shot === 'smash' || shot === 'x3') { play('smash'); camFx(human ? 0.12 : 0.06, human ? 4 : 0); postBlur(0.3); }
  else play('hit', shot === 'drop' || shot === 'bandeja' ? 0.55 : 1, spin, sweet);
  fxShot(pl, shot, spd);
  // el rival hace el "split step": un saltito para estar listo para moverse
  for (const q of teamOf(1 - pl.team)) q.splitT = 0.001;
  if (wasWall && human && Math.random() < 0.5) play('ooh');
  setCrowdLevel(0.025 + Math.min(pointShots, 12) * 0.005);
  plan.timer = 0; plan.team = -1;
  return shot;
}

function canTeamHit(team) {
  if (state !== 'rally' || !rally || rally.receiving !== team || !rally.crossed || rally.bounces > 1) return false;
  if (rally.serve && rally.bounces === 0) return false;
  if (rally.outside) return rally.bounces === 1;
  return (ball.z > 0 ? 0 : 1) === team;
}

// ================== TIMING DE LOS HUMANOS ==================
const ballHist = []; // posiciones jugables recientes (para saber si se llega tarde)
const METER_LEVELS = { asistido: { perf: 0.07, good: 0.16 }, normal: { perf: 0.045, good: 0.11 }, pro: { perf: 0.03, good: 0.072 } };
function contactCost(p, pl) {
  if (p.y < 0.12) return 9;
  const h = p.y > 1.85 ? Math.abs(p.y - 2.35) : Math.abs(p.y - 1.0);
  const hd = Math.hypot(p.x - pl.x, p.z - pl.z), reach = pl.stats.reach;
  return h + (hd > reach ? 1.5 + (hd - reach) : 0) + Math.abs(hd - 0.8) * 0.25;
}
// Segundos hasta el punto ideal de impacto: > 0 = temprano, < 0 = tarde.
function timingOffset(pl) {
  let best = contactCost(ball, pl), bestT = 0;
  for (const h of ballHist) { const c = contactCost(h, pl); if (c < best) { best = c; bestT = h.t - simTime; } }
  const b = { ...ball }; let bounces = rally.bounces; const ev = [];
  for (let i = 1; i <= 60; i++) {
    ev.length = 0; stepBall(b, STEP, ev);
    if (ev.some(e => e.type === 'floor')) bounces++;
    if (bounces >= 2 || (!rally.outside && b.out) || (!rally.outside && (b.z > 0 ? 0 : 1) !== pl.team)) break;
    if (rally.serve && bounces === 0) continue;
    const c = contactCost(b, pl); if (c < best) { best = c; bestT = i * STEP; }
  }
  return bestT;
}
function timingQuality(dt) {
  const a = Math.abs(dt), L = METER_LEVELS[settings.meter] || METER_LEVELS.normal;
  if (a <= L.perf) return { label: 'PERFECTO', err: 0.1, pow: 1.12, good: true, col: '#d6f542' };
  if (a <= L.good) return { label: 'BUENO', err: 0.28, pow: 1.0, good: true, col: '#7fe3f0' };
  return { label: dt > 0 ? 'TEMPRANO' : 'TARDE', err: 0.5 + a * 1.6, pow: 0.92, good: false, col: '#ff9a6b' };
}
const fwdOf = (p, inp) => p.team === 0 ? inp.y : -inp.y; // "hacia la red" según el lado de la pista

function humanPress(p, kind) {
  if (!p || !p.active || paused) return;
  if (state === 'intro') { skipIntro(); return; }
  if (state === 'replay') { endReplay(); return; }
  const inp = pads[p.ctrl];
  if (state === 'serve' && server === p) { shoot(p, 'serve', inp.x, fwdOf(p, inp)); state = 'rally'; return; }
  if (state !== 'rally') return;
  p.hitBuffer = { kind, t: 0.28, near: false };
  // el swing arranca ya y apunta a donde va a estar la pelota cuando llegue la pala
  setContact(p, predictAhead(SWING) || ball, simTime + SWING);
  if (p.swingT === 0) { p.swingT = 0.001; p.swingKind = p.contact.side; }
  if (p.contact.side === 'over' && !(p.jumpT > 0)) { p.jumpT = 0.26; p.jumpH = clamp(p.contact.y - 2.2, 0.12, 0.55); }
}
function tryHumanHit(p) {
  const buf = p.hitBuffer;
  if (!canTeamHit(p.team)) return false;
  const d = Math.hypot(ball.x - p.x, ball.z - p.z), reach = p.stats.reach;
  if (d < reach * 1.8) buf.near = true;
  if (d > reach || ball.y > 2.95) return false;
  const dt = timingOffset(p);
  const elapsed = 0.28 - buf.t;
  const nd = Math.hypot(ball.x + ball.vx * STEP * 3 - p.x, ball.z + ball.vz * STEP * 3 - p.z);
  const dying = rally.bounces === 1 && ball.y < 0.2 && ball.vy < 0;
  if (!(elapsed >= SWING || buf.t <= STEP * 1.5 || nd > reach || dying)) return false;
  // si pulsaste antes de tiempo y la pala tuvo que esperar a la pelota, cuenta como temprano
  const eff = dt + Math.max(0, elapsed - SWING);
  const tq = timingQuality(eff), inp = pads[p.ctrl], fwd = fwdOf(p, inp);
  let shot;
  if (ball.y > 1.85) shot = buf.kind === 'slice' ? 'bandeja' : buf.kind === 'lob' ? 'vibora' : (fwd > 0.5 ? 'x3' : 'smash');
  else if (buf.kind === 'lob') shot = 'lob';
  else if (fwd < -0.5) shot = 'drop';
  else if (buf.kind === 'slice') shot = 'slice';
  else if (rally.bounces === 0) shot = 'volley';
  else shot = 'drive';
  const done = shoot(p, shot, inp.x, fwd, tq);
  showTiming(p, eff, tq, SHOT_NAMES[done]);
  if (match.hooks && match.hooks.hit) match.hooks.hit(p, tq, done);
  return true;
}

// ================== IA ==================
function replan() {
  if (state !== 'rally' || !rally) { plan.team = -1; plan.who = null; plan.landing = null; return; }
  const team = rally.receiving;
  const tp = teamOf(team);
  const netStyle = tp.some(p => p.skill.net);
  const { pts, landing } = predictPath(3.2, rally);
  plan.team = team; plan.landing = landing;
  const all = pts.filter(p => hittable(p, team, rally.serve, netStyle));
  if (!all.length || !tp.length) { plan.who = null; plan.target = null; return; }
  let who;
  if (tp.length === 1) who = tp[0];
  else {
    const [a, b] = tp, c0 = all[0];
    const mid = (a.x + b.x) / 2, sgn = Math.sign(b.x - a.x) || 1;
    who = ((c0.x - mid) * sgn > 0) ? b : a;
    if (simTime < mateCall[team].until && mateCall[team].who && mateCall[team].who.active) who = mateCall[team].who;
  }
  plan.who = who;
  if (isHuman(who)) { plan.target = null; return; }
  const d = who.skill;
  const need = p => Math.max(0, Math.hypot(p.x - who.x, p.z - who.z) - d.reach * 0.6) / d.speed + d.react;
  const pick = list => { let best = null, def = 1e9; for (const p of list) { const n = need(p); if (n <= p.t) return { best: p, def: 0 }; if (n - p.t < def) { def = n - p.t; best = p; } } return { best, def }; };
  // salida de pared: si la pelota va a rebotar en el cristal y llega a tiempo, la espera y le pega cuando sale
  // (siempre si antes del cristal solo podría tomarla pegada al fondo; si no, la mitad de las veces)
  const post = all.filter(p => p.w), pre = all.filter(p => !p.w);
  if (plan.wallFor !== shotId) {
    plan.wallFor = shotId;
    const okPost = post.length && pick(post).def === 0;
    plan.useWall = !!okPost && (pre.length === 0 || pre.every(p => Math.abs(p.z) > 7.6) || Math.random() < 0.5);
  }
  const { best, def: bestDef } = pick(plan.useWall && post.length ? post : all);
  if (plan.firstFor !== shotId) { plan.firstFor = shotId; plan.deficit = bestDef; }
  const s = team === 0 ? 1 : -1;
  // de pared la pelota viene hacia la red: el jugador se pone delante de ella; si no, un poco detrás
  plan.target = { x: best.x - 0.15 * s, z: best.z + (best.w ? -0.35 : 0.3) * s };
}

function formation(pl) {
  const s = pl.team === 0 ? 1 : -1;
  const mate = partnerOf(pl), mode = mate && isHuman(mate) ? mateMode[pl.team] : 'AUTO';
  let z;
  if (mode === 'ATAQUE') z = s * 3.9;
  else if (mode === 'DEFENSA') z = s * 8.2;
  else if (state === 'rally' && rally && rally.hitter === pl.team && rally.shot === 'lob' && rally.t > 0.5) z = s * 4.0; // globo: suben juntos a la red
  else if (state === 'rally' && rally && rally.hitter === pl.team) z = s * clamp(Math.abs(pl.z), pl.skill.net ? 3.8 : 4.2, pl.skill.net ? 5.5 : 7.0);
  else z = s * 7.4;
  if (mate) pl.lane = mate.x <= pl.x ? 1 : -1;
  const x = (mate ? pl.lane * 2.4 : 0) + clamp(ball.x, -4, 4) * 0.25;
  return { x, z };
}

function overheadChoice(pl) {
  const az = Math.abs(pl.z), r = Math.random();
  const mate = partnerOf(pl);
  const attack = mate && isHuman(mate) && mateMode[pl.team] === 'ATAQUE';
  if (az < 4.5) return r < pl.skill.x3 * (attack ? 1.5 : 1) ? 'x3' : 'smash';
  if (az < 7.5) return r < 0.5 ? 'bandeja' : r < 0.82 ? 'vibora' : 'smash';
  return r < 0.75 ? 'bandeja' : 'lob';
}

function weaknessHit(pl, pt) {
  switch (pl.weak) {
    case 'reves': return pl.team === 0 ? pt.x < pl.x - 0.1 : pt.x > pl.x + 0.1;
    case 'globo': return pt.y > 1.85;
    case 'pared': return rally.wallTouched;
    case 'velocidad': return incoming.fast;
  }
  return false;
}

// La IA decide el golpe SWING segundos antes del contacto, mirando dónde va a estar la pelota:
// así arranca el swing a tiempo y la pala llega a la pelota en el instante del impacto.
function aiTryHit(pl) {
  if (pl.pending || pl.cool > 0 || pl.missId === shotId) return;
  if (state !== 'rally' || !rally || rally.receiving !== pl.team) return;
  if (ball.kicked && !rally.outside) return;
  const f = predictAhead(SWING);
  if (!f || !f.crossed || f.bounces > 1) return;
  if (!rally.outside && (f.z > 0 ? 0 : 1) !== pl.team) return;
  if (rally.serve && f.bounces === 0) return;
  const mate = partnerOf(pl);
  if (mate && isHuman(mate) && plan.who === mate &&
    (simTime < mateCall[pl.team].until || Math.hypot(f.x - mate.x, f.z - mate.z) < Math.hypot(f.x - pl.x, f.z - pl.z))) return;
  const d = Math.hypot(f.x - pl.x, f.z - pl.z);
  if (d > pl.skill.reach) return;
  // si eligió jugarla de pared, espera a que salga del cristal (salvo que se le muera antes)
  if (plan.useWall && plan.wallFor === shotId && plan.who === pl && !f.w && !(f.bounces === 1 && f.y < 0.35 && f.vy < 0)) return;
  const y = f.y, b = f.bounces;
  let shot = null;
  if (b === 0) {
    if (Math.abs(pl.z) > 7) return;
    if (y > 2.0 && y < 2.9) shot = overheadChoice(pl); else if (y > 0.45 && y <= 2.0) shot = Math.random() < 0.25 ? 'slice' : 'volley';
  } else {
    if (y > 1.95 && y < 2.8) shot = Math.random() < 0.9 ? overheadChoice(pl) : 'lob';
    else if ((y > 0.28 && y < 1.7 && (f.vy < 1.0 || y > 1.2)) || (y <= 0.28 && f.vy < 0)) {
      const oppAtNet = teamOf(1 - pl.team).every(o => Math.abs(o.z) < 5.5);
      const mode = mate && isHuman(mate) ? mateMode[pl.team] : 'AUTO';
      let pLob = (oppAtNet ? 0.32 : 0.12) + pl.skill.lob;
      if (mode === 'ATAQUE') pLob *= 0.4; else if (mode === 'DEFENSA') pLob = Math.max(pLob, 0.35);
      if (rally.outside) pLob = 0.7;
      const pDrop = (Math.abs(pl.z) < 5 ? 0.12 : 0.03) + pl.skill.drop;
      const pSlice = (Math.abs(pl.z) > 8.3 || y < 0.5 ? 0.3 : 0.15) + (mode === 'DEFENSA' ? 0.15 : 0) + pl.skill.slice;
      const r = Math.random();
      if (r < pLob) shot = 'lob';
      else if (r < pLob + pDrop) shot = 'drop';
      else if (r < pLob + pDrop + pSlice) shot = 'slice';
      else shot = 'drive';
    }
  }
  if (!shot) return;
  // ¿llega bien? depende del golpe recibido, de cuánto corrió, de sus puntos débiles y del cansancio del punto
  let miss = false;
  if (pl.rollId !== shotId) {
    pl.rollId = shotId;
    const run = plan.who === pl ? clamp(plan.deficit || 0, 0, 1) : 0.3;
    const weak = weaknessHit(pl, f);
    let pMiss = pl.skill.miss + incoming.threat + run * 0.5 + d / pl.skill.reach * 0.06 + Math.max(0, pointShots - 8) * 0.008;
    if (weak) pMiss += 0.16;
    if (rally.outside) pMiss += 0.15;
    if (rally.serve) pMiss = pl.skill.miss * 0.5 + (weak ? 0.05 : 0); // el resto de saque casi siempre entra
    if (Math.random() < pMiss) { miss = true; pl.missId = shotId; if (weak) noteWeakness(pl); }
  }
  // arranca el swing ya: la pala llega a la pelota dentro de SWING segundos
  pl.pending = { at: simTime + SWING, shot, miss };
  setContact(pl, f, simTime + SWING);
  pl.swingT = 0.001; pl.swingKind = pl.contact.side;
  if (pl.contact.side === 'over') { pl.jumpT = 0.26; pl.jumpH = clamp(f.y - 2.2, 0.12, 0.55); }
}
// Ejecuta los golpes programados cuando llega su momento
function aiResolvePending() {
  for (const p of players) {
    if (!p.pending || simTime < p.pending.at - 1e-6) continue;
    const pd = p.pending; p.pending = null;
    if (!pd.miss && canTeamHit(p.team) && Math.hypot(ball.x - p.x, ball.z - p.z) < p.skill.reach + 1.0) shoot(p, pd.shot);
  }
}

// Pistas sobre los puntos débiles del rival
function noteWeakness(pl) {
  pl.weakMisses++;
  if (pl.weakMisses >= 2 && !pl.tipShown && teamOf(1 - pl.team).some(isHuman)) {
    pl.tipShown = true;
    showTip(`PISTA: ${pl.name} sufre con ${WEAKNESSES[pl.weak]}`);
  }
}

// ================== ÓRDENES AL COMPAÑERO ==================
let callTimer = 0, callFrom = null;
function callBall(p, who) {
  if (!p || state === 'idle' || state === 'over') return;
  const mate = partnerOf(p); if (!mate || isHuman(mate)) return;
  mateCall[p.team].who = who === 'mate' ? mate : p; mateCall[p.team].until = simTime + 2.2; plan.timer = 0;
  bubble(p, who === 'mate' ? '¡TUYA!' : '¡MÍA!');
  play('call', who === 'mate');
}
function cycleMate(p) {
  if (!p || state === 'idle' || state === 'over') return;
  const mate = partnerOf(p); if (!mate || isHuman(mate)) return;
  const modes = ['AUTO', 'ATAQUE', 'DEFENSA'];
  mateMode[p.team] = modes[(modes.indexOf(mateMode[p.team]) + 1) % modes.length];
  bubble(p, mateMode[p.team] === 'ATAQUE' ? '¡A LA RED!' : mateMode[p.team] === 'DEFENSA' ? '¡ATRÁS!' : '¡LIBRE!');
  updateHUD();
}
function bubble(p, text) {
  const el = $('call'); el.textContent = text; el.style.opacity = 1; callTimer = 1.2; callFrom = p;
  emit({ t: 'bubble', p: p.id, s: text });
}

// ================== ACTUALIZACIÓN ==================
function updatePlayers(dt) {
  const canMove = state === 'rally' || state === 'pointEnd';
  for (const p of players) {
    if (!p.active) continue;
    p.cool = Math.max(0, p.cool - dt);
    let dvx = 0, dvz = 0;
    if (canMove) {
      if (isHuman(p)) {
        const inp = pads[p.ctrl];
        const mag = Math.min(1, Math.hypot(inp.x, inp.y)), len = Math.hypot(inp.x, inp.y) || 1;
        // cansancio: por debajo de 40 de energía se corre más lento
        const tired = p.stamina < 40 ? 0.82 + 0.18 * (p.stamina / 40) : 1;
        const sp = p.stats.speed * tired;
        dvx = inp.x / len * sp * mag; dvz = -inp.y / len * sp * mag;
      } else if (state === 'pointEnd' && p.celebrate > 0) {
        const mate = partnerOf(p), s0 = p.team === 0 ? 1 : -1;
        if (p.celebrateWin && mate) {
          const d0 = Math.hypot(mate.x - p.x, mate.z - p.z);
          if (d0 > 0.75) { dvx = (mate.x - p.x) / d0 * 2.2; dvz = (mate.z - p.z) / d0 * 2.2; }
          else if (!p.tapDone) { p.tapDone = mate.tapDone = true; p.tapT = mate.tapT = 0.001; play('click'); }
        } else if (!p.celebrateWin) { const tz = s0 * 8.2; if (Math.abs(tz - p.z) > 0.3) dvz = Math.sign(tz - p.z) * 1.1; }
      } else if (state === 'rally') {
        const tgt = (plan.who === p && plan.target) ? plan.target : formation(p);
        p.tx = tgt.x; p.tz = tgt.z;
        const dx = p.tx - p.x, dz = p.tz - p.z, dist = Math.hypot(dx, dz);
        if (dist > 0.06) { const sp = Math.min(p.skill.speed, dist * 5); dvx = dx / dist * sp; dvz = dz / dist * sp; }
      }
    }
    let a = Math.min(1, dt * 12);
    // paso de ajuste: en los instantes previos al impacto el cuerpo se acomoda a la distancia justa de la pelota
    const ct = p.contact;
    if (ct && state === 'rally' && simTime > ct.t - SWING - 0.02 && simTime < ct.t + 0.01) {
      const ip = idealBodyPos(p, ct, ct.side), ddx = ip.x - p.x, ddz = ip.z - p.z, dist = Math.hypot(ddx, ddz);
      const spd = Math.min(7, dist / Math.max(0.03, ct.t - simTime));
      dvx = dist > 0.02 ? ddx / dist * spd : 0; dvz = dist > 0.02 ? ddz / dist * spd : 0; a = 1;
    }
    p.vx += (dvx - p.vx) * a; p.vz += (dvz - p.vz) * a;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const s = p.team === 0 ? 1 : -1;
    const outside = rally && rally.outside && rally.receiving === p.team;
    p.x = clamp(p.x, outside ? -8.2 : -4.75, outside ? 8.2 : 4.75);
    p.z = s * clamp(Math.abs(p.z), 0.4, outside ? 12.2 : 9.7);
    // energía
    if (isHuman(p)) {
      const sp = Math.hypot(p.vx, p.vz);
      if (state === 'rally') p.stamina -= (sp > 3.5 ? 5.5 : sp > 1 ? 1.5 : -2.5) * p.stats.drain * dt;
      else p.stamina += 14 * dt;
      p.stamina = clamp(p.stamina, 0, 100);
    }
  }
}

function handleEvents(ev) {
  for (const e of ev) {
    if (e.type === 'floor') { play('bounce', Math.min(1, e.imp / 6)); fxBounce(e); }
    else if (e.type === 'wall') play(e.frame ? 'frame' : e.glass ? 'glass' : 'fence', Math.min(1, e.imp / 8 + 0.2));
    else if (e.type === 'net') play('net');
    if (state !== 'rally' || !rally) continue;
    const r = rally;
    if (e.type === 'net') r.net = true;
    else if (e.type === 'floor') {
      if (r.outside || !e.inside) { endPoint(r.hitter, ball.kicked ? '¡POR 3!' : ball.outVia === 'back' ? '¡POR 4!' : '¡FUERA DE PISTA!', 'winner'); return; }
      if (!r.crossed) { if (r.serve) serveFault(r.net ? 'Red' : 'No pasó'); else endPoint(r.receiving, r.net ? 'RED' : 'FALLO', 'error'); return; }
      if (e.side === r.receiving) {
        r.bounces++;
        if (r.bounces === 1) {
          if (r.serve) {
            const inBox = Math.sign(ball.x) === r.boxSign && Math.abs(ball.z) <= SERVICE + 0.05;
            if (!inBox) { serveFault('Fuera del cuadro'); return; }
            if (faults === 0) stats.teams[r.hitter].firstIn++;
          }
          if (r.by && isHuman(r.by) && stats.humans[r.by.id]) stats.humans[r.by.id].landings.push([ball.x * (r.hitter === 0 ? 1 : -1), Math.abs(ball.z)]);
          if (match.hooks && match.hooks.land) match.hooks.land(ball.x, ball.z, r);
        }
        if (r.bounces >= 2) { endPoint(r.hitter, r.serve ? '¡SAQUE DIRECTO!' : '¡GANADOR!', r.serve ? 'ace' : 'winner'); return; }
      } else { endPoint(r.bounces >= 1 ? r.hitter : r.receiving, r.bounces >= 1 ? '¡POR ENCIMA!' : 'FALLO', r.bounces >= 1 ? 'winner' : 'error'); return; }
    } else if (e.type === 'wall') {
      if (!r.crossed && r.serve) { serveFault('Pared'); return; }
      if (r.crossed && e.side === r.receiving && r.bounces === 0) { if (r.serve) serveFault('Pared directa'); else endPoint(r.receiving, 'PARED DIRECTA', 'error'); return; }
      if (r.crossed && e.side === r.receiving && r.bounces === 1) r.wallTouched = true;
      if (r.crossed && e.side === r.hitter && r.bounces >= 1) { endPoint(r.hitter, '¡POR ENCIMA!', 'winner'); return; }
    } else if (e.type === 'out') {
      if (r.crossed && r.bounces >= 1) {
        // la pelota salió de la pista tras botar: se puede salir a buscarla
        const team = teamOf(r.receiving);
        const chase = team.some(isHuman) || team.some(p => Math.random() < (ball.kicked ? p.skill.save : 0.45 + 0.4 * p.skill.rating));
        if (chase && !(match.hooks && match.hooks.noOutside)) { r.outside = true; plan.timer = 0; showTip(ball.kicked ? '¡POR 3! ¡A buscarla afuera!' : '¡Sale de la pista! ¡A buscarla!', 1.4); }
        else endPoint(r.hitter, ball.kicked ? '¡POR 3!' : e.via === 'back' ? '¡POR 4!' : '¡FUERA DE PISTA!', 'winner');
      }
      else if (r.serve) serveFault('Fuera');
      else endPoint(r.receiving, 'FUERA', 'error');
      return;
    }
  }
}

const evBuf = [];
let stepCount = 0;
function fixedUpdate(dt) {
  simTime += dt; stepCount++;
  if (typeof readInputs === 'function') readInputs();
  if (state === 'intro') { updateIntro(dt); return; }
  if (state === 'replay') return;
  updatePlayers(dt);

  if (state === 'serve') {
    const s = server.team === 0 ? 1 : -1;
    // el sacador bota la pelota antes de sacar
    ball.x = server.x + rightX(server) * 0.4; ball.z = server.z - s * 0.4;
    ball.y = BR + Math.abs(Math.sin(simTime * 3.2)) * 0.85;
    if (!isHuman(server)) { serveWait -= dt; if (serveWait <= 0) { ball.y = 0.85; shoot(server, 'serve'); state = 'rally'; } }
    return;
  }

  evBuf.length = 0;
  stepBall(ball, dt, evBuf);

  if (state === 'rally' && rally) {
    rally.t += dt;
    const side = ball.z > 0 ? 0 : 1;
    if (!rally.crossed && side === rally.receiving) rally.crossed = true;
    else if (rally.crossed && !rally.outside && side === rally.hitter && rally.bounces >= 1 && Math.abs(ball.z) > 0.2 && insideCourt(ball)) endPoint(rally.hitter, '¡POR ENCIMA!', 'winner');
  }
  handleEvents(evBuf);
  if (state === 'rally' && rally && rally.t > 7) endPoint(rally.bounces >= 1 ? rally.hitter : rally.receiving, 'PUNTO', 'other');

  if (state === 'rally') {
    plan.timer -= dt;
    if (plan.timer <= 0 || plan.team !== rally.receiving) { replan(); plan.timer = 0.1; }
    if (humans().some(p => p.team === rally.receiving) && canTeamHit(rally.receiving)) {
      ballHist.push({ x: ball.x, y: ball.y, z: ball.z, t: simTime }); if (ballHist.length > 60) ballHist.shift();
    }
    for (const p of humans()) {
      if (!p.hitBuffer) continue;
      p.hitBuffer.t -= dt;
      if (tryHumanHit(p)) p.hitBuffer = null;
      else if (p.hitBuffer.t <= 0) { if (p.hitBuffer.near && state === 'rally') showTiming(p, null); p.hitBuffer = null; }
    }
    aiResolvePending();
    for (const p of players) if (p.active && !isHuman(p) && state === 'rally') aiTryHit(p);
  }

  // grabación para la repetición
  if ((state === 'rally' || (state === 'pointEnd' && stateTimer > 1.0)) && (stepCount & 1) === 0) recordFrame();

  if (state === 'pointEnd') {
    stateTimer -= dt;
    if (replay.pending && stateTimer < 1.0) { startReplay(); return; }
    if (stateTimer <= 0) {
      if (match.hooks && match.hooks.next) match.hooks.next();
      else if (matchWinner >= 0) { state = 'over'; finishMatch(); }
      else if (pendingReserve) { pendingReserve = false; const pts = score.pts; setupPoint(); score.pts = pts; }
      else { faults = 0; setupPoint(); }
    }
  }
}

function finishMatch() {
  emit({ t: 'over', w: matchWinner });
  if (match.onEnd) match.onEnd(matchWinner); else showOverStats();
}

// ================== PRESENTACIÓN ==================
let introT = 0;
function updateIntro(dt) { introT += dt; if (introT > 5.2) skipIntro(); }
function skipIntro() {
  if (state !== 'intro') return;
  showIntro(false); state = 'serve'; emit({ t: 'introEnd' });
  say(`Comienza el partido. Al servicio, ${server.name.toLowerCase()}`, true);
}

