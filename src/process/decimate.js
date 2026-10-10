import { Vector3 } from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

// Weld vertices by position only, so UV seams in scanned meshes don't split
// the surface into islands the simplifier can't collapse across.
export function weldPositions(geo) {
  const pos = geo.attributes.position;
  const srcIdx = geo.index ? geo.index.array : null;
  const triVerts = srcIdx ? srcIdx.length : pos.count;

  geo.computeBoundingBox();
  const size = geo.boundingBox.getSize(new Vector3());
  const diag = Math.hypot(size.x, size.y, size.z) || 1;
  const q = 1e5 / diag;

  const map = new Map();
  const remap = new Uint32Array(pos.count);
  const outPos = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = outPos.length / 3;
      map.set(key, id);
      outPos.push(x, y, z);
    }
    remap[i] = id;
  }

  const indices = new Uint32Array(triVerts);
  for (let i = 0; i < triVerts; i++) indices[i] = remap[srcIdx ? srcIdx[i] : i];
  return { positions: new Float32Array(outPos), indices: dropDegenerate(indices) };
}

function dropDegenerate(idx) {
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  return new Uint32Array(out);
}

// Returns a compact { positions, indices } mesh with at most targetTris triangles.
export async function decimate(welded, targetTris) {
  await MeshoptSimplifier.ready;
  const { positions, indices } = welded;
  const targetIdx = Math.max(3, Math.floor(targetTris) * 3);
  if (indices.length <= targetIdx) return compact(positions, indices);

  let [out] = MeshoptSimplifier.simplify(indices, positions, 3, targetIdx, 1.0, ['Prune']);
  // Scans with holes or non-manifold borders can stall well above the budget.
  if (out.length > targetIdx * 1.1) {
    [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, targetIdx, 1.0);
  }
  return compact(positions, dropDegenerate(out));
}

function compact(positions, indices) {
  const remap = new Map();
  const outPos = [];
  const outIdx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    let id = remap.get(v);
    if (id === undefined) {
      id = outPos.length / 3;
      remap.set(v, id);
      outPos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    outIdx[i] = id;
  }
  return { positions: new Float32Array(outPos), indices: outIdx };
}
