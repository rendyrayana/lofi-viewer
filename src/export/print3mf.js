import * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';
import { extractPalette, hexToRgb, makeColorMatcher } from '../process/palette.js';
import { makeProjector } from '../process/bake.js';
import { dropFins } from '../process/decimate.js';

// Barycentric sample points per triangle for the face-colour majority vote.
const SAMPLES = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6],
  [0.45, 0.45, 0.1], [0.45, 0.1, 0.45], [0.1, 0.45, 0.45],
];

// Builds the coloured print mesh from the processed model.
// Colours are read from the ORIGINAL scan texture (projected from the
// low-poly surface, as in the rebake), so print detail is not limited by the
// processed texture size. Each face is split into 4 flat sub-faces while its
// sample points disagree on the filament (adaptive), up to 4^maxLevel; with
// adaptive off every face is split to maxLevel. Returns world-space parts
// with one filament slot per face, plus the filament colours used.
export function collectFaces(processor, {
  maxLevel = 3, adaptive = true, palette = null, maxFilaments = 4, saturation = 1, contrast = 1, mergeShades = false,
} = {}) {
  const sources = processor.entries.map(e => faceColorSource(e, saturation, contrast));

  // Filament colours: the active palette when it fits the filament limit,
  // otherwise maxFilaments colours extracted from the scan.
  let pal = palette?.length && palette.length <= maxFilaments ? palette.slice() : null;
  if (!pal) {
    const samples = [];
    const rgb = [0, 0, 0];
    sources.forEach(src => {
      const step = Math.max(1, Math.floor(src.faceCount / 20000));
      for (let t = 0; t < src.faceCount; t += step) {
        for (const b of SAMPLES) { src.color(t, b[0], b[1], b[2], rgb); samples.push(rgb[0], rgb[1], rgb[2], 255); }
      }
    });
    pal = extractPalette({ data: samples }, maxFilaments, { mergeShades });
  }
  const nearest = makeColorMatcher(pal, mergeShades);

  const parts = [];
  const used = new Uint8Array(pal.length);
  processor.entries.forEach((e, i) => {
    const src = sources[i];
    const positions = [];
    const slots = [];
    const rgb = [0, 0, 0];
    const votes = new Uint16Array(pal.length);

    // b0..b2: corners of a sub-face in the base face's barycentric space.
    const vote = (t, b0, b1, b2) => {
      votes.fill(0);
      let first = -1, agree = true;
      for (const [x, y, z] of SAMPLES) {
        src.color(t,
          x * b0[0] + y * b1[0] + z * b2[0],
          x * b0[1] + y * b1[1] + z * b2[1],
          x * b0[2] + y * b1[2] + z * b2[2], rgb);
        const k = nearest(rgb[0], rgb[1], rgb[2]);
        votes[k]++;
        if (first < 0) first = k; else if (k !== first) agree = false;
      }
      let best = 0;
      for (let k = 1; k < votes.length; k++) if (votes[k] > votes[best]) best = k;
      return { best, agree };
    };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

    // Detail level a base face needs: how deep its colours keep disagreeing.
    const need = (t, b0, b1, b2, level) => {
      if (level >= maxLevel || vote(t, b0, b1, b2).agree) return level;
      const m01 = mid(b0, b1), m12 = mid(b1, b2), m20 = mid(b2, b0);
      return Math.max(
        need(t, b0, m01, m20, level + 1), need(t, m01, b1, m12, level + 1),
        need(t, m20, m12, b2, level + 1), need(t, m01, m12, m20, level + 1));
    };

    // One detail level per base face; each shared edge takes the finer level
    // of its two faces so neighbouring subdivisions meet without cracks.
    const n = src.faceCount;
    const level = new Uint8Array(n);
    for (let t = 0; t < n; t++) level[t] = adaptive ? need(t, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0) : maxLevel;
    const edgeLevel = new Map();
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const key = src.edgeKey(t, k);
      edgeLevel.set(key, Math.max(edgeLevel.get(key) ?? 0, level[t]));
    }

    const emitTri = (t, a, b, c, slot) => {
      positions.push(...src.worldPoint(t, a[0], a[1], a[2]), ...src.worldPoint(t, b[0], b[1], b[2]), ...src.worldPoint(t, c[0], c[1], c[2]));
      slots.push(slot);
    };
    // Base edge k lies where barycentric coordinate (k + 2) % 3 is zero.
    const onEdge = (p, q, k) => p[(k + 2) % 3] === 0 && q[(k + 2) % 3] === 0;

    for (let t = 0; t < n; t++) {
      const L = level[t], N = 1 << L;
      const extra = [0, 1, 2].map(k => (1 << (edgeLevel.get(src.edgeKey(t, k)) - L)));
      const bary = (u, v) => [(N - u - v) / N, u / N, v / N];
      const subTri = (p0, p1, p2) => {
        const { best } = vote(t, p0, p1, p2);
        used[best] = 1;
        const ring = [];
        const corners = [p0, p1, p2];
        let fan = false;
        for (let s = 0; s < 3; s++) {
          const p = corners[s], q = corners[(s + 1) % 3];
          ring.push(p);
          for (let k = 0; k < 3; k++) {
            if (extra[k] > 1 && onEdge(p, q, k)) {
              fan = true;
              for (let j = 1; j < extra[k]; j++) {
                const f = j / extra[k];
                ring.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]);
              }
              break;
            }
          }
        }
        if (!fan) { emitTri(t, p0, p1, p2, best); return; }
        const cen = [(p0[0] + p1[0] + p2[0]) / 3, (p0[1] + p1[1] + p2[1]) / 3, (p0[2] + p1[2] + p2[2]) / 3];
        for (let r = 0; r < ring.length; r++) emitTri(t, cen, ring[r], ring[(r + 1) % ring.length], best);
      };
      for (let u = 0; u < N; u++) for (let v = 0; v < N - u; v++) {
        subTri(bary(u, v), bary(u + 1, v), bary(u, v + 1));
        if (u + v < N - 1) subTri(bary(u + 1, v), bary(u + 1, v + 1), bary(u, v + 1));
      }
    }
    parts.push({ name: e.mesh.name || 'part', positions: new Float32Array(positions), slot: Uint8Array.from(slots) });
  });

  // Keep only filaments that are actually used, renumbered from 0.
  const remap = new Int16Array(pal.length).fill(-1);
  const slotsUsed = [];
  pal.forEach((h, k) => { if (used[k]) { remap[k] = slotsUsed.length; slotsUsed.push(h); } });
  for (const p of parts) for (let i = 0; i < p.slot.length; i++) p.slot[i] = remap[p.slot[i]];
  return { parts, slots: slotsUsed };
}

// Per-mesh colour lookup in a face's barycentric coordinates.
function faceColorSource(e, saturation, contrast) {
  const { mesh } = e;
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  const pos = geo.attributes.position, uvA = geo.attributes.uv;
  const idx = geo.index ? geo.index.array : null;
  const faceCount = (idx ? idx.length : pos.count) / 3;
  const corner = (t, c) => (idx ? idx[t * 3 + c] : t * 3 + c);
  const c = e.cache || {};
  const adjust = saturation !== 1 || contrast !== 1;

  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const P = new THREE.Vector3(), N = new THREE.Vector3(), W = new THREE.Vector3();
  let lastT = -1;
  const loadFace = t => {
    if (t === lastT) return;
    lastT = t;
    A.fromBufferAttribute(pos, corner(t, 0)); B.fromBufferAttribute(pos, corner(t, 1)); C.fromBufferAttribute(pos, corner(t, 2));
    N.subVectors(C, B).cross(W.subVectors(A, B)).normalize();
  };

  const diffuse = mesh.material.uniforms?.diffuse?.value;
  const fallback = diffuse ? [diffuse.r * 255, diffuse.g * 255, diffuse.b * 255].map(Math.round) : [200, 200, 200];
  const projector = e.baked && c.source && c.sampler ? makeProjector(c.source, c.sampler) : null;
  const sampler = c.sampler && uvA ? c.sampler : null;
  const rgba = [0, 0, 0, 0];

  const color = (t, l0, l1, l2, out) => {
    if (projector) {
      loadFace(t);
      P.set(0, 0, 0).addScaledVector(A, l0).addScaledVector(B, l1).addScaledVector(C, l2);
      projector(P, N, rgba);
    } else if (sampler) {
      const i0 = corner(t, 0), i1 = corner(t, 1), i2 = corner(t, 2);
      sampler.sample(
        l0 * uvA.getX(i0) + l1 * uvA.getX(i1) + l2 * uvA.getX(i2),
        l0 * uvA.getY(i0) + l1 * uvA.getY(i1) + l2 * uvA.getY(i2), rgba);
    } else {
      out[0] = fallback[0]; out[1] = fallback[1]; out[2] = fallback[2];
      return out;
    }
    if (adjust) {
      const l = 0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2];
      for (let k = 0; k < 3; k++) out[k] = clampByte((l + (rgba[k] - l) * saturation - 128) * contrast + 128);
    } else {
      out[0] = rgba[0]; out[1] = rgba[1]; out[2] = rgba[2];
    }
    return out;
  };

  const worldPoint = (t, l0, l1, l2) => {
    loadFace(t);
    W.set(0, 0, 0).addScaledVector(A, l0).addScaledVector(B, l1).addScaledVector(C, l2).applyMatrix4(mesh.matrixWorld);
    return [W.x, W.y, W.z];
  };

  const vkey = i => `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
  const edgeKey = (t, k) => {
    const a = vkey(corner(t, k)), b = vkey(corner(t, (k + 1) % 3));
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };

  return { faceCount, color, worldPoint, edgeKey };
}

const clampByte = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

// Encodes a whole-triangle filament state the way PrusaSlicer/Bambu Studio
// serialise TriangleSelector leaves: states 1–2 as one nibble (state << 2),
// states ≥3 as 0xC followed by (state − 3), hex digits written in reverse.
export function paintCode(state) {
  if (state <= 0) return '';
  if (state < 3) return (state << 2).toString(16).toUpperCase();
  return (state - 3).toString(16).toUpperCase() + 'C';
}

// Welds, closes holes, checks and cleans the coloured mesh, and converts it to
// print space: Y-up scene → Z-up, millimetres, centred, resting on z = 0.
//   smooth      — passes of a neighbour-majority filter that straightens
//                 ragged colour boundaries
//   minAreaMm2  — colour patches smaller than this (printed area) take the
//                 colour of the neighbour they share the most edges with
//   contour     — passes of colour-field smoothing; > 0 cuts faces along
//                 smooth colour boundaries instead of following triangle edges
export function prepareMesh(parts, { heightMm = 60, minAreaMm2 = 0, smooth = 0, closeHoles = true, contour = 0 } = {}) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) box.expandByPoint(v.fromArray(p.positions, i));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = size.y > 0 ? heightMm / size.y : 1;

  const check = { openEdges: 0, nonManifoldEdges: 0, islandsMerged: 0, facesRecolored: 0, facesSmoothed: 0, holesClosed: 0 };
  const meshes = parts.map(p => {
    const welded = weld(p.positions, p.slot);
    let verts = welded.verts;
    let tris = removeFins(welded.tris);
    if (closeHoles) check.holesClosed += fillHoles(verts, tris);
    let edges = edgeFaces(tris);
    const nb = neighbours(tris, edges);
    if (smooth > 0) check.facesSmoothed += smoothSlots(tris, nb, smooth);
    if (minAreaMm2 > 0) {
      const r = mergeIslands(tris, nb, faceAreas(verts, tris), minAreaMm2 / (k * k));
      check.islandsMerged += r.islands;
      check.facesRecolored += r.faces;
    }
    if (contour > 0) {
      ({ verts, tris } = contourSlots(verts, tris, contour));
      edges = edgeFaces(tris);
    }
    for (const faces of edges.values()) {
      if (faces.length === 1) check.openEdges++;
      else if (faces.length > 2) check.nonManifoldEdges++;
    }
    const world = Float64Array.from(verts);
    const out = new Float64Array(verts.length);
    for (let i = 0; i < verts.length; i += 3) {
      out[i] = (verts[i] - center.x) * k;
      out[i + 1] = -(verts[i + 2] - center.z) * k;
      out[i + 2] = (verts[i + 1] - box.min.y) * k;
    }
    return { name: p.name, verts: out, world, tris };
  });
  return {
    meshes,
    stats: { triangles: meshes.reduce((s, m) => s + m.tris.length / 4, 0), sizeMm: [size.x * k, size.z * k, size.y * k], ...check },
  };
}

// dropFins on [v1, v2, v3, slot] triangles, keeping each survivor's slot.
function removeFins(tris) {
  const idx = new Uint32Array(tris.length / 4 * 3);
  const slotOf = new Map();
  for (let f = 0; f < tris.length / 4; f++) {
    idx[f * 3] = tris[f * 4]; idx[f * 3 + 1] = tris[f * 4 + 1]; idx[f * 3 + 2] = tris[f * 4 + 2];
    slotOf.set(`${tris[f * 4]},${tris[f * 4 + 1]},${tris[f * 4 + 2]}`, tris[f * 4 + 3]);
  }
  const kept = dropFins(idx);
  const out = [];
  for (let t = 0; t < kept.length; t += 3) out.push(kept[t], kept[t + 1], kept[t + 2], slotOf.get(`${kept[t]},${kept[t + 1]},${kept[t + 2]}`));
  return out;
}

function faceAreas(verts, tris) {
  const a = new Float64Array(tris.length / 4);
  for (let f = 0; f < a.length; f++) {
    const i = tris[f * 4] * 3, j = tris[f * 4 + 1] * 3, l = tris[f * 4 + 2] * 3;
    const ux = verts[j] - verts[i], uy = verts[j + 1] - verts[i + 1], uz = verts[j + 2] - verts[i + 2];
    const vx = verts[l] - verts[i], vy = verts[l + 1] - verts[i + 1], vz = verts[l + 2] - verts[i + 2];
    a[f] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}

function neighbours(tris, edges) {
  const nb = Array.from({ length: tris.length / 4 }, () => []);
  for (const faces of edges.values()) {
    if (faces.length !== 2) continue;
    nb[faces[0]].push(faces[1]); nb[faces[1]].push(faces[0]);
  }
  return nb;
}

// A face adopts the colour shared by at least two of its edge neighbours.
function smoothSlots(tris, nb, passes) {
  const nF = tris.length / 4;
  const changed = new Set();
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(nF);
    let any = false;
    for (let f = 0; f < nF; f++) {
      const own = tris[f * 4 + 3];
      next[f] = own;
      const ns = nb[f];
      if (ns.length < 2) continue;
      for (let a = 0; a < ns.length; a++) {
        const sa = tris[ns[a] * 4 + 3];
        if (sa === own) continue;
        let count = 1;
        for (let b = a + 1; b < ns.length; b++) if (tris[ns[b] * 4 + 3] === sa) count++;
        if (count >= 2) { next[f] = sa; break; }
      }
    }
    for (let f = 0; f < nF; f++) {
      if (next[f] !== tris[f * 4 + 3]) { tris[f * 4 + 3] = next[f]; changed.add(f); any = true; }
    }
    if (!any) break;
  }
  return changed.size;
}

// Replaces stair-stepped colour boundaries with smooth cuts. Face colours are
// spread into a per-vertex colour field (area-weighted, then smoothed over
// vertex neighbours); faces whose corners fall in different colours are split
// where the field crosses over. A crossing point depends only on its edge's
// two vertices, so neighbouring faces share it and the mesh stays closed.
function contourSlots(verts, tris, passes) {
  const nV = verts.length / 3, nF = tris.length / 4;
  let nS = 0;
  for (let f = 0; f < nF; f++) nS = Math.max(nS, tris[f * 4 + 3] + 1);
  if (nS < 2) return { verts, tris };

  const area = faceAreas(verts, tris);
  let w = new Float32Array(nV * nS);
  const adj = Array.from({ length: nV }, () => new Set());
  for (let f = 0; f < nF; f++) {
    const s = tris[f * 4 + 3];
    for (let c = 0; c < 3; c++) {
      const v = tris[f * 4 + c];
      w[v * nS + s] += area[f];
      adj[v].add(tris[f * 4 + (c + 1) % 3]); adj[v].add(tris[f * 4 + (c + 2) % 3]);
    }
  }
  for (let v = 0; v < nV; v++) {
    let sum = 0;
    for (let s = 0; s < nS; s++) sum += w[v * nS + s];
    if (sum > 0) for (let s = 0; s < nS; s++) w[v * nS + s] /= sum;
  }
  const nbr = adj.map(a => Uint32Array.from(a));
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(w.length);
    for (let v = 0; v < nV; v++) {
      const ns = nbr[v];
      for (let s = 0; s < nS; s++) {
        let acc = 0;
        for (let j = 0; j < ns.length; j++) acc += w[ns[j] * nS + s];
        next[v * nS + s] = ns.length ? 0.5 * w[v * nS + s] + 0.5 * acc / ns.length : w[v * nS + s];
      }
    }
    w = next;
  }
  const label = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) {
    let b = 0;
    for (let s = 1; s < nS; s++) if (w[v * nS + s] > w[v * nS + b]) b = s;
    label[v] = b;
  }

  const out = Array.from(verts);
  const addVert = (x, y, z) => { out.push(x, y, z); return out.length / 3 - 1; };
  const cuts = new Map();
  // Point on edge i–j where colours label[i] and label[j] are equally strong.
  const cut = (i, j) => {
    const key = i < j ? i * nV + j : j * nV + i;
    let id = cuts.get(key);
    if (id !== undefined) return id;
    const a = label[i], b = label[j];
    const di = w[i * nS + a] - w[i * nS + b], dj = w[j * nS + a] - w[j * nS + b];
    let t = di - dj > 1e-9 ? di / (di - dj) : 0.5;
    t = Math.min(0.95, Math.max(0.05, t));
    id = addVert(
      verts[i * 3] + (verts[j * 3] - verts[i * 3]) * t,
      verts[i * 3 + 1] + (verts[j * 3 + 1] - verts[i * 3 + 1]) * t,
      verts[i * 3 + 2] + (verts[j * 3 + 2] - verts[i * 3 + 2]) * t);
    cuts.set(key, id);
    return id;
  };

  const res = [];
  for (let f = 0; f < nF; f++) {
    let v0 = tris[f * 4], v1 = tris[f * 4 + 1], v2 = tris[f * 4 + 2];
    let l0 = label[v0], l1 = label[v1], l2 = label[v2];
    if (l0 === l1 && l1 === l2) { res.push(v0, v1, v2, l0); continue; }
    if (l0 !== l1 && l1 !== l2 && l0 !== l2) {
      const c = addVert(
        (verts[v0 * 3] + verts[v1 * 3] + verts[v2 * 3]) / 3,
        (verts[v0 * 3 + 1] + verts[v1 * 3 + 1] + verts[v2 * 3 + 1]) / 3,
        (verts[v0 * 3 + 2] + verts[v1 * 3 + 2] + verts[v2 * 3 + 2]) / 3);
      const p01 = cut(v0, v1), p12 = cut(v1, v2), p20 = cut(v2, v0);
      res.push(v0, p01, c, l0, v0, c, p20, l0, v1, p12, c, l1, v1, c, p01, l1, v2, p20, c, l2, v2, c, p12, l2);
      continue;
    }
    // Rotate so v2 is the odd corner out.
    if (l1 === l2) [v0, v1, v2, l0, l1, l2] = [v1, v2, v0, l1, l2, l0];
    else if (l0 === l2) [v0, v1, v2, l0, l1, l2] = [v2, v0, v1, l2, l0, l1];
    const p = cut(v0, v2), q = cut(v1, v2);
    res.push(v0, v1, q, l0, v0, q, p, l0, p, q, v2, l2);
  }
  return { verts: out, tris: res };
}

// Single-file 3MF with per-triangle filament paint (Bambu paint_color,
// PrusaSlicer mmu_segmentation) and standard basematerials colours.
export function build3mf(prepared, slots, { name = 'lofi-viewer' } = {}) {
  const objects = [];
  const items = [];
  let id = 2;
  for (const m of prepared.meshes) {
    const vx = [];
    for (let i = 0; i < m.verts.length; i += 3) vx.push(`<vertex x="${fmt(m.verts[i])}" y="${fmt(m.verts[i + 1])}" z="${fmt(m.verts[i + 2])}"/>`);
    const tx = [];
    for (let t = 0; t < m.tris.length; t += 4) {
      const code = paintCode(m.tris[t + 3] + 1);
      tx.push(`<triangle v1="${m.tris[t]}" v2="${m.tris[t + 1]}" v3="${m.tris[t + 2]}" pid="1" p1="${m.tris[t + 3]}" paint_color="${code}" slic3rpe:mmu_segmentation="${code}"/>`);
    }
    objects.push(
      `<object id="${id}" type="model" pid="1" pindex="0" name="${xml(m.name)}"><mesh>` +
      `<vertices>${vx.join('')}</vertices><triangles>${tx.join('')}</triangles></mesh></object>`
    );
    items.push(`<item objectid="${id}"/>`);
    id++;
  }

  const bases = slots.map((h, i) => `<base name="Filament ${i + 1}" displaycolor="${h.toUpperCase()}FF"/>`).join('');
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">` +
    `<metadata name="Title">${xml(name)}</metadata>` +
    `<metadata name="Application">lofi-viewer</metadata>` +
    `<metadata name="slic3rpe:MmPaintingVersion">1</metadata>` +
    `<resources><basematerials id="1">${bases}</basematerials>${objects.join('')}</resources>` +
    `<build>${items.join('')}</build></model>`;

  const files = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`
    ),
    '3D/3dmodel.model': strToU8(model),
  };
  return zipSync(files, { level: 6 });
}

// OBJ + MTL with one material per filament. Bambu Studio imports this through
// its colour-matching dialog (no "invalid config" warning), and most slicers
// and 3D tools read material colours from MTL files.
export function buildObjMtl(prepared, slots, { name = 'lofi-viewer' } = {}) {
  const base = `${name.replace(/[^\w.-]+/g, '_')}-lofi`;
  const mtl = slots.map((h, i) => {
    const [r, g, b] = hexToRgb(h).map(c => (c / 255).toFixed(4));
    return `newmtl filament_${i + 1}\nKd ${r} ${g} ${b}\n`;
  }).join('\n');
  const lines = [`# lofi-viewer multi-color print export`, `mtllib ${base}.mtl`];
  let offset = 1;
  for (const m of prepared.meshes) {
    lines.push(`o ${m.name.replace(/\s+/g, '_') || 'part'}`);
    for (let i = 0; i < m.verts.length; i += 3) lines.push(`v ${fmt(m.verts[i])} ${fmt(m.verts[i + 1])} ${fmt(m.verts[i + 2])}`);
    const bySlot = new Map();
    for (let t = 0; t < m.tris.length; t += 4) {
      const list = bySlot.get(m.tris[t + 3]) ?? [];
      list.push(`f ${m.tris[t] + offset} ${m.tris[t + 1] + offset} ${m.tris[t + 2] + offset}`);
      bySlot.set(m.tris[t + 3], list);
    }
    for (const [slot, faces] of [...bySlot].sort((a, b) => a[0] - b[0])) {
      lines.push(`usemtl filament_${slot + 1}`);
      for (const f of faces) lines.push(f);
    }
    offset += m.verts.length / 3;
  }
  return { obj: lines.join('\n') + '\n', mtl, base };
}

// Merges coincident corners (within a tiny tolerance, since shared edge
// points are computed from each face's own corners) into one solid.
function weld(positions, slot) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < positions.length; i++) { if (positions[i] < min) min = positions[i]; if (positions[i] > max) max = positions[i]; }
  const q = 1e7 / Math.max(1e-9, max - min);
  const map = new Map();
  const verts = [];
  const tris = [];
  const ids = [0, 0, 0];
  for (let t = 0; t < positions.length / 9; t++) {
    for (let c = 0; c < 3; c++) {
      const o = (t * 3 + c) * 3;
      const key = `${Math.round(positions[o] * q)},${Math.round(positions[o + 1] * q)},${Math.round(positions[o + 2] * q)}`;
      let vid = map.get(key);
      if (vid === undefined) {
        vid = verts.length / 3;
        map.set(key, vid);
        verts.push(positions[o], positions[o + 1], positions[o + 2]);
      }
      ids[c] = vid;
    }
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
    tris.push(ids[0], ids[1], ids[2], slot[t]);
  }
  return { verts, tris };
}

// Edge → list of faces, on welded triangles laid out as [v1, v2, v3, slot].
function edgeFaces(tris) {
  const edges = new Map();
  for (let f = 0; f < tris.length / 4; f++) {
    for (let e = 0; e < 3; e++) {
      const a = tris[f * 4 + e], b = tris[f * 4 + (e + 1) % 3];
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const list = edges.get(key);
      if (list) list.push(f); else edges.set(key, [f]);
    }
  }
  return edges;
}

// Recolours connected same-filament patches whose printed area is below
// `minArea` (mm²) with the filament they share the most edges with.
function mergeIslands(tris, nb, area, minArea) {
  const nF = tris.length / 4;
  let islands = 0;
  const recolored = new Set();
  for (let pass = 0; pass < 4; pass++) {
    const comp = new Int32Array(nF).fill(-1);
    let changed = false;
    for (let seed = 0; seed < nF; seed++) {
      if (comp[seed] >= 0) continue;
      const slot = tris[seed * 4 + 3];
      const members = [seed];
      comp[seed] = seed;
      let total = area[seed];
      for (let i = 0; i < members.length; i++) {
        for (const n of nb[members[i]]) {
          if (comp[n] < 0 && tris[n * 4 + 3] === slot) { comp[n] = seed; members.push(n); total += area[n]; }
        }
      }
      if (total >= minArea) continue;
      const votes = new Map();
      for (const m of members) for (const n of nb[m]) {
        const s = tris[n * 4 + 3];
        if (s !== slot) votes.set(s, (votes.get(s) || 0) + 1);
      }
      if (!votes.size) continue;
      let target = slot, best = 0;
      for (const [s, v] of votes) if (v > best) { best = v; target = s; }
      for (const m of members) { tris[m * 4 + 3] = target; recolored.add(m); }
      islands++; changed = true;
    }
    if (!changed) break;
  }
  return { islands, faces: recolored.size };
}

// Closes each boundary loop with a fan to the loop's centroid. New faces take
// the filament most common along the loop.
function fillHoles(verts, tris) {
  const edges = edgeFaces(tris);
  const boundary = [];
  for (const faces of edges.values()) {
    if (faces.length !== 1) continue;
    const f = faces[0];
    for (let e = 0; e < 3; e++) {
      const a = tris[f * 4 + e], b = tris[f * 4 + (e + 1) % 3];
      const ka = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      if (edges.get(ka) === faces) boundary.push([a, b, tris[f * 4 + 3]]);
    }
  }
  if (!boundary.length) return 0;

  // Group boundary edges into loops via shared vertices (union-find).
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [a, b] of boundary) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const loops = new Map();
  for (const edge of boundary) {
    const r = find(edge[0]);
    if (!loops.has(r)) loops.set(r, []);
    loops.get(r).push(edge);
  }

  let closed = 0;
  for (const loop of loops.values()) {
    if (loop.length < 3) continue;
    const vs = new Set();
    loop.forEach(([a, b]) => { vs.add(a); vs.add(b); });
    let cx = 0, cy = 0, cz = 0;
    for (const v of vs) { cx += verts[v * 3]; cy += verts[v * 3 + 1]; cz += verts[v * 3 + 2]; }
    const c = verts.length / 3;
    verts.push(cx / vs.size, cy / vs.size, cz / vs.size);
    const votes = new Map();
    loop.forEach(([, , s]) => votes.set(s, (votes.get(s) || 0) + 1));
    let slot = loop[0][2], best = 0;
    for (const [s, n] of votes) if (n > best) { best = n; slot = s; }
    // Boundary edge a→b belongs to an existing face; the cap uses b→a.
    for (const [a, b] of loop) tris.push(b, a, c, slot);
    closed++;
  }
  return closed;
}

const fmt = n => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(4));
const xml = s => String(s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

export function downloadFile(bytes, filename, type = 'application/octet-stream') {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
