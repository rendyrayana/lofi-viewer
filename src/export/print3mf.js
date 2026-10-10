import * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';
import { extractPalette, hexToRgb, rgbToHex } from '../process/palette.js';

// Barycentric sample points per triangle for the face-colour majority vote.
const SAMPLES = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6],
  [0.45, 0.45, 0.1], [0.45, 0.1, 0.45], [0.1, 0.45, 0.45],
];

// Collects every processed mesh as world-space triangles plus one RGB colour
// per face, read from the final (palette-quantised) texture. `subdiv` splits
// each triangle into 4^subdiv flat sub-triangles first: the shape is
// unchanged, but colour can follow texture detail finer than the mesh.
export function collectFaces(processor, { subdiv = 0 } = {}) {
  const parts = [];
  for (const e of processor.entries) {
    const { mesh } = e;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    const pos = geo.attributes.position, uvA = geo.attributes.uv;
    const idx = geo.index ? geo.index.array : null;
    const nT = (idx ? idx.length : pos.count) / 3;
    const corner = (t, c) => (idx ? idx[t * 3 + c] : t * 3 + c);
    const img = e.image;
    const diffuse = mesh.material.uniforms?.diffuse?.value;
    const fallback = diffuse ? [diffuse.r * 255, diffuse.g * 255, diffuse.b * 255].map(Math.round) : [200, 200, 200];

    const k = 4 ** subdiv;
    const positions = new Float32Array(nT * k * 9);
    const colors = new Array(nT * k);
    const v = new THREE.Vector3();
    let out = 0;

    const emit = (p, uv) => {
      positions.set(p, out * 9);
      colors[out++] = img && uvA ? faceColor(img, uv) : fallback;
    };
    const split = (p, uv, level) => {
      if (level === 0) { emit(p, uv); return; }
      const mp = (a, b) => [(p[a * 3] + p[b * 3]) / 2, (p[a * 3 + 1] + p[b * 3 + 1]) / 2, (p[a * 3 + 2] + p[b * 3 + 2]) / 2];
      const mu = (a, b) => [(uv[a * 2] + uv[b * 2]) / 2, (uv[a * 2 + 1] + uv[b * 2 + 1]) / 2];
      const P = i => p.slice(i * 3, i * 3 + 3), U = i => uv.slice(i * 2, i * 2 + 2);
      const p01 = mp(0, 1), p12 = mp(1, 2), p20 = mp(2, 0);
      const u01 = mu(0, 1), u12 = mu(1, 2), u20 = mu(2, 0);
      split([...P(0), ...p01, ...p20], [...U(0), ...u01, ...u20], level - 1);
      split([...p01, ...P(1), ...p12], [...u01, ...U(1), ...u12], level - 1);
      split([...p20, ...p12, ...P(2)], [...u20, ...u12, ...U(2)], level - 1);
      split([...p01, ...p12, ...p20], [...u01, ...u12, ...u20], level - 1);
    };

    for (let t = 0; t < nT; t++) {
      const p = [], uv = [];
      for (let c = 0; c < 3; c++) {
        const i = corner(t, c);
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        p.push(v.x, v.y, v.z);
        uv.push(uvA ? uvA.getX(i) : 0, uvA ? uvA.getY(i) : 0);
      }
      split(p, uv, subdiv);
    }
    parts.push({ name: mesh.name || 'part', positions, colors });
  }
  return parts;
}

// Majority vote over a few points inside the triangle, so a single dither
// texel doesn't decide the face colour.
function faceColor(img, uv) {
  const votes = new Map();
  let best = null;
  for (const [a, b, c] of SAMPLES) {
    const rgb = texel(img, a * uv[0] + b * uv[2] + c * uv[4], a * uv[1] + b * uv[3] + c * uv[5]);
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    const cur = votes.get(key) ?? { rgb, n: 0 };
    cur.n++;
    votes.set(key, cur);
    if (!best || cur.n > best.n) best = cur;
  }
  return best.rgb;
}

function texel(img, u, v) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(img.width - 1, Math.floor(u * img.width));
  const y = Math.min(img.height - 1, Math.floor((img.flipY ? 1 - v : v) * img.height));
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

// Maps face colours to filament slots. With a fixed palette each used palette
// colour becomes one filament; otherwise the face colours are reduced to
// `maxFilaments` representative colours.
export function assignFilaments(parts, palette, maxFilaments) {
  let slots;
  if (palette?.length) {
    const used = new Set();
    for (const p of parts) for (const c of p.colors) used.add(rgbToHex(c));
    slots = palette.filter(h => used.has(h));
    if (!slots.length) slots = palette.slice(0, maxFilaments);
  } else {
    const all = [];
    for (const p of parts) for (const c of p.colors) all.push(c[0], c[1], c[2], 255);
    slots = extractPalette({ data: all }, maxFilaments);
  }
  const rgb = slots.map(hexToRgb);
  const cache = new Map();
  for (const p of parts) {
    p.slot = new Uint8Array(p.colors.length);
    p.colors.forEach((c, t) => {
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      let s = cache.get(key);
      if (s === undefined) {
        s = 0;
        let bd = Infinity;
        rgb.forEach((q, k) => {
          const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2;
          if (d < bd) { bd = d; s = k; }
        });
        cache.set(key, s);
      }
      p.slot[t] = s;
    });
  }
  return slots;
}

// Encodes a whole-triangle filament state the way PrusaSlicer/Bambu Studio
// serialise TriangleSelector leaves: states 1–2 as one nibble (state << 2),
// states ≥3 as 0xC followed by (state − 3), hex digits written in reverse.
export function paintCode(state) {
  if (state <= 0) return '';
  if (state < 3) return (state << 2).toString(16).toUpperCase();
  return (state - 3).toString(16).toUpperCase() + 'C';
}

// Builds a single-file 3MF (Y-up scene → Z-up, millimetres, resting on z = 0).
export function build3mf(parts, slots, { heightMm = 60, name = 'lofi-viewer', minIsland = 0, closeHoles = true } = {}) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) box.expandByPoint(v.fromArray(p.positions, i));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = size.y > 0 ? heightMm / size.y : 1;

  const objects = [];
  const items = [];
  const check = { openEdges: 0, nonManifoldEdges: 0, islandsMerged: 0, facesRecolored: 0, holesClosed: 0 };
  let id = 2;
  for (const p of parts) {
    const { verts, tris } = weld(p.positions, p.slot);
    if (closeHoles) check.holesClosed += fillHoles(verts, tris);
    const edges = edgeFaces(tris);
    for (const faces of edges.values()) {
      if (faces.length === 1) check.openEdges++;
      else if (faces.length > 2) check.nonManifoldEdges++;
    }
    if (minIsland > 1) {
      const r = mergeIslands(tris, edges, minIsland);
      check.islandsMerged += r.islands;
      check.facesRecolored += r.faces;
    }
    const vx = [];
    for (let i = 0; i < verts.length; i += 3) {
      const x = (verts[i] - center.x) * k;
      const y = -(verts[i + 2] - center.z) * k;
      const z = (verts[i + 1] - box.min.y) * k;
      vx.push(`<vertex x="${fmt(x)}" y="${fmt(y)}" z="${fmt(z)}"/>`);
    }
    const tx = [];
    for (let t = 0; t < tris.length; t += 4) {
      const code = paintCode(tris[t + 3] + 1);
      tx.push(`<triangle v1="${tris[t]}" v2="${tris[t + 1]}" v3="${tris[t + 2]}" pid="1" p1="${tris[t + 3]}" paint_color="${code}" slic3rpe:mmu_segmentation="${code}"/>`);
    }
    objects.push(
      `<object id="${id}" type="model" pid="1" pindex="0" name="${xml(p.name)}"><mesh>` +
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
  return {
    bytes: zipSync(files, { level: 6 }),
    stats: { filaments: slots.length, triangles: parts.reduce((s, p) => s + p.colors.length, 0), sizeMm: [size.x * k, size.z * k, size.y * k], ...check },
  };
}

// Merges coincident corners so the printed mesh is one connected solid.
function weld(positions, slot) {
  const map = new Map();
  const verts = [];
  const tris = [];
  const ids = [0, 0, 0];
  for (let t = 0; t < positions.length / 9; t++) {
    for (let c = 0; c < 3; c++) {
      const o = (t * 3 + c) * 3;
      const key = `${positions[o]},${positions[o + 1]},${positions[o + 2]}`;
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

// Recolours connected same-filament patches smaller than `minFaces` with the
// filament they share the most edges with, so prints don't get stray specks.
function mergeIslands(tris, edges, minFaces) {
  const nF = tris.length / 4;
  const nb = Array.from({ length: nF }, () => []);
  for (const faces of edges.values()) {
    if (faces.length !== 2) continue;
    nb[faces[0]].push(faces[1]); nb[faces[1]].push(faces[0]);
  }
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
      for (let i = 0; i < members.length; i++) {
        for (const n of nb[members[i]]) {
          if (comp[n] < 0 && tris[n * 4 + 3] === slot) { comp[n] = seed; members.push(n); }
        }
      }
      if (members.length >= minFaces) continue;
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

export function download3mf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'model/3mf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
