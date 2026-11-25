import { METHODS, BITS4, BITS8, QUARTER_SRC, Q_NAMES, Grid, rawMask8 } from './autotile.js';
import { T, H, THEMES } from './art.js';
import { assets, drawMap, placeDecor } from './render.js';
import { PRESETS } from './maps.js';
import { STR } from './i18n.js';

const W = 30, HH = 18;
const params = new URLSearchParams(location.search);
const state = {
  method: params.get('m') || 'blob47',
  theme: params.get('t') || 'meadow',
  lang: params.get('lang') || localStorage.getItem('lang') || 'ja',
  tool: 1, brush: 1,
  grid: PRESETS[params.get('p') || 'islands'](W, HH, +(params.get('seed') || 7)),
  hover: null,
  opt: { grid: params.has('grid'), labels: params.has('labels'), decor: !params.has('nodecor'), clouds: true, lost: params.has('lost') },
};
let decorList = placeDecor(state.grid);

const $ = s => document.querySelector(s);
const mapC = $('#map'), ctx = mapC.getContext('2d');
mapC.width = W * T; mapC.height = HH * T;

// ---------------- UI build ----------------
const tr = () => STR[state.lang];
function buildMethods() {
  $('#methods').innerHTML = Object.keys(METHODS).map(id =>
    `<button class="mbtn ${id === state.method ? 'on' : ''}" data-m="${id}"><b>${tr().m[id].name}</b><span>${tr().m[id].count}</span></button>`).join('');
  $('#desc').innerHTML = tr().m[state.method].desc;
  $('#lost-wrap').style.display = state.method === 'edge16' ? '' : 'none';
}
function buildThemes() {
  $('#themes').innerHTML = Object.keys(THEMES).map(k => {
    const th = THEMES[k], c = a => `rgb(${a.join(',')})`;
    return `<button class="chip theme ${k === state.theme ? 'on' : ''}" data-t="${k}"><i style="background:linear-gradient(135deg, ${c(th.top[1])} 50%, ${c(th.water[1])} 50%)"></i>${tr()[k]}</button>`;
  }).join('');
}
function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr()[el.dataset.i18n]; });
  $('#lang').textContent = state.lang === 'ja' ? 'EN' : '日本語';
  buildMethods(); buildThemes(); drawSheet(); drawInspector();
}

$('#methods').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; state.method = b.dataset.m; buildMethods(); drawSheet(); drawInspector(); });
$('#themes').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; state.theme = b.dataset.t; buildThemes(); drawSheet(); });
$('#lang').onclick = () => { state.lang = state.lang === 'ja' ? 'en' : 'ja'; localStorage.setItem('lang', state.lang); applyLang(); };
document.querySelectorAll('.tool').forEach(b => b.onclick = () => { state.tool = +b.dataset.tool; document.querySelectorAll('.tool').forEach(x => x.classList.toggle('on', x === b)); });
document.querySelectorAll('.brush').forEach(b => b.onclick = () => { state.brush = +b.dataset.b; document.querySelectorAll('.brush').forEach(x => x.classList.toggle('on', x === b)); });
document.querySelectorAll('.preset').forEach(b => b.onclick = () => {
  const p = b.dataset.p;
  if (p === 'clear') state.grid = new Grid(W, HH);
  else if (p === 'fill') { state.grid = new Grid(W, HH); state.grid.data.fill(1); }
  else state.grid = PRESETS[p](W, HH);
  if (p === 'rooms' && state.theme === 'meadow') { state.theme = 'dungeon'; buildThemes(); drawSheet(); }
  changed();
});
for (const k of Object.keys(state.opt)) {
  const el = $('#o-' + k);
  el.checked = state.opt[k];
  el.onchange = () => { state.opt[k] = el.checked; };
}

// ---------------- painting ----------------
let painting = null;
function cellFromEvent(e) {
  const r = mapC.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * mapC.width, py = (e.clientY - r.top) / r.height * mapC.height;
  return { x: Math.floor(px / T), y: Math.floor(py / T), vx: Math.round(px / T), vy: Math.round(py / T) };
}
function paintAt(c, v) {
  const b = state.brush, o = Math.floor((b - 1) / 2);
  let dirty = false;
  for (let dy = 0; dy < b; dy++) for (let dx = 0; dx < b; dx++) {
    const x = c.x + dx - o, y = c.y + dy - o;
    if (state.grid.get(x, y) !== v && x >= 0 && y >= 0 && x < W && y < HH) { state.grid.set(x, y, v); dirty = true; }
  }
  if (dirty) changed();
}
function changed() { decorList = placeDecor(state.grid); drawInspector(); }
mapC.addEventListener('contextmenu', e => e.preventDefault());
mapC.addEventListener('pointerdown', e => { painting = e.button === 2 ? 0 : state.tool; mapC.setPointerCapture(e.pointerId); paintAt(cellFromEvent(e), painting); });
mapC.addEventListener('pointermove', e => { const c = cellFromEvent(e); state.hover = c; if (painting !== null) paintAt(c, painting); drawInspector(); });
mapC.addEventListener('pointerup', () => { painting = null; });
mapC.addEventListener('pointerleave', () => { state.hover = null; drawInspector(); });

// ---------------- tile sheet panel ----------------
const sheetC = $('#sheet'), sctx = sheetC.getContext('2d');
let sheetHi = [];
function drawSheet() {
  const m = METHODS[state.method], A = assets(state.theme);
  const src = A.sheets[state.method][0];
  const scale = Math.min(3, Math.floor(340 / src.width)) || 1;
  sheetC.width = src.width * scale; sheetC.height = src.height * scale;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(src, 0, 0, sheetC.width, sheetC.height);
  const unit = (m.unit || T) * scale;
  sctx.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let x = 0; x <= sheetC.width; x += unit) { sctx.beginPath(); sctx.moveTo(x + .5, 0); sctx.lineTo(x + .5, sheetC.height); sctx.stroke(); }
  for (let y = 0; y <= sheetC.height; y += unit) { sctx.beginPath(); sctx.moveTo(0, y + .5); sctx.lineTo(sheetC.width, y + .5); sctx.stroke(); }
  if (m.tiles) {
    sctx.font = `bold ${8 + scale}px ui-monospace, Menlo, monospace`; sctx.textBaseline = 'top';
    for (const t of m.tiles) {
      const s = String(t.mask);
      sctx.lineWidth = 3; sctx.strokeStyle = '#000c'; sctx.strokeText(s, t.pos[0] * unit + 3, t.pos[1] * unit + 2);
      sctx.fillStyle = '#ffe9a8'; sctx.fillText(s, t.pos[0] * unit + 3, t.pos[1] * unit + 2);
    }
  }
  sctx.lineWidth = 3; sctx.strokeStyle = '#6fd3ff';
  for (const [c, r, w] of sheetHi) sctx.strokeRect(c * unit + 1.5, r * unit + 1.5, w * unit - 3, w * unit - 3);
  $('#sheet-meta').textContent = `${src.width}×${src.height}px · ${tr().m[state.method].count}`;
}

// ---------------- inspector ----------------
const nbC = $('#nb'), nctx = nbC.getContext('2d');
function drawInspector() {
  const m = METHODS[state.method], g = state.grid, h = state.hover;
  nctx.clearRect(0, 0, 120, 120);
  const f = $('#formula');
  sheetHi = [];
  if (!h) { f.textContent = tr().hoverNone; drawSheet(); return; }
  const cellBox = (x, y, s, on, txt, sub) => {
    nctx.fillStyle = on ? '#5fb043' : '#1d5f9e'; nctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    if (on) { nctx.fillStyle = '#8a5a36'; nctx.fillRect(x + 1, y + s - 7, s - 2, 6); }
    nctx.fillStyle = '#fff'; nctx.font = 'bold 12px ui-monospace, Menlo, monospace'; nctx.textAlign = 'center'; nctx.textBaseline = 'middle';
    if (txt) nctx.fillText(txt, x + s / 2, y + s / 2 - 4);
    if (sub) { nctx.font = '9px ui-monospace, Menlo, monospace'; nctx.fillStyle = '#ffe9a8'; nctx.fillText(sub, x + s / 2, y + s / 2 + 9); }
  };
  if (m.grid === 'dual') {
    const i = h.vx, j = h.vy;
    const corners = [['TL', i - 1, j - 1, 1, 0, 0], ['TR', i, j - 1, 2, 60, 0], ['BL', i - 1, j, 8, 0, 60], ['BR', i, j, 4, 60, 60]];
    let sum = [], mask = 0;
    for (const [n, x, y, b, px, py] of corners) {
      const on = g.get(x, y); cellBox(px, py, 60, on, n, '·' + b);
      if (on) { mask |= b; sum.push(`<span class="k">${n}</span>(${b})`); }
    }
    nctx.strokeStyle = '#ffc04a'; nctx.setLineDash([4, 3]); nctx.strokeRect(30.5, 30.5, 59, 59); nctx.setLineDash([]);
    const t = m.tiles[mask];
    sheetHi.push([t.pos[0], t.pos[1], 1]);
    f.innerHTML = `vertex (${i}, ${j})<br>${sum.join(' + ') || '0'}<br>= <span class="r">${mask}</span> → sheet [${t.pos[0]},${t.pos[1]}]${mask === 0 ? '<br>' + tr().empty : ''}`;
    drawSheet(); return;
  }
  const { x, y } = h;
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) { f.textContent = tr().hoverNone; drawSheet(); return; }
  const dirs = [['NW', -1, -1], ['N', 0, -1], ['NE', 1, -1], ['W', -1, 0], ['C', 0, 0], ['E', 1, 0], ['SW', -1, 1], ['S', 0, 1], ['SE', 1, 1]];
  const bits = m.id === 'edge16' ? BITS4 : BITS8;
  const centerOn = g.get(x, y);
  for (const [n, dx, dy] of dirs) {
    const on = g.get(x + dx, y + dy), b = n === 'C' ? '' : bits[n];
    cellBox((dx + 1) * 40, (dy + 1) * 40, 40, on, n === 'C' ? '●' : n, b ? '·' + b : (m.id === 'edge16' && n !== 'C' ? '—' : ''));
  }
  nctx.strokeStyle = '#6fd3ff'; nctx.lineWidth = 2; nctx.strokeRect(41, 41, 38, 38); nctx.lineWidth = 1;
  if (!centerOn) { f.innerHTML = `cell (${x}, ${y})<br>${tr().empty}`; drawSheet(); return; }

  if (m.id === 'edge16') {
    const r = m.tileAt(g, x, y);
    const parts = Object.entries(BITS4).filter(([k]) => g.n(x, y, k)).map(([k, b]) => `<span class="k">${k}</span>(${b})`);
    sheetHi.push([m.tiles[r.index].pos[0], m.tiles[r.index].pos[1], 1]);
    f.innerHTML = `cell (${x}, ${y})<br>${parts.join(' + ') || '0'}<br>= <span class="r">${r.mask}</span> → tile #${r.index}<br><small>NE/SE/SW/NW: ignored</small>`;
  } else if (m.id === 'blob47') {
    const r = m.tileAt(g, x, y), raw = rawMask8(g, x, y);
    const parts = Object.entries(BITS8).filter(([k, b]) => raw & b).map(([k, b]) =>
      (r.mask & b) ? `<span class="k">${k}</span>(${b})` : `<span class="z">${k}(${b})</span>`);
    const t = m.tiles[r.index];
    sheetHi.push([t.pos[0], t.pos[1], 1]);
    f.innerHTML = `cell (${x}, ${y})<br>raw = ${raw}<br>${parts.join(' + ') || '0'}<br>= <span class="r">${r.mask}</span> → tile #${r.index} / 47`;
  } else {
    const qs = m.tileAt(g, x, y).quads;
    const names = ['TL', 'TR', 'BR', 'BL'];
    qs.forEach((q, o) => { const [c, r] = QUARTER_SRC[q][o]; sheetHi.push([c, r, 1]); });
    f.innerHTML = `cell (${x}, ${y})<br>` + qs.map((q, o) => `${names[o]}: <span class="k">${Q_NAMES[q]}</span>`).join('<br>');
  }
  drawSheet();
}

// ---------------- loop ----------------
const t0 = performance.now();
function frame() {
  const time = (performance.now() - t0) / 1000;
  drawMap(ctx, state.grid, state.method, state.theme, time, { ...state.opt, decorList });
  // hover highlight
  if (state.hover) {
    ctx.save(); ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = 2;
    if (METHODS[state.method].grid === 'dual') ctx.strokeRect(state.hover.vx * T - H + 1, state.hover.vy * T - H + 1, T - 2, T - 2);
    else { const b = state.brush, o = Math.floor((b - 1) / 2); ctx.strokeRect((state.hover.x - o) * T + 1, (state.hover.y - o) * T + 1, T * b - 2, T * b - 2); }
    ctx.restore();
  }
  requestAnimationFrame(frame);
}
applyLang();
requestAnimationFrame(frame);
window.__lab = state; // debug / figure generation
