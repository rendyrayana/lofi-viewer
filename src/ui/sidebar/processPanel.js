import { store, defaults, PANEL_KEYS } from '../../store.js';
import { PALETTE_PRESETS } from '../../process/palette.js';

function mkSwitch(id, checked) {
  return `
    <label class="switch-wrap" for="${id}" aria-label="${id}">
      <input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-thumb"></span></span>
    </label>
  `;
}

const sel = (cur, val) => (String(cur) === String(val) ? 'selected' : '');
const MAX_CUSTOM = 16;

export function buildProcessPanel(el, { onReset, onRerunFresh, onCopyMetrics } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Geometry</span>

      <div class="panel-row">
        <label for="sw-decimate">Decimate<small class="proc-hint">Reduce mesh, re-unwrap UVs, rebake texture</small></label>
        <div class="row-right">${mkSwitch('sw-decimate', s.procDecimate)}</div>
      </div>

      <div class="panel-row">
        <label for="sl-tris">Target Triangles</label>
        <div class="row-right">
          <input type="range" id="sl-tris" min="100" max="5000" step="50" value="${Math.min(5000, s.procTargetTris)}" />
          <input type="number" id="num-tris" min="4" max="200000" step="1" value="${s.procTargetTris}" aria-label="Target triangles" />
        </div>
      </div>

      <div class="panel-row">
        <label>Normals</label>
        <div class="row-right">
          <div class="seg-control" id="seg-normals">
            <button data-val="flat" class="${s.procFlat ? 'active' : ''}">Faceted</button>
            <button data-val="smooth" class="${!s.procFlat ? 'active' : ''}">Smooth</button>
          </div>
        </div>
      </div>

      <span class="panel-section-label">Texture</span>

      <div class="panel-row">
        <label for="sel-texsize">Resolution</label>
        <div class="row-right">
          <select id="sel-texsize">
            <option value="original" ${sel(s.procTexSize, 'original')}>Original</option>
            ${[512, 256, 128, 64, 32, 16].map(n => `<option value="${n}" ${sel(s.procTexSize, n)}>${n} px</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="panel-row" id="row-texfilter">
        <label>Downsample</label>
        <div class="row-right">
          <div class="seg-control" id="seg-texfilter-proc">
            <button data-val="nearest" class="${s.procTexFilter === 'nearest' ? 'active' : ''}">Nearest</button>
            <button data-val="box" class="${s.procTexFilter === 'box' ? 'active' : ''}">Average</button>
          </div>
        </div>
      </div>

      <span class="panel-section-label">Palette</span>

      <div class="panel-row">
        <label for="sel-palette">Mode</label>
        <div class="row-right">
          <select id="sel-palette">
            <option value="off" ${sel(s.procPalette, 'off')}>Off</option>
            <option value="15bit" ${sel(s.procPalette, '15bit')}>PS1 15-bit</option>
            <option value="preset" ${sel(s.procPalette, 'preset')}>Preset</option>
            <option value="extract" ${sel(s.procPalette, 'extract')}>Extract from texture</option>
            <option value="custom" ${sel(s.procPalette, 'custom')}>Custom</option>
          </select>
        </div>
      </div>

      <div class="panel-row" id="row-preset">
        <label for="sel-preset">Preset</label>
        <div class="row-right">
          <select id="sel-preset">
            ${Object.entries(PALETTE_PRESETS).map(([k, p]) => `<option value="${k}" ${sel(s.procPreset, k)}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="panel-row" id="row-colors">
        <label for="sl-colors">Colors</label>
        <div class="row-right">
          <input type="range" id="sl-colors" min="2" max="32" step="1" value="${s.procColors}" />
          <span class="row-value" id="lbl-colors">${s.procColors}</span>
        </div>
      </div>

      <div class="swatches" id="swatches" aria-label="Palette colors"></div>

      <div class="panel-row" id="row-tocustom">
        <label for="btn-tocustom">Edit these colors</label>
        <div class="row-right"><button class="btn btn-ghost" id="btn-tocustom">Copy to Custom</button></div>
      </div>

      <div class="panel-row" id="row-dither">
        <label for="sw-procdither">Dither<small class="proc-hint">PS1 4×4 ordered matrix</small></label>
        <div class="row-right">${mkSwitch('sw-procdither', s.procDither)}</div>
      </div>

      <div class="panel-row" id="row-ditherstr">
        <label for="sl-ditherstr">Dither Strength</label>
        <div class="row-right">
          <input type="range" id="sl-ditherstr" min="0" max="2" step="0.05" value="${s.procDitherStrength}" />
          <span class="row-value" id="lbl-ditherstr">${s.procDitherStrength.toFixed(2)}</span>
        </div>
      </div>

      <dl class="proc-stats" id="proc-stats"></dl>
      <div class="proc-status" id="proc-status" aria-live="polite"></div>
      <div class="btn-row">
        <button class="btn btn-ghost" id="btn-rerun" title="Clear caches and time every stage from scratch">Re-run (no cache)</button>
        <button class="btn btn-ghost" id="btn-copy-json">Copy JSON</button>
        <button class="btn btn-ghost" id="btn-copy-csv">Copy CSV</button>
      </div>

      <div style="padding:12px 0 4px;">
        <button class="btn btn-ghost" id="btn-reset-process" style="width:100%">Reset to Defaults</button>
      </div>
    </div>
  `;

  const $ = q => el.querySelector(q);

  function updateVisibility() {
    const st = store.state;
    const mode = st.procPalette;
    $('#row-texfilter').hidden = st.procDecimate || st.procTexSize === 'original';
    $('#row-preset').hidden = mode !== 'preset';
    $('#row-colors').hidden = mode !== 'extract';
    $('#row-tocustom').hidden = !(mode === 'preset' || mode === 'extract');
    $('#row-dither').hidden = mode === 'off';
    $('#row-ditherstr').hidden = mode === 'off' || mode === '15bit' || !st.procDither;
    $('#sl-tris').disabled = $('#num-tris').disabled = !st.procDecimate;
    $('#seg-normals').querySelectorAll('button').forEach(b => { b.disabled = !st.procDecimate; });
    renderSwatches();
  }

  function renderSwatches() {
    const box = $('#swatches');
    const mode = store.get('procPalette');
    if (mode === 'off' || mode === '15bit') { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (mode === 'custom') {
      const cols = store.get('procCustom');
      box.innerHTML = cols.map((c, i) =>
        `<input type="color" value="${c}" data-i="${i}" aria-label="Palette color ${i + 1}" title="${c} — right-click to remove" />`
      ).join('') + (cols.length < MAX_CUSTOM ? `<button class="swatch-btn" id="btn-addcolor" aria-label="Add color" title="Add color">+</button>` : '');
      box.querySelectorAll('input[type="color"]').forEach(inp => {
        inp.addEventListener('change', () => {
          const next = [...store.get('procCustom')];
          next[+inp.dataset.i] = inp.value;
          store.set('procCustom', next);
        });
        inp.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          const next = store.get('procCustom').filter((_, i) => i !== +inp.dataset.i);
          if (next.length) store.set('procCustom', next);
        });
      });
      box.querySelector('#btn-addcolor')?.addEventListener('click', () => {
        store.set('procCustom', [...store.get('procCustom'), '#808080']);
      });
    } else {
      const cols = store.get('procStats')?.palette ?? [];
      box.innerHTML = cols.map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('');
    }
  }

  function renderStats(st) {
    const dl = $('#proc-stats');
    if (!st) { dl.innerHTML = '<dt>Model</dt><dd>—</dd>'; return; }
    const rows = [
      ['Triangles', st.tris === st.srcTris ? st.tris.toLocaleString() : `${st.srcTris.toLocaleString()} → ${st.tris.toLocaleString()}`],
      ...(st.charts ? [['UV charts', st.charts.toLocaleString()]] : []),
      ...(st.coverage != null ? [['Atlas use', `${(st.coverage * 100).toFixed(1)}%`]] : []),
      ['Texture', st.texW ? `${st.texW}×${st.texH}` : 'none'],
      ['Colors', st.colors ? st.colors.toLocaleString() : '—'],
      ['Total', `${st.ms} ms`],
    ];
    const stages = Object.entries(st.timings || {}).filter(([, v]) => v >= 0.1);
    dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') +
      stages.map(([k, v]) => `<dt class="sub">${k}</dt><dd class="sub">${v} ms</dd>`).join('');
  }

  // ── Wiring ──────────────────────────────────────────────────────────────────
  $('#sw-decimate').addEventListener('change', e => store.set('procDecimate', e.target.checked));

  const slTris = $('#sl-tris'), numTris = $('#num-tris');
  slTris.addEventListener('input', () => { numTris.value = slTris.value; });
  slTris.addEventListener('change', () => store.set('procTargetTris', parseInt(slTris.value, 10)));
  numTris.addEventListener('change', () => {
    const v = Math.max(4, parseInt(numTris.value, 10) || defaults.procTargetTris);
    numTris.value = v;
    slTris.value = Math.min(5000, v);
    store.set('procTargetTris', v);
  });

  $('#seg-normals').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    $('#seg-normals .active')?.classList.remove('active');
    btn.classList.add('active');
    store.set('procFlat', btn.dataset.val === 'flat');
  }));

  $('#sel-texsize').addEventListener('change', e => store.set('procTexSize', e.target.value));
  $('#seg-texfilter-proc').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
    $('#seg-texfilter-proc .active')?.classList.remove('active');
    btn.classList.add('active');
    store.set('procTexFilter', btn.dataset.val);
  }));

  $('#sel-palette').addEventListener('change', e => store.set('procPalette', e.target.value));
  $('#sel-preset').addEventListener('change', e => store.set('procPreset', e.target.value));

  const slColors = $('#sl-colors');
  slColors.addEventListener('input', () => { $('#lbl-colors').textContent = slColors.value; });
  slColors.addEventListener('change', () => store.set('procColors', parseInt(slColors.value, 10)));

  $('#btn-tocustom').addEventListener('click', () => {
    const pal = store.get('procStats')?.palette;
    if (!pal?.length) return;
    store.setMany({ procCustom: pal.slice(0, MAX_CUSTOM), procPalette: 'custom' });
    $('#sel-palette').value = 'custom';
  });

  $('#sw-procdither').addEventListener('change', e => store.set('procDither', e.target.checked));
  const slStr = $('#sl-ditherstr');
  slStr.addEventListener('input', () => { $('#lbl-ditherstr').textContent = parseFloat(slStr.value).toFixed(2); });
  slStr.addEventListener('change', () => store.set('procDitherStrength', parseFloat(slStr.value)));

  const flash = msg => {
    $('#proc-status').textContent = msg;
    setTimeout(() => { if ($('#proc-status').textContent === msg) $('#proc-status').textContent = ''; }, 1800);
  };
  $('#btn-rerun').addEventListener('click', () => onRerunFresh?.());
  $('#btn-copy-json').addEventListener('click', async () => flash(await onCopyMetrics?.('json') ? 'Metrics copied (JSON)' : 'Nothing to copy'));
  $('#btn-copy-csv').addEventListener('click', async () => flash(await onCopyMetrics?.('csv') ? 'Metrics copied (CSV)' : 'Nothing to copy'));

  $('#btn-reset-process').addEventListener('click', () => {
    if (!confirm('Reset all Process settings to defaults?')) return;
    const reset = {};
    PANEL_KEYS.process.forEach(k => { reset[k] = Array.isArray(defaults[k]) ? [...defaults[k]] : defaults[k]; });
    store.setMany(reset);
    onReset?.();
  });

  const unsubs = [
    ...PANEL_KEYS.process.map(k => store.subscribe(k, updateVisibility)),
    store.subscribe('procStats', st => { renderStats(st); if (store.get('procPalette') !== 'custom') renderSwatches(); }),
    store.subscribe('procBusy', busy => { $('#proc-status').textContent = busy ? 'Processing…' : ''; }),
  ];

  updateVisibility();
  renderStats(store.get('procStats'));
  $('#proc-status').textContent = store.get('procBusy') ? 'Processing…' : '';

  return () => unsubs.forEach(u => u());
}
