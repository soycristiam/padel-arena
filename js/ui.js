'use strict';
// ================== ENTRADAS ==================
const keys = {};
const joy = { x: 0, y: 0, id: null };
const gpAxes = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
const gpPrev = [[], []];
const hasP2 = () => players.some(p => p.active && p.ctrl === 'p2');
const ctrlPlayer = ctrl => players.find(p => p.active && p.ctrl === ctrl) || null;

function readInputs() {
  const ax = (a, b) => (keys[a] ? 1 : 0) - (keys[b] ? 1 : 0);
  const two = hasP2();
  let x1 = ax('KeyD', 'KeyA') + joy.x + gpAxes[0].x, y1 = ax('KeyW', 'KeyS') + joy.y + gpAxes[0].y;
  if (!two) { x1 += ax('ArrowRight', 'ArrowLeft'); y1 += ax('ArrowUp', 'ArrowDown'); }
  pads.p1.x = clamp(x1, -1, 1); pads.p1.y = clamp(y1, -1, 1);
  pads.p2.x = clamp(ax('ArrowRight', 'ArrowLeft') + gpAxes[1].x, -1, 1);
  pads.p2.y = clamp(ax('ArrowUp', 'ArrowDown') + gpAxes[1].y, -1, 1);
}

// act: hit | slice | lob | mate | me | tac
function action(ctrl, act) {
  audioInit();
  if (netRole === 'guest') {
    if (ctrl !== 'p1') return;
    if (act === 'hit') guestPress('normal'); else if (act === 'slice') guestPress('slice'); else if (act === 'lob') guestPress('lob');
    else if (act === 'mate') guestCall('mate'); else if (act === 'me') guestCall('me'); else if (act === 'tac') guestTac();
    return;
  }
  const p = ctrlPlayer(ctrl);
  if (!p) { if (state === 'intro') skipIntro(); else if (state === 'replay') endReplay(); return; }
  if (act === 'hit') humanPress(p, 'normal');
  else if (act === 'slice') humanPress(p, 'slice');
  else if (act === 'lob') humanPress(p, 'lob');
  else if (act === 'mate') callBall(p, 'mate');
  else if (act === 'me') callBall(p, 'me');
  else if (act === 'tac') cycleMate(p);
}

const KEYMAP_P1 = { Space: 'hit', KeyJ: 'hit', KeyL: 'slice', KeyK: 'lob', ShiftLeft: 'lob', KeyQ: 'mate', KeyE: 'me', KeyT: 'tac' };
const KEYMAP_P2 = { Period: 'hit', Enter: 'hit', NumpadEnter: 'hit', Numpad1: 'hit', Comma: 'slice', Numpad2: 'slice', Slash: 'lob', Minus: 'lob', Numpad3: 'lob', ShiftRight: 'lob', Digit8: 'mate', Digit9: 'me', Digit0: 'tac' };
addEventListener('keydown', e => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (state === 'idle' || (state === 'over' && netRole !== 'guest' && !$('overOv').classList.contains('hidden'))) return;
  if (e.code === 'KeyC') { camMode = (camMode + 1) % 4; return; }
  if (e.code === 'KeyM') { toggleMute(); syncMute(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (KEYMAP_P1[e.code]) action('p1', KEYMAP_P1[e.code]);
  else if (KEYMAP_P2[e.code]) action(hasP2() ? 'p2' : 'p1', KEYMAP_P2[e.code]);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// mandos (Gamepad API)
const GP_BTN = { 0: 'hit', 2: 'slice', 3: 'lob', 1: 'lob', 4: 'mate', 5: 'me', 8: 'tac' };
function pollGamepads() {
  if (!navigator.getGamepads) return;
  const pads2 = [...navigator.getGamepads()].filter(Boolean).slice(0, 2);
  for (let i = 0; i < 2; i++) {
    const g = pads2[i];
    if (!g) { gpAxes[i].x = gpAxes[i].y = 0; continue; }
    const dz = v => Math.abs(v) < 0.25 ? 0 : v;
    gpAxes[i].x = dz(g.axes[0] || 0); gpAxes[i].y = -dz(g.axes[1] || 0);
    if (g.buttons[14] && g.buttons[14].pressed) gpAxes[i].x = -1; if (g.buttons[15] && g.buttons[15].pressed) gpAxes[i].x = 1;
    if (g.buttons[12] && g.buttons[12].pressed) gpAxes[i].y = 1; if (g.buttons[13] && g.buttons[13].pressed) gpAxes[i].y = -1;
    g.buttons.forEach((b, j) => {
      const was = gpPrev[i][j]; gpPrev[i][j] = b.pressed;
      if (!b.pressed || was) return;
      if (state === 'idle' || state === 'over') return;
      if (j === 9) togglePause();
      else if (GP_BTN[j]) action(i === 0 ? 'p1' : 'p2', GP_BTN[j]);
    });
  }
}

// táctil
(function touchSetup() {
  const base = $('joy'), knob = $('knob');
  const move = t => {
    const r = base.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = Math.abs(dx) > 0.2 ? dx : 0; joy.y = Math.abs(dy) > 0.2 ? -dy : 0;
    knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
  };
  base.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; joy.id = t.identifier; move(t); }, { passive: false });
  addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === joy.id) move(t); }, { passive: false });
  const end = e => { for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  const btn = (id, act) => $(id).addEventListener('touchstart', e => { e.preventDefault(); action('p1', act); }, { passive: false });
  btn('tHit', 'hit'); btn('tLob', 'lob'); btn('tCut', 'slice'); btn('tCall', 'mate'); btn('tTac', 'tac');
  // tocar la pantalla salta la presentación o la repetición
  $('game').addEventListener('touchstart', () => { if (state === 'intro') action('p1', 'hit'); else if (state === 'replay') action('p1', 'hit'); });
  $('game').addEventListener('click', () => { if (state === 'intro' || state === 'replay') action('p1', 'hit'); });
})();

// ================== PANTALLAS ==================
const SCREENS = ['menu', 'scrExh', 'scrTour', 'tourOv', 'scrCareer', 'scrTrain', 'scrOnline', 'scrCustom', 'scrModels', 'scrSettings', 'scrHelp', 'pauseOv', 'overOv'];
function hideAll() { SCREENS.forEach(id => $(id).classList.add('hidden')); }
function bindBack(el) { el.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { sfx.click(); toMenu(); }); }
function showHUD(on) {
  $('scoreboard').style.display = on ? 'block' : 'none';
  $('topRight').style.display = on ? 'flex' : 'none';
  $('touch').style.display = on && isTouch ? 'block' : 'none';
  if (!on) {
    ['trainHud', 'replayBadge', 'intro'].forEach(id => $(id).classList.add('hidden'));
    $('mate').style.display = 'none'; $('energy').style.display = 'none'; $('hint').style.display = 'none';
    $('tip').classList.remove('on'); $('msg').style.opacity = 0; marker.visible = false;
    Object.values(meters).forEach(m => m.el.classList.remove('on'));
  }
}
function openScreen(id) {
  hideAll(); showHUD(false);
  if (state !== 'idle') { state = 'idle'; resetMenuScene(); }
  $(id).classList.remove('hidden'); refreshScreens();
}
function toMenu() {
  if (netRole) netClose();
  paused = false; tour.on = false;
  hideAll(); showHUD(false); state = 'idle';
  $('menu').classList.remove('hidden');
  resetMenuScene(); refreshScreens();
}
function beginMatch() {
  hideAll(); showHUD(true); $('trainHud').classList.add('hidden');
  paused = false; acc = 0; camMode = 0;
  newMatch();
}
function togglePause() {
  if (state === 'idle' || state === 'over' || netRole === 'guest') return;
  paused = !paused; $('pauseOv').classList.toggle('hidden', !paused);
}
function syncMute() { $('bMute').textContent = muted ? 'SIN SONIDO (M)' : 'SONIDO (M)'; }

function setOverButtons(list) {
  const box = $('overBtns'); box.innerHTML = '';
  list.forEach(b => {
    const el = document.createElement('button'); el.className = 'play' + (b.sec ? ' sec' : ''); el.textContent = b.label;
    el.onclick = () => { sfx.click(); $('overOv').classList.add('hidden'); b.fn(); };
    box.appendChild(el);
  });
}
function showOverStats(buttons, title, won) {
  const me = netRole === 'guest' ? players[guestIdx] : (localHumans()[0] || players[0]);
  const w = won !== undefined ? won : matchWinner === me.team;
  let t = title || (w ? '¡VICTORIA!' : 'DERROTA');
  if (!title && localHumans().length > 1 && localHumans()[0].team !== localHumans()[1].team) t = `¡GANA ${teamShort(matchWinner)}!`;
  $('overTitle').textContent = t;
  $('overTitle').style.color = w ? 'var(--lime)' : 'var(--red)';
  $('overSub').textContent = score && score.sets.length ? 'Resultado: ' + score.sets.map(s => `${s[0]}-${s[1]}`).join('  ') : '';
  $('overStats').innerHTML = statsHTML(); drawHeatmaps($('overStats'));
  setOverButtons(buttons || [{ label: 'MENÚ', fn: toMenu }]);
  $('overOv').classList.remove('hidden');
  if (w) { sfx.trophy(); crowdJump = 3; }
}

// ---- botones del menú ----
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { sfx.click(); audioInit(); openScreen(b.dataset.open); });
document.querySelector('[data-act="career"]').onclick = () => { sfx.click(); audioInit(); showCareer(); };
SCREENS.forEach(id => bindBack($(id)));
$('bExhPlay').onclick = () => { audioInit(); saveSettings(); startExhibition(); };
$('bTourPlay').onclick = () => {
  audioInit(); saveSettings();
  const d = settings.diff;
  startTournament({
    name: { facil: 'AMATEUR CUP', normal: 'PRO OPEN', dificil: 'ÉLITE MASTERS' }[d],
    range: { facil: [0.1, 0.4], normal: [0.35, 0.7], dificil: [0.62, 0.95] }[d],
    games: settings.games, partner: Object.assign({}, PARTNERS[0], { r: DIFF_RATING[d] }),
  });
};
$('bCam').onclick = () => { camMode = (camMode + 1) % 4; };
$('bMute').onclick = () => { toggleMute(); syncMute(); };
$('bPause').onclick = togglePause;
$('bResume').onclick = togglePause;
$('bQuit').onclick = () => { paused = false; $('pauseOv').classList.add('hidden'); toMenu(); };

// segmentos y casillas que editan settings
document.querySelectorAll('.seg[data-key]').forEach(seg => {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const v = b.dataset.v, key = seg.dataset.key;
    settings[key] = isNaN(+v) ? v : +v; saveSettings(); sfx.click();
    if (key === 'court' || key === 'venue') applyVenue();
    if (key === 'meter') layoutMeters();
    if (key === 'quality') applyQuality();
    refreshScreens();
  });
});
document.querySelectorAll('[data-chk]').forEach(c => c.addEventListener('change', () => { settings[c.dataset.chk] = c.checked; saveSettings(); refreshScreens(); if (c.dataset.chk === 'realModels') applyRealModels(); }));
$('inName').addEventListener('input', () => { settings.name = ($('inName').value.trim() || 'JUGADOR').toUpperCase(); saveSettings(); });
$('inName').addEventListener('change', () => resetMenuScene());

function refreshScreens() {
  document.querySelectorAll('.seg[data-key]').forEach(seg => {
    const v = settings[seg.dataset.key] !== undefined ? settings[seg.dataset.key] : (seg.dataset.key === 'onMode' ? 'coop' : undefined);
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(v) === b.dataset.v));
  });
  document.querySelectorAll('[data-chk]').forEach(c => { c.checked = !!settings[c.dataset.chk]; });
  $('inName').value = settings.name;
  // rivales
  const rl = $('rivalList');
  rl.innerHTML = `<button data-rv="auto" class="${settings.rival === 'auto' ? 'on' : ''}">ALEATORIO<small>Una pareja al azar</small></button>` +
    ROSTER.map(r => `<button data-rv="${r.id}" class="${settings.rival === r.id ? 'on' : ''}">${r.flag} · ${r.name}<small>${r.players.map(p => STYLES[p.style].name).join(' + ')}</small></button>`).join('');
  rl.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => { settings.rival = b.dataset.rv; saveSettings(); sfx.click(); refreshScreens(); });
  // colores
  const sw = (id, list, key) => {
    const el = $(id); el.innerHTML = list.map(c => `<button data-c="${c}" class="${settings[key] === c ? 'on' : ''}" style="background:${hex(c)}"></button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { settings[key] = +b.dataset.c; saveSettings(); sfx.click(); refreshScreens(); resetMenuScene(); });
  };
  sw('swShirt', SHIRT_COLORS, 'shirt'); sw('swPaddle', PADDLE_COLORS, 'paddle');
  // ejercicios
  $('drillList').innerHTML = Object.entries(DRILLS).map(([k, d]) => `<button data-dr="${k}"><b>${d.name}</b><small>${d.desc}</small><br><em>Récord: ${store.get('train.' + k, 0)} pts</em></button>`).join('');
  $('drillList').querySelectorAll('[data-dr]').forEach(b => b.onclick = () => { audioInit(); sfx.click(); hideAll(); startTraining(b.dataset.dr); });
  syncMute();
}

// ---- modelos 3D reales ----
function modelStatus(t) { $('modelStatus').innerHTML = t; }
function refreshModelList() {
  const el = $('modelList');
  el.innerHTML = realModels.length ? realModels.map(m => `<div>${m.name} <button class="ibtn" data-delm="${m.name}">QUITAR</button></div>`).join('') : 'Ninguno.';
  el.querySelectorAll('[data-delm]').forEach(b => b.onclick = async () => { await removeModel(b.dataset.delm); refreshModelList(); applyRealModels(); });
}
async function applyRealModels() { buildPlayerMeshes(); if (state === 'idle') resetMenuScene(); }
$('bModelAdd').onclick = () => $('modelFile').click();
const ANIM_NAMES = { idle: 'espera', run: 'correr', back: 'retroceder', sl: 'lateral izq.', sr: 'lateral der.', win: 'festejo', lose: 'lamento' };
function refreshAnimList() {
  const have = Object.keys(realAnims);
  $('animList').innerHTML = have.length ? Object.entries(ANIM_NAMES).map(([k, n]) => `${have.includes(k) ? '✔' : '·'} ${n}`).join(' &nbsp; ') : 'Ninguna.';
}
$('bAnimAdd').onclick = () => $('animFile').click();
$('animFile').onchange = async e => {
  for (const f of e.target.files) {
    modelStatus(`Cargando ${f.name}…`);
    try { const tag = await addAnimFile(f); modelStatus(`✔ ${f.name} → ${ANIM_NAMES[tag]}`); }
    catch (err) { modelStatus(`✖ ${f.name}: ${err.message}`); }
  }
  e.target.value = ''; refreshAnimList(); applyRealModels();
};
$('bAnimDel').onclick = async () => { await removeAnims(); refreshAnimList(); applyRealModels(); modelStatus('Animaciones quitadas.'); };
$('modelFile').onchange = async e => {
  for (const f of e.target.files) {
    modelStatus(`Cargando ${f.name}…`);
    try { await addModelFile(f); modelStatus(`✔ ${f.name} cargado.`); settings.realModels = true; saveSettings(); }
    catch (err) { modelStatus(`✖ ${f.name}: ${err.message}`); }
  }
  e.target.value = ''; refreshScreens(); refreshModelList(); applyRealModels();
};
$('bModelSample').onclick = async () => {
  modelStatus('Descargando el maniquí de ejemplo (unos 3 MB)…');
  try { await addSampleModel(); settings.realModels = true; saveSettings(); modelStatus('✔ Maniquí de ejemplo cargado.'); }
  catch (err) { modelStatus('✖ ' + err.message); }
  refreshScreens(); refreshModelList(); applyRealModels();
};

// ---- online ----
const copy = id => { const t = $(id).value; if (!t) return; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => netStatus('Código copiado.'), () => { $(id).select(); document.execCommand('copy'); netStatus('Código copiado.'); }); };
$('onHost').onclick = async () => {
  audioInit();
  try { $('onOffer').value = 'Generando…'; $('onOffer').value = await hostCreate(settings.onMode || 'coop'); }
  catch (e) { netStatus('No se pudo crear la partida: ' + e.message); }
};
$('onAccept').onclick = async () => {
  try { await hostAccept($('onAnswerIn').value); } catch (e) { netStatus('Código de respuesta inválido.'); }
};
$('onJoin').onclick = async () => {
  audioInit();
  try { $('onAnswer').value = 'Generando…'; $('onAnswer').value = await guestJoin($('onOfferIn').value); }
  catch (e) { $('onAnswer').value = ''; netStatus('Código del anfitrión inválido.'); }
};
$('onCopyOffer').onclick = () => copy('onOffer');
$('onCopyAnswer').onclick = () => copy('onAnswer');

// ================== ESCENA DEL MENÚ ==================
function resetMenuScene() {
  configureMatch({ mode: 'menu', intro: false, teams: [userTeam(), rosterTeam(ROSTER[0])] });
  players.forEach((p, i) => { p.x = [-2.5, 2.5, 2.5, -2.5][i]; p.z = [7, 7, -7, -7][i]; p.vx = p.vz = 0; p.swingT = 0; p.celebrate = 0; });
  machine.visible = false; targets.visible = false;
}

// ================== BUCLE PRINCIPAL ==================
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pollGamepads();
  crowdJump = Math.max(0, crowdJump - dt);
  animateCrowd(now / 1000);
  if (state === 'idle') {
    // cámara giratoria detrás del menú
    const a = now / 9000;
    camera.position.set(Math.sin(a) * 20, 9, Math.cos(a) * 20); camera.lookAt(0, 0, 0);
    camera.fov = innerWidth / innerHeight < 1 ? 70 : 50; camera.updateProjectionMatrix();
    ball.x = Math.sin(now / 700) * 3; ball.z = Math.cos(now / 900) * 6; ball.y = 0.2 + Math.abs(Math.sin(now / 300)) * 1.5;
    players.forEach(p => animatePlayer(p, dt));
    ballMesh.position.set(ball.x, ball.y, ball.z); ballShadow.position.set(ball.x, 0.008, ball.z);
    trail.forEach(t => t.visible = false);
    animateLED(dt); updateEffects(dt);
    if (settings.music && !muted && actx) startMusic();
    postRender(dt);
    return;
  }
  stopMusic();
  if (netRole === 'guest') clientTick(dt);
  else if (!paused) {
    if (state === 'replay') updateReplay(dt);
    if (state !== 'over') { acc += dt; while (acc >= STEP) { fixedUpdate(STEP); acc -= STEP; } }
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').style.opacity = 0; }
  if (tipTimer > 0) { tipTimer -= dt; if (tipTimer <= 0) $('tip').classList.remove('on'); }
  if (state === 'intro' && netRole === 'guest') introT += dt;
  updateHint(); updateMeters(dt); updateEnergy(); updateCall(dt);
  renderWorld(paused ? 0 : dt);
  if (netRole === 'host') netTick(dt);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  postResize();
}
addEventListener('resize', resize); resize();

setupPost();
applyVenue();
resetMenuScene();
if (settings.realModels) loadStoredAnims().catch(() => 0).then(() => loadStoredModels()).then(n => { refreshModelList(); refreshAnimList(); if (n) applyRealModels(); }).catch(() => {});
else loadStoredModels().then(refreshModelList).catch(() => {});
refreshScreens();
requestAnimationFrame(frame);

// demostración: index.html#demo (partido entre la IA) · #demo-cerca (cámara cercana) · #demo-dia (de día)
if (location.hash.startsWith('#demo')) setTimeout(() => {
  startExhibition(); players[0].ctrl = 'ai'; buildPlayerMeshes(); skipIntro();
  if (location.hash.includes('cerca')) { camMode = 3; updateCamera(1); }
  if (location.hash.includes('dia')) { settings.venue = 'dia'; applyVenue(); }
}, 200);
