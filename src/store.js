const defaults = {
  activeTab: 'import',
  lookPreset: 'custom',
  lookEnabled: true,
  procTarget: 'custom',
  loadBusy: false,
  loadMs: null,
  inverted: false,
  filename: null,
  filesize: null,
  tris: 0,
  fps: 0,
  // Process
  procDecimate: false,
  procTargetTris: 800,
  procFlat: true,
  procTexSize: 'original',
  procTexFilter: 'nearest',
  procTexMode: 'fixed',
  procTexDensity: 4,
  procSaturation: 1.0,
  procContrast: 1.0,
  procPalette: 'off',
  procPreset: 'bambuBasic',
  procColors: 8,
  procMergeShades: false,
  procCustom: ['#000000', '#ffffff', '#c12e1f', '#0a2989'],
  procDither: true,
  procDitherPattern: 'psx4',
  procDitherStrength: 1.0,
  procTexLast: '128',
  procPaletteLast: '15bit',
  procStats: null,
  procBusy: false,
  // Render
  renderScale: 0.25,
  vertexSnap: false,
  snapPrecision: 64,
  colorDepth: '15bit',
  ditherPattern: 'bayer4',
  affineWarp: false,
  textureFilter: 'nearest',
  wireframe: false,
  backfaceCulling: true,
  showGrid: true,
  // Environment
  bgType: 'color',
  bgColor: '#fafafa',
  bgGradientColor: '#222222',
  ambientIntensity: 0.5,
  keyLightIntensity: 1.0,
  lightColor: '#ffffff',
  exposure: 1.0,
  fogDensity: 0.0,
  fogColor: '#000000',
  // Camera
  projection: 'perspective',
  fov: 45,
  turntable: false,
  rotationSpeed: 1.0,
  autoFrame: true,
  aspectRatio: 'free',
  compare: false,
  compareSplit: 0.5,
  // Effects
  crtCurvature: 0.0,
  scanlines: 0,
  scanlineOpacity: 0.5,
  vignette: 0.0,
  chromaticAberration: 0.0,
  filmGrain: 0.0,
  colorGrade: 'none',
  bloom: false,
  bloomIntensity: 0.5,
  // Export
  snapshotRes: 'native',
  videoRes: 'native',
  exportDuration: 4,
  printHeight: 60,
  printFilaments: 4,
  printMinArea: 2,
  printSmooth: 1,
  printPreview: false,
  printPreviewInfo: '',
  printCloseHoles: true,
  printColorDetail: 3,
};

export { defaults };

export const PANEL_KEYS = {
  process: ['procDecimate','procTargetTris','procFlat','procTexSize','procTexFilter','procTexMode','procTexDensity','procSaturation','procContrast','procPalette','procPreset','procColors','procMergeShades','procCustom','procDither','procDitherPattern','procDitherStrength'],
  render: ['renderScale','vertexSnap','snapPrecision','colorDepth','ditherPattern','affineWarp','textureFilter','wireframe','backfaceCulling','showGrid'],
  environment: ['bgType','bgColor','bgGradientColor','ambientIntensity','keyLightIntensity','lightColor','exposure','fogDensity','fogColor'],
  effects: ['crtCurvature','scanlines','scanlineOpacity','vignette','chromaticAberration','filmGrain','colorGrade','bloom','bloomIntensity'],
  camera: ['projection','fov','turntable','rotationSpeed','autoFrame','aspectRatio'],
};

class Store {
  constructor() {
    this._state = { ...defaults };
    this._subs = new Map();
  }

  get(key) { return this._state[key]; }
  get state() { return this._state; }

  // A failing listener is logged but never stops the others (or the caller).
  set(key, value) {
    this._state[key] = value;
    for (const fn of this._subs.get(key) || []) {
      try { fn(value); } catch (e) { console.error(`store listener for "${key}" failed:`, e); }
    }
    for (const fn of this._subs.get('*') || []) {
      try { fn(key, value); } catch (e) { console.error(`store "*" listener failed on "${key}":`, e); }
    }
  }

  setMany(obj) {
    for (const [k, v] of Object.entries(obj)) this.set(k, v);
  }

  subscribe(key, fn) {
    if (!this._subs.has(key)) this._subs.set(key, []);
    this._subs.get(key).push(fn);
    return () => {
      this._subs.set(key, (this._subs.get(key) || []).filter(f => f !== fn));
    };
  }
}

export const store = new Store();
