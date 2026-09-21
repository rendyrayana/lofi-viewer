import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

import { replaceModel } from './scene.js';

const loadingBar = document.getElementById('loading-bar');

const manager = new THREE.LoadingManager(
  () => { if (loadingBar) { loadingBar.style.width = '100%'; setTimeout(() => { loadingBar.style.width = '0%'; }, 400); } },
  (url, loaded, total) => { if (loadingBar) loadingBar.style.width = `${(loaded / total) * 100}%`; },
  (url) => { console.error('Load error:', url); if (loadingBar) loadingBar.style.width = '0%'; }
);

function centerAndScale(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.0 / maxDim;

  object.position.sub(center);
  object.scale.setScalar(scale);
}

export function loadFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);

  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader(manager);
    loader.load(url, (gltf) => {
      centerAndScale(gltf.scene);
      replaceModel(gltf.scene);
      URL.revokeObjectURL(url);
    });
  } else if (ext === 'obj') {
    const loader = new OBJLoader(manager);
    loader.load(url, (obj) => {
      centerAndScale(obj);
      replaceModel(obj);
      URL.revokeObjectURL(url);
    });
  } else if (ext === 'fbx') {
    const loader = new FBXLoader(manager);
    loader.load(url, (fbx) => {
      centerAndScale(fbx);
      replaceModel(fbx);
      URL.revokeObjectURL(url);
    });
  } else if (ext === 'ply') {
    const loader = new PLYLoader(manager);
    loader.load(url, (geo) => {
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const group = new THREE.Group();
      group.add(mesh);
      centerAndScale(group);
      replaceModel(group);
      URL.revokeObjectURL(url);
    });
  } else {
    console.warn('Unsupported file format:', ext);
    URL.revokeObjectURL(url);
  }
}

export function initDragDrop(container) {
  const overlay = document.getElementById('drop-overlay');

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    overlay.classList.add('active');
  });

  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) {
      overlay.classList.remove('active');
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    overlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file) loadFromFile(file);
  });

  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) loadFromFile(file);
      fileInput.value = '';
    });
  }
}
