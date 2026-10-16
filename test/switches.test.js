// 照明スイッチの位置(sunny-meadows-layout.js の switchPositions)の検査。
// 「スイッチが壁から離れて、廊下の真ん中に浮いている」(壁のない開口のそばに置いてしまう)などを見つける。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');
const { stripComments } = require('./lib/modgraph');

let L, layout, sw;
test.before(async () => {
  L = await loadEsm('sunny-meadows-layout.js');
  layout = L.computeLayout();
  sw = L.switchPositions(layout);
});
const needing = () => layout.rooms.filter((r) => r.kind !== 'courtyard' && r.kind !== 'sealed');

test('すべてのスイッチが、その部屋の本物の壁(ドアの穴や開口ではない所)のすぐ内側にある', () => {
  const floating = needing().filter((r) => !L.isSwitchOnWall(layout, r, sw.get(r.id))).map((r) => `${r.id}(${sw.get(r.id).x.toFixed(2)}, ${sw.get(r.id).z.toFixed(2)})`);
  assert.deepEqual(floating, [], '壁から離れて浮いているスイッチ: ' + floating.join(', '));
});

test('スイッチは、壁の中心からちょうど 0.12m(壁の厚み0.2の半分 + 箱の厚み0.04の半分)の所にあり、axis が付いた壁の向きと合っている', () => {
  needing().forEach((r) => {
    const p = sw.get(r.id);
    assert.ok(p.axis === 'x' || p.axis === 'z', `${r.id}: axis がありません`);
    const hit = layout.walls.filter((w) => w.floor === r.floor && w.between.includes(r.id)).map(L.wallToWorld).some((o) => o.axis === p.axis && Math.abs(Math.abs((p.axis === 'x' ? p.z : p.x) - o.fixed) - 0.12) < 1e-6);
    assert.ok(hit, `${r.id}: 壁にぴったり付いていません(または axis が違います)`);
  });
});

test('スイッチは、ドアの穴の縁から 0.1m 以上はなれている(ドアの穴の中に付かない)', () => {
  needing().forEach((r) => {
    const p = sw.get(r.id);
    layout.doors.filter((d) => d.floor === r.floor && d.between.includes(r.id)).forEach((d) => {
      const w = L.wallToWorld({ axis: d.axis, fixed: d.fixed, from: 0, to: 0, doorAt: d.at });
      if (w.axis !== p.axis || Math.abs((p.axis === 'x' ? p.z : p.x) - w.fixed) > 0.2) return; // 同じ壁のドアだけ
      const gap = Math.abs((p.axis === 'x' ? p.x : p.z) - w.doorAt) - 0.6;
      assert.ok(gap >= 0.1, `${r.id}: スイッチがドアに近すぎます(縁から${gap.toFixed(2)}m)`);
    });
  });
});

test('マップは、スイッチの壁の向き(axis)をエンジンに渡し、エンジンは x が一定の壁では箱を回す', () => {
  const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  assert.match(read('sunny-meadows-map.js'), /addLightSwitch\(r\.id, rl, pos\.x, pos\.z, pos\.axis\);/);
  const e = read('engine.js');
  assert.match(e, /function addLightSwitch\(roomName, rl, customX, customZ, wallAxis\)/);
  assert.match(e, /if \(wallAxis === 'z'\) mesh\.rotation\.y = Math\.PI \/ 2;/);
});
