// 三人称視点(third-person.js)の計算の検査。壁にめり込まない・見ている向きの反対へ下がる・床より下に入らない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');

test('三人称: 何もなければ、見ている向きの反対へ、決まった距離だけ下がる', async () => {
  const { thirdPersonPosition, TP_DISTANCE } = await loadEsm('third-person.js');
  const p = thirdPersonPosition({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, () => false);
  assert.ok(Math.abs(p.z - TP_DISTANCE) < 1e-6 && p.x === 0 && p.y === 1.6, JSON.stringify(p));
});

test('三人称: 壁にぶつかる手前で止まる。壁の中には入らない', async () => {
  const { thirdPersonPosition } = await loadEsm('third-person.js');
  const wall = (x, z) => z > 1.0; // z=1.0 より先は壁
  const p = thirdPersonPosition({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, wall);
  assert.ok(p.z <= 1.0 && p.z > 0.7, `z=${p.z}`);
  const stuck = thirdPersonPosition({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, () => true);
  assert.equal(stuck.distance, 0); // すぐ後ろが壁なら、一人称と同じ位置
});

test('三人称: 下を向くと高く、上を向くと低くなる。床より下には入らない', async () => {
  const { thirdPersonPosition } = await loadEsm('third-person.js');
  const down = thirdPersonPosition({ x: 0, y: 1.6, z: 0 }, { x: 0, y: -0.5, z: -0.87 }, () => false);
  assert.ok(down.y > 1.6);
  const up = thirdPersonPosition({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0.9, z: -0.44 }, () => false, { minY: 0.3 });
  assert.ok(up.y >= 0.3);
});

test('三人称: C キーでロビーとゲーム本編の両方で切り替わる', () => {
  ['lobby.js', 'engine.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(/KeyC/.test(src) && /toggleThirdPerson\(\)/.test(src) && /thirdPersonPosition\(/.test(src) && /renderMainView\(delta\)/.test(src), `${f} に三人称が組み込まれていません`);
  });
});
