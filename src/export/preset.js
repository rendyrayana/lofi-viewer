import { store } from '../store.js';

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

export const PRESETS = {
  default: {
    renderScale: 0.25, vertexSnap: true, snapPrecision: 64, colorDepth: '15bit',
    ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
    ambientIntensity: 0.5, keyLightIntensity: 1.0, lightColor: '#ffffff',
    exposure: 1.0, fogDensity: 0.0, crtCurvature: 0.0, scanlines: false,
    vignette: 0.3, bloom: false,
  },
  horror: {
    renderScale: 0.2, vertexSnap: true, snapPrecision: 48, colorDepth: '15bit',
    ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
    ambientIntensity: 0.1, keyLightIntensity: 0.5, lightColor: '#334466',
    exposure: 0.7, fogDensity: 0.08, fogColor: '#111122', crtCurvature: 0.2,
    scanlines: true, vignette: 0.8, colorGrade: 'coldCRT', bloom: false,
  },
  retro: {
    renderScale: 0.25, vertexSnap: true, snapPrecision: 96, colorDepth: '15bit',
    ditherPattern: 'bayer4', affineWarp: true, textureFilter: 'nearest',
    ambientIntensity: 0.6, keyLightIntensity: 1.2, lightColor: '#ffeecc',
    exposure: 1.1, fogDensity: 0.0, crtCurvature: 0.3, scanlines: true,
    vignette: 0.5, colorGrade: 'warmVHS', bloom: true, bloomIntensity: 0.3,
  },
};
