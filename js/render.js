'use strict';
// Repetición, cámara y dibujo de cada cuadro.

// ================== REPETICIÓN ==================
const replay = { frames: [], pending: false, idx: 0, speed: 0.45 };
function recordFrame() {
  const f = { b: [ball.x, ball.y, ball.z, ball.shotSpin], p: players.map(p => { const ik = ikState(p); return [p.x, p.z, p.vx, p.vz, p.swingT, p.swingKind, p.jumpT, ik, p.jumpH]; }),
    h: shotId !== replay.lastShot, ht: rally ? rally.hitter : -1 };
  replay.lastShot = shotId;
  replay.frames.push(f); if (replay.frames.length > 600) replay.frames.shift();
}
function startReplay() {
  replay.pending = false; state = 'replay';
  // empieza unos segundos antes del final
  replay.idx = replay.start = Math.max(0, replay.frames.length - 60 * 6);
  replay.hits = []; replay.frames.forEach((f, i) => { if (f.h && i >= replay.start) replay.hits.push(i); });
  const lastF = replay.frames[replay.frames.length - 1]; replay.team = lastF ? lastF.ht : 0;
  $('replayBadge').classList.remove('hidden'); $('msg').style.opacity = 0;
  players.forEach(p => { p.celebrate = 0; });
  play('whoosh'); emit({ t: 'replay', on: true });
}
function updateReplay(dt) {
  // cámara superlenta cerca de cada golpe, normal (un poco lenta) entre golpes
  const near = replay.hits.reduce((m, h) => Math.min(m, Math.abs(replay.idx - h)), 1e9);
  const slow = near < 16;
  replay.speed = lerp(replay.speed, slow ? 0.12 : 0.55, Math.min(1, dt * 8));
  $('replayBadge').querySelector('b').textContent = slow ? '● SUPERLENTA' : '● REPETICIÓN';
  replay.idx += dt * 60 * replay.speed;
  const i = Math.floor(replay.idx);
  if (i >= replay.frames.length - 1) { endReplay(); return; }
  const f = replay.frames[i], g = replay.frames[i + 1], k = replay.idx - i;
  ball.x = lerp(f.b[0], g.b[0], k); ball.y = lerp(f.b[1], g.b[1], k); ball.z = lerp(f.b[2], g.b[2], k); ball.shotSpin = f.b[3];
  players.forEach((p, j) => {
    const a = f.p[j], c = g.p[j];
    p.x = lerp(a[0], c[0], k); p.z = lerp(a[1], c[1], k); p.vx = a[2] * replay.speed; p.vz = a[3] * replay.speed;
    if (a[4] > 0 && (p.swingT === 0 || a[4] < p.swingT - 0.3)) { p.swingT = a[4]; p.swingKind = a[5]; }
    if (a[6] > 0 && p.jumpT === 0) p.jumpT = a[6];
    p.replayIK = a[7]; p.jumpH = a[8];
  });
}
function endReplay() {
  if (state !== 'replay') return;
  $('replayBadge').classList.add('hidden');
  state = 'pointEnd'; stateTimer = 0.35; replay.frames.length = 0;
  emit({ t: 'replay', on: false });
}

// ================== RENDER ==================
// ---- cámara ----
const camPos = new THREE.Vector3(0, 11, 20), camLook = new THREE.Vector3(0, 0, -1);
let shake = 0, fovPunch = 0;
function camFx(s, punch) { if (!settings.camFx) return; shake = Math.max(shake, s); fovPunch = Math.max(fovPunch, punch); }
function focusPlayer() { return localHumans()[0] || (netRole === 'guest' ? players[guestIdx] : null) || players[0]; }
function updateCamera(dt) {
  const portrait = innerWidth / innerHeight < 1;
  let pos, look, fov, k = Math.min(1, dt * 3);
  if (state === 'replay') {
    // dos ángulos: primero detrás del que definió el punto, después lateral bajo siguiendo la pelota
    const f = (replay.idx - replay.start) / Math.max(1, replay.frames.length - replay.start);
    if (f < 0.5) { const s = replay.team === 1 ? -1 : 1; pos = new THREE.Vector3(1.8, 1.6, s * 12.2); look = new THREE.Vector3(ball.x * 0.7, ball.y * 0.6 + 0.4, ball.z); fov = portrait ? 66 : 42; }
    else { pos = new THREE.Vector3(-7.4, 2.2, clamp(ball.z * 0.75, -9, 9)); look = new THREE.Vector3(ball.x * 0.5, 0.9, ball.z); fov = portrait ? 72 : 48; }
    k = Math.min(1, dt * 3);
  } else if (state === 'intro') {
    const t = clamp(introT / 5, 0, 1), e = t * t * (3 - 2 * t), a = -1.2 + e * 1.2;
    pos = new THREE.Vector3(Math.sin(a) * 24, lerp(16, portrait ? 19 : 10.5, e), Math.cos(a) * lerp(24, portrait ? 22 : 19.5, e));
    look = new THREE.Vector3(0, 0, lerp(0, -1.2, e)); fov = portrait ? 58 : 50; k = 1;
  } else if (camMode === 0) {
    // cámara de transmisión: acompaña la pelota con algo de retraso y se acerca cuando el juego está en el fondo
    const bz = clamp(ball.z, -10, 10);
    pos = portrait ? new THREE.Vector3(ball.x * 0.15, 19, 22) : new THREE.Vector3(ball.x * 0.3, 10.5, 19.5 + bz * 0.06);
    look = portrait ? new THREE.Vector3(ball.x * 0.1, 0, -0.5) : new THREE.Vector3(ball.x * 0.28, 0.3, -1.2 + bz * 0.12);
    fov = portrait ? 58 : 50 - clamp(-bz - 3, 0, 6) * 0.45;
    k = Math.min(1, dt * 2);
  } else if (camMode === 1) {
    const u = focusPlayer(), s = u.team === 0 ? 1 : -1;
    pos = new THREE.Vector3(u.x * 0.6, portrait ? 6 : 4.2, s * clamp(Math.abs(u.z) + 6.5, 9, 16));
    look = new THREE.Vector3(u.x * 0.3, 1, -s * 9 + u.z * 0.2);
    fov = portrait ? 70 : 58;
  } else if (camMode === 3) {
    // cámara cercana de TV: sigue a tu jugador desde un costado
    const u = focusPlayer(), s = u.team === 0 ? 1 : -1;
    pos = new THREE.Vector3(clamp(u.x - 2.4, -4.5, 4.5), 1.7, s * clamp(Math.abs(u.z) + 3.0, 2, 9.5));
    look = new THREE.Vector3(u.x * 0.8 + ball.x * 0.2, 1.1, u.z - s * 1.5);
    fov = portrait ? 62 : 45; k = Math.min(1, dt * 4);
  } else {
    pos = new THREE.Vector3(portrait ? -22 : -17, portrait ? 13 : 9, 0);
    look = new THREE.Vector3(0, 0, 0); fov = portrait ? 75 : 48;
  }
  // el invitado online que juega del otro lado ve la pista desde su fondo
  if (typeof camFlipped === 'function' && camFlipped() && state !== 'replay') { pos.x *= -1; pos.z *= -1; look.x *= -1; look.z *= -1; }
  camPos.lerp(pos, k); camLook.lerp(look, k);
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 0.8); }
  camera.lookAt(camLook);
  camera.fov = fov - fovPunch; fovPunch = Math.max(0, fovPunch - dt * 10);
  camera.updateProjectionMatrix();
}

function renderWorld(dt) {
  players.forEach(p => animatePlayer(p, dt));
  ballMesh.position.set(ball.x, Math.max(ball.y, 0.05), ball.z);
  // la pelota gira según su velocidad y su efecto
  ballMesh.rotation.x += (ball.vz * 9 + (ball.shotSpin || 0) * 25 * Math.sign(ball.vz || 1)) * dt;
  ballMesh.rotation.z -= ball.vx * 9 * dt;
  animateLED(dt);
  ballShadow.position.set(ball.x, 0.008, ball.z);
  ballShadow.material.opacity = clamp(0.5 - ball.y * 0.08, 0.12, 0.5);
  ballShadow.scale.setScalar(1 + ball.y * 0.15);
  // estela (naranja = liftado, celeste = cortado)
  const live = state === 'rally' || state === 'pointEnd' || state === 'replay';
  if (live) { trailPos.unshift([ball.x, ball.y, ball.z]); if (trailPos.length > 16) trailPos.pop(); } else trailPos.length = 0;
  trail.forEach((t, i) => { const p = trailPos[i * 2]; t.visible = !!p; if (p) t.position.set(p[0], Math.max(p[1], 0.05), p[2]); });
  const tc = (ball.shotSpin || 0) > 0.3 ? 0xffb347 : (ball.shotSpin || 0) < -0.3 ? 0x7fd7ff : 0xeaff6a;
  if (trail[0].material.color.getHex() !== tc) trail.forEach(t => t.material.color.setHex(tc));
  // marcador de bote para el equipo con humanos
  const showMk = settings.assist && state === 'rally' && plan.landing && rally && rally.bounces === 0 && teamOf(plan.team).some(p => viewCtrl(p));
  marker.visible = !!showMk;
  if (showMk) { marker.position.x = plan.landing.x; marker.position.z = plan.landing.z; marker.scale.setScalar(1 + 0.15 * Math.sin(simTime * 10)); }
  // aro: verde lima cuando la pelota es tuya
  for (const p of players) if (p.ring) p.ring.material.color.setHex(state === 'rally' && plan.who === p ? 0xd6f542 : RING_COLORS[viewCtrl(p)] || 0xffffff);
  updateCamera(dt);
  updateEffects(dt);
  postRender(dt);
}

