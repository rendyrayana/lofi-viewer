import { state, updateUniforms, applyClayMode, setPixelRatio } from './scene.js';
import { exportPNG, exportWebM } from './export.js';
import { loadFromFile } from './loader.js';

// ── helpers ──────────────────────────────────────────────────────────
function wire(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
  return el;
}

function sl(sliderId, valId, decimals, onChange) {
  const s = document.getElementById(sliderId);
  const v = document.getElementById(valId);
  if (!s) return;
  const fmt = n => decimals === 0 ? Math.round(n) : parseFloat(n).toFixed(decimals);
  s.addEventListener('input', () => {
    const n = parseFloat(s.value);
    if (v) v.textContent = fmt(n);
    onChange(n);
  });
}

function tog(checkboxId, onChange) {
  const el = document.getElementById(checkboxId);
  if (el) el.addEventListener('change', () => onChange(el.checked));
}

// ── init ─────────────────────────────────────────────────────────────
export function initUI(container) {

  // ── Top bar ──────────────────────────────────────────────────────
  const chipClay = document.getElementById('chip-clay');
  chipClay?.addEventListener('click', () => {
    state.clayMode = !state.clayMode;
    chipClay.classList.toggle('on', state.clayMode);
    applyClayMode(state.clayMode);
  });

  const chipRotate = document.getElementById('chip-rotate');
  const speedInput = document.getElementById('rotate-speed');
  chipRotate?.addEventListener('click', () => {
    state.turntable = !state.turntable;
    chipRotate.classList.toggle('on', state.turntable);
    speedInput?.classList.toggle('active-speed', state.turntable);
  });
  speedInput?.addEventListener('input', () => {
    state.turntableSpeed = parseFloat(speedInput.value);
  });

  const bgSwatch = document.getElementById('bg-swatch');
  wire('bg-color', 'input', e => {
    state.bgColor = e.target.value;
    if (bgSwatch) bgSwatch.style.background = e.target.value;
    updateUniforms();
  });

  wire('chip-load', 'click', () => document.getElementById('file-input')?.click());
  wire('chip-png', 'click', exportPNG);
  wire('chip-webm', 'click', exportWebM);

  wire('file-input', 'change', e => {
    const f = e.target.files?.[0];
    if (f) loadFromFile(f);
    e.target.value = '';
  });

  // ── Geometry ─────────────────────────────────────────────────────
  sl('s-pixel', 'v-pixel', 2, v => {
    state.pixelRatio = v;
    setPixelRatio(v, container);
  });

  tog('t-snap', v => { state.snapVertices = v; updateUniforms(); });

  sl('s-snap', 'v-snap', 0, v => { state.snapResolution = v; updateUniforms(); });

  tog('t-affine', v => { state.useAffineUV = v; updateUniforms(); });

  // ── Color ─────────────────────────────────────────────────────────
  tog('t-dither', v => { state.useDither = v; updateUniforms(); });
  sl('s-dither-g', 'v-dither-g', 2, v => { state.ditherGamma = v; updateUniforms(); });
  sl('s-exposure', 'v-exposure', 2, v => { state.exposure = v; updateUniforms(); });
  sl('s-brightness', 'v-brightness', 2, v => { state.brightness = v; updateUniforms(); });
  sl('s-contrast', 'v-contrast', 2, v => { state.contrast = v; updateUniforms(); });

  // ── Light ─────────────────────────────────────────────────────────
  sl('s-dir-i', 'v-dir-i', 2, v => { state.dirIntensity = v; updateUniforms(); });

  const dirPitchEl = document.getElementById('v-dir-pitch');
  const sPitch = document.getElementById('s-dir-pitch');
  sPitch?.addEventListener('input', () => {
    const n = parseFloat(sPitch.value);
    if (dirPitchEl) dirPitchEl.textContent = Math.round(n) + '°';
    state.dirPitch = n;
    updateUniforms();
  });

  const dirYawEl = document.getElementById('v-dir-yaw');
  const sYaw = document.getElementById('s-dir-yaw');
  sYaw?.addEventListener('input', () => {
    const n = parseFloat(sYaw.value);
    if (dirYawEl) dirYawEl.textContent = Math.round(n) + '°';
    state.dirYaw = n;
    updateUniforms();
  });

  sl('s-ambient', 'v-ambient', 2, v => { state.ambientIntensity = v; updateUniforms(); });

  // ── CRT ───────────────────────────────────────────────────────────
  tog('t-scan', v => { state.scanlines = v; updateUniforms(); });
  sl('s-scan', 'v-scan', 2, v => { state.scanlineIntensity = v; updateUniforms(); });

  tog('t-vig', v => { state.vignette = v; updateUniforms(); });
  sl('s-vig', 'v-vig', 2, v => { state.vignetteDarkness = v; updateUniforms(); });

  tog('t-chroma', v => { state.chromaticAberration = v; updateUniforms(); });
  sl('s-chroma', 'v-chroma', 1, v => { state.chromaticAberrationAmount = v; updateUniforms(); });

  tog('t-grain', v => { state.filmGrain = v; updateUniforms(); });
  sl('s-grain', 'v-grain', 2, v => { state.grainIntensity = v; updateUniforms(); });

  tog('t-warble', v => { state.warble = v; updateUniforms(); });
  sl('s-warble', 'v-warble', 1, v => { state.warbleAmount = v; updateUniforms(); });
}
