// Batch: several scans through the editor pipeline with the current settings.
// Batch state lives outside the panel so progress survives tab switches.
const batch = { open: false, pairs: [], status: [], running: false, outputs: { obj: false, mf3: false, glb: false } };
const fmtMs = ms => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

export function buildBatchSection(el, { pairBatchFiles, onRunBatch }) {
  el.innerHTML = `
      <details class="fold fold-quiet fold-batch" id="batch" ${batch.open ? 'open' : ''}>
        <summary><span class="fold-title">Batch process with current settings</span><span class="fold-hint">Many scans → files + a measurements CSV</span></summary>
        <div class="fold-body">
          <p class="step-note">Tune one scan in the editor first. Then select several models with their texture images (matched by file name): each one runs with the current Process, Look and print settings, and a CSV with one row of measurements per scan downloads at the end.</p>
          <input type="file" id="inp-batch" accept=".glb,.gltf,.obj,.fbx,image/*" multiple hidden />
          <label for="inp-batch" class="btn btn-ghost btn-file btn-small">Choose files</label>
          <ul class="batch-list" id="batch-list"></ul>
          <span class="field-label">Also export per scan</span>
          <div class="batch-outputs">
            <label><input type="checkbox" data-out="obj" ${batch.outputs.obj ? 'checked' : ''} /> Print OBJ + MTL</label>
            <label><input type="checkbox" data-out="mf3" ${batch.outputs.mf3 ? 'checked' : ''} /> 3MF</label>
            <label><input type="checkbox" data-out="glb" ${batch.outputs.glb ? 'checked' : ''} /> GLB</label>
          </div>
          <button class="btn btn-primary" id="btn-run-batch">Run batch</button>
          <div class="proc-status" id="batch-status" aria-live="polite"></div>
        </div>
      </details>
  `;
  const $ = q => el.querySelector(q);
  function renderBatch() {
    $('#batch-list').innerHTML = batch.pairs.map((p, i) => {
      const st = batch.status[i] || {};
      const state = st.state === 'done' ? `✓ ${fmtMs(st.ms)}` : st.state === 'failed' ? `failed` : st.state === 'running' ? 'running…' : '';
      return `<li class="${st.state || ''}" title="${st.error || ''}"><span class="bl-name">${p.model.name}</span><span class="bl-tex">${p.texture ? p.texture.name : 'no texture'}</span><span class="bl-state">${state}</span></li>`;
    }).join('');
    $('#btn-run-batch').disabled = batch.running || !batch.pairs.length;
    $('#inp-batch').disabled = batch.running;
  }
  $('#batch').addEventListener('toggle', e => { batch.open = e.target.open; });
  $('#inp-batch').addEventListener('change', e => {
    batch.pairs = pairBatchFiles([...e.target.files]);
    batch.status = [];
    $('#batch-status').textContent = batch.pairs.length ? `${batch.pairs.length} scan${batch.pairs.length > 1 ? 's' : ''} ready` : 'No model files selected';
    e.target.value = '';
    renderBatch();
  });
  el.querySelectorAll('[data-out]').forEach(cb => cb.addEventListener('change', () => { batch.outputs[cb.dataset.out] = cb.checked; }));
  $('#btn-run-batch').addEventListener('click', async () => {
    batch.running = true;
    batch.status = batch.pairs.map(() => ({}));
    renderBatch();
    const t0 = performance.now();
    try {
      const rows = await onRunBatch(batch.pairs, batch.outputs, (i, state, ms, error) => {
        batch.status[i] = { state, ms, error };
        if (el.isConnected) renderBatch();
      });
      const failed = rows.filter(r => r.error).length;
      if (el.isConnected) $('#batch-status').textContent = `Finished in ${fmtMs(performance.now() - t0)} · ${rows.length - failed} done${failed ? `, ${failed} failed` : ''} · CSV downloaded`;
    } finally {
      batch.running = false;
      if (el.isConnected) renderBatch();
    }
  });
  renderBatch();

}
