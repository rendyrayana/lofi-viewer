import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// Reads a texture's pixels on the CPU. Rows are addressed in the same
// orientation the GPU uses, so sample(u, v) matches what the shader sees.
export function makeSampler(texture, maxSize = 2048) {
  const img = texture.image;
  const sw = img.width || img.videoWidth, sh = img.height || img.videoHeight;
  const k = Math.min(1, maxSize / Math.max(sw, sh));
  const W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const flip = texture.flipY;

  const sample = (u, v, out, o = 0) => {
    u -= Math.floor(u); v -= Math.floor(v);
    const x = Math.min(W - 1, Math.floor(u * W));
    const y = Math.min(H - 1, Math.floor((flip ? 1 - v : v) * H));
    const i = (y * W + x) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3];
  };
  return { sample, width: W, height: H, data, flipY: flip };
}

// Built once per source mesh: BVH on a private copy (MeshBVH reorders the index).
export function prepareSource(geometry) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', geometry.attributes.position);
  geo.setAttribute('uv', geometry.attributes.uv);
  if (geometry.index) geo.setIndex(geometry.index.clone());
  else geo.setIndex([...Array(geometry.attributes.position.count).keys()]);
  const bvh = new MeshBVH(geo);
  geo.computeBoundingBox();
  const diag = geo.boundingBox.getSize(new THREE.Vector3()).length();
  return { geo, bvh, diag };
}

// Returns project(P, N, out): the original scan's texture colour at the point
// where a ray from P along ±N (within a cage of `cage` × model size) meets the
// scan, falling back to the closest surface point when the ray misses (e.g.
// over holes). P and N are in the scan's local space.
export function makeProjector(source, sampler, { cage = 0.03 } = {}) {
  const { geo, bvh, diag } = source;
  const maxDist = diag * cage;
  const idx = geo.index.array, pos = geo.attributes.position, uvA = geo.attributes.uv;
  const ray = new THREE.Ray();
  const hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const bary = new THREE.Vector3();
  const tri = new THREE.Triangle();
  const stats = { samples: 0, rayHits: 0 };

  const project = (P, N, out) => {
    ray.origin.copy(P); ray.direction.copy(N);
    const fwd = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDist);
    ray.direction.negate();
    const back = bvh.raycastFirst(ray, THREE.DoubleSide, 0, maxDist);
    const best = fwd && back ? (fwd.distance <= back.distance ? fwd : back) : (fwd || back);
    stats.samples++;
    let face;
    if (best) {
      stats.rayHits++;
      face = best.faceIndex;
      hit.point.copy(best.point);
    } else {
      bvh.closestPointToPoint(P, hit);
      face = hit.faceIndex;
    }
    const f = face * 3;
    const i0 = idx[f], i1 = idx[f + 1], i2 = idx[f + 2];
    A.fromBufferAttribute(pos, i0); B.fromBufferAttribute(pos, i1); C.fromBufferAttribute(pos, i2);
    tri.set(A, B, C).getBarycoord(hit.point, bary);
    const u = bary.x * uvA.getX(i0) + bary.y * uvA.getX(i1) + bary.z * uvA.getX(i2);
    const v = bary.x * uvA.getY(i0) + bary.y * uvA.getY(i1) + bary.z * uvA.getY(i2);
    sampler.sample(u, v, out);
    return out;
  };
  project.stats = stats;
  return project;
}

// For every texel covered by the low-poly atlas, project onto the original
// scan along the low-poly face normal and copy the texture colour found there.
export function bake(low, source, sampler, width, height = width, { cage = 0.03 } = {}) {
  const project = makeProjector(source, sampler, { cage });
  const faceN = new THREE.Vector3();
  const px = new Uint8ClampedArray(width * height * 4);
  const filled = new Uint8Array(width * height);
  const P = new THREE.Vector3();
  const rgba = [0, 0, 0, 0];

  const sampleAt = (lam0, lam1, lam2, t, texel) => {
    const o = t * 9, p = low.position;
    P.set(
      lam0 * p[o]     + lam1 * p[o + 3] + lam2 * p[o + 6],
      lam0 * p[o + 1] + lam1 * p[o + 4] + lam2 * p[o + 7],
      lam0 * p[o + 2] + lam1 * p[o + 5] + lam2 * p[o + 8],
    );
    project(P, faceN, rgba);
    const q = texel * 4;
    px[q] = rgba[0]; px[q + 1] = rgba[1]; px[q + 2] = rgba[2]; px[q + 3] = 255;
    filled[texel] = 1;
  };

  for (let t = 0; t < low.triCount; t++) {
    const p = low.position, q = t * 9;
    faceN.set(
      (p[q + 4] - p[q + 1]) * (p[q + 8] - p[q + 2]) - (p[q + 5] - p[q + 2]) * (p[q + 7] - p[q + 1]),
      (p[q + 5] - p[q + 2]) * (p[q + 6] - p[q])     - (p[q + 3] - p[q])     * (p[q + 8] - p[q + 2]),
      (p[q + 3] - p[q])     * (p[q + 7] - p[q + 1]) - (p[q + 4] - p[q + 1]) * (p[q + 6] - p[q]),
    ).normalize();
    const uv = low.uv, o = t * 6;
    const x0 = uv[o] * width, y0 = uv[o + 1] * height;
    const x1 = uv[o + 2] * width, y1 = uv[o + 3] * height;
    const x2 = uv[o + 4] * width, y2 = uv[o + 5] * height;
    const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    let wrote = false;

    if (Math.abs(det) > 1e-12) {
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          const l0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / det;
          const l1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / det;
          const l2 = 1 - l0 - l1;
          if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
          sampleAt(l0, l1, l2, t, y * width + x);
          wrote = true;
        }
      }
    }

    // Triangles smaller than a texel still claim the texel under their centroid.
    if (!wrote) {
      const tx = Math.min(width - 1, Math.max(0, Math.floor((x0 + x1 + x2) / 3)));
      const ty = Math.min(height - 1, Math.max(0, Math.floor((y0 + y1 + y2) / 3)));
      if (!filled[ty * width + tx]) sampleAt(1 / 3, 1 / 3, 1 / 3, t, ty * width + tx);
    }
  }

  let covered = 0;
  for (let i = 0; i < filled.length; i++) covered += filled[i];
  dilate(px, filled, width, height, Math.max(2, Math.ceil(Math.max(width, height) / 32)));
  const { samples, rayHits } = project.stats;
  return { data: px, width, height, coverage: covered / (width * height), rayHitRate: samples ? rayHits / samples : 1 };
}

// Grows chart colours into the padding so nearest sampling at chart edges
// never reads the empty background.
function dilate(px, filled, W, H, passes) {
  for (let p = 0; p < passes; p++) {
    const add = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!filled[j]) continue;
          r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
        }
        if (n) add.push(i, r / n, g / n, b / n);
      }
    }
    if (!add.length) break;
    for (let k = 0; k < add.length; k += 4) {
      const i = add[k];
      px[i * 4] = add[k + 1]; px[i * 4 + 1] = add[k + 2]; px[i * 4 + 2] = add[k + 3]; px[i * 4 + 3] = 255;
      filled[i] = 1;
    }
  }
}
