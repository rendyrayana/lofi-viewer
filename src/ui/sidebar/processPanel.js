import { store, defaults, PANEL_KEYS } from '../../store.js';
import { PALETTE_PRESETS } from '../../process/palette.js';
import { PROCESS_TARGETS, applyTarget } from '../../export/preset.js';

const BUDGETS = [
  { n: 300, hint: 'Handheld' },
  { n: 800, hint: 'PS1' },
  { n: 1500, hint: 'N64' },
  { n: 3000, hint: 'Dreamcast' },
  { n: 6000, hint: 'Detailed' },
];
const TEX_SIZES = [16, 32, 64, 128, 256, 512];
const PALETTE_MODES = [
  { id: '15bit', label: 'PS1 15-bit', sub: '32,768' },
  { id: 'clut4', label: '4-bit CLUT', sub: '16 colors' },
  { id: 'clut8', label: '8-bit CLUT', sub: '256 colors' },
  { id: 'preset', label: 'Preset', sub: 'fixed list' },
  { id: 'extract', label: 'From texture', sub: 'pick N' },
  { id: 'custom', label: 'Custom', sub: 'your colors' },
];
const DITHER_PATTERNS = [
  { id: 'psx4', label: 'PS1 4×4', hint: 'PlayStation GPU ordered matrix' },
  { id: 'bayer8', label: 'Bayer 8×8', hint: 'Finer ordered pattern' },
  { id: 'fs', label: 'Diffusion', hint: 'Floyd–Steinberg error diffusion' },
];
const SAMPLING = [
  { id: 'nearest', label: 'Nearest' },
  { id: 'box', label: 'Average' },
  { id: 'edge', label: 'Edge-keep' },
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

export function buildProcessPanel(el, { onRerunFresh, onCopyMetrics, getPreview } = {}) {
  let metricsOpen = false;
  let squareLock = true;

  function render() {
    const s = store.state;
    const decOn = s.procDecimate;
    const texOn = s.procTexSize !== 'original';
    const palOn = s.procPalette !== 'off';
    const isCustomBudget = !BUDGETS.some(b => b.n === s.procTargetTris);
    const texSize = String(texOn ? s.procTexSize : s.procTexLast);
    const [tw, th] = texSize.split('x').map(n => parseInt(n, 10));
    const isCustomTex = !TEX_SIZES.some(n => String(n) === texSize);
    const density = s.procTexMode === 'density';

    el.innerHTML = `
      <div class="panel">
        <p class="panel-intro">Each step is optional — switch off any you don't need. Changes apply automatically.</p>

        <span class="field-label" id="lbl-target">Start from a target <span class="field-label-note">optional</span></span>
        <div class="chip-row" role="group" aria-labelledby="lbl-target">
          ${Object.entries(PROCESS_TARGETS).map(([k, t]) =>
            `<button class="chip" data-target="${k}" aria-pressed="${s.procTarget === k}">${t.label}</button>`).join('')}
        </div>

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
            <div class="panel-row">
              <label>Size by</label>
              <div class="row-right">
                <div class="seg-control" id="seg-texmode">
                  <button data-val="fixed" class="${!density ? 'active' : ''}">Pixels</button>
                  <button data-val="density" class="${density ? 'active' : ''}">Density</button>
                </div>
              </div>
            </div>
            ${density ? `
            <div class="panel-row">
              <label for="sl-density">Texels per cm<small class="proc-hint">Same pixel size on every object, at the Export print height (${s.printHeight} mm)</small></label>
              <div class="row-right">
                <input type="range" id="sl-density" min="1" max="16" step="0.5" value="${s.procTexDensity}" />
                <span class="row-value" id="lbl-density">${s.procTexDensity}</span>
              </div>
            </div>` : `
            <div class="choice-grid cols-7" role="group" aria-label="Texture size">
              ${TEX_SIZES.map(n => `
                <button class="choice" data-tex="${n}" aria-pressed="${texSize === String(n)}">
                  <span class="choice-main">${n}</span><span class="choice-sub">px</span>
                </button>`).join('')}
              <button class="choice" data-tex="custom" aria-pressed="${isCustomTex}">
                <span class="choice-main">${isCustomTex ? (tw === th ? tw : `${tw}×${th}`) : '…'}</span><span class="choice-sub">Custom</span>
              </button>
            </div>
            <div class="panel-row" id="row-custom-tex" ${isCustomTex ? '' : 'hidden'}>
              <label for="num-texw">Width × height</label>
              <div class="row-right">
                <input type="number" id="num-texw" min="4" max="2048" step="1" value="${tw}" aria-label="Texture width" />
                <span class="row-x">×</span>
                <input type="number" id="num-texh" min="4" max="2048" step="1" value="${th}" aria-label="Texture height" />
                <label class="lock" for="chk-square" title="Keep square"><input type="checkbox" id="chk-square" ${squareLock && tw === th ? 'checked' : ''} /> square</label>
              </div>
            </div>`}
            <span class="field-label">Sampling</span>
            <div class="seg-control seg-full" id="seg-texfilter-proc">
              ${SAMPLING.map(m => `<button data-val="${m.id}" class="${s.procTexFilter === m.id ? 'active' : ''}">${m.label}</button>`).join('')}
            </div>
            ${s.procDecimate ? '<p class="step-note">Rebaked from the original scan, then sampled down to this size.</p>' : ''}
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
            <div class="choice-grid choice-grid-top" role="group" aria-label="Palette mode">
              ${PALETTE_MODES.map(m => `
                <button class="choice choice-compact" data-pal="${m.id}" aria-pressed="${s.procPalette === m.id}">
                  <span class="choice-main">${m.label}</span><span class="choice-sub">${m.sub}</span>
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
            ${s.procPalette === 'extract' ? `
            <div class="panel-row">
              <label for="sw-mergeshades">Merge shades<small class="proc-hint">Lit and shadowed parts of one color become one entry</small></label>
              <div class="row-right">${mkSwitch('sw-mergeshades', s.procMergeShades, 'Merge shades')}</div>
            </div>` : ''}
            <div class="swatches" id="swatches" aria-label="Palette colors"></div>
            ${['preset', 'extract', 'clut4'].includes(s.procPalette) ? `
            <button class="btn btn-ghost btn-small" id="btn-tocustom">Edit these colors</button>` : ''}
            <span class="field-label">Before reducing <span class="field-label-note">baked into the texture and the print</span></span>
            <div class="panel-row">
              <label for="sl-sat">Saturation</label>
              <div class="row-right">
                <input type="range" id="sl-sat" min="0" max="2" step="0.05" value="${s.procSaturation}" />
                <span class="row-value" id="lbl-sat">${s.procSaturation.toFixed(2)}</span>
              </div>
            </div>
            <div class="panel-row">
              <label for="sl-con">Contrast</label>
              <div class="row-right">
                <input type="range" id="sl-con" min="0.5" max="2" step="0.05" value="${s.procContrast}" />
                <span class="row-value" id="lbl-con">${s.procContrast.toFixed(2)}</span>
              </div>
            </div>

            <div class="panel-row">
              <label for="sw-procdither">Dither</label>
              <div class="row-right">${mkSwitch('sw-procdither', s.procDither, 'Dither')}</div>
            </div>
            ${s.procDither ? `
            <div class="seg-control seg-full" id="seg-ditherpattern" role="group" aria-label="Dither pattern">
              ${DITHER_PATTERNS.map(d => `<button data-val="${d.id}" class="${s.procDitherPattern === d.id ? 'active' : ''}" title="${d.hint}">${d.label}</button>`).join('')}
            </div>
            <div class="panel-row">
              <label for="sl-ditherstr">Strength${s.procPalette === '15bit' ? '<small class="proc-hint">1.00 = PS1 hardware amount</small>' : ''}</label>
              <div class="row-right">
                <input type="range" id="sl-ditherstr" min="0" max="2" step="0.05" value="${s.procDitherStrength}" />
                <span class="row-value" id="lbl-ditherstr">${s.procDitherStrength.toFixed(2)}</span>
              </div>
            </div>` : ''}
          </div>
        </section>

        <section class="result" id="result" aria-label="Result texture">
          <div class="result-preview"><canvas id="preview" width="1" height="1" aria-label="Final texture preview"></canvas></div>
          <div class="result-info">
            <span class="field-label">Result texture</span>
            <p class="result-line" id="result-line">—</p>
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

    el.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => applyTarget(b.dataset.target)));

    el.querySelectorAll('[data-tex]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.tex === 'custom') {
        $('#row-custom-tex').hidden = false;
        el.querySelectorAll('[data-tex]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        $('#num-texw').focus();
        return;
      }
      store.setMany({ procTexLast: b.dataset.tex, procTexSize: b.dataset.tex });
    }));
    const setCustomTex = (w, h) => {
      w = Math.min(2048, Math.max(4, w || 64)); h = Math.min(2048, Math.max(4, h || w));
      const v = w === h ? String(w) : `${w}x${h}`;
      store.setMany({ procTexLast: v, procTexSize: v });
    };
    const nw = $('#num-texw'), nh = $('#num-texh'), sq = $('#chk-square');
    if (nw) {
      nw.addEventListener('change', () => setCustomTex(parseInt(nw.value, 10), sq.checked ? parseInt(nw.value, 10) : parseInt(nh.value, 10)));
      nh.addEventListener('change', () => setCustomTex(sq.checked ? parseInt(nh.value, 10) : parseInt(nw.value, 10), parseInt(nh.value, 10)));
      sq.addEventListener('change', () => { squareLock = sq.checked; if (squareLock) setCustomTex(parseInt(nw.value, 10), parseInt(nw.value, 10)); });
    }
    $('#seg-texmode').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => store.set('procTexMode', btn.dataset.val)));
    const slDen = $('#sl-density');
    if (slDen) {
      slDen.addEventListener('input', () => { $('#lbl-density').textContent = slDen.value; });
      slDen.addEventListener('change', () => store.set('procTexDensity', parseFloat(slDen.value)));
    }
    for (const [id, lbl, key] of [['#sl-sat', '#lbl-sat', 'procSaturation'], ['#sl-con', '#lbl-con', 'procContrast']]) {
      const sl = $(id);
      sl.addEventListener('input', () => { $(lbl).textContent = parseFloat(sl.value).toFixed(2); });
      sl.addEventListener('change', () => store.set(key, parseFloat(sl.value)));
    }
    $('#seg-texfilter-proc').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => store.set('procTexFilter', btn.dataset.val)));

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
    $('#sw-mergeshades')?.addEventListener('change', e => store.set('procMergeShades', e.target.checked));
    $('#seg-ditherpattern')?.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => store.set('procDitherPattern', btn.dataset.val)));
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
      const shown = cols.slice(0, 32);
      box.innerHTML = shown.map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('') +
        (cols.length > shown.length ? `<span class="swatch-more">+${cols.length - shown.length} more</span>` : '');
    }
  }

  function renderStats() {
    const st = store.get('procStats');
    const s = store.state;
    el.classList.toggle('is-busy', !!store.get('procBusy'));

    if (!st) {
      $('#result').hidden = true;
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
        ? `${st.texW}×${st.texH} px${s.procTexMode === 'density' ? ` · ${s.procTexDensity} texels/cm` : ''}${s.procDecimate ? ' · rebaked' : ''}`
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
    renderPreview(st);
  }

  // Draws the final texture as a conventional image (v up), pixel-exact.
  function renderPreview(st) {
    const img = getPreview?.();
    const cvs = $('#preview');
    $('#result').hidden = !img;
    if (!img) return;
    cvs.width = img.width; cvs.height = img.height;
    const ctx = cvs.getContext('2d');
    const id = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
    if (img.flipY) {
      ctx.putImageData(id, 0, 0);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = img.width; tmp.height = img.height;
      tmp.getContext('2d').putImageData(id, 0, 0);
      ctx.save(); ctx.translate(0, img.height); ctx.scale(1, -1); ctx.drawImage(tmp, 0, 0); ctx.restore();
    }
    const parts = [`${img.width}×${img.height} px`, `${st.colors.toLocaleString()} colors`];
    if (st.coverage != null) parts.push(`${(st.coverage * 100).toFixed(0)}% atlas used`);
    $('#result-line').textContent = parts.join(' · ');
  }

  // Structural settings rebuild the panel; stats only refresh text.
  let queued = false;
  const rerender = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  };
  const STRUCTURAL = [...PANEL_KEYS.process, 'procTarget', 'printHeight'];
  const unsubs = [
    ...STRUCTURAL.map(k => store.subscribe(k, rerender)),
    store.subscribe('procStats', () => { renderStats(); if (store.get('procPalette') !== 'custom') renderSwatches(); }),
    store.subscribe('procBusy', renderStats),
  ];

  render();
  return () => unsubs.forEach(u => u());
}
