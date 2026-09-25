import { store } from '../../store.js';

const TABS = ['import', 'render', 'environment', 'camera', 'effects', 'export'];

export function buildTabs(stripEl, onSelect) {
  stripEl.innerHTML = TABS.map(t => `
    <button role="tab" data-tab="${t}" aria-pressed="${store.get('activeTab') === t}">
      ${t.charAt(0).toUpperCase() + t.slice(1)}
    </button>
  `).join('');

  stripEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      store.set('activeTab', tab);
      stripEl.querySelectorAll('button').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.tab === tab))
      );
      onSelect(tab);
    });
  });

  store.subscribe('activeTab', tab => {
    stripEl.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab))
    );
  });
}
