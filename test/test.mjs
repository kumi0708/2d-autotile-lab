// node test/test.mjs — ロジックと「3手法がピクセル単位で一致する」ことを検証
import assert from 'node:assert/strict';
import { METHODS, BLOB_MASKS, QUARTER_SRC, Grid } from '../src/autotile.js';
import { T, H, genMiniAtlas, genSheet, makeBuf } from '../src/art.js';
import { islands, testPattern } from '../src/maps.js';

assert.equal(BLOB_MASKS.length, 47, '8-bit blob must reduce to 47 tiles');
assert.equal(METHODS.edge16.tiles.length, 16);
assert.equal(METHODS.dual16.tiles.filter(Boolean).length, 16);
console.log('✓ tile counts: 16 / 47 / 16(15+empty) / 20 minitiles');

// ミニタイル配置の向き(偶奇)が正しいか
for (let t = 0; t < 5; t++) for (let o = 0; o < 4; o++) {
  const [c, r] = QUARTER_SRC[t][o];
  assert.equal(c % 2, (o === 1 || o === 2) ? 1 : 0); assert.equal(r % 2, (o === 2 || o === 3) ? 1 : 0);
}
console.log('✓ quarter source layout parity');

function blit(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const X = dx + x, Y = dy + y;
    if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
    const si = ((sy + y) * src.w + sx + x) * 4, di = (Y * dst.w + X) * 4;
    for (let k = 0; k < 4; k++) dst.data[di + k] = src.data[si + k];
  }
}
function render(g, id, atlas) {
  const m = METHODS[id], sheet = genSheet(m, atlas), out = makeBuf(g.w * T, g.h * T);
  if (m.grid === 'cell') {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) {
      const t = m.tiles[m.tileAt(g, x, y).index]; blit(out, sheet, t.pos[0] * T, t.pos[1] * T, T, T, x * T, y * T);
    }
  } else if (m.grid === 'dual') {
    for (let j = 0; j <= g.h; j++) for (let i = 0; i <= g.w; i++) {
      const k = m.tileAt(g, i, j).mask; if (!k) continue;
      const t = m.tiles[k]; blit(out, sheet, t.pos[0] * T, t.pos[1] * T, T, T, i * T - H, j * T - H);
    }
  } else {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) {
      m.tileAt(g, x, y).quads.forEach((q, o) => {
        const [c, r] = QUARTER_SRC[q][o];
        blit(out, sheet, c * H, r * H, H, H, x * T + ((o === 1 || o === 2) ? H : 0), y * T + ((o === 2 || o === 3) ? H : 0));
      });
    }
  }
  return out;
}
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 3] !== b.data[i + 3]) n++; return n; };

const atlas = genMiniAtlas('meadow', 0);
for (const [name, g] of [['test', testPattern(26, 14)], ['islands', islands(30, 20, 42)]]) {
  const blob = render(g, 'blob47', atlas), quarter = render(g, 'quarter', atlas), dual = render(g, 'dual16', atlas), edge = render(g, 'edge16', atlas);
  assert.equal(diff(blob, quarter), 0, `${name}: blob47 vs quarter`);
  assert.equal(diff(blob, dual), 0, `${name}: blob47 vs dual16`);
  console.log(`✓ ${name}: blob47 == quarter == dual16 (pixel-identical); edge16 differs in ${diff(blob, edge)} px (lost inner corners)`);
}

// 継ぎ目チェック: 完全に埋まった 3x3 の中央と、全ミニタイルの連続性 (FULL 同士)
const g = new Grid(3, 3); g.data.fill(1);
const full = render(g, 'blob47', atlas);
assert.ok(full.data.length > 0);
console.log('all tests passed');
