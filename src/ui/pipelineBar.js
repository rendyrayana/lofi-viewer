import { store } from '../store.js';
import { LOOK_PRESETS } from '../export/preset.js';

// One-line summary of the whole pipeline. Each stage is a button that opens
// the tab where it is configured; the right side reports load/processing
// progress and how long the last update took.
export function buildPipelineBar(el) {
  el.innerHTML = `
    <ol class="pipe-stages">
      <li><button class="pipe-stage" data-tab="import"><span class="pipe-name">Scan</span><span class="pipe-val" id="pv-scan"></span></button></li>
      <li><button class="pipe-stage" data-tab="process"><span class="pipe-name">Decimate</span><span class="pipe-val" id="pv-dec"></span></button></li>
      <li><button class="pipe-stage" data-tab="process"><span class="pipe-name">Texture</span><span class="pipe-val" id="pv-tex"></span></button></li>
      <li><button class="pipe-stage" data-tab="process"><span class="pipe-name">Palette</span><span class="pipe-val" id="pv-pal"></span></button></li>
      <li><button class="pipe-stage" data-tab="look"><span class="pipe-name">Look</span><span class="pipe-val" id="pv-look"></span></button></li>
    </ol>
    <div class="pipe-status" id="pipe-status" role="status" aria-live="polite"></div>
  `;

  const $ = q => el.querySelector(q);
  el.querySelectorAll('.pipe-stage').forEach(b => b.addEventListener('click', () => store.set('activeTab', b.dataset.tab)));

  const setStage = (id, text, skipped) => {
    const v = $(id);
    v.textContent = text;
    v.closest('.pipe-stage').classList.toggle('is-skipped', !!skipped);
  };

  function sync() {
    const s = store.state;
    const st = s.procStats;
    if (!st) {
      setStage('#pv-scan', 'no model', true);
      setStage('#pv-dec', '—', true); setStage('#pv-tex', '—', true); setStage('#pv-pal', '—', true);
    } else {
      setStage('#pv-scan', `${st.srcTris.toLocaleString()} tris`);
      setStage('#pv-dec', s.procDecimate ? `${st.tris.toLocaleString()} tris` : 'skipped', !s.procDecimate);
      const texOn = s.procTexSize !== 'original';
      setStage('#pv-tex', !st.texW ? 'none' : texOn ? (st.texW === st.texH ? `${st.texW} px` : `${st.texW}×${st.texH}`) : 'skipped', !texOn || !st.texW);
      const palOn = s.procPalette !== 'off';
      setStage('#pv-pal', !st.texW ? 'none' : palOn ? `${st.colors.toLocaleString()} colors` : 'skipped', !palOn || !st.texW);
    }
    setStage('#pv-look', !s.lookEnabled ? 'off' : (LOOK_PRESETS[s.lookPreset]?.label ?? 'custom'), !s.lookEnabled);
  }

  let flashTimer = null;
  function status() {
    const s = store.state;
    const box = $('#pipe-status');
    box.classList.toggle('is-busy', s.loadBusy || s.procBusy);
    if (s.loadBusy) { box.textContent = 'Loading model…'; return; }
    if (s.procBusy) { box.textContent = 'Processing…'; return; }
    const st = s.procStats;
    if (!st) { box.textContent = ''; return; }
    const parts = [];
    if (s.loadMs != null) parts.push(`loaded in ${fmtMs(s.loadMs)}`);
    parts.push(`updated in ${fmtMs(st.ms)}`);
    box.textContent = '✓ ' + parts.join(' · ');
    box.classList.remove('is-flash');
    void box.offsetWidth;
    box.classList.add('is-flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => box.classList.remove('is-flash'), 1200);
  }

  ['procStats', 'procDecimate', 'procTexSize', 'procPalette', 'lookEnabled', 'lookPreset'].forEach(k => store.subscribe(k, sync));
  ['loadBusy', 'procBusy', 'procStats'].forEach(k => store.subscribe(k, status));
  sync();
  status();
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
