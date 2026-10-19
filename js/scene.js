'use strict';
// ================== THREE: RENDER Y CALIDAD ==================
const QUALITY = {
  alta:  { ratio: 2,   shadow: 2048, env: true,  crowd: 1.0,  glow: true,  aniso: 8, post: true,  dof: true,  msaa: 4 },
  media: { ratio: 1.5, shadow: 1024, env: true,  crowd: 0.6,  glow: true,  aniso: 4, post: true,  dof: false, msaa: 2 },
  baja:  { ratio: 1,   shadow: 1024, env: false, crowd: 0.35, glow: false, aniso: 1, post: false, dof: false, msaa: 0 },
};
const Q = () => QUALITY[settings.quality] || QUALITY.media;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q().ratio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.physicallyCorrectLights = false;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x05080f, 40, 120);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = Q().aniso; t.encoding = THREE.sRGBEncoding;
  t.userData = { canvas: c, ctx }; return t;
}
const FONT = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
const std = (color, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));
const reflective = []; // materiales que reciben el mapa de reflejos del estadio

// ---- optimización: fusiona las mallas hermanas que comparten material (menos llamadas de dibujo) ----
function concatGeometries(geos) {
  const hasUV = geos.every(g => g.attributes.uv);
  let n = 0; geos.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = hasUV ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
function optimizeTree(root) {
  const parents = []; root.traverse(o => { if (o.children && o.children.length > 1) parents.push(o); });
  for (const par of parents) {
    const byMat = new Map();
    for (const c of par.children) {
      if (!c.isMesh || c.isInstancedMesh || Array.isArray(c.material) || c.children.length || c.userData.keep) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []); byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map(m => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      const mesh = new THREE.Mesh(concatGeometries(geos), mat);
      mesh.castShadow = list.some(m => m.castShadow); mesh.receiveShadow = list.some(m => m.receiveShadow);
      list.forEach(m => par.remove(m)); par.add(mesh);
    }
  }
}

// ================== LUCES ==================
const hemi = new THREE.HemisphereLight(0xb8ccff, 0x10141c, 0.35); scene.add(hemi);
const amb = new THREE.AmbientLight(0x404a60, 0.1); scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff6ea, 1.05);
sun.position.set(4, 22, 9); sun.castShadow = true;
sun.shadow.mapSize.set(Q().shadow, Q().shadow);
Object.assign(sun.shadow.camera, { left: -8.5, right: 8.5, top: 13.5, bottom: -13.5, near: 8, far: 45 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
// focos del estadio: cuatro reflectores sobre la pista
const spots = [];
for (const [x, z] of [[-7.5, -12.2], [7.5, -12.2], [-7.5, 12.2], [7.5, 12.2]]) {
  const s = new THREE.SpotLight(0xe8f0ff, 0.42, 45, 0.62, 0.75, 1.2);
  s.position.set(x, 11, z); s.target.position.set(x * 0.25, 0, z * 0.3);
  scene.add(s); scene.add(s.target); spots.push(s);
}

// ================== CIELO ==================
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x02040a) }, mid: { value: new THREE.Color(0x0a1220) }, bottom: { value: new THREE.Color(0x05080f) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0)); gl_FragColor = vec4(c, 1.0); }',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMat); scene.add(sky);

// ================== SUELO ==================
const groundTex = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#3a3f47'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 6000; i++) { const v = 50 + Math.random() * 30; x.fillStyle = `rgba(${v},${v + 3},${v + 8},${Math.random() * 0.5})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(24, 28);
const outer = new THREE.Mesh(new THREE.PlaneGeometry(90, 100), std(0x9aa0a8, { map: groundTex, roughness: 0.95 }));
outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true; scene.add(outer);
// tarima de la pista
const platform = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.08, 21.4), std(0x1a2236, { roughness: 0.7 }));
platform.position.y = -0.055; platform.receiveShadow = true; scene.add(platform);

// ---- césped sintético ----
// Textura generada: fibras con variación de tono + arena + mapa de relieve.
const turfTex = canvasTex(512, 512, () => {});
const turfBump = canvasTex(512, 512, () => {}); turfBump.encoding = THREE.LinearEncoding;
[turfTex, turfBump].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 10); });
function paintTurf(hexColor) {
  const c = new THREE.Color(hexColor), hsl = {}; c.getHSL(hsl);
  const { ctx: x, canvas: cv } = turfTex.userData, { ctx: b } = turfBump.userData, W = cv.width;
  x.fillStyle = hexColor; x.fillRect(0, 0, W, W); b.fillStyle = '#808080'; b.fillRect(0, 0, W, W);
  for (let i = 0; i < 70000; i++) {
    const px = Math.random() * W, py = Math.random() * W, len = 1.5 + Math.random() * 3.5, ang = Math.random() * Math.PI * 2;
    const l = clamp(hsl.l + (Math.random() - 0.5) * 0.16, 0, 1);
    x.strokeStyle = `hsla(${hsl.h * 360},${hsl.s * 100 * rnd(0.85, 1.05)}%,${l * 100}%,0.85)`; x.lineWidth = 1;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
    const g = Math.floor(90 + Math.random() * 120); b.strokeStyle = `rgb(${g},${g},${g})`;
    b.beginPath(); b.moveTo(px, py); b.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); b.stroke();
  }
  for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${200 + rnd(0, 40)},${180 + rnd(0, 30)},${130 + rnd(0, 30)},${rnd(0.15, 0.4)})`; x.fillRect(Math.random() * W, Math.random() * W, 1.2, 1.2); }
  turfTex.needsUpdate = true; turfBump.needsUpdate = true;
}
const courtMat = new THREE.MeshStandardMaterial({ map: turfTex, bumpMap: turfBump, bumpScale: 0.02, roughness: 0.97, metalness: 0, color: 0xdddddd });
const court = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), courtMat);
court.rotation.x = -Math.PI / 2; court.receiveShadow = true; scene.add(court);
// desgaste: zonas más claras donde más se pisa (detrás de la línea de saque y cerca de la red)
const wearTex = canvasTex(128, 256, (x, w, h) => {
  x.clearRect(0, 0, w, h);
  const blob = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  for (const sy of [1, -1]) {
    for (const sx of [-1, 1]) { blob(w / 2 + sx * w * 0.24, h / 2 + sy * h * 0.42, 34, 0.16); blob(w / 2 + sx * w * 0.22, h / 2 + sy * h * 0.2, 26, 0.1); }
    blob(w / 2, h / 2 + sy * h * 0.45, 30, 0.08);
  }
});
const wear = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), new THREE.MeshStandardMaterial({ map: wearTex, transparent: true, depthWrite: false, roughness: 1 }));
wear.rotation.x = -Math.PI / 2; wear.position.y = 0.002; wear.receiveShadow = true; scene.add(wear);
// sombra suave al pie de las paredes (oclusión)
const aoTex = canvasTex(8, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false });
function aoStrip(len, x, z, rot) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), aoMat); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.004, z); scene.add(m); }
aoStrip(10, 0, 9.75, 0); aoStrip(10, 0, -9.75, Math.PI); aoStrip(20, 4.75, 0, Math.PI / 2); aoStrip(20, -4.75, 0, -Math.PI / 2);

// líneas
const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 0.85 });
function line(x, z, w, d) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.005, z); m.receiveShadow = true; scene.add(m); }
line(0, SERVICE, 10, 0.05); line(0, -SERVICE, 10, 0.05); line(0, 0, 0.05, SERVICE * 2 + 0.4);

const floorLogo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0.22, depthWrite: false,
  map: canvasTex(512, 96, (x, w, h) => { x.fillStyle = '#fff'; x.font = `800 78px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PÁDEL ARENA', w / 2, h / 2 + 4); })
}));
floorLogo.rotation.x = -Math.PI / 2; floorLogo.position.set(0, 0.006, 2.6); scene.add(floorLogo);

// ================== RED ==================
const netTex = canvasTex(64, 64, (x, w, h) => {
  x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(18,18,18,0.95)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, w - 3, h - 3);
  x.fillStyle = 'rgba(10,10,10,1)'; for (const [a, b] of [[0, 0], [w, 0], [0, h], [w, h]]) { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill(); }
});
netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(100, 9);
const netH = x => NET_H + 0.04 * (x / 5) * (x / 5); // la red cae un poco en el centro
const netGeo = new THREE.PlaneGeometry(10, 1, 40, 1);
{ const p = netGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) > 0 ? netH(x) - 0.03 : 0.02); } netGeo.computeVertexNormals(); }
const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, alphaTest: 0.05 }));
scene.add(net);
const bandGeo = new THREE.PlaneGeometry(10, 0.055, 40, 1);
{ const p = bandGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, netH(x) + p.getY(i) - 0.01); } }
const band = new THREE.Mesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 })); band.castShadow = true; scene.add(band);
const postNetMat = std(0x1d232c, { metalness: 0.7, roughness: 0.35 }); reflective.push(postNetMat);
for (const s of [-1, 1]) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 12), postNetMat); p.position.set(s * 5.06, 0.475, 0); p.castShadow = true; scene.add(p);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.1), postNetMat); crank.position.set(s * 5.06, 0.75, 0.06); scene.add(crank);
}

// ================== PAREDES ==================
// cristal templado: casi transparente, con reflejos del estadio y canto verdoso
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.12,
  clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.5, side: THREE.DoubleSide, depthWrite: false });
reflective.push(glassMat);
const glassEdgeMat = new THREE.MeshStandardMaterial({ color: 0x9fd8c4, transparent: true, opacity: 0.55, roughness: 0.2 });
const metalMat = std(0x161a20, { metalness: 0.65, roughness: 0.38 }); reflective.push(metalMat);
const clampMat = std(0xb8bec8, { metalness: 0.9, roughness: 0.25 }); reflective.push(clampMat);
const meshTex = canvasTex(64, 64, (x, w, h) => {
  x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(30,34,40,1)'; x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, w - 3, h - 3);
});
meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
function glassPanel(w, h, x, y, z, rotY) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY;
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), glassMat));
  for (const [ew, eh, ex, ey] of [[w, 0.014, 0, h / 2], [w, 0.014, 0, -h / 2], [0.014, h, w / 2, 0], [0.014, h, -w / 2, 0]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(ew, eh, 0.012), glassEdgeMat); e.position.set(ex, ey, 0); g.add(e);
  }
  // herrajes que sujetan el cristal a los postes
  for (const sx of [-1, 1]) for (const sy of [-0.38, 0.38]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.03), clampMat); c.position.set(sx * (w / 2 - 0.035), sy * h, 0); g.add(c);
  }
  scene.add(g);
}
function fence(w, h, x, y, z, rotY) {
  const t = meshTex.clone(); t.needsUpdate = true; t.repeat.set(w / 0.05, h / 0.05);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, metalness: 0.5, roughness: 0.5 }));
  m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
}
function post(x, z, h) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), metalMat); p.position.set(x, h / 2, z); p.castShadow = true; scene.add(p); }
function rail(len, x, y, z, rotY) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), metalMat); r.position.set(x, y, z); r.rotation.y = rotY; scene.add(r); }
for (const s of [-1, 1]) {
  for (let i = 0; i < 5; i++) glassPanel(2, 3, -4 + i * 2, 1.5, s * HZ, 0);
  fence(10, 1, 0, 3.5, s * HZ, 0);
  for (let x = -5; x <= 5; x += 2) post(x, s * HZ, 4);
  rail(10, 0, 4, s * HZ, 0); rail(10, 0, 3.02, s * HZ, 0);
  for (const sx of [-1, 1]) {
    glassPanel(2, 3, sx * HX, 1.5, s * 9, Math.PI / 2);
    glassPanel(2, 3, sx * HX, 1.5, s * 7, Math.PI / 2);
    fence(4, 1, sx * HX, 3.5, s * 8, Math.PI / 2);
    for (const z of [10, 8, 6, 4, 2]) post(sx * HX, s * z, z >= 6 ? 4 : 3);
  }
}
for (const sx of [-1, 1]) {
  fence(12, 3, sx * HX, 1.5, 0, Math.PI / 2); post(sx * HX, 0, 3);
  rail(12, sx * HX, 3, 0, Math.PI / 2); rail(4, sx * HX, 4, 8, Math.PI / 2); rail(4, sx * HX, 4, -8, Math.PI / 2);
  rail(4, sx * HX, 3.02, 8, Math.PI / 2); rail(4, sx * HX, 3.02, -8, Math.PI / 2);
  rail(12, sx * HX, 0.03, 0, Math.PI / 2);
}

// lonas en la base del cristal de fondo
const bannerTex = canvasTex(1024, 52, () => {});
function paintBanner(text) {
  const { ctx: x, canvas: c } = bannerTex.userData;
  const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#13285e'); g.addColorStop(1, '#0a1838');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#ffffff'; x.font = `700 34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) x.fillText(text, c.width * (i + 0.5) / 3, c.height / 2 + 2);
  bannerTex.needsUpdate = true;
}
paintBanner('EXHIBICIÓN');
for (const s of [-1, 1]) {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(9.9, 0.5), new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.7 }));
  b.position.set(0, 0.95, s * (HZ - 0.02)); scene.add(b);
}

// ================== ESTADIO ==================
let crowd = null, crowdSeats = [], crowdJump = 0;
const lamps = [], glows = [];
const standMat = std(0x262b36, { roughness: 0.95 });
(function buildStands() {
  const seats = [];
  const density = Q().crowd;
  for (const s of [-1, 1]) {
    for (let r = 0; r < 11; r++) {
      const z = s * (12.9 + r * 0.9), y = 0.45 + r * 0.55;
      const step = new THREE.Mesh(new THREE.BoxGeometry(27, y * 2, 0.9), standMat); step.position.set(0, 0, z); step.receiveShadow = true; scene.add(step);
      for (let x = -13; x <= 13; x += 0.56) seats.push({ x, y, z, rot: s > 0 ? Math.PI : 0, row: r });
    }
    for (let r = 0; r < 11; r++) {
      const x = s * (8.9 + r * 0.9), y = 0.45 + r * 0.55;
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, y * 2, 24.6), standMat); step.position.set(x, 0, 0); step.receiveShadow = true; scene.add(step);
      for (let z = -12; z <= 12; z += 0.56) seats.push({ x, y, z, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2, row: r });
    }
  }
  // butacas de plástico (todas) y espectadores (según la densidad de calidad)
  const seatGeo = new THREE.BoxGeometry(0.44, 0.42, 0.06); seatGeo.translate(0, 0.21, -0.18);
  const seatIM = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), seats.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  seats.forEach((st, i) => {
    q.setFromEuler(e.set(0, st.rot, 0)); m.compose(v.set(st.x, st.y, st.z), q, one); seatIM.setMatrixAt(i, m);
    c.setHex((st.row % 4 === 3) ? 0xd6dbe4 : 0x1f5fbf).multiplyScalar(rnd(0.8, 1)); seatIM.setColorAt(i, c);
  });
  scene.add(seatIM);
  const people = seats.filter(() => Math.random() < 0.82 * density);
  const torsoGeo = new THREE.CylinderGeometry(0.15, 0.17, 0.5, 7); torsoGeo.translate(0, 0.25, 0);
  const headGeo = new THREE.SphereGeometry(0.1, 7, 5); headGeo.translate(0, 0.6, 0);
  const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.42, 6); armGeo.translate(0, -0.21, 0);
  const legGeo = new THREE.BoxGeometry(0.3, 0.14, 0.42); legGeo.translate(0, 0.03, 0.12);
  const lam = () => new THREE.MeshLambertMaterial();
  const torso = new THREE.InstancedMesh(torsoGeo, lam(), people.length);
  const head = new THREE.InstancedMesh(headGeo, lam(), people.length);
  const legs = new THREE.InstancedMesh(legGeo, lam(), people.length);
  const arms = new THREE.InstancedMesh(armGeo, lam(), people.length * 2);
  const CLOTHES = [0xd23b3b, 0x2f6fd8, 0xf2f2f2, 0x1d1d1d, 0xffd23f, 0x2ecc71, 0xff7a00, 0x7b3fe4, 0x23c4d6, 0x8a8f98, 0xe86fa6];
  people.forEach((p, i) => {
    p.base = p.y + 0.06; p.ph = Math.random() * 6.28; p.fan = Math.random() < 0.5;
    c.setHex(pick(CLOTHES)).multiplyScalar(rnd(0.6, 1)); torso.setColorAt(i, c);
    c.setHex(SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]); head.setColorAt(i, c);
    arms.setColorAt(i * 2, c); arms.setColorAt(i * 2 + 1, c);
    c.setHex(pick([0x2a3550, 0x1d1d1d, 0x5a4a3a, 0x3d5a80])); legs.setColorAt(i, c);
  });
  [torso, head, legs, arms].forEach(im => scene.add(im));
  crowd = { torso, head, legs, arms, people };
  crowdSeats = people;
  poseCrowd(0, 0);
  // torres de iluminación y focos
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowTex = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(220,235,255,0.6)'); g.addColorStop(1, 'rgba(200,220,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  for (const [x, z] of [[-7.5, -12.2], [7.5, -12.2], [-7.5, 12.2], [7.5, 12.2], [0, -13.4], [-9.4, 0], [9.4, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 11, 8), metalMat); pole.position.set(x, 5.5, z); scene.add(pole);
    const head2 = new THREE.Group(); head2.position.set(x, 11, z); head2.lookAt(0, 0, 0); scene.add(head2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.25), metalMat); head2.add(box);
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), lampMat); l.position.set(-0.4 + i * 0.4, 0, 0.13); head2.add(l); lamps.push(l); }
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, fog: false }));
    gl.position.set(x, 11, z); gl.scale.set(4.5, 4.5, 1); scene.add(gl); glows.push(gl);
  }
  // techo: cerchas sobre las gradas
  const trussMat = std(0x10141b, { roughness: 0.7 });
  for (const s of [-1, 1]) {
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.4), trussMat); t1.position.set(0, 13.5, s * 23); scene.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 46), trussMat); t2.position.set(s * 19, 13.5, 0); scene.add(t2);
  }
})();
// pose del público: sentados, o saltando con los brazos arriba cuando celebran
function poseCrowd(t, energy) {
  const { torso, head, legs, arms, people } = crowd;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), qa = new THREE.Quaternion();
  people.forEach((p, i) => {
    const jump = energy > 0 ? Math.max(0, Math.sin(t * 9 + p.ph)) * 0.25 * Math.min(1, energy) : 0;
    const standing = energy > 0.3 && p.fan;
    const y = p.base + jump + (standing ? 0.25 : 0);
    q.setFromEuler(e.set(0, p.rot, 0));
    m.compose(v.set(p.x, y, p.z), q, one); torso.setMatrixAt(i, m); head.setMatrixAt(i, m);
    m.compose(v.set(p.x, p.base, p.z), q, one); legs.setMatrixAt(i, m);
    const up = energy > 0 && (p.fan || energy > 1);
    for (const side of [-1, 1]) {
      const local = new THREE.Vector3(side * 0.19, 0.46, 0).applyQuaternion(q);
      qa.setFromEuler(e.set(up ? 0 : 0.15, p.rot, up ? side * (2.7 + Math.sin(t * 12 + p.ph) * 0.2) : side * 0.18, 'YXZ'));
      m.compose(v.set(p.x + local.x, y + local.y, p.z + local.z), qa, one); arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m);
    }
  });
  [torso, head, legs, arms].forEach(im => { im.instanceMatrix.needsUpdate = true; });
}
let crowdStill = false;
function animateCrowd(t) {
  if (!crowd) return;
  if (crowdJump <= 0) { if (!crowdStill) { poseCrowd(t, 0); crowdStill = true; } return; }
  crowdStill = false;
  if (Math.floor(t * 30) === crowd._lastF) return; crowd._lastF = Math.floor(t * 30); // 30 fps alcanza
  poseCrowd(t, crowdJump);
}

// ---- carteles LED alrededor de la pista ----
const ledTex = canvasTex(2048, 64, (x, w, h) => {
  const ads = [['PÁDEL ARENA', '#d6f542', '#0b1a10'], ['BANDEJA TOUR', '#ffffff', '#c8102e'], ['VÍBORA SPORTS', '#0b0b0b', '#ffd23f'], ['SMASH 3X', '#ffffff', '#1f5fbf'], ['GRIP PRO', '#ffffff', '#111111'], ['CRISTAL WATER', '#0b2a4a', '#8fd3ff']];
  const seg = w / ads.length;
  ads.forEach(([t, fg, bg], i) => {
    x.fillStyle = bg; x.fillRect(i * seg, 0, seg, h);
    x.fillStyle = fg; x.font = `800 44px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, i * seg + seg / 2, h / 2 + 2);
  });
  // patrón de píxeles LED
  x.fillStyle = 'rgba(0,0,0,0.18)'; for (let yy = 0; yy < h; yy += 3) x.fillRect(0, yy, w, 1);
});
ledTex.wrapS = THREE.RepeatWrapping;
const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false });
for (const s of [-1, 1]) {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(26, 0.85), ledMat); b.position.set(0, 0.52, s * 12.42); b.rotation.y = s > 0 ? Math.PI : 0; scene.add(b);
  const f = new THREE.Mesh(new THREE.BoxGeometry(26.2, 0.95, 0.12), metalMat); f.position.set(0, 0.52, s * 12.5); scene.add(f);
  const b2 = new THREE.Mesh(new THREE.PlaneGeometry(24.4, 0.85), ledMat); b2.position.set(s * 8.42, 0.52, 0); b2.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(b2);
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 24.6), metalMat); f2.position.set(s * 8.5, 0.52, 0); scene.add(f2);
}
function animateLED(dt) { ledTex.offset.x = (ledTex.offset.x + dt * 0.03) % 1; }

// ---- banquillos y silla del juez ----
(function benches() {
  const benchMat = std(0x2b3342, { roughness: 0.6 }), chairMat = std(0x1f5fbf, { roughness: 0.5 }), towelMat = std(0xffffff, { roughness: 1 });
  for (const z of [-1.6, 1.6]) {
    const g = new THREE.Group(); g.position.set(-6.7, 0, z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.6), benchMat); top.position.y = 0.45; g.add(top);
    for (const dz of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), benchMat); leg.position.set(0, 0.22, dz); g.add(leg); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 1.6), chairMat); back.position.set(-0.25, 0.7, 0); g.add(back);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.4), towelMat); towel.position.set(0.02, 0.49, -0.4); g.add(towel);
    for (const dz of [0.3, 0.45]) { const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), std(0x8fd3ff, { transparent: true, opacity: 0.8, roughness: 0.1 })); bottle.position.set(0.15, 0.58, dz); g.add(bottle); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
  }
  const chair = new THREE.Group(); chair.position.set(6.6, 0, 0);
  for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), metalMat); l.position.set(dx, 0.8, dz); chair.add(l); }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), benchMat); seat.position.y = 1.62; chair.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.6), chairMat); back.position.set(0.28, 1.9, 0); chair.add(back);
  chair.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(chair);
})();

// ---- videomarcador ----
const boardTex = canvasTex(512, 160, () => {});
const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.8), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
board.position.set(0, 9.6, -19.5); scene.add(board);
const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(9.3, 3.1, 0.2), metalMat); boardFrame.position.set(0, 9.6, -19.62); scene.add(boardFrame);

// ================== AMBIENTACIÓN ==================
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
// Entorno simplificado para los reflejos (cristal, metal, palas): estadio oscuro con focos brillantes.
function makeEnvScene() {
  const day = settings.venue === 'dia', es = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60), new THREE.MeshBasicMaterial({ color: day ? 0x9cc4ea : 0x0d1320, side: THREE.BackSide }));
  box.position.y = 12; es.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: day ? 0x6f8a6a : 0x1a2a55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.5; es.add(floor);
  const stands = new THREE.MeshBasicMaterial({ color: day ? 0x8a8f98 : 0x2a2f3c });
  for (const [x, z, w, d] of [[0, 25, 50, 6], [0, -25, 50, 6], [25, 0, 6, 50], [-25, 0, 6, 50]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 10, d), stands); m.position.set(x, 3, z); es.add(m); }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, z] of [[-10, -14], [10, -14], [-10, 14], [10, 14], [0, -16], [-14, 0], [14, 0]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 3), lightMat); l.position.set(x, day ? 25 : 14, z); es.add(l);
  }
  return es;
}
function buildEnvMap() {
  if (envRT) { envRT.dispose(); envRT = null; }
  reflective.forEach(m => { m.envMap = null; m.needsUpdate = true; });
  if (!Q().env) return;
  envRT = pmrem.fromScene(makeEnvScene(), 0.04);
  reflective.forEach(m => { m.envMap = envRT.texture; m.needsUpdate = true; });
}
function applyVenue() {
  paintTurf(COURT_COLORS[settings.court] || COURT_COLORS.azul);
  const day = settings.venue === 'dia';
  if (day) { skyMat.uniforms.top.value.setHex(0x2f6fc4); skyMat.uniforms.mid.value.setHex(0xcfe4f5); skyMat.uniforms.bottom.value.setHex(0x9fb4a0); }
  else { skyMat.uniforms.top.value.setHex(0x01030a); skyMat.uniforms.mid.value.setHex(0x0b1424); skyMat.uniforms.bottom.value.setHex(0x05080f); }
  scene.fog.color.setHex(day ? 0xcfe4f5 : 0x05080f); scene.fog.near = day ? 70 : 40; scene.fog.far = day ? 220 : 120;
  hemi.intensity = day ? 0.62 : 0.24; hemi.color.setHex(day ? 0xdcecff : 0xb8ccff); hemi.groundColor.setHex(day ? 0x56604a : 0x10141c);
  amb.intensity = day ? 0.15 : 0.08;
  sun.intensity = day ? 1.45 : 0.88; sun.color.setHex(day ? 0xfff1d8 : 0xf4f6ff);
  sun.position.set(day ? 12 : 4, day ? 26 : 22, day ? 6 : 9);
  spots.forEach(s => { s.visible = !day; });
  glows.forEach(g => { g.visible = !day && Q().glow; });
  lamps.forEach(l => l.material.color.setHex(day ? 0x8a8f98 : 0xffffff));
  outer.material.color.setHex(day ? 0xa8a296 : 0x50565f);
  renderer.toneMappingExposure = day ? 0.9 : 0.95;
  sky.visible = true;
  buildEnvMap();
}
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q().ratio));
  sun.shadow.mapSize.set(Q().shadow, Q().shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  glows.forEach(g => { g.visible = settings.venue !== 'dia' && Q().glow; });
  buildEnvMap();
  if (typeof setupPost === 'function') setupPost();
}

// ---- pelota ----
const ballMat = new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.85, emissive: 0x2a3200, emissiveIntensity: 0.6 });
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 28, 20), ballMat);
ballMesh.castShadow = true; scene.add(ballMesh);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.008; scene.add(ballShadow);
const trail = [];
for (let i = 0; i < 8; i++) {
  const t = new THREE.Mesh(new THREE.SphereGeometry(0.04 - i * 0.0035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeaff6a, transparent: true, opacity: 0.28 - i * 0.03, depthWrite: false }));
  scene.add(t); trail.push(t);
}
const trailPos = [];
const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xd6f542, transparent: true, opacity: 0.8, depthWrite: false }));
marker.rotation.x = -Math.PI / 2; marker.position.y = 0.01; marker.visible = false; scene.add(marker);

// ---- aros y nombres de los jugadores humanos ----
function makeRing(color) {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false }));
  r.rotation.x = -Math.PI / 2; r.position.y = 0.012; r.visible = false; scene.add(r); return r;
}
function makeNameSprite(name, color) {
  const tex = canvasTex(256, 64, (x, w, h) => {
    x.font = `700 40px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillText(name, w / 2 + 2, h / 2 + 2);
    x.fillStyle = color; x.fillText(name, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 10; scene.add(s); return s;
}

// ---- máquina lanzapelotas y dianas (entrenamiento) ----
const machine = new THREE.Group();
(function () {
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), std(0x2b2f3a, { metalness: 0.4 })); base.position.y = 0.3; base.castShadow = true;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 12), std(0xd6f542)); tube.rotation.x = Math.PI / 2.6; tube.position.set(0, 0.8, 0.2);
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.35, 12), std(0x444b5a)); hopper.position.y = 0.78;
  machine.add(base, tube, hopper);
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), ballMat); b.position.set(rnd(-0.18, 0.18), 0.97, rnd(-0.18, 0.18)); machine.add(b); }
})();
machine.visible = false; scene.add(machine);
const targets = new THREE.Group();
const TARGET_SPOTS = [{ x: -3.2, z: -8.4, r: 1.2 }, { x: 3.2, z: -8.4, r: 1.2 }, { x: 0, z: -2.6, r: 1.1 }];
TARGET_SPOTS.forEach(t => {
  const m = new THREE.Mesh(new THREE.RingGeometry(t.r - 0.12, t.r, 40), new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(t.x, 0.011, t.z); targets.add(m);
  const in2 = new THREE.Mesh(new THREE.CircleGeometry(t.r - 0.12, 40), new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.12, depthWrite: false }));
  in2.rotation.x = -Math.PI / 2; in2.position.set(t.x, 0.01, t.z); targets.add(in2);
});
targets.visible = false; scene.add(targets);

// todo lo estático ya está armado: fusionar
[ballMesh, ballShadow, marker, court, wear, sky].forEach(m => { m.userData.keep = true; });
optimizeTree(scene);
