import * as THREE from 'three';
import { store } from './store.js';
import { setupScene } from './scene/setup.js';
import { PSXPipeline } from './pipeline/psxPipeline.js';
import { loadModel, loadTexture, loadHDRI, countTris, formatBytes } from './scene/loaders.js';
import { initTheme } from './ui/theme.js';
import { buildTopbar } from './ui/topbar.js';
import { buildTabs } from './ui/sidebar/tabs.js';
import { buildImportPanel } from './ui/sidebar/importPanel.js';
import { buildRenderPanel } from './ui/sidebar/renderPanel.js';
import { buildEnvironmentPanel } from './ui/sidebar/environmentPanel.js';
import { buildCameraPanel } from './ui/sidebar/cameraPanel.js';
import { buildEffectsPanel } from './ui/sidebar/effectsPanel.js';
import { buildExportPanel } from './ui/sidebar/exportPanel.js';
import { loadPresetFromURL, PRESETS, getPresetData } from './export/preset.js';
import { saveViewerHtml } from './export/saveHtml.js';
import { defaults } from './store.js';

// ── Init ──────────────────────────────────────────────────────────────────────
initTheme();
loadPresetFromURL();

// ── Viewer mode ───────────────────────────────────────────────────────────────
export function enterViewerMode() {
  document.documentElement.setAttribute('data-viewer', '');
  const encoded = btoa(JSON.stringify(getPresetData()));
  history.replaceState(null, '', `?viewer=1&preset=${encoded}`);
}

function exitViewerMode() {
  document.documentElement.removeAttribute('data-viewer');
  history.replaceState(null, '', location.pathname);
}

if (new URLSearchParams(location.search).get('viewer') === '1') {
  document.documentElement.setAttribute('data-viewer', '');
}

const canvas = document.getElementById('canvas');
const sc = setupScene(canvas);
const pipeline = new PSXPipeline(sc.renderer, sc.scene, sc.camera);

let loadedModel = null;
let loadedModelFile = null;
let loadedTexFile = null;
let defaultCube = null;
let _depthOnlyMat = null;

// Default cube so viewport has something to show immediately
function addDefaultCube() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.5;
  sc.scene.add(mesh);
  defaultCube = mesh;
  pipeline.applyToScene();
  store.setMany({ tris: 12 });
  sc.frameObject(mesh); // center view on the cube
}
addDefaultCube();

// ── UI ────────────────────────────────────────────────────────────────────────
buildTopbar(document.getElementById('topbar'));

const panels = {
  import: buildImportPanel,
  render: buildRenderPanel,
  environment: buildEnvironmentPanel,
  camera: buildCameraPanel,
  effects: buildEffectsPanel,
  export: buildExportPanel,
};

const panelContent = document.getElementById('panel-content');

function showPanel(tab) {
  panelContent.innerHTML = '';
  const div = document.createElement('div');
  panelContent.appendChild(div);

  if (tab === 'import') {
    buildImportPanel(div, {
      onLoadModel: handleLoadModel,
      onLoadTexture: handleLoadTexture,
      onLoadHDRI: handleLoadHDRI,
      onClearScene: handleClearScene,
    });
  } else if (tab === 'render') {
    buildRenderPanel(div, { onReset: () => showPanel('render') });
  } else if (tab === 'environment') {
    buildEnvironmentPanel(div, {
      onBgTypeChange: applyBackground,
      onBgImageLoad: handleBgImageLoad,
      onReset: () => showPanel('environment'),
    });
  } else if (tab === 'camera') {
    buildCameraPanel(div, {
      onProjectionChange: (type) => { sc.setCamera(type); pipeline.camera = sc.camera; },
      onResetView: () => sc.resetView(),
      onReset: () => showPanel('camera'),
    });
  } else if (tab === 'effects') {
    buildEffectsPanel(div, { onReset: () => showPanel('effects') });
  } else if (tab === 'export') {
    buildExportPanel(div, () => sc.renderer, () => pipeline, () => sc.controls, enterViewerMode, () => saveViewerHtml(loadedModelFile, loadedTexFile, {
      pos:    sc.perspCamera.position.toArray(),
      target: sc.controls.target.toArray(),
      near:   sc.perspCamera.near,
      far:    sc.perspCamera.far,
      fov:    sc.perspCamera.fov,
    }));
  }
}

buildTabs(document.getElementById('tab-strip'), showPanel);
showPanel(store.get('activeTab'));

// ── Camera toolbar ────────────────────────────────────────────────────────────
const toolbar = document.getElementById('cam-toolbar');
toolbar.innerHTML = `
  <button class="tb-btn" id="tb-orbit" aria-label="Orbit mode" title="Orbit">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="7" cy="7" r="5.5"/>
      <path d="M1.5 7h11M7 1.5a8 5 0 0 1 0 11M7 1.5a8 5 0 0 0 0 11"/>
    </svg>
  </button>
  <button class="tb-btn" id="tb-pan" aria-label="Pan mode" title="Pan">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M7 1v12M1 7h12M4 4l3-3 3 3M4 10l3 3 3-3M4 4 1 7l3 3M10 4l3 3-3 3"/>
    </svg>
  </button>
  <button class="tb-btn" id="tb-frame" aria-label="Frame model" title="Frame">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="9" y="1" width="4" height="4" rx="0.5"/>
      <rect x="1" y="9" width="4" height="4" rx="0.5"/><rect x="9" y="9" width="4" height="4" rx="0.5"/>
    </svg>
  </button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="tb-play" aria-label="Toggle turntable">
    <svg id="tb-play-icon" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <polygon points="2,1 11,6 2,11"/>
    </svg>
  </button>
  <span class="tb-speed" id="tb-speed">1.0×</span>
  <div class="tb-divider"></div>
  <div class="tb-seg" id="tb-proj">
    <button data-val="perspective">Persp</button>
    <button data-val="orthographic">Ortho</button>
  </div>
`;

function updateToolbarProj() {
  toolbar.querySelectorAll('#tb-proj button').forEach(b =>
    b.classList.toggle('active', b.dataset.val === store.get('projection'))
  );
}
updateToolbarProj();

const tbOrbit = toolbar.querySelector('#tb-orbit');
const tbPan   = toolbar.querySelector('#tb-pan');

function setNavMode(mode) {
  if (mode === 'orbit') {
    sc.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    tbOrbit.classList.add('active');
    tbPan.classList.remove('active');
  } else {
    sc.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    tbPan.classList.add('active');
    tbOrbit.classList.remove('active');
  }
}

setNavMode('orbit'); // default

tbOrbit.addEventListener('click', () => setNavMode('orbit'));
tbPan.addEventListener('click', () => setNavMode('pan'));
toolbar.querySelector('#tb-frame').addEventListener('click', () => {
  const target = loadedModel || defaultCube;
  if (target) sc.frameObject(target);
});
toolbar.querySelector('#tb-play').addEventListener('click', () => {
  store.set('turntable', !store.get('turntable'));
});
document.getElementById('viewer-exit').addEventListener('click', exitViewerMode);
toolbar.querySelector('#tb-proj').querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    store.set('projection', btn.dataset.val);
    sc.setCamera(btn.dataset.val);
    pipeline.camera = sc.camera; // keep pipeline in sync
    updateToolbarProj();
  });
});

store.subscribe('turntable', on => {
  const icon = toolbar.querySelector('#tb-play-icon');
  if (on) icon.innerHTML = '<rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/>';
  else icon.innerHTML = '<polygon points="2,1 11,6 2,11"/>';
});
store.subscribe('rotationSpeed', v => {
  toolbar.querySelector('#tb-speed').textContent = `${parseFloat(v).toFixed(1)}×`;
});
store.subscribe('projection', () => updateToolbarProj());

// ── Model loading ─────────────────────────────────────────────────────────────
async function handleLoadModel(file) {
  try {
    const obj = await loadModel(file);
    loadedModelFile = file;
    handleClearScene(false);
    // Remove default cube when a real model loads
    if (defaultCube) { sc.scene.remove(defaultCube); defaultCube.geometry.dispose(); defaultCube = null; }
    loadedModel = obj;
    sc.scene.add(obj);
    pipeline.applyToScene();

    const tris = countTris(obj);
    store.setMany({
      filename: file.name,
      filesize: formatBytes(file.size),
      tris,
    });

    if (store.get('autoFrame')) sc.frameObject(obj);
  } catch (e) {
    console.error('Load error:', e);
    alert(`Failed to load model: ${e.message}`);
  }
}

async function handleLoadTexture(file) {
  if (!loadedModel) return;
  loadedTexFile = file;
  const tex = await loadTexture(file);
  loadedModel.traverse(child => {
    if (child.isMesh && child.material) {
      child.material.uniforms.map.value = tex;
      child.material.uniforms.uHasMap.value = true;
    }
  });
}

async function handleLoadHDRI(file) {
  const envMap = await loadHDRI(file, sc.renderer);
  sc.scene.background = envMap;
  sc.scene.environment = envMap;
}

function handleClearScene(resetStore = true) {
  if (loadedModel) {
    sc.scene.remove(loadedModel);
    loadedModel.traverse(child => {
      if (child.isMesh) { child.geometry?.dispose(); child.material?.dispose(); }
    });
    loadedModel = null;
  }
  pipeline.psxMaterials.forEach(m => m.dispose());
  pipeline.psxMaterials = [];
  pipeline.psxMeshes = [];
  loadedTexFile = null;
  if (resetStore) store.setMany({ filename: null, filesize: null, tris: 0 });
}

// ── Env / background ──────────────────────────────────────────────────────────
let bgImageTex = null;
let _gradTex = null, _gradBgColor = null, _gradBotColor = null;

function handleBgImageLoad(file) {
  const url = URL.createObjectURL(file);
  new THREE.TextureLoader().load(url, tex => {
    if (bgImageTex) bgImageTex.dispose();
    bgImageTex = tex;
    if (store.get('bgType') === 'image') sc.scene.background = tex;
    URL.revokeObjectURL(url);
  });
}

function applyBackground(type) {
  if (type === 'color') sc.scene.background = new THREE.Color(store.get('bgColor'));
  else if (type === 'none') sc.scene.background = null;
  else if (type === 'image') sc.scene.background = bgImageTex || null;
  // gradient is applied each frame in syncEnv
}

function syncEnv() {
  const s = store.state;
  sc.ambientLight.intensity = s.ambientIntensity;
  sc.keyLight.intensity = s.keyLightIntensity;
  sc.keyLight.color.set(s.lightColor);
  sc.renderer.toneMappingExposure = s.exposure;

  // Fog is handled by the PSX shader (not Three.js scene.fog)
  sc.scene.fog = null;

  if (s.bgType === 'color') {
    sc.scene.background = new THREE.Color(s.bgColor);
  } else if (s.bgType === 'none') {
    sc.scene.background = null;
  } else if (s.bgType === 'image') {
    sc.scene.background = bgImageTex || null;
  } else if (s.bgType === 'gradient') {
    const needsUpdate = !_gradTex || _gradBgColor !== s.bgColor || _gradBotColor !== s.bgGradientColor;
    if (needsUpdate) {
      if (_gradTex) _gradTex.dispose();
      const cvs = document.createElement('canvas');
      cvs.width = 2; cvs.height = 256;
      const ctx = cvs.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, s.bgColor);
      grad.addColorStop(1, s.bgGradientColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 2, 256);
      _gradTex = new THREE.CanvasTexture(cvs);
      _gradBgColor = s.bgColor;
      _gradBotColor = s.bgGradientColor;
    }
    sc.scene.background = _gradTex;
  }

  pipeline.updateLights(sc.ambientLight, sc.keyLight);
}

// ── Import preset select ──────────────────────────────────────────────────────
document.addEventListener('change', e => {
  if (e.target.id === 'inp-preset') {
    const p = PRESETS[e.target.value];
    if (p) store.setMany(p);
  }
});

// ── HUD update ────────────────────────────────────────────────────────────────
const hudScene = document.getElementById('hud-scene');
const hudTris  = document.getElementById('hud-tris');
const hudRes   = document.getElementById('hud-res');
const hudFps   = document.getElementById('hud-fps');

store.subscribe('filename', v => { hudScene.textContent = '  ' + (v || '—'); });
store.subscribe('tris', v => { hudTris.textContent = '  ' + v.toLocaleString(); });
// Initialize HUD from current store (subscriptions fire for future changes only)
hudScene.textContent = '  ' + (store.get('filename') || '—');
hudTris.textContent = '  ' + store.get('tris').toLocaleString();

// ── Render loop ───────────────────────────────────────────────────────────────
let lastTime = performance.now(), frameCount = 0, fpsTimer = 0;

function animate(time) {
  requestAnimationFrame(animate);
  // Clamp to 100ms max so a tab coming back from sleep doesn't spin wildly.
  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  // FPS
  frameCount++;
  fpsTimer += delta;
  if (fpsTimer >= 0.5) {
    const fps = Math.round(frameCount / fpsTimer);
    store.set('fps', fps);
    hudFps.textContent = '  ' + fps;
    frameCount = 0;
    fpsTimer = 0;
  }

  // Sync state each frame
  const s = store.state;

  sc.controls.autoRotate = s.turntable;
  sc.controls.autoRotateSpeed = -(s.rotationSpeed * 2); // negative = clockwise
  sc.controls.update(delta); // pass delta so rotation is frame-rate independent

  // Camera
  const cam = sc.camera;
  if (cam.isPerspectiveCamera) { cam.fov = s.fov; cam.updateProjectionMatrix(); }

  // Render scale (compare against physical pixels to account for DPR)
  const { w: rtW, h: rtH } = pipeline.getRTSize();
  const expectedW = Math.max(1, Math.floor(sc.renderer.domElement.width * s.renderScale));
  const expectedH = Math.max(1, Math.floor(sc.renderer.domElement.height * s.renderScale));
  if (rtW !== expectedW || rtH !== expectedH) {
    pipeline.setRenderScale(s.renderScale);
    const sz = pipeline.getRTSize();
    hudRes.textContent = `  ${sz.w}×${sz.h}`;
  }

  syncEnv();
  pipeline.updateFromStore(s);

  // Depth prepass: render scene geometry to the default framebuffer with
  // colorWrite:false. This populates the screen depth buffer with real 3D
  // depths so overlays (grid, wireframe) can correctly depth-test against
  // the model. The PSX pipeline's final FX pass only clears color (not depth),
  // so this depth survives through the PSX render.
  if (s.showGrid || s.wireframe) {
    if (!_depthOnlyMat) _depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    sc.renderer.setRenderTarget(null);
    sc.scene.overrideMaterial = _depthOnlyMat;
    sc.renderer.render(sc.scene, sc.camera); // autoClear clears screen first, then writes depth
    sc.scene.overrideMaterial = null;
  }

  pipeline.render(time * 0.001);

  // Full-resolution overlays: depth-test against the prepass depth so the
  // grid is correctly occluded by the model.
  if (s.showGrid || s.wireframe) {
    sc.renderer.setRenderTarget(null);
    sc.renderer.autoClear = false;
    if (s.showGrid) sc.renderer.render(sc.helperScene, sc.camera);
    if (s.wireframe) pipeline.renderWireframeOverlay(sc.camera);
    sc.renderer.autoClear = true;
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
const ro = new ResizeObserver(() => {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  sc.renderer.setSize(w, h, false);
  pipeline.resize(w, h);
});
ro.observe(canvas.parentElement);
ro.observe(canvas); // catch aspect-ratio CSS constraint changes

// ── Drag & drop model ─────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport');
viewport.addEventListener('dragover', e => e.preventDefault());
viewport.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleLoadModel(file);
});

// ── Aspect ratio ──────────────────────────────────────────────────────────────
const ASPECT_CSS = {
  '1:1': '1/1', '4:3': '4/3', '16:9': '16/9',
  '16:10': '16/10', '3:2': '3/2', '2.39:1': '239/100',
  '320:240': '320/240', '256:224': '256/224',
};

function applyAspectRatio(ratio) {
  const viewport = document.getElementById('viewport');
  if (ratio === 'free') {
    canvas.style.aspectRatio = '';
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.style.maxWidth = '';
    canvas.style.maxHeight = '';
    viewport.style.alignItems = '';
    viewport.style.justifyContent = '';
    viewport.style.display = '';
  } else {
    canvas.style.aspectRatio = ASPECT_CSS[ratio] || '';
    canvas.style.width = 'auto';
    canvas.style.height = 'auto';
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    viewport.style.display = 'flex';
    viewport.style.alignItems = 'center';
    viewport.style.justifyContent = 'center';
  }
}
store.subscribe('aspectRatio', applyAspectRatio);

// ── Initial HUD ───────────────────────────────────────────────────────────────
const initSz = pipeline.getRTSize();
hudRes.textContent = `  ${initSz.w}×${initSz.h}`;

requestAnimationFrame(animate);
