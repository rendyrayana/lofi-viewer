import { store, defaults, PANEL_KEYS } from '../../store.js';

export function buildEnvironmentPanel(el, { onBgTypeChange, onBgImageLoad, onReset } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Background</span>
      <div class="panel-row">
        <label>Type</label>
        <div class="row-right">
          <div class="seg-control" id="seg-bgtype">
            ${['color','gradient','image','none'].map(v =>
              `<button data-val="${v}" class="${s.bgType === v ? 'active' : ''}">${v.charAt(0).toUpperCase()+v.slice(1)}</button>`
            ).join('')}
          </div>
        </div>
      </div>
      <div class="panel-row" id="row-bgcolor">
        <label for="inp-bgcolor">Color</label>
        <div class="row-right">
          <input type="color" id="inp-bgcolor" value="${s.bgColor}" />
        </div>
      </div>
      <div class="panel-row" id="row-bggrad" style="display:none;">
        <label for="inp-bggrad">Bottom Color</label>
        <div class="row-right">
          <input type="color" id="inp-bggrad" value="${s.bgGradientColor}" />
        </div>
      </div>
      <div class="panel-row" id="row-bgimage" style="display:none;">
        <input type="file" id="inp-bgimage" accept="image/*" hidden />
        <label for="inp-bgimage" class="btn btn-ghost" style="display:block;text-align:center;cursor:pointer;width:100%;">
          Load Background Image
        </label>
      </div>

      <span class="panel-section-label">Lighting</span>
      <div class="panel-row">
        <label for="sl-ambient">Ambient Intensity</label>
        <div class="row-right">
          <input type="range" id="sl-ambient" min="0" max="2" step="0.05" value="${s.ambientIntensity}" />
          <span class="row-value" id="lbl-ambient">${s.ambientIntensity.toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-keylight">Key Light Intensity</label>
        <div class="row-right">
          <input type="range" id="sl-keylight" min="0" max="4" step="0.1" value="${s.keyLightIntensity}" />
          <span class="row-value" id="lbl-keylight">${s.keyLightIntensity.toFixed(1)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="inp-lightcolor">Light Color</label>
        <div class="row-right">
          <input type="color" id="inp-lightcolor" value="${s.lightColor}" />
        </div>
      </div>

      <span class="panel-section-label">Atmosphere</span>
      <div class="panel-row">
        <label for="sl-exposure">Exposure</label>
        <div class="row-right">
          <input type="range" id="sl-exposure" min="0.1" max="4" step="0.05" value="${s.exposure}" />
          <span class="row-value" id="lbl-exposure">${s.exposure.toFixed(2)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-fog">Fog Density</label>
        <div class="row-right">
          <input type="range" id="sl-fog" min="0" max="0.5" step="0.005" value="${s.fogDensity}" />
          <span class="row-value" id="lbl-fog">${s.fogDensity.toFixed(3)}</span>
        </div>
      </div>
      <div class="panel-row">
        <label for="inp-fogcolor">Fog Color</label>
        <div class="row-right">
          <input type="color" id="inp-fogcolor" value="${s.fogColor}" />
        </div>
      </div>

      <div style="padding:12px 0 4px;">
        <button class="btn btn-ghost" id="btn-reset-env" style="width:100%">Reset to Defaults</button>
      </div>
    </div>
  `;

  function wire(id, key, transform) {
    const inp = el.querySelector(`#${id}`);
    if (!inp) return;
    inp.addEventListener('input', () => store.set(key, transform ? transform(inp.value) : inp.value));
  }
  function wiredSlider(id, lblId, key, fmt) {
    const sl = el.querySelector(`#${id}`);
    const lbl = el.querySelector(`#${lblId}`);
    sl.addEventListener('input', () => {
      const v = parseFloat(sl.value);
      store.set(key, v);
      lbl.textContent = fmt(v);
    });
  }

  const rowBgColor = el.querySelector('#row-bgcolor');
  const rowBgGrad  = el.querySelector('#row-bggrad');
  const rowBgImage = el.querySelector('#row-bgimage');

  function updateBgVisibility(type) {
    rowBgColor.style.display = (type === 'color' || type === 'gradient') ? '' : 'none';
    rowBgGrad.style.display  = type === 'gradient' ? '' : 'none';
    rowBgImage.style.display = type === 'image' ? '' : 'none';
  }
  updateBgVisibility(s.bgType);

  el.querySelector('#seg-bgtype').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector('#seg-bgtype .active')?.classList.remove('active');
      btn.classList.add('active');
      store.set('bgType', btn.dataset.val);
      updateBgVisibility(btn.dataset.val);
      onBgTypeChange?.(btn.dataset.val);
    });
  });

  wire('inp-bgcolor', 'bgColor');
  wire('inp-bggrad', 'bgGradientColor');
  wire('inp-lightcolor', 'lightColor');
  wire('inp-fogcolor', 'fogColor');

  el.querySelector('#inp-bgimage')?.addEventListener('change', e => {
    if (e.target.files[0]) onBgImageLoad?.(e.target.files[0]);
    e.target.value = '';
  });
  wiredSlider('sl-ambient', 'lbl-ambient', 'ambientIntensity', v => v.toFixed(2));
  wiredSlider('sl-keylight', 'lbl-keylight', 'keyLightIntensity', v => v.toFixed(1));
  wiredSlider('sl-exposure', 'lbl-exposure', 'exposure', v => v.toFixed(2));
  wiredSlider('sl-fog', 'lbl-fog', 'fogDensity', v => v.toFixed(3));

  el.querySelector('#btn-reset-env').addEventListener('click', () => {
    if (!confirm('Reset all Environment settings to defaults?')) return;
    const reset = {};
    PANEL_KEYS.environment.forEach(k => { reset[k] = defaults[k]; });
    store.setMany(reset);
    onReset?.();
  });
}
