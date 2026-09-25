const defaults = {
  activeTab: 'import',
  inverted: false,
  filename: null,
  filesize: null,
  tris: 0,
  fps: 0,
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
};

export { defaults };

export const PANEL_KEYS = {
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

  set(key, value) {
    this._state[key] = value;
    (this._subs.get(key) || []).forEach(fn => fn(value));
    (this._subs.get('*') || []).forEach(fn => fn(key, value));
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
