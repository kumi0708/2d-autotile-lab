// =============================================================
//  art.js — 手続き的ピクセルアート生成 (純粋関数, RGBA配列を返す)
//  Procedural pixel-art. Returns raw RGBA buffers (no DOM) so Node can test it.
//
//  核となるアイデア: 全タイルを「ミニタイル(16x16) × 5種 × 4向き」から作る。
//  各ミニタイルは符号付き距離 d(px) を解析的に計算し、d の帯ごとに
//  草・縁・崖・砂浜・波 を塗り分ける。距離関数はセル境界で連続なので継ぎ目が出ない。
// =============================================================
import { Q, QUARTER_SRC, QUARTER_PREVIEW } from './autotile.js';
import { pfbm, pnoise, hash2, clamp, smooth, mix, mixc, hex } from './noise.js';

export const T = 32;      // tile size (px)
export const H = T / 2;   // minitile size
export const MARGIN = 7;  // 地形の縁はセル境界から7px内側 (この帯に崖・砂・波を描く)
export const FRAMES = 6;  // tile animation frames (foam / glow)

// ---------------------------------------------------------------
//  Themes
// ---------------------------------------------------------------
export const THEMES = {
  meadow: {
    top: ['#3f8f3a', '#5fb043', '#8fd05a'], blade: '#2f6e2f', flower: ['#ffe066', '#ff8fb1', '#ffffff'],
    rim: '#2b5a26', hi: '#b6ec7a', cliff: ['#8a5a36', '#6b4226', '#4a2c18'], sand: '#e9d39a',
    foam: '#ffffff', water: ['#1d5f9e', '#2a7fc1', '#56b6e8'], shallow: '#7fd3e6', decor: 'meadow',
  },
  snow: {
    top: ['#c9d8e8', '#e6eef7', '#ffffff'], blade: '#b3c6da', flower: ['#9fd8ff', '#ffffff', '#d6e9ff'],
    rim: '#7e93ab', hi: '#ffffff', cliff: ['#7f9db8', '#5d7894', '#3d536b'], sand: '#dfeaf4',
    foam: '#f4fbff', water: ['#14324f', '#1f4c72', '#3f7aa3'], shallow: '#9cc6e0', decor: 'snow',
  },
  volcano: {
    top: ['#2c2626', '#3c3434', '#544646'], blade: '#1d1818', flower: ['#ff7a2a', '#ffb347', '#ff4d2a'],
    rim: '#120e0e', hi: '#7a6262', cliff: ['#4a2a24', '#341c18', '#1e0f0c'], sand: '#5a2416',
    foam: '#ffd36a', water: ['#a3220c', '#e2531a', '#ffb03a'], shallow: '#ff8a2a', decor: 'volcano', glow: true,
  },
  dungeon: {
    top: ['#55506a', '#6a6584', '#827ca0'], blade: '#3f3b52', flower: ['#7cf0d0', '#c58cff', '#ffffff'],
    rim: '#24212f', hi: '#a7a1c7', cliff: ['#4b4560', '#383349', '#221f2e'], sand: '#2b2838',
    foam: '#8f7cff', water: ['#07060d', '#100d1c', '#2a1f4a'], shallow: '#3a2d6a', decor: 'dungeon', brick: true,
  },
};
for (const t of Object.values(THEMES)) {
  for (const k in t) {
    if (typeof t[k] === 'string' && t[k][0] === '#') t[k] = hex(t[k]);
    else if (Array.isArray(t[k]) && typeof t[k][0] === 'string') t[k] = t[k].map(hex);
  }
}

// ---------------------------------------------------------------
//  Signed distance of a minitile (in px, >0 = inside terrain)
//  (u,w): 0 = cell centre, 1 = quadrant's outer corner, in quadrant units.
// ---------------------------------------------------------------
const B = 1 - MARGIN / H;      // half-size of the terrain box
const R = 0.55;                // outer-corner radius (quadrant units)

export function quadDist(type, u, w) {
  switch (type) {
    case Q.FULL: return 99;
    case Q.EDGE_H: return (B - w) * H;            // 横に繋がる → 縦方向の縁
    case Q.EDGE_V: return (B - u) * H;
    case Q.INNER: return (Math.hypot(1 - u, 1 - w) - (1 - B)) * H;
    case Q.OUTER: {
      const qx = u - (B - R), qy = w - (B - R);
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
      return -out * H;
    }
  }
  return -99;
}

/** pixel (tx,ty) inside a 32px tile, quadrant orient → local (u,w) */
function localUW(tx, ty, orient) {
  const cx = tx + 0.5 - H, cy = ty + 0.5 - H;   // relative to cell centre
  const right = orient === 1 || orient === 2, bottom = orient === 2 || orient === 3;
  return [(right ? cx : -cx) / H, (bottom ? cy : -cy) / H];
}

function distAt(type, orient, tx, ty) {
  const [u, w] = localUW(tx, ty, orient);
  // 境界をゆらすノイズ (タイル周期) / organic wobble, periodic in T
  const wob = (pfbm(tx, ty, T, 8, 2, 3) - 0.5) * 2.6;
  return quadDist(type, u, w) + wob;
}

// ---------------------------------------------------------------
//  Shader: d-band → colour
// ---------------------------------------------------------------
const BAND = { top: [96, 176, 67], rim: [30, 60, 30], cliff: [140, 90, 54], sand: [233, 211, 154], foam: [255, 255, 255], shallow: [127, 211, 230] };
function heat(d) {
  // 符号付き距離の可視化: 内側=緑系, 外側=青系, 等高線つき
  const k = clamp(Math.abs(d) / 12), line = Math.abs(d % 2) < 0.35;
  const c = d > 0 ? mixc([255, 240, 160], [40, 140, 60], k) : mixc([255, 200, 160], [30, 50, 120], k);
  return line ? [...mixc(c, [0, 0, 0], 0.35), 255] : [...c, 255];
}

function shade(th, type, orient, tx, ty, frame, mode) {
  const d = distAt(type, orient, tx, ty);
  if (mode === 'dist') return heat(d);
  const flat = k => (mode === 'bands' ? [...BAND[k], 255] : null);
  // inward gradient (finite differences, same analytic field → seamless)
  const gx = distAt(type, orient, tx + 1, ty) - distAt(type, orient, tx - 1, ty);
  const gy = distAt(type, orient, tx, ty + 1) - distAt(type, orient, tx, ty - 1);
  const gl = Math.hypot(gx, gy) || 1;
  const ox = -gx / gl, oy = -gy / gl;            // outward normal
  const lit = ox * -0.6 + oy * -0.8;              // light from top-left
  const n1 = pfbm(tx, ty, T, 16, 3, 11);
  const ph = (frame / FRAMES) * Math.PI * 2;

  if (d > 0) {
    // ---------- top surface ----------
    let c;
    if (th.brick) {
      // 石畳: 16pxのレンガ (タイル周期)
      const row = Math.floor(ty / 8), off = (row % 2) * 8;
      const bx = (tx + off) % 16, by = ty % 8;
      const id = hash2(Math.floor((tx + off) / 16) % 2, row % 4, 5);
      c = mixc(th.top[0], th.top[2], 0.25 + id * 0.5 + (n1 - 0.5) * 0.4);
      if (bx === 0 || by === 0) c = th.blade;
      else if (bx === 1 || by === 1) c = mixc(c, th.hi, 0.25);
    } else {
      const t = clamp(n1 * 1.4 - 0.2);
      c = t < 0.5 ? mixc(th.top[0], th.top[1], t * 2) : mixc(th.top[1], th.top[2], (t - 0.5) * 2);
      // 草の葉 (ディザ) / grass blades
      const hb = hash2(tx, ty, 7);
      if (hb < 0.16) c = mixc(c, th.blade, 0.55);
      else if (hb > 0.93) c = mixc(c, th.hi, 0.45);
      // 小さな花 / tiny flowers on the deep interior
      if (d > 7 && hash2(tx >> 1, ty >> 1, 21) > 0.985) c = th.flower[Math.floor(hash2(tx, ty, 3) * 3)];
    }
    if (mode === 'bands') return flat(d < 1.2 ? 'rim' : 'top');
    // 縁の陰影 / bevel & outline
    if (d < 1.2) c = th.rim;
    else if (d < 3.2 && lit > 0.25) c = mixc(c, th.hi, 0.55 * lit);
    else if (d < 3.5 && lit < -0.3) c = mixc(c, th.rim, 0.35);
    // 内側ほど少し明るい (AO風)
    c = mixc(th.rim, c, 0.82 + 0.18 * smooth(0, 10, d));
    return [c[0], c[1], c[2], 255];
  }

  // ---------- outside: cliff → sand → foam → shallow water ----------
  const t = -d;
  const south = smooth(0.15, 0.85, oy);             // 下向きの縁だけ崖を出す
  const cliffH = 3.6 * south;
  if (t < cliffH) {
    if (mode === 'bands') return flat('cliff');
    const k = t / Math.max(cliffH, 0.001);
    let c = k < 0.33 ? th.cliff[0] : k < 0.75 ? th.cliff[1] : th.cliff[2];
    if (hash2(tx, ty, 9) < 0.2) c = mixc(c, th.cliff[2], 0.5);
    c = mixc(c, th.cliff[2], clamp(-ox * 0.4 + 0.2) * 0.6);
    if (th.glow) c = mixc(c, th.foam, smooth(0.5, 1, k) * 0.6);
    return [c[0], c[1], c[2], 255];
  }
  const s = t - cliffH;
  if (s < 1.6) {
    if (mode === 'bands') return flat('sand');
    const c = mixc(th.sand, th.cliff[0], hash2(tx, ty, 4) < 0.25 ? 0.3 : 0);
    return [c[0], c[1], c[2], 255];
  }
  // 波打ち際: フレームごとに寄せては返す / animated foam line
  const fp = 2.4 + (0.5 + 0.5 * Math.sin(ph + pnoise(tx / 8, ty / 8, T / 8, 8) * 6.28)) * 1.8;
  if (Math.abs(s - fp) < 0.75 && hash2(tx, ty, frame + 30) > 0.12) {
    if (mode === 'bands') return flat('foam');
    return [th.foam[0], th.foam[1], th.foam[2], th.glow ? 255 : 235];
  }
  const fade = 1 - smooth(1.6, MARGIN - cliffH - 0.2, s);
  if (fade <= 0) return [0, 0, 0, 0];
  if (mode === 'bands') return [...BAND.shallow, Math.round(fade * 200)];
  const c = th.shallow;
  return [c[0], c[1], c[2], Math.round(fade * (th.glow ? 200 : 150))];
}

// ---------------------------------------------------------------
//  Buffers
// ---------------------------------------------------------------
export function makeBuf(w, h) { return { w, h, data: new Uint8ClampedArray(w * h * 4) }; }
function blit(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((sy + y) * src.w + sx + x) * 4, di = ((dy + y) * dst.w + dx + x) * 4;
    dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
    dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
  }
}

/**
 * minitile atlas: 5 types × 4 orientations, each 16x16. Layout: col = orient, row = type.
 * 各ミニタイルは「32pxタイル内の自分の象限の座標」で描くので、組み合わせてもノイズが連続する。
 */
export function genMiniAtlas(theme, frame, mode) {
  const th = THEMES[theme];
  const buf = makeBuf(H * 4, H * 5);
  for (let type = 0; type < 5; type++) for (let o = 0; o < 4; o++) {
    const ox = (o === 1 || o === 2) ? H : 0, oy = (o === 2 || o === 3) ? H : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
      const c = shade(th, type, o, ox + x, oy + y, frame, mode);
      const i = ((type * H + y) * buf.w + o * H + x) * 4;
      buf.data[i] = c[0]; buf.data[i + 1] = c[1]; buf.data[i + 2] = c[2]; buf.data[i + 3] = c[3];
    }
  }
  return buf;
}

const quadOffset = o => [(o === 1 || o === 2) ? H : 0, (o === 2 || o === 3) ? H : 0];

/** compose one 32px tile from its 4 quads into dst at (dx,dy) */
export function composeTile(dst, atlas, quads, dx, dy, displayShift = false) {
  quads.forEach((q, pos) => {
    if (!q) return;
    const [qx, qy] = quadOffset(displayShift ? pos : q.orient);
    blit(dst, atlas, q.orient * H, q.type * H, H, H, dx + qx, dy + qy);
  });
}

/** Tile sheet for a method (cell / dual) or the quarter source sheet */
export function genSheet(method, atlas) {
  if (method.grid === 'quarter') {
    const buf = makeBuf(H * 4, H * 6);
    for (let type = 0; type < 5; type++) for (let o = 0; o < 4; o++) {
      const [c, r] = QUARTER_SRC[type][o];
      blit(buf, atlas, o * H, type * H, H, H, c * H, r * H);
    }
    for (const [c, r, type, o] of QUARTER_PREVIEW) blit(buf, atlas, o * H, type * H, H, H, c * H, r * H);
    return buf;
  }
  const buf = makeBuf(method.cols * T, method.rows * T);
  for (const tile of method.tiles) composeTile(buf, atlas, tile.quads, tile.pos[0] * T, tile.pos[1] * T, method.grid === 'dual');
  return buf;
}

// ---------------------------------------------------------------
//  Animated background (water / lava / void), periodic 64px, loops
// ---------------------------------------------------------------
export const BG = 128, BG_FRAMES = 32;
export function genBackground(theme, frame) {
  const th = THEMES[theme];
  const buf = makeBuf(BG, BG);
  const sh = (frame / BG_FRAMES) * BG;                 // moves one full period per loop
  const ph = (frame / BG_FRAMES) * Math.PI * 2;
  for (let y = 0; y < BG; y++) for (let x = 0; x < BG; x++) {
    const a = pfbm(x + sh, y + sh, BG, 32, 3, 1);
    const b = pfbm(x, y - sh, BG, 32, 3, 2);
    const v = (a + b) / 2;
    let c;
    if (th.glow) {
      // 溶岩: 2層ノイズの差が小さい所が明るい亀裂
      const crack = 1 - smooth(0, 0.09, Math.abs(a - b));
      c = mixc(th.water[0], th.water[1], smooth(0.3, 0.7, v));
      c = mixc(c, th.water[2], crack * (0.75 + 0.25 * Math.sin(ph + x * 0.2)));
    } else if (th.brick) {
      // 奈落: 暗い霧 + 瞬く星屑
      c = mixc(th.water[0], th.water[2], smooth(0.45, 0.9, v) * 0.7);
      const st = hash2(x, y, 77);
      if (st > 0.992) c = mixc(c, th.foam, 0.5 + 0.5 * Math.sin(ph * 2 + st * 900));
    } else {
      // 水: 2層の流れるノイズ + 細い波頭 + まばらな光の反射
      c = mixc(th.water[0], th.water[1], smooth(0.3, 0.72, v));
      const w2 = pfbm(x * 2 + sh * 2, y * 2 + sh, BG, 32, 2, 3);
      const ridge = 1 - smooth(0, 0.035, Math.abs(a - b + 0.03 * Math.sin(ph)));
      c = mixc(c, th.water[2], ridge * 0.45 * smooth(0.45, 0.6, w2));
      if (ridge > 0.85 && hash2(x, y, frame) > 0.88) c = mixc(c, [255, 255, 255], 0.65);
    }
    const i = (y * BG + x) * 4;
    buf.data[i] = c[0]; buf.data[i + 1] = c[1]; buf.data[i + 2] = c[2]; buf.data[i + 3] = 255;
  }
  return buf;
}

// ---------------------------------------------------------------
//  Decoration sprites (procedural, per-pixel)
// ---------------------------------------------------------------
function sprite(w, h, fn) {
  const buf = makeBuf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y);
    if (!c) continue;
    const i = (y * w + x) * 4;
    buf.data[i] = c[0]; buf.data[i + 1] = c[1]; buf.data[i + 2] = c[2]; buf.data[i + 3] = c[3] ?? 255;
  }
  return buf;
}
const SHADOW = [0, 20, 30, 90];
function blobShade(dx, dy, r, cols, outline, seed) {
  // 球状の陰影 (左上から光) / spherical shading
  const dd = Math.hypot(dx, dy) / r;
  if (dd > 1) return null;
  if (dd > 0.86) return outline;
  const l = clamp(0.55 - (dx * -0.55 + dy * -0.75) / r * 0.6 + (hash2(Math.round(dx), Math.round(dy), seed) - 0.5) * 0.25);
  return l < 0.33 ? cols[2] : l < 0.66 ? cols[1] : cols[0];
}

export function genDecor(theme) {
  const k = THEMES[theme].decor;
  const out = { big: [], small: [] };
  const H_ = hex;
  if (k === 'meadow') {
    const leaf = [H_('#8fdc5a'), H_('#4fa63a'), H_('#2c6e2c')], ol = H_('#1b3f1d');
    out.big.push(sprite(32, 44, (x, y) => {
      if (y > 38 && Math.hypot((x - 16) / 11, (y - 40.5) / 3) < 1) return SHADOW;
      if (x >= 14 && x <= 17 && y >= 26 && y <= 40) return x === 14 ? H_('#3b2414') : y > 38 ? H_('#3b2414') : H_('#7a4a2a');
      const c1 = blobShade(x - 16, y - 16, 13, leaf, ol, 1);
      const c2 = blobShade(x - 10, y - 21, 8, leaf, ol, 2), c3 = blobShade(x - 22, y - 21, 8, leaf, ol, 3);
      const c = c1 || c2 || c3;
      if (c && c !== ol && hash2(x, y, 44) > 0.985) return H_('#ff5a5a'); // 実 / fruit
      return c;
    }));
    out.big.push(sprite(32, 36, (x, y) => {
      if (y > 30 && Math.hypot((x - 16) / 10, (y - 32) / 3) < 1) return SHADOW;
      return blobShade(x - 16, y - 23, 9, leaf, ol, 5) || blobShade(x - 10, y - 26, 6, leaf, ol, 6) || blobShade(x - 22, y - 26, 6, leaf, ol, 7);
    }));
    const rock = [H_('#d6d2c4'), H_('#9e998a'), H_('#6a6658')];
    out.small.push(sprite(16, 16, (x, y) => (y > 12 && Math.hypot((x - 8) / 6, y - 13) < 1.5 ? SHADOW : blobShade((x - 8) * 1.1, (y - 9) * 1.5, 6, rock, H_('#3d3a32'), 9))));
    out.small.push(sprite(16, 16, (x, y) => {
      const stem = x === 8 && y > 7 && y < 14;
      if (stem) return H_('#2f6e2f');
      const p = Math.hypot(x - 8, y - 6);
      if (p < 1.2) return H_('#ffcf3a');
      if (p < 3.2 && ((Math.atan2(y - 6, x - 8) * 5 / Math.PI) & 1)) return H_('#ffffff');
      if (p < 3.2) return H_('#ffe1ef');
      return null;
    }));
  } else if (k === 'snow') {
    out.big.push(sprite(32, 44, (x, y) => {
      if (y > 39 && Math.hypot((x - 16) / 9, (y - 41) / 2.5) < 1) return SHADOW;
      if (x >= 15 && x <= 16 && y >= 36 && y <= 41) return H_('#5a3a22');
      for (let i = 0; i < 3; i++) {
        const top = 4 + i * 10, bot = top + 16, half = 4 + i * 3.5;
        if (y >= top && y <= bot) {
          const wdt = (y - top) / (bot - top) * half * 2;
          const dx = x + 0.5 - 16;
          if (Math.abs(dx) <= wdt / 2) {
            const edge = Math.abs(dx) > wdt / 2 - 1.2 || y === bot;
            if (y - top < 4 + (hash2(x, i, 2) * 3 | 0)) return edge ? H_('#9fb6cc') : H_('#ffffff');
            if (edge) return H_('#0f3326');
            return dx < 0 ? H_('#2f7a55') : H_('#1d5a3f');
          }
        }
      }
      return null;
    }));
    const ice = [H_('#f2fbff'), H_('#a9dcf5'), H_('#5fa6d6')];
    out.small.push(sprite(16, 16, (x, y) => {
      const a = Math.abs(x + 0.5 - 8), b = 15 - y;
      if (b > 0 && a < (12 - Math.abs(b - 7)) * 0.4 && b < 13) return a < 1 ? ice[0] : (x < 8 ? ice[1] : ice[2]);
      return null;
    }));
    out.small.push(sprite(16, 16, (x, y) => blobShade((x - 8) * 1.1, (y - 10) * 1.6, 6, [H_('#ffffff'), H_('#d7e6f2'), H_('#9fb4c8')], H_('#5e7186'), 4)));
  } else if (k === 'volcano') {
    out.big.push(sprite(32, 40, (x, y) => {
      if (y > 34 && Math.hypot((x - 16) / 10, (y - 36) / 3) < 1) return SHADOW;
      // 黒曜石の結晶 / obsidian crystal cluster with lava glow
      const spikes = [[16, 6, 4], [10, 14, 3], [22, 12, 3]];
      for (const [sx, sy, w] of spikes) {
        if (y >= sy && y <= 36) {
          const half = w * (y - sy) / (36 - sy) + 0.5;
          const dx = x + 0.5 - sx;
          if (Math.abs(dx) < half) {
            const glow = y > 30 ? H_('#ff7a2a') : null;
            if (Math.abs(dx) > half - 1) return H_('#0b0909');
            if (glow && hash2(x, y, 3) > 0.4) return glow;
            return dx < 0 ? H_('#5a4b5e') : H_('#2a2230');
          }
        }
      }
      return null;
    }));
    const rk = [H_('#6a5a5a'), H_('#3d3333'), H_('#211b1b')];
    out.small.push(sprite(16, 16, (x, y) => {
      const c = blobShade((x - 8) * 1.1, (y - 9) * 1.5, 6, rk, H_('#0b0909'), 8);
      if (c && c !== rk[0] && hash2(x, y, 6) > 0.9) return H_('#ff9a3a');
      return c;
    }));
    out.small.push(sprite(16, 16, (x, y) => (Math.hypot(x - 8, y - 9) < 2.2 ? H_('#ffcf6a') : Math.hypot(x - 8, y - 9) < 3.4 ? [255, 120, 40, 160] : null)));
  } else {
    // dungeon: pillar + crystal + bones
    out.big.push(sprite(32, 44, (x, y) => {
      if (y > 39 && Math.hypot((x - 16) / 10, (y - 41) / 2.5) < 1) return SHADOW;
      if (x >= 9 && x <= 22 && y >= 4 && y <= 40) {
        const cap = y < 9 || y > 35;
        if (cap) { if (x === 9 || x === 22 || y === 4 || y === 40) return H_('#1c1a26'); return x < 15 ? H_('#a7a1c7') : H_('#6a6584'); }
        if (x < 11 || x > 20) return null;
        if (x === 11 || x === 20) return H_('#1c1a26');
        const crack = hash2(x, y >> 2, 13) > 0.92;
        if (crack) return H_('#2b2838');
        return x < 14 ? H_('#9590b5') : x < 17 ? H_('#7a7598') : H_('#55506a');
      }
      return null;
    }));
    out.small.push(sprite(16, 16, (x, y) => {
      const a = Math.abs(x + 0.5 - 8), b = 14 - y;
      if (b >= 0 && b < 12 && a < (6 - Math.abs(b - 5)) * 0.7) return a < 0.8 ? H_('#e6ffff') : x < 8 ? H_('#7cf0d0') : H_('#2fa58a');
      if (Math.hypot(x - 8, y - 9) < 7) return [124, 240, 208, 40];
      return null;
    }));
    out.small.push(sprite(16, 16, (x, y) => {
      const bone = (y === 10 && x > 3 && x < 12) || (Math.hypot(x - 4, y - 10) < 1.6) || (Math.hypot(x - 12, y - 10) < 1.6);
      if (bone) return H_('#e8e2cc');
      if (Math.hypot(x - 9, y - 6) < 2.6) return y > 6 && (x === 8 || x === 10) ? H_('#1c1a26') : H_('#f4efdc');
      return null;
    }));
  }
  return out;
}
