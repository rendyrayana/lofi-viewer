import { store, defaults, PANEL_KEYS } from '../../store.js';

function mkSwitch(id, checked) {
  return `<label class="switch-wrap" for="${id}"><input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} /><span class="switch-track"><span class="switch-thumb"></span></span></label>`;
}

export function buildCameraPanel(el, { onProjectionChange, onResetView, onReset } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Projection</span>
      <div class="panel-row">
        <label>Mode</label>
        <div class="row-right">
          <div class="seg-control" id="seg-proj">
            <button data-val="perspective" class="${s.projection === 'perspective' ? 'active' : ''}">Perspective</button>
            <button data-val="orthographic" class="${s.projection === 'orthographic' ? 'active' : ''}">Orthographic</button>
          </div>
        </div>
      </div>
      <div class="panel-row">
        <label for="sl-fov">Field of View</label>
        <div class="row-right">
          <input type="range" id="sl-fov" min="10" max="120" step="1" value="${s.fov}" />
          <span class="row-value" id="lbl-fov">${s.fov}°</span>
        </div>
      </div>

      <span class="panel-section-label">Motion</span>
      <div class="panel-row">
        <label for="sw-turntable">Turntable</label>
        <div class="row-right">${mkSwitch('sw-turntable', s.turntable)}</div>
      </div>
      <div class="panel-row">
        <label for="inp-rotspeed">Rotation Speed</label>
        <div class="row-right">
          <input type="range" id="sl-rotspeed" min="0.1" max="5" step="0.1" value="${Math.min(s.rotationSpeed, 5)}" />
          <input type="number" id="inp-rotspeed" min="0.1" step="0.1" value="${s.rotationSpeed}" style="width:52px;text-align:right;" />
        </div>
      </div>
      <div class="panel-row">
        <label for="sw-autoframe">Auto-Frame on Load</label>
        <div class="row-right">${mkSwitch('sw-autoframe', s.autoFrame)}</div>
      </div>

      <span class="panel-section-label">View</span>
      <div class="panel-row">
        <label for="sel-aspect">Aspect Ratio</label>
        <div class="row-right">
          <select id="sel-aspect">
            <option value="free" ${s.aspectRatio === 'free' ? 'selected' : ''}>Free</option>
            <option value="1:1" ${s.aspectRatio === '1:1' ? 'selected' : ''}>1:1 Square</option>
            <option value="4:3" ${s.aspectRatio === '4:3' ? 'selected' : ''}>4:3 Classic</option>
            <option value="16:9" ${s.aspectRatio === '16:9' ? 'selected' : ''}>16:9 HD</option>
            <option value="16:10" ${s.aspectRatio === '16:10' ? 'selected' : ''}>16:10</option>
            <option value="3:2" ${s.aspectRatio === '3:2' ? 'selected' : ''}>3:2 Film</option>
            <option value="2.39:1" ${s.aspectRatio === '2.39:1' ? 'selected' : ''}>2.39:1 Anamorphic</option>
            <option value="320:240" ${s.aspectRatio === '320:240' ? 'selected' : ''}>320×240 PSX/CRT</option>
            <option value="256:224" ${s.aspectRatio === '256:224' ? 'selected' : ''}>256×224 SNES</option>
          </select>
        </div>
      </div>
      <div style="padding:4px 0 4px;">
        <button class="btn btn-ghost" id="btn-reset-cam" style="width:100%">Reset to Defaults</button>
      </div>
    </div>
  `;

  const fovSl = el.querySelector('#sl-fov');
  const fovLbl = el.querySelector('#lbl-fov');
  fovSl.addEventListener('input', () => { const v = parseInt(fovSl.value); store.set('fov', v); fovLbl.textContent = `${v}°`; });

  const rotSl  = el.querySelector('#sl-rotspeed');
  const rotInp = el.querySelector('#inp-rotspeed');
  rotSl.addEventListener('input', () => {
    const v = parseFloat(rotSl.value);
    rotInp.value = v;
    store.set('rotationSpeed', v);
  });
  rotInp.addEventListener('change', () => {
    const v = Math.max(0.1, parseFloat(rotInp.value) || 0.1);
    rotInp.value = v;
    rotSl.value = Math.min(v, 5);
    store.set('rotationSpeed', v);
  });

  el.querySelector('#sw-turntable').addEventListener('change', e => store.set('turntable', e.target.checked));
  el.querySelector('#sw-autoframe').addEventListener('change', e => store.set('autoFrame', e.target.checked));

  el.querySelector('#seg-proj').querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector('#seg-proj .active')?.classList.remove('active');
      btn.classList.add('active');
      store.set('projection', btn.dataset.val);
      onProjectionChange(btn.dataset.val);
    });
  });

  el.querySelector('#sel-aspect').addEventListener('change', e => store.set('aspectRatio', e.target.value));

  el.querySelector('#btn-reset-cam').addEventListener('click', () => {
    if (!confirm('Reset all Camera settings to defaults?')) return;
    const reset = {};
    PANEL_KEYS.camera.forEach(k => { reset[k] = defaults[k]; });
    store.setMany(reset);
    onResetView?.(); // also reset orbit position
    onReset?.();
  });
}
