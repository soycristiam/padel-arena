'use strict';
// ================== UTILIDADES ==================
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const isTouch = ('ontouchstart' in window) || matchMedia('(pointer:coarse)').matches;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ================== CONSTANTES DE PISTA ==================
// Pista 10 x 20 m. Equipo 0 en z>0 (cerca de la cámara), equipo 1 en z<0.
const HX = 5, HZ = 10, NET_H = 0.88, SERVICE = 6.95, G = 9.81, BR = 0.033;
const STEP = 1 / 120;
const SWING = 0.12; // tiempo entre pulsar y que la pala llegue a la pelota

// ================== PERSISTENCIA ==================
const store = {
  get(k, def) { try { const v = localStorage.getItem('padelArena.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('padelArena.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
};

const DEFAULT_SETTINGS = {
  name: 'CARLOS', diff: 'normal', games: 4, bestOf: 1, golden: true, assist: true,
  meter: 'normal', replays: 'destacadas', voice: true, camFx: true,
  shirt: 0x23c4d6, paddle: 0xff3b3b, court: 'azul', venue: 'noche',
  players: 'solo', rival: 'auto', quality: isTouch ? 'media' : 'alta', music: true, realModels: false,
};
const settings = Object.assign({}, DEFAULT_SETTINGS, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

// ================== HABILIDAD ==================
// rating 0..1 → parámetros de la IA
function skillFromRating(r, style) {
  r = clamp(r, 0, 1);
  const L = (a, b) => a + (b - a) * r;
  const s = { speed: L(4.1, 6.1), react: L(0.34, 0.08), err: L(1.05, 0.3), ue: L(0.12, 0.03), reach: L(1.18, 1.45),
    power: L(0.84, 1.12), miss: L(0.15, 0.04), x3: L(0.04, 0.22), save: L(0.05, 0.35), rating: r,
    lob: 0, slice: 0, drop: 0, net: false };
  const st = STYLES[style];
  if (st) {
    if (st.power) s.power += st.power;
    if (st.ue) s.ue = Math.max(0.01, s.ue + st.ue);
    if (st.x3) s.x3 += st.x3;
    s.lob += st.lob || 0; s.slice += st.slice || 0; s.drop += st.drop || 0; s.net = !!st.net;
  }
  return s;
}
const DIFF_RATING = { facil: 0.18, normal: 0.5, dificil: 0.85 };

const STYLES = {
  pegador: { name: 'PEGADOR', power: 0.08, x3: 0.08, lob: -0.06 },
  defensor: { name: 'DEFENSOR', power: -0.04, ue: -0.015, lob: 0.14, slice: 0.1 },
  voleador: { name: 'VOLEADOR', net: true, drop: 0.06 },
  completo: { name: 'COMPLETO' },
};
const WEAKNESSES = {
  reves: 'el revés',
  globo: 'los remates (tirale globos)',
  pared: 'las salidas de pared',
  velocidad: 'las pelotas rápidas',
};

// Atributos del jugador humano (1..10) → parámetros
function humanStats(attrs) {
  const a = Object.assign({ potencia: 6, control: 6, velocidad: 6, reflejos: 6, resistencia: 6 }, attrs || {});
  return {
    speed: 4.9 + a.velocidad * 0.13,
    reach: 1.35 + a.reflejos * 0.025,
    errMul: 1.35 - a.control * 0.06,
    power: 0.88 + a.potencia * 0.025,
    drain: 1.5 - a.resistencia * 0.09,
  };
}

// ================== PLANTEL (nombres inventados) ==================
const ROSTER = [
  { id: 'r1',  name: 'ROSSI / VALDÉS',     flag: 'ARG', r: 0.95, colors: [0xffffff, 0x101820], players: [{ n: 'T. ROSSI', style: 'pegador', weak: 'globo' }, { n: 'B. VALDÉS', style: 'voleador', weak: 'pared' }] },
  { id: 'r2',  name: 'NAVARRO / LEDESMA',  flag: 'ESP', r: 0.9,  colors: [0xf2c230, 0x1a1a1a], players: [{ n: 'A. NAVARRO', style: 'completo', weak: 'velocidad' }, { n: 'J. LEDESMA', style: 'pegador', weak: 'reves' }] },
  { id: 'r3',  name: 'CASTRO / IBÁÑEZ',    flag: 'ESP', r: 0.84, colors: [0x7b3fe4, 0x111111], players: [{ n: 'P. CASTRO', style: 'defensor', weak: 'globo' }, { n: 'M. IBÁÑEZ', style: 'voleador', weak: 'reves' }] },
  { id: 'r4',  name: 'SOUZA / LIMA',       flag: 'BRA', r: 0.78, colors: [0x22a35a, 0xf6e04b], players: [{ n: 'R. SOUZA', style: 'pegador', weak: 'pared' }, { n: 'D. LIMA', style: 'completo', weak: 'globo' }] },
  { id: 'r5',  name: 'FERRO / GALLI',      flag: 'ITA', r: 0.72, colors: [0x1f6fd1, 0xffffff], players: [{ n: 'L. FERRO', style: 'voleador', weak: 'velocidad' }, { n: 'S. GALLI', style: 'defensor', weak: 'reves' }] },
  { id: 'r6',  name: 'ACOSTA / MIRANDA',   flag: 'URU', r: 0.66, colors: [0x8fd3ff, 0x0d2040], players: [{ n: 'F. ACOSTA', style: 'defensor', weak: 'globo' }, { n: 'G. MIRANDA', style: 'pegador', weak: 'pared' }] },
  { id: 'r7',  name: 'DUBOIS / MARTIN',    flag: 'FRA', r: 0.6,  colors: [0x253a8c, 0xe63946], players: [{ n: 'H. DUBOIS', style: 'completo', weak: 'reves' }, { n: 'E. MARTIN', style: 'voleador', weak: 'velocidad' }] },
  { id: 'r8',  name: 'SILVA / COSTA',      flag: 'POR', r: 0.55, colors: [0xc8102e, 0x046a38], players: [{ n: 'N. SILVA', style: 'pegador', weak: 'globo' }, { n: 'T. COSTA', style: 'defensor', weak: 'pared' }] },
  { id: 'r9',  name: 'HERRERA / PAZ',      flag: 'MEX', r: 0.5,  colors: [0x0b6e4f, 0xffffff], players: [{ n: 'C. HERRERA', style: 'completo', weak: 'pared' }, { n: 'I. PAZ', style: 'pegador', weak: 'reves' }] },
  { id: 'r10', name: 'MOLINA / SOSA',      flag: 'ARG', r: 0.45, colors: [0xff7a00, 0x222222], players: [{ n: 'V. MOLINA', style: 'defensor', weak: 'velocidad' }, { n: 'K. SOSA', style: 'voleador', weak: 'globo' }] },
  { id: 'r11', name: 'ROJAS / FUENTES',    flag: 'CHI', r: 0.4,  colors: [0xd52b1e, 0x0039a6], players: [{ n: 'O. ROJAS', style: 'pegador', weak: 'pared' }, { n: 'U. FUENTES', style: 'completo', weak: 'reves' }] },
  { id: 'r12', name: 'LINDQVIST / BERG',   flag: 'SWE', r: 0.35, colors: [0x006aa7, 0xfecc00], players: [{ n: 'O. LINDQVIST', style: 'defensor', weak: 'globo' }, { n: 'A. BERG', style: 'pegador', weak: 'velocidad' }] },
  { id: 'r13', name: 'PERALTA / VEGA',     flag: 'PAR', r: 0.3,  colors: [0xe4e4e4, 0xd52b1e], players: [{ n: 'D. PERALTA', style: 'voleador', weak: 'pared' }, { n: 'R. VEGA', style: 'defensor', weak: 'reves' }] },
  { id: 'r14', name: 'MÜLLER / KRAUSE',    flag: 'GER', r: 0.25, colors: [0x333333, 0xffce00], players: [{ n: 'J. MÜLLER', style: 'completo', weak: 'globo' }, { n: 'F. KRAUSE', style: 'pegador', weak: 'pared' }] },
  { id: 'r15', name: 'BLANCO / CRUZ',      flag: 'ESP', r: 0.2,  colors: [0xff5fa2, 0x1b1b2f], players: [{ n: 'S. BLANCO', style: 'defensor', weak: 'velocidad' }, { n: 'A. CRUZ', style: 'voleador', weak: 'reves' }] },
];

// Compañeros disponibles (carrera); el primero es el de exhibición
const PARTNERS = [
  { id: 'c0', n: 'JUGADOR 2', r: 0.5, style: 'completo', rank: 99 },
  { id: 'c1', n: 'M. AGUIRRE', r: 0.35, style: 'defensor', rank: 99 },
  { id: 'c2', n: 'L. BENÍTEZ', r: 0.5, style: 'completo', rank: 12 },
  { id: 'c3', n: 'G. ORTEGA', r: 0.65, style: 'voleador', rank: 8 },
  { id: 'c4', n: 'R. QUIROGA', r: 0.78, style: 'pegador', rank: 5 },
  { id: 'c5', n: 'E. SALINAS', r: 0.9, style: 'completo', rank: 2 },
];

const SHIRT_COLORS = [0x23c4d6, 0x2ecc71, 0xffd23f, 0xff6b35, 0xe63946, 0x9b5de5, 0xffffff, 0x1d1d1d];
const PADDLE_COLORS = [0xff3b3b, 0x3ad1e6, 0xd6f542, 0xff9f1c, 0xffffff, 0x9b5de5];
const COURT_COLORS = { azul: '#2257e6', verde: '#1f8a4c', terracota: '#b5532c', gris: '#4a5260' };
const hex = c => '#' + c.toString(16).padStart(6, '0');
