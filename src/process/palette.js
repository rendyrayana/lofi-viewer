// Signed 4×4 ordered-dither matrix of the PlayStation GPU (psx-spx).
export const PSX_DITHER = [
  [-4,  0, -3,  1],
  [ 2, -2,  3, -1],
  [-3,  1, -4,  0],
  [ 3, -1,  2, -2],
];

export const PALETTE_PRESETS = {
  bambuBasic: {
    label: 'Bambu PLA Basic (approx.)',
    colors: ['#ffffff', '#000000', '#8e9089', '#c12e1f', '#ff6a13', '#f4ee2a', '#00ae42', '#0a2989', '#0086d6', '#ec008c', '#9d432c', '#f7e6de'],
  },
  pico8: {
    label: 'PICO-8',
    colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  },
  gameboy: {
    label: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  virtualBoy: {
    label: 'Virtual Boy',
    colors: ['#000000', '#550000', '#aa0000', '#ff0000'],
  },
  gbPocket: {
    label: 'Game Boy Pocket',
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
  },
  ega: {
    label: 'EGA (16)',
    colors: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'],
  },
  cga: {
    label: 'CGA (mode 4)',
    colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  },
  grayscale4: {
    label: 'Grayscale 4',
    colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
  },
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Resamples an RGBA image to w×h.
//   nearest — the source pixel at each target texel centre
//   box     — average of the source block
//   edge    — block average, unless a sizeable share of the block is much darker
//             than the average (outlines, eyes); then those dark pixels win, so
//             thin dark detail survives heavy reduction
export function downsample(src, w, h, method = 'nearest') {
  const { data, width: W, height: H } = src;
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (method === 'nearest') {
        const sx = Math.min(W - 1, Math.floor((x + 0.5) * W / w));
        const sy = Math.min(H - 1, Math.floor((y + 0.5) * H / h));
        const i = (sy * W + sx) * 4;
        out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3];
        continue;
      }
      const sx0 = Math.floor(x * W / w), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * W / w));
      const sy0 = Math.floor(y * H / h), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * H / h));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * W + sx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
      }
      r /= n; g /= n; b /= n; a /= n;
      if (method === 'edge' && n > 1) {
        const meanL = 0.299 * r + 0.587 * g + 0.114 * b;
        let dr = 0, dg = 0, db = 0, dn = 0;
        for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * W + sx) * 4;
          if (meanL - (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) > 40) {
            dr += data[i]; dg += data[i + 1]; db += data[i + 2]; dn++;
          }
        }
        if (dn >= n * 0.15) { r = dr / dn; g = dg / dn; b = db / dn; }
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  return { data: out, width: w, height: h };
}

// Saturation and contrast around mid-grey, applied before quantisation.
export function adjustColor(img, saturation = 1, contrast = 1) {
  if (saturation === 1 && contrast === 1) return img;
  const { data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    for (let c = 0; c < 3; c++) {
      const v = l + (data[i + c] - l) * saturation;
      out[i + c] = (v - 128) * contrast + 128;
    }
    out[i + 3] = data[i + 3];
  }
  return { ...img, data: out };
}

// Snaps palette entries to the 15-bit grid used by PlayStation CLUTs.
export function snap15(hexColors) {
  return [...new Set(hexColors.map(h => rgbToHex(hexToRgb(h).map(v => Math.round(Math.round(v * 31 / 255) * 255 / 31)))))];
}

// Colour features for clustering and matching. With mergeShades, colours are
// compared in CIELAB with lightness heavily down-weighted, so lit and shadowed
// areas of one material (baked into scan textures) count as one colour.
const SHADE_WEIGHT = 0.3;
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const labF = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function feature(r, g, b, mergeShades) {
  if (!mergeShades) return [r, g, b];
  const R = lin(r), G = lin(g), B = lin(b);
  const x = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [(116 * y - 16) * SHADE_WEIGHT, 500 * (x - y), 200 * (y - z)];
}

// Nearest palette entry for any RGB, via a lazily filled 15-bit lookup table.
export function makeColorMatcher(hexColors, mergeShades = false) {
  const pal = hexColors.map(hexToRgb);
  const feats = pal.map(([r, g, b]) => feature(r, g, b, mergeShades));
  const lut = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let best = lut[key];
    if (best < 0) {
      const cr = (r & 0xf8) + 4, cg = (g & 0xf8) + 4, cb = (b & 0xf8) + 4;
      let bd = Infinity;
      best = 0;
      if (mergeShades) {
        const f = feature(cr, cg, cb, true);
        for (let k = 0; k < feats.length; k++) {
          const d = (f[0] - feats[k][0]) ** 2 + (f[1] - feats[k][1]) ** 2 + (f[2] - feats[k][2]) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      } else {
        for (let k = 0; k < pal.length; k++) {
          const d = redmean(cr, cg, cb, pal[k]);
          if (d < bd) { bd = d; best = k; }
        }
      }
      lut[key] = best;
    }
    return best;
  };
}

// Palette extraction: range-midpoint box splitting (keeps small but distinct
// colours such as dark eyes, which median cut averages away), then k-means.
// Clustering runs on colour features; each palette entry is its cluster's
// mean RGB.
export function extractPalette(img, count, { mergeShades = false } = {}) {
  const { data } = img;
  const step = Math.max(1, Math.floor(data.length / 4 / 40000));
  const pts = [];
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    pts.push({ f: feature(r, g, b, mergeShades), c: [r, g, b] });
  }
  if (!pts.length) return ['#000000'];

  const boxes = [pts];
  while (boxes.length < count) {
    let bi = -1, bestRange = 0, bestCh = 0, bestMid = 0;
    boxes.forEach((box, i) => {
      for (let ch = 0; ch < 3; ch++) {
        let lo = Infinity, hi = -Infinity;
        for (const p of box) { if (p.f[ch] < lo) lo = p.f[ch]; if (p.f[ch] > hi) hi = p.f[ch]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; bestCh = ch; bestMid = (lo + hi) / 2; }
      }
    });
    if (bi < 0 || bestRange < 1e-6) break;
    const a = [], b = [];
    for (const p of boxes[bi]) (p.f[bestCh] <= bestMid ? a : b).push(p);
    if (!a.length || !b.length) break;
    boxes.splice(bi, 1, a, b);
  }

  const mean = (list, key) => {
    const s = [0, 0, 0];
    for (const p of list) { s[0] += p[key][0]; s[1] += p[key][1]; s[2] += p[key][2]; }
    return s.map(v => v / list.length);
  };
  let centers = boxes.map(box => mean(box, 'f'));
  let members = boxes;
  for (let it = 0; it < 6; it++) {
    const groups = centers.map(() => []);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const c = centers[k];
        const d = mergeShades
          ? (p.f[0] - c[0]) ** 2 + (p.f[1] - c[1]) ** 2 + (p.f[2] - c[2]) ** 2
          : redmean(p.f[0], p.f[1], p.f[2], c);
        if (d < bd) { bd = d; best = k; }
      }
      groups[best].push(p);
    }
    members = groups.map((g, k) => (g.length ? g : members[k] || []));
    centers = members.map((g, k) => (g.length ? mean(g, 'f') : centers[k]));
  }

  const colors = members.filter(g => g.length).map(g => rgbToHex(mean(g, 'c')));
  return [...new Set(colors)].sort((x, y) => luminance(hexToRgb(x)) - luminance(hexToRgb(y)));
}

function luminance([r, g, b]) { return 0.299 * r + 0.587 * g + 0.114 * b; }

const BAYER8 = (() => {
  const m = [[0, 2], [3, 1]];
  let cur = m;
  for (let n = 2; n < 8; n *= 2) {
    const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = cur[y][x] * 4;
      next[y][x] = v; next[y][x + n] = v + 2; next[y + n][x] = v + 3; next[y + n][x + n] = v + 1;
    }
    cur = next;
  }
  return cur;
})();

// Ordered-dither offset in units of one quantisation step, roughly −0.5…+0.5.
// 'psx4' uses the PlayStation GPU matrix (−4…+3 in 8-bit units, step 8).
function orderedOffset(pattern, x, y) {
  if (pattern === 'bayer8') return (BAYER8[y & 7][x & 7] + 0.5) / 64 - 0.5;
  return PSX_DITHER[y & 3][x & 3] / 8;
}

// PS1 15-bit colour: C5 = clamp(floor((C·255 + D) / 8), 0, 31), expanded back
// to 8 bits. With pattern 'psx4' and strength 1, D is exactly the hardware
// dither offset. 'fs' diffuses the rounding error (Floyd–Steinberg) instead.
export function quantize15(img, pattern = 'psx4', strength = 1, dither = true) {
  const { data, width: W, height: H } = img;
  const out = new Uint8ClampedArray(data.length);
  const q = v => Math.min(31, Math.max(0, Math.floor(v / 8)));
  if (dither && pattern === 'fs') {
    const buf = Float32Array.from(data);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const old = buf[i + c];
        const nv = Math.round(Math.min(31, Math.max(0, Math.round(old * 31 / 255))) * 255 / 31);
        out[i + c] = nv;
        diffuse(buf, W, H, x, y, c, (old - nv) * strength);
      }
      out[i + 3] = data[i + 3];
    }
    return { ...img, data: out };
  }
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4, x = p % W, y = (p / W) | 0;
    const d = dither ? orderedOffset(pattern, x, y) * 8 * strength : 0;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(q(data[i + c] + d) * 255 / 31);
    out[i + 3] = data[i + 3];
  }
  return { ...img, data: out };
}

function diffuse(buf, W, H, x, y, c, err) {
  const add = (dx, dy, f) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= W || ny >= H) return;
    buf[(ny * W + nx) * 4 + c] += err * f;
  };
  add(1, 0, 7 / 16); add(-1, 1, 3 / 16); add(0, 1, 5 / 16); add(1, 1, 1 / 16);
}

// Maps every pixel to its nearest palette colour (redmean distance), with
// optional ordered dither (offset scaled to the palette's typical colour
// spacing) or Floyd–Steinberg error diffusion.
export function quantizeToPalette(img, hexColors, pattern = 'psx4', strength = 1, dither = true, mergeShades = false) {
  const pal = hexColors.map(hexToRgb);
  const { data, width: W, height: H } = img;
  const out = new Uint8ClampedArray(data.length);
  // Ordered-dither amplitude: at strength 1 about a third of the palette's
  // typical colour spacing, so dither softens banding without jumping whole
  // palette steps. Strength 2 restores the full-step look.
  const spread = (255 / Math.max(2, Math.cbrt(pal.length) * 2)) * 0.35;
  const nearest = makeColorMatcher(hexColors, mergeShades);

  if (dither && pattern === 'fs') {
    const buf = Float32Array.from(data);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const k = nearest(clamp(buf[i]), clamp(buf[i + 1]), clamp(buf[i + 2]));
      for (let c = 0; c < 3; c++) {
        out[i + c] = pal[k][c];
        diffuse(buf, W, H, x, y, c, (buf[i + c] - pal[k][c]) * strength * 0.6);
      }
      out[i + 3] = data[i + 3];
    }
    return { ...img, data: out };
  }

  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4, x = p % W, y = (p / W) | 0;
    const d = dither ? orderedOffset(pattern, x, y) * spread * strength : 0;
    const k = nearest(clamp(data[i] + d), clamp(data[i + 1] + d), clamp(data[i + 2] + d));
    out[i] = pal[k][0]; out[i + 1] = pal[k][1]; out[i + 2] = pal[k][2]; out[i + 3] = data[i + 3];
  }
  return { ...img, data: out };
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

function redmean(r, g, b, [pr, pg, pb]) {
  const rm = (r + pr) / 2;
  const dr = r - pr, dg = g - pg, db = b - pb;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

// Counts distinct RGB colours with a 2^24-bit bitmap (fast for 4K textures).
let seenBits = null;
export function countColors(img) {
  seenBits ??= new Uint32Array(1 << 19);
  seenBits.fill(0);
  const { data } = img;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const w = c >>> 5, b = 1 << (c & 31);
    if (!(seenBits[w] & b)) { seenBits[w] |= b; n++; }
  }
  return n;
}
