import { store } from '../store.js';

const STORAGE_KEY = 'lofi-viewer-inverted';

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    // User has explicitly chosen — respect that
    store.set('inverted', saved === 'true');
  } else {
    // No saved preference: follow the OS/browser color scheme
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    store.set('inverted', !prefersDark); // inverted=true → light chrome
  }

  // Keep in sync if the OS scheme changes (only when no saved pref)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (localStorage.getItem(STORAGE_KEY) === null) {
      store.set('inverted', !e.matches);
    }
  });

  store.subscribe('inverted', apply);
  apply(store.get('inverted'));
}

function apply(inverted) {
  document.documentElement.setAttribute('data-theme', inverted ? 'light' : 'dark');
  try { localStorage.setItem(STORAGE_KEY, String(inverted)); } catch {}
}
