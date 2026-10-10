import { store } from '../../store.js';
import { LOOK_PRESETS, applyLook } from '../../export/preset.js';
import { buildRenderPanel } from './renderPanel.js';
import { buildEnvironmentPanel } from './environmentPanel.js';
import { buildCameraPanel } from './cameraPanel.js';
import { buildEffectsPanel } from './effectsPanel.js';

const SECTIONS = [
  { id: 'render', label: 'Render', hint: 'Resolution, vertex snap, dither, texture warp' },
  { id: 'environment', label: 'Environment', hint: 'Background, lights, fog' },
  { id: 'camera', label: 'Camera', hint: 'Projection, FOV, turntable, aspect' },
  { id: 'effects', label: 'Effects', hint: 'CRT, scanlines, grain, bloom' },
];
const openSections = new Set(['render']);

function mkSwitch(id, checked, label) {
  return `
    <label class="switch-wrap" for="${id}" aria-label="${label}">
      <input type="checkbox" id="${id}" role="switch" ${checked ? 'checked' : ''} />
      <span class="switch-track"><span class="switch-thumb"></span></span>
    </label>`;
}

export function buildLookPanel(el, { environment = {}, camera = {}, onRebuild } = {}) {
  const s = store.state;
  const groups = [...new Set(Object.values(LOOK_PRESETS).map(p => p.group))];

  el.innerHTML = `
    <div class="panel">
      <section class="step ${s.lookEnabled ? '' : 'is-off'}" id="look-master">
        <header class="step-head">
          <div class="step-title">
            <label for="sw-look" class="step-name">Retro look</label>
            <p class="step-sum" id="look-sum"></p>
          </div>
          ${mkSwitch('sw-look', s.lookEnabled, 'Retro look on or off')}
        </header>
      </section>

      <span class="panel-section-label">Look presets</span>
      <p class="panel-intro">Presets change only how the model is rendered — your Process steps stay as they are.</p>
      <div class="preset-groups">
        ${groups.map(g => `
          <div class="preset-group">
            <span class="preset-group-label">${g}</span>
            <div class="chip-row">
              ${Object.entries(LOOK_PRESETS).filter(([, p]) => p.group === g).map(([k, p]) =>
                `<button class="chip" data-preset="${k}" aria-pressed="${s.lookPreset === k}">${p.label}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      <span class="panel-section-label">Fine-tune</span>
      <div class="look-sections ${s.lookEnabled ? '' : 'is-dim'}" id="look-sections">
        ${SECTIONS.map(sec => `
          <details class="fold" data-sec="${sec.id}" ${openSections.has(sec.id) ? 'open' : ''}>
            <summary><span class="fold-title">${sec.label}</span><span class="fold-hint">${sec.hint}</span></summary>
            <div class="fold-body" id="look-${sec.id}"></div>
          </details>`).join('')}
      </div>
    </div>
  `;

  const $ = q => el.querySelector(q);
  const rebuild = () => onRebuild?.();
  buildRenderPanel($('#look-render'), { onReset: rebuild });
  buildEnvironmentPanel($('#look-environment'), { ...environment, onReset: rebuild });
  buildCameraPanel($('#look-camera'), { ...camera, onReset: rebuild });
  buildEffectsPanel($('#look-effects'), { onReset: rebuild });

  el.querySelectorAll('details.fold').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) openSections.add(d.dataset.sec); else openSections.delete(d.dataset.sec);
  }));

  function sync() {
    const on = store.get('lookEnabled');
    const preset = store.get('lookPreset');
    $('#look-master').classList.toggle('is-off', !on);
    $('#look-sections').classList.toggle('is-dim', !on);
    $('#sw-look').checked = on;
    $('#look-sum').textContent = on
      ? (LOOK_PRESETS[preset] ? `Preset: ${LOOK_PRESETS[preset].label}` : 'Custom settings')
      : 'Off — showing plain shading of the model';
    el.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === preset)));
  }

  $('#sw-look').addEventListener('change', e => store.set('lookEnabled', e.target.checked));
  el.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    applyLook(b.dataset.preset);
    rebuild();
  }));

  const unsubs = [store.subscribe('lookEnabled', sync), store.subscribe('lookPreset', sync)];
  sync();
  return () => unsubs.forEach(u => u());
}
