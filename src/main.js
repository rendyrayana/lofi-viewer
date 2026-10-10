import * as THREE from 'three';
import { store } from './store.js';
import { setupScene } from './scene/setup.js';
import { PSXPipeline } from './pipeline/psxPipeline.js';
import { loadModel, loadTexture, loadHDRI, countTris, formatBytes } from './scene/loaders.js';
import { initTheme } from './ui/theme.js';
import { buildTopbar } from './ui/topbar.js';
import { buildTabs } from './ui/sidebar/tabs.js';
import { buildImportPanel } from './ui/sidebar/importPanel.js';
import { buildProcessPanel } from './ui/sidebar/processPanel.js';
import { buildLookPanel } from './ui/sidebar/lookPanel.js';
import { ModelProcessor } from './process/processor.js';
import { buildExportPanel } from './ui/sidebar/exportPanel.js';
import { buildStatusIndicator } from './ui/statusIndicator.js';
import { loadPresetFromURL, getPresetData } from './export/preset.js';
import { saveViewerHtml } from './export/saveHtml.js';
import { collectFaces, prepareMesh, build3mf, buildObjMtl, downloadFile } from './export/print3mf.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { defaults, PANEL_KEYS } from './store.js';

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
let defaultCube = null;
let _depthOnlyMat = null;
const processor = new ModelProcessor();

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
  processor.attach(mesh);
}
addDefaultCube();

// ── UI ────────────────────────────────────────────────────────────────────────
buildTopbar(document.getElementById('topbar'));

const panelContent = document.getElementById('panel-content');

let panelCleanup = null;

function showPanel(tab) {
  panelCleanup?.();
  panelCleanup = null;
  panelContent.innerHTML = '';
  const div = document.createElement('div');
  panelContent.appendChild(div);

  if (tab === 'import') {
    panelCleanup = buildImportPanel(div, {
      onLoadModel: handleLoadModel,
      onLoadTexture: handleLoadTexture,
      onLoadHDRI: handleLoadHDRI,
      onClearScene: handleClearScene,
    });
  } else if (tab === 'process') {
    panelCleanup = buildProcessPanel(div, {
      onRerunFresh: () => { processor.clearCache(); scheduleProcess(); },
      onCopyMetrics: copyMetrics,
      getPreview: () => processor.entries.find(e => e.image)?.image ?? null,
    });
  } else if (tab === 'look') {
    const scroll = panelContent.scrollTop;
    panelCleanup = buildLookPanel(div, {
      environment: { onBgTypeChange: applyBackground, onBgImageLoad: handleBgImageLoad },
      camera: {
        onProjectionChange: (type) => { sc.setCamera(type); pipeline.camera = sc.camera; },
        onResetView: () => sc.resetView(),
      },
      onRebuild: () => showPanel('look'),
    });
    panelContent.scrollTop = scroll;
  } else if (tab === 'export') {
    panelCleanup = buildExportPanel(div, () => sc.renderer, () => pipeline, () => sc.controls, enterViewerMode, handleSaveHtml, { onExportPrint: handleExportPrint, onExportGlb: handleExportGlb });
  }
}

if (!['import', 'process', 'look', 'export'].includes(store.get('activeTab'))) store.set('activeTab', 'import');
buildTabs(document.getElementById('tab-strip'));
buildStatusIndicator(document.getElementById('status-wrap'));
store.subscribe('activeTab', tab => { panelContent.scrollTop = 0; showPanel(tab); });
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
  <button class="tb-btn" id="tb-compare" aria-label="Compare with original scan" aria-pressed="false" title="Compare with original">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="1" y="2" width="12" height="10" rx="1"/><path d="M7 0.5v13"/>
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
  <div class="tb-divider"></div>
  <button class="tb-btn" id="tb-viewer" aria-label="Viewer mode" aria-pressed="false" title="Viewer mode — hide the editor">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"/><circle cx="8" cy="8" r="2"/>
    </svg>
  </button>
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
const tbCompare = toolbar.querySelector('#tb-compare');
tbCompare.addEventListener('click', () => store.set('compare', !store.get('compare')));

// Compare overlay: draggable divider; left = original scan, right = processed.
const compareEl = document.createElement('div');
compareEl.id = 'compare-overlay';
compareEl.hidden = true;
compareEl.innerHTML = `
  <span class="cmp-label cmp-left">Original scan</span>
  <span class="cmp-label cmp-right">Processed</span>
  <div class="cmp-line"></div>
  <button class="cmp-handle" aria-label="Drag to move the comparison divider" title="Drag · ← → keys"></button>
`;
document.getElementById('viewport').appendChild(compareEl);
const cmpLine = compareEl.querySelector('.cmp-line');
const cmpHandle = compareEl.querySelector('.cmp-handle');
const cmpLeft = compareEl.querySelector('.cmp-left');
const cmpRight = compareEl.querySelector('.cmp-right');

function layoutCompare() {
  const r = canvas.getBoundingClientRect(), vp = compareEl.parentElement.getBoundingClientRect();
  const x = r.left - vp.left + r.width * store.get('compareSplit');
  cmpLine.style.left = `${x}px`;
  cmpHandle.style.left = `${x}px`;
  cmpLeft.style.right = `${vp.width - x + 8}px`;
  cmpRight.style.left = `${x + 8}px`;
  compareEl.style.setProperty('--cmp-top', `${r.top - vp.top}px`);
  compareEl.style.setProperty('--cmp-h', `${r.height}px`);
  compareEl.style.setProperty('--cmp-l', `${r.left - vp.left}px`);
  compareEl.style.setProperty('--cmp-w', `${r.width}px`);
}

cmpHandle.addEventListener('pointerdown', e => {
  e.preventDefault();
  e.stopPropagation();
  cmpHandle.setPointerCapture(e.pointerId);
  const move = ev => {
    const r = canvas.getBoundingClientRect();
    store.set('compareSplit', Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)));
  };
  const up = () => {
    cmpHandle.removeEventListener('pointermove', move);
    cmpHandle.removeEventListener('pointerup', up);
  };
  cmpHandle.addEventListener('pointermove', move);
  cmpHandle.addEventListener('pointerup', up);
});
cmpHandle.addEventListener('keydown', e => {
  const d = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
  if (!d) return;
  e.preventDefault();
  store.set('compareSplit', Math.min(1, Math.max(0, store.get('compareSplit') + d)));
});

store.subscribe('compare', on => {
  compareEl.hidden = !on;
  tbCompare.classList.toggle('active', on);
  tbCompare.setAttribute('aria-pressed', String(on));
  if (on) layoutCompare();
});
store.subscribe('compareSplit', layoutCompare);
window.addEventListener('resize', () => { if (store.get('compare')) layoutCompare(); });

const cleanBg = new THREE.Color();

// Full-frame plain shading of the processed model (Look switched off).
function renderClean() {
  const r = sc.renderer;
  processor.withClean(false, () => {
    const prevCS = r.outputColorSpace, prevBg = sc.scene.background;
    r.outputColorSpace = THREE.SRGBColorSpace;
    if (prevBg?.isColor) sc.scene.background = cleanBg.set(store.get('bgColor'));
    r.setRenderTarget(null);
    r.render(sc.scene, sc.camera);
    r.outputColorSpace = prevCS;
    sc.scene.background = prevBg;
  });
}

// Plain-shaded print preview in place of the processed meshes.
function renderPrintPreview() {
  const r = sc.renderer;
  const prevCS = r.outputColorSpace, prevBg = sc.scene.background;
  processor.entries.forEach(e => { e.mesh.visible = false; });
  previewGroup.visible = true;
  r.outputColorSpace = THREE.SRGBColorSpace;
  if (prevBg?.isColor) sc.scene.background = cleanBg.set(store.get('bgColor'));
  r.setRenderTarget(null);
  r.render(sc.scene, sc.camera);
  r.outputColorSpace = prevCS;
  sc.scene.background = prevBg;
  previewGroup.visible = false;
  processor.entries.forEach(e => { e.mesh.visible = true; });
}

function renderCompareOriginal() {
  const r = sc.renderer;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const split = Math.round(w * store.get('compareSplit'));
  if (split <= 0) return;
  processor.withClean(true, () => {
    const prevCS = r.outputColorSpace, prevBg = sc.scene.background;
    r.outputColorSpace = THREE.SRGBColorSpace;
    if (prevBg?.isColor) sc.scene.background = cleanBg.set(store.get('bgColor'));
    r.setRenderTarget(null);
    r.setScissorTest(true);
    r.setScissor(0, 0, split, h);
    r.render(sc.scene, sc.camera);
    r.setScissorTest(false);
    r.outputColorSpace = prevCS;
    sc.scene.background = prevBg;
  });
}

toolbar.querySelector('#tb-play').addEventListener('click', () => {
  store.set('turntable', !store.get('turntable'));
});
document.getElementById('viewer-exit').addEventListener('click', exitViewerMode);
const tbViewer = toolbar.querySelector('#tb-viewer');
tbViewer.addEventListener('click', () => {
  if (document.documentElement.hasAttribute('data-viewer')) exitViewerMode(); else enterViewerMode();
});
// Keep the toolbar button in sync however viewer mode is entered or left.
function syncViewerButton() {
  const on = document.documentElement.hasAttribute('data-viewer');
  tbViewer.classList.toggle('active', on);
  tbViewer.setAttribute('aria-pressed', String(on));
  tbViewer.title = on ? 'Back to the editor' : 'Viewer mode — hide the editor';
}
new MutationObserver(syncViewerButton).observe(document.documentElement, { attributes: true, attributeFilter: ['data-viewer'] });
syncViewerButton();
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
  const t0 = performance.now();
  store.setMany({ loadBusy: true, loadMs: null });
  try {
    const obj = await loadModel(file);
    handleClearScene(false);
    // Remove default cube when a real model loads
    if (defaultCube) { sc.scene.remove(defaultCube); defaultCube.geometry.dispose(); defaultCube = null; }
    loadedModel = obj;
    sc.scene.add(obj);
    pipeline.applyToScene();
    processor.attach(obj);

    const tris = countTris(obj);
    store.setMany({
      filename: file.name,
      filesize: formatBytes(file.size),
      tris,
    });

    if (store.get('autoFrame')) sc.frameObject(obj);
    store.set('loadMs', performance.now() - t0);
    store.set('loadBusy', false);
    await runProcess();
  } catch (e) {
    console.error('Load error:', e);
    alert(`Failed to load model: ${e.message}`);
  } finally {
    store.set('loadBusy', false);
  }
}

async function handleLoadTexture(file) {
  if (!loadedModel) return;
  const tex = await loadTexture(file);
  loadedModel.traverse(child => {
    if (child.isMesh && child.material) {
      child.material.uniforms.map.value = tex;
      child.material.uniforms.uHasMap.value = true;
    }
  });
  processor.setSourceMap(tex);
  scheduleProcess();
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
  processor.detach();
  disposePreview();
  pipeline.psxMaterials.forEach(m => m.dispose());
  pipeline.psxMaterials = [];
  pipeline.psxMeshes = [];
  if (resetStore) store.setMany({ filename: null, filesize: null, tris: 0, procStats: null });
}

// ── Process (decimate → rebake/downsample → palette) ──────────────────────────
let procTimer = null, procRunning = false, procQueued = false;

function scheduleProcess() {
  clearTimeout(procTimer);
  procTimer = setTimeout(() => { procTimer = null; runProcess(); }, 60);
}

let idleWaiters = [];
// Resolves once no processing run is active or queued.
function processingIdle() {
  return !procRunning && !procQueued ? Promise.resolve() : new Promise(r => idleWaiters.push(r));
}

async function runProcess() {
  if (!processor.hasModel) { store.set('procStats', null); return; }
  if (procRunning) { procQueued = true; return; }
  procRunning = true;
  try {
    store.set('procBusy', true);
    // Let the "Processing…" status paint before the synchronous heavy work.
    // Frames stop when the page is hidden, so a timer caps the wait.
    if (!document.hidden) {
      await Promise.race([
        new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
        new Promise(r => setTimeout(r, 100)),
      ]);
    }
    const s = store.state;
    const stats = await processor.run({
      decimate: s.procDecimate,
      targetTris: s.procTargetTris,
      flat: s.procFlat,
      texSize: s.procTexSize,
      texFilter: s.procTexFilter,
      texMode: s.procTexMode,
      texDensity: s.procTexDensity,
      printHeight: s.printHeight,
      saturation: s.procSaturation,
      contrast: s.procContrast,
      palette: s.procPalette,
      preset: s.procPreset,
      colors: s.procColors,
      custom: s.procCustom,
      dither: s.procDither,
      ditherPattern: s.procDitherPattern,
      ditherStrength: s.procDitherStrength,
    });
    pipeline.rebuildWireframeOverlay();
    store.setMany({ tris: stats.tris, procStats: stats });
  } catch (e) {
    console.error('Process error:', e);
    alert(`Processing failed: ${e.message}`);
  } finally {
    procRunning = false;
    store.set('procBusy', false);
    if (procQueued) {
      procQueued = false;
      runProcess();
    } else {
      idleWaiters.forEach(r => r());
      idleWaiters = [];
    }
  }
}

PANEL_KEYS.process.forEach(k => store.subscribe(k, scheduleProcess));
// Texel density is defined per centimetre of the printed size.
store.subscribe('printHeight', () => { if (store.get('procTexMode') === 'density' && store.get('procTexSize') !== 'original') scheduleProcess(); });

function gpuName() {
  const gl = sc.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

async function copyMetrics(format) {
  const st = store.get('procStats');
  if (!st) return false;
  const settings = Object.fromEntries(PANEL_KEYS.process.map(k => [k.replace(/^proc/, '').replace(/^./, c => c.toLowerCase()), store.get(k)]));
  const row = {
    model: store.get('filename') || 'default-cube',
    srcTris: st.srcTris, tris: st.tris, charts: st.charts,
    atlasCoverage: st.coverage != null ? +(st.coverage * 100).toFixed(2) : null,
    texture: st.texW ? `${st.texW}x${st.texH}` : null,
    colors: st.colors, palette: st.palette,
    totalMs: st.ms, ...Object.fromEntries(Object.entries(st.timings).map(([k, v]) => [`${k}Ms`, v])),
    ...settings,
    gpu: gpuName(), cpuThreads: navigator.hardwareConcurrency, userAgent: navigator.userAgent,
    date: new Date().toISOString(),
  };
  let text;
  if (format === 'csv') {
    const cell = v => {
      const str = Array.isArray(v) ? v.join(' ') : String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    text = Object.keys(row).join(',') + '\n' + Object.values(row).map(cell).join(',');
  } else {
    text = JSON.stringify(row, null, 2);
  }
  await navigator.clipboard.writeText(text);
  return true;
}

// ── Fabrication / model export ────────────────────────────────────────────────
function exportBaseName() {
  return (store.get('filename') || 'model').replace(/\.[^.]+$/, '');
}

// Builds the coloured, cleaned print mesh from the current processed model.
async function buildPrintModel() {
  clearTimeout(procTimer);
  if (procTimer || procRunning || procQueued) {
    procTimer = null;
    if (!procRunning) runProcess();
    await processingIdle();
  }
  const s = store.state;
  const palOn = s.procPalette !== 'off';
  const fixed = ['preset', 'extract', 'custom', 'clut4', 'clut8'].includes(s.procPalette) ? processor.palette : null;
  const { parts, slots } = collectFaces(processor, {
    maxLevel: s.printColorDetail,
    adaptive: true,
    palette: fixed,
    maxFilaments: s.printFilaments,
    saturation: palOn ? s.procSaturation : 1,
    contrast: palOn ? s.procContrast : 1,
  });
  const prepared = prepareMesh(parts, {
    heightMm: s.printHeight, minAreaMm2: s.printMinArea, smooth: s.printSmooth, closeHoles: s.printCloseHoles,
  });
  return { prepared, slots };
}

// format: 'obj' (OBJ + MTL, Bambu colour matching) or '3mf' (Orca / PrusaSlicer paint)
async function handleExportPrint(format = '3mf') {
  if (!processor.hasModel) return 'Load a model first.';
  if (store.get('tris') > 200000 && !confirm(`The model has ${store.get('tris').toLocaleString()} triangles. Decimating first is recommended for printing. Export anyway?`)) return '';
  const { prepared, slots } = await buildPrintModel();
  const name = exportBaseName();
  if (format === 'obj') {
    const { obj, mtl, base } = buildObjMtl(prepared, slots, { name });
    downloadFile(obj, `${base}.obj`, 'text/plain');
    // A short gap lets the browser treat the second file as its own download.
    await new Promise(r => setTimeout(r, 400));
    downloadFile(mtl, `${base}.mtl`, 'text/plain');
  } else {
    downloadFile(build3mf(prepared, slots, { name }), `${name}-lofi.3mf`, 'model/3mf');
  }
  const st = prepared.stats;
  const lines = [`${st.triangles.toLocaleString()} tris · ${slots.length} filaments · ${st.sizeMm.map(v => v.toFixed(0)).join('×')} mm`];
  if (format === 'obj') lines.push('Keep the .obj and .mtl together, then open the .obj in Bambu Studio.');
  if (st.holesClosed) lines.push(`Closed ${st.holesClosed} hole${st.holesClosed > 1 ? 's' : ''}`);
  if (st.facesSmoothed) lines.push(`Smoothed ${st.facesSmoothed.toLocaleString()} edge faces`);
  if (st.islandsMerged) lines.push(`Merged ${st.islandsMerged} color specks (${st.facesRecolored.toLocaleString()} faces)`);
  if (st.openEdges || st.nonManifoldEdges) {
    lines.push(`Warning: not watertight — ${st.openEdges} open, ${st.nonManifoldEdges} non-manifold edges. The slicer may need to repair it.`);
  } else {
    lines.push('Watertight ✓');
  }
  return lines.join('\n');
}

// ── Print preview: the exact per-face filament colours in the viewport ───────
let previewGroup = null, previewTimer = null, previewToken = 0;

function disposePreview() {
  if (!previewGroup) return;
  sc.scene.remove(previewGroup);
  previewGroup.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  previewGroup = null;
}

function schedulePreview() {
  clearTimeout(previewTimer);
  if (!store.get('printPreview')) { disposePreview(); store.set('printPreviewInfo', ''); return; }
  previewTimer = setTimeout(refreshPreview, 250);
}

async function refreshPreview() {
  if (!store.get('printPreview') || !processor.hasModel) return;
  const token = ++previewToken;
  store.set('printPreviewInfo', 'Building preview…');
  try {
    const { prepared, slots } = await buildPrintModel();
    if (token !== previewToken || !store.get('printPreview')) return;
    disposePreview();
    const colors = slots.map(h => new THREE.Color(h));
    previewGroup = new THREE.Group();
    previewGroup.visible = false;
    for (const m of prepared.meshes) {
      const nF = m.tris.length / 4;
      const pos = new Float32Array(nF * 9), col = new Float32Array(nF * 9);
      for (let f = 0; f < nF; f++) {
        const c = colors[m.tris[f * 4 + 3]];
        for (let k = 0; k < 3; k++) {
          const v = m.tris[f * 4 + k] * 3, o = (f * 3 + k) * 3;
          pos[o] = m.world[v]; pos[o + 1] = m.world[v + 1]; pos[o + 2] = m.world[v + 2];
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      previewGroup.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false })));
    }
    sc.scene.add(previewGroup);
    store.set('printPreviewInfo', `Preview: ${prepared.stats.triangles.toLocaleString()} faces · ${slots.length} filaments`);
  } catch (e) {
    console.error('Print preview failed:', e);
    store.set('printPreviewInfo', `Preview failed: ${e.message}`);
  }
}

['printPreview', 'printColorDetail', 'printSmooth', 'printMinArea', 'printCloseHoles', 'printFilaments', 'procStats']
  .forEach(k => store.subscribe(k, schedulePreview));

function buildProcessedGlb() {
  const root = new THREE.Group();
  for (const { mesh } of processor.entries) {
    mesh.updateWorldMatrix(true, false);
    const u = mesh.material.uniforms;
    const map = u.uHasMap.value ? u.map.value : null;
    const mat = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : u.diffuse.value, roughness: 1, metalness: 0 });
    const out = new THREE.Mesh(mesh.geometry, mat);
    out.name = mesh.name;
    out.applyMatrix4(mesh.matrixWorld);
    root.add(out);
  }
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, glb => {
      root.traverse(o => o.material?.dispose());
      resolve(glb);
    }, reject, { binary: true });
  });
}

async function handleExportGlb() {
  if (!processor.hasModel) return;
  try {
    const glb = await buildProcessedGlb();
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${exportBaseName()}-lofi.glb`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert(`GLB export failed: ${err.message || err}`);
  }
}

// The HTML viewer embeds the processed model, so it matches the editor.
async function handleSaveHtml() {
  if (!processor.hasModel || !loadedModel) { alert('No model loaded — load a model first.'); return; }
  try {
    const glb = await buildProcessedGlb();
    const file = new File([glb], `${exportBaseName()}.glb`, { type: 'model/gltf-binary' });
    await saveViewerHtml(file, null, {
      pos:    sc.perspCamera.position.toArray(),
      target: sc.controls.target.toArray(),
      near:   sc.perspCamera.near,
      far:    sc.perspCamera.far,
      fov:    sc.perspCamera.fov,
    });
  } catch (err) {
    alert(`HTML export failed: ${err.message || err}`);
  }
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

// The renderer outputs linear values unencoded (the PSX shader writes sRGB
// itself), so background colours must keep their raw sRGB values.
const bgColorObj = new THREE.Color();
function rawColor(hex) { return bgColorObj.setStyle(hex, THREE.LinearSRGBColorSpace); }

function applyBackground(type) {
  if (type === 'color') sc.scene.background = rawColor(store.get('bgColor'));
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
    sc.scene.background = rawColor(s.bgColor);
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

  if (s.printPreview && previewGroup) renderPrintPreview();
  else if (s.lookEnabled) pipeline.render(time * 0.001);
  else renderClean();
  if (s.compare && processor.hasModel) renderCompareOriginal();

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

runProcess();
requestAnimationFrame(animate);
