'use strict';
// ================== MODELOS 3D REALES (opcional) ==================
// Permite usar personajes descargados (GLB/GLTF o FBX con esqueleto tipo Mixamo).
// No hace falta que traigan animaciones: el juego "retargetea" su propio esqueleto animado (con el
// contacto exacto de la pala) sobre los huesos del personaje, orientando cada hueso hacia la articulación siguiente.
// Los archivos se guardan en el navegador (IndexedDB) para no tener que cargarlos cada vez.
const CDN_EX = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
const SAMPLE_MODEL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Xbot.glb';
const realModels = [];   // { name, template, scale, lift }
const scriptCache = {};
function loadScript(url) {
  if (!scriptCache[url]) scriptCache[url] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + url)); document.head.appendChild(s); });
  return scriptCache[url];
}
async function ensureLoaders(kind) {
  await loadScript(CDN_EX + 'utils/SkeletonUtils.js');
  if (kind === 'fbx') { await loadScript(CDN_EX + 'libs/fflate.min.js'); await loadScript(CDN_EX + 'loaders/FBXLoader.js'); }
  else await loadScript(CDN_EX + 'loaders/GLTFLoader.js');
}

// ---- almacenamiento (IndexedDB) ----
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('padelArena', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models', { keyPath: 'name' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbAll() { const db = await idb(); return new Promise(res => { const q = db.transaction('models').objectStore('models').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); }
async function idbPut(rec) { const db = await idb(); return new Promise(res => { const t = db.transaction('models', 'readwrite'); t.objectStore('models').put(rec); t.oncomplete = res; t.onerror = res; }); }
async function idbDel(name) { const db = await idb(); return new Promise(res => { const t = db.transaction('models', 'readwrite'); t.objectStore('models').delete(name); t.oncomplete = res; t.onerror = res; }); }

// ---- carga y preparación ----
const normBone = n => n.toLowerCase().replace(/^mixamorig\d*[:_]?/, '').replace(/[^a-z0-9]/g, '');
async function parseModel(name, buf) {
  const kind = /\.fbx$/i.test(name) ? 'fbx' : 'gltf';
  await ensureLoaders(kind);
  let root;
  if (kind === 'fbx') root = new THREE.FBXLoader().parse(buf, '');
  else root = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', g => res(g.scene), rej));
  const bones = {}; let skinned = false;
  root.traverse(o => { if (o.isBone) bones[normBone(o.name)] = true; if (o.isSkinnedMesh) skinned = true; });
  if (!skinned || !bones.hips || !bones.rightforearm || !bones.leftupleg) throw new Error('El modelo no tiene un esqueleto humano compatible (Mixamo).');
  // la altura sale de los huesos (la caja de la malla no siempre refleja el tamaño real de un personaje con esqueleto)
  root.updateMatrixWorld(true);
  const bw = {}; root.traverse(o => { if (o.isBone) bw[normBone(o.name)] = o.getWorldPosition(new THREE.Vector3()); });
  const footY = Math.min(bw.leftfoot ? bw.leftfoot.y : 0, bw.rightfoot ? bw.rightfoot.y : 0);
  const headY = (bw.head || bw.neck).y;
  const h = (headY - footY) / 0.84;              // la cabeza (base del cráneo) está ~84% por encima del tobillo
  const scale = 1.8 / (h > 0 ? h : 1.8);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  return { name, template: root, scale, lift: 0.08 - footY * scale };
}
async function loadStoredModels() {
  realModels.length = 0;
  const recs = await idbAll();
  for (const r of recs) { if (r.name.startsWith('anim:')) continue; try { realModels.push(await parseModel(r.name, r.data)); } catch (e) { console.warn(e); } }
  return realModels.length;
}
async function addModelFile(file) {
  const data = await file.arrayBuffer();
  const m = await parseModel(file.name, data);   // valida antes de guardar
  await idbPut({ name: file.name, data });
  realModels.push(m);
}
async function addSampleModel() {
  const r = await fetch(SAMPLE_MODEL); if (!r.ok) throw new Error('No se pudo descargar el modelo de ejemplo');
  const data = await r.arrayBuffer(), name = 'maniqui-ejemplo.glb';
  const m = await parseModel(name, data); await idbPut({ name, data }); realModels.push(m);
}
async function removeModel(name) { await idbDel(name); const i = realModels.findIndex(m => m.name === name); if (i >= 0) realModels.splice(i, 1); }

// ---- aplicar a un jugador ----
const CHAINS = [ // [hueso, hueso hijo, articulación A, articulación B] (A→B del esqueleto procedural)
  ['spine', 'neck', 'spineBase', 'neckBase'],
  ['neck', 'head', 'neckBase', 'headTop'],
  ['rightarm', 'rightforearm', 'armR', 'elbowR'], ['rightforearm', 'righthand', 'elbowR', 'wristR'],
  ['leftarm', 'leftforearm', 'armL', 'elbowL'], ['leftforearm', 'lefthand', 'elbowL', 'wristL'],
  ['rightupleg', 'rightleg', 'legR', 'kneeR'], ['rightleg', 'rightfoot', 'kneeR', 'ankleR'],
  ['leftupleg', 'leftleg', 'legL', 'kneeL'], ['leftleg', 'leftfoot', 'kneeL', 'ankleL'],
];
// largos de los huesos del esqueleto animado del juego (para que manos y pies caigan exactamente donde deben)
const LIMB = { rightarm: 0.29, rightforearm: 0.26, leftarm: 0.29, leftforearm: 0.26, rightupleg: 0.43, rightleg: 0.42, leftupleg: 0.43, leftleg: 0.42 };
const FINGER_RE = /^(right|left)hand(thumb|index|middle|ring|pinky)(\d)$/;
function buildRig(bones, holder) {
  holder.updateMatrixWorld(true);
  // largos de brazos y piernas iguales a los del juego
  const wa = new THREE.Vector3(), wb = new THREE.Vector3();
  for (const [b, c] of CHAINS) {
    if (!LIMB[b] || !bones[b] || !bones[c] || bones[c].parent !== bones[b]) continue;
    bones[b].getWorldPosition(wa); bones[c].getWorldPosition(wb);
    const L = wa.distanceTo(wb); if (L > 1e-4) bones[c].position.multiplyScalar(LIMB[b] / L);
    holder.updateMatrixWorld(true);
  }
  const rest = {};
  for (const [b, c] of CHAINS) {
    const bone = bones[b], child = bones[c];
    if (!bone || !child) continue;
    // dirección en reposo hacia la articulación siguiente (puede haber huesos intermedios, ej. spine1/spine2)
    rest[b] = { q: bone.quaternion.clone(), dir: bone.worldToLocal(child.getWorldPosition(new THREE.Vector3())).normalize() };
  }
  // eje de giro en reposo: hacia dónde mira la rodilla (adelante) y hacia dónde sale el codo al doblarse (atrás)
  const qi = new THREE.Quaternion();
  const toLocal = (bone, v) => v.clone().applyQuaternion(bone.getWorldQuaternion(qi).invert());
  for (const b of ['rightupleg', 'rightleg', 'leftupleg', 'leftleg']) if (rest[b]) rest[b].ref = toLocal(bones[b], new THREE.Vector3(0, 0, 1));
  for (const b of ['rightarm', 'rightforearm', 'leftarm', 'leftforearm']) if (rest[b]) rest[b].ref = toLocal(bones[b], new THREE.Vector3(0, 0, -1));
  // pie: apunta del tobillo a la punta, con la planta hacia abajo
  const feet = {};
  for (const side of ['right', 'left']) {
    const foot = bones[side + 'foot'], toe = bones[side + 'toebase'];
    if (!foot || !toe) continue;
    const fw = toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())).normalize();
    rest[side + 'foot'] = { q: foot.quaternion.clone(), dir: foot.worldToLocal(toe.getWorldPosition(new THREE.Vector3())).normalize(), ref: toLocal(foot, new THREE.Vector3(0, 1, 0)) };
    feet[side] = fw;   // en el espacio del modelo (mirando a +z)
    const tend = bones[side + 'toeend'];
    // dirección de los dedos: hacia el hueso de la punta, o (si el modelo no lo tiene) la misma línea del pie
    const toeDir = tend ? toe.worldToLocal(tend.getWorldPosition(new THREE.Vector3())).normalize() : toLocal(toe, fw);
    rest[side + 'toebase'] = { q: toe.quaternion.clone(), dir: toeDir, ref: toLocal(toe, new THREE.Vector3(0, 1, 0)) };
  }
  // dedos: se cierran hacia la palma; la palma se deduce de la posición del pulgar respecto del dedo medio
  // (funciona aunque el personaje no esté en pose T)
  const fingers = []; let grip = null;
  const qw = new THREE.Quaternion(), wp = o => o.getWorldPosition(new THREE.Vector3());
  for (const side of ['right', 'left']) {
    const hand = bones[side + 'hand'], mid = bones[side + 'handmiddle1'], th = bones[side + 'handthumb1'];
    if (!hand || !mid || !th) continue;
    const fdir = wp(mid).sub(wp(hand)).normalize();
    const thumbSide = wp(th).sub(wp(mid)); thumbSide.addScaledVector(fdir, -thumbSide.dot(fdir)).normalize();
    const palm = new THREE.Vector3().crossVectors(fdir, thumbSide).multiplyScalar(side === 'right' ? -1 : 1);
    if (side === 'right') grip = { palm: palm.clone().applyQuaternion(hand.getWorldQuaternion(qw).invert()) };
    for (const [name, b] of Object.entries(bones)) {
      const f = name.match(FINGER_RE); if (!f || f[1] !== side) continue;
      // segmento siguiente por nombre (los hijos pueden ser copias del otro esqueleto en el mismo lugar)
      const seg0 = +f[3], base = side + 'hand' + f[2];
      const next = bones[base + (seg0 + 1)], prev = seg0 > 1 ? bones[base + (seg0 - 1)] : hand;
      const dir = next ? wp(next).sub(wp(b)) : wp(b).sub(wp(prev));
      if (dir.lengthSq() < 1e-12) continue;
      dir.normalize();
      const thumb = f[2] === 'thumb';
      const axis = new THREE.Vector3().crossVectors(dir, thumb ? fdir : palm);
      if (axis.lengthSq() < 1e-8) continue;
      axis.normalize().applyQuaternion(b.getWorldQuaternion(qw).invert());
      const seg = +f[3], right = side === 'right';
      const ang = thumb ? (seg === 1 ? 0.25 : 0.4) : (right ? ([0, 1.2, 1.4, 1.0][seg] || 1.0) : ([0, 0.45, 0.55, 0.4][seg] || 0.4));
      fingers.push({ b, q: b.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)) });
    }
  }
  return { bones, rest, fingers, grip, feet };
}
function attachRealModel(p) {
  if (p.skin) { scene.remove(p.skin.root); p.skin = null; }
  if (!settings.realModels || !realModels.length || !p.mesh || !THREE.SkeletonUtils) return;
  const M = realModels[p.id % realModels.length];
  const root = THREE.SkeletonUtils.clone(M.template);
  const holder = new THREE.Group(); holder.add(root); root.scale.setScalar(M.scale); root.position.y = M.lift;
  scene.add(holder);
  // Los FBX de Mixamo pueden traer un esqueleto por cada malla (cuerpo, botines, pelo…), a veces anidados y a
  // veces incompletos. Se elige el más completo ("maestro") y todas las mallas se vuelven a atar a sus huesos
  // (con sus propias matrices de enlace): así se anima un solo esqueleto y todas las partes lo siguen.
  const skels = [];
  root.traverse(o => { if (o.isSkinnedMesh && !skels.includes(o.skeleton)) skels.push(o.skeleton); });
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const maps = skels.map(sk => { const mp = {}; sk.bones.forEach(b => { mp[normBone(b.name)] = b; }); return mp; });
  const best = maps.filter(mp => mp.hips).sort((a, b) => (Object.keys(b).length - Object.keys(a).length) || (depth(a.hips) - depth(b.hips)))[0];
  if (!best) { scene.remove(holder); return; }
  // esqueleto completo: se recorre la jerarquía real desde la cadera (las mallas pueden no usar todos los huesos,
  // por ejemplo el cuerpo sin vértebras ni puntas de pie) y se toma un hueso por nombre, el menos profundo
  let topHips = best.hips; for (let o = topHips.parent; o; o = o.parent) if (o.isBone && normBone(o.name) === 'hips') topHips = o;
  const masterMap = {}, queue = [topHips];
  while (queue.length) { const b = queue.shift(); const k = normBone(b.name); if (!masterMap[k]) masterMap[k] = b; b.children.forEach(c => { if (c.isBone) queue.push(c); }); }
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const bones = o.skeleton.bones.map(b => masterMap[normBone(b.name)] || b);
    o.bind(new THREE.Skeleton(bones, o.skeleton.boneInverses.map(m => m.clone())), o.bindMatrix);
  });
  const follow = [];
  const masterList = Object.values(masterMap).sort((a, b) => depth(a) - depth(b));
  const rigs = [buildRig(masterMap, holder)];
  const restPose = masterList.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  follow.forEach(f => { f.rest = [f.b.position.clone(), f.b.quaternion.clone(), f.b.scale.clone()]; });
  p.skin = { root: holder, rigs, follow, masterList, restPose, bones: rigs[0].bones };
  if (typeof setupMocap === 'function') setupMocap(p.skin);   // animaciones capturadas (si se cargaron)
  // el esqueleto procedural queda invisible (sigue animando y sosteniendo la pala)
  p.mesh.group.traverse(o => { if (o.isMesh) { o.visible = false; o.castShadow = false; } });
  p.mesh.paddle.traverse(o => { if (o.isMesh) { o.visible = true; o.castShadow = true; } });
}
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rd = new THREE.Vector3(), _rr = new THREE.Vector3();
const _iS = new THREE.Vector3(), _iW = new THREE.Vector3(), _iP = new THREE.Vector3(), _iE = new THREE.Vector3(), _iPole = new THREE.Vector3(), _iD = new THREE.Vector3();
function jointPos(m, key, out) {
  switch (key) {
    case 'spineBase': return m.spine.getWorldPosition(out);
    case 'neckBase': return m.spine.localToWorld(out.set(0, 0.5, 0));
    case 'headTop': return m.head.localToWorld(out.set(0, 0.14, 0.01));
    case 'wristR': return m.elbowR.localToWorld(out.set(0, -0.26, 0));
    case 'wristL': return m.elbowL.localToWorld(out.set(0, -0.26, 0));
    case 'ankleR': return m.kneeR.localToWorld(out.set(0, -0.42, 0));
    case 'ankleL': return m.kneeL.localToWorld(out.set(0, -0.42, 0));
    default: return m[key].getWorldPosition(out);
  }
}
// orienta un hueso para que apunte de A a B
function aimBone(S, b, A, B) {
  const bone = S.bones[b], R = S.rest[b]; if (!bone || !R) return;
  _rd.subVectors(B, A); if (_rd.lengthSq() < 1e-10) return; _rd.normalize();
  bone.parent.getWorldQuaternion(_rq).invert(); _rd.applyQuaternion(_rq);
  _rr.copy(R.dir).applyQuaternion(R.q);
  _rq2.setFromUnitVectors(_rr, _rd).multiply(R.q);
  if (!isFinite(_rq2.x + _rq2.y + _rq2.z + _rq2.w)) return;   // caso degenerado: se deja como estaba
  bone.quaternion.copy(_rq2);
  bone.updateMatrixWorld(true);
}
// como aimBone pero además controla el giro del hueso sobre su eje: su eje de referencia apunta hacia refW
const _bm1 = new THREE.Matrix4(), _bm2 = new THREE.Matrix4(), _bx = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()), _bq = new THREE.Quaternion();
function basisFrom(m4, a, b, X, Y, Z) { X.copy(a); Y.copy(b).addScaledVector(a, -a.dot(b)).normalize(); Z.crossVectors(X, Y); return m4.makeBasis(X, Y, Z); }
function aimBone2(S, b, A, B, refW) {
  const bone = S.bones[b], R = S.rest[b]; if (!bone || !R) return;
  if (!R.ref || !refW) { aimBone(S, b, A, B); return; }
  const [d, r, dr, rr, , ] = _bx;
  d.subVectors(B, A); if (d.lengthSq() < 1e-10) return; d.normalize();
  bone.parent.getWorldQuaternion(_rq).invert();
  d.applyQuaternion(_rq); r.copy(refW).applyQuaternion(_rq);
  if (Math.abs(r.dot(d)) > 0.995) { aimBone(S, b, A, B); return; }
  dr.copy(R.dir).applyQuaternion(R.q); rr.copy(R.ref).applyQuaternion(R.q);
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  basisFrom(_bm1, d, r, X, Y, Z);
  const X2 = new THREE.Vector3(), Y2 = new THREE.Vector3(), Z2 = new THREE.Vector3();
  basisFrom(_bm2, dr, rr, X2, Y2, Z2);
  _bm1.multiply(_bm2.transpose());                       // rotación que lleva la base de reposo a la deseada
  _bq.setFromRotationMatrix(_bm1).multiply(R.q);
  if (!isFinite(_bq.x + _bq.y + _bq.z + _bq.w)) { aimBone(S, b, A, B); return; }
  bone.quaternion.copy(_bq);
  bone.updateMatrixWorld(true);
}
// brazo o pierna de dos huesos: la mano / el pie llegan exactamente al punto del esqueleto del juego
function limbIK(S, m, upper, lower, jointKey, endKey, a, b, fallback) {
  if (!S.bones[upper] || !S.bones[lower]) return;
  const Sp = S.bones[upper].getWorldPosition(new THREE.Vector3());
  const W = jointPos(m, endKey, new THREE.Vector3()), P = jointPos(m, jointKey, _iP);
  const d = _iD.subVectors(W, Sp); let L = d.length(); if (L < 1e-4) return;
  d.multiplyScalar(1 / L); L = clamp(L, Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _iPole.subVectors(P, Sp); _iPole.addScaledVector(d, -_iPole.dot(d));
  if (_iPole.lengthSq() < 1e-6) _iPole.copy(fallback).addScaledVector(d, -fallback.dot(d)); // pierna o brazo estirado
  _iPole.normalize();
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const E = new THREE.Vector3().copy(Sp).addScaledVector(d, x).addScaledVector(_iPole, h);
  const pole = _iPole.clone();
  aimBone2(S, upper, Sp, E, pole);
  aimBone2(S, lower, S.bones[lower].getWorldPosition(new THREE.Vector3()), W, pole);
}
const _fm = new THREE.Matrix4();
const badT = b => !isFinite(b.quaternion.x + b.quaternion.y + b.quaternion.z + b.quaternion.w + b.position.x + b.position.y + b.position.z + b.scale.x + b.scale.y + b.scale.z);
function sanitizeSkin(K) {
  let fixed = false;
  K.follow.forEach(f => { if (badT(f.b)) { f.b.position.copy(f.rest[0]); f.b.quaternion.copy(f.rest[1]); f.b.scale.copy(f.rest[2]); fixed = true; } });
  K.masterList.forEach((b, i) => { if (badT(b)) { b.position.copy(K.restPose[i][0]); b.quaternion.copy(K.restPose[i][1]); b.scale.copy(K.restPose[i][2]); fixed = true; } });
  if (fixed) K.root.updateMatrixWorld(true);
}
function retargetPlayer(p, dt = 1 / 60) {
  const K = p.skin, m = p.mesh; if (!K) return;
  K.root.visible = p.active; if (!p.active) return;
  K.root.position.set(p.x, 0, p.z); K.root.rotation.y = p.yaw;
  m.group.updateMatrixWorld(true); K.root.updateMatrixWorld(true);
  sanitizeSkin(K);
  if (K.mocap) mocapBefore(p, K, dt);
  for (const S of K.rigs) poseRig(S, m);
  if (K.mocap) mocapAfter(K);
  // saneo: si algún cálculo dejó un hueso inválido, vuelve a su pose de reposo (nunca se propaga)
  sanitizeSkin(K);

  // el mango de la pala pasa por adentro del puño del personaje
  const S = K.rigs[0];
  if (S && S.grip && S.bones.righthandmiddle1) {
    const h = S.bones.righthand.getWorldPosition(new THREE.Vector3()), mid = S.bones.righthandmiddle1.getWorldPosition(new THREE.Vector3());
    const palm = S.grip.palm.clone().applyQuaternion(S.bones.righthand.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const fist = h.lerp(mid, 0.7).addScaledVector(palm, 0.03);
    m.wristR.updateMatrixWorld(true);
    m.paddle.position.copy(m.wristR.worldToLocal(fist));
  }
}
function poseRig(S, m) {
  // cadera en el mismo lugar que la del esqueleto animado (agacharse, saltar)
  const hips = S.bones.hips;
  hips.parent.updateMatrixWorld(true);
  hips.position.copy(hips.parent.worldToLocal(m.hips.getWorldPosition(new THREE.Vector3())));
  hips.updateMatrixWorld(true);
  aimBone(S, 'spine', jointPos(m, 'spineBase', new THREE.Vector3()), jointPos(m, 'neckBase', new THREE.Vector3()));
  aimBone(S, 'neck', jointPos(m, 'neckBase', new THREE.Vector3()), jointPos(m, 'headTop', new THREE.Vector3()));
  const yaw = m.group.rotation.y, fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), back = fwd.clone().negate();
  limbIK(S, m, 'rightarm', 'rightforearm', 'elbowR', 'wristR', LIMB.rightarm, LIMB.rightforearm, back);
  limbIK(S, m, 'leftarm', 'leftforearm', 'elbowL', 'wristL', LIMB.leftarm, LIMB.leftforearm, back);
  limbIK(S, m, 'rightupleg', 'rightleg', 'kneeR', 'ankleR', LIMB.rightupleg, LIMB.rightleg, fwd);
  limbIK(S, m, 'leftupleg', 'leftleg', 'kneeL', 'ankleL', LIMB.leftupleg, LIMB.leftleg, fwd);
  // pies planos apuntando hacia donde mira el jugador (con la leve apertura natural de cada pie)
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of ['right', 'left']) {
    const fd = S.feet && S.feet[side], foot = S.bones[side + 'foot']; if (!fd || !foot) continue;
    const A = foot.getWorldPosition(new THREE.Vector3());
    const L = S.bones[side + 'toebase'] ? S.bones[side + 'toebase'].getWorldPosition(new THREE.Vector3()).distanceTo(A) : 0.14;
    const h = new THREE.Vector3(fd.x, 0, fd.z).normalize().applyAxisAngle(up, yaw + (side === 'right' ? -0.12 : 0.12));
    // en el piso la punta apoya a ~2,5 cm del suelo; en el aire el pie conserva su inclinación natural
    const dy = A.y < 0.3 ? clamp(0.025 - A.y, -0.85 * L, 0.3 * L) : fd.y * L;
    const dir = h.multiplyScalar(Math.sqrt(Math.max(0, L * L - dy * dy))); dir.y = dy;
    aimBone2(S, side + 'foot', A, A.clone().add(dir), up);
    // dedos del pie apoyados en el piso
    const toe = S.bones[side + 'toebase'];
    if (toe && S.rest[side + 'toebase']) { const T = toe.getWorldPosition(new THREE.Vector3()); const hz = new THREE.Vector3(dir.x, 0, dir.z); if (hz.lengthSq() < 1e-8) hz.set(Math.sin(yaw), 0, Math.cos(yaw)); hz.normalize(); aimBone2(S, side + 'toebase', T, T.clone().add(hz), up); }
  }
  for (const f of S.fingers) f.b.quaternion.copy(f.q);   // puño cerrado sobre el mango
  hips.updateMatrixWorld(true);
}
async function rebuildWithModels() {
  for (const p of players) attachRealModel(p);
}
