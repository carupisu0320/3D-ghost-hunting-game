// ロビーのホワイトボード(lobby-board.js)の検査。
// 画面(canvas)は本物を使わず、描いた内容だけを記録する偽物で動かして、ボタンの出し分け・当たり判定・
// マップ/難易度の一覧が、サーバーと本編の一覧と同じであることを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');

// canvas の偽物: 文字は「幅=文字数×14」として測り、fillText に渡された文字をすべて記録する
function fakeCtx() {
  const texts = [];
  const ctx = new Proxy({
    texts,
    measureText: (t) => ({ width: String(t).length * 14 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText: (t) => { texts.push(String(t)); },
  }, {
    get(target, prop) { if (prop in target) return target[prop]; return () => {}; },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return ctx;
}

let B;
test.before(async () => { B = await loadEsm('lobby-board.js'); });

const baseState = (over = {}) => ({
  screen: 'main', name: 'テスト', skin: 'robot', selectedMap: 'grafton', difficulty: 'normal', hoverId: null, message: '',
  room: null, lastResult: null, account: { configured: false, signedIn: false, name: '', balance: null, enabled: true, busy: false },
  ...over,
});
const ids = (buttons) => buttons.map((b) => b.id);

test('メイン画面: ボタンが決まった順で出て、縦に重ならない', () => {
  const ctx = fakeCtx();
  const buttons = B.drawBoard(ctx, baseState());
  assert.deepEqual(ids(buttons), ['solo', 'create', 'join', 'maps', 'skin', 'rename']);
  for (let i = 1; i < buttons.length; i++) assert.ok(buttons[i].y >= buttons[i - 1].y + buttons[i - 1].h, 'ボタンが重なっています');
  buttons.forEach((b) => assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= B.BOARD_W && b.y + b.h <= B.BOARD_H, `${b.id} がボードからはみ出しています`));
  assert.ok(ctx.texts.includes('ゴーストハンティング'));
});

test('ログイン機能: 設定なし→ボタンなし / 未ログイン→ログイン / ログイン済み→ログアウトと所持金', () => {
  const none = B.drawBoard(fakeCtx(), baseState());
  assert.ok(!ids(none).includes('account'));
  const out = fakeCtx();
  const guest = B.drawBoard(out, baseState({ account: { configured: true, signedIn: false, name: '', balance: null, enabled: true, busy: false } }));
  assert.equal(guest.find((b) => b.id === 'account').label, 'Googleでログイン');
  assert.ok(out.texts.some((t) => t.includes('ゲスト')));
  const inCtx = fakeCtx();
  const signed = B.drawBoard(inCtx, baseState({ account: { configured: true, signedIn: true, name: '花子', balance: 12345, enabled: true, busy: false } }));
  assert.equal(signed.find((b) => b.id === 'account').label, 'ログアウト');
  assert.ok(inCtx.texts.includes('¥12,345'), '所持金が桁区切りで出ていません');
});

test('部屋の中: ホストは「ゲーム開始」、ホスト以外は押せない「ホストの開始待ち」', () => {
  const room = (isHost) => ({ code: 'AB3XQ', isHost, myId: 'p1', map: 'grafton', players: [{ id: 'p1', name: 'A', host: isHost }, { id: 'p2', name: 'B', host: !isHost }] });
  const host = B.drawBoard(fakeCtx(), baseState({ room: room(true) }));
  assert.equal(host.find((b) => b.id === 'start').enabled, true);
  assert.equal(host.find((b) => b.id === 'maps').enabled, true);
  const guest = B.drawBoard(fakeCtx(), baseState({ room: room(false) }));
  assert.ok(!ids(guest).includes('start'));
  assert.equal(guest.find((b) => b.id === 'wait').enabled, false);
  assert.equal(guest.find((b) => b.id === 'maps').enabled, false, 'ホスト以外はマップ・難易度を変えられません');
  assert.ok(ids(guest).includes('leave'));
});

test('マップ選択: 全マップと全難易度のボタンがあり、ホスト以外は押せない', () => {
  const buttons = B.drawBoard(fakeCtx(), baseState({ screen: 'maps' }));
  B.MAPS.forEach((m) => assert.ok(ids(buttons).includes('map:' + m.id)));
  B.DIFFICULTIES.forEach((d) => assert.ok(ids(buttons).includes('diff:' + d.id)));
  assert.ok(ids(buttons).includes('back'));
  const room = { code: 'ZZZZZ', isHost: false, myId: 'p2', map: 'house', players: [{ id: 'p2', name: 'B', host: false }] };
  const locked = B.drawBoard(fakeCtx(), baseState({ screen: 'maps', room }));
  locked.filter((b) => /^(map|diff):/.test(b.id)).forEach((b) => assert.equal(b.enabled, false, `${b.id} はホスト以外には押せないはずです`));
});

test('選んでいるものに ✓ が付く', () => {
  const buttons = B.drawBoard(fakeCtx(), baseState({ screen: 'maps', selectedMap: 'sunny', difficulty: 'hard' }));
  assert.match(buttons.find((b) => b.id === 'map:sunny').label, /^✓ /);
  assert.match(buttons.find((b) => b.id === 'diff:hard').label, /^✓ /);
  assert.doesNotMatch(buttons.find((b) => b.id === 'map:house').label, /^✓ /);
});

test('前回の結果: なし / 成功 / 失敗 / 全滅 のどれでも描ける', () => {
  const results = [
    null,
    { winner: 'スピリット', truth: 'スピリット', correct: true, wipe: false, reward: 2000, tally: [{ ghost: 'スピリット', count: 2 }], mode: 'online', difficulty: 'hard' },
    { winner: 'ファントム', truth: 'スピリット', correct: false, wipe: false, reward: 100, tie: true, tally: [], mode: 'online' },
    { winner: null, truth: 'スピリット', correct: false, wipe: true, reward: 0, mode: 'online' },
  ];
  const labels = [null, '成功', '失敗', '全滅'];
  results.forEach((r, i) => {
    const ctx = fakeCtx();
    assert.doesNotThrow(() => B.drawBoard(ctx, baseState({ lastResult: r })));
    if (labels[i]) assert.ok(ctx.texts.some((t) => t.startsWith(labels[i])), `${labels[i]} の表示がありません`);
    else assert.ok(ctx.texts.includes('まだありません'));
  });
});

test('hitButton: ボタンの中なら返し、外なら null', () => {
  const buttons = B.drawBoard(fakeCtx(), baseState());
  const solo = buttons.find((b) => b.id === 'solo');
  assert.equal(B.hitButton(buttons, solo.x + 5, solo.y + 5).id, 'solo');
  assert.equal(B.hitButton(buttons, 1, 1), null);
});

test('スキン選択: 全スキンのボタンと「戻る」があり、選んでいるものに ✓ が付く。ボードの外にはみ出さない', async () => {
  const { SKIN_CATALOG } = await loadEsm('skin-catalog.js');
  const buttons = B.drawBoard(fakeCtx(), baseState({ screen: 'skins', skin: 'capsule' }));
  SKIN_CATALOG.forEach((sk) => assert.ok(ids(buttons).includes('skin:' + sk.id), `${sk.id} のボタンがありません`));
  assert.ok(ids(buttons).includes('back'));
  assert.match(buttons.find((b) => b.id === 'skin:capsule').label, /^✓ /);
  assert.doesNotMatch(buttons.find((b) => b.id === 'skin:robot').label, /^✓ /);
  buttons.forEach((b) => assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= B.BOARD_W && b.y + b.h <= 620, `${b.id} がパネルの外にはみ出しています`));
  const room = { code: 'ZZZZZ', isHost: false, myId: 'p2', map: 'house', players: [{ id: 'p2', name: 'B', host: false }] };
  const guest = B.drawBoard(fakeCtx(), baseState({ screen: 'skins', room }));
  guest.filter((b) => b.id.startsWith('skin:')).forEach((b) => assert.equal(b.enabled, true, 'スキンは、ホスト以外も選べるはずです'));
});

test('メインと部屋の中の両方に「スキン」ボタンがあり、現在のスキン名が出る', () => {
  const main = B.drawBoard(fakeCtx(), baseState({ skin: 'capsule' }));
  assert.ok(ids(main).includes('skin'));
  const room = { code: 'AB3XQ', isHost: true, myId: 'p1', map: 'grafton', players: [{ id: 'p1', name: 'A', host: true }] };
  const inRoom = B.drawBoard(fakeCtx(), baseState({ room }));
  assert.deepEqual(ids(inRoom), ['start', 'maps', 'skin', 'leave']);
  for (let i = 1; i < inRoom.length; i++) assert.ok(inRoom[i].y >= inRoom[i - 1].y + inRoom[i - 1].h, 'ボタンが重なっています');
});

// ---- 一覧の一致(ロビーのボード・サーバー・本編・main.js の4か所に同じ一覧がある) ----
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const quoted = (text) => [...text.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);

test('マップの一覧が、ボード・サーバー・main.js で同じ', () => {
  const board = B.MAPS.map((m) => m.id).sort();
  const server = quoted(/const MAPS = \[([^\]]*)\]/.exec(read('server.js'))[1]).sort();
  const lobbyMaps = /const lobbyMaps = \{([^}]*)\}/.exec(read('main.js'))[1];
  const main = [...lobbyMaps.matchAll(/(\w+)\s*:\s*\[/g)].map((m) => m[1]).sort();
  assert.deepEqual(server, board, 'server.js の MAPS と lobby-board.js の MAPS が違います');
  assert.deepEqual(main, board, 'main.js の lobbyMaps と lobby-board.js の MAPS が違います');
});

test('難易度の一覧が、ボード・サーバー・本編(engine/ghost-data.js)で同じ', () => {
  const board = B.DIFFICULTIES.map((d) => d.id).sort();
  const server = quoted(/const DIFFICULTIES = \[([^\]]*)\]/.exec(read('server.js'))[1]).sort();
  const engineBlock = /const DIFFICULTIES = \{([\s\S]*?)\n\};/.exec(read('engine/ghost-data.js'))[1];
  const engine = [...engineBlock.matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]).sort();
  assert.deepEqual(server, board, 'server.js と lobby-board.js の難易度が違います');
  assert.deepEqual(engine, board, 'engine/ghost-data.js と lobby-board.js の難易度が違います');
  const engineLabels = Object.fromEntries([...engineBlock.matchAll(/^\s{2}(\w+):\s*\{\s*label:\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
  B.DIFFICULTIES.forEach((d) => assert.equal(d.label, engineLabels[d.id], `${d.id} の表示名が、ボードと本編で違います`));
});

test('ボードに書く説明の部屋数・推奨人数は、マップ側の部屋数と矛盾しない(Sunny Meadows: 部屋90)', async () => {
  const L = await loadEsm('sunny-meadows-layout.js');
  const n = L.ROOMS.filter((r) => r.kind !== 'courtyard').length;
  const claimed = Number(/部屋数(\d+)/.exec(B.MAPS.find((m) => m.id === 'sunny').lines.join(''))[1]);
  assert.ok(Math.abs(n - claimed) <= 5, `ボードには部屋数${claimed}とありますが、実際は${n}部屋です`);
});
