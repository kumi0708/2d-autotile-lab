// 周期ノイズ: タイル境界で継ぎ目が出ないよう、全ノイズはタイル幅で周期的
// Periodic (tileable) noise so tile edges always match their neighbours.

export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;
const fade = t => t * t * (3 - 2 * t);

/** value noise with integer lattice period `period` (in lattice cells) */
export function pnoise(x, y, period, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const x0 = mod(ix, period), x1 = mod(ix + 1, period);
  const y0 = mod(iy, period), y1 = mod(iy + 1, period);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * fBm. px,py are pixel coords; `size` = period in pixels; `cell` = base lattice size in px.
 * size must be divisible by cell * 2^(octaves-1).
 */
export function pfbm(px, py, size, cell, octaves = 3, seed = 0) {
  let sum = 0, amp = 0.5, norm = 0, c = cell;
  for (let o = 0; o < octaves; o++) {
    const period = Math.max(1, Math.round(size / c));
    sum += amp * pnoise(px / c, py / c, period, seed + o * 17);
    norm += amp; amp *= 0.5; c /= 2;
  }
  return sum / norm;
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const mixc = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
export const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
