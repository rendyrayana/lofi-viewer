import { store } from '../store.js';

export function buildTopbar(el) {
  el.innerHTML = `
    <div class="topbar-logo">
      <div class="logo-mark" aria-hidden="true">
        <span class="lit"></span><span></span><span class="lit"></span>
        <span></span><span class="lit"></span><span></span>
        <span class="lit"></span><span></span><span class="lit"></span>
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
