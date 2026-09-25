import { store, defaults, PANEL_KEYS } from '../../store.js';

function mkSwitch(id, checked) {
  return `
    <label class="switch-wrap" for="${id}" aria-label="${id}">
      <input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-thumb"></span></span>
    </label>
  `;
}

export function buildRenderPanel(el, { onReset } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Geometry</span>

      <div class="panel-row">
        <label for="sl-renderscale">Render Scale<br><small style="color:var(--c-text-faint);font-size:10px;">Internal buffer resolution</small></label>
        <div class="row-right">
          <input type="range" id="sl-renderscale" min="0.05" max="1" step="0.05" value="${s.renderScale}" />
          <span class="row-value" id="lbl-renderscale"></span>
        </div>
      </div>

      <div class="panel-row">
        <label for="sw-vertexsnap">Vertex Snap</label>
        <div class="row-right">${mkSwitch('sw-vertexsnap', s.vertexSnap)}</div>
      </div>

      <div class="panel-row">
        <label for="sl-snapprecision">Snap Precision</label>
        <div class="row-right">
          <input type="range" id="sl-snapprecision" min="8" max="512" step="8" value="${s.snapPrecision}" />
          <span class="row-value" id="lbl-snapprecision">${s.snapPrecision}</span>
        </div>
      </div>

      <span class="panel-section-label">Shading</span>

      <div class="panel-row">
        <label for="sel-colordepth">Color Depth</label>
        <div class="row-right">
          <select id="sel-colordepth">
            <option value="15bit" ${s.colorDepth === '15bit' ? 'selected' : ''}>15-bit (32,768)</option>
            <option value="24bit" ${s.colorDepth === '24bit' ? 'selected' : ''}>24-bit (16M)</option>
          </select>
        </div>
      </div>

      <div class="panel-row">
        <label for="sel-dither">Dither Pattern</label>
        <div class="row-right">
          <select id="sel-dither">
            <option value="bayer4" ${s.ditherPattern === 'bayer4' ? 'selected' : ''}>Bayer 4×4</option>
            <option value="bayer2" ${s.ditherPattern === 'bayer2' ? 'selected' : ''}>Bayer 2×2</option>
            <option value="none" ${s.ditherPattern === 'none' ? 'selected' : ''}>None</option>
          </select>
        </div>
      </div>

      <div class="panel-row">
        <label for="sw-affinewarp">Affine Texture Warp</label>
        <div class="row-right">${mkSwitch('sw-affinewarp', s.affineWarp)}</div>
      </div>

      <div class="panel-row">
        <label>Texture Filter</label>
        <div class="row-right">
          <div class="seg-control" id="seg-texfilter">
            <button data-val="nearest" class="${s.textureFilter === 'nearest' ? 'active' : ''}">Nearest</button>
            <button data-val="linear" class="${s.textureFilter === 'linear' ? 'active' : ''}">Bilinear</button>
          </div>
        </div>
      </div>

      <span class="panel-section-label">Display</span>

      <div class="panel-row">
        <label for="sw-backface">Backface Culling</label>
        <div class="row-right">${mkSwitch('sw-backface', s.backfaceCulling)}</div>
      </div>

      <span class="panel-section-label">Overlays <small style="color:var(--c-text-faint);font-size:10px;">(rendered full-res)</small></span>

      <div class="panel-row">
        <label for="sw-wireframe">Wireframe</label>
        <div class="row-right">${mkSwitch('sw-wireframe', s.wireframe)}</div>
      </div>

      <div class="panel-row">
        <label for="sw-grid">Ground Grid</label>
        <div class="row-right">${mkSwitch('sw-grid', s.showGrid)}</div>
      </div>

      <div style="padding:12px 0 4px;">
        <button class="btn btn-ghost" id="btn-reset-render" style="width:100%">Reset to Defaults</button>
      </div>
    </div>
  `;

  const slScale = el.querySelector('#sl-renderscale');
  const lblScale = el.querySelector('#lbl-renderscale');
  function updateScaleLbl(v) {
    const vp = document.querySelector('#canvas');
    const dpr = window.devicePixelRatio || 1;
    const pw = vp ? Math.round(vp.clientWidth * dpr * v) : '?';
    const ph = vp ? Math.round(vp.clientHeight * dpr * v) : '?';
    lblScale.textContent = `${pw}×${ph}`;
  }
  updateScaleLbl(parseFloat(slScale.value));
  slScale.addEventListener('input', () => {
    const v = parseFloat(slScale.value);
    store.set('renderScale', v);
    updateScaleLbl(v);
  });

  const slSnap = el.querySelector('#sl-snapprecision');
  const lblSnap = el.querySelector('#lbl-snapprecision');
  slSnap.addEventListener('input', () => {
    const v = parseInt(slSnap.value);
    store.set('snapPrecision', v);
    lblSnap.textContent = v;
  });

  el.querySelector('#sw-vertexsnap').addEventListener('change', e => store.set('vertexSnap', e.target.checked));
  el.querySelector('#sw-affinewarp').addEventListener('change', e => store.set('affineWarp', e.target.checked));
  el.querySelector('#sw-wireframe').addEventListener('change', e => store.set('wireframe', e.target.checked));
  el.querySelector('#sw-backface').addEventListener('change', e => store.set('backfaceCulling', e.target.checked));
  el.querySelector('#sw-grid').addEventListener('change', e => store.set('showGrid', e.target.checked));
  el.querySelector('#sel-colordepth').addEventListener('change', e => store.set('colorDepth', e.target.value));
  el.querySelector('#sel-dither').addEventListener('change', e => store.set('ditherPattern', e.target.value));

  el.querySelector('#seg-texfilter').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector('#seg-texfilter .active')?.classList.remove('active');
      btn.classList.add('active');
      store.set('textureFilter', btn.dataset.val);
    });
  });

  el.querySelector('#btn-reset-render').addEventListener('click', () => {
    if (!confirm('Reset all Render settings to defaults?')) return;
    const reset = {};
    PANEL_KEYS.render.forEach(k => { reset[k] = defaults[k]; });
    store.setMany(reset);
    onReset?.();
  });
}
