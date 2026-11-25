// README用の画像を再生成する / regenerate README images
//   node tools/build-figures.mjs
// 静的サーバを立て、ヘッドレス Chrome で tools/figures.html を開き、DOMに書き出された
// dataURL を docs/images/ へ保存する。UIのスクリーンショットも撮る。
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/images');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 8899;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'figs-'));
const chrome = (...args) => execFileSync(CHROME, ['--headless=new', '--hide-scrollbars', `--user-data-dir=${prof}`, ...args], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

try {
  const dom = chrome('--virtual-time-budget=60000', '--dump-dom', `http://localhost:${port}/tools/figures.html`);
  const m = dom.match(/<script type="text\/plain" id="out">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('figures output not found');
  const figs = JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  for (const [name, url] of Object.entries(figs)) {
    if (url.startsWith('ERROR')) { console.error(name, url); continue; }
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log(`  ${name.padEnd(22)} ${(buf.length / 1024).toFixed(0)} KB`);
  }
  const shots = [
    ['ui.png', '?seed=11'],
    ['ui-dual.png', '?m=dual16&grid&labels&nodecor&seed=11'],
    ['ui-en.png', '?lang=en&t=volcano&seed=11'],
  ];
  for (const [name, q] of shots) {
    chrome('--window-size=1500,960', '--virtual-time-budget=6000', `--screenshot=${path.join(outDir, name)}`, `http://localhost:${port}/${q}`);
    console.log(`  ${name}`);
  }
} finally {
  server.kill();
  fs.rmSync(prof, { recursive: true, force: true });
}
