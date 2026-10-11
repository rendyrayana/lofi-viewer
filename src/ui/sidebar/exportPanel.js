import { store } from '../../store.js';
import { takeSnapshot } from '../../export/snapshot.js';
import { recordTurntable, recordTurntableLoop } from '../../export/record.js';
import { shareLink } from '../../export/preset.js';
import { buildBatchSection } from './batchSection.js';

let printAdvancedOpen = false;

export function buildExportPanel(el, getRenderer, getPipeline = null, getControls = null, onEnterViewer = null, onSaveHtml = null, { onExportPrint = null, onExportGlb = null, pairBatchFiles = null, onRunBatch = null } = {}) {
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
        <header class="card-head"><h3 class="card-title">3D print</h3><p class="card-hint">Multi-color files for Bambu Studio, Orca, PrusaSlicer</p></header>
        <div class="card-body">
          <div class="panel-row">
            <label for="inp-printheight">Print height (mm)</label>
            <div class="row-right">
              <input type="number" id="inp-printheight" min="5" max="400" step="1" value="${s.printHeight}" />
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-filaments">Filaments<small class="proc-hint">Used when the Process palette is skipped, 15-bit, or has more than 16 colors</small></label>
            <div class="row-right">
              <select id="sel-filaments">
                ${[2, 3, 4, 5, 6, 8, 12, 16].map(n => `<option value="${n}" ${s.printFilaments === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sw-printpreview">Preview print colors<small class="proc-hint">Show exactly what goes to the slicer</small></label>
            <div class="row-right">
              <label class="switch-wrap" for="sw-printpreview" aria-label="Preview print colors">
                <input type="checkbox" id="sw-printpreview" role="switch" ${s.printPreview ? 'checked' : ''} />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
          </div>
          <div class="proc-status" id="preview-info" aria-live="polite">${s.printPreviewInfo || ''}</div>
          <button class="btn btn-primary" id="btn-obj-print">Export for Bambu Studio (OBJ + MTL)</button>
          <button class="btn btn-ghost" id="btn-3mf">Export 3MF (Orca / PrusaSlicer)</button>
          <div class="proc-status" id="print-status" aria-live="polite"></div>
          <details class="fold fold-inner" id="print-advanced" ${printAdvancedOpen ? 'open' : ''}>
            <summary><span class="fold-title">Advanced</span><span class="fold-hint">Color detail, smoothing, specks, holes</span></summary>
            <div class="fold-body">
          <div class="panel-row">
            <label for="sel-colordetail">Color detail<small class="proc-hint">Faces split only along color edges, read from the original scan</small></label>
            <div class="row-right">
              <select id="sel-colordetail">
                ${[[0, '1 color per face'], [2, 'Adaptive · up to 16×'], [3, 'Adaptive · up to 64×'], [4, 'Adaptive · up to 256×']].map(([n, l]) => `<option value="${n}" ${s.printColorDetail === n ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sw-mergeshades-print">Merge shades<small class="proc-hint">When filament colors are picked from the scan</small></label>
            <div class="row-right">
              <label class="switch-wrap" for="sw-mergeshades-print" aria-label="Merge shades">
                <input type="checkbox" id="sw-mergeshades-print" role="switch" ${s.procMergeShades ? 'checked' : ''} />
                <span class="switch-track"><span class="switch-thumb"></span></span>
              </label>
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-smooth">Smooth edges<small class="proc-hint">Straightens ragged color boundaries</small></label>
            <div class="row-right">
              <select id="sel-smooth">
                ${[[0, 'Off'], [1, 'Light'], [2, 'Medium'], [4, 'Strong']].map(([n, l]) => `<option value="${n}" ${s.printSmooth === n ? 'selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="panel-row">
            <label for="sel-minarea">Merge color specks<small class="proc-hint">Patches smaller than this printed area</small></label>
            <div class="row-right">
              <select id="sel-minarea">
                ${[[0, 'Off'], [0.5, '0.5 mm²'], [1, '1 mm²'], [2, '2 mm²'], [4, '4 mm²'], [8, '8 mm²']].map(([n, l]) => `<option value="${n}" ${s.printMinArea === n ? 'selected' : ''}>${l}</option>`).join('')}
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
            </div>
          </details>
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
      <div id="batch-slot"></div>
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
  el.querySelector('#sel-minarea').addEventListener('change', e => store.set('printMinArea', parseFloat(e.target.value)));
  el.querySelector('#sel-smooth').addEventListener('change', e => store.set('printSmooth', parseInt(e.target.value, 10)));
  el.querySelector('#sw-mergeshades-print').addEventListener('change', e => store.set('procMergeShades', e.target.checked));
  el.querySelector('#sw-printpreview').addEventListener('change', e => store.set('printPreview', e.target.checked));
  buildBatchSection(el.querySelector('#batch-slot'), { pairBatchFiles, onRunBatch });
  el.querySelector('#print-advanced').addEventListener('toggle', e => { printAdvancedOpen = e.target.open; });
  const unsubs = [
    store.subscribe('printPreviewInfo', v => { el.querySelector('#preview-info').textContent = v || ''; }),
    store.subscribe('printPreview', v => { el.querySelector('#sw-printpreview').checked = v; }),
  ];
  el.querySelector('#sw-closeholes').addEventListener('change', e => store.set('printCloseHoles', e.target.checked));
  const runPrintExport = async (format, btn) => {
    const status = el.querySelector('#print-status');
    const buttons = el.querySelectorAll('#btn-3mf, #btn-obj-print');
    buttons.forEach(b => { b.disabled = true; });
    status.textContent = store.get('procBusy') ? 'Waiting for processing to finish…' : 'Exporting…';
    try {
      status.textContent = (await onExportPrint?.(format)) || '';
    } catch (e) {
      console.error('Print export failed:', e);
      status.textContent = `Export failed: ${e.message}`;
    } finally {
      buttons.forEach(b => { b.disabled = false; });
    }
  };
  el.querySelector('#btn-obj-print').addEventListener('click', () => runPrintExport('obj'));
  el.querySelector('#btn-3mf').addEventListener('click', () => runPrintExport('3mf'));
  el.querySelector('#btn-glb').addEventListener('click', () => onExportGlb?.());
  el.querySelector('#btn-save-html').addEventListener('click', () => onSaveHtml?.());
  el.querySelector('#btn-viewer').addEventListener('click', () => onEnterViewer?.());
  el.querySelector('#btn-share').addEventListener('click', () => shareLink());

  return () => unsubs.forEach(u => u());
}
