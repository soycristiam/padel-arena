'use strict';
// ================== IMAGEN DE TV (posprocesado) ==================
// Brillo alrededor de luces y pelota (bloom), corrección de color, viñeta y grano,
// profundidad de campo en la cámara cercana y en las repeticiones, y estela de movimiento en los remates.
// Si las librerías de posprocesado no cargan (sin internet), el juego dibuja normal.
let composer = null, bloomPass = null, bokehPass = null, afterPass = null, gradePass = null, blurT = 0;
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, sat: { value: 1.1 }, contrast: { value: 1.06 }, grain: { value: 0.018 }, warm: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, sat, contrast, grain, warm; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec3 c = toSRGB(texture2D(tDiffuse, vUv).rgb);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c += vec3(warm, warm * 0.4, -warm * 0.6);
      vec2 d = vUv - 0.5; c *= 1.0 - vignette * dot(d, d) * 2.2;
      c += (rand(vUv) - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
const postAvailable = () => !!(THREE.EffectComposer && THREE.RenderPass && THREE.ShaderPass && THREE.UnrealBloomPass);
function setupPost() {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  composer = bloomPass = bokehPass = afterPass = gradePass = null;
  glows.forEach(g => { g.material.opacity = 0.85; g.scale.set(4.5, 4.5, 1); });
  if (!postAvailable() || !Q().post) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let rt;
  if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
    rt = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, { format: THREE.RGBAFormat }); rt.samples = Q().msaa || 4;
  }
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  if (THREE.BokehPass && Q().dof) {
    bokehPass = new THREE.BokehPass(scene, camera, { focus: 6, aperture: 0.00012, maxblur: 0.006, width: size.x, height: size.y });
    bokehPass.enabled = false; composer.addPass(bokehPass);
  }
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.28, 0.93);
  glows.forEach(g => { g.material.opacity = 0.3; g.scale.set(2.6, 2.6, 1); }); // el bloom ya hace el brillo de los focos
  composer.addPass(bloomPass);
  if (THREE.AfterimagePass) { afterPass = new THREE.AfterimagePass(0.6); afterPass.enabled = false; composer.addPass(afterPass); }
  gradePass = new THREE.ShaderPass(GradeShader); composer.addPass(gradePass);
}
function postResize() {
  if (!composer) return;
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
// sensación de velocidad en los remates
function postBlur(t) { /* desactivado: duplicaba brazos y pala como fantasmas */ }
const _fp = new THREE.Vector3();
function postRender(dt) {
  if (!composer) { renderer.render(scene, camera); return; }
  gradePass.uniforms.time.value = (gradePass.uniforms.time.value + dt) % 100;
  gradePass.uniforms.warm.value = settings.venue === 'dia' ? 0.015 : 0.0;
  if (bokehPass) {
    // desenfoque de fondo en la cámara cercana y en las repeticiones, enfocando al jugador
    const on = camMode === 3 || state === 'replay';
    bokehPass.enabled = on;
    if (on) {
      const u = state === 'replay' ? ball : focusPlayer();
      _fp.set(u.x, state === 'replay' ? ball.y : 1.1, u.z);
      bokehPass.uniforms.focus.value = camera.position.distanceTo(_fp);
    }
  }
  if (afterPass) {
    blurT = Math.max(0, blurT - dt);
    afterPass.enabled = blurT > 0;
    afterPass.uniforms.damp.value = 0.55 + 0.3 * Math.min(1, blurT / 0.3);
  }
  composer.render(dt);
}
