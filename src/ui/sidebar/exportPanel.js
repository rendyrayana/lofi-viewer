import { store } from '../../store.js';
import { takeSnapshot } from '../../export/snapshot.js';
import { recordTurntable, recordTurntableLoop } from '../../export/record.js';
import { shareLink } from '../../export/preset.js';

export function buildExportPanel(el, getRenderer, getPipeline = null, getControls = null, onEnterViewer = null, onSaveHtml = null, { onExport3mf = null, onExportGlb = null } = {}) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <section class="card">
        <header class="card-head"><h3 class="card-title">Image</h3><p class="card-hint">PNG of the current view</p></header>
        <div class="card-body">
          <div class="panel-row">
            <label for="sel-snapres">Resolution</label>
            <div class="row-right">
              <select id="sel-snapres">
                <option value="native" ${s.snapshotRes === 'native' ? 'selected' : ''}>Native</option>
                <option value="2x" ${s.snapshotRes === '2x' ? 'selected' : ''}>2×</option>
                <option value="4x" ${s.snapshotRes === '4x' ? 'selected' : ''}>4×</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" id="btn-snapshot">Save Snapshot</button>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3 class="card-title">Video</h3><p class="card-hint">Turntable recording (WebM)</p></header>
        <div class="card-body">
          <div class="panel-row">
            <label for="sel-vidres">Resolution</label>
            <div class="row-right">
              <select id="sel-vidres">
                <option value="native" ${s.videoRes === 'native' ? 'selected' : ''}>Native</option>
                <option value="2x" ${s.videoRes === '2x' ? 'selected' : ''}>2×</option>
                <option value="4x" ${s.videoRes === '4x' ? 'selected' : ''}>4×</option>
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="inp-duration">Duration (sec)</label>
            <div class="row-right">
              <input type="number" id="inp-duration" min="1" max="60" step="1" value="${s.exportDuration}" />
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-ghost" id="btn-record">Record Duration</button>
            <button class="btn btn-ghost" id="btn-record-loop" title="Records exactly one full turntable rotation">Record One Loop</button>
          </div>
          <div class="record-progress" id="record-progress" hidden>
            <div class="record-progress-track">
              <div class="record-progress-fill" id="record-progress-fill"></div>
            </div>
            <span class="record-progress-label" id="record-progress-label">0%</span>
          </div>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3 class="card-title">3D print</h3><p class="card-hint">Multi-color 3MF for Bambu Studio, Orca, PrusaSlicer</p></header>
        <div class="card-body">
          <div class="panel-row">
            <label for="inp-printheight">Print height (mm)</label>
            <div class="row-right">
              <input type="number" id="inp-printheight" min="5" max="400" step="1" value="${s.printHeight}" />
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-filaments">Filaments<small class="proc-hint">Used when the Process palette is skipped or 15-bit</small></label>
            <div class="row-right">
              <select id="sel-filaments">
                ${[2, 3, 4, 5, 6, 8, 12, 16].map(n => `<option value="${n}" ${s.printFilaments === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-colordetail">Color detail<small class="proc-hint">Splits faces for coloring only — shape stays low-poly</small></label>
            <div class="row-right">
              <select id="sel-colordetail">
                ${[[0, '1 color per face'], [1, '4× finer'], [2, '16× finer'], [3, '64× finer']].map(([n, l]) => `<option value="${n}" ${s.printColorDetail === n ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-minisland">Merge color specks<small class="proc-hint">Recolor patches smaller than N faces</small></label>
            <div class="row-right">
              <select id="sel-minisland">
                ${[[0, 'Off'], [2, '2 faces'], [4, '4 faces'], [8, '8 faces'], [16, '16 faces'], [32, '32 faces']].map(([n, l]) => `<option value="${n}" ${s.printMinIsland === n ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sw-closeholes">Close holes<small class="proc-hint">Cap open scan boundaries so the mesh is watertight</small></label>
            <div class="row-right">
              <label class="switch-wrap" for="sw-closeholes" aria-label="Close holes">
                <input type="checkbox" id="sw-closeholes" role="switch" ${s.printCloseHoles ? 'checked' : ''} />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
          </div>
          <button class="btn btn-primary" id="btn-3mf">Export 3MF</button>
          <div class="proc-status" id="print-status" aria-live="polite"></div>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3 class="card-title">Share</h3><p class="card-hint">Interactive viewer and processed model</p></header>
        <div class="card-body">
          <button class="btn btn-primary" id="btn-save-html">Save as HTML viewer</button>
          <div class="btn-row">
            <button class="btn btn-ghost" id="btn-glb">Processed GLB</button>
            <button class="btn btn-ghost" id="btn-viewer">Viewer Mode</button>
            <button class="btn btn-ghost" id="btn-share">Preset Link</button>
          </div>
        </div>
      </section>
    </div>
  `;

  el.querySelector('#sel-snapres').addEventListener('change', e => store.set('snapshotRes', e.target.value));
  el.querySelector('#sel-vidres').addEventListener('change', e => store.set('videoRes', e.target.value));
  el.querySelector('#inp-duration').addEventListener('change', e => store.set('exportDuration', parseInt(e.target.value)));

  el.querySelector('#btn-snapshot').addEventListener('click', () => takeSnapshot(getRenderer()));
  el.querySelector('#btn-record').addEventListener('click', () => recordTurntable(getRenderer(), store.get('exportDuration'), store.get('videoRes'), getPipeline?.()));
  el.querySelector('#btn-record-loop').addEventListener('click', () => {
    const btn      = el.querySelector('#btn-record-loop');
    const btnFixed = el.querySelector('#btn-record');
    const progress = el.querySelector('#record-progress');
    const fill     = el.querySelector('#record-progress-fill');
    const label    = el.querySelector('#record-progress-label');

    btn.disabled = true;
    btnFixed.disabled = true;
    progress.hidden = false;
    fill.style.width = '0%';
    label.textContent = '0%';

    recordTurntableLoop(
      getRenderer(), getControls?.(), store.get('videoRes'), getPipeline?.(),
      pct => {
        const p = Math.round(pct);
        fill.style.width = p + '%';
        label.textContent = p + '%';
      },
      () => {
        progress.hidden = true;
        btn.disabled = false;
        btnFixed.disabled = false;
      },
    );
  });
  el.querySelector('#inp-printheight').addEventListener('change', e => {
    const v = Math.min(400, Math.max(5, parseFloat(e.target.value) || 60));
    e.target.value = v;
    store.set('printHeight', v);
  });
  el.querySelector('#sel-filaments').addEventListener('change', e => store.set('printFilaments', parseInt(e.target.value, 10)));
  el.querySelector('#sel-colordetail').addEventListener('change', e => store.set('printColorDetail', parseInt(e.target.value, 10)));
  el.querySelector('#sel-minisland').addEventListener('change', e => store.set('printMinIsland', parseInt(e.target.value, 10)));
  el.querySelector('#sw-closeholes').addEventListener('change', e => store.set('printCloseHoles', e.target.checked));
  el.querySelector('#btn-3mf').addEventListener('click', async () => {
    const btn = el.querySelector('#btn-3mf'), status = el.querySelector('#print-status');
    btn.disabled = true;
    status.textContent = store.get('procBusy') ? 'Waiting for processing to finish…' : 'Exporting…';
    try {
      status.textContent = (await onExport3mf?.()) || '';
    } catch (e) {
      console.error('3MF export failed:', e);
      status.textContent = `Export failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });
  el.querySelector('#btn-glb').addEventListener('click', () => onExportGlb?.());
  el.querySelector('#btn-save-html').addEventListener('click', () => onSaveHtml?.());
  el.querySelector('#btn-viewer').addEventListener('click', () => onEnterViewer?.());
  el.querySelector('#btn-share').addEventListener('click', () => shareLink());
}
