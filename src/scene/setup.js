import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function setupScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // PSX shader encodes manually
  renderer.setClearColor(0x0b0a0f);

  const scene = new THREE.Scene();

  const perspCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
  perspCamera.position.set(2.4, 1.8, 2.4); // 3/4 view default, overridden by frameObject

  const orthoCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
  orthoCamera.position.set(2.4, 1.8, 2.4);

  let activeCamera = perspCamera;

  const controls = new OrbitControls(perspCamera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(2, 3, 2);
  scene.add(keyLight);

  // Grid lives in a separate scene so it renders at full resolution (not through PSX pipeline)
  const helperScene = new THREE.Scene();
  const grid = new THREE.GridHelper(10, 20, 0x282830, 0x1e1e24);
  grid.userData._isHelper = true;
  helperScene.add(grid);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);

    const asp = w / h;
    perspCamera.aspect = asp;
    perspCamera.updateProjectionMatrix();

    const s = 2;
    orthoCamera.left = -s * asp;
    orthoCamera.right = s * asp;
    orthoCamera.top = s;
    orthoCamera.bottom = -s;
    orthoCamera.updateProjectionMatrix();
  }
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);
  ro.observe(canvas); // also watch canvas itself for aspect-ratio CSS changes

  function setCamera(type) {
    if (type === 'perspective') {
      activeCamera = perspCamera;
      controls.object = perspCamera;
    } else {
      activeCamera = orthoCamera;
      controls.object = orthoCamera;
    }
    controls.update();
  }

  function frameObject(object) {
    if (!object) return;
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = perspCamera.fov * (Math.PI / 180);
    // Fit vertically
    const distV = maxDim / (2 * Math.tan(fov / 2));
    // Fit horizontally — at 45° azimuth the model projects √2 × wider
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * perspCamera.aspect);
    const distH = (maxDim * Math.SQRT2) / (2 * Math.tan(fovH / 2));
    // Use the tighter constraint plus 2.2× breathing room
    const d = Math.max(distV, distH, 0.5) * 4;

    // Target slightly below model center so the camera tilts up a touch,
    // which raises the model in screen space and feels more centered.
    controls.target.copy(center).sub(new THREE.Vector3(0, maxDim * 0.225, 0));
    // 3/4 view: 45° azimuth, ~26° elevation
    const offset = new THREE.Vector3(d * 0.6, d * 0.45, d * 0.6);
    perspCamera.position.copy(center).add(offset);
    orthoCamera.position.copy(center).add(offset);
    perspCamera.near = d * 0.01;
    perspCamera.far = d * 10;
    perspCamera.updateProjectionMatrix();
    perspCamera.lookAt(center);
    controls.update();
  }

  function resetView() {
    const d = 4;
    perspCamera.position.set(d * 0.6, d * 0.45, d * 0.6);
    orthoCamera.position.set(d * 0.6, d * 0.45, d * 0.6);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    renderer, scene, helperScene, perspCamera, orthoCamera, controls,
    ambientLight, keyLight, grid,
    get camera() { return activeCamera; },
    setCamera, frameObject, resetView, resize,
  };
}
