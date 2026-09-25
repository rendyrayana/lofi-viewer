import { store } from '../../store.js';

export function buildImportPanel(el, { onLoadModel, onLoadTexture, onLoadHDRI, onClearScene }) {
  el.innerHTML = `
    <div class="panel">
      <span class="panel-section-label">Model</span>
      <input type="file" id="inp-model" accept=".glb,.gltf,.obj,.fbx" hidden />
      <label for="inp-model" class="btn btn-primary" style="display:block;text-align:center;cursor:pointer;">
        Load Model (.glb / .obj / .fbx)
      </label>
      <div class="file-info" id="file-info" style="display:none;">
        <span id="fi-name"></span><span id="fi-size"></span>
      </div>
      <input type="file" id="inp-tex" accept="image/*" hidden />
      <label for="inp-tex" class="btn btn-ghost" style="display:block;text-align:center;cursor:pointer;">
        Load Texture Map
      </label>

      <span class="panel-section-label">Environment Assets</span>
      <input type="file" id="inp-hdri" accept=".hdr" hidden />
      <label for="inp-hdri" class="btn btn-ghost" style="display:block;text-align:center;cursor:pointer;">
        Load HDRI / Skybox
      </label>

      <span class="panel-section-label">Scene</span>
      <div class="panel-row">
        <label for="inp-preset">Preset</label>
        <div class="row-right">
          <select id="inp-preset">
            <option value="default">Default PSX</option>
            <option value="horror">Horror Night</option>
            <option value="retro">Retro Arcade</option>
          </select>
        </div>
      </div>
      <button class="btn btn-ghost" id="btn-clear" style="margin-top:8px;">
        🗑 Clear Scene
      </button>
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

  store.subscribe('filename', name => {
    const fi = el.querySelector('#file-info');
    fi.style.display = name ? 'flex' : 'none';
    if (name) {
      el.querySelector('#fi-name').textContent = name;
      el.querySelector('#fi-size').textContent = store.get('filesize') || '';
    }
  });
}
