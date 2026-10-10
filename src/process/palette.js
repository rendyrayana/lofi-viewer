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

// Palette extraction: range-midpoint box splitting (keeps small but distinct
// colours such as dark eyes, which median cut averages away), then k-means.
export function extractPalette(img, count) {
  const { data } = img;
  const step = Math.max(1, Math.floor(data.length / 4 / 40000));
  const pts = [];
  for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3] >= 128) pts.push([data[i], data[i + 1], data[i + 2]]);
  if (!pts.length) return ['#000000'];

  const boxes = [pts];
  while (boxes.length < count) {
    let bi = -1, bestRange = 0, bestCh = 0, bestMid = 0;
    boxes.forEach((box, i) => {
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
        if (hi - lo > bestRange) { bestRange = hi - lo; bi = i; bestCh = ch; bestMid = (lo + hi) / 2; }
      }
    });
    if (bi < 0) break;
    const a = [], b = [];
    for (const p of boxes[bi]) (p[bestCh] <= bestMid ? a : b).push(p);
    boxes.splice(bi, 1, a, b);
  }

  let centers = boxes.map(box => {
    const s = [0, 0, 0];
    for (const p of box) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map(v => v / box.length);
  });

  for (let it = 0; it < 6; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const d = redmean(p[0], p[1], p[2], centers[k]);
        if (d < bd) { bd = d; best = k; }
      }
      const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    centers = centers.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
  }

  return [...new Set(centers.map(rgbToHex))].sort((x, y) => luminance(hexToRgb(x)) - luminance(hexToRgb(y)));
}

function luminance([r, g, b]) { return 0.299 * r + 0.587 * g + 0.114 * b; }

// PS1 15-bit colour: C5 = clamp(floor((C·255 + D) / 8), 0, 31), expanded back to 8 bits.
export function quantize15(img, dither) {
  const { data, width: W } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4, x = p % W, y = (p / W) | 0;
    const d = dither ? PSX_DITHER[y & 3][x & 3] : 0;
    for (let c = 0; c < 3; c++) {
      const c5 = Math.min(31, Math.max(0, Math.floor((data[i + c] + d) / 8)));
      out[i + c] = Math.round(c5 * 255 / 31);
    }
    out[i + 3] = data[i + 3];
  }
  return { ...img, data: out };
}

// Maps every pixel to its nearest palette colour (redmean distance). With
// dither on, the PSX matrix offsets each pixel by a fraction of the palette's
// typical colour spacing before matching.
export function quantizeToPalette(img, hexColors, dither, strength = 1) {
  const pal = hexColors.map(hexToRgb);
  const { data, width: W } = img;
  const out = new Uint8ClampedArray(data.length);
  const spread = strength * 255 / Math.max(2, Math.cbrt(pal.length) * 2);
  const cache = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const p = i / 4, x = p % W, y = (p / W) | 0;
    const d = dither ? (PSX_DITHER[y & 3][x & 3] + 0.5) / 8 * spread : 0;
    const r = clamp(data[i] + d), g = clamp(data[i + 1] + d), b = clamp(data[i + 2] + d);
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      best = 0;
      let bestD = Infinity;
      for (let k = 0; k < pal.length; k++) {
        const dist = redmean(r, g, b, pal[k]);
        if (dist < bestD) { bestD = dist; best = k; }
      }
      cache.set(key, best);
    }
    out[i] = pal[best][0]; out[i + 1] = pal[best][1]; out[i + 2] = pal[best][2]; out[i + 3] = data[i + 3];
  }
  return { ...img, data: out };
}

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

function redmean(r, g, b, [pr, pg, pb]) {
  const rm = (r + pr) / 2;
  const dr = r - pr, dg = g - pg, db = b - pb;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export function countColors(img) {
  const set = new Set();
  const { data } = img;
  for (let i = 0; i < data.length; i += 4) set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  return set.size;
}
