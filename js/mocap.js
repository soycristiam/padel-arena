'use strict';
// ================== ANIMACIONES CAPTURADAS (Mixamo) ==================
// Capturas de movimiento reales para correr, retroceder, desplazarse de costado, esperar y festejar.
// Se mezclan con el esqueleto del juego: piernas y cadera salen de la captura cuando el jugador se mueve
// (o cuando festeja, todo el cuerpo); brazos y torso siguen siendo los del juego para que la pala toque la pelota.
const MOCAP_TAGS = [
  ['back', /backward|atras/], ['sl', /left\s*strafe|lateral_izq/], ['sr', /right\s*strafe|lateral_der/],
  ['run', /running|correr/], ['idle', /idle/], ['win', /victory|victoria/], ['lose', /defeated|derrota/],
];
const MOCAP_SPEED = { run: 4.6, back: 3.0, sl: 3.6, sr: 3.6 };   // velocidad (m/s) a la que la captura se ve natural
const realAnims = {};   // tag -> AnimationClip
const mocapTag = name => { const n = name.toLowerCase(); const t = MOCAP_TAGS.find(([, re]) => re.test(n)); return t ? t[0] : null; };

async function parseAnim(name, buf) {
  const tag = mocapTag(name); if (!tag) throw new Error('No reconozco qué animación es (el nombre debe incluir idle, running, backward, left/right strafe, victory o defeated).');
  await ensureLoaders('fbx');
  const root = new THREE.FBXLoader().parse(buf, '');
  const clip = root.animations && root.animations[0];
  if (!clip) throw new Error('El archivo no trae animación.');
  clip.name = tag;
  return { tag, clip };
}
async function addAnimFile(file) {
  const data = await file.arrayBuffer();
  const a = await parseAnim(file.name, data);
  await idbPut({ name: 'anim:' + a.tag, file: file.name, data });
  realAnims[a.tag] = a.clip;
  return a.tag;
}
async function loadStoredAnims() {
  for (const r of await idbAll()) {
    if (!r.name.startsWith('anim:')) continue;
    try { const a = await parseAnim(r.file, r.data); realAnims[a.tag] = a.clip; } catch (e) { console.warn(e); }
  }
  return Object.keys(realAnims).length;
}
async function removeAnims() { for (const r of await idbAll()) if (r.name.startsWith('anim:')) await idbDel(r.name); for (const k in realAnims) delete realAnims[k]; }

// ---- por jugador ----
const _mcV = new THREE.Vector3();
const LEG_BONES = ['rightupleg', 'rightleg', 'rightfoot', 'righttoebase', 'leftupleg', 'leftleg', 'leftfoot', 'lefttoebase'];
function setupMocap(K) {
  if (!Object.keys(realAnims).length) return;
  const bones = K.rigs[0].bones;
  const mixer = new THREE.AnimationMixer(K.root);
  const actions = {};
  for (const [tag, clip] of Object.entries(realAnims)) {
    // las pistas apuntan a los huesos del esqueleto principal por su id (los nombres pueden repetirse entre esqueletos)
    const tracks = [];
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.'), node = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
      const b = bones[normBone(node.split('/').pop())];
      if (!b) continue;
      if (prop === 'quaternion') { const t = tr.clone(); t.name = b.uuid + '.quaternion'; tracks.push(t); }
    }
    if (!tracks.length) continue;
    const c = new THREE.AnimationClip(tag, clip.duration, tracks);
    const a = mixer.clipAction(c); a.setLoop(tag === 'win' || tag === 'lose' ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true;
    a.enabled = true; a.setEffectiveWeight(0); a.play();
    actions[tag] = a;
  }
  // pose de reposo de los huesos que maneja el juego (torso, hombros, cabeza, cadera)
  const restQ = new Map();
  for (const n of ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'leftshoulder', 'rightshoulder']) if (bones[n]) restQ.set(n, bones[n].quaternion.clone());
  K.mocap = { mixer, actions, w: { idle: 1 }, full: 0, legs: 0, hipsW: 0, snap: new Map(), restQ, celebrating: false };
}
// Antes del esqueleto del juego: avanza la captura y guarda su pose
function mocapBefore(p, K, dt) {
  const M = K.mocap; if (!M) return;
  const A = M.actions, sp = Math.hypot(p.vx, p.vz);
  const lat = p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw);   // + = hacia la izquierda del jugador
  const fwd = p.vx * Math.sin(p.yaw) + p.vz * Math.cos(p.yaw);
  const celebrating = p.celebrate > 0 && (state === 'pointEnd' || state === 'over') && (p.celebrateWin ? A.win : A.lose);
  // pesos objetivo
  const tgt = { idle: 0, run: 0, back: 0, sl: 0, sr: 0, win: 0, lose: 0 };
  if (celebrating) tgt[p.celebrateWin ? 'win' : 'lose'] = 1;
  else {
    const mv = clamp((sp - 0.4) / 1.8, 0, 1);
    tgt.idle = 1 - mv;
    const ax = Math.abs(lat), az = Math.abs(fwd), tot = ax + az || 1;
    tgt[fwd >= 0 ? 'run' : 'back'] = mv * az / tot;
    tgt[lat >= 0 ? 'sl' : 'sr'] += mv * ax / tot;
  }
  // si falta alguna animación, su peso pasa a la de correr (o a la de espera)
  for (const k of Object.keys(tgt)) if (!A[k] && tgt[k] > 0) { const alt = (k !== 'idle' && A.run) ? 'run' : 'idle'; if (A[alt]) tgt[alt] += tgt[k]; tgt[k] = 0; }
  // festejo: arranca la animación desde el principio
  if (celebrating && !M.celebrating) { const a = A[p.celebrateWin ? 'win' : 'lose']; a.reset(); a.play(); }
  M.celebrating = !!celebrating;
  let sum = 0; const k = Math.min(1, dt * 8);
  for (const key of Object.keys(tgt)) { M.w[key] = lerp(M.w[key] || 0, tgt[key], k); sum += M.w[key]; }
  for (const [key, a] of Object.entries(A)) {
    a.setEffectiveWeight(sum > 0 ? (M.w[key] || 0) / sum : 0);
    if (MOCAP_SPEED[key]) a.setEffectiveTimeScale(clamp(sp / MOCAP_SPEED[key], 0.6, 1.7));
  }
  M.mixer.update(dt);
  // cuánto mandan las capturas: piernas al correr hacia adelante o atrás (el paso lateral corto es el del juego,
  // la carrera lateral capturada solo en desplazamientos muy rápidos); nunca en el impacto, el salto o el split step
  const special = (p.contact && Math.abs(simTime - p.contact.t) < 0.25) || p.jumpT > 0 || p.splitT > 0 || p.swingT > 0 && p.swingKind === 'over';
  const axv = Math.abs(lat), azv = Math.abs(fwd), totv = axv + azv || 1;
  const runPart = azv / totv + (axv / totv) * clamp((sp - 4.3) / 0.8, 0, 1);
  M.legs = lerp(M.legs, special ? 0 : clamp((sp - 0.6) / 1.6, 0, 1) * runPart, k);
  M.full = lerp(M.full, celebrating ? 1 : 0, Math.min(1, dt * 5));
  // guardar la pose capturada
  const bones = K.rigs[0].bones;
  for (const [name, b] of Object.entries(bones)) {
    let s = M.snap.get(b); if (!s) { s = new THREE.Quaternion(); M.snap.set(b, s); }
    s.copy(b.quaternion);
  }
  // torso, hombros y cabeza vuelven a reposo: los maneja el juego (si no, la curvatura capturada se suma a la del juego)
  for (const [n, q] of M.restQ) if (bones[n]) bones[n].quaternion.copy(q);
  // la cadera toma la rotación capturada solo mientras corre (inclinación y balanceo de la carrera)
  if (bones.hips) bones.hips.quaternion.slerp(M.snap.get(bones.hips), M.legs * 0.8);
}
// Después del esqueleto del juego: mezcla piernas (al moverse) o todo el cuerpo (al festejar) con la captura
function mocapAfter(K) {
  const M = K.mocap; if (!M) return;
  const bones = K.rigs[0].bones;
  if (M.full > 0.01) {
    for (const [name, b] of Object.entries(bones)) { if (/hand(thumb|index|middle|ring|pinky)/.test(name)) continue; { const q = M.snap.get(b); if (isFinite(q.x + q.w)) b.quaternion.slerp(q, M.full); } }
  } else if (M.legs > 0.01) {
    for (const n of LEG_BONES) { const b = bones[n]; const q = b && M.snap.get(b); if (q && isFinite(q.x + q.w)) b.quaternion.slerp(q, M.legs); }
  }
  K.root.updateMatrixWorld(true);
  // apoyo: la cadera baja (o sube) para que el pie más bajo quede en el piso
  const w = Math.max(M.legs, M.full);
  if (w > 0.01 && bones.hips && bones.leftfoot && bones.rightfoot) {
    const yl = bones.leftfoot.getWorldPosition(_mcV).y, yr = bones.rightfoot.getWorldPosition(_mcV).y;
    const d = (0.085 - Math.min(yl, yr)) * w;
    if (Math.abs(d) > 0.002) {
      const hp = bones.hips.getWorldPosition(_mcV); hp.y += d;
      bones.hips.position.copy(bones.hips.parent.worldToLocal(hp));
      K.root.updateMatrixWorld(true);
    }
  }
}
