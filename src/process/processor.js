import * as THREE from 'three';
import { weldPositions, decimate } from './decimate.js';
import { unwrap } from './unwrap.js';
import { makeSampler, prepareSource, bake } from './bake.js';
import { downsample, adjustColor, snap15, quantize15, quantizeToPalette, extractPalette, PALETTE_PRESETS, countColors } from './palette.js';

const DECIMATED_DEFAULT_TEX = 512;
const BAKE_MAX = 512;           // supersampled bake resolution cap (per side)
const ASSUMED_UV_COVERAGE = 0.5; // share of the atlas covered by charts, for density sizing

// 'original' | '128' | '128x64' → { w, h } (null for original)
export function parseTexSize(v) {
  if (v == null || v === 'original') return null;
  const [w, h] = String(v).split('x').map(n => parseInt(n, 10));
  return { w, h: h || w };
}

function meshArea(positions, indices) {
  let a = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const i = indices[t] * 3, j = indices[t + 1] * 3, k = indices[t + 2] * 3;
    const ux = positions[j] - positions[i], uy = positions[j + 1] - positions[i + 1], uz = positions[j + 2] - positions[i + 2];
    const vx = positions[k] - positions[i], vy = positions[k + 1] - positions[i + 1], vz = positions[k + 2] - positions[i + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}

// Stage 1 (geometry) → Stage 2 (texture) → palette, per mesh, with each
// stage cached so cheap changes (palette, dither) don't redo expensive ones.
export class ModelProcessor {
  constructor() {
    this.entries = [];
    this.palette = [];
  }

  attach(model) {
    this.detach();
    model.traverse(m => {
      if (!m.isMesh || Array.isArray(m.material) || !m.material?.uniforms?.map) return;
      const geo = m.geometry;
      this.entries.push({
        mesh: m,
        srcGeo: geo,
        srcMap: m.material.uniforms.map.value,
        srcTris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3,
        cache: {},
        outGeo: null,
        outTex: null,
        image: null,
      });
    });
  }

  setSourceMap(tex) {
    for (const e of this.entries) {
      e.srcMap = tex;
      e.cache.sampler = null;
      e.cache.bakes = {};
    }
  }

  detach() {
    for (const e of this.entries) {
      e.outGeo?.dispose();
      e.outTex?.dispose();
      e.cleanMat?.dispose();
    }
    this.entries = [];
    this.palette = [];
  }

  get hasModel() { return this.entries.length > 0; }

  // Temporarily renders with plain Lambert shading: the unprocessed scan when
  // `original` is true, otherwise the processed mesh and texture.
  withClean(original, fn) {
    const saved = this.entries.map(e => [e.mesh.geometry, e.mesh.material]);
    for (const e of this.entries) {
      const u = e.mesh.material.uniforms;
      const map = original ? e.srcMap : (u.uHasMap.value ? u.map.value : null);
      if (!e.cleanMat) e.cleanMat = new THREE.MeshLambertMaterial({ toneMapped: false });
      const m = e.cleanMat;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
      m.color.set(map ? 0xffffff : u.diffuse.value);
      m.side = e.mesh.material.side;
      if (original) e.mesh.geometry = e.srcGeo;
      e.mesh.material = m;
    }
    try { fn(); } finally {
      this.entries.forEach((e, i) => { e.mesh.geometry = saved[i][0]; e.mesh.material = saved[i][1]; });
    }
  }

  clearCache() {
    for (const e of this.entries) e.cache = {};
  }

  async run(opts) {
    const t0 = performance.now();
    const timings = {};
    const time = async (stage, fn) => {
      const s = performance.now();
      const r = await fn();
      timings[stage] = (timings[stage] ?? 0) + (performance.now() - s);
      return r;
    };
    const totalSrc = this.entries.reduce((s, e) => s + e.srcTris, 0) || 1;
    const texOn = opts.texSize !== 'original';
    const cmPerUnit = opts.texMode === 'density' ? this._cmPerUnit(opts.printHeight) : 0;
    let tris = 0, charts = 0, texW = 0, texH = 0, coverage = null;
    const images = [];

    for (const e of this.entries) {
      const c = e.cache;
      let geo = e.srcGeo, img = null, flipY = true, baked = false;
      const hasTex = !!(e.srcMap?.image && e.srcGeo.attributes.uv);
      if (hasTex && !c.sampler) c.sampler = await time('readTexture', () => makeSampler(e.srcMap));

      if (opts.decimate) {
        const budget = Math.max(4, Math.round(opts.targetTris * e.srcTris / totalSrc));
        if (c.lowBudget !== budget) {
          if (!c.welded) c.welded = await time('weld', () => weldPositions(e.srcGeo));
          c.low = await time('decimate', () => decimate(c.welded, budget));
          c.lowBudget = budget;
          c.unwraps = {};
          c.bakes = {};
        }
      }

      const size = this._targetSize(e, opts, texOn, cmPerUnit, hasTex);

      if (opts.decimate) {
        const uk = `${size.w}x${size.h}|${opts.flat}`;
        if (!c.unwraps[uk]) c.unwraps[uk] = await time('unwrap', () => unwrap(c.low, size.w, size.h, { flat: opts.flat }));
        const low = c.unwraps[uk];
        geo = buildGeometry(low);
        charts += low.chartCount;
        if (hasTex) {
          if (!c.source) c.source = await time('bvh', () => prepareSource(e.srcGeo));
          // Supersample the bake so every sampling method has detail to work with.
          const ss = Math.max(1, Math.min(4, Math.floor(BAKE_MAX / Math.max(size.w, size.h))));
          const bk = `${uk}|${ss}`;
          c.bakes ??= {};
          if (!c.bakes[bk]) c.bakes[bk] = await time('bake', () => bake(low, c.source, c.sampler, size.w * ss, size.h * ss));
          const hi = c.bakes[bk];
          coverage = hi.coverage;
          img = ss > 1 ? await time('downsample', () => downsample(hi, size.w, size.h, opts.texFilter)) : hi;
          flipY = false;
          baked = true;
        }
      } else if (hasTex) {
        const full = { data: c.sampler.data, width: c.sampler.width, height: c.sampler.height };
        img = texOn ? await time('downsample', () => downsample(full, size.w, size.h, opts.texFilter)) : full;
        flipY = c.sampler.flipY;
      }

      if (img && texOn && (opts.saturation !== 1 || opts.contrast !== 1)) {
        img = await time('adjust', () => adjustColor(img, opts.saturation, opts.contrast));
      }

      tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      e.image = img ? { ...img, flipY } : null;
      e.baked = baked;
      if (img) images.push(img);
      e.nextGeo = geo;
    }

    this.palette = await time('palette', () => resolvePalette(opts, images));
    let colors = 0;
    for (const e of this.entries) {
      if (e.image && opts.palette !== 'off') {
        const q = await time('quantize', () => (opts.palette === '15bit'
          ? quantize15(e.image, opts.dither)
          : quantizeToPalette(e.image, this.palette, opts.dither, opts.ditherStrength)));
        e.image = { ...q, flipY: e.image.flipY };
      }
      await time('upload', () => this._apply(e, opts));
      if (e.image) {
        colors = Math.max(colors, countColors(e.image));
        texW = Math.max(texW, e.image.width); texH = Math.max(texH, e.image.height);
      }
    }

    const round = v => Math.round(v * 10) / 10;
    return {
      srcTris: Math.round(totalSrc), tris: Math.round(tris), charts,
      texW, texH, colors, palette: this.palette, coverage,
      timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, round(v)])),
      ms: Math.round(performance.now() - t0),
    };
  }

  // Centimetres per model unit, so the model's height equals the print height.
  _cmPerUnit(printHeightMm) {
    const box = new THREE.Box3();
    for (const e of this.entries) {
      e.srcGeo.computeBoundingBox();
      box.union(e.srcGeo.boundingBox);
    }
    const h = box.max.y - box.min.y;
    return h > 0 ? (printHeightMm / 10) / h : 0;
  }

  // Texture size for one mesh: fixed (possibly non-square), or derived from a
  // texel density so every object gets the same texels per centimetre.
  _targetSize(e, opts, texOn, cmPerUnit, hasTex) {
    if (texOn && opts.texMode === 'density' && cmPerUnit > 0) {
      const c = e.cache;
      const mesh = opts.decimate ? c.low : (c.welded ??= weldPositions(e.srcGeo));
      const areaCm2 = meshArea(mesh.positions, mesh.indices) * cmPerUnit * cmPerUnit;
      const side = Math.sqrt(areaCm2 / ASSUMED_UV_COVERAGE) * opts.texDensity;
      const n = Math.min(1024, Math.max(8, Math.round(side)));
      return { w: n, h: n };
    }
    if (texOn) return parseTexSize(opts.texSize);
    if (opts.decimate) return { w: DECIMATED_DEFAULT_TEX, h: DECIMATED_DEFAULT_TEX };
    return hasTex ? { w: e.cache.sampler.width, h: e.cache.sampler.height } : { w: 0, h: 0 };
  }

  _apply(e, opts) {
    const untouched = !opts.decimate && opts.texSize === 'original' && opts.palette === 'off';
    const mat = e.mesh.material;

    if (e.outGeo && e.outGeo !== e.nextGeo) e.outGeo.dispose();
    e.outGeo = e.nextGeo === e.srcGeo ? null : e.nextGeo;
    e.mesh.geometry = e.nextGeo;
    delete e.nextGeo;

    e.outTex?.dispose();
    e.outTex = null;
    if (!e.image) {
      mat.uniforms.map.value = e.srcMap;
      mat.uniforms.uHasMap.value = !!e.srcMap;
      return;
    }
    if (untouched) {
      mat.uniforms.map.value = e.srcMap;
    } else {
      e.outTex = toTexture(e.image, e.srcMap, e.baked);
      mat.uniforms.map.value = e.outTex;
    }
    mat.uniforms.uHasMap.value = true;
  }
}

function resolvePalette(opts, images) {
  if (opts.palette === 'clut4' || opts.palette === 'clut8') {
    if (!images.length) return [];
    const data = images.length === 1 ? images[0].data : concat(images.map(i => i.data));
    return snap15(extractPalette({ data }, opts.palette === 'clut4' ? 16 : 256));
  }
  if (opts.palette === 'preset') return PALETTE_PRESETS[opts.preset]?.colors ?? [];
  if (opts.palette === 'custom') return opts.custom.length ? opts.custom : ['#000000'];
  if (opts.palette === 'extract' && images.length) {
    // Pool pixels from all meshes so multi-part models share one palette.
    const data = images.length === 1 ? images[0].data : concat(images.map(i => i.data));
    return extractPalette({ data }, opts.colors);
  }
  return [];
}

function concat(arrays) {
  const out = new Uint8ClampedArray(arrays.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

function buildGeometry(low) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(low.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(low.normal, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(low.uv, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function toTexture(img, srcMap, baked) {
  const cvs = document.createElement('canvas');
  cvs.width = img.width; cvs.height = img.height;
  cvs.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.flipY = img.flipY;
  tex.colorSpace = srcMap?.colorSpace ?? THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (baked) {
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  } else if (srcMap) {
    tex.wrapS = srcMap.wrapS; tex.wrapT = srcMap.wrapT;
  }
  return tex;
}
