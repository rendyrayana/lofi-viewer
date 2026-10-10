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
// per face, read from the final (palette-quantised) texture.
export function collectFaces(processor) {
  const parts = [];
  for (const e of processor.entries) {
    const { mesh } = e;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const idx = geo.index ? geo.index.array : null;
    const nT = (idx ? idx.length : pos.count) / 3;
    const corner = (t, c) => (idx ? idx[t * 3 + c] : t * 3 + c);

    const v = new THREE.Vector3();
    const positions = new Float32Array(nT * 9);
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) {
      v.fromBufferAttribute(pos, corner(t, c)).applyMatrix4(mesh.matrixWorld);
      positions.set([v.x, v.y, v.z], (t * 3 + c) * 3);
    }

    const colors = new Array(nT);
    const img = e.image;
    const diffuse = mesh.material.uniforms?.diffuse?.value;
    const fallback = diffuse ? [diffuse.r * 255, diffuse.g * 255, diffuse.b * 255].map(Math.round) : [200, 200, 200];
    for (let t = 0; t < nT; t++) {
      if (!img || !uv) { colors[t] = fallback; continue; }
      const votes = new Map();
      for (const [a, b, c] of SAMPLES) {
        const i0 = corner(t, 0), i1 = corner(t, 1), i2 = corner(t, 2);
        const u = a * uv.getX(i0) + b * uv.getX(i1) + c * uv.getX(i2);
        const w = a * uv.getY(i0) + b * uv.getY(i1) + c * uv.getY(i2);
        const rgb = texel(img, u, w);
        const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        const cur = votes.get(key);
        if (cur) cur.n++; else votes.set(key, { rgb, n: 1 });
      }
      let best = null;
      for (const vote of votes.values()) if (!best || vote.n > best.n) best = vote;
      colors[t] = best.rgb;
    }
    parts.push({ name: mesh.name || 'part', positions, colors });
  }
  return parts;
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
export function build3mf(parts, slots, { heightMm = 60, name = 'lofi-viewer' } = {}) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) box.expandByPoint(v.fromArray(p.positions, i));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const k = size.y > 0 ? heightMm / size.y : 1;

  const objects = [];
  const items = [];
  let id = 2;
  for (const p of parts) {
    const { verts, tris } = weld(p.positions, p.slot);
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
    stats: { filaments: slots.length, triangles: parts.reduce((s, p) => s + p.colors.length, 0), sizeMm: [size.x * k, size.z * k, size.y * k] },
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

const fmt = n => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(4));
const xml = s => String(s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));

export function download3mf(bytes, filename) {
  const blob = new Blob([bytes], { type: 'model/3mf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
