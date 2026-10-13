// npm test の入口。test/ の中の *.test.js をすべて、Node標準の試験機能(node --test)で実行する。
// 追加のインストールは要らない(Node 18 以上)。OS による「*」の展開の違いを避けるため、ファイル一覧はここで作る。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(dir, f));
if (files.length === 0) { console.error('test/ に *.test.js がありません'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
