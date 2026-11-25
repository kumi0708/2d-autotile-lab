// =============================================================
//  autotile.js — 純粋なオートタイル判定ロジック (DOM非依存)
//  Pure autotile logic. No DOM, usable from Node tests.
// =============================================================

/** 8方向オフセット / 8-neighbour offsets (screen coords: +y = down) */
export const DIR = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1],
  S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

/**
 * ミニタイル(1/4タイル)の種類 / quarter-tile ("minitile") kinds.
 * 1セルを4分割し、各象限は「横の隣・縦の隣・斜めの隣」の3セルだけで形が決まる。
 */
export const Q = { OUTER: 0, EDGE_H: 1, EDGE_V: 2, INNER: 3, FULL: 4 };
export const Q_NAMES = ['outer', 'edge-h', 'edge-v', 'inner', 'full'];

/** 象限 / quadrant orientation: 0=TL 1=TR 2=BR 3=BL */
export const QUAD = [
  { h: 'W', v: 'N', d: 'NW' }, // TL
  { h: 'E', v: 'N', d: 'NE' }, // TR
  { h: 'E', v: 'S', d: 'SE' }, // BR
  { h: 'W', v: 'S', d: 'SW' }, // BL
];

/** (横, 縦, 斜め) → ミニタイル種別 */
export function quadType(h, v, d) {
  if (!h && !v) return Q.OUTER;   // 外角 / outer corner
  if (h && !v) return Q.EDGE_H;   // 横に繋がる＝上下どちらかが縁 / horizontal run
  if (!h && v) return Q.EDGE_V;   // 縦に繋がる / vertical run
  return d ? Q.FULL : Q.INNER;    // 両方繋がる: 斜めが空なら内角 / inner corner
}

// ---------------------------------------------------------------
//  Grid helper
// ---------------------------------------------------------------
export class Grid {
  constructor(w, h, data) {
    this.w = w; this.h = h;
    this.data = data || new Uint8Array(w * h);
  }
  get(x, y) {
    // 画面外は「同じ地形が続く」扱いにすると縁が切れない。ここでは空扱い。
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = v ? 1 : 0;
  }
  n(x, y, dir) { const o = DIR[dir]; return this.get(x + o[0], y + o[1]); }
  clone() { return new Grid(this.w, this.h, this.data.slice()); }
}

// ---------------------------------------------------------------
//  1) 4-bit edge bitmask (16 tiles)
//     mask = N·1 + E·2 + S·4 + W·8
// ---------------------------------------------------------------
export const BITS4 = { N: 1, E: 2, S: 4, W: 8 };

export function mask4(g, x, y) {
  let m = 0;
  for (const k in BITS4) if (g.n(x, y, k)) m |= BITS4[k];
  return m;
}

function quadsFromMask4(m) {
  // 斜め情報が無いので「斜めは常に埋まっている」と仮定する → 内角が描けない
  return QUAD.map(q => quadType(!!(m & BITS4[q.h]), !!(m & BITS4[q.v]), true));
}

// ---------------------------------------------------------------
//  2) 8-bit blob bitmask (256 → 47 tiles)
//     N1 NE2 E4 SE8 S16 SW32 W64 NW128
//     角ビットは隣接する2辺が両方立っている時だけ有効
// ---------------------------------------------------------------
export const BITS8 = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 };
const CORNER_REQ = { NE: ['N', 'E'], SE: ['S', 'E'], SW: ['S', 'W'], NW: ['N', 'W'] };

export function reduce8(raw) {
  let m = raw;
  for (const c in CORNER_REQ) {
    const [a, b] = CORNER_REQ[c];
    if (!((raw & BITS8[a]) && (raw & BITS8[b]))) m &= ~BITS8[c];
  }
  return m;
}

export function rawMask8(g, x, y) {
  let m = 0;
  for (const k in BITS8) if (g.n(x, y, k)) m |= BITS8[k];
  return m;
}
export const mask8 = (g, x, y) => reduce8(rawMask8(g, x, y));

/** 256通りを縮約した47種のマスク(昇順) / the 47 canonical masks */
export const BLOB_MASKS = [...new Set(Array.from({ length: 256 }, (_, i) => reduce8(i)))].sort((a, b) => a - b);
export const BLOB_INDEX = new Map(BLOB_MASKS.map((m, i) => [m, i]));

function quadsFromMask8(m) {
  return QUAD.map(q => quadType(!!(m & BITS8[q.h]), !!(m & BITS8[q.v]), !!(m & BITS8[q.d])));
}

// ---------------------------------------------------------------
//  3) Dual-grid / corner (15 + 1 empty)
//     表示タイルは半マスずれた格子に置き、4隅のワールドセルを見る
//     mask = TL·1 + TR·2 + BR·4 + BL·8
// ---------------------------------------------------------------
export const BITSC = { TL: 1, TR: 2, BR: 4, BL: 8 };

/** 表示タイル(i,j)は ワールドセル (i-1,j-1),(i,j-1),(i,j),(i-1,j) の中央を4隅に持つ */
export function maskDual(g, i, j) {
  return (g.get(i - 1, j - 1) ? 1 : 0) | (g.get(i, j - 1) ? 2 : 0) |
         (g.get(i, j) ? 4 : 0) | (g.get(i - 1, j) ? 8 : 0);
}

/**
 * 表示タイルの各象限は「ある1つのワールドセルの、ある象限」と一致する。
 * 例: 表示タイルの左上象限 = 左上ワールドセルの右下象限。
 * よって 4隅の情報だけで 47-blob と完全に同じ見た目を再現できる。
 */
function quadsFromDual(m) {
  const TL = !!(m & 1), TR = !!(m & 2), BR = !!(m & 4), BL = !!(m & 8);
  // [solid?, h, v, d, orientation-of-the-world-cell-quadrant]
  const spec = [
    [TL, TR, BL, BR, 2], // display TL  = cell TL's BR quadrant
    [TR, TL, BR, BL, 3], // display TR  = cell TR's BL quadrant
    [BR, BL, TR, TL, 0], // display BR  = cell BR's TL quadrant
    [BL, BR, TL, TR, 1], // display BL  = cell BL's TR quadrant
  ];
  return spec.map(([s, h, v, d, o]) => (s ? { type: quadType(h, v, d), orient: o } : null));
}

/** 4x4シートの並び (5x5の小島から切り出した配置。左下が空タイル) */
export const DUAL_LAYOUT = [
  [5, 12, 8, 2],
  [14, 15, 9, 4],
  [3, 7, 13, 10],
  [0, 6, 11, 1],
];

// ---------------------------------------------------------------
//  4) Quarter tiles / minitiles (RPG-Maker "A2" style: 20 pieces)
//     ソースは 2x3タイル(=4x6ミニタイル)。各象限を個別に選んで合成する
// ---------------------------------------------------------------
/** minitile source location (col,row in 16px units) for [type][orient] */
export const QUARTER_SRC = (() => {
  const t = Array.from({ length: 5 }, () => new Array(4));
  // inner corners: top-right tile (cols 2-3, rows 0-1)
  t[Q.INNER][0] = [2, 0]; t[Q.INNER][1] = [3, 0]; t[Q.INNER][3] = [2, 1]; t[Q.INNER][2] = [3, 1];
  // 2x2 island block (rows 2-5)
  t[Q.OUTER][0] = [0, 2]; t[Q.OUTER][1] = [3, 2]; t[Q.OUTER][3] = [0, 5]; t[Q.OUTER][2] = [3, 5];
  t[Q.EDGE_H][1] = [1, 2]; t[Q.EDGE_H][0] = [2, 2]; t[Q.EDGE_H][2] = [1, 5]; t[Q.EDGE_H][3] = [2, 5];
  t[Q.EDGE_V][3] = [0, 3]; t[Q.EDGE_V][2] = [3, 3]; t[Q.EDGE_V][0] = [0, 4]; t[Q.EDGE_V][1] = [3, 4];
  t[Q.FULL][2] = [1, 3]; t[Q.FULL][3] = [2, 3]; t[Q.FULL][1] = [1, 4]; t[Q.FULL][0] = [2, 4];
  return t;
})();
/** preview tile (cols 0-1, rows 0-1) = isolated island, 4 outer corners */
export const QUARTER_PREVIEW = [[0, 0, Q.OUTER, 0], [1, 0, Q.OUTER, 1], [1, 1, Q.OUTER, 2], [0, 1, Q.OUTER, 3]];

export function quadsAt(g, x, y) {
  return QUAD.map(q => quadType(!!g.n(x, y, q.h), !!g.n(x, y, q.v), !!g.n(x, y, q.d)));
}

// ---------------------------------------------------------------
//  Method table
//  tile.quads: 長さ4 (TL,TR,BR,BL)。要素は {type, orient} か null(空)
// ---------------------------------------------------------------
const withOrient = qs => qs.map((type, o) => ({ type, orient: o }));

export const METHODS = {
  edge16: {
    id: 'edge16', grid: 'cell', cols: 4, rows: 4,
    tiles: Array.from({ length: 16 }, (_, m) => ({ index: m, mask: m, quads: withOrient(quadsFromMask4(m)), pos: [m % 4, m >> 2] })),
    tileAt(g, x, y) { const m = mask4(g, x, y); return { mask: m, index: m }; },
  },
  blob47: {
    id: 'blob47', grid: 'cell', cols: 8, rows: 6,
    tiles: BLOB_MASKS.map((m, i) => ({ index: i, mask: m, quads: withOrient(quadsFromMask8(m)), pos: [i % 8, i >> 3] })),
    tileAt(g, x, y) { const raw = rawMask8(g, x, y); const m = reduce8(raw); return { raw, mask: m, index: BLOB_INDEX.get(m) }; },
  },
  dual16: {
    id: 'dual16', grid: 'dual', cols: 4, rows: 4,
    tiles: (() => {
      const out = new Array(16);
      DUAL_LAYOUT.forEach((row, r) => row.forEach((m, c) => { out[m] = { index: m, mask: m, quads: quadsFromDual(m), pos: [c, r] }; }));
      return out;
    })(),
    tileAt(g, i, j) { const m = maskDual(g, i, j); return { mask: m, index: m }; },
  },
  quarter: {
    id: 'quarter', grid: 'quarter', cols: 4, rows: 6, unit: 16,
    tileAt(g, x, y) { return { quads: quadsAt(g, x, y) }; },
  },
};
