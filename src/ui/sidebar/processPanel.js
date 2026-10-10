import { store, defaults, PANEL_KEYS } from '../../store.js';
import { PALETTE_PRESETS } from '../../process/palette.js';

const BUDGETS = [
  { n: 300, hint: 'Handheld' },
  { n: 800, hint: 'PS1' },
  { n: 1500, hint: 'N64' },
  { n: 3000, hint: 'Dreamcast' },
  { n: 6000, hint: 'Detailed' },
];
const TEX_SIZES = [16, 32, 64, 128, 256, 512];
const PALETTE_MODES = [
  { id: '15bit', label: 'PS1 15-bit' },
  { id: 'preset', label: 'Preset' },
  { id: 'extract', label: 'From texture' },
  { id: 'custom', label: 'Custom' },
];
const MAX_CUSTOM = 16;

function mkSwitch(id, checked, label) {
  return `
    <label class="switch-wrap" for="${id}" aria-label="${label}">
      <input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-thumb"></span></span>
    </label>`;
}

const fmtK = n => (n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));

export function buildProcessPanel(el, { onRerunFresh, onCopyMetrics } = {}) {
  let metricsOpen = false;

  function render() {
    const s = store.state;
    const decOn = s.procDecimate;
    const texOn = s.procTexSize !== 'original';
    const palOn = s.procPalette !== 'off';
    const isCustomBudget = !BUDGETS.some(b => b.n === s.procTargetTris);

    el.innerHTML = `
      <div class="panel">
        <p class="panel-intro">Each step is optional — switch off any you don't need. Changes apply automatically.</p>

        <section class="step ${decOn ? '' : 'is-off'}">
          <header class="step-head">
            <span class="step-tag">A</span>
            <div class="step-title">
              <label for="sw-decimate" class="step-name">Decimate mesh</label>
              <p class="step-sum" id="sum-dec"></p>
            </div>
            ${mkSwitch('sw-decimate', decOn, 'Decimate mesh')}
          </header>
          <div class="step-body" ${decOn ? '' : 'hidden'}>
            <span class="field-label" id="lbl-budget">Triangle budget</span>
            <div class="choice-grid" role="group" aria-labelledby="lbl-budget">
              ${BUDGETS.map(b => `
                <button class="choice" data-budget="${b.n}" aria-pressed="${s.procTargetTris === b.n}">
                  <span class="choice-main">${fmtK(b.n)}</span><span class="choice-sub">${b.hint}</span>
                </button>`).join('')}
              <button class="choice" data-budget="custom" aria-pressed="${isCustomBudget}">
                <span class="choice-main">${isCustomBudget ? fmtK(s.procTargetTris) : '…'}</span><span class="choice-sub">Custom</span>
              </button>
            </div>
            <div class="panel-row" id="row-custom-tris" ${isCustomBudget ? '' : 'hidden'}>
              <label for="num-tris">Exact count</label>
              <div class="row-right">
                <input type="range" id="sl-tris" min="100" max="10000" step="50" value="${Math.min(10000, s.procTargetTris)}" aria-label="Triangle budget slider" />
                <input type="number" id="num-tris" min="4" max="200000" step="1" value="${s.procTargetTris}" />
              </div>
            </div>
            <div class="panel-row">
              <label>Shading</label>
              <div class="row-right">
                <div class="seg-control" id="seg-normals">
                  <button data-val="flat" class="${s.procFlat ? 'active' : ''}">Faceted</button>
                  <button data-val="smooth" class="${!s.procFlat ? 'active' : ''}">Smooth</button>
                </div>
              </div>
            </div>
            <p class="step-note">UVs are re-unwrapped and the texture is rebaked from the original scan.</p>
          </div>
        </section>

        <section class="step ${texOn ? '' : 'is-off'}">
          <header class="step-head">
            <span class="step-tag">B</span>
            <div class="step-title">
              <label for="sw-tex" class="step-name">Downsample texture</label>
              <p class="step-sum" id="sum-tex"></p>
            </div>
            ${mkSwitch('sw-tex', texOn, 'Downsample texture')}
          </header>
          <div class="step-body" ${texOn ? '' : 'hidden'}>
            <span class="field-label" id="lbl-texsize">Texture size</span>
            <div class="choice-grid cols-6" role="group" aria-labelledby="lbl-texsize">
              ${TEX_SIZES.map(n => `
                <button class="choice" data-tex="${n}" aria-pressed="${String(s.procTexSize) === String(n)}">
                  <span class="choice-main">${n}</span><span class="choice-sub">px</span>
                </button>`).join('')}
            </div>
            ${decOn ? '' : `
            <div class="panel-row">
              <label>Sampling</label>
              <div class="row-right">
                <div class="seg-control" id="seg-texfilter-proc">
                  <button data-val="nearest" class="${s.procTexFilter === 'nearest' ? 'active' : ''}">Nearest</button>
                  <button data-val="box" class="${s.procTexFilter === 'box' ? 'active' : ''}">Average</button>
                </div>
              </div>
            </div>`}
          </div>
        </section>

        <section class="step ${palOn ? '' : 'is-off'}">
          <header class="step-head">
            <span class="step-tag">C</span>
            <div class="step-title">
              <label for="sw-pal" class="step-name">Reduce palette</label>
              <p class="step-sum" id="sum-pal"></p>
            </div>
            ${mkSwitch('sw-pal', palOn, 'Reduce palette')}
          </header>
          <div class="step-body" ${palOn ? '' : 'hidden'}>
            <div class="choice-grid cols-4" role="group" aria-label="Palette mode">
              ${PALETTE_MODES.map(m => `
                <button class="choice choice-compact" data-pal="${m.id}" aria-pressed="${s.procPalette === m.id}">
                  <span class="choice-main">${m.label}</span>
                </button>`).join('')}
            </div>
            ${s.procPalette === 'preset' ? `
            <div class="panel-row">
              <label for="sel-preset">Palette</label>
              <div class="row-right">
                <select id="sel-preset">
                  ${Object.entries(PALETTE_PRESETS).map(([k, p]) => `<option value="${k}" ${s.procPreset === k ? 'selected' : ''}>${p.label}</option>`).join('')}
                </select>
              </div>
            </div>` : ''}
            ${s.procPalette === 'extract' ? `
            <div class="panel-row">
              <label for="sl-colors">Colors</label>
              <div class="row-right">
                <input type="range" id="sl-colors" min="2" max="32" step="1" value="${s.procColors}" />
                <span class="row-value" id="lbl-colors">${s.procColors}</span>
              </div>
            </div>` : ''}
            <div class="swatches" id="swatches" aria-label="Palette colors"></div>
            ${s.procPalette === 'preset' || s.procPalette === 'extract' ? `
            <button class="btn btn-ghost btn-small" id="btn-tocustom">Edit these colors</button>` : ''}
            <div class="panel-row">
              <label for="sw-procdither">Dither<small class="proc-hint">PS1 4×4 ordered matrix</small></label>
              <div class="row-right">${mkSwitch('sw-procdither', s.procDither, 'Dither')}</div>
            </div>
            ${s.procDither && s.procPalette !== '15bit' ? `
            <div class="panel-row">
              <label for="sl-ditherstr">Dither strength</label>
              <div class="row-right">
                <input type="range" id="sl-ditherstr" min="0" max="2" step="0.05" value="${s.procDitherStrength}" />
                <span class="row-value" id="lbl-ditherstr">${s.procDitherStrength.toFixed(2)}</span>
              </div>
            </div>` : ''}
          </div>
        </section>

        <details class="fold fold-quiet" id="metrics" ${metricsOpen ? 'open' : ''}>
          <summary><span class="fold-title">Measurements</span><span class="fold-hint" id="metrics-hint"></span></summary>
          <div class="fold-body">
            <dl class="proc-stats" id="proc-stats"></dl>
            <div class="btn-row">
              <button class="btn btn-ghost" id="btn-rerun" title="Clear caches and time every stage from scratch">Re-run (no cache)</button>
              <button class="btn btn-ghost" id="btn-copy-json">Copy JSON</button>
              <button class="btn btn-ghost" id="btn-copy-csv">Copy CSV</button>
            </div>
            <div class="proc-status" id="metrics-status" aria-live="polite"></div>
          </div>
        </details>

        <button class="btn btn-ghost btn-small" id="btn-reset-process">Reset Process to defaults</button>
      </div>
    `;
    bind();
    renderSwatches();
    renderStats();
  }

  const $ = q => el.querySelector(q);

  function bind() {
    $('#sw-decimate').addEventListener('change', e => store.set('procDecimate', e.target.checked));
    $('#sw-tex').addEventListener('change', e => store.set('procTexSize', e.target.checked ? store.get('procTexLast') : 'original'));
    $('#sw-pal').addEventListener('change', e => store.set('procPalette', e.target.checked ? store.get('procPaletteLast') : 'off'));

    el.querySelectorAll('[data-budget]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.budget === 'custom') {
        $('#row-custom-tris').hidden = false;
        el.querySelectorAll('[data-budget]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        $('#num-tris').focus();
        return;
      }
      store.set('procTargetTris', parseInt(b.dataset.budget, 10));
    }));
    const slTris = $('#sl-tris'), numTris = $('#num-tris');
    slTris.addEventListener('input', () => { numTris.value = slTris.value; });
    slTris.addEventListener('change', () => store.set('procTargetTris', parseInt(slTris.value, 10)));
    numTris.addEventListener('change', () => {
      const v = Math.max(4, parseInt(numTris.value, 10) || defaults.procTargetTris);
      store.set('procTargetTris', v);
    });

    $('#seg-normals').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => store.set('procFlat', btn.dataset.val === 'flat')));

    el.querySelectorAll('[data-tex]').forEach(b => b.addEventListener('click', () => {
      store.setMany({ procTexLast: b.dataset.tex, procTexSize: b.dataset.tex });
    }));
    $('#seg-texfilter-proc')?.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => store.set('procTexFilter', btn.dataset.val)));

    el.querySelectorAll('[data-pal]').forEach(b => b.addEventListener('click', () => {
      store.setMany({ procPaletteLast: b.dataset.pal, procPalette: b.dataset.pal });
    }));
    $('#sel-preset')?.addEventListener('change', e => store.set('procPreset', e.target.value));
    const slColors = $('#sl-colors');
    if (slColors) {
      slColors.addEventListener('input', () => { $('#lbl-colors').textContent = slColors.value; });
      slColors.addEventListener('change', () => store.set('procColors', parseInt(slColors.value, 10)));
    }
    $('#btn-tocustom')?.addEventListener('click', () => {
      const pal = store.get('procStats')?.palette;
      if (pal?.length) store.setMany({ procCustom: pal.slice(0, MAX_CUSTOM), procPaletteLast: 'custom', procPalette: 'custom' });
    });
    $('#sw-procdither').addEventListener('change', e => store.set('procDither', e.target.checked));
    const slStr = $('#sl-ditherstr');
    if (slStr) {
      slStr.addEventListener('input', () => { $('#lbl-ditherstr').textContent = parseFloat(slStr.value).toFixed(2); });
      slStr.addEventListener('change', () => store.set('procDitherStrength', parseFloat(slStr.value)));
    }

    $('#metrics').addEventListener('toggle', e => { metricsOpen = e.target.open; });
    const flash = msg => {
      const st = $('#metrics-status');
      st.textContent = msg;
      setTimeout(() => { if (st.textContent === msg) st.textContent = ''; }, 1800);
    };
    $('#btn-rerun').addEventListener('click', () => onRerunFresh?.());
    $('#btn-copy-json').addEventListener('click', async () => flash(await onCopyMetrics?.('json') ? 'Copied as JSON' : 'Nothing to copy'));
    $('#btn-copy-csv').addEventListener('click', async () => flash(await onCopyMetrics?.('csv') ? 'Copied as CSV' : 'Nothing to copy'));

    $('#btn-reset-process').addEventListener('click', () => {
      if (!confirm('Reset all Process settings to defaults?')) return;
      const reset = {};
      PANEL_KEYS.process.forEach(k => { reset[k] = Array.isArray(defaults[k]) ? [...defaults[k]] : defaults[k]; });
      store.setMany(reset);
    });
  }

  function renderSwatches() {
    const box = $('#swatches');
    if (!box) return;
    const mode = store.get('procPalette');
    if (mode === 'off' || mode === '15bit') { box.hidden = true; return; }
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
      box.querySelector('#btn-addcolor')?.addEventListener('click', () => store.set('procCustom', [...store.get('procCustom'), '#808080']));
    } else {
      const cols = store.get('procStats')?.palette ?? [];
      box.innerHTML = cols.map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('');
    }
  }

  function renderStats() {
    const st = store.get('procStats');
    const s = store.state;
    el.classList.toggle('is-busy', !!store.get('procBusy'));

    if (!st) {
      $('#sum-dec').textContent = 'Load a model to begin';
      $('#sum-tex').textContent = '';
      $('#sum-pal').textContent = '';
      $('#proc-stats').innerHTML = '<dt>Model</dt><dd>—</dd>';
      $('#metrics-hint').textContent = '';
      return;
    }
    const pct = st.srcTris ? ((st.tris / st.srcTris) * 100) : 100;
    $('#sum-dec').textContent = s.procDecimate
      ? `${st.srcTris.toLocaleString()} → ${st.tris.toLocaleString()} triangles (${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%)`
      : `Skipped · ${st.srcTris.toLocaleString()} triangles kept`;
    $('#sum-tex').textContent = !st.texW
      ? 'No texture on this model'
      : s.procTexSize !== 'original'
        ? `${st.texW}×${st.texH} px${s.procDecimate ? ' · rebaked' : ''}`
        : `Skipped · ${s.procDecimate ? `rebaked at ${st.texW} px` : `original ${st.texW}×${st.texH} px`}`;
    $('#sum-pal').textContent = !st.texW
      ? 'No texture on this model'
      : s.procPalette !== 'off'
        ? `${st.colors.toLocaleString()} colors`
        : `Skipped · ${st.colors.toLocaleString()} colors`;

    const rows = [
      ['Triangles', st.tris === st.srcTris ? st.tris.toLocaleString() : `${st.srcTris.toLocaleString()} → ${st.tris.toLocaleString()}`],
      ...(st.charts ? [['UV charts', st.charts.toLocaleString()]] : []),
      ...(st.coverage != null ? [['Atlas use', `${(st.coverage * 100).toFixed(1)}%`]] : []),
      ['Texture', st.texW ? `${st.texW}×${st.texH}` : 'none'],
      ['Colors', st.colors ? st.colors.toLocaleString() : '—'],
      ['Total', `${st.ms} ms`],
    ];
    const stages = Object.entries(st.timings || {}).filter(([, v]) => v >= 0.1);
    $('#proc-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') +
      stages.map(([k, v]) => `<dt class="sub">${k}</dt><dd class="sub">${v} ms</dd>`).join('');
    $('#metrics-hint').textContent = `${st.ms} ms`;
  }

  // Structural settings rebuild the panel; stats only refresh text.
  let queued = false;
  const rerender = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  };
  const STRUCTURAL = ['procDecimate', 'procTargetTris', 'procFlat', 'procTexSize', 'procTexFilter', 'procPalette', 'procPreset', 'procColors', 'procCustom', 'procDither', 'procDitherStrength'];
  const unsubs = [
    ...STRUCTURAL.map(k => store.subscribe(k, rerender)),
    store.subscribe('procStats', () => { renderStats(); if (store.get('procPalette') !== 'custom') renderSwatches(); }),
    store.subscribe('procBusy', renderStats),
  ];

  render();
  return () => unsubs.forEach(u => u());
}
