import { state, updateUniforms, applyClayMode, setPixelRatio } from './scene.js';
import { exportPNG, exportWebM } from './export.js';
import { loadFromFile } from './loader.js';

const panel = document.getElementById('panel');

function fmt(v, dec = 2) {
  return parseFloat(v).toFixed(dec);
}

function makeSection(title) {
  const sec = document.createElement('div');
  sec.className = 'section';

  const hdr = document.createElement('div');
  hdr.className = 'section-header';
  hdr.innerHTML = `${title} <span class="arrow">▾</span>`;

  const body = document.createElement('div');
  body.className = 'section-body';

  hdr.addEventListener('click', () => {
    hdr.classList.toggle('collapsed');
    body.classList.toggle('collapsed');
  });

  sec.appendChild(hdr);
  sec.appendChild(body);
  panel.appendChild(sec);
  return body;
}

function row(parent, label, children) {
  const r = document.createElement('div');
  r.className = 'row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  r.appendChild(lbl);

  children.forEach(c => r.appendChild(c));
  parent.appendChild(r);
  return r;
}

function slider(min, max, step, initial, onChange) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flex = '1';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '4px';

  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = min;
  inp.max = max;
  inp.step = step;
  inp.value = initial;
  inp.style.flex = '1';

  const val = document.createElement('span');
  val.className = 'val';
  val.textContent = fmt(initial);

  inp.addEventListener('input', () => {
    val.textContent = fmt(inp.value);
    onChange(parseFloat(inp.value));
  });

  wrap.appendChild(inp);
  wrap.appendChild(val);
  return wrap;
}

function toggle(initial, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'toggle-wrap';

  const label = document.createElement('label');
  label.className = 'toggle';

  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = initial;

  const slider = document.createElement('span');
  slider.className = 'toggle-slider';

  inp.addEventListener('change', () => onChange(inp.checked));
  label.appendChild(inp);
  label.appendChild(slider);
  wrap.appendChild(label);
  return wrap;
}

function colorPicker(initial, onChange) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = initial;
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}

function btn(text, onClick) {
  const b = document.createElement('button');
  b.className = 'btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// ---- Viewport reference stored from init ----
let _container;

export function initUI(container) {
  _container = container;

  // ----- PSX Effects -----
  const psx = makeSection('PSX Effects');

  row(psx, 'Pixelation', [
    slider(0.05, 1.0, 0.01, state.pixelRatio, v => {
      state.pixelRatio = v;
      setPixelRatio(v, container);
    })
  ]);

  row(psx, 'Vtx Snap', [
    toggle(state.snapVertices, v => { state.snapVertices = v; updateUniforms(); })
  ]);
  row(psx, 'Snap Res', [
    slider(16, 512, 1, state.snapResolution, v => { state.snapResolution = v; updateUniforms(); })
  ]);
  row(psx, 'Affine UV', [
    toggle(state.useAffineUV, v => { state.useAffineUV = v; updateUniforms(); })
  ]);
  row(psx, 'Dithering', [
    toggle(state.useDither, v => { state.useDither = v; updateUniforms(); })
  ]);
  row(psx, 'Dither γ', [
    slider(1.0, 3.0, 0.05, state.ditherGamma, v => { state.ditherGamma = v; updateUniforms(); })
  ]);
  row(psx, 'Exposure', [
    slider(0.1, 3.0, 0.05, state.exposure, v => { state.exposure = v; updateUniforms(); })
  ]);
  row(psx, 'Brightness', [
    slider(-1.0, 1.0, 0.01, state.brightness, v => { state.brightness = v; updateUniforms(); })
  ]);
  row(psx, 'Contrast', [
    slider(0.1, 3.0, 0.05, state.contrast, v => { state.contrast = v; updateUniforms(); })
  ]);

  // ----- Lighting -----
  const light = makeSection('Lighting');

  row(light, 'Dir Intensity', [
    slider(0, 3, 0.05, state.dirIntensity, v => { state.dirIntensity = v; updateUniforms(); })
  ]);
  row(light, 'Dir Pitch', [
    slider(-90, 90, 1, state.dirPitch, v => { state.dirPitch = v; updateUniforms(); })
  ]);
  row(light, 'Dir Yaw', [
    slider(-180, 180, 1, state.dirYaw, v => { state.dirYaw = v; updateUniforms(); })
  ]);
  row(light, 'Ambient', [
    slider(0, 2, 0.05, state.ambientIntensity, v => { state.ambientIntensity = v; updateUniforms(); })
  ]);

  // ----- CRT Effects -----
  const crt = makeSection('CRT Effects');

  row(crt, 'Scanlines', [
    toggle(state.scanlines, v => { state.scanlines = v; updateUniforms(); }),
    slider(0, 1, 0.01, state.scanlineIntensity, v => { state.scanlineIntensity = v; updateUniforms(); })
  ]);
  row(crt, 'Vignette', [
    toggle(state.vignette, v => { state.vignette = v; updateUniforms(); }),
    slider(0, 1, 0.01, state.vignetteDarkness, v => { state.vignetteDarkness = v; updateUniforms(); })
  ]);
  row(crt, 'Chromatic Ab', [
    toggle(state.chromaticAberration, v => { state.chromaticAberration = v; updateUniforms(); }),
    slider(0, 5, 0.1, state.chromaticAberrationAmount, v => { state.chromaticAberrationAmount = v; updateUniforms(); })
  ]);
  row(crt, 'Film Grain', [
    toggle(state.filmGrain, v => { state.filmGrain = v; updateUniforms(); }),
    slider(0, 2, 0.05, state.grainIntensity, v => { state.grainIntensity = v; updateUniforms(); })
  ]);
  row(crt, 'Warble', [
    toggle(state.warble, v => { state.warble = v; updateUniforms(); }),
    slider(0, 5, 0.1, state.warbleAmount, v => { state.warbleAmount = v; updateUniforms(); })
  ]);

  // ----- Scene -----
  const scn = makeSection('Scene');

  row(scn, 'Background', [
    colorPicker(state.bgColor, v => { state.bgColor = v; updateUniforms(); })
  ]);
  row(scn, 'Clay Mode', [
    toggle(state.clayMode, v => applyClayMode(v))
  ]);
  row(scn, 'Turntable', [
    toggle(state.turntable, v => { state.turntable = v; }),
    slider(0.1, 3.0, 0.05, state.turntableSpeed, v => { state.turntableSpeed = v; })
  ]);

  // ----- Load Model -----
  const load = makeSection('Load Model');

  const fileBtn = btn('Open File…', () => document.getElementById('file-input').click());
  fileBtn.id = 'file-pick-btn';
  load.appendChild(fileBtn);

  const dropHint = document.createElement('div');
  dropHint.style.cssText = 'font-size:0.66rem;color:#444;text-align:center;padding:4px 0 2px;';
  dropHint.textContent = 'or drag & drop .glb .obj .fbx .ply';
  load.appendChild(dropHint);

  // ----- Export -----
  const exp = makeSection('Export');

  const exportRow = document.createElement('div');
  exportRow.className = 'row';
  exportRow.appendChild(btn('PNG', exportPNG));
  exportRow.appendChild(btn('WebM (1 rot)', exportWebM));
  exp.appendChild(exportRow);
}
