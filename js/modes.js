'use strict';
// ================== CONFIGURACIÓN DE PARTIDOS ==================
// cfg.teams[t] = { name, short, flag, colors:[camiseta, short], players:[{ n, ctrl, rating, style, weak, attrs, shirt, paddle }] }
function configureMatch(cfg) {
  match = Object.assign({ games: settings.games, bestOf: settings.bestOf, golden: settings.golden, intro: true, label: 'Exhibición' }, cfg);
  players.forEach(p => {
    const t = match.teams[p.team], d = t.players[p.id % 2];
    if (!d) { p.active = false; p.ctrl = 'ai'; if (p.mesh) p.mesh.group.visible = false; return; }
    p.active = true; p.name = d.n; p.ctrl = d.ctrl || 'ai';
    p.style = d.style || 'completo'; p.weak = d.weak || null;
    p.skill = skillFromRating(d.rating !== undefined ? d.rating : 0.5, p.style);
    p.stats = humanStats(d.attrs);
    p.colors = [d.shirt !== undefined ? d.shirt : t.colors[0], t.colors[1], SKINS[(p.id + (d.n || '').length) % SKINS.length], HAIRS[(p.id * 3 + (d.n || '').length) % HAIRS.length]];
    p.paddle = d.paddle !== undefined ? d.paddle : (p.team === 0 ? 0xff3b3b : 0x3ad1e6);
  });
  buildPlayerMeshes(); layoutMeters(); paintBanner((match.banner || match.label || 'EXHIBICIÓN').toUpperCase());
  machine.visible = false; targets.visible = false;
}
function userTeam(partner, p2ctrl) {
  const pr = partner || PARTNERS[0];
  return {
    name: `${settings.name} / ${pr.n}`, short: settings.name, flag: '', colors: [settings.shirt, 0x1d2733],
    players: [
      { n: settings.name, ctrl: 'p1', attrs: partner && partner.attrs, paddle: settings.paddle, style: 'completo' },
      { n: p2ctrl ? 'JUGADOR 2P' : pr.n, ctrl: p2ctrl || 'ai', rating: pr.r, style: pr.style },
    ],
  };
}
function rosterTeam(r, rating, ctrl0) {
  return {
    name: r.name, short: r.name, flag: r.flag, colors: r.colors,
    players: r.players.map((pp, i) => ({ n: i === 0 && ctrl0 ? 'JUGADOR 2P' : pp.n, ctrl: i === 0 && ctrl0 ? ctrl0 : 'ai', rating: rating !== undefined ? rating : r.r, style: pp.style, weak: pp.weak })),
  };
}

// ================== EXHIBICIÓN ==================
function startExhibition() {
  const rating = DIFF_RATING[settings.diff];
  const rival = settings.rival === 'auto' ? pick(ROSTER) : (ROSTER.find(r => r.id === settings.rival) || pick(ROSTER));
  const coop = settings.players === 'coop', versus = settings.players === 'versus';
  const t0 = userTeam(Object.assign({}, PARTNERS[0], { r: rating }), coop ? 'p2' : null);
  if (coop) t0.name = `${settings.name} / JUGADOR 2P`;
  const t1 = rosterTeam(rival, rating, versus ? 'p2' : null);
  if (versus) { t1.name = 'JUGADOR 2P / ' + rival.players[1].n; t1.short = 'JUGADOR 2P'; }
  configureMatch({ mode: 'exhibition', label: 'Exhibición', teams: [t0, t1] });
  match.onEnd = w => showOverStats([{ label: 'REVANCHA', fn: () => startExhibition() }, { label: 'MENÚ', fn: toMenu, sec: true }]);
  beginMatch();
}

// ================== TORNEO ==================
const ROUND_NAMES = ['CUARTOS DE FINAL', 'SEMIFINAL', 'FINAL'];
const tour = { on: false };
function startTournament(opts) {
  // opts: { name, range:[min,max], pool, career, partner, onFinish(roundReached) }
  const [lo, hi] = opts.range;
  // las parejas de nivel más parecido al torneo; su nivel real se recorta al rango del torneo
  const mid = (lo + hi) / 2;
  const pool = [...ROSTER].sort((a, b) => Math.abs(a.r - mid) - Math.abs(b.r - mid)).slice(0, 9);
  const rivals = shuffle(pool).slice(0, 7).map(r => ({ ...r, rr: clamp(r.r, lo, hi) }));
  const me = { id: 'me', name: `${settings.name} / ${(opts.partner || PARTNERS[0]).n}`, short: settings.name, flag: '', user: true, rr: 0.5 };
  const entries = shuffle([me, ...rivals]);
  Object.assign(tour, { on: true, name: opts.name, opts, round: 0, entries, results: [[], [], []], alive: entries.map(e => e), out: false, champion: false });
  tour.bracket = [entries];
  showBracket();
}
function roundPairs(r) { const list = tour.bracket[r]; const out = []; for (let i = 0; i < list.length; i += 2) out.push([list[i], list[i + 1]]); return out; }
function simScore(n) { return [n, Math.floor(rnd(0, n - 1))]; }
function playTourMatch() {
  const pairs = roundPairs(tour.round);
  const mine = pairs.find(p => p[0].user || p[1].user);
  const rival = mine[0].user ? mine[1] : mine[0];
  const partner = tour.opts.partner || Object.assign({}, PARTNERS[0], { r: DIFF_RATING[settings.diff] });
  const t0 = userTeam(partner);
  const t1 = rosterTeam(rival, rival.rr);
  configureMatch({ mode: 'tournament', label: `${tour.name} · ${ROUND_NAMES[tour.round]}`, banner: tour.name, teams: [t0, t1], games: tour.opts.games || settings.games, bestOf: 1 });
  match.onEnd = w => {
    const res = [];
    for (const pr of pairs) {
      let win, sc;
      if (pr === mine) { win = w === 0 ? (mine[0].user ? 0 : 1) : (mine[0].user ? 1 : 0); sc = score.sets[0] ? [...score.sets[0]] : [0, 0]; if (!mine[0].user) sc.reverse(); }
      else { const pa = 1 / (1 + Math.exp(-(pr[0].rr - pr[1].rr) * 6)); win = Math.random() < pa ? 0 : 1; sc = simScore(match.games); if (win === 1) sc.reverse(); }
      res.push({ a: pr[0], b: pr[1], w: win, sc });
    }
    tour.results[tour.round] = res;
    const next = res.map(r => r.w === 0 ? r.a : r.b);
    const iWon = next.some(e => e.user);
    if (!iWon) { tour.out = true; }
    else if (tour.round === 2) { tour.champion = true; }
    else { tour.round++; tour.bracket[tour.round] = next; }
    showOverStats([{ label: 'CONTINUAR', fn: () => { showBracket(); } }], iWon ? (tour.champion ? '¡CAMPEONES!' : '¡A LA SIGUIENTE RONDA!') : 'ELIMINADOS');
  };
  beginMatch();
}
function showBracket() {
  hideAll(); $('tourOv').classList.remove('hidden');
  const cols = [0, 1, 2].map(r => {
    const res = tour.results[r];
    const list = tour.bracket[r];
    let html = `<div class="br-col"><div class="br-h">${ROUND_NAMES[r]}</div>`;
    if (list) for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1], rr = res && res[i / 2];
      const row = (e, won, sc) => `<div class="br-e ${e.user ? 'me' : ''} ${rr ? (won ? 'win' : 'lose') : ''}"><span class="fl">${e.flag || '★'}</span>${e.name}${sc !== undefined ? `<b>${sc}</b>` : ''}</div>`;
      html += `<div class="br-m">${row(a, rr && rr.w === 0, rr && rr.sc[0])}${row(b, rr && rr.w === 1, rr && rr.sc[1])}</div>`;
    } else html += '<div class="br-tbd">—</div>';
    return html + '</div>';
  }).join('');
  let footer;
  if (tour.champion) {
    footer = `<div class="br-champ">🏆 ¡${settings.name} CAMPEÓN DEL ${tour.name}!</div><button class="play" id="brDone">CONTINUAR</button>`;
    sfx.trophy(); say(`¡Campeones del ${tour.name.toLowerCase()}!`, true); crowdJump = 4;
  } else if (tour.out) {
    footer = `<div class="br-out">Eliminados en ${ROUND_NAMES[tour.round].toLowerCase()}</div><button class="play" id="brDone">CONTINUAR</button>`;
  } else footer = `<button class="play" id="brPlay">JUGAR ${ROUND_NAMES[tour.round]}</button><button class="play sec" id="brQuit">ABANDONAR</button>`;
  $('tourBody').innerHTML = `<div class="logo sm">${tour.name}</div><div class="bracket">${cols}</div>${footer}`;
  const done = () => { const reached = tour.champion ? 3 : tour.round; tour.on = false; if (tour.opts.onFinish) tour.opts.onFinish(reached); else toMenu(); };
  if ($('brPlay')) $('brPlay').onclick = () => { $('tourOv').classList.add('hidden'); playTourMatch(); };
  if ($('brQuit')) $('brQuit').onclick = () => { tour.out = true; done(); };
  if ($('brDone')) $('brDone').onclick = done;
}

// ================== CARRERA ==================
const TIERS = [
  { id: 'chal', name: 'CHALLENGER', req: 99, range: [0.12, 0.45], pts: [10, 25, 50, 100], xp: [30, 60, 100, 160] },
  { id: 'open', name: 'OPEN', req: 12, range: [0.3, 0.7], pts: [25, 60, 120, 250], xp: [45, 90, 150, 240] },
  { id: 'master', name: 'MASTER', req: 6, range: [0.55, 0.92], pts: [60, 150, 300, 600], xp: [70, 140, 220, 350] },
  { id: 'finals', name: 'FINALS', req: 3, range: [0.72, 1], pts: [100, 250, 500, 1000], xp: [100, 200, 320, 500] },
];
let career = store.get('career', null);
const saveCareer = () => store.set('career', career);
function newCareer(name) {
  career = {
    name, attrs: { potencia: 3, control: 3, velocidad: 3, reflejos: 3, resistencia: 3 }, points: 4, xp: 0, level: 1,
    rankPts: 0, partner: 'c1', titles: 0, played: 0, history: [],
    ai: Object.fromEntries(ROSTER.map(r => [r.id, Math.round(1000 * Math.pow(r.r, 1.8))])),
  };
  saveCareer();
}
function careerRanking() {
  const list = ROSTER.map(r => ({ id: r.id, name: r.name, flag: r.flag, pts: career.ai[r.id] }));
  const pr = PARTNERS.find(p => p.id === career.partner) || PARTNERS[1];
  list.push({ id: 'me', name: `${career.name} / ${pr.n}`, flag: '★', pts: career.rankPts, me: true });
  list.sort((a, b) => b.pts - a.pts);
  return list;
}
const careerRank = () => careerRanking().findIndex(e => e.me) + 1;
const xpNeeded = lvl => 100 * lvl;
function careerPartner() { return Object.assign({}, PARTNERS.find(p => p.id === career.partner) || PARTNERS[1], { attrs: career.attrs }); }
function startCareerTournament(tier) {
  settings.name = career.name;
  startTournament({
    name: tier.name, range: tier.range, career: true, partner: careerPartner(), games: settings.games,
    onFinish: reached => {
      const pts = tier.pts[reached], xp = tier.xp[reached];
      career.rankPts += pts; career.xp += xp; career.played++;
      if (reached === 3) career.titles++;
      // el resto del circuito también juega
      for (const r of ROSTER) career.ai[r.id] = Math.max(50, Math.round(career.ai[r.id] * 0.97 + rnd(0, 60) * r.r));
      let lvlMsg = '';
      while (career.xp >= xpNeeded(career.level)) { career.xp -= xpNeeded(career.level); career.level++; career.points += 2; lvlMsg = `¡Subiste a nivel ${career.level}! +2 puntos de atributo`; }
      career.history.unshift({ t: tier.name, r: ['Cuartos', 'Semifinal', 'Final', 'Campeón'][reached], pts });
      career.history = career.history.slice(0, 8);
      saveCareer();
      showCareer(`${tier.name}: ${['eliminado en cuartos', 'eliminado en semis', 'finalista', '¡CAMPEÓN!'][reached]} · +${pts} pts de ranking · +${xp} XP` + (lvlMsg ? ' · ' + lvlMsg : ''));
    },
  });
}
function showCareer(notice) {
  hideAll(); state = 'idle';
  const el = $('scrCareer'); el.classList.remove('hidden');
  if (!career) {
    $('careerBody').innerHTML = `<div class="logo sm">MODO <b>CARRERA</b></div><div class="tag">Creá tu jugador, ganá torneos y subí en el ranking.</div>
      <div class="field"><label>NOMBRE DEL JUGADOR</label><input type="text" id="crName" maxlength="12" value="${settings.name}"></div>
      <button class="play" id="crNew">CREAR JUGADOR</button><button class="play sec" data-back>VOLVER</button>`;
    $('crNew').onclick = () => { newCareer(($('crName').value.trim() || 'JUGADOR').toUpperCase()); showCareer('¡Bienvenido al circuito! Repartí tus 4 puntos de atributo.'); };
    bindBack(el); return;
  }
  const rank = careerRank(), rk = careerRanking();
  const A = career.attrs, names = { potencia: 'POTENCIA', control: 'CONTROL', velocidad: 'VELOCIDAD', reflejos: 'REFLEJOS', resistencia: 'RESISTENCIA' };
  const attrs = Object.keys(names).map(k => `<div class="at"><span>${names[k]}</span><div class="at-bar"><i style="width:${A[k] * 10}%"></i></div><b>${A[k]}</b>${career.points > 0 && A[k] < 10 ? `<button data-up="${k}">+</button>` : ''}</div>`).join('');
  const partners = PARTNERS.slice(1).map(p => {
    const ok = rank <= p.rank;
    return `<button class="pt ${career.partner === p.id ? 'on' : ''}" ${ok ? `data-pt="${p.id}"` : 'disabled'}>${p.n}<small>${STYLES[p.style].name} · ${'★'.repeat(Math.round(p.r * 5))}${ok ? '' : ` · top ${p.rank}`}</small></button>`;
  }).join('');
  const tiers = TIERS.map(t => {
    const ok = rank <= t.req;
    return `<button class="tr ${ok ? '' : 'lock'}" ${ok ? `data-tier="${t.id}"` : 'disabled'}><b>${t.name}</b><small>${ok ? `Campeón: +${t.pts[3]} pts` : `Requiere top ${t.req}`}</small></button>`;
  }).join('');
  const table = rk.slice(0, 16).map((e, i) => `<tr class="${e.me ? 'me' : ''}"><td>${i + 1}</td><td>${e.flag}</td><td>${e.name}</td><td>${e.pts}</td></tr>`).join('');
  $('careerBody').innerHTML = `
    <div class="cr-top"><div><div class="logo sm">${career.name}</div><div class="tag">NIVEL ${career.level} · RANKING #${rank} · ${career.titles} ${career.titles === 1 ? 'TÍTULO' : 'TÍTULOS'} · ${career.played} ${career.played === 1 ? 'TORNEO' : 'TORNEOS'}</div></div>
    <div class="xp"><span>XP ${career.xp}/${xpNeeded(career.level)}</span><div class="at-bar"><i style="width:${career.xp / xpNeeded(career.level) * 100}%"></i></div></div></div>
    ${notice ? `<div class="notice">${notice}</div>` : ''}
    <div class="grid3">
      <div><h3>ATRIBUTOS ${career.points ? `<em>${career.points} puntos libres</em>` : ''}</h3>${attrs}
        <h3 style="margin-top:14px">COMPAÑERO</h3><div class="pts">${partners}</div></div>
      <div><h3>TORNEOS</h3><div class="trs">${tiers}</div>
        <h3 style="margin-top:14px">ÚLTIMOS RESULTADOS</h3><div class="hist">${career.history.map(h => `<div>${h.t} · ${h.r} · +${h.pts}</div>`).join('') || '<div>Todavía no jugaste torneos.</div>'}</div></div>
      <div><h3>RANKING</h3><table class="rk">${table}</table>${rank > 16 ? `<div class="hist">Tu posición: #${rank}</div>` : ''}</div>
    </div>
    <button class="play sec" data-back>VOLVER</button> <button class="play sec danger" id="crReset">REINICIAR CARRERA</button>`;
  el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { if (career.points > 0) { career.attrs[b.dataset.up]++; career.points--; saveCareer(); showCareer(); } });
  el.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { career.partner = b.dataset.pt; saveCareer(); showCareer(); });
  el.querySelectorAll('[data-tier]').forEach(b => b.onclick = () => startCareerTournament(TIERS.find(t => t.id === b.dataset.tier)));
  $('crReset').onclick = () => { if (confirm('¿Borrar tu carrera y empezar de cero?')) { career = null; store.set('career', null); showCareer(); } };
  bindBack(el);
}

// ================== ENTRENAMIENTO ==================
const DRILLS = {
  libre: { name: 'GOLPES DE FONDO', desc: 'Pelotas variadas a tu zona. Apuntá a las dianas.' },
  pared: { name: 'SALIDA DE PARED', desc: 'Pelotas profundas que rebotan en el cristal. Esperala y devolvela.' },
  volea: { name: 'VOLEA', desc: 'Estás en la red: voleá antes de que pique.' },
  aereo: { name: 'BANDEJA Y REMATE', desc: 'Globos para practicar remate, bandeja, víbora y por 3 (W + remate).' },
};
const train = { drill: 'libre', n: 0, balls: 15, pts: 0, landed: false, lastTq: null };
const feeder = { id: 9, team: 1, ctrl: 'ai', active: true, name: 'MÁQUINA', skill: skillFromRating(0.5), stats: humanStats(), x: 0, z: -8.6, yaw: 0, swingT: 0, jumpT: 0, cool: 0 };
function startTraining(drill) {
  train.drill = drill; train.n = 0; train.pts = 0;
  configureMatch({
    mode: 'training', label: 'Entrenamiento', banner: 'ENTRENAMIENTO', intro: false,
    teams: [{ name: settings.name, short: settings.name, colors: [settings.shirt, 0x1d2733], players: [{ n: settings.name, ctrl: 'p1', paddle: settings.paddle, attrs: career && career.attrs }] },
      { name: 'MÁQUINA', short: 'MÁQUINA', colors: [0x333333, 0x333333], players: [] }],
    hooks: {
      noOutside: true,
      point: (winner, reason) => { trainResult(winner, reason); return true; },
      land: (x, z, r) => { if (r.hitter === 0) trainLand(x, z); },
      hit: (p, tq) => { train.lastTq = tq; },
      next: () => trainFeed(),
    },
  });
  machine.visible = true; machine.position.set(0, 0, -8.9); targets.visible = true;
  score = { pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tiebreak: false };
  stats = { teams: [0, 1].map(() => ({ pts: 0, winners: 0, ue: 0, df: 0, aces: 0, x3: 0, firstIn: 0, firstTot: 0 })), longest: 0, humans: { 0: { name: settings.name, hits: 0, perfect: 0, good: 0, landings: [] } } };
  players[0].x = 0; players[0].z = 8; players[0].stamina = 100;
  showHUD(true); $('scoreboard').style.display = 'none'; $('trainHud').classList.remove('hidden');
  state = 'pointEnd'; stateTimer = 1.2; rally = null; matchWinner = -1;
  updateTrainHud();
}
function updateTrainHud() {
  const best = store.get('train.' + train.drill, 0);
  $('trainHud').innerHTML = `<b>ENTRENAMIENTO · ${DRILLS[train.drill].name}</b><span>BOLA ${Math.min(train.n, train.balls)}/${train.balls}</span><span>${train.pts} PTS</span><span>RÉCORD ${best}</span>`;
}
function trainFeed() {
  if (train.n >= train.balls) { trainEnd(); return; }
  train.n++; train.landed = false; train.lastTq = null;
  const u = players[0];
  if (train.drill === 'volea') { u.x = clamp(u.x, -2.5, 2.5); u.z = 3.4; }
  if (train.drill === 'aereo') { u.z = clamp(u.z, 3.5, 6.5); }
  ball.x = rnd(-0.4, 0.4); ball.y = 1.0; ball.z = -8.3;
  feeder.x = ball.x; feeder.z = -8.6;
  let o;
  const tx = clamp(u.x + rnd(-2.2, 2.2), -4, 4);
  switch (train.drill) {
    case 'pared': o = { tx, tz: rnd(8.7, 9.4), speedH: rnd(15, 18), spin: rnd(0, 0.4) }; break;
    case 'volea': o = { tx: clamp(u.x + rnd(-1.4, 1.4), -4, 4), tz: 8.5, speedH: rnd(14, 16), spin: 0, clear: NET_H + 0.25 }; break;
    case 'aereo': o = { tx: clamp(u.x + rnd(-1.2, 1.2), -4, 4), tz: clamp(u.z + rnd(-0.5, 1.2), 3, 7.5), T: rnd(1.45, 1.75), spin: 0.1, clear: 3 }; break;
    default: o = { tx, tz: rnd(5.5, 8.8), speedH: rnd(13, 17), spin: rnd(-0.5, 0.6) };
  }
  shoot(feeder, 'feed', 0, 0, null, o);
  state = 'rally'; plan.timer = 0;
  updateTrainHud();
}
function trainLand(x, z) {
  if (train.landed) return;
  train.landed = true;
  let pts = 1, txt = 'DENTRO +1';
  const hitT = TARGET_SPOTS.find(t => Math.hypot(x - t.x, z - t.z) <= t.r);
  if (hitT) { pts += 3; txt = '¡DIANA! +4'; }
  if (train.lastTq && train.lastTq.label === 'PERFECTO') { pts += 1; txt += ' (+1 timing)'; }
  train.pts += pts;
  showMsg(txt, '', hitT ? '#ff9f1c' : '#d6f542'); msgTimer = 0.9;
  play(hitT ? 'cheer' : 'click', false);
  state = 'pointEnd'; stateTimer = 1.1;
  updateTrainHud();
}
function trainResult(winner, reason) {
  if (state !== 'rally') return;
  if (winner === 0 && /POR [34]/.test(reason)) { train.pts += 5; showMsg('¡POR 3! +5', '', '#d6f542'); msgTimer = 1; play('cheer', true); }
  else if (!train.landed) { showMsg(winner === 0 ? 'PUNTO' : 'FALLO', reason === 'FALLO' ? '' : reason, winner === 0 ? '#d6f542' : '#ff7a7a'); msgTimer = 0.9; }
  state = 'pointEnd'; stateTimer = 1.1;
  updateTrainHud();
}
function trainEnd() {
  state = 'over';
  const key = 'train.' + train.drill, best = store.get(key, 0), rec = train.pts > best;
  if (rec) store.set(key, train.pts);
  if (career && train.pts >= 25) { career.xp += 15; saveCareer(); }
  $('overTitle').textContent = rec ? '¡NUEVO RÉCORD!' : 'ENTRENAMIENTO TERMINADO';
  $('overTitle').style.color = rec ? 'var(--lime)' : 'var(--ink)';
  $('overSub').textContent = `${DRILLS[train.drill].name}: ${train.pts} puntos` + (rec ? '' : ` · récord ${best}`) + (career && train.pts >= 25 ? ' · +15 XP de carrera' : '');
  $('overStats').innerHTML = statsHTMLTraining();
  drawHeatmaps($('overStats'));
  setOverButtons([{ label: 'REPETIR', fn: () => startTraining(train.drill) }, { label: 'OTRO EJERCICIO', fn: () => openScreen('scrTrain'), sec: true }, { label: 'MENÚ', fn: toMenu, sec: true }]);
  $('overOv').classList.remove('hidden');
}
function statsHTMLTraining() {
  const s = stats.humans[0]; const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  return `<div class="st-humans"><div class="st-h"><div class="st-hn">${s.name}</div><canvas class="heat" data-id="0" width="120" height="200"></canvas>
    <div>Golpes: ${s.hits}</div><div>Perfectos: ${pct(s.perfect, s.hits)}</div><div>Buenos: ${pct(s.good, s.hits)}</div></div></div>`;
}
