import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import psxVert from './shaders/psx.vert.glsl?raw';
import psxFrag from './shaders/psx.frag.glsl?raw';
import clayVert from './shaders/clay.vert.glsl?raw';
import clayFrag from './shaders/clay.frag.glsl?raw';
import crtFrag from './shaders/crt.frag.glsl?raw';

// ---- Global state ----
export const state = {
  // PSX
  pixelRatio: 0.15,
  snapResolution: 128.0,
  snapVertices: true,
  useAffineUV: true,
  useDither: true,
  ditherGamma: 2.2,
  exposure: 1.0,
  brightness: 0.0,
  contrast: 1.0,

  // Lighting
  dirIntensity: 1.0,
  dirPitch: 45,
  dirYaw: 30,
  ambientIntensity: 0.4,

  // CRT
  scanlines: true,
  scanlineIntensity: 0.6,
  vignette: true,
  vignetteDarkness: 0.7,
  vignetteOuter: 0.75,
  vignetteInner: 0.4,
  chromaticAberration: true,
  chromaticAberrationAmount: 1.0,
  filmGrain: true,
  grainIntensity: 0.5,
  warble: true,
  warbleAmount: 1.0,
  warbleSpeed: 2.0,

  // Scene
  bgColor: '#0a0a0a',
  clayMode: false,
  turntable: false,
  turntableSpeed: 0.5,
};

// Refs exported for use elsewhere
export let renderer, camera, controls, scene;
export let composer;
export let currentModel = null;
export let psxMaterial = null;
export let clayMaterial = null;

let pixelRenderTarget;
let blitScene, blitCamera, blitMesh;
let crtPass;
let dirLight, ambientLight;
let clock;

// The low-res target dimensions
function getTargetSize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  return {
    w: Math.max(1, Math.round(w * state.pixelRatio)),
    h: Math.max(1, Math.round(h * state.pixelRatio)),
  };
}

function buildCheckeredTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tiles = 8;
  const tileSize = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#4a9eff' : '#1a1a2e';
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildPSXMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: {
      snapResolution:  { value: state.snapResolution },
      snapVertices:    { value: state.snapVertices },
      useAffineUV:     { value: state.useAffineUV },
      useDither:       { value: state.useDither },
      ditherGamma:     { value: state.ditherGamma },
      exposure:        { value: state.exposure },
      brightness:      { value: state.brightness },
      contrast:        { value: state.contrast },
      albedoMap:       { value: map },
    },
    vertexShader: psxVert,
    fragmentShader: psxFrag,
    side: THREE.FrontSide,
  });
}

function buildClayMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: clayVert,
    fragmentShader: clayFrag,
    side: THREE.FrontSide,
  });
}

function buildCRTShader() {
  return {
    uniforms: {
      tDiffuse:            { value: null },
      time:                { value: 0 },
      resolution:          { value: new THREE.Vector2(1, 1) },
      grainIntensity:      { value: state.filmGrain ? state.grainIntensity : 0 },
      vignetteDarkness:    { value: state.vignette ? state.vignetteDarkness : 0 },
      vignetteOuterRadius: { value: state.vignetteOuter },
      vignetteInnerRadius: { value: state.vignetteInner },
      scanlineIntensity:   { value: state.scanlines ? state.scanlineIntensity : 0 },
      chromaticAberration: { value: state.chromaticAberration ? state.chromaticAberrationAmount : 0 },
      warbleAmount:        { value: state.warble ? state.warbleAmount : 0 },
      warbleSpeed:         { value: state.warbleSpeed },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: crtFrag,
  };
}

export function initScene(container) {
  clock = new THREE.Clock();

  // ---- Renderer ----
  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(new THREE.Color(state.bgColor));
  container.appendChild(renderer.domElement);

  // ---- Main scene ----
  scene = new THREE.Scene();
  scene.background = new THREE.Color(state.bgColor);

  // ---- Camera ----
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  camera.position.set(0, 0, 3);

  // ---- Lights ----
  ambientLight = new THREE.AmbientLight(0xffffff, state.ambientIntensity);
  scene.add(ambientLight);

  dirLight = new THREE.DirectionalLight(0xffffff, state.dirIntensity);
  scene.add(dirLight);
  updateLightDir();

  // ---- Controls ----
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // ---- Default model ----
  const geo = new THREE.TorusKnotGeometry(0.8, 0.25, 200, 32);
  const tex = buildCheckeredTexture();
  psxMaterial = buildPSXMaterial(tex);
  clayMaterial = buildClayMaterial();
  const mesh = new THREE.Mesh(geo, psxMaterial);
  scene.add(mesh);
  currentModel = mesh;

  // ---- Pixel render target ----
  const ts = getTargetSize(container);
  pixelRenderTarget = new THREE.WebGLRenderTarget(ts.w, ts.h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  // ---- Blit scene (full-screen quad that reads pixel render target) ----
  blitScene = new THREE.Scene();
  blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitGeo = new THREE.PlaneGeometry(2, 2);
  const blitMat = new THREE.MeshBasicMaterial({ map: pixelRenderTarget.texture });
  blitMesh = new THREE.Mesh(blitGeo, blitMat);
  blitScene.add(blitMesh);

  // ---- EffectComposer on blit scene ----
  composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(blitScene, blitCamera);
  composer.addPass(renderPass);

  const crtShader = buildCRTShader();
  crtPass = new ShaderPass(crtShader);
  crtPass.renderToScreen = true;
  composer.addPass(crtPass);

  // ---- Initial size ----
  handleResize(container);

  // ---- Window resize ----
  const ro = new ResizeObserver(() => handleResize(container));
  ro.observe(container);
}

function updateLightDir() {
  const pitch = THREE.MathUtils.degToRad(state.dirPitch);
  const yaw   = THREE.MathUtils.degToRad(state.dirYaw);
  dirLight.position.set(
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw)
  );
}

export function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;

  renderer.setSize(w, h, false);
  composer.setSize(w, h);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const ts = getTargetSize(container);
  pixelRenderTarget.setSize(ts.w, ts.h);

  if (crtPass) {
    crtPass.uniforms.resolution.value.set(ts.w, ts.h);
  }
}

export function setPixelRatio(val, container) {
  state.pixelRatio = val;
  handleResize(container);
}

export function updateUniforms() {
  if (!psxMaterial) return;

  psxMaterial.uniforms.snapResolution.value  = state.snapResolution;
  psxMaterial.uniforms.snapVertices.value    = state.snapVertices;
  psxMaterial.uniforms.useAffineUV.value     = state.useAffineUV;
  psxMaterial.uniforms.useDither.value       = state.useDither;
  psxMaterial.uniforms.ditherGamma.value     = state.ditherGamma;
  psxMaterial.uniforms.exposure.value        = state.exposure;
  psxMaterial.uniforms.brightness.value      = state.brightness;
  psxMaterial.uniforms.contrast.value        = state.contrast;

  if (crtPass) {
    crtPass.uniforms.grainIntensity.value      = state.filmGrain ? state.grainIntensity : 0;
    crtPass.uniforms.vignetteDarkness.value    = state.vignette ? state.vignetteDarkness : 0;
    crtPass.uniforms.vignetteOuterRadius.value = state.vignetteOuter;
    crtPass.uniforms.vignetteInnerRadius.value = state.vignetteInner;
    crtPass.uniforms.scanlineIntensity.value   = state.scanlines ? state.scanlineIntensity : 0;
    crtPass.uniforms.chromaticAberration.value = state.chromaticAberration ? state.chromaticAberrationAmount : 0;
    crtPass.uniforms.warbleAmount.value        = state.warble ? state.warbleAmount : 0;
    crtPass.uniforms.warbleSpeed.value         = state.warbleSpeed;
  }

  if (ambientLight) ambientLight.intensity = state.ambientIntensity;
  if (dirLight) {
    dirLight.intensity = state.dirIntensity;
    updateLightDir();
  }

  scene.background = new THREE.Color(state.bgColor);
  renderer.setClearColor(new THREE.Color(state.bgColor));
}

export function swapMaterial(mesh, clayMode) {
  if (!mesh) return;
  mesh.traverse(node => {
    if (node.isMesh) {
      if (clayMode) {
        node.userData._origMat = node.material;
        node.material = clayMaterial;
      } else {
        node.material = node.userData._origMat || psxMaterial;
      }
    }
  });
}

export function applyClayMode(clay) {
  state.clayMode = clay;
  if (currentModel) swapMaterial(currentModel, clay);
}

export function tick() {
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  controls.enabled = !state.turntable;
  if (state.turntable && currentModel) {
    currentModel.rotation.y += delta * state.turntableSpeed;
  }

  controls.update();

  if (crtPass) crtPass.uniforms.time.value = elapsed;

  // Render main scene to pixel RT
  renderer.setRenderTarget(pixelRenderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Compose (blit + CRT)
  composer.render();
}

export function replaceModel(object) {
  if (currentModel) {
    scene.remove(currentModel);
    currentModel.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach(m => m.dispose());
        } else {
          node.material?.dispose();
        }
      }
    });
  }

  // Apply current material mode
  object.traverse(node => {
    if (node.isMesh) {
      const map = node.material?.map || null;
      const mat = buildPSXMaterial(map);
      node.userData._origMat = mat;
      node.material = state.clayMode ? clayMaterial : mat;
    }
  });

  // Rebuild global psxMaterial reference to something usable
  // (individual meshes each get their own copy now)
  psxMaterial = buildPSXMaterial(buildCheckeredTexture());

  scene.add(object);
  currentModel = object;
}
