import { store } from '../../store.js';
import { takeSnapshot } from '../../export/snapshot.js';
import { recordTurntable, recordTurntableLoop } from '../../export/record.js';
import { shareLink } from '../../export/preset.js';

export function buildExportPanel(el, getRenderer, getPipeline = null, onEnterViewer = null, onSaveHtml = null) {
  const s = store.state;

  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Image</span>
      <button class="btn btn-primary" id="btn-snapshot">Snapshot PNG</button>
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

      <span class="panel-section-label">Video</span>
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
      <button class="btn btn-ghost" id="btn-record">Record Turntable (WebM)</button>
      <button class="btn btn-ghost" id="btn-record-loop" title="Records exactly one full turntable rotation">
        Record One Loop
      </button>

      <span class="panel-section-label">Share</span>
      <button class="btn btn-primary" id="btn-save-html">Save as HTML</button>
      <button class="btn btn-ghost" id="btn-viewer">Viewer Mode</button>
      <button class="btn btn-ghost" id="btn-share">Copy Preset Link</button>
    </div>
  `;

  el.querySelector('#sel-snapres').addEventListener('change', e => store.set('snapshotRes', e.target.value));
  el.querySelector('#sel-vidres').addEventListener('change', e => store.set('videoRes', e.target.value));
  el.querySelector('#inp-duration').addEventListener('change', e => store.set('exportDuration', parseInt(e.target.value)));

  el.querySelector('#btn-snapshot').addEventListener('click', () => takeSnapshot(getRenderer()));
  el.querySelector('#btn-record').addEventListener('click', () => recordTurntable(getRenderer(), store.get('exportDuration'), store.get('videoRes'), getPipeline?.()));
  el.querySelector('#btn-record-loop').addEventListener('click', () => recordTurntableLoop(getRenderer(), store.get('videoRes'), getPipeline?.()));
  el.querySelector('#btn-save-html').addEventListener('click', () => onSaveHtml?.());
  el.querySelector('#btn-viewer').addEventListener('click', () => onEnterViewer?.());
  el.querySelector('#btn-share').addEventListener('click', () => shareLink());
}
