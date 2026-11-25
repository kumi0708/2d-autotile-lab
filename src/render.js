// =============================================================
//  render.js — Canvas 2D でマップを描画 (ブラウザ専用)
// =============================================================
import { METHODS, QUARTER_SRC, Q } from './autotile.js';
import { T, H, FRAMES, BG_FRAMES, genMiniAtlas, genSheet, genBackground, genDecor } from './art.js';
import { hash2 } from './noise.js';

export function toCanvas(buf) {
  const c = document.createElement('canvas');
  c.width = buf.w; c.height = buf.h;
  c.getContext('2d').putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
  return c;
}

const cache = {};
/** テーマ毎のアセット (ミニタイル→各手法のシート, 背景, 装飾) を生成してキャッシュ */
export function assets(theme) {
  if (cache[theme]) return cache[theme];
  const atlasBufs = Array.from({ length: FRAMES }, (_, f) => genMiniAtlas(theme, f));
  const sheets = {};
  for (const id in METHODS) sheets[id] = atlasBufs.map(a => toCanvas(genSheet(METHODS[id], a)));
  const decor = genDecor(theme);
  return (cache[theme] = {
    atlas: atlasBufs.map(toCanvas),
    sheets,
    bg: Array.from({ length: BG_FRAMES }, (_, f) => toCanvas(genBackground(theme, f))),
    decor: { big: decor.big.map(toCanvas), small: decor.small.map(toCanvas) },
  });
}

/** 装飾配置: どの手法でも同じになるようセルの近傍だけで決める */
export function placeDecor(g, seed = 1) {
  const list = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.get(x, y)) continue;
    let all8 = true, all4 = g.get(x + 1, y) && g.get(x - 1, y) && g.get(x, y + 1) && g.get(x, y - 1);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!g.get(x + dx, y + dy)) all8 = false;
    const r = hash2(x, y, seed);
    if (all8 && r < 0.3) list.push({ x, y, big: true, v: hash2(x, y, seed + 1), ox: (hash2(x, y, 5) - 0.5) * 6 });
    else if (all4 && r > 0.72) list.push({ x, y, big: false, v: hash2(x, y, seed + 2), ox: (hash2(x, y, 6) - 0.5) * 10, oy: (hash2(x, y, 7) - 0.5) * 8 });
  }
  return list;
}

export function drawMap(ctx, g, methodId, theme, time, opt = {}) {
  const A = assets(theme);
  const m = METHODS[methodId];
  const W = g.w * T, Hh = g.h * T;
  const tf = opt.tf ?? Math.floor(time * 5) % FRAMES;
  const bf = opt.bf ?? Math.floor(time * 8) % BG_FRAMES;
  ctx.imageSmoothingEnabled = false;

  // 1. animated background
  if (opt.bg !== false) {
    ctx.fillStyle = ctx.createPattern(A.bg[bf], 'repeat');
    ctx.fillRect(0, 0, W, Hh);
  } else ctx.clearRect(0, 0, W, Hh);

  // 2. terrain tiles
  const sheet = A.sheets[methodId][tf];
  if (m.grid === 'cell') {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.get(x, y)) continue;
      const t = m.tiles[m.tileAt(g, x, y).index];
      ctx.drawImage(sheet, t.pos[0] * T, t.pos[1] * T, T, T, x * T, y * T, T, T);
    }
  } else if (m.grid === 'dual') {
    // 表示グリッドはワールドより1つ多く、半タイル(-16px)ずれる
    for (let j = 0; j <= g.h; j++) for (let i = 0; i <= g.w; i++) {
      const mask = m.tileAt(g, i, j).mask;
      if (!mask) continue;
      const t = m.tiles[mask];
      ctx.drawImage(sheet, t.pos[0] * T, t.pos[1] * T, T, T, i * T - H, j * T - H, T, T);
    }
  } else {
    // quarter: 1セル = 4枚のミニタイルを個別に選ぶ
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.get(x, y)) continue;
      const qs = m.tileAt(g, x, y).quads;
      for (let o = 0; o < 4; o++) {
        const [c, r] = QUARTER_SRC[qs[o]][o];
        const qx = (o === 1 || o === 2) ? H : 0, qy = (o === 2 || o === 3) ? H : 0;
        ctx.drawImage(sheet, c * H, r * H, H, H, x * T + qx, y * T + qy, H, H);
      }
    }
  }

  // 3. decorations (y-sorted)
  if (opt.decor !== false && opt.decorList) {
    for (const d of opt.decorList) {
      const set = d.big ? A.decor.big : A.decor.small;
      const s = set[Math.floor(d.v * set.length)];
      const dx = Math.round(d.x * T + T / 2 - s.width / 2 + d.ox);
      const dy = Math.round(d.big ? d.y * T + T - s.height + 2 : d.y * T + T / 2 - s.height / 2 + (d.oy || 0));
      ctx.drawImage(s, dx, dy);
    }
  }

  // 4. drifting cloud shadows
  if (opt.clouds !== false && (theme === 'meadow' || theme === 'snow')) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const r = 90 + 50 * hash2(i, 0, 9);
      const cx = ((hash2(i, 1, 9) * W + time * (10 + i * 4)) % (W + r * 2)) - r;
      const cy = hash2(i, 2, 9) * Hh;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, 'rgba(10,30,40,0.16)'); grd.addColorStop(1, 'rgba(10,30,40,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else if (opt.clouds !== false && theme === 'volcano') {
    // 熱気のゆらぎ / pulsing heat glow
    ctx.fillStyle = `rgba(255,90,20,${0.05 + 0.03 * Math.sin(time * 2)})`;
    ctx.fillRect(0, 0, W, Hh);
  } else if (opt.clouds !== false && theme === 'dungeon') {
    // ビネット / vignette
    const grd = ctx.createRadialGradient(W / 2, Hh / 2, Hh * 0.3, W / 2, Hh / 2, W * 0.7);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, Hh);
  }

  // 5. debug overlays
  if (opt.lost && methodId === 'edge16') drawLost(ctx, g);
  if (opt.grid) drawGrid(ctx, g, m.grid === 'dual');
  if (opt.labels) drawLabels(ctx, g, m);
}

/** 4-bit が失う情報(内角)を赤枠で示す / cells where 4-bit cannot express an inner corner */
export function drawLost(ctx, g) {
  ctx.save(); ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
  const dia = [['N', 'E', 1, -1], ['S', 'E', 1, 1], ['S', 'W', -1, 1], ['N', 'W', -1, -1]];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.get(x, y)) continue;
    for (const [a, b, dx, dy] of dia) {
      if (g.n(x, y, a) && g.n(x, y, b) && !g.get(x + dx, y + dy)) {
        const cx = x * T + (dx > 0 ? T - 6 : 6), cy = y * T + (dy > 0 ? T - 6 : 6);
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function drawGrid(ctx, g, dual) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  for (let x = 0; x <= g.w; x++) { ctx.moveTo(x * T + 0.5, 0); ctx.lineTo(x * T + 0.5, g.h * T); }
  for (let y = 0; y <= g.h; y++) { ctx.moveTo(0, y * T + 0.5); ctx.lineTo(g.w * T, y * T + 0.5); }
  ctx.stroke();
  if (dual) {
    ctx.strokeStyle = 'rgba(255,170,40,0.75)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let x = 0; x <= g.w + 1; x++) { ctx.moveTo(x * T - H + 0.5, 0); ctx.lineTo(x * T - H + 0.5, g.h * T); }
    for (let y = 0; y <= g.h + 1; y++) { ctx.moveTo(0, y * T - H + 0.5); ctx.lineTo(g.w * T, y * T - H + 0.5); }
    ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, text, x, y, color = '#fff') {
  ctx.font = 'bold 10px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}

export function drawLabels(ctx, g, m) {
  if (m.grid === 'dual') {
    for (let j = 0; j <= g.h; j++) for (let i = 0; i <= g.w; i++) {
      const mask = m.tileAt(g, i, j).mask;
      if (mask && mask !== 15) label(ctx, String(mask), i * T, j * T, '#ffc04a');
    }
    return;
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!g.get(x, y)) continue;
    if (m.grid === 'quarter') {
      const qs = m.tileAt(g, x, y).quads;
      const ch = ['o', 'h', 'v', 'i', ''];
      qs.forEach((q, o) => { if (q !== Q.FULL) label(ctx, ch[q], x * T + ((o === 1 || o === 2) ? 24 : 8), y * T + ((o === 2 || o === 3) ? 24 : 8), '#9ff'); });
    } else {
      const r = m.tileAt(g, x, y);
      if (r.mask !== (m.id === 'edge16' ? 15 : 255)) label(ctx, String(r.mask), x * T + H, y * T + H);
    }
  }
}
