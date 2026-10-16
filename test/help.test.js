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
