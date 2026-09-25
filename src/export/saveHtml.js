import { getPresetData } from './preset.js';
import { store } from '../store.js';

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Process in chunks to avoid call-stack limits on large files.
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function saveViewerHtml(modelFile, texFile = null, camState = null) {
  if (!modelFile) { alert('No model loaded — load a model first.'); return; }
  const ext = modelFile.name.split('.').pop().toLowerCase();
  if (ext === 'fbx') {
    alert('FBX cannot be exported to HTML (its decoder is too large). Re-export your model as GLB first.');
    return;
  }

  const buffer = await modelFile.arrayBuffer();
  const b64 = arrayBufferToBase64(buffer);

  let texB64 = null;
  let texMime = null;
  if (texFile) {
    const texBuf = await texFile.arrayBuffer();
    texB64 = arrayBufferToBase64(texBuf);
    const texExt = texFile.name.split('.').pop().toLowerCase();
    texMime = texExt === 'jpg' || texExt === 'jpeg' ? 'image/jpeg'
            : texExt === 'webp' ? 'image/webp'
            : 'image/png';
  }

  const settings = getPresetData();
  const bgType  = store.get('bgType');
  const bgColor = store.get('bgColor');

  const html = buildHtml(b64, ext, settings, bgType, bgColor, texB64, texMime, camState);

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = modelFile.name.replace(/\.[^.]+$/, '') + '-lofi.html';
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML template — everything inlined, no external dependencies except Three.js
// from cdn.jsdelivr.net (requires network on first open, then browser-cached).
// ─────────────────────────────────────────────────────────────────────────────
function buildHtml(modelB64, modelExt, settings, bgType, bgColor, texB64 = null, texMime = null, camState = null) {
  const VER = '0.168.0';
  const CDN = `https://cdn.jsdelivr.net/npm/three@${VER}`;
  const settingsJson = JSON.stringify(settings);
  const bgColorJson  = JSON.stringify(bgColor);

  const loaderImport = modelExt === 'obj'
    ? `import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';`
    : `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';`;

  const loaderCall = modelExt === 'obj'
    ? `new OBJLoader().load(blobUrl, obj => { status(''); setup(obj); URL.revokeObjectURL(blobUrl); }, null, err => status('Load error: ' + err));`
    : `new GLTFLoader().load(blobUrl, gltf => { status(''); setup(gltf.scene); URL.revokeObjectURL(blobUrl); }, null, err => status('Load error: ' + err));`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>lofi-viewer</title>
<script type="importmap">
{
  "imports": {
    "three": "${CDN}/build/three.module.js",
    "three/addons/": "${CDN}/examples/jsm/"
  }
}
<\/script>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden;background:#0b0a0f}
  canvas{display:block;width:100%;height:100%}
  #ui{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);
    font-family:monospace;font-size:11px;color:rgba(200,200,200,0.45);
    pointer-events:none;white-space:nowrap;text-align:center}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="ui">Loading model…</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
${loaderImport}

function status(msg) {
  const el = document.getElementById('ui');
  el.textContent = msg || 'drag to orbit · scroll to zoom · right-drag to pan';
}
window.onerror = (msg, src, line) => status('Error: ' + msg);
window.addEventListener('unhandledrejection', e => status('Error: ' + e.reason));

// ── Embedded data ────────────────────────────────────────────────────────────
const MODEL_B64  = ${JSON.stringify(modelB64)};
const MODEL_EXT  = ${JSON.stringify(modelExt)};
const SETTINGS   = ${settingsJson};
const BG_TYPE    = ${JSON.stringify(bgType)};
const BG_COLOR   = ${bgColorJson};
const TEX_B64    = ${texB64 ? JSON.stringify(texB64) : 'null'};
const TEX_MIME   = ${texMime ? JSON.stringify(texMime) : 'null'};
const CAM_STATE  = ${camState ? JSON.stringify(camState) : 'null'};

// ── Decode base64 → Blob URL ─────────────────────────────────────────────────
function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
const mimeMap = { glb:'model/gltf-binary', gltf:'model/gltf+json', obj:'text/plain' };
const blobUrl = URL.createObjectURL(new Blob([b64ToArrayBuffer(MODEL_B64)], { type: mimeMap[MODEL_EXT] || 'application/octet-stream' }));

// ── Shaders ──────────────────────────────────────────────────────────────────
const PSX_VERT = \`
uniform float uSnapPrecision;
uniform bool uVertexSnap;
out vec2 vUv;
out vec3 vAffineUvW;
out vec3 vNormal;
out vec3 vViewPos;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = -mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
  if (uVertexSnap) {
    float snap = uSnapPrecision;
    gl_Position.xyz /= gl_Position.w;
    gl_Position.x = floor(gl_Position.x * snap + 0.5) / snap;
    gl_Position.y = floor(gl_Position.y * snap + 0.5) / snap;
    gl_Position.xyz *= gl_Position.w;
  }
  vAffineUvW = vec3(uv * gl_Position.w, gl_Position.w);
}
\`;

const PSX_FRAG = \`
uniform bool uAffineWarp;
uniform bool uHasMap;
uniform sampler2D map;
uniform vec3 diffuse;
uniform float opacity;
uniform float uExposure;
uniform vec3 ambientLightColor;
uniform vec3 keyLightColor;
uniform vec3 keyLightDir;
uniform bool uFogEnabled;
uniform vec3 uFogColor;
uniform float uFogDensity;
in vec2 vUv;
in vec3 vAffineUvW;
in vec3 vNormal;
in vec3 vViewPos;
out vec4 fragColor;
void main() {
  vec2 texUv = uAffineWarp ? vAffineUvW.xy / vAffineUvW.z : vUv;
  vec4 col = vec4(diffuse, opacity);
  if (uHasMap) col *= texture(map, texUv);
  vec3 normal = normalize(vNormal);
  float NdotL = max(dot(normal, normalize(keyLightDir)), 0.0);
  vec3 light = ambientLightColor + keyLightColor * NdotL;
  vec3 linearCol = col.rgb * light * uExposure;
  if (uFogEnabled && uFogDensity > 0.0) {
    float dist = length(vViewPos);
    float fogFactor = clamp(exp(-uFogDensity * dist), 0.0, 1.0);
    vec3 fogLinear = pow(max(uFogColor, vec3(0.0)), vec3(2.2));
    linearCol = mix(fogLinear, linearCol, fogFactor);
  }
  vec3 srgbCol = mix(linearCol * 12.92,
    pow(clamp(linearCol, vec3(0.0031308), vec3(1.0)), vec3(1.0/2.4)) * 1.055 - 0.055,
    step(vec3(0.0031308), linearCol));
  fragColor = vec4(srgbCol, col.a);
}
\`;

const PASS_VERT = \`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
\`;

const BLIT_FRAG = \`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
\`;

const DITHER_FRAG = \`
uniform sampler2D tDiffuse;
uniform float uBits;
uniform int uDither;
varying vec2 vUv;
float bayer2(ivec2 p) {
  int idx = (p.y & 1) * 2 + (p.x & 1);
  if (idx == 0) return 0.0/4.0; if (idx == 1) return 2.0/4.0;
  if (idx == 2) return 3.0/4.0; return 1.0/4.0;
}
float bayer4(ivec2 p) {
  int x = p.x & 3, y = p.y & 3; int idx = y * 4 + x;
  if (idx == 0)  return 0.0/16.0;  if (idx == 1)  return 8.0/16.0;
  if (idx == 2)  return 2.0/16.0;  if (idx == 3)  return 10.0/16.0;
  if (idx == 4)  return 12.0/16.0; if (idx == 5)  return 4.0/16.0;
  if (idx == 6)  return 14.0/16.0; if (idx == 7)  return 6.0/16.0;
  if (idx == 8)  return 3.0/16.0;  if (idx == 9)  return 11.0/16.0;
  if (idx == 10) return 1.0/16.0;  if (idx == 11) return 9.0/16.0;
  if (idx == 12) return 15.0/16.0; if (idx == 13) return 7.0/16.0;
  if (idx == 14) return 13.0/16.0; return 5.0/16.0;
}
void main() {
  vec4 color = texture2D(tDiffuse, vUv);
  float levels = pow(2.0, uBits) - 1.0;
  if (uDither != 0) {
    ivec2 coord = ivec2(gl_FragCoord.xy);
    float threshold = (uDither == 2) ? bayer2(coord) : bayer4(coord);
    color.rgb += (threshold - 0.5) / levels;
  }
  color.rgb = floor(color.rgb * levels + 0.5) / levels;
  gl_FragColor = clamp(color, 0.0, 1.0);
}
\`;

const CRT_FRAG = \`
uniform sampler2D tDiffuse;
uniform float uCurvature;
uniform float uVignette;
varying vec2 vUv;
vec2 barrel(vec2 uv, float k) {
  vec2 p = uv * 2.0 - 1.0;
  p *= 1.0 + k * dot(p, p);
  return p * 0.5 + 0.5;
}
void main() {
  vec2 uv = vUv;
  if (uCurvature > 0.0) {
    uv = barrel(uv, uCurvature * 0.3);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0,0.0,0.0,1.0); return;
    }
  }
  vec4 color = texture2D(tDiffuse, uv);
  if (uVignette > 0.0) {
    vec2 vc = (vUv - 0.5) * 2.0;
    float v = 1.0 - dot(vc, vc) * uVignette * 0.5;
    color.rgb *= clamp(v, 0.0, 1.0);
  }
  gl_FragColor = color;
}
\`;

const FX_FRAG = \`
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uCA;
uniform float uGrain;
uniform float uTime;
uniform int uGrade;
uniform int uBloom;
uniform float uBloomIntensity;
uniform float uScanlines;
uniform float uScanlineOpacity;
uniform float uDPR;
uniform float uCurvature;
uniform float uScreenH;
varying vec2 vUv;
vec2 barrel(vec2 uv, float k) {
  vec2 p = uv * 2.0 - 1.0;
  p *= 1.0 + k * dot(p, p);
  return p * 0.5 + 0.5;
}
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec3 col;
  if (uCA > 0.0) {
    vec2 off = (uv - 0.5) * uCA * 0.02;
    col.r = texture2D(tDiffuse, uv + off).r;
    col.g = texture2D(tDiffuse, uv).g;
    col.b = texture2D(tDiffuse, uv - off).b;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  if (uGrain > 0.0) {
    float g = rand(uv + fract(uTime * 0.01)) * 2.0 - 1.0;
    col += g * uGrain * 0.08;
  }
  if (uGrade == 1) {
    col = mat3(1.1,0.05,0.0, 0.0,0.95,0.0, 0.0,0.0,0.7) * col;
  } else if (uGrade == 2) {
    col = mat3(0.8,0.0,0.0, 0.0,0.9,0.0, 0.1,0.1,1.2) * col;
  } else if (uGrade == 3) {
    float lum = dot(col, vec3(0.299,0.587,0.114));
    col = vec3(lum * 1.1, lum * 0.9, lum * 0.65);
  }
  if (uBloom == 1) col += texture2D(tBloom, uv).rgb * uBloomIntensity;
  if (uScanlines > 0.0) {
    vec2 distUv = (uCurvature > 0.0) ? barrel(vUv, uCurvature * 0.3) : vUv;
    if (distUv.x >= 0.0 && distUv.x <= 1.0 && distUv.y >= 0.0 && distUv.y <= 1.0) {
      float sourceY = distUv.y * uScreenH;
      float bandPx  = max(1.0, uScanlines * 8.0) * uDPR;
      float phase   = mod(sourceY, bandPx * 2.0);
      float bright  = step(bandPx, phase);
      float darkVal = 1.0 - uScanlineOpacity * 0.5;
      col *= mix(darkVal, 1.0, bright);
    }
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
\`;

const BLOOM_EXTRACT_FRAG = \`
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  vec3 bloom = max(col - uThreshold, 0.0) / (1.0 - uThreshold + 0.001);
  gl_FragColor = vec4(bloom, 1.0);
}
\`;

const BLOOM_BLUR_FRAG = \`
uniform sampler2D tDiffuse;
uniform vec2 uOffset;
varying vec2 vUv;
void main() {
  vec3 col =
    texture2D(tDiffuse, vUv - uOffset * 2.0).rgb * 0.0625
  + texture2D(tDiffuse, vUv - uOffset).rgb       * 0.25
  + texture2D(tDiffuse, vUv).rgb                 * 0.375
  + texture2D(tDiffuse, vUv + uOffset).rgb       * 0.25
  + texture2D(tDiffuse, vUv + uOffset * 2.0).rgb * 0.0625;
  gl_FragColor = vec4(col, 1.0);
}
\`;

// ── PSX Pipeline ─────────────────────────────────────────────────────────────
class PSXPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.psxMaterials = [];

    this.globalUniforms = {
      uSnapPrecision:    { value: 64 },
      uVertexSnap:       { value: false },
      uAffineWarp:       { value: false },
      uExposure:         { value: 1.0 },
      ambientLightColor: { value: new THREE.Color(1,1,1).multiplyScalar(0.5) },
      keyLightColor:     { value: new THREE.Color(1,1,1) },
      keyLightDir:       { value: new THREE.Vector3(2,3,2).normalize() },
      uFogEnabled:       { value: false },
      uFogColor:         { value: new THREE.Color(0,0,0) },
      uFogDensity:       { value: 0.0 },
    };

    this._bloomEnabled = false;
    this._initTargets();
    this._initPasses();
  }

  _rt(w, h, nearest = false) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter,
      magFilter: nearest ? THREE.NearestFilter : THREE.LinearFilter,
    });
  }

  _initTargets() {
    const w = Math.max(1, this.renderer.domElement.width  || 320);
    const h = Math.max(1, this.renderer.domElement.height || 240);
    const s = SETTINGS.renderScale || 0.25;
    this.psxRT    = this._rt(Math.max(1, Math.floor(w * s)), Math.max(1, Math.floor(h * s)), true);
    this.rtA      = this._rt(w, h);
    this.rtB      = this._rt(w, h);
    this.rtBloomA = this._rt(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    this.rtBloomB = this._rt(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
  }

  _pass(fs, extras = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, ...extras },
      vertexShader: PASS_VERT, fragmentShader: fs,
      depthTest: false, depthWrite: false,
    });
  }

  _initPasses() {
    this.screenCam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.screenGeo   = new THREE.PlaneGeometry(2,2);
    this.screenScene = new THREE.Scene();
    this.screenMesh  = new THREE.Mesh(this.screenGeo, null);
    this.screenMesh.frustumCulled = false;
    this.screenScene.add(this.screenMesh);

    this.blitMat = this._pass(BLIT_FRAG);

    this.ditherUniforms = { tDiffuse:{value:null}, uBits:{value:5.0}, uDither:{value:1} };
    this.ditherMat = new THREE.ShaderMaterial({
      uniforms: this.ditherUniforms, vertexShader: PASS_VERT, fragmentShader: DITHER_FRAG,
      depthTest:false, depthWrite:false,
    });

    this.crtUniforms = { tDiffuse:{value:null}, uCurvature:{value:0.0}, uVignette:{value:0.3} };
    this.crtMat = new THREE.ShaderMaterial({
      uniforms: this.crtUniforms, vertexShader: PASS_VERT, fragmentShader: CRT_FRAG,
      depthTest:false, depthWrite:false,
    });

    const dpr = this.renderer.getPixelRatio();
    this.fxUniforms = {
      tDiffuse:{value:null}, tBloom:{value:null},
      uCA:{value:0.0}, uGrain:{value:0.0}, uTime:{value:0.0},
      uGrade:{value:0}, uBloom:{value:0}, uBloomIntensity:{value:0.5},
      uScanlines:{value:0.0}, uScanlineOpacity:{value:0.5},
      uDPR:{value:dpr}, uCurvature:{value:0.0},
      uScreenH:{value:Math.max(1, this.renderer.domElement.height)},
    };
    this.fxMat = new THREE.ShaderMaterial({
      uniforms: this.fxUniforms, vertexShader: PASS_VERT, fragmentShader: FX_FRAG,
      depthTest:false, depthWrite:false,
    });

    const bw = this.rtBloomA.width, bh = this.rtBloomA.height;
    this.bloomExtractMat = this._pass(BLOOM_EXTRACT_FRAG, { uThreshold:{value:0.6} });
    this.bloomHMat = this._pass(BLOOM_BLUR_FRAG, { uOffset:{value:new THREE.Vector2(1/bw,0)} });
    this.bloomVMat = this._pass(BLOOM_BLUR_FRAG, { uOffset:{value:new THREE.Vector2(0,1/bh)} });
  }

  _renderPass(mat, src, dst) {
    this.screenMesh.material = mat;
    mat.uniforms.tDiffuse.value = src;
    this.renderer.setRenderTarget(dst);
    const prev = this.renderer.autoClear;
    this.renderer.autoClear = false;
    if (dst === null) this.renderer.clear(true, false, false);
    else this.renderer.clear();
    this.renderer.render(this.screenScene, this.screenCam);
    this.renderer.autoClear = prev;
  }

  createPSXMaterial(origMat) {
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uSnapPrecision: this.globalUniforms.uSnapPrecision,
        uVertexSnap:    this.globalUniforms.uVertexSnap,
        uAffineWarp:    this.globalUniforms.uAffineWarp,
        uExposure:      this.globalUniforms.uExposure,
        uHasMap:   {value:false}, diffuse:{value:new THREE.Color(0x888888)},
        opacity:   {value:1.0},  map:{value:null},
        ambientLightColor: this.globalUniforms.ambientLightColor,
        keyLightColor:     this.globalUniforms.keyLightColor,
        keyLightDir:       this.globalUniforms.keyLightDir,
        uFogEnabled: this.globalUniforms.uFogEnabled,
        uFogColor:   this.globalUniforms.uFogColor,
        uFogDensity: this.globalUniforms.uFogDensity,
      },
      vertexShader: PSX_VERT, fragmentShader: PSX_FRAG,
      side: THREE.FrontSide, toneMapped: false,
    });
    if (origMat) {
      if (origMat.opacity !== undefined) mat.uniforms.opacity.value = origMat.opacity;
      if (origMat.transparent) mat.transparent = true;
      if (origMat.map) {
        const tex = origMat.map;
        tex.magFilter = tex.minFilter = THREE.NearestFilter;
        tex.needsUpdate = true;
        mat.uniforms.map.value = tex;
        mat.uniforms.uHasMap.value = true;
        mat.uniforms.diffuse.value.set(1,1,1);
      } else if (origMat.color) {
        const c = origMat.color;
        const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
        if (lum < 0.05 || lum > 0.9) mat.uniforms.diffuse.value.set(0.4,0.4,0.4);
        else mat.uniforms.diffuse.value.copy(c);
      }
    }
    return mat;
  }

  applyToScene() {
    this.psxMaterials.forEach(m => m.dispose());
    this.psxMaterials = [];
    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.geometry.attributes.uv) {
        const n = obj.geometry.attributes.position.count;
        obj.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(m => { const p = this.createPSXMaterial(m); this.psxMaterials.push(p); return p; });
      } else {
        const p = this.createPSXMaterial(obj.material); obj.material = p; this.psxMaterials.push(p);
      }
    });
  }

  applySettings(s) {
    this.globalUniforms.uSnapPrecision.value = s.snapPrecision  ?? 64;
    this.globalUniforms.uVertexSnap.value    = s.vertexSnap     ?? false;
    this.globalUniforms.uAffineWarp.value    = s.affineWarp     ?? false;
    this.globalUniforms.uExposure.value      = s.exposure       ?? 1.0;
    this.globalUniforms.ambientLightColor.value.set(1,1,1).multiplyScalar(s.ambientIntensity ?? 0.5);
    this.globalUniforms.keyLightColor.value.set(s.lightColor ?? '#ffffff').multiplyScalar(s.keyLightIntensity ?? 1.0);
    this.globalUniforms.uFogEnabled.value    = (s.fogDensity ?? 0) > 0;
    this.globalUniforms.uFogColor.value.set(s.fogColor ?? '#000000');
    this.globalUniforms.uFogDensity.value    = s.fogDensity ?? 0;

    const filter = s.textureFilter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    this.psxMaterials.forEach(m => {
      if (m.uniforms.map.value) { m.uniforms.map.value.magFilter = m.uniforms.map.value.minFilter = filter; m.uniforms.map.value.needsUpdate = true; }
      m.side = (s.backfaceCulling ?? true) ? THREE.FrontSide : THREE.DoubleSide;
    });

    const bits = s.colorDepth === '15bit' ? 5.0 : 8.0;
    this.ditherUniforms.uBits.value   = bits;
    const dm = {none:0,bayer4:1,bayer2:2};
    this.ditherUniforms.uDither.value = dm[s.ditherPattern] ?? 1;

    this.crtUniforms.uCurvature.value      = s.crtCurvature    ?? 0;
    this.crtUniforms.uVignette.value       = s.vignette        ?? 0;
    this.fxUniforms.uScanlines.value       = s.scanlines       ?? 0;
    this.fxUniforms.uScanlineOpacity.value = s.scanlineOpacity ?? 0.5;
    this.fxUniforms.uCurvature.value       = s.crtCurvature    ?? 0;
    this.fxUniforms.uCA.value              = s.chromaticAberration ?? 0;
    this.fxUniforms.uGrain.value           = s.filmGrain       ?? 0;
    const gm = {none:0,warmVHS:1,coldCRT:2,sepia:3};
    this.fxUniforms.uGrade.value           = gm[s.colorGrade]  ?? 0;
    this._bloomEnabled = !!(s.bloom && (s.bloomIntensity ?? 0) > 0);
    this.fxUniforms.uBloom.value           = this._bloomEnabled ? 1 : 0;
    this.fxUniforms.uBloomIntensity.value  = s.bloomIntensity  ?? 0.5;
  }

  resize(w, h) {
    const dpr = this.renderer.getPixelRatio();
    this.fxUniforms.uDPR.value     = dpr;
    this.fxUniforms.uScreenH.value = Math.max(1, Math.floor(h * dpr));
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    this.rtA.setSize(pw, ph); this.rtB.setSize(pw, ph);
    const bw = Math.max(1, Math.floor(pw/2)), bh = Math.max(1, Math.floor(ph/2));
    this.rtBloomA.setSize(bw,bh); this.rtBloomB.setSize(bw,bh);
    this.bloomHMat.uniforms.uOffset.value.set(1/bw,0);
    this.bloomVMat.uniforms.uOffset.value.set(0,1/bh);
    this.psxRT.setSize(Math.max(1,Math.floor(pw*(SETTINGS.renderScale??0.25))),
                       Math.max(1,Math.floor(ph*(SETTINGS.renderScale??0.25))));
  }

  render(time) {
    this.fxUniforms.uTime.value = time;
    this.renderer.setRenderTarget(this.psxRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this._renderPass(this.blitMat,  this.psxRT.texture, this.rtA);
    this._renderPass(this.ditherMat, this.rtA.texture,  this.rtB);
    this._renderPass(this.crtMat,   this.rtB.texture,   this.rtA);
    if (this._bloomEnabled) {
      this._renderPass(this.bloomExtractMat, this.rtA.texture,    this.rtBloomA);
      this._renderPass(this.bloomHMat,       this.rtBloomA.texture, this.rtBloomB);
      this._renderPass(this.bloomVMat,       this.rtBloomB.texture, this.rtBloomA);
      this.fxUniforms.tBloom.value = this.rtBloomA.texture;
    } else {
      this.fxUniforms.tBloom.value = null;
    }
    this._renderPass(this.fxMat, this.rtA.texture, null);
  }
}

// ── Scene setup ──────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
// PSX shader encodes sRGB manually; Linear output space means no double-encode.
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x0b0a0f);

const scene  = new THREE.Scene();
const isPerspective = (SETTINGS.projection ?? 'perspective') === 'perspective';
const fov = SETTINGS.fov ?? 45;
const camera = isPerspective
  ? new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.01, 1000)
  : new THREE.OrthographicCamera(-2,2,2,-2,0.01,1000);
camera.position.set(2.4, 1.8, 2.4);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotate = !!(SETTINGS.turntable);
controls.autoRotateSpeed = -((SETTINGS.rotationSpeed ?? 1.0) * 2);

// Background
if (BG_TYPE === 'color') scene.background = new THREE.Color(BG_COLOR);

const pipeline = new PSXPipeline(renderer, scene, camera);

// ── Load model ───────────────────────────────────────────────────────────────
// Mirrors the editor's frameObject: FOV-aware fit, 3/4 view offset, breathing room.
function frameObject(obj) {
  const box    = new THREE.Box3().setFromObject(obj);
  const size   = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (camera.isPerspectiveCamera) {
    const fovRad = camera.fov * (Math.PI / 180);
    const distV  = maxDim / (2 * Math.tan(fovRad / 2));
    const fovH   = 2 * Math.atan(Math.tan(fovRad / 2) * camera.aspect);
    const distH  = (maxDim * Math.SQRT2) / (2 * Math.tan(fovH / 2));
    const d      = Math.max(distV, distH, 0.5) * 4;
    controls.target.copy(center).sub(new THREE.Vector3(0, maxDim * 0.225, 0));
    camera.position.copy(center).add(new THREE.Vector3(d * 0.6, d * 0.45, d * 0.6));
    camera.near = d * 0.01; camera.far = d * 10;
    camera.updateProjectionMatrix();
  } else {
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(4 * 0.6, 4 * 0.45, 4 * 0.6));
  }
  controls.update();
}

function applyOverrideTex(tex) {
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  // Don't override diffuse — matches editor behavior (handleLoadTexture doesn't reset diffuse).
  pipeline.psxMaterials.forEach(m => {
    m.uniforms.map.value = tex;
    m.uniforms.uHasMap.value = true;
  });
}

function applyCamera() {
  if (CAM_STATE) {
    camera.position.fromArray(CAM_STATE.pos);
    camera.near = CAM_STATE.near;
    camera.far  = CAM_STATE.far;
    if (CAM_STATE.fov && camera.isPerspectiveCamera) { camera.fov = CAM_STATE.fov; }
    camera.updateProjectionMatrix();
    controls.target.fromArray(CAM_STATE.target);
    controls.update();
  }
}

function setup(obj) {
  scene.add(obj);
  pipeline.applyToScene();
  pipeline.applySettings(SETTINGS);
  frameObject(obj);    // sets near/far and a sensible default first
  applyCamera();       // then override with the exact camera position from the editor
  if (TEX_B64 && TEX_MIME) {
    const dataUrl = 'data:' + TEX_MIME + ';base64,' + TEX_B64;
    new THREE.TextureLoader().load(dataUrl, applyOverrideTex);
  }
}

${loaderCall}

// ── Resize ───────────────────────────────────────────────────────────────────
function resizeAll() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  pipeline.resize(w, h);
  if (camera.isPerspectiveCamera) {
    camera.aspect = w / h; camera.updateProjectionMatrix();
  } else {
    const s = 2, asp = w / h;
    camera.left = -s * asp; camera.right = s * asp;
    camera.top = s; camera.bottom = -s;
    camera.updateProjectionMatrix();
  }
}
resizeAll();
window.addEventListener('resize', resizeAll);

// ── Render loop ──────────────────────────────────────────────────────────────
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - last) / 1000, 0.1);
  last = now;
  controls.update(delta);
  pipeline.render(now * 0.001);
}
requestAnimationFrame(animate);
</script>
</body>
</html>`;
}
