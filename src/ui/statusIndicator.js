import { store } from '../store.js';

// Small status indicator in the top bar: loading / processing progress and
// how long the last update took, so every change visibly lands.
export function buildStatusIndicator(box) {
  let flashTimer = null;
  function status() {
    const s = store.state;
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
  ['loadBusy', 'procBusy', 'procStats'].forEach(k => store.subscribe(k, status));
  status();
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}
