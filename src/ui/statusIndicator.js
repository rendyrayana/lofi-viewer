import { store } from '../store.js';
import { LOOK_PRESETS } from '../export/preset.js';

const STAGES = [
  { id: 'scan', label: 'Scan', tab: 'import' },
  { id: 'dec', label: 'Decimate', tab: 'process' },
  { id: 'tex', label: 'Texture', tab: 'process' },
  { id: 'pal', label: 'Palette', tab: 'process' },
  { id: 'look', label: 'Look', tab: 'look' },
];

// One status button in the top bar (loading / processing / "updated in …").
// Clicking it opens a panel with every pipeline stage; each row jumps to the
// tab where that stage is set.
export function buildStatusIndicator(wrap) {
  wrap.innerHTML = `
    <button class="pipe-status" id="pipe-status" aria-haspopup="true" aria-expanded="false" aria-controls="status-pop" title="Pipeline status">
      <span id="pipe-status-text" role="status" aria-live="polite"></span>
    </button>
    <div class="status-pop" id="status-pop" hidden>
      <ul>
        ${STAGES.map(st => `<li><button data-tab="${st.tab}"><span class="sp-name">${st.label}</span><span class="sp-val" id="sp-${st.id}"></span></button></li>`).join('')}
      </ul>
    </div>
  `;
  const btn = wrap.querySelector('#pipe-status');
  const text = wrap.querySelector('#pipe-status-text');
  const pop = wrap.querySelector('#status-pop');

  const setOpen = open => {
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(pop.hidden));
  pop.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    store.set('activeTab', b.dataset.tab);
    setOpen(false);
  }));
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  const setStage = (id, value, skipped) => {
    const v = wrap.querySelector(`#sp-${id}`);
    v.textContent = value;
    v.parentElement.classList.toggle('is-skipped', !!skipped);
  };

  function stages() {
    const s = store.state, st = s.procStats;
    if (!st) {
      setStage('scan', 'no model', true);
      ['dec', 'tex', 'pal'].forEach(id => setStage(id, '—', true));
    } else {
      setStage('scan', `${st.srcTris.toLocaleString()} tris`);
      setStage('dec', s.procDecimate ? `${st.tris.toLocaleString()} tris` : 'skipped', !s.procDecimate);
      const texOn = s.procTexSize !== 'original';
      setStage('tex', !st.texW ? 'none' : texOn ? `${st.texW}×${st.texH} px` : 'skipped', !texOn || !st.texW);
      const palOn = s.procPalette !== 'off';
      setStage('pal', !st.texW ? 'none' : palOn ? `${st.colors.toLocaleString()} colors` : 'skipped', !palOn || !st.texW);
    }
    setStage('look', !s.lookEnabled ? 'off' : (LOOK_PRESETS[s.lookPreset]?.label ?? 'custom'), !s.lookEnabled);
  }

  let flashTimer = null;
  function status() {
    const s = store.state;
    btn.classList.toggle('is-busy', s.loadBusy || s.procBusy);
    if (s.loadBusy) { text.textContent = 'Loading model…'; return; }
    if (s.procBusy) { text.textContent = 'Processing…'; return; }
    const st = s.procStats;
    if (!st) { text.textContent = 'No model'; return; }
    const parts = [];
    if (s.loadMs != null) parts.push(`loaded in ${fmtMs(s.loadMs)}`);
    parts.push(`updated in ${fmtMs(st.ms)}`);
    text.textContent = '✓ ' + parts.join(' · ');
    btn.classList.remove('is-flash');
    void btn.offsetWidth;
    btn.classList.add('is-flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => btn.classList.remove('is-flash'), 1200);
  }

  ['procStats', 'procDecimate', 'procTexSize', 'procPalette', 'lookEnabled', 'lookPreset'].forEach(k => store.subscribe(k, stages));
  ['loadBusy', 'procBusy', 'procStats'].forEach(k => store.subscribe(k, status));
  stages();
  status();
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
