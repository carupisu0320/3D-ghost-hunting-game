// Sunny Meadows の汚れ(血痕・カビ・ひっかき傷)の貼り場所(sunny-meadows-decal-plan.js)の検査。
// ドアの上・照明スイッチの上に貼っていないこと、壁の高さや部屋からはみ出していないこと、毎回同じ配置になることを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers');

let D, L, layout, decals;
test.before(async () => {
  D = await loadEsm('sunny-meadows-decal-plan.js');
  L = await loadEsm('sunny-meadows-layout.js');
  layout = L.computeLayout();
  decals = D.planDecals(layout);
});

test('汚れの数が、設定(DECAL_COUNTS)に近く、種類の番号が正しい', () => {
  const walls = decals.filter((d) => d.plane === 'wall'), floors = decals.filter((d) => d.plane === 'floor');
  assert.ok(walls.length >= D.DECAL_COUNTS.wall * 0.6 && walls.length <= D.DECAL_COUNTS.wall, `壁の汚れが${walls.length}個(設定${D.DECAL_COUNTS.wall})`);
  assert.ok(floors.length >= D.DECAL_COUNTS.floor * 0.6, `床の汚れが${floors.length}個(設定${D.DECAL_COUNTS.floor})`);
  const valid = new Set(Object.values(D.DECAL));
  decals.forEach((d) => assert.ok(valid.has(d.kind), `種類 ${d.kind} が不正です`));
  decals.filter((d) => d.plane === 'floor').forEach((d) => assert.ok([D.DECAL.grime, D.DECAL.mold, D.DECAL.pool, D.DECAL.rust].includes(d.kind), '床に貼れない種類の汚れが、床にあります'));
});

test('壁の汚れ: 壁の範囲の中にあり、壁の高さ(3m)に収まり、ドアの上と照明スイッチの上にない', () => {
  const sw = L.switchPositions(layout);
  const floorOf = new Map(layout.rooms.map((r) => [r.id, r.floor]));
  decals.filter((d) => d.plane === 'wall').forEach((d) => {
    const half = d.size / 2;
    const wall = layout.walls.find((w) => { const o = L.wallToWorld(w); return w.floor === d.floor && o.axis === d.axis && Math.abs(o.fixed - d.fixed) < 1e-9 && d.t - half >= o.from - 1e-6 && d.t + half <= o.to + 1e-6; });
    assert.ok(wall, `壁からはみ出した汚れがあります (${d.axis}=${d.fixed.toFixed(1)}, t=${d.t.toFixed(1)})`);
    const o = L.wallToWorld(wall);
    if (o.doorAt !== undefined) assert.ok(Math.abs(d.t - o.doorAt) >= 0.6 + half, `ドアの上に汚れがあります (${d.axis}=${d.fixed.toFixed(1)}, t=${d.t.toFixed(1)})`);
    assert.ok(d.y - half >= 0 && d.y + half <= 3.0 + 1e-6, `壁の高さに収まっていません(y=${d.y.toFixed(2)}, 大きさ${d.size.toFixed(2)})`);
    sw.forEach((p, id) => {
      if (floorOf.get(id) !== d.floor) return;
      const x = d.axis === 'x' ? d.t : d.fixed, z = d.axis === 'x' ? d.fixed : d.t;
      assert.ok(Math.hypot(p.x - x, p.z - z) >= 0.8, `照明スイッチ(${id})の上に汚れがあります`);
    });
  });
});

test('床の汚れは、部屋の中(壁から離れた所)にある。血の部屋に、血だまりがある', () => {
  decals.filter((d) => d.plane === 'floor').forEach((d) => {
    const inRoom = layout.rooms.some((r) => { const b = L.roomBounds(r); return r.floor === d.floor && d.x - d.size / 2 >= b.minX && d.x + d.size / 2 <= b.maxX && d.z - d.size / 2 >= b.minZ && d.z + d.size / 2 <= b.maxZ; });
    assert.ok(inRoom, `部屋からはみ出した床の汚れがあります (${d.x.toFixed(1)}, ${d.z.toFixed(1)})`);
  });
  D.BLOOD_ROOMS.forEach((id) => {
    const r = layout.rooms.find((q) => q.id === id), b = L.roomBounds(r);
    assert.ok(decals.some((d) => d.plane === 'floor' && d.kind === D.DECAL.pool && d.x > b.minX && d.x < b.maxX && d.z > b.minZ && d.z < b.maxZ), `${id} に血だまりがありません`);
  });
});

test('同じ間取りなら、毎回同じ配置になる(オンラインで、全員が同じ汚れを見る)', () => {
  assert.deepEqual(D.planDecals(L.computeLayout()), decals);
});
