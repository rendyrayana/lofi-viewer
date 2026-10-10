// Normal-clustered planar chart unwrap for low-poly meshes.
// Faces are grown into charts while their normal stays within `angle` of the
// chart's area-weighted normal, each chart is projected onto its own plane,
// and charts are skyline-packed into a texW×texH atlas with texel padding.

export function unwrap({ positions, indices }, texW, texH = texW, { angle = 40, padTexels = Math.min(texW, texH) <= 32 ? 0 : 1, flat = true } = {}) {
  const nT = indices.length / 3;
  const faceN = new Float32Array(nT * 3);
  const area = new Float32Array(nT);

  for (let t = 0; t < nT; t++) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triPos(positions, indices, t);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    area[t] = len * 0.5;
    faceN[t * 3] = nx / len; faceN[t * 3 + 1] = ny / len; faceN[t * 3 + 2] = nz / len;
  }

  const neighbors = buildAdjacency(indices, nT);
  const charts = growCharts(nT, faceN, area, neighbors, Math.cos(angle * Math.PI / 180));
  const projected = charts.map(c => projectChart(c, positions, indices));
  const placement = pack(projected, texW, texH, padTexels);

  const outPos = new Float32Array(nT * 9);
  const outUV  = new Float32Array(nT * 6);
  const outN   = new Float32Array(nT * 9);
  const smoothN = flat ? null : vertexNormals(positions, indices, faceN, area);

  projected.forEach((pc, ci) => {
    const { x0, y0, scale, sideW, sideH, rot } = placement[ci];
    pc.tris.forEach((t, k) => {
      for (let c = 0; c < 3; c++) {
        const v = indices[t * 3 + c];
        const o = t * 3 + c;
        outPos[o * 3] = positions[v * 3]; outPos[o * 3 + 1] = positions[v * 3 + 1]; outPos[o * 3 + 2] = positions[v * 3 + 2];
        const [u, w] = pc.uv[k * 3 + c];
        let lu = u - pc.minU, lw = w - pc.minV;
        if (rot) [lu, lw] = [pc.h - lw, lu];
        outUV[o * 2]     = (x0 + lu * scale) / sideW;
        outUV[o * 2 + 1] = (y0 + lw * scale) / sideH;
        const src = smoothN ? smoothN : faceN;
        const si = smoothN ? v : t;
        outN[o * 3] = src[si * 3]; outN[o * 3 + 1] = src[si * 3 + 1]; outN[o * 3 + 2] = src[si * 3 + 2];
      }
    });
  });

  return { position: outPos, uv: outUV, normal: outN, triCount: nT, chartCount: charts.length };
}

function triPos(p, idx, t) {
  const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
  return [p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]];
}

function buildAdjacency(indices, nT) {
  const edges = new Map();
  for (let t = 0; t < nT; t++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t * 3 + e], b = indices[t * 3 + (e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edges.get(key);
      if (list) list.push(t); else edges.set(key, [t]);
    }
  }
  const nb = Array.from({ length: nT }, () => []);
  for (const list of edges.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) { nb[list[i]].push(list[j]); nb[list[j]].push(list[i]); }
  }
  return nb;
}

function growCharts(nT, faceN, area, neighbors, cosT) {
  const chartOf = new Int32Array(nT).fill(-1);
  const order = Array.from({ length: nT }, (_, i) => i).sort((a, b) => area[b] - area[a]);
  const charts = [];
  for (const seed of order) {
    if (chartOf[seed] >= 0) continue;
    const id = charts.length;
    const sum = [faceN[seed * 3] * area[seed], faceN[seed * 3 + 1] * area[seed], faceN[seed * 3 + 2] * area[seed]];
    const tris = [seed];
    chartOf[seed] = id;
    for (let q = 0; q < tris.length; q++) {
      for (const nb of neighbors[tris[q]]) {
        if (chartOf[nb] >= 0) continue;
        const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
        const d = (faceN[nb * 3] * sum[0] + faceN[nb * 3 + 1] * sum[1] + faceN[nb * 3 + 2] * sum[2]) / len;
        if (d < cosT) continue;
        chartOf[nb] = id;
        tris.push(nb);
        sum[0] += faceN[nb * 3] * area[nb]; sum[1] += faceN[nb * 3 + 1] * area[nb]; sum[2] += faceN[nb * 3 + 2] * area[nb];
      }
    }
    const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    charts.push({ tris, normal: [sum[0] / len, sum[1] / len, sum[2] / len] });
  }
  return charts;
}

function projectChart({ tris, normal }, positions, indices) {
  const [nx, ny, nz] = normal;
  // Tangent frame: any vector not parallel to the normal.
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(ny) > 0.9) { ax = 1; ay = 0; }
  let tx = ay * nz - az * ny, ty = az * nx - ax * nz, tz = ax * ny - ay * nx;
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;

  const raw = [];
  for (const t of tris) {
    for (let c = 0; c < 3; c++) {
      const v = indices[t * 3 + c] * 3;
      const px = positions[v], py = positions[v + 1], pz = positions[v + 2];
      raw.push([px * tx + py * ty + pz * tz, px * bx + py * by + pz * bz]);
    }
  }

  // Rotate in-plane to the tightest bounding box, landscape orientation, so
  // charts pack with less wasted atlas space.
  let best = null;
  for (let a = 0; a < 90; a += 3) {
    const r = a * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const [u, w] of raw) {
      const ru = u * cs - w * sn, rw = u * sn + w * cs;
      if (ru < minU) minU = ru; if (ru > maxU) maxU = ru;
      if (rw < minV) minV = rw; if (rw > maxV) maxV = rw;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, cs, sn, w: maxU - minU, h: maxV - minV };
  }
  const swap = best.h > best.w;
  const uv = raw.map(([u, w]) => {
    const ru = u * best.cs - w * best.sn, rw = u * best.sn + w * best.cs;
    return swap ? [rw, -ru] : [ru, rw];
  });
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
  for (const [u, w] of uv) {
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (w < minV) minV = w; if (w > maxV) maxV = w;
  }
  return { tris, uv, minU, minV, w: maxU - minU, h: maxV - minV };
}

// Finds the largest uniform texel density at which every chart (plus padding)
// packs into the W×H atlas. Falls back to a virtual atlas larger than the
// texture when even 1-texel charts can't fit (very small textures).
function pack(charts, W, H, padTexels) {
  const order = charts.map((_, i) => i).sort((a, b) => charts[b].h - charts[a].h);

  // Skyline bottom-left packing; each chart may be turned 90° if that sits lower.
  const tryPack = (scale, sideW, sideH, pad) => {
    const out = new Array(charts.length);
    const sky = new Int32Array(sideW);
    for (const i of order) {
      const iw = Math.max(1, Math.ceil(charts[i].w * scale));
      const ih = Math.max(1, Math.ceil(charts[i].h * scale));
      let best = null;
      for (const rot of [false, true]) {
        const cw = (rot ? ih : iw) + pad * 2, ch = (rot ? iw : ih) + pad * 2;
        if (cw > sideW) continue;
        const spot = lowestSpot(sky, sideW, cw);
        if (spot.y + ch > sideH) continue;
        if (!best || spot.y + ch < best.y + best.ch) best = { ...spot, cw, ch, rot };
      }
      if (!best) return null;
      for (let x = best.x; x < best.x + best.cw; x++) sky[x] = best.y + best.ch;
      const fw = (best.rot ? ih : iw), fh = (best.rot ? iw : ih);
      const sw = (best.rot ? charts[i].h : charts[i].w) * scale, sh = (best.rot ? charts[i].w : charts[i].h) * scale;
      // Centre the chart in its cell so sub-texel charts land on a texel centre.
      out[i] = {
        x0: best.x + pad + (fw - sw) / 2,
        y0: best.y + pad + (fh - sh) / 2,
        scale, sideW, sideH, rot: best.rot,
      };
    }
    return out;
  };

  const maxExtent = Math.max(...charts.map(c => Math.max(c.w, c.h)), 1e-9);
  for (const pad of [padTexels, 0]) {
    let lo = 0, hi = Math.max(W, H) / maxExtent, best = tryPack(1e-12, W, H, pad);
    if (!best) continue;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const res = tryPack(mid, W, H, pad);
      if (res) { best = res; lo = mid; } else hi = mid;
    }
    return best;
  }

  let k = 1;
  while (true) {
    k *= 1.25;
    const res = tryPack(1e-12, Math.ceil(W * k), Math.ceil(H * k), 0);
    if (res) return res;
  }
}

// Leftmost x where a run of `w` columns has the lowest maximum skyline height
// (sliding-window maximum with a monotonic deque).
function lowestSpot(sky, side, w) {
  const dq = new Int32Array(side);
  let head = 0, tail = 0, bestY = Infinity, bestX = 0;
  for (let x = 0; x < side; x++) {
    while (tail > head && sky[dq[tail - 1]] <= sky[x]) tail--;
    dq[tail++] = x;
    if (dq[head] <= x - w) head++;
    if (x >= w - 1) {
      const y = sky[dq[head]];
      if (y < bestY) { bestY = y; bestX = x - w + 1; }
    }
  }
  return { x: bestX, y: bestY };
}

function vertexNormals(positions, indices, faceN, area) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length / 3; t++) {
    for (let c = 0; c < 3; c++) {
      const v = indices[t * 3 + c] * 3;
      n[v] += faceN[t * 3] * area[t]; n[v + 1] += faceN[t * 3 + 1] * area[t]; n[v + 2] += faceN[t * 3 + 2] * area[t];
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
