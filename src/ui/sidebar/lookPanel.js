import { store } from '../../store.js';
import { LOOK_PRESETS, applyLook } from '../../export/preset.js';
import { buildRenderPanel } from './renderPanel.js';
import { buildEnvironmentPanel } from './environmentPanel.js';
import { buildCameraPanel } from './cameraPanel.js';
import { buildEffectsPanel } from './effectsPanel.js';

const SECTIONS = [
  { id: 'render', label: 'Render', build: buildRenderPanel },
  { id: 'environment', label: 'Environment', build: buildEnvironmentPanel },
  { id: 'camera', label: 'Camera', build: buildCameraPanel },
  { id: 'effects', label: 'Effects', build: buildEffectsPanel },
];
let activeSection = 'render';

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
        <div class="step-body">
          <div class="panel-row">
            <label for="sel-look-preset">Preset<small class="proc-hint">Changes rendering only — Process stays as set</small></label>
            <div class="row-right">
              <select id="sel-look-preset">
                <option value="custom" ${s.lookPreset === 'custom' ? 'selected' : ''}>Custom</option>
                ${groups.map(g => `
                  <optgroup label="${g}">
                    ${Object.entries(LOOK_PRESETS).filter(([, p]) => p.group === g).map(([k, p]) =>
                      `<option value="${k}" ${s.lookPreset === k ? 'selected' : ''}>${p.label}</option>`).join('')}
                  </optgroup>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </section>

      <div class="subtabs ${s.lookEnabled ? '' : 'is-dim'}" id="look-sections">
        <div class="subtab-strip" role="tablist" aria-label="Look settings">
          ${SECTIONS.map(sec => `
            <button role="tab" id="tab-${sec.id}" aria-controls="look-${sec.id}" aria-selected="${sec.id === activeSection}" data-sec="${sec.id}">${sec.label}</button>`).join('')}
        </div>
        ${SECTIONS.map(sec => `
          <div class="subtab-body" role="tabpanel" id="look-${sec.id}" aria-labelledby="tab-${sec.id}" ${sec.id === activeSection ? '' : 'hidden'}></div>`).join('')}
      </div>
    </div>
  `;

  const $ = q => el.querySelector(q);
  const rebuild = () => onRebuild?.();
  const extra = { environment, camera };
  for (const sec of SECTIONS) sec.build($(`#look-${sec.id}`), { ...(extra[sec.id] || {}), onReset: rebuild });

  el.querySelectorAll('.subtab-strip [role="tab"]').forEach(tab => tab.addEventListener('click', () => {
    activeSection = tab.dataset.sec;
    el.querySelectorAll('.subtab-strip [role="tab"]').forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    el.querySelectorAll('.subtab-body').forEach(b => { b.hidden = b.id !== `look-${activeSection}`; });
  }));

  function sync() {
    const on = store.get('lookEnabled');
    const preset = store.get('lookPreset');
    $('#look-master').classList.toggle('is-off', !on);
    $('#look-sections').classList.toggle('is-dim', !on);
    $('#sw-look').checked = on;
    $('#sel-look-preset').value = LOOK_PRESETS[preset] ? preset : 'custom';
    $('#look-sum').textContent = on
      ? (LOOK_PRESETS[preset] ? LOOK_PRESETS[preset].label : 'Custom settings')
      : 'Off — showing plain shading of the model';
  }

  $('#sw-look').addEventListener('change', e => store.set('lookEnabled', e.target.checked));
  $('#sel-look-preset').addEventListener('change', e => {
    if (e.target.value === 'custom') return;
    applyLook(e.target.value);
    rebuild();
  });

  const unsubs = [store.subscribe('lookEnabled', sync), store.subscribe('lookPreset', sync)];
  sync();
  return () => unsubs.forEach(u => u());
}
