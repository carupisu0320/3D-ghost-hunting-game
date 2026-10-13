// 試験で共通に使う道具。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

// ブラウザ用のES module(.js)を、Node から読み込む。
// このリポジトリは "type": "module" ではない(server.js が require を使うため)ので、.js のまま import すると失敗する。
// そこで、"type": "module" の一時フォルダにコピーしてから読み込む。
// 読み込めるのは「計算だけのファイル」: 相手が同じリポジトリの .js(./skin-catalog.js など)なら、それもいっしょにコピーする。
// three などの外部パッケージ(import 'three')に依存するファイルは読み込めない。
async function loadEsm(relPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-esm-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  const copied = new Set();
  const copy = (rel) => {
    if (copied.has(rel)) return;
    copied.add(rel);
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (!m[1].startsWith('.')) throw new Error(`${rel} は外部パッケージ(${m[1]})を import しているので、loadEsm では読み込めません`);
      copy(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
    const out = path.join(dir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, src);
  };
  copy(relPath);
  return import(pathToFileURL(path.join(dir, relPath)).href);
}

// 少しだけ待つ(サーバーの非同期の処理が終わるのを待つため)
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

// 条件が成り立つまで待つ(最大 timeout ミリ秒)
async function waitFor(fn, timeout = 2000, what = '条件') {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`${what} が時間内に成り立ちませんでした`);
    await tick(5);
  }
}

module.exports = { ROOT, loadEsm, tick, waitFor };
