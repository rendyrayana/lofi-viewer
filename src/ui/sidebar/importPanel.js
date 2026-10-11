import { store } from '../../store.js';

export function buildImportPanel(el, { onLoadModel, onLoadTexture, onLoadHDRI, onClearScene }) {
  el.innerHTML = `
    <div class="panel">
      <section class="card">
        <header class="card-head"><h3 class="card-title">Model</h3><p class="card-hint">GLB, OBJ or FBX, or drop a file on the viewport</p></header>
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
