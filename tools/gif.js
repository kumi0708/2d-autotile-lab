// 最小限の GIF89a エンコーダ (LZW + 人気色パレット) / tiny animated GIF encoder
export function encodeGIF(frames, w, h, delayCs = 8) {
  // ---- palette: popularity over 5-bit quantised colours, shared by all frames
  const count = new Map();
  for (const f of frames) for (let i = 0; i < f.length; i += 4) {
    const k = ((f[i] >> 3) << 10) | ((f[i + 1] >> 3) << 5) | (f[i + 2] >> 3);
    count.set(k, (count.get(k) || 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(e => e[0]);
  const pal = top.map(k => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const near = new Map();
  const lookup = (r, g, b) => {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let v = near.get(k);
    if (v !== undefined) return v;
    let best = 0, bd = 1e9;
    for (let i = 0; i < top.length; i++) { const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }
    near.set(k, best); return best;
  };

  const out = [];
  const b = v => out.push(v & 255), w16 = v => { b(v); b(v >> 8); };
  for (const c of 'GIF89a') b(c.charCodeAt(0));
  w16(w); w16(h); b(0xf7); b(0); b(0);
  for (const p of pal) { b(p[0]); b(p[1]); b(p[2]); }
  b(0x21); b(0xff); b(11); for (const c of 'NETSCAPE2.0') b(c.charCodeAt(0)); b(3); b(1); w16(0); b(0);

  for (const f of frames) {
    b(0x21); b(0xf9); b(4); b(0); w16(delayCs); b(0); b(0);
    b(0x2c); w16(0); w16(0); w16(w); w16(h); b(0);
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) idx[i] = lookup(f[i * 4], f[i * 4 + 1], f[i * 4 + 2]);
    lzw(idx, 8, out);
  }
  b(0x3b);
  return new Uint8Array(out);
}

function lzw(data, minCode, out) {
  out.push(minCode);
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, dict = new Map();
  let cur = 0, bits = 0; const buf = [];
  const emit = code => { cur |= code << bits; bits += size; while (bits >= 8) { buf.push(cur & 255); cur >>= 8; bits -= 8; } };
  emit(clear);
  let prefix = data[0];
  for (let i = 1; i < data.length; i++) {
    const k = data[i], key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) buf.push(cur & 255);
  for (let i = 0; i < buf.length; i += 255) { const n = Math.min(255, buf.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(buf[i + j]); }
  out.push(0);
}
