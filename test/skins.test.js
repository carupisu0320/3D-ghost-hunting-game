// スキン(見た目)の検査。一覧(skin-catalog.js)・作り方(skins.js)・サーバー(server.js)の3か所が食い違わないことを確かめる。
// 新しいスキンを足した人が、どれかを書き忘れたら、ここで分かる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let C;
test.before(async () => { C = await loadEsm('skin-catalog.js'); });

test('一覧: id は決まった形で重ならず、名前と説明があり、既定のスキンがあり、6個以内', () => {
  const ids = C.SKIN_CATALOG.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'id が重なっています');
  assert.ok(ids.length >= 1 && ids.length <= C.MAX_SKINS, `スキンは1〜${C.MAX_SKINS}個(ボードの選択画面に入る数)`);
  assert.ok(ids.includes(C.DEFAULT_SKIN_ID), '既定のスキンが一覧にありません');
  C.SKIN_CATALOG.forEach((s) => {
    assert.match(s.id, C.SKIN_ID_PATTERN, `${s.id} は、半角の小文字・数字・_ だけ(先頭は小文字、24文字まで)`);
    assert.ok(typeof s.label === 'string' && s.label.length > 0 && s.label.length <= 12, `${s.id} の名前(label)は1〜12文字`);
    assert.ok(Array.isArray(s.lines) && s.lines.length >= 1 && s.lines.every((t) => typeof t === 'string'), `${s.id} に説明(lines)がありません`);
  });
});

test('normalizeSkinId: 知らない id・空・文字でないものは既定のスキンになる', () => {
  assert.equal(C.normalizeSkinId('capsule'), 'capsule');
  for (const bad of ['nope', '', null, undefined, 3, {}, '__proto__', 'constructor']) assert.equal(C.normalizeSkinId(bad), C.DEFAULT_SKIN_ID, JSON.stringify(bad));
  assert.equal(C.skinLabel('capsule'), 'カプセル');
  assert.equal(C.skinLabel('nope'), C.skinLabel(C.DEFAULT_SKIN_ID));
});

test('一覧の id と、skins.js の IMPLS(作り方)の id が同じ。どちらにも load と create がある', () => {
  const src = read('skins.js');
  const block = /const IMPLS = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(block, 'skins.js に IMPLS が見つかりません');
  const impls = [...block[1].matchAll(/^  ([a-z][a-z0-9_]*): \{([^\n]*)\},?$/gm)];
  const implIds = impls.map((m) => m[1]).sort();
  assert.deepEqual(implIds, C.SKIN_CATALOG.map((s) => s.id).sort(), 'skin-catalog.js の一覧と skins.js の IMPLS で、スキンの id が違います');
  impls.forEach((m) => assert.ok(/\bload:/.test(m[2]) && /\bcreate:/.test(m[2]), `${m[1]} に load と create が必要です`));
});

test('サーバーが受け付ける id の形が、一覧の形(SKIN_ID_PATTERN)と同じ。一覧の id は、すべてサーバーを通る', () => {
  const m = /function cleanSkin\(value\) \{[\s\S]*?\/(\^[^/]+\$)\/\.test/.exec(read('server.js'));
  assert.ok(m, 'server.js の cleanSkin が見つかりません');
  assert.equal(m[1], C.SKIN_ID_PATTERN.source, 'server.js の cleanSkin と skin-catalog.js の SKIN_ID_PATTERN の形が違います');
  C.SKIN_CATALOG.forEach((s) => assert.match(s.id, new RegExp(m[1])));
});

test('ロビーとゲーム本編の両方が、プレイヤー(skin)を skins.js で作り、スキンの変更(skinChanged)を受け取る', () => {
  for (const f of ['lobby.js', 'online-game.js']) {
    const src = read(f);
    assert.match(src, /from '\.\/skins\.js'/, `${f} が skins.js を使っていません`);
    assert.match(src, /createSkinAvatar\(/);
    assert.match(src, /skinChanged/, `${f} が skinChanged を受け取っていません`);
    assert.doesNotMatch(src, /lobby-avatar/, `${f} が lobby-avatar.js を直接使っています(skins.js を通してください)`);
  }
  assert.match(read('lobby.js'), /type: 'create', name: board\.name, skin: board\.skin/);
  assert.match(read('lobby.js'), /type: 'join', name: board\.name, skin: board\.skin/);
  assert.match(read('lobby.js'), /type: 'setSkin'/);
});
