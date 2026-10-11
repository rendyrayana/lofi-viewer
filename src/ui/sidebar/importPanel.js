import { store } from '../../store.js';

// Batch state lives outside the panel so progress survives tab switches.
const batch = { open: false, pairs: [], status: [], running: false, outputs: { obj: false, mf3: false, glb: false } };
const fmtMs = ms => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

export function buildImportPanel(el, { onLoadModel, onLoadTexture, onLoadHDRI, onClearScene, pairBatchFiles, onRunBatch }) {
  el.innerHTML = `
    <div class="panel">
      <section class="card">
        <header class="card-head"><h3 class="card-title">Model</h3><p class="card-hint">GLB, OBJ or FBX — or drop a file on the viewport</p></header>
        <div class="card-body">
          <input type="file" id="inp-model" accept=".glb,.gltf,.obj,.fbx" hidden />
          <label for="inp-model" class="btn btn-primary btn-file">Load Model</label>
          <div class="file-info" id="file-info" style="display:none;">
            <span id="fi-name"></span><span id="fi-size"></span>
          </div>
          <input type="file" id="inp-tex" accept="image/*" hidden />
          <label for="inp-tex" class="btn btn-ghost btn-file">Load Texture Map<small class="btn-sub">for OBJ scans with a separate image</small></label>
        </div>
      </section>

      <section class="card">
        <header class="card-head"><h3 class="card-title">Environment</h3><p class="card-hint">Optional HDRI background and lighting</p></header>
        <div class="card-body">
          <input type="file" id="inp-hdri" accept=".hdr" hidden />
          <label for="inp-hdri" class="btn btn-ghost btn-file">Load HDRI (.hdr)</label>
        </div>
      </section>

      <button class="btn btn-ghost btn-small" id="btn-clear">Clear Scene</button>

      <details class="fold fold-quiet" id="batch" ${batch.open ? 'open' : ''}>
        <summary><span class="fold-title">Batch process</span><span class="fold-hint">Several scans, current settings → CSV + files</span></summary>
        <div class="fold-body">
          <p class="step-note">Select models and their texture images together; textures are matched by file name. Each scan runs through the current Process, Look and print settings.</p>
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
    </div>
  `;

  el.querySelector('#inp-model').addEventListener('change', e => {
    if (e.target.files[0]) onLoadModel(e.target.files[0]);
    e.target.value = '';
  });

  el.querySelector('#inp-tex').addEventListener('change', e => {
    if (e.target.files[0]) onLoadTexture(e.target.files[0]);
    e.target.value = '';
  });

  el.querySelector('#inp-hdri').addEventListener('change', e => {
    if (e.target.files[0]) onLoadHDRI(e.target.files[0]);
    e.target.value = '';
  });

  el.querySelector('#btn-clear').addEventListener('click', () => {
    if (confirm('Clear scene? This will remove all loaded models.')) onClearScene();
  });

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

  const unsubFile = store.subscribe('filename', name => {
    const fi = el.querySelector('#file-info');
    fi.style.display = name ? 'flex' : 'none';
    if (name) {
      el.querySelector('#fi-name').textContent = name;
      el.querySelector('#fi-size').textContent = store.get('filesize') || '';
    }
  });

  return () => unsubFile();
}
