import { store, defaults } from '../store.js';

const PRESET_KEYS = [
  'renderScale','vertexSnap','snapPrecision','colorDepth','ditherPattern',
  'affineWarp','textureFilter','wireframe','backfaceCulling',
  'bgType','bgColor','ambientIntensity','keyLightIntensity','lightColor',
  'exposure','fogDensity','fogColor',
  'projection','fov','turntable','rotationSpeed','autoFrame','aspectRatio',
  'crtCurvature','scanlines','scanlineOpacity','vignette','chromaticAberration',
  'filmGrain','colorGrade','bloom','bloomIntensity',
];

export function getPresetData() {
  const out = {};
  PRESET_KEYS.forEach(k => { out[k] = store.get(k); });
  return out;
}

export function copySettings() {
  const json = JSON.stringify(getPresetData(), null, 2);
  navigator.clipboard.writeText(json).then(
    () => alert('Settings copied to clipboard.'),
    () => prompt('Copy this JSON:', json)
  );
}

export function shareLink() {
  const encoded = btoa(JSON.stringify(getPresetData()));
  const url = `${location.origin}${location.pathname}?preset=${encoded}`;
  navigator.clipboard.writeText(url).then(
    () => alert('Preset link copied to clipboard.'),
    () => prompt('Copy this link:', url)
  );
}

export function loadPresetFromURL() {
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset');
  if (!preset) return;
  try {
    const data = JSON.parse(atob(preset));
    store.setMany(data);
  } catch {}
}

// Look presets change only how the model is rendered (resolution, snapping,
// texture warp, dither, lighting, display effects). They never touch the
// mesh, texture or palette set up in Process. Each starts from the defaults so
// nothing leaks over from the previously chosen preset.
export const LOOK_PRESETS = {
  ps1Crt: {
    label: 'PS1 on CRT', group: 'Console',
    settings: {
      renderScale: 0.25, vertexSnap: true, snapPrecision: 64, colorDepth: '15bit', ditherPattern: 'bayer4',
      affineWarp: true, textureFilter: 'nearest',
      crtCurvature: 0.1, scanlines: 0.4, scanlineOpacity: 0.25, vignette: 0.3, chromaticAberration: 0.1, filmGrain: 0.05,
    },
  },
  ps1Clean: {
    label: 'PS1 clean', group: 'Console',
    settings: {
      renderScale: 0.25, vertexSnap: true, snapPrecision: 64, colorDepth: '15bit', ditherPattern: 'bayer4',
      affineWarp: true, textureFilter: 'nearest',
    },
  },
  n64: {
    label: 'N64 soft', group: 'Console',
    settings: {
      renderScale: 0.3, vertexSnap: false, colorDepth: '15bit', ditherPattern: 'bayer2',
      affineWarp: false, textureFilter: 'linear', fogDensity: 0.02, vignette: 0.15,
    },
  },
  saturn: {
    label: 'Saturn', group: 'Console',
    settings: {
      renderScale: 0.25, vertexSnap: true, snapPrecision: 48, colorDepth: '15bit', ditherPattern: 'none',
      affineWarp: true, textureFilter: 'nearest', scanlines: 0.4, scanlineOpacity: 0.2, vignette: 0.2,
    },
  },
  dreamcast: {
    label: 'Dreamcast VGA', group: 'Console',
    settings: {
      renderScale: 0.6, vertexSnap: false, colorDepth: '15bit', ditherPattern: 'bayer2',
      affineWarp: false, textureFilter: 'linear',
    },
  },
  dos: {
    label: 'DOS VGA', group: 'Console',
    settings: {
      renderScale: 0.3, vertexSnap: false, colorDepth: '24bit', ditherPattern: 'none',
      affineWarp: false, textureFilter: 'nearest',
    },
  },
  handheld: {
    label: 'Handheld LCD', group: 'Handheld',
    settings: {
      renderScale: 0.15, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#9bbc0f', ambientIntensity: 0.9, keyLightIntensity: 0.4,
    },
  },
  virtualBoy: {
    label: 'Virtual Boy', group: 'Handheld',
    settings: {
      renderScale: 0.2, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#000000', ambientIntensity: 0.9, keyLightIntensity: 0.4,
      scanlines: 0.5, scanlineOpacity: 0.3,
    },
  },
  pico8: {
    label: 'PICO-8', group: 'Handheld',
    settings: {
      renderScale: 0.12, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#1d2b53',
    },
  },
  clean: {
    label: 'Clean', group: 'Neutral',
    settings: { renderScale: 0.6, colorDepth: '24bit', ditherPattern: 'none', textureFilter: 'nearest' },
  },
  horror: {
    label: 'Horror night', group: 'Mood',
    settings: {
      renderScale: 0.2, vertexSnap: true, snapPrecision: 48, colorDepth: '15bit',
      ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
      ambientIntensity: 0.1, keyLightIntensity: 0.5, lightColor: '#334466',
      exposure: 0.7, fogDensity: 0.08, fogColor: '#111122', crtCurvature: 0.2,
      scanlines: 0.6, vignette: 0.8, colorGrade: 'coldCRT',
    },
  },
  retro: {
    label: 'Retro arcade', group: 'Mood',
    settings: {
      renderScale: 0.25, vertexSnap: true, snapPrecision: 96, colorDepth: '15bit',
      ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
      ambientIntensity: 0.6, keyLightIntensity: 1.2, lightColor: '#ffeecc',
      exposure: 1.1, crtCurvature: 0.3, scanlines: 0.6,
      vignette: 0.5, colorGrade: 'warmVHS', bloom: true, bloomIntensity: 0.3,
    },
  },
};

// Process targets: era-typical per-model budgets. They only fill in the
// Process steps, where every value stays visible and editable.
export const PROCESS_TARGETS = {
  ps1:       { label: 'PS1',       settings: { procDecimate: true, procTargetTris: 800,  procTexSize: '128', procTexMode: 'fixed', procPalette: 'clut4', procDither: true } },
  n64:       { label: 'N64',       settings: { procDecimate: true, procTargetTris: 1500, procTexSize: '64',  procTexMode: 'fixed', procPalette: '15bit', procDither: true } },
  saturn:    { label: 'Saturn',    settings: { procDecimate: true, procTargetTris: 800,  procTexSize: '64',  procTexMode: 'fixed', procPalette: '15bit', procDither: false } },
  dreamcast: { label: 'Dreamcast', settings: { procDecimate: true, procTargetTris: 3000, procTexSize: '256', procTexMode: 'fixed', procPalette: '15bit', procDither: true } },
  dos:       { label: 'DOS',       settings: { procDecimate: true, procTargetTris: 300,  procTexSize: '128x64', procTexMode: 'fixed', procPalette: 'extract', procColors: 32, procDither: false } },
  gameboy:   { label: 'Game Boy',  settings: { procDecimate: true, procTargetTris: 300,  procTexSize: '32',  procTexMode: 'fixed', procPalette: 'preset', procPreset: 'gameboy', procDither: true } },
  pico8:     { label: 'PICO-8',    settings: { procDecimate: true, procTargetTris: 300,  procTexSize: '32',  procTexMode: 'fixed', procPalette: 'preset', procPreset: 'pico8', procDither: true } },
  print:     { label: '3D print',  settings: { procDecimate: true, procTargetTris: 3000, procTexSize: '256', procTexMode: 'fixed', procTexFilter: 'edge', procSaturation: 1.3, procContrast: 1.15, procPalette: 'extract', procColors: 8, procDither: false } },
};

const LOOK_KEYS = [
  'renderScale', 'vertexSnap', 'snapPrecision', 'colorDepth', 'ditherPattern', 'affineWarp', 'textureFilter',
  'bgColor', 'ambientIntensity', 'keyLightIntensity', 'lightColor', 'exposure', 'fogDensity', 'fogColor',
  'crtCurvature', 'scanlines', 'scanlineOpacity', 'vignette', 'chromaticAberration', 'filmGrain', 'colorGrade', 'bloom', 'bloomIntensity',
];
const TARGET_KEYS = [...new Set(Object.values(PROCESS_TARGETS).flatMap(t => Object.keys(t.settings)))];

let applying = false;

export function applyLook(name) {
  const p = LOOK_PRESETS[name];
  if (!p) return;
  const base = Object.fromEntries(LOOK_KEYS.map(k => [k, defaults[k]]));
  applying = true;
  try { store.setMany({ ...base, ...p.settings, lookPreset: name, lookEnabled: true }); } finally { applying = false; }
}

export function applyTarget(name) {
  const t = PROCESS_TARGETS[name];
  if (!t) return;
  const extra = {};
  if (t.settings.procTexSize) extra.procTexLast = t.settings.procTexSize;
  if (t.settings.procPalette) extra.procPaletteLast = t.settings.procPalette;
  const base = Object.fromEntries(TARGET_KEYS.map(k => [k, defaults[k]]));
  applying = true;
  try { store.setMany({ ...base, ...t.settings, ...extra, procTarget: name }); } finally { applying = false; }
}

// Manual changes turn the matching selector back to "custom".
store.subscribe('*', key => {
  if (applying) return;
  if (LOOK_KEYS.includes(key) && store.get('lookPreset') !== 'custom') store.set('lookPreset', 'custom');
  if (TARGET_KEYS.includes(key) && store.get('procTarget') !== 'custom') store.set('procTarget', 'custom');
});
