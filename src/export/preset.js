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

// Look presets. Each one starts from the defaults (see applyPreset) so no
// setting leaks over from the previously chosen preset. Triangle budgets and
// texture sizes are typical per-character values for each platform.
export const PRESETS = {
  ps1: {
    label: 'PlayStation', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 800, procFlat: false, procTexSize: '128', procPalette: '15bit', procDither: true,
      renderScale: 0.25, vertexSnap: true, snapPrecision: 64, colorDepth: '15bit', ditherPattern: 'bayer4',
      affineWarp: true, textureFilter: 'nearest',
      crtCurvature: 0.1, scanlines: 0.4, scanlineOpacity: 0.25, vignette: 0.3, chromaticAberration: 0.1, filmGrain: 0.05,
    },
  },
  ps1Clean: {
    label: 'PlayStation (no CRT)', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 800, procFlat: false, procTexSize: '128', procPalette: '15bit', procDither: true,
      renderScale: 0.25, vertexSnap: true, snapPrecision: 64, colorDepth: '15bit', ditherPattern: 'bayer4',
      affineWarp: true, textureFilter: 'nearest',
    },
  },
  n64: {
    label: 'Nintendo 64', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 700, procFlat: false, procTexSize: '64', procPalette: '15bit', procDither: true,
      renderScale: 0.3, vertexSnap: false, colorDepth: '15bit', ditherPattern: 'bayer2',
      affineWarp: false, textureFilter: 'linear',
      fogDensity: 0.02, vignette: 0.15,
    },
  },
  saturn: {
    label: 'Sega Saturn', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 600, procFlat: true, procTexSize: '64', procPalette: '15bit', procDither: false,
      renderScale: 0.25, vertexSnap: true, snapPrecision: 48, colorDepth: '15bit', ditherPattern: 'none',
      affineWarp: true, textureFilter: 'nearest',
      scanlines: 0.4, scanlineOpacity: 0.2, vignette: 0.2,
    },
  },
  dreamcast: {
    label: 'Sega Dreamcast', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 3000, procFlat: false, procTexSize: '256', procPalette: '15bit', procDither: true,
      renderScale: 0.6, vertexSnap: false, colorDepth: '15bit', ditherPattern: 'bayer2',
      affineWarp: false, textureFilter: 'linear',
    },
  },
  dos: {
    label: 'DOS / VGA (Quake era)', group: 'Console',
    settings: {
      procDecimate: true, procTargetTris: 400, procFlat: true, procTexSize: '128', procPalette: 'extract', procColors: 32, procDither: false,
      renderScale: 0.3, vertexSnap: false, colorDepth: '24bit', ditherPattern: 'none',
      affineWarp: false, textureFilter: 'nearest',
    },
  },
  gameboy: {
    label: 'Game Boy', group: 'Handheld',
    settings: {
      procDecimate: true, procTargetTris: 300, procFlat: true, procTexSize: '32', procPalette: 'preset', procPreset: 'gameboy', procDither: true,
      renderScale: 0.15, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#9bbc0f', ambientIntensity: 0.9, keyLightIntensity: 0.4,
    },
  },
  virtualBoy: {
    label: 'Virtual Boy', group: 'Handheld',
    settings: {
      procDecimate: true, procTargetTris: 300, procFlat: true, procTexSize: '32', procPalette: 'preset', procPreset: 'virtualBoy', procDither: true,
      renderScale: 0.2, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#000000', ambientIntensity: 0.9, keyLightIntensity: 0.4, scanlines: 0.5, scanlineOpacity: 0.3,
    },
  },
  pico8: {
    label: 'PICO-8', group: 'Fantasy',
    settings: {
      procDecimate: true, procTargetTris: 300, procFlat: true, procTexSize: '32', procPalette: 'preset', procPreset: 'pico8', procDither: true,
      renderScale: 0.12, vertexSnap: true, snapPrecision: 32, colorDepth: '24bit', ditherPattern: 'none',
      textureFilter: 'nearest', bgColor: '#1d2b53',
    },
  },
  filament: {
    label: 'Print: Bambu PLA Basic', group: 'Fabrication',
    settings: {
      procDecimate: true, procTargetTris: 1500, procFlat: true, procTexSize: '128', procPalette: 'preset', procPreset: 'bambuBasic', procDither: false,
      renderScale: 0.5, vertexSnap: false, colorDepth: '24bit', ditherPattern: 'none', textureFilter: 'nearest',
    },
  },
  horror: {
    label: 'Horror Night', group: 'Mood',
    settings: {
      renderScale: 0.2, vertexSnap: true, snapPrecision: 48, colorDepth: '15bit',
      ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
      ambientIntensity: 0.1, keyLightIntensity: 0.5, lightColor: '#334466',
      exposure: 0.7, fogDensity: 0.08, fogColor: '#111122', crtCurvature: 0.2,
      scanlines: 0.6, vignette: 0.8, colorGrade: 'coldCRT',
    },
  },
  retro: {
    label: 'Retro Arcade', group: 'Mood',
    settings: {
      renderScale: 0.25, vertexSnap: true, snapPrecision: 96, colorDepth: '15bit',
      ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
      ambientIntensity: 0.6, keyLightIntensity: 1.2, lightColor: '#ffeecc',
      exposure: 1.1, crtCurvature: 0.3, scanlines: 0.6,
      vignette: 0.5, colorGrade: 'warmVHS', bloom: true, bloomIntensity: 0.3,
    },
  },
};

const LOOK_KEYS = [
  'procDecimate', 'procTargetTris', 'procFlat', 'procTexSize', 'procTexFilter', 'procPalette', 'procPreset', 'procColors', 'procDither', 'procDitherStrength',
  'renderScale', 'vertexSnap', 'snapPrecision', 'colorDepth', 'ditherPattern', 'affineWarp', 'textureFilter',
  'bgColor', 'ambientIntensity', 'keyLightIntensity', 'lightColor', 'exposure', 'fogDensity', 'fogColor',
  'crtCurvature', 'scanlines', 'scanlineOpacity', 'vignette', 'chromaticAberration', 'filmGrain', 'colorGrade', 'bloom', 'bloomIntensity',
];

let applying = false;

// With includeProcess off, only the rendering look changes; the mesh,
// texture and palette processing stay as the user set them.
export function applyPreset(name, { includeProcess = true } = {}) {
  const p = PRESETS[name];
  if (!p) return;
  const keep = k => includeProcess || !k.startsWith('proc');
  const base = Object.fromEntries(LOOK_KEYS.filter(keep).map(k => [k, defaults[k]]));
  const settings = Object.fromEntries(Object.entries(p.settings).filter(([k]) => keep(k)));
  applying = true;
  try { store.setMany({ ...base, ...settings, lookPreset: name, lookEnabled: true }); } finally { applying = false; }
}

// Any manual change to a look setting turns the preset selector to "Custom".
store.subscribe('*', key => {
  if (!applying && LOOK_KEYS.includes(key) && store.get('lookPreset') !== 'custom') store.set('lookPreset', 'custom');
});
