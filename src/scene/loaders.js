import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const fbxLoader = new FBXLoader();
const rgbeLoader = new RGBELoader();
const texLoader = new THREE.TextureLoader();

export function loadModel(file, onProgress) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();

    const done = (obj) => { URL.revokeObjectURL(url); resolve(obj); };
    const fail = (e) => { URL.revokeObjectURL(url); reject(e); };

    if (ext === 'glb' || ext === 'gltf') {
      gltfLoader.load(url, g => done(g.scene), onProgress, fail);
    } else if (ext === 'obj') {
      objLoader.load(url, done, onProgress, fail);
    } else if (ext === 'fbx') {
      fbxLoader.load(url, done, onProgress, fail);
    } else {
      fail(new Error(`Unsupported format: .${ext}`));
    }
  });
}

export function loadTexture(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    texLoader.load(url, tex => { URL.revokeObjectURL(url); resolve(tex); }, undefined, reject);
  });
}

export function loadHDRI(file, renderer) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    rgbeLoader.load(url, hdr => {
      URL.revokeObjectURL(url);
      const gen = new THREE.PMREMGenerator(renderer);
      gen.compileEquirectangularShader();
      const envMap = gen.fromEquirectangular(hdr).texture;
      hdr.dispose();
      gen.dispose();
      resolve(envMap);
    }, undefined, reject);
  });
}

export function countTris(object) {
  let count = 0;
  object.traverse(child => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geo = child.geometry;
      if (geo.index) count += geo.index.count / 3;
      else count += geo.attributes.position.count / 3;
    }
  });
  return Math.round(count);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
