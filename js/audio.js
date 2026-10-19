'use strict';
// ================== AUDIO (sintetizado con WebAudio) ==================
let actx = null, noiseBuf = null, muted = false, ambGain = null, ambLevel = 0.025, revIn = null;
function audioInit() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // murmullo del público
    const src = actx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    ambGain = actx.createGain(); ambGain.gain.value = muted ? 0 : ambLevel;
    src.connect(f).connect(ambGain).connect(actx.destination); src.start();
    // eco del estadio: respuesta al impulso sintética (ruido que decae)
    const len = actx.sampleRate * 1.6, ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d2 = ir.getChannelData(ch); for (let i = 0; i < len; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = actx.createConvolver(); conv.buffer = ir;
    revIn = actx.createGain(); revIn.gain.value = 0.55; revIn.connect(conv).connect(actx.destination);
  } catch (e) { actx = null; }
}
function setCrowdLevel(level) {
  ambLevel = level;
  if (ambGain && actx) ambGain.gain.setTargetAtTime(muted ? 0 : level, actx.currentTime, 0.4);
}
function sNoise(dur, freq, q, vol, type = 'bandpass', attack = 0.002, wet = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime, src = actx.createBufferSource(); src.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(actx.destination); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  if (wet && revIn) { const w = actx.createGain(); w.gain.value = wet; g.connect(w).connect(revIn); }
}
function sTone(freq, dur, vol, type = 'sine', toFreq, delay = 0, wet = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
  if (wet && revIn) { const w = actx.createGain(); w.gain.value = wet; g.connect(w).connect(revIn); }
}
const sfx = {
  // el timbre del golpe cambia con el efecto: liftado más brillante, cortado más seco
  hit: (p = 1, spin = 0, sweet = true) => {
    if (!sweet) { sNoise(0.05, 3400, 2, 0.5 * p, 'bandpass', 0.002, 0.15); sTone(1450, 0.05, 0.18 * p, 'square', 900, 0, 0.1); return; }
    if (spin > 0.3) { sNoise(0.06, 2300, 1.4, 0.75 * p, 'bandpass', 0.002, 0.18); sTone(720, 0.05, 0.25 * p, 'triangle', 380, 0, 0.12); }
    else if (spin < -0.3) { sNoise(0.09, 1000, 0.9, 0.7 * p, 'lowpass', 0.002, 0.18); sTone(430, 0.06, 0.25 * p, 'triangle', 200, 0, 0.12); }
    else { sNoise(0.07, 1700, 1.3, 0.7 * p, 'bandpass', 0.002, 0.18); sTone(600, 0.05, 0.25 * p, 'triangle', 300, 0, 0.12); }
  },
  smash: () => { sNoise(0.12, 1200, 0.8, 0.9, 'bandpass', 0.002, 0.35); sTone(380, 0.08, 0.35, 'triangle', 120, 0, 0.25); },
  bounce: p => { sTone(170, 0.08, 0.45 * p, 'sine', 80); sNoise(0.03, 900, 1, 0.15 * p); },
  glass: p => { sNoise(0.14, 2600, 3, 0.4 * p, 'bandpass', 0.002, 0.6); sTone(130, 0.18, 0.45 * p, 'sine', 60, 0, 0.5); },
  frame: p => { sTone(980, 0.12, 0.22 * p, 'square', 640, 0, 0.4); sNoise(0.08, 3600, 4, 0.35 * p, 'bandpass', 0.002, 0.4); },
  squeak: v => { sTone(2500 + Math.random() * 600, 0.07, 0.05 * v, 'triangle', 3300); },
  step: v => sNoise(0.035, 240, 1, 0.09 * v, 'lowpass'),
  fence: p => sNoise(0.3, 3800, 0.7, 0.3 * p, 'highpass'),
  net: () => sNoise(0.18, 500, 0.7, 0.4),
  cheer: big => { sNoise(big ? 2.6 : 1.5, 1100, 0.4, big ? 0.38 : 0.22, 'bandpass', 0.25, 0.4); if (big) sNoise(2.2, 2400, 0.6, 0.12, 'bandpass', 0.3, 0.3); },
  applause: lv => { for (let i = 0; i < 6; i++) sNoise(0.08, 1800 + Math.random() * 1500, 1.2, 0.06 * lv, 'bandpass', 0.004, 0.3); },
  ooh: () => { sNoise(1.1, 520, 2.5, 0.22, 'bandpass', 0.25, 0.4); sNoise(0.9, 760, 3, 0.1, 'bandpass', 0.3, 0.3); },
  fault: () => { sTone(420, 0.15, 0.15, 'square'); sTone(300, 0.25, 0.15, 'square', null, 0.15); },
  call: hi => sTone(hi ? 660 : 520, 0.08, 0.12, 'triangle'),
  whoosh: () => sNoise(0.15, 800, 0.6, 0.25, 'bandpass', 0.05),
  click: () => sTone(900, 0.04, 0.08, 'square'),
  // fanfarria corta para la presentación
  fanfare: () => {
    const notes = [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42], [784, 0.62], [1046, 0.76]];
    notes.forEach(([f, d]) => { sTone(f, 0.28, 0.12, 'triangle', null, d); sTone(f / 2, 0.3, 0.06, 'sawtooth', null, d); });
  },
  trophy: () => {
    [[523, 0], [659, 0.18], [784, 0.36], [1046, 0.54], [1318, 0.8]].forEach(([f, d]) => sTone(f, 0.5, 0.13, 'triangle', null, d));
  },
};
function toggleMute() {
  muted = !muted;
  if (ambGain && actx) ambGain.gain.value = muted ? 0 : ambLevel;
  if (muted && window.speechSynthesis) speechSynthesis.cancel();
}

// ================== LOCUTOR (síntesis de voz del navegador) ==================
let voice = null, lastSpeak = 0;
function pickVoice() {
  if (!window.speechSynthesis) return;
  const vs = speechSynthesis.getVoices();
  voice = vs.find(v => /^es[-_](AR|419|MX|US)/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)) || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, prio = false) {
  if (!settings.voice || muted || !window.speechSynthesis || !voice) return;
  const now = performance.now();
  if (!prio && now - lastSpeak < 2500) return;
  lastSpeak = now;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 1.12; u.pitch = 1.0; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* sin voz */ }
}

// ================== MÚSICA DE MENÚ ==================
let musicTimer = null, musicStep = 0;
const CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
function musicTick() {
  if (!actx || muted || !settings.music) return;
  const ch = CHORDS[Math.floor(musicStep / 4) % CHORDS.length];
  if (musicStep % 4 === 0) ch.forEach(f => sTone(f / 2, 2.1, 0.035, 'triangle', null, 0, 0.5));
  sTone(ch[musicStep % 3] * 2, 0.35, 0.03, 'sine', null, 0, 0.6);
  if (musicStep % 2 === 0) sNoise(0.05, 7000, 1, 0.02, 'highpass');
  musicStep++;
}
function startMusic() { if (musicTimer || !settings.music) return; musicTimer = setInterval(musicTick, 520); }
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
