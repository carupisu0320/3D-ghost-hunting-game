// 試験で共通に使う道具。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

// ブラウザ用のES module(.js)を、Node から読み込む。
// このリポジトリは "type": "module" ではない(server.js が require を使うため)ので、.js のまま import すると失敗する。
// そこで .mjs としてコピーしてから読み込む。import が他のファイルや three に依存しない「計算だけのファイル」専用。
async function loadEsm(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  if (/^\s*import\s[^;]*from\s/m.test(src)) throw new Error(`${relPath} は他のファイルを import しているので、loadEsm では読み込めません`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-esm-'));
  const file = path.join(dir, path.basename(relPath, '.js') + '.mjs');
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
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
