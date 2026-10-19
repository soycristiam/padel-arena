'use strict';
// Contacto pala-pelota y animación de los jugadores (esqueleto, swing y brazo que apunta a la pelota).

// ================== CONTACTO PALA-PELOTA ==================
// El swing dura SWING_DUR; la pala llega a la pelota en la fase TC (SWING segundos después de empezar).
const SWING_DUR = 0.36, TC = SWING / SWING_DUR;
const ARM_A = 0.29, ARM_B = 0.585; // hombro→codo y codo→centro de la cabeza de la pala
const rightX = p => p.team === 0 ? 1 : -1;   // lado derecho del jugador (mirando a la red), en x del mundo
const netZ = p => p.team === 0 ? -1 : 1;     // hacia la red, en z del mundo
function sideFor(p, pt) {
  if (pt.y > 1.85) return 'over';
  return (pt.x - p.x) * rightX(p) < -0.05 ? 'back' : 'side';
}
// Dónde tiene que estar el cuerpo para que la pelota quede al alcance natural de la pala
function idealBodyPos(p, pt, side) {
  const rx = rightX(p), f = netZ(p);
  if (side === 'over') return { x: pt.x - rx * 0.28, z: pt.z - f * 0.15 };
  if (side === 'back') return { x: pt.x + rx * 0.5, z: pt.z - f * 0.32 };
  return { x: pt.x - rx * 0.62, z: pt.z - f * 0.3 };
}
// Posición de la pelota dentro de `secs`, respetando botes y paredes (null si el punto termina antes)
function predictAhead(secs) {
  if (!rally) return null;
  const b = { ...ball }; let bounces = rally.bounces, crossed = rally.crossed, w = !!rally.wallTouched; const ev = [];
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) {
    ev.length = 0; stepBall(b, STEP, ev);
    if (!crossed && (b.z > 0 ? 0 : 1) === rally.receiving) crossed = true;
    for (const e of ev) {
      if (e.type === 'floor') { if (!crossed || e.side !== rally.receiving || !e.inside) return null; bounces++; }
      else if (e.type === 'wall' && crossed && e.side === rally.receiving && bounces === 0) return null;
      else if (e.type === 'wall' && crossed && e.side === rally.receiving && bounces === 1) w = true;
    }
    if (bounces >= 2) return null;
  }
  return { x: b.x, y: b.y, z: b.z, vy: b.vy, bounces, crossed, w };
}
function setContact(p, pt, t, dir) {
  const dx = dir ? dir.x : 0, dz = dir ? dir.z : netZ(p), l = Math.hypot(dx, dz) || 1;
  p.contact = { x: pt.x, y: pt.y, z: pt.z, t, side: sideFor(p, pt), dx: dx / l, dz: dz / l };
}
const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// Peso del ajuste del brazo hacia la pelota (1 justo en el impacto)
function ikState(p) {
  if (state === 'replay' || netRole === 'guest') return p.replayIK || null;
  const c = p.contact; if (!c) return null;
  const w = smooth01(1 - Math.abs(simTime - c.t) / 0.2);
  return w > 0 ? { x: c.x, y: c.y, z: c.z, dx: c.dx, dz: c.dz, w } : null;
}


// ================== ANIMACIÓN ==================
// Pose del swing en la fase t (0 = pala atrás, TC = impacto, 1 = terminación)
function swingPose(kind, t, P) {
  const a = t < TC ? t / TC : (t - TC) / (1 - TC), pre = t < TC;
  switch (kind) {
    case 'over':
      if (pre) { P.sRx = lerp(-2.9, -2.7, a); P.sRz = -0.35; P.eR = lerp(-1.9, -0.25, a); P.sLx = lerp(-2.6, -1.6, a); P.sLz = 0.2; P.eL = -0.3; P.lean = lerp(-0.2, 0.05, a); P.twist = lerp(-0.5, 0, a); }
      else { P.sRx = lerp(-2.7, -0.5, a); P.sRz = -0.3; P.eR = lerp(-0.25, -0.35, a); P.sLx = lerp(-1.6, -0.4, a); P.sLz = 0.2; P.eL = -0.5; P.lean = lerp(0.05, 0.45, a); P.twist = lerp(0, 0.5, a); }
      break;
    case 'serve':
      if (pre) { P.sRx = lerp(0.5, -0.5, a); P.sRz = -0.45; P.eR = -0.25; P.twist = lerp(-0.5, -0.1, a); }
      else { P.sRx = lerp(-0.5, -1.6, a); P.sRz = lerp(-0.45, 0.2, a); P.eR = -0.3; P.twist = lerp(-0.1, 0.4, a); }
      P.sLx = -0.8; P.sLz = 0.25; P.eL = -0.5; break;
    case 'back':
      if (pre) { P.twist = lerp(0.95, 0.15, a); P.sRz = lerp(1.15, 0.35, a); P.sRx = lerp(-1.0, -1.1, a); P.eR = lerp(-0.9, -0.35, a); P.sLx = -1.0; P.sLz = P.sRz * 0.85 + 0.1; P.eL = -1.0; }
      else { P.twist = lerp(0.15, -0.7, a); P.sRz = lerp(0.35, -0.85, a); P.sRx = lerp(-1.1, -1.25, a); P.eR = lerp(-0.35, -0.6, a); P.sLx = lerp(-1.0, -0.6, a); P.sLz = lerp(0.4, 0.3, a); P.eL = lerp(-1.0, -0.8, a); }
      break;
    default: // derecha
      if (pre) { P.twist = lerp(-0.95, -0.1, a); P.sRz = lerp(-1.25, -0.55, a); P.sRx = lerp(-0.55, -0.95, a); P.eR = lerp(-0.9, -0.3, a); P.sLx = -0.9; P.sLz = lerp(0.75, 0.4, a); P.eL = -0.9; }
      else { P.twist = lerp(-0.1, 0.75, a); P.sRz = lerp(-0.55, 0.75, a); P.sRx = lerp(-0.95, -1.3, a); P.eR = lerp(-0.3, -1.0, a); P.sLx = lerp(-0.9, -0.5, a); P.sLz = lerp(0.4, 0.2, a); P.eL = -0.9; }
  }
  return P;
}

// ---- brazo derecho hacia la pelota (cinemática inversa de dos huesos) ----
const _ikM = new THREE.Matrix4(), _ikQ1 = new THREE.Quaternion(), _ikQ2 = new THREE.Quaternion(), _ikQs = new THREE.Quaternion();
const _ikV = [0, 1, 2, 3, 4].map(() => new THREE.Vector3()), _ikX = new THREE.Vector3(1, 0, 0);
function armIK(m, ik) {
  m.group.updateMatrixWorld(true);
  const [tl, nl, yAx, xAx, zAx] = _ikV;
  tl.set(ik.x, ik.y, ik.z).applyMatrix4(_ikM.copy(m.spine.matrixWorld).invert()).sub(m.armR.position);
  const L = tl.length(); if (L < 1e-4) return;
  tl.multiplyScalar(1 / L);
  // la cara de la pala mira hacia donde sale la pelota
  m.spine.getWorldQuaternion(_ikQs); _ikQs.invert();
  nl.set(ik.dx, 0, ik.dz).applyQuaternion(_ikQs);
  nl.addScaledVector(tl, -nl.dot(tl));
  if (nl.lengthSq() < 1e-4) { nl.set(0, 0, 1).addScaledVector(tl, -tl.z); }
  nl.normalize();
  yAx.copy(tl).negate(); xAx.crossVectors(yAx, nl).normalize(); zAx.crossVectors(xAx, yAx);
  _ikQ1.setFromRotationMatrix(_ikM.makeBasis(xAx, yAx, zAx));
  const Lc = clamp(L, Math.abs(ARM_A - ARM_B) + 0.02, ARM_A + ARM_B - 0.005);
  const beta = Math.acos(clamp((Lc * Lc - ARM_A * ARM_A - ARM_B * ARM_B) / (2 * ARM_A * ARM_B), -1, 1));
  const phi = Math.atan2(ARM_B * Math.sin(beta), ARM_A + ARM_B * Math.cos(beta));
  _ikQ1.multiply(_ikQ2.setFromAxisAngle(_ikX, phi));
  m.armR.quaternion.slerp(_ikQ1, ik.w);
  m.elbowR.rotation.x = lerp(m.elbowR.rotation.x, -beta, ik.w);
}

function animatePlayer(p, dt) {
  const m = p.mesh; if (!m) return;
  m.group.visible = p.active;
  if (p.skin) p.skin.root.visible = p.active;
  if (!p.active) return;
  m.group.position.set(p.x, 0, p.z);
  const sp = Math.hypot(p.vx, p.vz);
  const k = Math.min(1, dt * 10);
  // orientación del cuerpo hacia la pelota (limitada)
  const base = p.team === 0 ? Math.PI : 0;
  const want = Math.atan2(ball.x - p.x, ball.z - p.z);
  const diff = clamp(Math.atan2(Math.sin(want - base), Math.cos(want - base)), -1.3, 1.3);
  const dy = Math.atan2(Math.sin(base + diff - p.yaw), Math.cos(base + diff - p.yaw));
  p.yaw += dy * Math.min(1, dt * 8);
  m.group.rotation.y = p.yaw;
  const ik = ikState(p);
  // movimiento en coordenadas del jugador
  const lat = p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw);
  const fwd = p.vx * Math.sin(p.yaw) + p.vz * Math.cos(p.yaw);
  const moving = sp > 0.6, lateral = Math.abs(lat) > Math.abs(fwd) * 1.2 && moving;
  p.phase += sp * dt * (lateral ? 3.6 : 2.5);
  // en el paso de ajuste previo al impacto la zancada es corta (no una carrera)
  const amp = Math.min(1, sp / 4.5) * (ik ? 1 - 0.75 * ik.w : 1);
  // posición de espera: flexionado cuando la pelota viene hacia su equipo; más abajo si va a pegar una pelota baja
  const waiting = (state === 'rally' && rally && rally.receiving === p.team) || (state === 'serve' && server && server.team !== p.team);
  const tCrouch = moving ? 0.3 : waiting ? 0.48 : 0.2;
  p.crouch = lerp(p.crouch || 0.2, tCrouch, Math.min(1, dt * 5));
  const low = ik && ik.y < 0.95 ? ik.w * clamp((0.95 - ik.y) * 0.75, 0, 0.42) : 0;
  // split step: saltito cuando el rival le pega, y caída flexionado
  let splitHop = 0, splitDip = 0;
  if (p.splitT > 0) {
    p.splitT += dt / 0.32; const t = Math.min(1, p.splitT);
    if (t < 0.6) splitHop = Math.sin(Math.PI * t / 0.6) * 0.07; else splitDip = Math.sin(Math.PI * (t - 0.6) / 0.4) * 0.14;
    if (p.splitT >= 1) p.splitT = 0;
  }
  const c = p.crouch + low + splitDip, sinP = Math.sin(p.phase);
  // ---- piernas ----
  let thL = -c, thR = -c, knL = c * 2, knR = c * 2, zL = 0, zR = 0;
  if (lateral) {
    zL = 0.1 + Math.max(0, sinP) * 0.32; zR = -0.1 - Math.max(0, -sinP) * 0.32;
  } else if (moving) {
    thL += sinP * 0.8 * amp; thR -= sinP * 0.8 * amp;
    knL += Math.max(0, sinP) * 1.3 * amp + 0.2 * amp; knR += Math.max(0, -sinP) * 1.3 * amp + 0.2 * amp;
  }
  if (low > 0.05) { thR -= low * 0.6; knR -= low * 0.4; thL += low * 0.5; } // estocada: pierna derecha adelante
  m.legL.rotation.set(thL, 0, zL); m.legR.rotation.set(thR, 0, zR);
  m.kneeL.rotation.x = knL; m.kneeR.rotation.x = knR;
  let hipY = 0.08 + 0.85 * Math.cos(c) + Math.abs(sinP) * 0.035 * amp + splitHop;
  // ---- torso y brazos: pose en guardia (pala delante) ----
  const P = { lean: 0.1 + c * 0.35 + amp * 0.12 + low * 0.5, twist: 0, sRx: -0.55, sRz: -0.22, eR: -1.15, sLx: -0.45, sLz: 0.22, eL: -1.25 };
  if (moving && !lateral) { P.sLx = -0.3 - sinP * 0.7 * amp; P.eL = -1.4; P.sRx = -0.4 + sinP * 0.4 * amp; }
  const side = lateral ? -Math.sign(lat) * 0.07 : 0;
  let headX = 0;
  // preparación: con la pelota viniendo, la pala va atrás antes de pegar
  const prepOn = p.swingT === 0 && ((state === 'rally' && rally && rally.receiving === p.team && plan.who === p &&
    Math.hypot(ball.x - p.x, ball.z - p.z) < 4.5 && (rally.crossed || Math.abs(ball.z) < 3)) || (state === 'serve' && server === p));
  p.prepW = lerp(p.prepW || 0, prepOn ? 1 : 0, Math.min(1, dt * 6));
  if (p.swingT > 0) {
    p.swingT += dt / SWING_DUR;
    swingPose(p.swingKind, Math.min(1, p.swingT), P);
    if (p.swingT >= 1) p.swingT = 0;
  } else if (p.prepW > 0.01) {
    const kind = state === 'serve' ? 'serve' : sideFor(p, ball.y > 2.0 ? { x: ball.x, y: 2.5, z: ball.z } : ball);
    const Q = swingPose(kind, 0, Object.assign({}, P)), w = p.prepW;
    for (const key of Object.keys(P)) P[key] = lerp(P[key], Q[key], w);
  } else if (p.celebrate > 0 && (state === 'pointEnd' || state === 'over')) {
    p.celebrate -= dt;
    if (p.celebrateWin) {
      Object.assign(P, { sRx: -2.9, sRz: -0.35, eR: -0.25, sLx: -2.9, sLz: 0.35, eL: -0.25, lean: -0.05 });
      hipY += Math.abs(Math.sin(p.celebrate * 9)) * 0.14;
    } else {
      Object.assign(P, { sRx: 0.05, sRz: -0.12, eR: -0.25, sLx: 0.05, sLz: 0.12, eL: -0.2, lean: 0.38 }); headX = 0.4;
    }
  }
  // choque de palas con el compañero después de ganar el punto
  if (p.tapT > 0) {
    p.tapT += dt / 0.6; const w = Math.sin(Math.PI * Math.min(1, p.tapT));
    P.sRx = lerp(P.sRx, -1.75, w); P.sRz = lerp(P.sRz, -0.1, w); P.eR = lerp(P.eR, -0.3, w); P.twist = lerp(P.twist, 0.3, w);
    if (p.tapT >= 1) p.tapT = 0;
  }
  // el sacador hace botar la pelota con la mano izquierda
  if (state === 'serve' && server === p) { P.sLx = -0.25 - 0.55 * clamp(ball.y / 0.9, 0, 1); P.sLz = 0.15; P.eL = -0.45; }
  // salto en el remate (la altura depende de lo alta que venga la pelota)
  if (p.jumpT > 0) { p.jumpT += dt / 0.5; hipY += Math.sin(Math.PI * Math.min(1, p.jumpT)) * (p.jumpH || 0.3); if (p.jumpT >= 1) p.jumpT = 0; }
  const s = p.swingT > 0 ? 1 : k; // los golpes se ven nítidos; el resto se suaviza
  m.hips.position.y = hipY;
  m.spine.rotation.x = lerp(m.spine.rotation.x, P.lean, s);
  m.spine.rotation.y = lerp(m.spine.rotation.y, P.twist, s);
  m.spine.rotation.z = lerp(m.spine.rotation.z, side, k);
  m.armR.rotation.set(lerp(m.armR.rotation.x, P.sRx, s), lerp(m.armR.rotation.y, 0, s), lerp(m.armR.rotation.z, P.sRz, s));
  m.elbowR.rotation.x = lerp(m.elbowR.rotation.x, P.eR, s);
  m.armL.rotation.x = lerp(m.armL.rotation.x, P.sLx, s); m.armL.rotation.z = lerp(m.armL.rotation.z, P.sLz, s); m.elbowL.rotation.x = lerp(m.elbowL.rotation.x, P.eL, s);
  // en el impacto, el brazo y el codo se ajustan para que la pala esté justo en la pelota
  if (ik) armIK(m, ik);
  // la cabeza sigue a la pelota
  const look = Math.atan2(Math.sin(want - p.yaw - m.spine.rotation.y), Math.cos(want - p.yaw - m.spine.rotation.y));
  m.head.rotation.y = lerp(m.head.rotation.y, clamp(look, -0.9, 0.9), k);
  m.head.rotation.x = lerp(m.head.rotation.x, headX + (ball.y < 0.6 ? 0.15 : ball.y > 2.2 ? -0.35 : 0), k);
  if (p.ring) { p.ring.position.x = p.x; p.ring.position.z = p.z; }
  if (p.sprite) p.sprite.position.set(p.x, 2.35 + hipY - 0.93, p.z);
  if (p.skin) retargetPlayer(p, dt); // personaje 3D real (si se cargó uno)
}

