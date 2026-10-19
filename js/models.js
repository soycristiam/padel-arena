'use strict';
// ================== MODELOS 3D (procedurales) ==================
// Se carga antes que scene.js: estas funciones usan canvasTex/std recién cuando se llaman.
const SKIN_TONES = [0xf1c9a5, 0xe0ac85, 0xd29a72, 0xc68b62, 0xa86f4c, 0x8d5a3b, 0x6b4128];
const HAIR_COLORS = [0x1b1209, 0x2b1d14, 0x4a2f1a, 0x0e0e0e, 0x7a5a32, 0x9b7a4a, 0x3b2a1a];
const HAIR_STYLES = ['corto', 'gorra', 'vincha', 'largo', 'corto', 'rapado'];

// ---- pelota: fieltro amarillo con la costura en "S" ----
function makeBallTexture() {
  return canvasTex(512, 256, (x, W, H) => {
    x.fillStyle = '#d9f23a'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,200,0.25)' : 'rgba(120,140,0,0.18)'; x.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4); }
    // curva de la costura de una pelota de tenis/pádel, proyectada al mapa equirectangular de la esfera
    const a = 0.75, b = 0.25, c = 2 * Math.sqrt(a * b);
    x.fillStyle = 'rgba(250,250,240,0.95)';
    for (let t = 0; t < Math.PI * 2; t += 0.0015) {
      let px = a * Math.cos(t) + b * Math.cos(3 * t), py = a * Math.sin(t) - b * Math.sin(3 * t), pz = c * Math.sin(2 * t);
      const l = Math.hypot(px, py, pz); px /= l; py /= l; pz /= l;
      let phi = Math.atan2(pz, -px); if (phi < 0) phi += Math.PI * 2;
      const u = phi / (Math.PI * 2) * W, v = Math.acos(clamp(py, -1, 1)) / Math.PI * H;
      x.beginPath(); x.arc(u, v, 2.6, 0, 7); x.fill();
    }
  });
}

// ---- pala de pádel: cabeza con agujeros, corazón abierto y mango con cubregrip ----
const paddleCache = {};
function paddleFaceTexture(col) {
  return canvasTex(256, 256, (x, W, H) => {
    const c = new THREE.Color(col), dark = c.clone().multiplyScalar(0.45);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#' + dark.getHexString()); g.addColorStop(0.55, '#' + c.getHexString()); g.addColorStop(1, '#' + dark.getHexString());
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // trama de carbono
    x.globalAlpha = 0.12; x.fillStyle = '#000';
    for (let i = 0; i < W; i += 6) for (let j = 0; j < H; j += 6) if (((i + j) / 6) % 2 === 0) x.fillRect(i, j, 3, 6);
    x.globalAlpha = 1;
    // franjas y marca
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.save(); x.translate(W / 2, H / 2); x.rotate(-0.5);
    x.fillRect(-W, -18, W * 2, 7); x.fillRect(-W, 14, W * 2, 3); x.restore();
    x.fillStyle = '#fff'; x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.fillText('ARENA', W / 2, H * 0.82);
  });
}
function makePaddle(faceCol) {
  const key = faceCol;
  if (!paddleCache[key]) {
    const RX = 0.13, RY = 0.145;
    // contorno y agujeros como polígonos (liviano: pocas decenas de vértices por agujero)
    const shape = new THREE.Shape();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, px = Math.cos(a) * (RX - 0.008), py = Math.sin(a) * (RY - 0.008); i ? shape.lineTo(px, py) : shape.moveTo(px, py); }
    for (let gx = -0.1; gx <= 0.1001; gx += 0.025) for (let gy = -0.11; gy <= 0.1101; gy += 0.025) {
      if ((gx / 0.105) ** 2 + (gy / 0.122) ** 2 > 1 || (Math.abs(gy - 0.015) < 0.02 && Math.abs(gx) < 0.06)) continue;
      const h = new THREE.Path();
      for (let k = 0; k <= 8; k++) { const a = -k / 8 * Math.PI * 2, px = gx + Math.cos(a) * 0.0058, py = gy + Math.sin(a) * 0.0058; k ? h.lineTo(px, py) : h.moveTo(px, py); }
      shape.holes.push(h);
    }
    const geo = new THREE.ShapeGeometry(shape);
    // marco: un toro aplanado siguiendo el borde de la cabeza
    const rim = new THREE.TorusGeometry(1, 0.016 / RX, 8, 56); rim.scale(RX - 0.004, RY - 0.004, RX);
    const faceTex = paddleFaceTexture(faceCol);
    faceTex.repeat.set(1 / (2 * RX), 1 / (2 * RY)); faceTex.offset.set(0.5, 0.5); faceTex.wrapS = faceTex.wrapT = THREE.RepeatWrapping;
    const faceMat = std(0xffffff, { map: faceTex, roughness: 0.35, metalness: 0.1 });
    const frameMat = std(0x121212, { roughness: 0.25, metalness: 0.3 });
    reflective.push(faceMat, frameMat);
    if (envRT) { faceMat.envMap = frameMat.envMap = envRT.texture; }
    const gripTex = canvasTex(32, 64, (x, W, H) => {
      x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, W, H); x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
      for (let i = -H; i < H; i += 8) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i + 14); x.stroke(); }
    });
    gripTex.wrapS = gripTex.wrapT = THREE.RepeatWrapping; gripTex.repeat.set(1, 3);
    paddleCache[key] = { geo, rim, faceMat, frameMat, gripMat: std(0xffffff, { map: gripTex, roughness: 0.9 }) };
  }
  const P = paddleCache[key];
  const g = new THREE.Group();
  const head = new THREE.Group(); head.position.y = -0.275; g.add(head);
  for (const z of [0.0155, -0.0155]) { const f = new THREE.Mesh(P.geo, P.faceMat); f.position.z = z; if (z < 0) f.rotation.y = Math.PI; f.castShadow = true; head.add(f); }
  const rim = new THREE.Mesh(P.rim, P.frameMat); rim.castShadow = true; head.add(rim);
  // corazón: dos brazos desde el mango hasta la cabeza
  for (const s of [-1, 1]) {
    const x0 = 0, y0 = -0.065, x1 = s * 0.06, y1 = -0.15;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, len, 0.032), P.frameMat);
    bar.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); bar.rotation.z = Math.atan2(x1 - x0, -(y1 - y0)) * -1; bar.castShadow = true; g.add(bar);
  }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.13, 10), P.gripMat); grip.position.y = 0; g.add(grip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.021, 0.014, 10), P.frameMat); cap.position.y = 0.068; g.add(cap);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 4, 12), std(0x222222)); cord.position.set(0, 0.1, 0); cord.rotation.y = Math.PI / 2; g.add(cord);
  return g;
}

// ---- camiseta con diseño (UV de torno: u=0 es el frente) ----
function shirtTexture(base, accent, num) {
  return canvasTex(256, 128, (x, W, H) => {
    x.fillStyle = hex(base); x.fillRect(0, 0, W, H);
    // tela: leve ruido
    for (let i = 0; i < 1500; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    // paneles laterales y franja en el pecho
    x.fillStyle = hex(accent);
    x.fillRect(W * 0.22, 0, W * 0.06, H); x.fillRect(W * 0.72, 0, W * 0.06, H);
    x.globalAlpha = 0.9; x.fillRect(0, H * 0.6, W, H * 0.07); x.globalAlpha = 1;
    // logo en el pecho (u≈0, se dibuja en los dos bordes) y número en la espalda (u=0.5)
    x.fillStyle = 'rgba(255,255,255,0.9)';
    x.beginPath(); x.arc(W * 0.04, H * 0.38, 6, 0, 7); x.fill();
    x.fillStyle = hex(accent); x.font = `800 40px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(num), W * 0.5, H * 0.38);
  });
}

// ---- jugador articulado ----
// Mirando a +z; la mano derecha queda en -x. Articulaciones: cadera, rodillas, columna, hombros, codos, cabeza.
function makePlayerMesh(o) {
  const skinM = std(o.skin, { roughness: 0.62 });
  const shirtM = std(0xffffff, { map: shirtTexture(o.shirt, o.accent, o.number || 7), roughness: 0.72 });
  const shortsM = std(o.shorts, { roughness: 0.78 });
  const shoeM = std(o.shoe, { roughness: 0.45 }), soleM = std(0xf4f4f4, { roughness: 0.7 }), sockM = std(0xf7f7f7, { roughness: 0.9 });
  const hairM = std(o.hair, { roughness: 0.9 });
  const mk = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const g = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.93; g.add(hips);

  // ---- piernas ----
  const legs = [], knees = [], ankles = [];
  for (const sx of [1, -1]) { // [izq, der]
    const leg = new THREE.Group(); leg.position.set(sx * 0.095, -0.02, 0); hips.add(leg);
    const thigh = new THREE.CylinderGeometry(0.07, 0.054, 0.43, 12); thigh.translate(0, -0.215, 0);
    mk(thigh, skinM, leg);
    const shortLeg = new THREE.CylinderGeometry(0.088, 0.083, 0.22, 12); shortLeg.translate(0, -0.08, 0);
    mk(shortLeg, shortsM, leg);
    const knee = new THREE.Group(); knee.position.y = -0.43; leg.add(knee);
    mk(new THREE.SphereGeometry(0.054, 10, 8), skinM, knee);
    const shin = new THREE.CylinderGeometry(0.052, 0.038, 0.42, 12); shin.translate(0, -0.21, 0);
    mk(shin, skinM, knee);
    const calf = mk(new THREE.SphereGeometry(0.05, 10, 8), skinM, knee, 0, -0.13, -0.018); calf.scale.set(1, 1.7, 1);
    const sock = new THREE.CylinderGeometry(0.043, 0.041, 0.1, 10); sock.translate(0, -0.37, 0); mk(sock, sockM, knee);
    const ankle = new THREE.Group(); ankle.position.y = -0.42; knee.add(ankle);
    mk(new THREE.BoxGeometry(0.1, 0.075, 0.24), shoeM, ankle, 0, -0.02, 0.04);
    const toe = mk(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10, 1, false, 0, Math.PI), shoeM, ankle, 0, -0.02, 0.16); toe.rotation.z = Math.PI / 2; toe.scale.set(0.75, 1, 0.8);
    mk(new THREE.BoxGeometry(0.11, 0.025, 0.27), soleM, ankle, 0, -0.065, 0.045);
    legs.push(leg); knees.push(knee); ankles.push(ankle);
  }
  // pelvis (short)
  const pelvis = new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.06), new THREE.Vector2(0.175, -0.06), new THREE.Vector2(0.18, 0.04), new THREE.Vector2(0.165, 0.12), new THREE.Vector2(0.001, 0.12)], 18);
  const pel = mk(pelvis, shortsM, hips); pel.scale.set(1, 1, 0.78);

  // ---- torso ----
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  const torsoProfile = [[0.001, -0.02], [0.162, -0.02], [0.158, 0.08], [0.172, 0.2], [0.196, 0.33], [0.205, 0.41], [0.18, 0.47], [0.11, 0.5], [0.06, 0.52], [0.001, 0.52]].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mk(new THREE.LatheGeometry(torsoProfile, 24), shirtM, spine); torso.scale.set(1, 1, 0.68);
  mk(new THREE.TorusGeometry(0.055, 0.012, 6, 16), shirtM, spine, 0, 0.51, 0).rotation.x = Math.PI / 2; // cuello de la camiseta
  mk(new THREE.CylinderGeometry(0.048, 0.054, 0.11, 10), skinM, spine, 0, 0.55, 0);
  // ---- cabeza ----
  const head = new THREE.Group(); head.position.y = 0.67; spine.add(head);
  const skull = mk(new THREE.SphereGeometry(0.105, 18, 14), skinM, head); skull.scale.set(0.93, 1.12, 1.0);
  mk(new THREE.SphereGeometry(0.06, 12, 10), skinM, head, 0, -0.055, 0.035).scale.set(1.2, 0.9, 1.1); // mandíbula
  for (const sx of [-1, 1]) {
    mk(new THREE.SphereGeometry(0.012, 8, 6), std(0x1a1a1a, { roughness: 0.3 }), head, sx * 0.034, 0.018, 0.094);
    const ear = mk(new THREE.SphereGeometry(0.022, 8, 6), skinM, head, sx * 0.098, 0.0, 0); ear.scale.set(0.5, 1, 0.8);
  }
  mk(new THREE.SphereGeometry(0.016, 8, 6), skinM, head, 0, -0.005, 0.104).scale.set(0.9, 1.1, 1.2); // nariz
  const style = o.hairStyle;
  if (style !== 'rapado') {
    const cap = mk(new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), hairM, head, 0, 0.018, -0.006); cap.scale.set(0.97, 1.08, 1.04);
  } else {
    const cap = mk(new THREE.SphereGeometry(0.107, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), hairM, head, 0, 0.02, -0.004); cap.scale.set(0.95, 1.05, 1.0);
  }
  if (style === 'gorra') {
    const c = mk(new THREE.SphereGeometry(0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), std(o.accent, { roughness: 0.7 }), head, 0, 0.03, 0); c.scale.set(1, 0.95, 1.05);
    const visor = mk(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), std(o.accent, { roughness: 0.7 }), head, 0, 0.045, 0.07); visor.scale.set(1, 1, 0.9);
  } else if (style === 'vincha') {
    mk(new THREE.TorusGeometry(0.104, 0.014, 6, 24), std(o.accent, { roughness: 0.8 }), head, 0, 0.055, 0).rotation.x = Math.PI / 2 - 0.15;
  } else if (style === 'largo') {
    mk(new THREE.SphereGeometry(0.05, 10, 8), hairM, head, 0, 0.0, -0.12).scale.set(0.8, 1.5, 0.8);
    mk(new THREE.TorusGeometry(0.104, 0.012, 6, 24), std(o.accent), head, 0, 0.06, 0).rotation.x = Math.PI / 2 - 0.15;
  }
  // ---- brazos ----
  const arms = [], elbows = [], wrists = [];
  for (const sx of [1, -1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.215, 0.44, 0); spine.add(arm);
    mk(new THREE.SphereGeometry(0.064, 12, 10), shirtM, arm);
    const sleeve = new THREE.CylinderGeometry(0.066, 0.058, 0.15, 12); sleeve.translate(0, -0.065, 0); mk(sleeve, shirtM, arm);
    const upper = new THREE.CylinderGeometry(0.049, 0.042, 0.29, 10); upper.translate(0, -0.145, 0); mk(upper, skinM, arm);
    const elbow = new THREE.Group(); elbow.position.y = -0.29; arm.add(elbow);
    mk(new THREE.SphereGeometry(0.043, 10, 8), skinM, elbow);
    const fore = new THREE.CylinderGeometry(0.042, 0.032, 0.26, 10); fore.translate(0, -0.13, 0); mk(fore, skinM, elbow);
    const wrist = new THREE.Group(); wrist.position.y = -0.26; elbow.add(wrist);
    mk(new THREE.SphereGeometry(0.04, 10, 8), skinM, wrist, 0, -0.035, 0).scale.set(0.85, 1.25, 0.7);
    if (sx < 0) mk(new THREE.CylinderGeometry(0.039, 0.039, 0.05, 10), std(o.accent, { roughness: 0.9 }), elbow, 0, -0.22, 0); // muñequera
    arms.push(arm); elbows.push(elbow); wrists.push(wrist);
  }
  const paddle = makePaddle(o.paddle); paddle.position.y = -0.05; wrists[1].add(paddle);
  optimizeTree(g);
  return { group: g, hips, spine, head, legL: legs[0], legR: legs[1], kneeL: knees[0], kneeR: knees[1], armL: arms[0], armR: arms[1], elbowL: elbows[0], elbowR: elbows[1], wristR: wrists[1], paddle };
}
