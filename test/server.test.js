// サーバー(server.js)のルールの検査。部屋・参加・マップ/難易度・開始・投票(多数決・同票・全滅)・死亡・
// ホスト交代・つなぎ直し・世界の状態(ドア/スイッチ/ブレーカー/道具)・お金(/me・/claim・報酬の保存)を確かめる。
// socket.io は test/lib/fake-socketio.js の偽物に差し替えるので、npm install なしで、ネットワークも使わずに動く。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { tick, waitFor } = require('./helpers');
const { installFakeSocketIO, FakeIO } = require('./lib/fake-socketio');

// 待ち時間は、試験のために短くする(server.js は起動時に環境変数を読む)
Object.assign(process.env, { PORT: '0', REJOIN_GRACE_MS: '120', HOST_TRANSFER_MS: '50', CLAIM_INTERVAL_MS: '300', MONEY_DEV: '1' });
delete process.env.FIREBASE_SERVICE_ACCOUNT; delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64; delete process.env.ALLOWED_ORIGINS;

let io, port;
test.before(async () => {
  const restore = installFakeSocketIO();
  const log = console.log; console.log = () => {};
  try { require('../server.js'); } finally { console.log = log; restore(); }
  io = FakeIO.last;
  await waitFor(() => io.httpServer.listening, 2000, 'サーバーの起動');
  port = io.httpServer.address().port;
});
test.after(() => { io.httpServer.close(); });

// ---- 道具 ----
// 部屋を作って、n 人を参加させる。clients[0] がホスト
function makeRoom(n = 2, createMsg = { name: 'ホスト' }) {
  const host = io.connect();
  host.emit('create', createMsg);
  const created = host.last('created');
  const clients = [host], info = [{ id: created.playerId, token: created.token }];
  for (let i = 1; i < n; i++) {
    const c = io.connect();
    c.emit('join', { code: created.code, name: 'P' + (i + 1) });
    const joined = c.last('joined');
    assert.ok(joined, `${i + 1}人目が参加できませんでした: ${JSON.stringify(c.last('error'))}`);
    clients.push(c); info.push({ id: joined.playerId, token: joined.token });
  }
  return { code: created.code, clients, info, created };
}
const start = (room) => { room.clients[0].emit('start'); return room.clients[0].last('gameStart'); };
const vote = (c, ghost, extra = {}) => c.emit('vote', { ghost, truth: 'スピリット', elapsed: 100, ...extra });
function request(method, path, { token, body, origin } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (origin) headers.Origin = origin;
    const data = body ? JSON.stringify(body) : null;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (e) { /* 本文なし */ } resolve({ status: res.statusCode, json, text, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---- 部屋 ----
test('部屋を作る: 5文字のコード・既定のマップ(grafton)と難易度(normal)・合言葉(token)が返る', () => {
  const c = io.connect();
  c.emit('create', { name: '  太郎  ' });
  const m = c.last('created');
  assert.match(m.code, /^[A-HJ-NP-Z2-9]{5}$/, '紛らわしい文字(0/O/1/I)が入っています');
  assert.equal(m.map, 'grafton'); assert.equal(m.difficulty, 'normal');
  assert.ok(m.token && m.playerId);
  assert.equal(m.players.length, 1);
  assert.equal(m.players[0].name, '太郎'); assert.equal(m.players[0].host, true);
});

test('部屋を作る: マップ・難易度は、決まっているものだけ受け付ける。名前は12文字まで', () => {
  const ok = io.connect(); ok.emit('create', { name: 'x'.repeat(30), map: 'sunny', difficulty: 'nightmare' });
  const m = ok.last('created');
  assert.equal(m.map, 'sunny'); assert.equal(m.difficulty, 'nightmare'); assert.equal(m.players[0].name.length, 12);
  const bad = io.connect(); bad.emit('create', { name: '', map: 'ない', difficulty: '激ムズ' });
  const b = bad.last('created');
  assert.equal(b.map, 'grafton'); assert.equal(b.difficulty, 'normal'); assert.equal(b.players[0].name, 'プレイヤー');
});

test('参加: 部屋コードは小文字でもよい。ホストに通知が行き、4人で満員、5人目は断られる', () => {
  const room = makeRoom(1);
  const host = room.clients[0];
  const p2 = io.connect(); p2.emit('join', { code: room.code.toLowerCase(), name: 'ふたり' });
  assert.ok(p2.last('joined'));
  assert.equal(host.last('playerJoined').name, 'ふたり');
  [3, 4].forEach((n) => { const c = io.connect(); c.emit('join', { code: room.code, name: 'P' + n }); assert.ok(c.last('joined'), `${n}人目`); });
  const fifth = io.connect(); fifth.emit('join', { code: room.code, name: 'P5' });
  assert.match(fifth.last('error').message, /満員/);
  assert.equal(fifth.last('joined'), undefined);
});

test('参加: 存在しないコード・ゲーム開始後は断られる', () => {
  const c = io.connect(); c.emit('join', { code: 'ZZZZZ', name: 'x' });
  assert.match(c.last('error').message, /見つかりません/);
  const room = makeRoom(2); start(room);
  const late = io.connect(); late.emit('join', { code: room.code, name: '遅刻' });
  assert.match(late.last('error').message, /ゲームが始まっています/);
});

test('マップ・難易度を変えられるのはホストだけで、決まっているものだけ。ゲーム中は難易度を変えられない', () => {
  const room = makeRoom(2); const [host, guest] = room.clients;
  host.emit('setMap', { map: 'house' });
  assert.equal(guest.last('mapChanged').map, 'house');
  guest.clear(); host.clear();
  guest.emit('setMap', { map: 'sunny' });  // ホスト以外
  host.emit('setMap', { map: 'ない' });    // 存在しないマップ
  host.emit('setDifficulty', { difficulty: '激ムズ' });
  guest.emit('setDifficulty', { difficulty: 'easy' });
  assert.equal(guest.all('mapChanged').length, 0); assert.equal(host.all('mapChanged').length, 0);
  assert.equal(guest.all('difficultyChanged').length, 0);
  host.emit('setDifficulty', { difficulty: 'hard' });
  assert.equal(guest.last('difficultyChanged').difficulty, 'hard');
  start(room); guest.clear();
  host.emit('setDifficulty', { difficulty: 'easy' });
  assert.equal(guest.all('difficultyChanged').length, 0, 'ゲーム中に難易度が変わりました');
});

test('開始: ホストだけ。全員に、マップ・難易度・乱数の種が届く。二重に開始できない', () => {
  const room = makeRoom(3, { name: 'H', map: 'sunny', difficulty: 'hard' });
  const [host, p2, p3] = room.clients;
  p2.emit('start');
  assert.equal(p2.last('gameStart'), undefined, 'ホスト以外が開始できました');
  host.emit('start');
  const gs = host.last('gameStart');
  assert.equal(gs.map, 'sunny'); assert.equal(gs.difficulty, 'hard'); assert.ok(Number.isInteger(gs.seed));
  assert.deepEqual(p2.last('gameStart'), gs); assert.deepEqual(p3.last('gameStart'), gs);
  host.emit('start');
  assert.match(host.last('error').message, /ゲーム中/);
});

// ---- 特定(投票) ----
test('投票: 全員が投票すると、多数決で結果が出る。報酬は式どおりで、結果のあと部屋は残る', () => {
  const room = makeRoom(3); const [a, b, c] = room.clients; start(room);
  vote(a, 'スピリット'); vote(b, 'スピリット');
  assert.equal(a.all('identifyResult').length, 0, '全員が投票するまで結果は出ません');
  assert.deepEqual(a.last('voteUpdate').voted.length, 2);
  vote(c, 'ファントム');
  [a, b, c].forEach((cl) => {
    const r = cl.last('identifyResult').result;
    assert.equal(r.winner, 'スピリット'); assert.equal(r.correct, true); assert.equal(r.tie, false); assert.equal(r.wipe, false);
    assert.equal(r.reward, 2000); // 1000 + (600-100)*2
    assert.deepEqual(r.tally, [{ ghost: 'スピリット', count: 2 }, { ghost: 'ファントム', count: 1 }]);
    assert.equal(r.votes.length, 3);
  });
  const again = io.connect(); again.emit('join', { code: room.code, name: 'もう一人' });
  assert.ok(again.last('joined'), '結果が出たあとは、部屋に参加できます(部屋は残る)');
});

test('投票: 不正解は参加料100円。同票なら、同票の中から選ばれ、tie が立つ', () => {
  const room = makeRoom(2); const [a, b] = room.clients; start(room);
  vote(a, 'ファントム'); vote(b, 'バンシー');
  const r = a.last('identifyResult').result;
  assert.equal(r.tie, true); assert.deepEqual(r.tied.sort(), ['バンシー', 'ファントム'].sort());
  assert.ok(['ファントム', 'バンシー'].includes(r.winner));
  assert.equal(r.correct, false); assert.equal(r.reward, 100);
});

test('投票: 1人1票(2回目は無視)・ゲーム中でなければ無視・ghost が空なら無視', () => {
  const room = makeRoom(2); const [a, b] = room.clients;
  vote(a, 'スピリット'); // まだ開始していない
  assert.equal(a.all('voteUpdate').length, 0);
  start(room);
  a.emit('vote', { ghost: '' });
  vote(a, 'スピリット'); vote(a, 'ファントム'); // 2回目は無視される
  assert.equal(a.last('voteUpdate').voted.length, 1);
  vote(b, 'スピリット');
  assert.equal(a.last('identifyResult').result.winner, 'スピリット');
  assert.deepEqual(a.last('identifyResult').result.tally, [{ ghost: 'スピリット', count: 2 }]);
});

test('投票: 切れている人・死んだ人は待たない。ホストは、いまある票で forceFinalize できる', async () => {
  const room = makeRoom(3); const [host, b, c] = room.clients; start(room);
  c.disconnect();                         // 切れた(ページ移動かもしれないので部屋には残る)
  vote(host, 'スピリット');
  assert.equal(host.all('identifyResult').length, 0);
  vote(b, 'スピリット');
  assert.equal(host.last('identifyResult').result.winner, 'スピリット', '切れている人を待ち続けています');

  const room2 = makeRoom(3); const [h2, x2] = room2.clients; start(room2);
  vote(x2, 'ファントム');
  x2.emit('forceFinalize');               // ホスト以外は無視
  assert.equal(h2.all('identifyResult').length, 0);
  h2.emit('forceFinalize');
  assert.equal(h2.last('identifyResult').result.winner, 'ファントム');
});

test('死亡: ホストだけが判定できる。死んだ人は待たれず、全員死ぬと「全滅」で報酬0', () => {
  const room = makeRoom(3); const [host, b, c] = room.clients; start(room);
  b.emit('playerDied', { id: room.info[2].id });
  assert.equal(host.all('playerDied').length, 0, 'ホスト以外が死亡を判定できました');
  host.emit('playerDied', { id: room.info[2].id });
  assert.equal(c.last('playerDied').id, room.info[2].id);
  host.emit('playerDied', { id: room.info[2].id }); // 二重は無視
  assert.equal(host.all('playerDied').length, 1);
  vote(host, 'スピリット'); vote(b, 'スピリット');
  assert.equal(host.last('identifyResult').result.correct, true, '死んだ人を待っています');

  const wipe = makeRoom(2); start(wipe);
  wipe.info.forEach((p) => wipe.clients[0].emit('playerDied', { id: p.id }));
  const r = wipe.clients[0].last('identifyResult').result;
  assert.deepEqual([r.wipe, r.winner, r.reward], [true, null, 0]);
});

// ---- 世界の状態 ----
test('世界の操作: 検証して覚え、送った本人以外に中継する。worldSync で今の状態をもらえる', () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room); guest.clear();
  host.emit('world', { kind: 'door', id: 3, open: true });
  host.emit('world', { kind: 'switch', id: 7, on: true });
  assert.deepEqual(guest.all('world').map((w) => [w.kind, w.id]), [['door', 3], ['switch', 7]]);
  assert.equal(host.all('world').length, 0, '送った本人には返しません');
  [-1, 1000, 1.5, 'x', null].forEach((id) => host.emit('world', { kind: 'door', id, open: true }));
  host.emit('world', { kind: 'ほげ' });
  assert.equal(guest.all('world').length, 2, '不正な操作が中継されました');
  host.emit('world', { kind: 'breaker', on: true });
  host.emit('world', { kind: 'notebook' });
  host.emit('world', { kind: 'drop', id: 'd1', tool: 'emf', x: 1, z: 2, y: 0.5 });
  host.emit('world', { kind: 'drop', id: 'd2', tool: 'ほげ', x: 1, z: 2 });      // 知らない道具
  host.emit('world', { kind: 'drop', id: 'x3', tool: 'emf', x: 1, z: 2 });       // 'd' で始まらない
  host.emit('world', { kind: 'drop', id: 'd4', tool: 'emf', x: 'a', z: 2 });     // 座標が数でない
  host.emit('world', { kind: 'take', id: 's2' });
  guest.clear(); guest.emit('worldSync');
  assert.deepEqual(guest.last('worldState'), {
    doors: { 3: true }, switches: { 7: true }, breaker: true, taken: { s2: true }, drops: { d1: { tool: 'emf', x: 1, z: 2, y: 0.5 } }, notebook: true,
  });
  host.emit('world', { kind: 'take', id: 'd1' }); // 置かれた道具を拾うと、置かれた一覧から消える
  guest.emit('worldSync');
  assert.deepEqual(guest.last('worldState').drops, {});
});

test('ブレーカー: 幽霊が落とした(ghost)印を付けられるのはホストだけ', () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room);
  guest.emit('world', { kind: 'breaker', on: false, ghost: true });
  assert.equal(host.last('world').ghost, undefined, 'ホスト以外の ghost 印が通りました');
  host.emit('world', { kind: 'breaker', on: false, ghost: true });
  assert.equal(guest.last('world').ghost, true);
});

test('世界の操作は、ゲーム中だけ。新しいゲームを始めると、ドアなどはまっさらに戻る', () => {
  const room = makeRoom(2); const [host, guest] = room.clients;
  host.emit('world', { kind: 'door', id: 1, open: true }); // まだ開始していない
  assert.equal(guest.all('world').length, 0);
  start(room);
  host.emit('world', { kind: 'door', id: 1, open: true });
  vote(host, 'スピリット'); vote(guest, 'スピリット'); // 結果が出てゲーム終了
  start(room);
  guest.emit('worldSync');
  assert.deepEqual(guest.last('worldState').doors, {});
});

// ---- 幽霊・つなぎ直し・ホスト交代 ----
test('幽霊の状態: 送れるのはホストだけ。ホスト以外に中継され、つなぎ直した人にも届く', () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room);
  guest.emit('ghost', { x: 9, y: 0, z: 9 });
  assert.equal(host.all('ghost').length, 0);
  host.emit('ghost', { x: 1, y: 0, z: 2, hunt: true, left: 12.5, target: room.info[1].id, orb: { x: 3, y: 1, z: 4 } });
  assert.deepEqual(guest.last('ghost'), { x: 1, y: 0, z: 2, hunt: true, left: 12.5, target: room.info[1].id, orb: { x: 3, y: 1, z: 4 } });
  host.emit('ghost', { x: 'a', y: 0, z: 0 }); // 数でない座標は捨てる
  assert.equal(guest.all('ghost').length, 1);
  const back = io.connect(); back.emit('rejoin', { code: room.code, token: room.info[1].token });
  const rj = back.last('rejoined');
  assert.equal(rj.ghost.x, 1); assert.equal(rj.inGame, true); assert.equal(rj.playerId, room.info[1].id);
  assert.equal(rj.seed, host.last('gameStart').seed, 'つなぎ直しても、同じ乱数の種(同じ幽霊)でなければいけません');
  assert.equal(guest.connected, false, '古い接続が残っています');
});

test('つなぎ直し: 合言葉が違う・部屋がないときは rejoin エラー', () => {
  const room = makeRoom(2);
  const c = io.connect(); c.emit('rejoin', { code: room.code, token: 'でたらめ' });
  assert.equal(c.last('error').rejoin, true);
  const d = io.connect(); d.emit('rejoin', { code: 'ZZZZZ', token: room.info[0].token });
  assert.equal(d.last('error').rejoin, true);
});

test('ホスト交代: ホストが切れたまま一定時間たつと、つながっている人がホストになる。すぐ戻れば交代しない', async () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room);
  host.disconnect();
  await waitFor(() => guest.last('hostChanged'), 1000, 'ホスト交代');
  assert.equal(guest.last('hostChanged').id, room.info[1].id);
  const back = io.connect(); back.emit('rejoin', { code: room.code, token: room.info[0].token });
  assert.equal(back.last('rejoined').players.find((p) => p.id === room.info[0].id).host, false, '戻った元のホストが、ホストのままです');

  const quick = makeRoom(2); const [h2, g2] = quick.clients; start(quick);
  h2.disconnect();
  const back2 = io.connect(); back2.emit('rejoin', { code: quick.code, token: quick.info[0].token }); // ページ移動のように、すぐ戻る
  await tick(120);
  assert.equal(g2.all('hostChanged').length, 0, 'すぐ戻ったのに、ホストが交代しました');
});

test('猶予: ゲーム中に切れた人は、戻らなければ一定時間後に部屋から外れる', async () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room);
  guest.disconnect();
  assert.equal(host.all('playerLeft').length, 0, '切れた直後に外してはいけません(ページ移動かもしれない)');
  await waitFor(() => host.last('playerLeft'), 1500, '猶予後の退出');
  assert.equal(host.last('playerLeft').id, room.info[1].id);
});

test('ロビーで抜ける: すぐ外れ、ホストが抜けたら次の人がホスト。全員抜けると部屋が消える', () => {
  const room = makeRoom(2); const [host, guest] = room.clients;
  host.emit('leave');
  assert.equal(guest.last('hostChanged').id, room.info[1].id);
  assert.equal(guest.last('playerLeft').id, room.info[0].id);
  guest.emit('leave');
  const c = io.connect(); c.emit('join', { code: room.code, name: 'x' });
  assert.match(c.last('error').message, /見つかりません/);
});

test('ゲームから戻る(rejoin lobby:true): その回の投票には数えられず、結果が出ていれば受け取れる', () => {
  const room = makeRoom(2); const [host, guest] = room.clients; start(room);
  guest.disconnect();
  const back = io.connect(); back.emit('rejoin', { code: room.code, token: room.info[1].token, lobby: true });
  assert.equal(back.last('rejoined').players.find((p) => p.id === room.info[1].id).out, true);
  vote(host, 'スピリット'); // 残りの1人が投票すれば、戻った人を待たずに結果が出る
  assert.equal(host.last('identifyResult').result.winner, 'スピリット');
  const again = io.connect(); again.emit('rejoin', { code: room.code, token: room.info[1].token, lobby: true });
  assert.equal(again.last('rejoined').result.winner, 'スピリット');
  assert.equal(again.last('rejoined').inGame, false);
});

// ---- お金 ----
// (HTTPのヘッダーは英数字だけ。本物のFirebaseのトークンも英数字なので、試験のトークンの名前も英数字にしている)
test('/me と /claim: 本人確認・報酬はサーバーが計算・二重受け取り不可・連打は断る', async () => {
  assert.equal((await request('GET', '/me')).status, 401);
  assert.equal((await request('GET', '/me', { token: 'dev:' })).status, 401);
  const me = await request('GET', '/me', { token: 'dev:tester:Tester' });
  assert.deepEqual([me.status, me.json.enabled, me.json.balance, me.json.name], [200, true, 0, 'Tester']);

  const token = 'dev:claimer:Claimer';
  assert.equal((await request('POST', '/claim', { token, body: { correct: 'はい', claimId: 'a' } })).status, 400, 'correct が真偽値でない');
  assert.equal((await request('POST', '/claim', { token, body: { correct: true } })).status, 400, 'claimId がない');
  const first = await request('POST', '/claim', { token, body: { correct: true, elapsed: 100, claimId: 'game1', reward: 999999 } });
  assert.equal(first.json.reward, 2000, '報酬はブラウザの申告ではなく、サーバーの式で決まります');
  assert.equal(first.json.balance, 2000);
  const fast = await request('POST', '/claim', { token, body: { correct: true, elapsed: 0, claimId: 'game2' } });
  assert.equal(fast.status, 429, '1回受け取った直後の連続受け取りは断られます');
  assert.equal(fast.json.balance, 2000);
  await tick(350); // 受け取りの間隔(試験では300ミリ秒)が過ぎたら、また受け取れる
  const dup = await request('POST', '/claim', { token, body: { correct: true, elapsed: 100, claimId: 'game1' } });
  assert.deepEqual([dup.json.duplicate, dup.json.reward, dup.json.balance], [true, 0, 2000], '同じ claimId で増えました');
  const wrong = await request('POST', '/claim', { token, body: { correct: false, elapsed: 5000, claimId: 'game3' } });
  assert.deepEqual([wrong.json.reward, wrong.json.balance], [100, 2100]);
});

test('/me・/claim: 許可されていないサイト(Origin)からは断る。許可したサイトには CORS ヘッダーを付ける', async () => {
  const bad = await request('GET', '/me', { token: 'dev:o:o', origin: 'https://evil.example.com' });
  assert.equal(bad.status, 403);
  const ok = await request('GET', '/me', { token: 'dev:o:o', origin: 'https://carupisu0320.github.io' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['access-control-allow-origin'], 'https://carupisu0320.github.io');
  const local = await request('GET', '/me', { token: 'dev:o:o', origin: 'http://localhost:5173' });
  assert.equal(local.status, 200);
  const root = await request('GET', '/');
  assert.match(root.text, /running/);
});

test('報酬の保存: 結果が出たとき、ログイン中の全員に同じ額が保存される(同じアカウントの2人目は二重に増えない)', async () => {
  async function loggedIn(token, name) {
    const c = io.connect(); c.emit('auth', { token });
    await waitFor(() => c.last('authed'), 1000, '本人確認');
    assert.ok(!c.last('authed').error); return c;
  }
  const host = await loggedIn('dev:payA:Hanako', 'H');
  const p2 = await loggedIn('dev:payB:Taro');
  const p3 = await loggedIn('dev:payA:Hanako'); // 同じアカウントで、もう1人
  const guest = io.connect();                 // ログインしていない人
  host.emit('create', { name: 'H' });
  const code = host.last('created').code;
  [p2, p3, guest].forEach((c, i) => c.emit('join', { code, name: 'P' + i }));
  host.emit('start');
  [host, p2, p3, guest].forEach((c) => vote(c, 'スピリット'));
  await waitFor(() => host.last('moneyUpdate') && p2.last('moneyUpdate') && p3.last('moneyUpdate'), 1500, '報酬の保存');
  assert.deepEqual([host.last('moneyUpdate').reward, host.last('moneyUpdate').balance], [2000, 2000]);
  assert.deepEqual([p2.last('moneyUpdate').reward, p2.last('moneyUpdate').balance], [2000, 2000]);
  assert.deepEqual([p3.last('moneyUpdate').reward, p3.last('moneyUpdate').duplicate], [0, true], '同じアカウントに、二重に保存されました');
  assert.equal(guest.last('moneyUpdate'), undefined, 'ログインしていない人には保存されません');
  assert.equal((await request('GET', '/me', { token: 'dev:payA:Hanako' })).json.balance, 2000);
});

// ---- スキン ----
test('スキン: 作る・参加するときに送った id が、参加者の一覧と、ほかの人への通知に入る。形が違う id は null', () => {
  const host = io.connect();
  host.emit('create', { name: 'ホスト', skin: 'capsule' });
  const created = host.last('created');
  assert.equal(created.players[0].skin, 'capsule');
  const b = io.connect();
  b.emit('join', { code: created.code, name: 'B', skin: 'robot' });
  assert.equal(host.last('playerJoined').skin, 'robot');
  assert.deepEqual(b.last('joined').players.map((p) => p.skin), ['capsule', 'robot']);
  for (const bad of ['Robot', 'ro bot', '../x', '1abc', 'a'.repeat(25), 42, {}, undefined, '']) {
    const c = io.connect(); c.emit('create', { name: 'x', skin: bad });
    assert.equal(c.last('created').players[0].skin, null, `${JSON.stringify(bad)} は受け付けてはいけません`);
  }
});

test('スキン: setSkin で変えると、ほかの人にだけ skinChanged が届き、あとから来た人・つなぎ直した人にも新しい id が見える', () => {
  const room = makeRoom(3); const [host, b, c] = room.clients;
  b.emit('setSkin', { skin: 'capsule' });
  assert.deepEqual(host.last('skinChanged'), { id: room.info[1].id, skin: 'capsule' });
  assert.equal(c.last('skinChanged').skin, 'capsule');
  assert.equal(b.all('skinChanged').length, 0, '変えた本人には送りません');
  b.emit('setSkin', { skin: 'Bad Id' });  // 形が違うものは無視(通知も、保存も変わらない)
  b.emit('setSkin', {});
  assert.equal(host.all('skinChanged').length, 1);
  const late = io.connect(); late.emit('join', { code: room.code, name: 'late' });
  assert.equal(late.last('joined') ? late.last('joined').players[1].skin : (late.last('error') || {}).message, 'capsule');
  c.disconnect();
  const back = io.connect();
  back.emit('rejoin', { code: room.code, token: room.info[1].token, lobby: true }); // b が、つなぎ直す
  assert.equal(back.last('rejoined').players[1].skin, 'capsule', 'つなぎ直しても、スキンは覚えています');
  assert.equal(host.last('playerRejoined').skin, 'capsule');
});

test('スキン: 部屋に入っていない人の setSkin は無視される(落ちない)', () => {
  const c = io.connect();
  assert.doesNotThrow(() => c.emit('setSkin', { skin: 'robot' }));
});

test('本人確認に失敗しても落ちない(でたらめなトークン)', async () => {
  const c = io.connect(); c.emit('auth', { token: '偽物' });
  await waitFor(() => c.last('authed'), 1000, '応答');
  assert.equal(c.last('authed').error, true);
});
