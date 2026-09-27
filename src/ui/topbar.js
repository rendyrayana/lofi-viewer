import { store } from '../store.js';

export function buildTopbar(el) {
  el.innerHTML = `
    <div class="topbar-logo">
      <div class="logo-mark" aria-hidden="true">
        <span class="lit"></span><span></span><span class="lit"></span>
        <span class="lit"></span><span></span><span class="lit"></span>
        <span></span><span class="lit"></span><span></span>
      </div>
      <div class="topbar-wordmark">
        <h1>lofi-viewer</h1>
        <p>web-based PSX model viewer</p>
      </div>
    </div>
    <div class="topbar-spacer"></div>
    <span id="filename-badge"></span>
    <div class="topbar-actions">
      <button class="icon-btn" id="btn-invert" aria-label="Toggle light/dark" aria-pressed="false" title="Toggle light/dark">
        <svg id="invert-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="3"/>
          <line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/>
          <line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/>
          <line x1="3.5" y1="3.5" x2="4.9" y2="4.9"/><line x1="11.1" y1="11.1" x2="12.5" y2="12.5"/>
          <line x1="12.5" y1="3.5" x2="11.1" y2="4.9"/><line x1="4.9" y1="11.1" x2="3.5" y2="12.5"/>
        </svg>
      </button>
      <a class="icon-btn" href="https://rendyrayana.my.id/lofi-viewer/" target="_blank" rel="noopener" aria-label="Project page" title="Project page">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="7" cy="7" r="5.5"/>
          <path d="M7 1.5c-2 0-3.5 2.5-3.5 5.5s1.5 5.5 3.5 5.5 3.5-2.5 3.5-5.5S9 1.5 7 1.5Z"/>
          <path d="M1.5 7h11"/>
        </svg>
      </a>
      <a class="icon-btn" href="https://github.com/rendyrayana/lofi-viewer" target="_blank" rel="noopener" aria-label="GitHub repo" title="GitHub">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
        </svg>
      </a>
      <button class="icon-btn" id="btn-fullscreen" aria-label="Toggle fullscreen" title="Toggle fullscreen">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/>
        </svg>
      </button>
    </div>
  `;

  const badge = el.querySelector('#filename-badge');
  const btnInvert = el.querySelector('#btn-invert');
  const btnFS = el.querySelector('#btn-fullscreen');

  store.subscribe('filename', name => { badge.textContent = name || ''; });
  const SUN_SVG = `<circle cx="8" cy="8" r="3"/>
          <line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/>
          <line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/>
          <line x1="3.5" y1="3.5" x2="4.9" y2="4.9"/><line x1="11.1" y1="11.1" x2="12.5" y2="12.5"/>
          <line x1="12.5" y1="3.5" x2="11.1" y2="4.9"/><line x1="4.9" y1="11.1" x2="3.5" y2="12.5"/>`;
  const MOON_SVG = `<path d="M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6Z"/>`;

  store.subscribe('inverted', inv => {
    btnInvert.setAttribute('aria-pressed', String(inv));
    const icon = btnInvert.querySelector('#invert-icon');
    if (icon) icon.innerHTML = inv ? MOON_SVG : SUN_SVG;
    btnInvert.title = inv ? 'Switch to dark mode' : 'Switch to light mode';
  });

  btnInvert.addEventListener('click', () => store.set('inverted', !store.get('inverted')));

  btnFS.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
}
