// マップ生成プリセット / map presets
import { Grid } from './autotile.js';
import { pnoise, hash2 } from './noise.js';

function smoothPass(g) {
  // セルオートマトンで形を整える / cellular-automata smoothing
  const o = g.clone();
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += g.get(x + dx, y + dy);
    o.set(x, y, n > 4 ? 1 : n < 4 ? 0 : g.get(x, y));
  }
  return o;
}

export function islands(w, h, seed = Math.random() * 1e6 | 0) {
  // 陸の割合が 38〜60% になるシードを探す / retry until land ratio looks good
  for (let i = 0; i < 60; i++) {
    const g = islandsRaw(w, h, seed + i * 101);
    const r = g.data.reduce((a, b) => a + b, 0) / g.data.length;
    if (r > 0.38 && r < 0.6) return g;
  }
  return islandsRaw(w, h, seed);
}

function islandsRaw(w, h, seed) {
  // 2オクターブのノイズ + 外周を下げて複数の島を作る / several islands
  let g = new Grid(w, h);
  const ox = (seed % 1000) * 3.7, oy = (seed % 777) * 2.3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = pnoise(x / 4.2 + ox, y / 4.2 + oy, 9999, seed) * 0.72 + pnoise(x / 1.8 + ox, y / 1.8 + oy, 9999, seed + 1) * 0.28;
    const ex = Math.min(x, w - 1 - x) / 3, ey = Math.min(y, h - 1 - y) / 3;
    const fall = Math.min(1, ex, ey);
    g.set(x, y, n * (0.55 + 0.45 * fall) > 0.47);
  }
  return smoothPass(g);
}

export function lake(w, h, seed = Math.random() * 1e6 | 0) {
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2 + 0.5) / (w * 0.32), dy = (y - h / 2 + 0.5) / (h * 0.3);
    const r = Math.hypot(dx, dy) + (pnoise(x / 3, y / 3, 9999, seed) - 0.5) * 0.5;
    const pond = hash2(x >> 2, y >> 2, seed) > 0.93;
    g.set(x, y, !(r < 1) && !pond);
  }
  return smoothPass(g);
}

export function rooms(w, h, seed = Math.random() * 1e6 | 0) {
  // 部屋 + 通路 (ダンジョン向け) / rooms joined by corridors
  const g = new Grid(w, h);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const centers = [];
  for (let i = 0; i < 7; i++) {
    const rw = 3 + (rnd() * 5 | 0), rh = 3 + (rnd() * 4 | 0);
    const rx = 1 + (rnd() * (w - rw - 2) | 0), ry = 1 + (rnd() * (h - rh - 2) | 0);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) g.set(x, y, 1);
    centers.push([rx + (rw >> 1), ry + (rh >> 1)]);
  }
  for (let i = 1; i < centers.length; i++) {
    const [ax, ay] = centers[i - 1], [bx, by] = centers[i];
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) g.set(x, ay, 1);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) g.set(bx, y, 1);
  }
  return g;
}

/** 全ケースを含むテストパターン: 内角・斜め接続・1マス孤島・細い線 */
export function testPattern(w, h) {
  const g = new Grid(w, h);
  const rect = (x0, y0, x1, y1, v = 1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y, v); };
  rect(1, 1, 7, 6); rect(4, 3, 4, 3, 0); rect(6, 5, 7, 6, 0);          // hole + notch (inner corners)
  rect(9, 1, 9, 6); rect(10, 3, 13, 3);                                  // thin lines, T-junction
  g.set(15, 1, 1); g.set(16, 2, 1); g.set(17, 3, 1); g.set(15, 3, 1);   // diagonal-only links
  rect(19, 1, 24, 5); rect(20, 2, 23, 4, 0); g.set(21, 3, 1);           // ring with island
  rect(1, 8, 12, 12); rect(3, 10, 4, 10, 0); rect(7, 9, 7, 11, 0); rect(10, 8, 12, 9, 0);
  rect(14, 8, 24, 12); for (let x = 15; x <= 23; x += 2) g.set(x, 10, 0);
  return g;
}

export const PRESETS = { islands, lake, rooms, test: testPattern };
