import { store } from '../../store.js';

export const TABS = [
  { id: 'import', label: 'Import' },
  { id: 'process', label: 'Process' },
  { id: 'look', label: 'Look' },
  { id: 'export', label: 'Export' },
];

export function buildTabs(stripEl) {
  stripEl.innerHTML = TABS.map((t, i) => `
    <button role="tab" data-tab="${t.id}" aria-pressed="${store.get('activeTab') === t.id}">
      <span class="tab-num">${i + 1}</span>${t.label}
    </button>
  `).join('');

  stripEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => store.set('activeTab', btn.dataset.tab));
  });

  store.subscribe('activeTab', tab => {
    stripEl.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab))
    );
  });
}
