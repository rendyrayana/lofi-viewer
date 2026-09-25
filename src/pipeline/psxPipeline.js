import * as THREE from 'three';
import { PSX_VERT, PSX_FRAG, DITHER_SHADER, CRT_SHADER, FX_SHADER, BLOOM_EXTRACT_FRAG, BLOOM_BLUR_FRAG } from './shaders.js';

// Shared vertex shader for all screen-quad passes (ShaderMaterial).
// Three.js injects 'position' (vec3) and 'uv' attributes automatically.
// PlaneGeometry(2,2) has x,y ∈ [-1,1] — output directly as NDC to skip the camera.
const PASS_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLIT_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

function makePassMat(fragmentShader, extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, ...extraUniforms },
    vertexShader: PASS_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

export class PSXPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.psxMaterials = [];
    this.psxMeshes = [];

    this.globalUniforms = {
      uSnapPrecision: { value: 64 },
      uVertexSnap:    { value: false },
      uAffineWarp:    { value: false },
      uExposure:         { value: 1.0 },
      ambientLightColor: { value: new THREE.Color(1, 1, 1).multiplyScalar(0.5) },
      keyLightColor:     { value: new THREE.Color(1, 1, 1) },
      keyLightDir:       { value: new THREE.Vector3(0.5, 1.0, 0.75).normalize() },
      uFogEnabled:       { value: false },
      uFogColor:         { value: new THREE.Color(0, 0, 0) },
      uFogDensity:       { value: 0.0 },
    };

    this._bloomEnabled = false;

    this.wireframeScene = new THREE.Scene();
    this.wireframeMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    this._initTargets();
    this._initPasses();
  }

  // ── Render targets ───────────────────────────────────────────────────────────
  _initTargets() {
    const w = Math.max(1, this.renderer.domElement.width  || 320);
    const h = Math.max(1, this.renderer.domElement.height || 240);
    const scale = 0.25;

    this.psxRT = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(w * scale)),
      Math.max(1, Math.floor(h * scale)),
      { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat }
    );

    this.rtA = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtB = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

    const bw = Math.max(1, Math.floor(w / 2));
    const bh = Math.max(1, Math.floor(h / 2));
    this.rtBloomA = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtBloomB = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  // ── Screen-pass scene ────────────────────────────────────────────────────────
  _initPasses() {
    // OrthoCam + PlaneGeometry(2,2) fill the screen exactly
    this.screenCam  = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.screenGeo  = new THREE.PlaneGeometry(2, 2);
    this.screenScene = new THREE.Scene();

    this.screenMesh = new THREE.Mesh(this.screenGeo, null);
    this.screenMesh.frustumCulled = false;
    this.screenScene.add(this.screenMesh);

    // Blit: nearest-upscale psxRT → rtA
    this.blitMat = makePassMat(BLIT_FRAG);

    // Post passes — use the shaders from shaders.js directly
    // Clone uniform objects so we own them
    this.ditherUniforms = {
      tDiffuse: { value: null },
      uBits:    { value: 5.0 },
      uDither:  { value: 1 },
    };
    this.ditherMat = new THREE.ShaderMaterial({
      uniforms: this.ditherUniforms,
      vertexShader: PASS_VERT,
      fragmentShader: DITHER_SHADER.fragmentShader,
      depthTest: false, depthWrite: false,
    });

    this.crtUniforms = {
      tDiffuse:   { value: null },
      uCurvature: { value: 0.0 },
      uVignette:  { value: 0.3 },
    };
    this.crtMat = new THREE.ShaderMaterial({
      uniforms: this.crtUniforms,
      vertexShader: PASS_VERT,
      fragmentShader: CRT_SHADER.fragmentShader,
      depthTest: false, depthWrite: false,
    });

    this.fxUniforms = {
      tDiffuse:        { value: null },
      tBloom:          { value: null },
      uCA:             { value: 0.0 },
      uGrain:          { value: 0.0 },
      uTime:           { value: 0.0 },
      uGrade:          { value: 0 },
      uBloom:          { value: 0 },
      uBloomIntensity: { value: 0.5 },
      uScanlines:        { value: 0.0 },
      uScanlineOpacity:  { value: 0.5 },
      uDPR:              { value: this.renderer.getPixelRatio() },
      uCurvature:        { value: 0.0 },
      uScreenH:          { value: Math.max(1, this.renderer.domElement.height) },
    };
    this.fxMat = new THREE.ShaderMaterial({
      uniforms: this.fxUniforms,
      vertexShader: PASS_VERT,
      fragmentShader: FX_SHADER.fragmentShader,
      depthTest: false, depthWrite: false,
    });

    const bw = this.rtBloomA.width, bh = this.rtBloomA.height;
    this.bloomExtractMat = makePassMat(BLOOM_EXTRACT_FRAG, { uThreshold: { value: 0.6 } });
    this.bloomHMat = makePassMat(BLOOM_BLUR_FRAG, { uOffset: { value: new THREE.Vector2(1 / bw, 0) } });
    this.bloomVMat = makePassMat(BLOOM_BLUR_FRAG, { uOffset: { value: new THREE.Vector2(0, 1 / bh) } });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  _renderPass(mat, srcTex, dstRT) {
    this.screenMesh.material = mat;
    mat.uniforms.tDiffuse.value = srcTex;
    this.renderer.setRenderTarget(dstRT);
    // Disable autoClear so renderer.render() below won't issue a second
    // clear and undo our intentional partial clear.
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    // When rendering to screen (null): clear only color, preserve depth so
    // the prepass depth in main.js survives and overlays depth-test correctly.
    if (dstRT === null) {
      this.renderer.clear(true, false, false);
    } else {
      this.renderer.clear();
    }
    this.renderer.render(this.screenScene, this.screenCam);
    this.renderer.autoClear = prevAutoClear;
  }

  // ── PSX material ─────────────────────────────────────────────────────────────
  createPSXMaterial(originalMat) {
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uSnapPrecision: this.globalUniforms.uSnapPrecision,
        uVertexSnap:    this.globalUniforms.uVertexSnap,
        uAffineWarp:    this.globalUniforms.uAffineWarp,
        uExposure:      this.globalUniforms.uExposure,
        uHasMap:   { value: false },
        diffuse:   { value: new THREE.Color(0x888888) },
        opacity:   { value: 1.0 },
        map:       { value: null },
        ambientLightColor: this.globalUniforms.ambientLightColor,
        keyLightColor:     this.globalUniforms.keyLightColor,
        keyLightDir:       this.globalUniforms.keyLightDir,
        uFogEnabled: this.globalUniforms.uFogEnabled,
        uFogColor:   this.globalUniforms.uFogColor,
        uFogDensity: this.globalUniforms.uFogDensity,
      },
      vertexShader:   PSX_VERT,
      fragmentShader: PSX_FRAG,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    if (originalMat) {
      if (originalMat.opacity !== undefined) mat.uniforms.opacity.value = originalMat.opacity;
      if (originalMat.transparent) mat.transparent = true;
      if (originalMat.map) {
        const tex = originalMat.map;
        tex.magFilter = tex.minFilter = THREE.NearestFilter;
        tex.needsUpdate = true;
        mat.uniforms.map.value = tex;
        mat.uniforms.uHasMap.value = true;
        // Use white diffuse so the texture provides the color unmodified.
        // FBX/GLTF materials often have black or dark diffuse when they rely
        // on a texture for color — multiplying black × texture = black.
        mat.uniforms.diffuse.value.set(1, 1, 1);
      } else if (originalMat.color) {
        const c = originalMat.color;
        const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
        // Near-black: FBX materials that relied on a texture for color.
        // Near-white: OBJ/FBX default material color (0xffffff) — not set by the artist.
        // Both fall back to a soft clay grey so the model is visible without textures.
        if (lum < 0.05 || lum > 0.9) {
          mat.uniforms.diffuse.value.set(0.4, 0.4, 0.4);
        } else {
          mat.uniforms.diffuse.value.copy(c);
        }
      }
    }
    return mat;
  }

  // ── Scene traversal ──────────────────────────────────────────────────────────
  applyToScene() {
    this.psxMaterials.forEach(m => m.dispose());
    this.psxMaterials = [];
    this.psxMeshes = [];

    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData._isHelper) return;

      if (!obj.geometry.attributes.uv) {
        const n = obj.geometry.attributes.position.count;
        obj.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }

      // Preserve embedded textures for multi-material meshes (FBX/GLB often have
      // multiple material slots per mesh, each with its own texture).
      if (Array.isArray(obj.material)) {
        const psxMats = obj.material.map(m => {
          const psx = this.createPSXMaterial(m);
          this.psxMaterials.push(psx);
          return psx;
        });
        obj.material = psxMats;
      } else {
        const psx = this.createPSXMaterial(obj.material);
        obj.material = psx;
        this.psxMaterials.push(psx);
      }
      this.psxMeshes.push(obj);
    });

    this._rebuildWireframeOverlay();
  }

  _rebuildWireframeOverlay() {
    while (this.wireframeScene.children.length > 0) {
      const obj = this.wireframeScene.children[0];
      obj.geometry.dispose();
      this.wireframeScene.remove(obj);
    }
    this.psxMeshes.forEach(mesh => {
      const edges = new THREE.EdgesGeometry(mesh.geometry);
      const line = new THREE.LineSegments(edges, this.wireframeMat);
      this.wireframeScene.add(line);
    });
  }

  renderWireframeOverlay(camera) {
    this.wireframeScene.children.forEach((line, i) => {
      if (i < this.psxMeshes.length) {
        this.psxMeshes[i].getWorldPosition(line.position);
        this.psxMeshes[i].getWorldQuaternion(line.quaternion);
        this.psxMeshes[i].getWorldScale(line.scale);
        line.updateMatrix();
      }
    });
    this.renderer.render(this.wireframeScene, camera);
  }

  // ── Resize ───────────────────────────────────────────────────────────────────
  setRenderScale(scale) {
    const w = this.renderer.domElement.width;
    const h = this.renderer.domElement.height;
    this.psxRT.setSize(Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale)));
  }

  resize(w, h) {
    const dpr = this.renderer.getPixelRatio();
    this.fxUniforms.uDPR.value     = dpr;
    this.fxUniforms.uScreenH.value = Math.max(1, Math.floor(h * dpr));
    const pw = Math.max(1, Math.floor(w * dpr));
    const ph = Math.max(1, Math.floor(h * dpr));
    this.rtA.setSize(pw, ph);
    this.rtB.setSize(pw, ph);
    const bw = Math.max(1, Math.floor(pw / 2));
    const bh = Math.max(1, Math.floor(ph / 2));
    this.rtBloomA.setSize(bw, bh);
    this.rtBloomB.setSize(bw, bh);
    this.bloomHMat.uniforms.uOffset.value.set(1 / bw, 0);
    this.bloomVMat.uniforms.uOffset.value.set(0, 1 / bh);
  }

  getRTSize() { return { w: this.psxRT.width, h: this.psxRT.height }; }

  // ── State sync ───────────────────────────────────────────────────────────────
  updateFromStore(state) {
    this.globalUniforms.uSnapPrecision.value = state.snapPrecision;
    this.globalUniforms.uVertexSnap.value    = state.vertexSnap;
    this.globalUniforms.uAffineWarp.value    = state.affineWarp;
    this.globalUniforms.uExposure.value      = state.exposure ?? 1.0;

    const filter = state.textureFilter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    this.psxMaterials.forEach(m => {
      if (m.uniforms.map.value) {
        m.uniforms.map.value.magFilter = m.uniforms.map.value.minFilter = filter;
        m.uniforms.map.value.needsUpdate = true;
      }
      m.side = state.backfaceCulling ? THREE.FrontSide : THREE.DoubleSide;
    });

    this.globalUniforms.uFogEnabled.value = state.fogDensity > 0;
    this.globalUniforms.uFogColor.value.set(state.fogColor);
    this.globalUniforms.uFogDensity.value = state.fogDensity;

    const bits = state.colorDepth === '15bit' ? 5.0 : 8.0;
    this.ditherUniforms.uBits.value   = bits;
    const ditherMap = { none: 0, bayer4: 1, bayer2: 2 };
    this.ditherUniforms.uDither.value = ditherMap[state.ditherPattern] ?? 1;

    this.crtUniforms.uCurvature.value = state.crtCurvature ?? 0;
    this.crtUniforms.uVignette.value  = state.vignette ?? 0.3;
    this.fxUniforms.uScanlines.value       = state.scanlines ?? 0;
    this.fxUniforms.uScanlineOpacity.value = state.scanlineOpacity ?? 0.5;
    this.fxUniforms.uCurvature.value       = state.crtCurvature ?? 0;

    this.fxUniforms.uCA.value    = state.chromaticAberration ?? 0;
    this.fxUniforms.uGrain.value = state.filmGrain ?? 0;
    const gradeMap = { none: 0, warmVHS: 1, coldCRT: 2, sepia: 3 };
    this.fxUniforms.uGrade.value = gradeMap[state.colorGrade] ?? 0;

    this._bloomEnabled = !!(state.bloom && state.bloomIntensity > 0);
    this.fxUniforms.uBloom.value          = this._bloomEnabled ? 1 : 0;
    this.fxUniforms.uBloomIntensity.value = state.bloomIntensity ?? 0.5;
  }

  updateLights(ambientLight, keyLight) {
    this.globalUniforms.ambientLightColor.value
      .copy(ambientLight.color).multiplyScalar(ambientLight.intensity);
    this.globalUniforms.keyLightColor.value
      .copy(keyLight.color).multiplyScalar(keyLight.intensity);
    this.globalUniforms.keyLightDir.value
      .copy(keyLight.position).normalize();
  }

  // ── Render loop ──────────────────────────────────────────────────────────────
  render(time) {
    this.fxUniforms.uTime.value = time;

    // 1. Scene → low-res psxRT
    this.renderer.setRenderTarget(this.psxRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // 2. Blit psxRT → rtA  (nearest-upscale)
    this._renderPass(this.blitMat, this.psxRT.texture, this.rtA);

    // 3. Dither rtA → rtB
    this._renderPass(this.ditherMat, this.rtA.texture, this.rtB);

    // 4. CRT rtB → rtA
    this._renderPass(this.crtMat, this.rtB.texture, this.rtA);

    // 5. Bloom: extract bright areas → blur
    if (this._bloomEnabled) {
      this._renderPass(this.bloomExtractMat, this.rtA.texture, this.rtBloomA);
      this._renderPass(this.bloomHMat, this.rtBloomA.texture, this.rtBloomB);
      this._renderPass(this.bloomVMat, this.rtBloomB.texture, this.rtBloomA);
      this.fxUniforms.tBloom.value = this.rtBloomA.texture;
    } else {
      this.fxUniforms.tBloom.value = null;
    }

    // 6. FX rtA → screen (composites bloom if enabled)
    this._renderPass(this.fxMat, this.rtA.texture, null);
  }

  dispose() {
    this.psxRT.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtBloomA.dispose();
    this.rtBloomB.dispose();
    this.psxMaterials.forEach(m => m.dispose());
    this.screenGeo.dispose();
  }
}
