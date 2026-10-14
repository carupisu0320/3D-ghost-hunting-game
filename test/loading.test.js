// ロード(読み込み)まわりの検査。画面は開けないので、ソースの書き方を確かめる。
// 読み込みを「時間を区切って進める」作りにしたことで、次の事故が起きやすい:
//   - 読み込み中の止め忘れ(loadingMap が true のままで、ゲームが動き出さない)
//   - 家具のまとめ処理の途中に await を入れて、別の処理が scene に足したものを巻き込む
//   - main.js が、進み具合の関数を渡さなくなる / build の結果を待たなくなる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const { stripComments } = require('./lib/modgraph');

const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test('engine.js: enterGame は async で、読み込み中の印(loadingMap)を、成功・失敗のどちらでも false に戻す', () => {
  const src = read('engine.js');
  assert.match(src, /async function enterGame\(opts = \{\}\)/);
  const body = src.slice(src.indexOf('async function enterGame'), src.indexOf('function startEngine'));
  assert.match(body, /try \{[\s\S]*\} finally \{[\s\S]*loadingMap = false;/, 'finally の中で loadingMap = false に戻していません(失敗したとき、ゲームが止まったままになります)');
  assert.match(body, /compileAsync/);
  assert.match(body, /ghostModelReady[\s\S]*deathModelReady/, 'モデルの読み込みを待っていません');
  assert.match(src, /if \(loadingMap\) \{ clock\.getDelta\(\); return; \}/, 'animate が、読み込み中に止まっていません');
  assert.match(src, /export \{[\s\S]*setMapLoading[\s\S]*\};/, 'setMapLoading が export されていません');
});

test('engine.js: 読み込み中は、40ミリ秒ごとに進み具合を出して、ブラウザに描画の時間を渡す', () => {
  const body = read('engine.js');
  const enter = body.slice(body.indexOf('async function enterGame'), body.indexOf('function startEngine'));
  assert.match(enter, /performance\.now\(\) - sliceStart > 40/);
  assert.match(enter, /await report\(/);
  assert.match(enter, /WARMUP_SPACING/);
});

test('main.js: 読み込みの前に setMapLoading(true) を呼び、build と enterGame の結果を待ち、進み具合の関数を渡す', () => {
  const src = read('main.js');
  assert.match(src, /import \{[^}]*setMapLoading[^}]*\} from '\.\/engine\.js'/);
  const i = src.indexOf('setMapLoading(true)');
  assert.ok(i > 0, 'setMapLoading(true) がありません');
  assert.match(src, /await buildFn\(progressTo\(/, 'build の完了を待っていません(進み具合の関数も渡してください)');
  assert.match(src, /await enterGame\(\{ onProgress: progressTo\(/);
  assert.match(src, /catch \(err\) \{[\s\S]*setMapLoading\(false\)/, '読み込みに失敗したとき、setMapLoading(false) に戻していません');
});

test('sunny-meadows-map.js: build は progress を受け取り、家具をまとめる処理の途中では await しない', () => {
  const src = read('sunny-meadows-map.js');
  assert.match(src, /export async function build\(progress = async \(\) => \{\}\)/);
  const a = src.indexOf('const furnitureStart = scene.children.length;'), b = src.indexOf('batchSceneMeshes(furnitureStart)');
  assert.ok(a > 0 && b > a, '家具をまとめる処理の目印が見つかりません');
  assert.doesNotMatch(src.slice(a, b), /\bawait\b/, 'もとからある家具を作っている最中に await があります(別の処理が scene に足したものを、まとめに巻き込みます)');
  assert.ok((src.match(/await progress\(/g) || []).length >= 6, '進み具合の通知が少なすぎます');
});

test('家具・汚れ・質感が、マップに組み込まれている(作っただけで使っていない、を防ぐ)', () => {
  const src = read('sunny-meadows-map.js');
  ['buildProps(', 'batchSceneMeshes(', 'planDecals(', 'buildDecalMesh(', 'remapWallUVs(', 'makeAsylumWallTexture()', 'makeAsylumTileTexture()', 'makeAsylumWoodTexture()', 'makeAsylumConcreteTexture()', 'makeAsylumCeilingTexture()']
    .forEach((s) => assert.ok(src.includes(s), `sunny-meadows-map.js が ${s} を使っていません`));
});
