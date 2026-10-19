'use strict';
// ================== EFECTOS ==================
// Marcas y polvo en los botes, sombras de contacto, estela de la pala, rótulos de TV y sonido de pasos.

// ---- marcas del bote y polvo de arena ----
const markTex = canvasTex(64, 64, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(235,225,200,0.9)'); g.addColorStop(0.6, 'rgba(220,205,170,0.35)'); g.addColorStop(1, 'rgba(220,205,170,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
const dustTex = canvasTex(32, 32, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(225,212,180,0.8)'); g.addColorStop(1, 'rgba(225,212,180,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
});
const marks = [], dust = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.24), new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false, opacity: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.007; m.visible = false; m.life = 0; scene.add(m); marks.push(m);
}
for (let i = 0; i < 48; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; s.life = 0; s.vel = new THREE.Vector3(); scene.add(s); dust.push(s);
}
let markIdx = 0, dustIdx = 0;
function fxBounce(e) {
  if (!e.inside) return;
  const m = marks[markIdx++ % marks.length];
  m.position.set(e.x, 0.007, e.z); m.rotation.z = Math.atan2(ball.vx, ball.vz); m.life = 2.6; m.visible = true;
  m.scale.setScalar(clamp(e.imp / 6, 0.6, 1.4));
  const n = e.surf === 'arena' ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const s = dust[dustIdx++ % dust.length];
    s.position.set(e.x + rnd(-0.05, 0.05), 0.04, e.z + rnd(-0.05, 0.05));
    s.vel.set(rnd(-0.5, 0.5) + ball.vx * 0.05, rnd(0.4, 1.0) * clamp(e.imp / 5, 0.5, 1.5), rnd(-0.5, 0.5) + ball.vz * 0.05);
    s.life = s.maxLife = rnd(0.5, 0.9); s.visible = true; s.scale.setScalar(0.1);
  }
}

// ---- sombras de contacto bajo los pies (para que no parezcan flotar) ----
const blobTex = canvasTex(64, 64, (x, w, h) => {
  const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.5, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
});
const blobs = players.map(() => {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5 }));
  b.rotation.x = -Math.PI / 2; b.position.y = 0.006; scene.add(b); return b;
});

// ---- estela de la pala en los golpes fuertes ----
const TRAIL_N = 12, TRAILS_ON = false;
const trails = players.map(() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(TRAIL_N * 2 * 3), col = new Float32Array(TRAIL_N * 2 * 3), idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 }));
  mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  return { mesh, samples: [], fade: 0 };
});
const _ta = new THREE.Vector3(), _tb = new THREE.Vector3();
function updateTrails(dt) {
  players.forEach((p, i) => {
    const tr = trails[i], m = p.mesh;
    // desactivada: con personajes reales se veía como triángulos blancos alrededor del jugador
    const fast = TRAILS_ON && p.active && m && p.swingT > 0 && p.swingKind !== 'serve';
    if (fast) {
      m.paddle.localToWorld(_ta.set(0, -0.15, 0)); m.paddle.localToWorld(_tb.set(0, -0.41, 0));
      tr.samples.unshift([_ta.x, _ta.y, _ta.z, _tb.x, _tb.y, _tb.z]); if (tr.samples.length > TRAIL_N) tr.samples.pop();
      tr.fade = 1;
    } else { tr.fade = Math.max(0, tr.fade - dt * 4); if (tr.fade === 0) tr.samples.length = 0; }
    tr.mesh.visible = tr.samples.length > 2 && tr.fade > 0;
    if (!tr.mesh.visible) return;
    const pos = tr.mesh.geometry.attributes.position, col = tr.mesh.geometry.attributes.color;
    for (let k = 0; k < TRAIL_N; k++) {
      const s = tr.samples[Math.min(k, tr.samples.length - 1)];
      pos.setXYZ(k * 2, s[0], s[1], s[2]); pos.setXYZ(k * 2 + 1, s[3], s[4], s[5]);
      const a = (1 - k / TRAIL_N) * tr.fade * (k < tr.samples.length ? 1 : 0) * 0.8;
      col.setXYZ(k * 2, a, a, a * 0.9); col.setXYZ(k * 2 + 1, a * 0.5, a * 0.5, a * 0.45);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  });
}

// ---- rótulos de TV: velocidad del golpe y nombre del ganador ----
let speedTimer = 0, lowerTimer = 0;
function fxShot(pl, shot, spd) {
  if (shot === 'serve' || shot === 'smash' || shot === 'x3' || shot === 'vibora') {
    const kmh = Math.round(spd * 3.6);
    tvSpeed(`${SHOT_NAMES[shot]} · ${pl.name}`, kmh);
  }
}
function tvSpeed(label, kmh) {
  const el = $('tvSpeed'); el.innerHTML = `<span>${label}</span><b>${kmh}<small> km/h</small></b>`; el.classList.add('on'); speedTimer = 2.2;
  emit({ t: 'tvs', l: label, k: kmh });
}
function tvLower(title, sub) {
  const el = $('tvLower'); el.innerHTML = `<b>${title}</b><span>${sub}</span>`; el.classList.add('on'); lowerTimer = 2.8;
  emit({ t: 'tvl', a: title, b: sub });
}
function fxPointWon(winner, reason, kind) {
  if (!rally || !rally.by || rally.by.team !== winner) return;
  if (kind === 'winner' || kind === 'ace') tvLower(rally.by.name, `${SHOT_NAMES[rally.shot] || ''} GANADOR${pointShots > 6 ? ` · ${pointShots} GOLPES` : ''}`);
}

// ---- pasos y chirridos de zapatillas ----
const _cam = new THREE.Vector3();
function audioFootsteps(dt) {
  if (!actx || muted || !(state === 'rally' || state === 'pointEnd')) return;
  camera.getWorldPosition(_cam);
  for (const p of players) {
    if (!p.active) continue;
    const vol = clamp(7 / Math.hypot(p.x - _cam.x, 1.5 - _cam.y, p.z - _cam.z), 0.08, 1);
    const sp = Math.hypot(p.vx, p.vz);
    const pv = p._pv || { x: p.vx, z: p.vz };
    const acc = Math.hypot(p.vx - pv.x, p.vz - pv.z) / Math.max(dt, 1e-3);
    p._pv = { x: p.vx, z: p.vz };
    p._sq = Math.max(0, (p._sq || 0) - dt);
    if (acc > 22 && sp > 2 && p._sq === 0) { sfx.squeak(vol); p._sq = 0.5; }
    const step = Math.floor(p.phase / Math.PI);
    if (sp > 1.4 && step !== p._step) sfx.step(vol * Math.min(1, sp / 5));
    p._step = step;
  }
}

function updateEffects(dt) {
  for (const m of marks) if (m.visible) { m.life -= dt; m.material.opacity = clamp(m.life / 2.6, 0, 1) * 0.45; if (m.life <= 0) m.visible = false; }
  for (const s of dust) if (s.visible) {
    s.life -= dt; if (s.life <= 0) { s.visible = false; continue; }
    s.vel.y -= 1.2 * dt; s.position.addScaledVector(s.vel, dt);
    const k = s.life / s.maxLife; s.material.opacity = k * 0.55; s.scale.setScalar(0.1 + (1 - k) * 0.25);
  }
  players.forEach((p, i) => {
    const b = blobs[i]; b.visible = p.active && !!p.mesh;
    if (!b.visible) return;
    const lift = p.mesh ? Math.max(0, p.mesh.hips.position.y - 0.93) : 0;
    b.position.set(p.x, 0.006, p.z); b.scale.setScalar(1 - lift * 0.8); b.material.opacity = 0.5 * (1 - lift * 1.5);
  });
  updateTrails(dt);
  if (speedTimer > 0) { speedTimer -= dt; if (speedTimer <= 0) $('tvSpeed').classList.remove('on'); }
  if (lowerTimer > 0) { lowerTimer -= dt; if (lowerTimer <= 0) $('tvLower').classList.remove('on'); }
  audioFootsteps(dt);
}
