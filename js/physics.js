'use strict';
// ================== FÍSICA DE LA PELOTA ==================
// Resistencia del aire + efecto Magnus (proporcional a la velocidad):
// spin > 0 = liftado (cae antes, bota más vivo), spin < 0 = cortado (flota, bota bajo y muere en el cristal).
// side = efecto lateral (víbora): curva el vuelo y abre el bote hacia la pared lateral.
// kick = remate por 3: en el primer bote sale disparada hacia la reja lateral.
// Los botes varían según dónde pica (línea, arena junto a las paredes) y los perfiles metálicos desvían la pelota.
// Todo es determinista (sin azar) para que las predicciones de la IA y del medidor coincidan con lo que pasa.
const DRAG = 0.011, MAG = 0.22, MAGS = 0.16;
const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, side: 0, shotSpin: 0, kick: false, kicked: false, out: false, outVia: '' };

const insideCourt = b => Math.abs(b.x) <= HX + 0.05 && Math.abs(b.z) <= HZ + 0.05;
const hash01 = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); };
const BACK_POSTS = [-5, -3, -1, 1, 3, 5], SIDE_POSTS = [2, 4, 6, 8, 10];

function stepBall(b, dt, ev) {
  const pz = b.z, sp = b.spin || 0, sd = b.side || 0;
  const v = Math.hypot(b.vx, b.vy, b.vz), vh = Math.hypot(b.vx, b.vz);
  // aire
  const k = 1 - DRAG * v * dt;
  b.vx *= k; b.vy *= k; b.vz *= k;
  // gravedad + Magnus (el liftado empuja hacia abajo, el cortado sostiene)
  b.vy -= (G + sp * MAG * vh) * dt;
  b.vx += sd * MAGS * vh * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  // red
  if (pz !== 0 && (pz > 0) !== (b.z > 0) && Math.abs(b.x) < HX + 0.05) {
    if (b.y < NET_H + BR) {
      b.z = pz > 0 ? BR + 0.01 : -BR - 0.01; b.vz *= -0.12; b.vx *= 0.5; b.vy = Math.min(b.vy, 0) * 0.3;
      ev && ev.push({ type: 'net' });
    }
  }
  // suelo
  if (b.y < BR) {
    b.y = BR;
    if (b.vy < 0) {
      const imp = -b.vy;
      if (imp > 0.35) {
        let ry = 0.72 + 0.06 * sp, rh = 0.86 + 0.07 * sp, surf = 'cesped';
        const az = Math.abs(b.z);
        if (Math.abs(az - SERVICE) < 0.04 || (Math.abs(b.x) < 0.03 && az < SERVICE)) { ry *= 0.86; rh *= 1.04; surf = 'linea'; } // patina en la línea
        else if (Math.abs(b.x) > 4.4 || az > 9.4) { ry *= 0.94 + 0.12 * hash01(b.x, b.z); surf = 'arena'; }      // arena junto a las paredes
        b.vy = imp * ry; b.vx *= rh; b.vz *= rh;
        b.vx += sd * 1.8; b.spin = sp * 0.5; b.side = sd * 0.4;
        if (b.kick) { b.kick = false; b.kicked = true; b.vy = Math.max(b.vy, 12.5); b.vx = (Math.sign(b.x) || 1) * 7; b.vz *= 0.35; }
        ev && ev.push({ type: 'floor', side: b.z > 0 ? 0 : 1, imp, inside: insideCourt(b), surf, x: b.x, z: b.z });
      } else { b.vy = 0; b.vx *= 0.97; b.vz *= 0.97; }
    }
  }
  if (b.out) return;
  // paredes de fondo (cristal hasta 3 m, malla hasta 4 m)
  const hz = HZ - BR;
  if ((b.z > hz && b.vz > 0) || (b.z < -hz && b.vz < 0)) {
    const side = b.z > 0 ? 0 : 1;
    if (b.y > 4) { b.out = true; b.outVia = 'back'; ev && ev.push({ type: 'out', via: 'back' }); }
    else {
      const glass = b.y < 3, cut = Math.max(0, -(b.spin || 0));
      const frame = BACK_POSTS.some(p => Math.abs(b.x - p) < 0.05) || Math.abs(b.y - 3) < 0.04;
      const vn = Math.abs(b.vz);
      b.z = Math.sign(b.z) * hz; b.vz *= -(frame ? 0.55 : glass ? 0.72 - 0.15 * cut : 0.3); b.vx *= 0.92; b.vy = b.vy * 0.92 - 1.5 * cut; b.spin = (b.spin || 0) * 0.6;
      if (frame) { const h = hash01(b.x, b.y); b.vx += (h - 0.5) * vn * 1.1; b.vy += (hash01(b.y, b.x) - 0.5) * vn * 0.8; }
      ev && ev.push({ type: 'wall', side, glass, frame, imp: vn, back: true });
    }
  }
  // laterales: cristal en los 4 m del fondo (hasta 3 m + malla hasta 4 m), malla de 3 m en el centro
  const hx = HX - BR;
  if ((b.x > hx && b.vx > 0 && b.x < hx + 0.6) || (b.x < -hx && b.vx < 0 && b.x > -hx - 0.6)) {
    const back = Math.abs(b.z) > 6, h = back ? 4 : 3, side = b.z > 0 ? 0 : 1;
    if (b.y > h) { b.out = true; b.outVia = 'side'; ev && ev.push({ type: 'out', via: 'side' }); }
    else {
      const glass = back && b.y < 3, cut = Math.max(0, -(b.spin || 0));
      const frame = SIDE_POSTS.some(p => Math.abs(Math.abs(b.z) - p) < 0.05) || (back && Math.abs(b.y - 3) < 0.04);
      const vn = Math.abs(b.vx);
      b.x = Math.sign(b.x) * hx; b.vx *= -(frame ? 0.55 : glass ? 0.72 - 0.15 * cut : 0.3); b.vz *= 0.9; b.vy = b.vy * 0.9 - 1.2 * cut;
      if (frame) { b.vz += (hash01(b.z, b.y) - 0.5) * vn * 1.1; b.vy += (hash01(b.y, b.z) - 0.5) * vn * 0.8; }
      b.side = 0; b.spin = (b.spin || 0) * 0.6;
      ev && ev.push({ type: 'wall', side, glass, frame, imp: vn });
    }
  }
}

// Primera estimación sin aire (con el Magnus aproximado a la velocidad media)
function solveAnalytic(from, tx, tz, speedH, T, clear, spin, side) {
  const dx = tx - from.x, dz = tz - from.z, dist = Math.hypot(dx, dz);
  let t = T || dist / speedH, v = null;
  for (let i = 0; i < 40; i++) {
    const vh = dist / t, g = G + spin * MAG * vh, ax = side * MAGS * vh;
    const vy = (BR - from.y + 0.5 * g * t * t) / t, vz = dz / t;
    v = { vx: (dx - 0.5 * ax * t * t) / t, vy, vz };
    const tc = -from.z / vz;
    if (tc > 0 && tc < t) { const yc = from.y + vy * tc - 0.5 * g * tc * tc; if (yc < clear) { t *= 1.06; continue; } }
    break;
  }
  return v;
}
// Simula un tiro hasta su primer contacto (suelo, red o pared)
function simLanding(from, v, spin, side) {
  const b = { x: from.x, y: from.y, z: from.z, vx: v.vx, vy: v.vy, vz: v.vz, spin, side, out: false };
  const ev = []; let netY = null;
  for (let i = 0; i < 720; i++) {
    const pz = b.z; ev.length = 0; stepBall(b, STEP, ev);
    if (netY === null && pz !== 0 && (pz > 0) !== (b.z > 0)) netY = b.y;
    for (const e of ev) {
      if (e.type === 'floor') return { x: b.x, z: b.z, netY, wall: false };
      if (e.type === 'net') return { x: b.x, z: b.z, netY: 0, wall: false, net: true };
      if (e.type === 'wall' || e.type === 'out') return { x: b.x, z: b.z, netY, wall: true };
    }
  }
  return null;
}
// Apunta corrigiendo con simulaciones: el tiro cae donde se quiso a pesar del aire y del efecto
function solveShot(from, tx, tz, speedH, T, clear, spin = 0, side = 0) {
  let ax = tx, az = tz, sc = 1;
  const solve = () => solveAnalytic(from, ax, az, speedH ? speedH / sc : null, T ? T * sc : null, clear, spin, side);
  let v = solve();
  for (let it = 0; it < 7; it++) {
    const L = simLanding(from, v, spin, side);
    if (!L) break;
    if (L.net || (L.netY !== null && L.netY < NET_H + 0.05)) { sc *= 1.08; v = solve(); continue; }
    const ex = tx - L.x, ez = tz - L.z;
    if (Math.hypot(ex, ez) < 0.06) break;
    ax += ex * 0.9; az += ez * 0.9;
    v = solve();
  }
  return v;
}

// Simula la pelota hacia adelante siguiendo las reglas del punto.
function predictPath(maxT, r0) {
  const b = { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, out: ball.out, spin: ball.spin, side: ball.side, kick: ball.kick };
  const r = { crossed: r0.crossed, bounces: r0.bounces, recv: r0.receiving, outside: !!r0.outside, wall: !!r0.wallTouched };
  const pts = []; const ev = []; let landing = null, k = 0;
  for (let t = STEP; t < maxT; t += STEP) {
    ev.length = 0; stepBall(b, STEP, ev);
    if (!r.crossed && (b.z > 0 ? 0 : 1) === r.recv) r.crossed = true;
    let stop = false;
    for (const e of ev) {
      if (e.type === 'floor') {
        if (r.outside || !e.inside || !r.crossed || e.side !== r.recv) { stop = true; break; }
        r.bounces++; if (r.bounces === 1) landing = { x: b.x, z: b.z, t };
        if (r.bounces >= 2) { stop = true; break; }
      } else if (e.type === 'wall') { if (r.crossed && e.side === r.recv && r.bounces === 0) { stop = true; break; } if (r.crossed && e.side === r.recv && r.bounces === 1) r.wall = true; }
      else if (e.type === 'out') { if (r.crossed && r.bounces >= 1) r.outside = true; else { stop = true; break; } }
    }
    if (stop) break;
    if ((k++ & 1) === 0) pts.push({ t, x: b.x, y: b.y, z: b.z, vy: b.vy, b: r.bounces, c: r.crossed, o: r.outside, w: r.wall });
  }
  return { pts, landing };
}

function hittable(p, team, serve, net) {
  if (!p.c || (p.z > 0 ? 0 : 1) !== team) return false;
  if (p.o) return p.b === 1 && Math.abs(p.x) < 8.3 && Math.abs(p.z) < 12.3 && p.y >= 0.35 && p.y <= 2.0;
  if (Math.abs(p.x) > 4.85 || Math.abs(p.z) > 9.75) return false;
  if (p.b === 1) return (p.y >= 0.3 && p.y <= 1.6 && (p.vy < 1.0 || p.y > 1.2)) || (p.y >= 2.0 && p.y <= 2.7);
  if (p.b === 0 && !serve) return Math.abs(p.z) < (net ? 7 : 6.3) && p.y >= 0.6 && p.y <= 2.5;
  return false;
}
