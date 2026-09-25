import { store, defaults, PANEL_KEYS } from '../../store.js';

function mkSwitch(id, checked) {
  return `<label class="switch-wrap" for="${id}"><input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} /><span class="switch-track"><span class="switch-thumb"></span></span></label>`;
}

export function buildEffectsPanel(el, { onReset } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Screen</span>
      <div class="panel-row">
        <label for="sl-crt">CRT Curvature</label>
        <div class="row-right">
          <input type="range" id="sl-crt" min="0" max="1" step="0.01" value="${s.crtCurvature}" />
          <span class="row-value" id="lbl-crt">${s.crtCurvature.toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-scanlines">Scanlines Size</label>
        <div class="row-right">
          <input type="range" id="sl-scanlines" min="0" max="1" step="0.01" value="${s.scanlines}" />
          <span class="row-value" id="lbl-scanlines">${(+s.scanlines).toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-scanline-opacity">Scanlines Opacity</label>
        <div class="row-right">
          <input type="range" id="sl-scanline-opacity" min="0" max="1" step="0.01" value="${s.scanlineOpacity}" />
          <span class="row-value" id="lbl-scanline-opacity">${(+s.scanlineOpacity).toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-vignette">Vignette</label>
        <div class="row-right">
          <input type="range" id="sl-vignette" min="0" max="2" step="0.05" value="${s.vignette}" />
          <span class="row-value" id="lbl-vignette">${s.vignette.toFixed(2)}</span>
        </div>
      </div>

      <span class="panel-section-label">Color</span>
      <div class="panel-row">
        <label for="sl-ca">Chromatic Aberration</label>
        <div class="row-right">
          <input type="range" id="sl-ca" min="0" max="1" step="0.01" value="${s.chromaticAberration}" />
          <span class="row-value" id="lbl-ca">${s.chromaticAberration.toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-grain">Film Grain</label>
        <div class="row-right">
          <input type="range" id="sl-grain" min="0" max="1" step="0.01" value="${s.filmGrain}" />
          <span class="row-value" id="lbl-grain">${s.filmGrain.toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sel-grade">Color Grade</label>
        <div class="row-right">
          <select id="sel-grade">
            <option value="none" ${s.colorGrade === 'none' ? 'selected' : ''}>None</option>
            <option value="warmVHS" ${s.colorGrade === 'warmVHS' ? 'selected' : ''}>Warm VHS</option>
            <option value="coldCRT" ${s.colorGrade === 'coldCRT' ? 'selected' : ''}>Cold CRT</option>
            <option value="sepia" ${s.colorGrade === 'sepia' ? 'selected' : ''}>Sepia</option>
          </select>
        </div>
      </div>

      <span class="panel-section-label">Bloom</span>
      <div class="panel-row">
        <label for="sw-bloom">Bloom</label>
        <div class="row-right">${mkSwitch('sw-bloom', s.bloom)}</div>
      </div>
      <div class="panel-row">
        <label for="sl-bloom">Intensity</label>
        <div class="row-right">
          <input type="range" id="sl-bloom" min="0" max="2" step="0.05" value="${s.bloomIntensity}" />
          <span class="row-value" id="lbl-bloom">${s.bloomIntensity.toFixed(2)}</span>
        </div>
      </div>

      <div style="padding:12px 0 4px;">
        <button class="btn btn-ghost" id="btn-reset-fx" style="width:100%">Reset to Defaults</button>
      </div>
    </div>
  `;

  function wiredSlider(id, lblId, key) {
    const sl = el.querySelector(`#${id}`);
    const lbl = el.querySelector(`#${lblId}`);
    sl.addEventListener('input', () => { const v = parseFloat(sl.value); store.set(key, v); lbl.textContent = v.toFixed(2); });
  }

  wiredSlider('sl-crt', 'lbl-crt', 'crtCurvature');
  wiredSlider('sl-vignette', 'lbl-vignette', 'vignette');
  wiredSlider('sl-ca', 'lbl-ca', 'chromaticAberration');
  wiredSlider('sl-grain', 'lbl-grain', 'filmGrain');
  wiredSlider('sl-bloom', 'lbl-bloom', 'bloomIntensity');

  const scanSl = el.querySelector('#sl-scanlines'), scanLbl = el.querySelector('#lbl-scanlines');
  scanSl.addEventListener('input', () => { const v = parseFloat(scanSl.value); scanLbl.textContent = v.toFixed(2); store.set('scanlines', v); });
  wiredSlider('sl-scanline-opacity', 'lbl-scanline-opacity', 'scanlineOpacity');
  el.querySelector('#sw-bloom').addEventListener('change', e => store.set('bloom', e.target.checked));
  el.querySelector('#sel-grade').addEventListener('change', e => store.set('colorGrade', e.target.value));

  el.querySelector('#btn-reset-fx').addEventListener('click', () => {
    if (!confirm('Reset all Effects settings to defaults?')) return;
    const reset = {};
    PANEL_KEYS.effects.forEach(k => { reset[k] = defaults[k]; });
    store.setMany(reset);
    onReset?.();
  });
}
