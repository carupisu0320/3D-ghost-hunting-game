// Sunny Meadows の間取り(sunny-meadows-layout.js)の検査。
// 図の座標から壁・ドア・スイッチを自動で作る部分なので、部屋を足したり座標を直したりしたときに、
// 「入れない部屋ができた」「ドアが壁に収まらない」「部屋が重なった」を、画面を開かずに見つける。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers');

let L, layout;
test.before(async () => {
  L = await loadEsm('sunny-meadows-layout.js');
  layout = L.computeLayout();
});

test('間取りの計算で、警告が1つも出ない(ドアが入らない・すき間が細い・部屋の重なり)', () => {
  assert.deepEqual(layout.warnings, []);
});

test('部屋の id は重複せず、四角形が正しい向き(x0<x1, z0<z1)になっている', () => {
  const ids = layout.rooms.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, '部屋の id が重複しています');
  layout.rooms.forEach((r) => {
    assert.ok(r.x0 < r.x1 && r.z0 < r.z1, `${r.id}: 四角形の向きが逆です`);
    assert.ok([L.FLOOR_1F, L.FLOOR_B1F].includes(r.floor), `${r.id}: 階が不正です`);
  });
});

test('LINKS に書いた部屋の名前は、すべて実在する(綴りの違いの検出)', () => {
  const keys = new Set(layout.rooms.flatMap((r) => [r.id, r.group]));
  const bad = L.LINKS.flatMap((l) => [l.a, l.b]).filter((k) => !keys.has(k));
  assert.deepEqual(bad, []);
});

test('入れない部屋は、「入れない」と書いてある4部屋だけ(玄関から全部屋に行ける)', () => {
  const reach = L.reachableRooms(layout, 'Foyer');
  const unreachable = layout.rooms.filter((r) => !reach.has(r.id));
  // 図で赤い×が付いている部屋。ここに増減があれば、間取りの変更が意図したものか確認する
  assert.deepEqual(unreachable.map((r) => r.id).sort(), ['Male Closet', 'Matron Office 2', 'Right Entrance Stairwell', 'Servant Room 1']);
  unreachable.forEach((r) => assert.equal(r.kind, 'sealed', `${r.id} は行けないのに sealed になっていません`));
});

test('ドアの数が、これまでと同じ(1階57・地下24・外へ出るドア1)', () => {
  assert.equal(layout.doors.filter((d) => d.floor === L.FLOOR_1F).length, 57);
  assert.equal(layout.doors.filter((d) => d.floor === L.FLOOR_B1F).length, 24);
  const exterior = layout.walls.filter((w) => w.between[1] === '外' && w.doorAt !== null);
  assert.equal(exterior.length, 1);
  assert.equal(exterior[0].between[0], 'Foyer');
});

test('階段: 1階側・地下側の階段室の中に、階段の範囲が収まり、1階と地下の階が違う', () => {
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  L.STAIRS.forEach((st) => {
    const a = byId.get(st.room1F), b = byId.get(st.roomB1F);
    assert.ok(a && b, `階段 ${st.id}: 部屋が見つかりません`);
    assert.equal(a.floor, L.FLOOR_1F); assert.equal(b.floor, L.FLOOR_B1F);
    [a, b].forEach((r) => assert.ok(st.rect.x0 >= r.x0 && st.rect.x1 <= r.x1 && st.rect.z0 >= r.z0 && st.rect.z1 <= r.z1, `階段 ${st.id}: ${r.id} からはみ出しています`));
    assert.ok(Math.abs(st.highZ - st.lowZ) >= 20, `階段 ${st.id}: 短すぎます`);
  });
});

test('ブレーカー・オーブの部屋・監視カメラの部屋が実在し、ブレーカーはその部屋の壁際にある', () => {
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const br = byId.get(L.BREAKER.room);
  assert.ok(br, 'ブレーカーの部屋がありません');
  assert.ok(L.BREAKER.planX > br.x0 && L.BREAKER.planX < br.x1, 'ブレーカーが部屋の横幅の外にあります');
  assert.ok(L.BREAKER.planZ >= br.z0 && L.BREAKER.planZ <= br.z1, 'ブレーカーが部屋の奥行きの外にあります');
  assert.ok(byId.has(L.ORB_ROOM));
  L.CAMERAS.forEach((id) => assert.ok(byId.has(id), `監視カメラの部屋 ${id} がありません`));
  assert.ok(L.CAMERAS.length <= 6, 'テントのモニターは6台までです');
});

test('照明スイッチ: 入れる部屋(中庭・入れない部屋以外)すべてに位置があり、部屋の中にある', () => {
  const sw = L.switchPositions(layout);
  const needing = layout.rooms.filter((r) => r.kind !== 'courtyard' && r.kind !== 'sealed');
  assert.equal(sw.size, needing.length);
  needing.forEach((r) => {
    const p = sw.get(r.id), b = L.roomBounds(r), eps = 0.3;
    assert.ok(p, `${r.id}: スイッチの位置がありません`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
    assert.ok(p.x >= b.minX - eps && p.x <= b.maxX + eps && p.z >= b.minZ - eps && p.z <= b.maxZ + eps, `${r.id}: スイッチが部屋の外にあります (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  });
});

test('ドアの位置が、壁の範囲の中にあり、座標変換(世界の座標)が有限の数になる', () => {
  layout.walls.forEach((w) => {
    assert.ok(w.to > w.from, `壁の向きが不正です: ${w.between}`);
    if (w.doorAt !== null) assert.ok(w.doorAt - L.DOOR_HALF_PX >= w.from && w.doorAt + L.DOOR_HALF_PX <= w.to, `ドアが壁からはみ出しています: ${w.between}`);
    const o = L.wallToWorld(w);
    assert.ok([o.fixed, o.from, o.to].every(Number.isFinite) && o.to > o.from, `世界の座標への変換が不正です: ${w.between}`);
    if (o.doorAt !== undefined) assert.ok(o.doorAt > o.from && o.doorAt < o.to);
  });
});

test('玄関(Foyer)は、図の下端(z=0)にあり、外へ出るドアがその南の壁にある', () => {
  const foyer = layout.rooms.find((r) => r.id === 'Foyer');
  assert.equal(L.px2z(foyer.z1), 0, '玄関の前の壁が、世界の z=0 になっていません(テント・作業灯の位置の前提)');
  const ex = L.EXTERIOR_DOORS[0];
  assert.deepEqual([ex.room, ex.side], ['Foyer', 'S']);
});
