// お金(money.js)と、報酬の計算式の検査。
// 二重に受け取れないこと、記録が増え続けないこと、サーバーの報酬式と本編(engine.js)の式が一致していることを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');
const { applyClaim, createMoneyStore } = require('../money');

test('applyClaim: 加算され、同じ claimId は二重に受け取れない', () => {
  let doc = null;
  let r = applyClaim(doc, 1500, 'a');
  assert.deepEqual([r.money, r.duplicate], [1500, false]);
  doc = { money: r.money, claims: r.claims };
  r = applyClaim(doc, 1500, 'a');
  assert.deepEqual([r.money, r.duplicate], [1500, true], '同じ claimId で増えてはいけません');
  r = applyClaim(doc, 100, 'b');
  assert.deepEqual([r.money, r.duplicate], [1600, false]);
});

test('applyClaim: 負の数・NaN・文字列では減らない/増えない。壊れた保存データでも落ちない', () => {
  assert.equal(applyClaim({ money: 500, claims: [] }, -300, 'x').money, 500);
  assert.equal(applyClaim({ money: 500, claims: [] }, NaN, 'x').money, 500);
  assert.equal(applyClaim({ money: 500, claims: [] }, '250', 'x').money, 750);
  assert.equal(applyClaim({ money: 'abc', claims: 'zzz' }, 100, 'x').money, 100);
  assert.equal(applyClaim(undefined, 100).money, 100);
});

test('applyClaim: 受け取り済みの目印は、新しい30件だけ覚える', () => {
  let doc = { money: 0, claims: [] };
  for (let i = 0; i < 45; i++) { const r = applyClaim(doc, 1, 'c' + i); doc = { money: r.money, claims: r.claims }; }
  assert.equal(doc.claims.length, 30);
  assert.equal(doc.claims[0], 'c15');
  assert.equal(doc.claims[29], 'c44');
});

test('設定がないときは「お金の保存はオフ」で、ゲームは続けられる', async () => {
  const store = createMoneyStore({});
  assert.equal(store.enabled, false);
  assert.match(store.reason, /FIREBASE_SERVICE_ACCOUNT/);
  assert.equal(await store.get('u'), 0);
  await assert.rejects(store.add('u', 100));
  assert.equal(createMoneyStore({ FIREBASE_SERVICE_ACCOUNT: '{壊れたJSON' }).enabled, false);
});

test('動作確認用(MONEY_DEV=1)の保存: トークン形式・加算・二重受け取り', async () => {
  const store = createMoneyStore({ MONEY_DEV: '1' });
  assert.equal(store.enabled, true);
  const u = await store.verify('dev:taro:太郎');
  assert.deepEqual(u, { uid: 'dev-taro', name: '太郎' });
  await assert.rejects(store.verify('本物のトークンのふり'), /トークン/);
  await assert.rejects(store.verify(undefined));
  assert.deepEqual(await store.add(u.uid, 1000, { claimId: 'k1' }), { balance: 1000, duplicate: false });
  assert.deepEqual(await store.add(u.uid, 1000, { claimId: 'k1' }), { balance: 1000, duplicate: true });
  assert.equal(await store.get(u.uid), 1000);
  assert.equal(await store.get('dev-nobody'), 0);
});

// 報酬の式は、サーバー(server.js の calcReward)と、本編(engine.js の calculateReward)の2か所にある。ずれると、画面の額と保存される額が食い違う
function extractFunction(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`).exec(src);
  assert.ok(m, `${file} に ${name} が見つかりません`);
  return vm.runInNewContext(`(${m[0]})`);
}

test('報酬の式: サーバーと本編が、すべての経過時間で同じ額になる', () => {
  const server = extractFunction('server.js', 'calcReward');
  const engine = extractFunction('engine/calc.js', 'calculateReward');
  for (const correct of [true, false]) {
    for (const elapsed of [0, 1, 59.5, 300, 599, 600, 601, 3600, 36000]) {
      assert.equal(server(correct, elapsed), engine(correct, elapsed), `correct=${correct} elapsed=${elapsed}`);
    }
  }
  assert.equal(server(true, 0), 2200);   // 1000 + 600秒ぶんのボーナス(1200)
  assert.equal(server(true, 600), 1000); // ボーナスなし
  assert.equal(server(false, 0), 100);   // 不正解でも参加料
});
