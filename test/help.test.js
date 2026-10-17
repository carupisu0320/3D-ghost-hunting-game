// 操作説明(controls-help.js の HELP)の検査。説明に書いたキーが、本当にコードで使われていること、
// ロビーとゲーム本編の両方で H キーで開けることを確かめる。キー割り当てを変えて、説明を直し忘れたときに分かる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');
const { stripComments } = require('./lib/modgraph');

const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let H;
test.before(async () => { H = (await loadEsm('controls-help.js')).HELP; });

test('説明の形: ロビーとゲーム本編に、見出しと、キーと説明のある行がある。コントローラーの欄もある', () => {
  for (const mode of ['lobby', 'game']) {
    assert.ok(H[mode].length >= 2, `${mode} の説明が少なすぎます`);
    assert.ok(H[mode].some((s) => s.pad), `${mode} にコントローラーの欄がありません`);
    H[mode].forEach((s) => {
      assert.ok(s.title && s.rows.length > 0, `${mode} の「${s.title}」が空です`);
      s.rows.forEach((r) => assert.ok(Array.isArray(r.keys) && r.keys.length > 0 && r.keys.every((k) => k) && r.text, `${mode}/${s.title} に不完全な行があります`));
    });
  }
});

test('説明に書いたキー(codes)が、そのページのコードで実際に使われている', () => {
  const source = { lobby: read('lobby.js'), game: read('engine.js') };
  for (const mode of ['lobby', 'game']) {
    H[mode].forEach((s) => s.rows.forEach((r) => (r.codes || []).forEach((c) => {
      if (c === 'KeyH') return; // H は controls-help.js 自身が受け取る(下の試験)
      assert.ok(source[mode].includes(`'${c}'`), `${mode} の説明に「${r.keys.join('+')}」(${c})とありますが、コードにそのキーの処理が見つかりません`);
    })));
  }
});

test('ゲーム本編の主なキー(E・Q・R・P・1〜3)が、すべて説明にある', () => {
  const documented = new Set(H.game.flatMap((s) => s.rows.flatMap((r) => r.codes || [])));
  const engine = read('engine.js');
  const used = [...engine.matchAll(/e\.code === '(Key[A-Z]|Digit\d)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 6, 'engine.js のキー処理が見つかりません(検査の書き方が古くなっています)');
  const missing = [...new Set(used)].filter((c) => !documented.has(c));
  assert.deepEqual(missing, [], '説明にないキーがあります(controls-help.js の HELP に足してください): ' + missing.join(', '));
});

test('H キーで開け閉めする処理があり、ロビーとゲーム本編の両方から使われている。入力中は反応しない', () => {
  const src = read('controls-help.js');
  assert.match(src, /e\.code !== 'KeyH'/);
  assert.match(src, /tagName === 'INPUT'/);
  assert.match(read('lobby.js'), /createControlsHelp\('lobby'\)/);
  assert.match(read('main.js'), /createControlsHelp\('game'\)/);
  // 他の機能が H を使っていない(ぶつからない)
  for (const f of ['lobby.js', 'engine.js']) assert.doesNotMatch(read(f), /'KeyH'/, `${f} が H キーを別の用途に使っています`);
});

test('ロビーの最初の画面に、長い操作説明を出さない(操作説明は H キー)。再開の案内は、再開しようとしている間は出さない', () => {
  const html = fs.readFileSync(path.join(ROOT, 'lobby.html'), 'utf8');
  const hint = /<div id="hint">([\s\S]*?)<\/div>\s*(?=<div id="resume")/.exec(html);
  assert.ok(hint, 'lobby.html の #hint が見つかりません');
  assert.ok(hint[1].replace(/<[^>]+>/g, '').trim().length <= 40, '最初の画面の文字が長すぎます(説明は controls-help.js の HELP に書いてください)');
  assert.doesNotMatch(html, /id="helpPanel"/);
  const lobby = read('lobby.js');
  assert.doesNotMatch(lobby, /helpPanel|showHelpPanel/);
  assert.match(lobby, /idle && hasStarted && !wantLock/, '再開の案内が、再開の最中にも出てしまいます');
  assert.match(lobby, /function closeModal\(\)[\s\S]*?requestLock\(\)/, 'ダイアログを閉じたあとに、自動で操作へ戻っていません');
});

test('ドアが開かないは中央通知、ハント中は視界の端が点滅する', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8');
  assert.ok(src.includes("showCenterNotice('ドアが開かない"), 'ドアの通知が中央通知を使っていない');
  assert.ok(/classList\.toggle\('is-active', huntActive && !gameOver\)/.test(src), 'ハント演出が huntActive と連動していない');
  assert.ok(/updateHuntVignette\(\);/.test(src), 'updateHuntVignette が毎フレーム呼ばれていない');
});

test('扉は開けた人から遠ざかる向きに開く。向きはオンラインでも共有する', () => {
  const eng = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
  const walls = fs.readFileSync(path.join(ROOT, 'engine', 'walls.js'), 'utf8');
  assert.ok(/function doorOpenDir/.test(eng) && /openDir = doorOpenDir/.test(eng), '開く向きを決めていない');
  assert.ok(/axis: 'x'/.test(walls) && /axis: 'z'/.test(walls), '扉に axis が無い');
  assert.ok(/dir: nearestDoor\.openDir/.test(eng), '開く向きを送っていない');
});

test('マップから来たとき、クリックを待たずに自動で始める', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.ok(!/gate\.addEventListener\('click'/.test(main), 'まだクリック待ちになっています');
  assert.ok(/gate\.remove\(\);\s*start\(\);/.test(main), '自動で start() していません');
});

test('壁にめり込んでいても動ける(止まらない)。壁にそって滑る', () => {
  const eng = fs.readFileSync(path.join(ROOT, 'engine.js'), 'utf8');
  assert.ok(/collidesWithWalls\(prevX, prevZ\)/.test(eng), 'めり込み中の判定がありません');
  assert.ok(/collidesWithWalls\(nx, prevZ\)/.test(eng) && /collidesWithWalls\(prevX, nz\)/.test(eng), '壁にそって滑る処理がありません');
});
