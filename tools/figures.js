// README 用の図を生成する / generates every figure used in the README.
// node tools/build-figures.mjs がヘッドレスChromeでこのページを開き、結果をPNG/GIFに保存する。
import { METHODS, QUARTER_SRC, Q, Q_NAMES, Grid, BITS4, BITS8, rawMask8, reduce8, BLOB_INDEX } from '../src/autotile.js';
import { T, H, THEMES, BG_FRAMES, FRAMES, genMiniAtlas, genSheet } from '../src/art.js';
import { assets, drawMap, placeDecor, toCanvas, drawGrid, drawLabels, drawLost } from '../src/render.js';
import { PRESETS } from '../src/maps.js';
import { encodeGIF } from './gif.js';

const FONT = '"Helvetica Neue", Arial, sans-serif';
const MONO = 'Menlo, ui-monospace, monospace';
const BGC = '#0f1526', INK = '#e7ecf7', DIM = '#8f9bbb', ACC = '#6fd3ff', ACC2 = '#ffc04a', RED = '#ff4d6a';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
function up(src, k) { const [c, x] = canvas(src.width * k, src.height * k); x.drawImage(src, 0, 0, c.width, c.height); return c; }
function text(x, s, px, py, { size = 14, color = INK, align = 'left', font = FONT, weight = 'bold', base = 'alphabetic' } = {}) {
  x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = base; x.fillText(s, px, py);
}
function outlined(x, s, px, py, size, color) {
  x.font = `bold ${size}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = Math.max(3, size / 4); x.strokeStyle = 'rgba(0,0,0,.9)'; x.strokeText(s, px, py); x.fillStyle = color; x.fillText(s, px, py);
}
function panel(w, h) { const [c, x] = canvas(w, h); x.fillStyle = BGC; x.fillRect(0, 0, w, h); return [c, x]; }
function rr(x, px, py, w, h, r) { x.beginPath(); x.roundRect(px, py, w, h, r); }

/** マップの一部を描画 (crop は セル単位) */
function renderMap(g, method, theme, { crop, opt = {}, k = 1 } = {}) {
  const [c, x] = canvas(g.w * T, g.h * T);
  drawMap(x, g, method, theme, 1.3, { decorList: opt.decor === false ? null : placeDecor(g), clouds: false, ...opt });
  if (opt.overlay) opt.overlay(x);
  if (!crop) return up(c, k);
  const [cx, cy, cw, ch] = crop;
  const [o, ox] = canvas(cw * T, ch * T);
  ox.drawImage(c, -cx * T, -cy * T);
  return up(o, k);
}

// 小さなマップから文字列で作る
function gridFrom(rows) { const g = new Grid(rows[0].length, rows.length); rows.forEach((r, y) => [...r].forEach((ch, x) => g.set(x, y, ch === '#'))); return g; }

// ==================================================================
const FIG = {};

FIG['hero.png'] = () => {
  const g = PRESETS.islands(30, 16, 11);
  const [c, x] = canvas(30 * T, 16 * T);
  drawMap(x, g, 'blob47', 'meadow', 2.0, { decorList: placeDecor(g) });
  return c;
};

FIG['hero.gif'] = () => {
  const g = PRESETS.islands(20, 10, 23);
  const [c, x] = canvas(20 * T, 10 * T);
  const decorList = placeDecor(g), frames = [];
  for (let i = 0; i < BG_FRAMES; i++) {
    drawMap(x, g, 'blob47', 'meadow', 0, { decorList, clouds: false, bf: i, tf: Math.floor(i * FRAMES / BG_FRAMES) });
    frames.push(x.getImageData(0, 0, c.width, c.height).data);
  }
  return { gif: encodeGIF(frames, c.width, c.height, 12) };
};

FIG['themes.png'] = () => {
  const list = [['meadow', 'islands', 5, 'Meadow'], ['snow', 'lake', 3, 'Snow'], ['volcano', 'islands', 9, 'Volcano'], ['dungeon', 'rooms', 4, 'Dungeon']];
  const cw = 15, ch = 9, pad = 16, top = 30;
  const [c, x] = panel(2 * cw * T + 3 * pad, 2 * (ch * T + top) + pad * 2);
  list.forEach(([th, p, seed, name], i) => {
    const g = PRESETS[p](cw, ch, seed);
    const img = renderMap(g, 'blob47', th, { opt: { clouds: true } });
    const px = pad + (i % 2) * (cw * T + pad), py = pad + Math.floor(i / 2) * (ch * T + top);
    text(x, name, px, py + 16, { size: 16 });
    x.drawImage(img, px, py + top - 6);
  });
  return c;
};

// ---------------- tile sheets ----------------
function sheetFig(id, k) {
  const m = METHODS[id];
  const src = assets('meadow').sheets[id][0];
  const img = up(src, k);
  const pad = 18;
  const [c, x] = panel(img.width + pad * 2, img.height + pad * 2);
  // checker
  for (let yy = 0; yy < img.height; yy += 12) for (let xx = 0; xx < img.width; xx += 12) {
    x.fillStyle = ((xx + yy) / 12) % 2 ? '#1a2140' : '#151b33'; x.fillRect(pad + xx, pad + yy, 12, 12);
  }
  x.drawImage(img, pad, pad);
  const unit = (m.unit || T) * k;
  x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1;
  for (let xx = 0; xx <= img.width; xx += unit) { x.beginPath(); x.moveTo(pad + xx + .5, pad); x.lineTo(pad + xx + .5, pad + img.height); x.stroke(); }
  for (let yy = 0; yy <= img.height; yy += unit) { x.beginPath(); x.moveTo(pad, pad + yy + .5); x.lineTo(pad + img.width, pad + yy + .5); x.stroke(); }
  if (m.tiles) for (const t of m.tiles) {
    x.font = `bold 13px ${MONO}`; x.textAlign = 'left'; x.textBaseline = 'top';
    x.lineWidth = 4; x.strokeStyle = '#000d'; x.strokeText(String(t.mask), pad + t.pos[0] * unit + 4, pad + t.pos[1] * unit + 4);
    x.fillStyle = '#ffe9a8'; x.fillText(String(t.mask), pad + t.pos[0] * unit + 4, pad + t.pos[1] * unit + 4);
  } else {
    const ch = ['o', 'h', 'v', 'i', 'f'];
    for (let ty = 0; ty < 5; ty++) for (let o = 0; o < 4; o++) {
      const [cc, r] = QUARTER_SRC[ty][o];
      outlined(x, ch[ty], pad + cc * unit + unit / 2, pad + r * unit + unit / 2, 15, ty === Q.INNER ? ACC2 : '#9ff');
    }
    x.strokeStyle = ACC2; x.lineWidth = 2; x.setLineDash([6, 4]);
    x.strokeRect(pad + 1, pad + 1, unit * 2 - 2, unit * 2 - 2);
    x.strokeStyle = ACC; x.strokeRect(pad + unit * 2 + 1, pad + 1, unit * 2 - 2, unit * 2 - 2);
    x.strokeStyle = '#7be08a'; x.strokeRect(pad + 1, pad + unit * 2 + 1, unit * 4 - 2, unit * 4 - 2);
  }
  return c;
}
FIG['sheet-edge16.png'] = () => sheetFig('edge16', 3);
FIG['sheet-blob47.png'] = () => sheetFig('blob47', 3);
FIG['sheet-dual16.png'] = () => sheetFig('dual16', 3);
FIG['sheet-quarter.png'] = () => sheetFig('quarter', 4);

// ---------------- bitmask diagrams ----------------
function nbBox(x, px, py, s, on, name, weight, { dim = false, strike = false, center = false } = {}) {
  rr(x, px + 2, py + 2, s - 4, s - 4, 8);
  x.fillStyle = center ? '#2e6e3a' : on ? '#3f8f3a' : '#173a66'; x.fill();
  if (on) { x.fillStyle = '#6b4226'; x.fillRect(px + 4, py + s - 12, s - 8, 8); }
  if (dim) { x.fillStyle = 'rgba(15,21,38,.65)'; rr(x, px + 2, py + 2, s - 4, s - 4, 8); x.fill(); }
  text(x, name, px + s / 2, py + s / 2 - 2, { size: 15, align: 'center', color: dim ? DIM : INK });
  if (weight !== '') text(x, String(weight), px + s / 2, py + s / 2 + 18, { size: 13, align: 'center', font: MONO, color: dim ? '#55607e' : ACC2 });
  if (strike) { x.strokeStyle = RED; x.lineWidth = 3; x.beginPath(); x.moveTo(px + 10, py + s - 10); x.lineTo(px + s - 10, py + 10); x.stroke(); }
}

FIG['bits-edge16.png'] = () => {
  const s = 72, [c, x] = panel(720, 290);
  text(x, 'mask = N·1 + E·2 + S·4 + W·8', 24, 34, { size: 18, font: MONO, color: INK });
  const on = { N: 1, E: 1, S: 0, W: 1, NE: 0, SE: 1, SW: 1, NW: 0 };
  const L = [['NW', -1, -1], ['N', 0, -1], ['NE', 1, -1], ['W', -1, 0], ['C', 0, 0], ['E', 1, 0], ['SW', -1, 1], ['S', 0, 1], ['SE', 1, 1]];
  for (const [n, dx, dy] of L) {
    const isC = n === 'C', w = BITS4[n] ?? '';
    nbBox(x, 24 + (dx + 1) * s, 56 + (dy + 1) * s, s, isC || on[n], isC ? '●' : n, w, { dim: !isC && !(n in BITS4), center: isC });
  }
  text(x, 'N(1) + E(2) + W(8) = 11', 280, 120, { size: 20, font: MONO, color: '#7be08a' });
  text(x, 'diagonals are ignored → 2⁴ = 16 tiles', 280, 152, { size: 15, color: DIM, weight: 'normal' });
  const m = METHODS.edge16, src = assets('meadow').sheets.edge16[0], t = m.tiles[11];
  const [tc, tx] = canvas(T, T); tx.drawImage(src, t.pos[0] * T, t.pos[1] * T, T, T, 0, 0, T, T);
  x.drawImage(up(tc, 3), 290, 172);
  text(x, '→ tile #11', 400, 230, { size: 16, color: ACC });
  return c;
};

FIG['bits-blob47.png'] = () => {
  const s = 64, [c, x] = panel(1060, 320);
  text(x, 'N1 NE2 E4 SE8 S16 SW32 W64 NW128 — corner counts only if both sides are set', 24, 32, { size: 16, font: MONO });
  const L = [['NW', -1, -1], ['N', 0, -1], ['NE', 1, -1], ['W', -1, 0], ['C', 0, 0], ['E', 1, 0], ['SW', -1, 1], ['S', 0, 1], ['SE', 1, 1]];
  const cases = [
    { on: { E: 1, NE: 1 }, note: 'raw 6 → 4' },
    { on: { E: 1 }, note: 'raw 4 → 4' },
    { on: { N: 1, NE: 1, E: 1 }, note: 'raw 7 → 7' },
    { on: { N: 1, E: 1 }, note: 'raw 5 → 5' },
  ];
  const src = assets('meadow').sheets.blob47[0];
  cases.forEach((cs, i) => {
    const ox = 24 + i * 262, oy = 56;
    let raw = 0; for (const k in cs.on) raw |= BITS8[k];
    const red = reduce8(raw);
    for (const [n, dx, dy] of L) {
      const isC = n === 'C', on = isC || !!cs.on[n];
      const strike = on && !isC && (raw & BITS8[n]) && !(red & BITS8[n]);
      nbBox(x, ox + (dx + 1) * s * 0.75, oy + (dy + 1) * s * 0.75, s * 0.75, on, isC ? '●' : n, isC ? '' : BITS8[n], { center: isC, strike });
    }
    const t = METHODS.blob47.tiles[BLOB_INDEX.get(red)];
    const [tc, tx] = canvas(T, T); tx.drawImage(src, t.pos[0] * T, t.pos[1] * T, T, T, 0, 0, T, T);
    x.drawImage(up(tc, 3), ox + 156, oy + 20);
    text(x, cs.note, ox, oy + 168, { size: 15, font: MONO, color: '#7be08a' });
    text(x, `tile #${BLOB_INDEX.get(red)}`, ox + 160, oy + 136, { size: 13, color: ACC, font: MONO });
  });
  x.strokeStyle = '#2a3557'; x.lineWidth = 2; x.beginPath(); x.moveTo(538, 60); x.lineTo(538, 290); x.stroke();
  text(x, 'NE ignored: N is empty → same tile', 24, 290, { size: 15, color: RED });
  text(x, 'NE matters: inner corner', 556, 290, { size: 15, color: ACC2 });
  return c;
};

FIG['bits-dual16.png'] = () => {
  const [c, x] = panel(760, 330);
  text(x, 'mask = TL·1 + TR·2 + BR·4 + BL·8', 24, 34, { size: 18, font: MONO });
  // world cells 2x2 with display tile spanning centres
  const s = 110, ox = 40, oy = 64;
  const on = { TL: 1, TR: 0, BL: 1, BR: 1 };
  const pos = { TL: [0, 0, 1], TR: [1, 0, 2], BL: [0, 1, 8], BR: [1, 1, 4] };
  for (const k in pos) { const [i, j, w] = pos[k]; nbBox(x, ox + i * s, oy + j * s, s, on[k], k, w); }
  x.strokeStyle = ACC2; x.lineWidth = 3; x.setLineDash([8, 6]);
  x.strokeRect(ox + s / 2, oy + s / 2, s, s); x.setLineDash([]);
  text(x, 'world cells (data)', ox, oy + 2 * s + 26, { size: 14, color: DIM, weight: 'normal' });
  text(x, 'display tile — offset ½', ox + s / 2 + 6, oy + s / 2 - 8, { size: 13, color: ACC2 });
  text(x, 'TL(1) + BR(4) + BL(8) = 13', 300, 110, { size: 20, font: MONO, color: '#7be08a' });
  text(x, '2⁴ = 16 cases (0 = empty) → 15 drawn tiles', 300, 142, { size: 15, color: DIM, weight: 'normal' });
  const src = assets('meadow').sheets.dual16[0], t = METHODS.dual16.tiles[13];
  const [tc, tx] = canvas(T, T); tx.drawImage(src, t.pos[0] * T, t.pos[1] * T, T, T, 0, 0, T, T);
  x.drawImage(up(tc, 4), 310, 170);
  text(x, '→ tile 13', 450, 240, { size: 16, color: ACC });
  return c;
};

// ---------------- comparisons ----------------
const SAMPLE = gridFrom([
  '..........',
  '.#######..',
  '.###.###..',
  '.########.',
  '.####..##.',
  '.##....##.',
  '.########.',
  '..........',
]);

FIG['compare-inner.png'] = () => {
  const k = 2, pad = 20, top = 36;
  const a = renderMap(SAMPLE, 'edge16', 'meadow', { k, opt: { decor: false, overlay: x => drawLost(x, SAMPLE) } });
  const b = renderMap(SAMPLE, 'blob47', 'meadow', { k, opt: { decor: false } });
  const [c, x] = panel(a.width * 2 + pad * 3, a.height + top + pad * 2);
  text(x, '4-bit edge (16) — inner corners lost', pad, pad + 18, { size: 17, color: RED });
  text(x, '8-bit blob (47) — correct', pad * 2 + a.width, pad + 18, { size: 17, color: '#7be08a' });
  x.drawImage(a, pad, pad + top); x.drawImage(b, pad * 2 + a.width, pad + top);
  return c;
};

FIG['dual-offset.png'] = () => {
  const k = 2, g = SAMPLE;
  const img = renderMap(g, 'dual16', 'meadow', { k, opt: { decor: false, overlay: x => { drawGrid(x, g, true); drawLabels(x, g, METHODS.dual16); } } });
  const pad = 20, [c, x] = panel(img.width + pad * 2, img.height + pad * 2 + 30);
  text(x, 'white = world grid (data)   orange = display grid (−½ tile)   numbers = corner mask', pad, pad + 16, { size: 15 });
  x.drawImage(img, pad, pad + 30);
  return c;
};

FIG['quarter-compose.png'] = () => {
  const k = 2, g = SAMPLE;
  const img = renderMap(g, 'quarter', 'meadow', { k, opt: { decor: false, overlay: x => {
    x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1;
    for (let i = 0; i <= g.w * 2; i++) { x.beginPath(); x.moveTo(i * H + .5, 0); x.lineTo(i * H + .5, g.h * T); x.stroke(); }
    for (let j = 0; j <= g.h * 2; j++) { x.beginPath(); x.moveTo(0, j * H + .5); x.lineTo(g.w * T, j * H + .5); x.stroke(); }
    drawLabels(x, g, METHODS.quarter);
  } } });
  const sheet = sheetFig('quarter', 3);
  const pad = 20, [c, x] = panel(img.width + sheet.width + pad * 3, Math.max(img.height, sheet.height) + pad * 2 + 30);
  text(x, 'each ¼ picks o / h / v / i / (full) from a 20-piece source', pad, pad + 16, { size: 15 });
  x.drawImage(img, pad, pad + 30); x.drawImage(sheet, pad * 2 + img.width, pad + 30);
  return c;
};

FIG['sdf-pipeline.png'] = () => {
  const g = gridFrom(['.....', '.###.', '.##..', '.###.', '.....']);
  const k = 4, pad = 20, top = 30;
  const m = METHODS.blob47;
  const draw = mode => {
    const sheet = toCanvas(genSheet(m, genMiniAtlas('meadow', 0, mode)));
    const [c, x] = canvas(g.w * T, g.h * T);
    x.fillStyle = mode ? '#1f3550' : '#000'; x.fillRect(0, 0, c.width, c.height);
    if (!mode) drawMap(x, g, 'blob47', 'meadow', 0, { decorList: null, clouds: false, tf: 0, bf: 0 });
    for (let y = 0; y < g.h; y++) for (let xx = 0; xx < g.w; xx++) {
      if (!g.get(xx, y) || !mode) continue;
      const t = m.tiles[m.tileAt(g, xx, y).index];
      x.drawImage(sheet, t.pos[0] * T, t.pos[1] * T, T, T, xx * T, y * T, T, T);
    }
    if (mode === 'types') { /* unused */ }
    return c;
  };
  const types = (() => {
    const [c, x] = canvas(g.w * T, g.h * T);
    x.fillStyle = '#1f3550'; x.fillRect(0, 0, c.width, c.height);
    const col = ['#ff9f43', '#54a0ff', '#5f27cd', '#ff4d6a', '#3f8f3a'];
    for (let y = 0; y < g.h; y++) for (let xx = 0; xx < g.w; xx++) {
      if (!g.get(xx, y)) continue;
      m.tiles[m.tileAt(g, xx, y).index].quads.forEach((q, o) => {
        x.fillStyle = col[q.type]; x.fillRect(xx * T + ((o === 1 || o === 2) ? H : 0), y * T + ((o === 2 || o === 3) ? H : 0), H - 1, H - 1);
      });
    }
    return c;
  })();
  const panels = [[types, '① quadrant kinds'], [draw('dist'), '② signed distance d(px)'], [draw('bands'), '③ bands by d'], [draw(null), '④ shaded result']];
  const w = g.w * T * k;
  const [c, x] = panel(panels.length * (w + pad) + pad, w + top + pad * 2 + 34);
  panels.forEach(([img, label], i) => {
    text(x, label, pad + i * (w + pad), pad + 16, { size: 16 });
    x.drawImage(up(img, k), pad + i * (w + pad), pad + top);
  });
  // legend
  const leg = [['outer', '#ff9f43'], ['edge-h', '#54a0ff'], ['edge-v', '#5f27cd'], ['inner', '#ff4d6a'], ['full', '#3f8f3a']];
  leg.forEach(([n, cl], i) => { x.fillStyle = cl; x.fillRect(pad + i * 92, pad + top + w + 14, 14, 14); text(x, n, pad + i * 92 + 20, pad + top + w + 26, { size: 13, weight: 'normal' }); });
  const bands = [['top', '#60b043'], ['rim', '#1e3c1e'], ['cliff', '#8c5a36'], ['sand', '#e9d39a'], ['foam', '#ffffff'], ['shallow', '#7fd3e6']];
  bands.forEach(([n, cl], i) => { const bx = pad + 2 * (w + pad) + i * 70; x.fillStyle = cl; x.fillRect(bx, pad + top + w + 14, 14, 14); text(x, n, bx + 20, pad + top + w + 26, { size: 13, weight: 'normal' }); });
  return c;
};

FIG['equivalence.png'] = () => {
  const g = PRESETS.islands(14, 9, 5), k = 1, pad = 16, top = 30;
  const ims = ['blob47', 'dual16', 'quarter'].map(id => renderMap(g, id, 'meadow', { k, opt: { decor: false, bg: false, tf: 0 } }));
  const ctxs = ims.map(i => i.getContext('2d').getImageData(0, 0, i.width, i.height).data);
  let diffPx = 0; const [dc, dx] = canvas(ims[0].width, ims[0].height); const dd = dx.createImageData(dc.width, dc.height);
  for (let i = 0; i < ctxs[0].length; i += 4) {
    const d = Math.max(...[0, 1, 2, 3].map(j => Math.max(Math.abs(ctxs[0][i + j] - ctxs[1][i + j]), Math.abs(ctxs[0][i + j] - ctxs[2][i + j]))));
    if (d) diffPx++;
    dd.data[i] = d ? 255 : 10; dd.data[i + 1] = d ? 40 : 14; dd.data[i + 2] = d ? 80 : 26; dd.data[i + 3] = 255;
  }
  dx.putImageData(dd, 0, 0);
  const all = [...ims, dc], labels = ['8-bit blob (47)', 'dual-grid (15+1)', 'quarter (20)', `|diff| = ${diffPx} px`];
  const w = ims[0].width;
  const [c, x] = panel(2 * (w + pad) + pad, 2 * (ims[0].height + top) + pad * 2);
  all.forEach((im, i) => {
    const px = pad + (i % 2) * (w + pad), py = pad + Math.floor(i / 2) * (im.height + top);
    text(x, labels[i], px, py + 16, { size: 15, color: i === 3 ? '#7be08a' : INK });
    x.fillStyle = '#1d5f9e'; x.fillRect(px, py + top - 6, im.width, im.height);
    x.drawImage(im, px, py + top - 6);
  });
  return c;
};

// ==================================================================
const out = {};
for (const name in FIG) {
  try {
    const r = FIG[name]();
    if (r.gif) { let s = ''; for (let i = 0; i < r.gif.length; i += 32768) s += String.fromCharCode(...r.gif.subarray(i, i + 32768)); out[name] = 'data:image/gif;base64,' + btoa(s); }
    else out[name] = r.toDataURL('image/png');
    const img = new Image(); img.src = out[name]; img.title = name; document.body.append(img);
  } catch (e) { out[name] = 'ERROR ' + e.stack; console.error(name, e); }
}
const pre = document.createElement('script'); pre.type = 'text/plain'; pre.id = 'out';
pre.textContent = JSON.stringify(out);
document.body.append(pre);
document.title = 'done';
