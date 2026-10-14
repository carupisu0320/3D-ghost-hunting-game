// 家具の配置計画(sunny-meadows-furniture-plan.js)の検査。
// 画面を開かずに、「家具がドアをふさぐ」「部屋からはみ出す」「重なる」「スイッチやブレーカーの前をふさぐ」「部屋の中を歩けなくなる」を見つける。
// 家具を足したり動かしたり、間取り(sunny-meadows-layout.js)を変えたりしたときに、ここで分かる。
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers');

let P, L, layout, items;
test.before(async () => {
  P = await loadEsm('sunny-meadows-furniture-plan.js');
  L = await loadEsm('sunny-meadows-layout.js');
  layout = L.computeLayout();
  items = P.planProps(layout);
});

const overlap = (a, b, gap = 0) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
const byRoom = () => new Map(layout.rooms.map((r) => [r.id, r]));
const solidOf = (id) => items.filter((i) => i.room === id && i.solid);

test('型: 大きさが正で、部品の数値が有限。色は数値か null。使われている型は、すべて定義されている', () => {
  Object.entries(P.TYPES).forEach(([name, t]) => {
    assert.ok(t.w > 0 && t.d > 0, `${name}: 大きさが不正です`);
    const parts = t.build(t.w, t.d, t.tint);
    assert.ok(parts.length > 0, `${name}: 部品がありません`);
    parts.forEach((p) => {
      assert.ok([p.dx, p.dy, p.dz, p.w, p.h, p.d].every(Number.isFinite) && p.w > 0 && p.h > 0 && p.d > 0, `${name}: 部品の数値が不正です`);
      assert.ok(p.color === null || Number.isInteger(p.color), `${name}: 色が不正です`);
      assert.ok(['b', 'w', 'c'].includes(p.kind), `${name}: 部品の種類が不正です`);
    });
  });
  items.forEach((i) => assert.ok(P.TYPES[i.type], `${i.id}: 型 ${i.type} がありません`));
});

test('手順を書いた部屋は、すべて実在し、家具が2個以上置けている(置き場所が全部ふさがれていない)', () => {
  const rooms = byRoom();
  P.FURNISHED_ROOMS.forEach((id) => {
    assert.ok(rooms.has(id), `部屋 ${id} が間取りにありません(綴りの違い)`);
    assert.ok(solidOf(id).length >= 2, `${id}: 家具が${solidOf(id).length}個しか置けていません`);
  });
});

test('家具は、部屋の中に収まり、階が部屋と同じで、同じ部屋の家具どうしが重ならない', () => {
  const rooms = byRoom();
  items.forEach((it) => {
    const r = rooms.get(it.room), b = L.roomBounds(r), f = P.footprintOf(it);
    assert.equal(it.floor, r.floor, `${it.id}: 階が部屋と違います`);
    const e = 1e-6, m = it.solid ? P.WALL_IN : 0.05;
    assert.ok(f.minX >= b.minX + m - e && f.maxX <= b.maxX - m + e && f.minZ >= b.minZ + m - e && f.maxZ <= b.maxZ - m + e, `${it.id}(${it.type}): 部屋 ${it.room} からはみ出しています`);
  });
  const rect = new Map(items.map((i) => [i, P.footprintOf(i)]));
  const solids = items.filter((i) => i.solid);
  for (let a = 0; a < solids.length; a++) for (let b = a + 1; b < solids.length; b++) {
    if (solids[a].room !== solids[b].room) continue;
    assert.ok(!overlap(rect.get(solids[a]), rect.get(solids[b])), `${solids[a].id} と ${solids[b].id} が重なっています`);
  }
});

test('ドアの前(開閉の範囲)・照明スイッチ・ブレーカーの前に、家具がない', () => {
  const rooms = byRoom();
  const sw = L.switchPositions(layout);
  items.filter((i) => i.solid).forEach((it) => {
    const r = rooms.get(it.room), f = P.footprintOf(it);
    layout.doors.filter((d) => d.floor === r.floor && d.between.includes(r.id)).forEach((d) => {
      const w = L.wallToWorld({ axis: d.axis, fixed: d.fixed, from: 0, to: 0, doorAt: d.at });
      const z = w.axis === 'z'
        ? { minX: w.fixed - 1.2, maxX: w.fixed + 1.2, minZ: w.doorAt - 0.7, maxZ: w.doorAt + 0.7 }
        : { minX: w.doorAt - 0.7, maxX: w.doorAt + 0.7, minZ: w.fixed - 1.2, maxZ: w.fixed + 1.2 };
      assert.ok(!overlap(f, z), `${it.id}(${it.type}) が、ドアの前をふさいでいます`);
    });
    const s = sw.get(r.id);
    if (s) assert.ok(!overlap(f, { minX: s.x - 0.4, maxX: s.x + 0.4, minZ: s.z - 0.4, maxZ: s.z + 0.4 }), `${it.id}(${it.type}) が、照明スイッチの前にあります`);
    if (r.id === L.BREAKER.room) {
      const bx = L.px2x(L.BREAKER.planX), bz = L.px2z(L.BREAKER.planZ);
      assert.ok(!overlap(f, { minX: bx - 0.7, maxX: bx + 0.7, minZ: bz - 1.0, maxZ: bz + 0.1 }), `${it.id}(${it.type}) が、ブレーカーの前にあります`);
    }
  });
});

test('階段の範囲に、家具がない', () => {
  items.filter((i) => i.solid).forEach((it) => L.STAIRS.forEach((st) => {
    const floor = [it.floor].includes(L.FLOOR_1F) ? 'room1F' : 'roomB1F';
    if (it.room !== st[floor]) return;
    assert.ok(!overlap(P.footprintOf(it), { minX: st.rect.x0, maxX: st.rect.x1, minZ: st.rect.z0, maxZ: st.rect.z1 }), `${it.id} が階段にかかっています`);
  }));
});

// 歩ける範囲: 部屋の中で、壁・家具から 0.3m(プレイヤーの半径)以上はなれた所。その中で、部屋のすべての出入り口(ドア・開口)がつながっていること
test('どの部屋でも、すべての出入り口が、家具にじゃまされずにつながっている(部屋の中が歩ける)', () => {
  const rooms = byRoom();
  const R = 0.3, STEP = 0.1;
  const bad = [];
  rooms.forEach((room, id) => {
    const mine = solidOf(id);
    if (mine.length === 0) return;
    const b = L.roomBounds(room);
    const ports = [];
    layout.doors.filter((d) => d.floor === room.floor && d.between.includes(id)).forEach((d) => {
      const w = L.wallToWorld({ axis: d.axis, fixed: d.fixed, from: 0, to: 0, doorAt: d.at });
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      if (w.axis === 'z') ports.push([w.fixed + (cx > w.fixed ? 0.7 : -0.7), w.doorAt]); else ports.push([w.doorAt, w.fixed + (cz > w.fixed ? 0.7 : -0.7)]);
    });
    layout.segments.filter((s) => s.open && s.a.floor === room.floor && (s.a.id === id || s.b.id === id)).forEach((s) => {
      const w = L.wallToWorld({ axis: s.axis, fixed: s.fixed, from: s.lo, to: s.hi, doorAt: null });
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, mid = (w.from + w.to) / 2;
      if (w.axis === 'z') ports.push([w.fixed + (cx > w.fixed ? 0.7 : -0.7), mid]); else ports.push([mid, w.fixed + (cz > w.fixed ? 0.7 : -0.7)]);
    });
    if (ports.length < 2) return;
    const nx = Math.ceil((b.maxX - b.minX) / STEP), nz = Math.ceil((b.maxZ - b.minZ) / STEP);
    const rects = mine.map((i) => P.footprintOf(i));
    const free = (x, z) => x > b.minX + 0.1 + R && x < b.maxX - 0.1 - R && z > b.minZ + 0.1 + R && z < b.maxZ - 0.1 - R
      && !rects.some((f) => x > f.minX - R && x < f.maxX + R && z > f.minZ - R && z < f.maxZ + R);
    const cell = ([x, z]) => [Math.round((x - b.minX) / STEP), Math.round((z - b.minZ) / STEP)];
    const seen = new Uint8Array(nx * nz + nx + nz + 4);
    const idx = (i, j) => j * (nx + 1) + i;
    const [si, sj] = cell(ports[0]);
    const stack = [[si, sj]];
    const pos = (i, j) => [b.minX + i * STEP, b.minZ + j * STEP];
    if (free(...pos(si, sj))) { seen[idx(si, sj)] = 1; } else stack.length = 0;
    while (stack.length) {
      const [i, j] = stack.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni > nx || nj > nz || seen[idx(ni, nj)] || !free(...pos(ni, nj))) return;
        seen[idx(ni, nj)] = 1; stack.push([ni, nj]);
      });
    }
    ports.forEach((p) => { const [i, j] = cell(p); if (!seen[idx(i, j)]) bad.push(`${id}: 出入り口 (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) に、ほかの出入り口から行けません`); });
  });
  assert.deepEqual(bad, [], '\n' + bad.join('\n'));
});

test('廊下は、幅が足りないところには置かず、手すりは廊下の壁の面にあり、パイプは地下だけにある', () => {
  const rooms = byRoom();
  items.filter((i) => i.solid && rooms.get(i.room).kind === 'corridor').forEach((it) => {
    const b = L.roomBounds(rooms.get(it.room));
    assert.ok(Math.min(b.maxX - b.minX, b.maxZ - b.minZ) >= 3.0, `${it.id}: 狭い廊下(3m未満)に置いています`); // 3.0 は、置いても2m近く空く幅
  });
  assert.ok(items.some((i) => i.type === 'rail'), '手すりが1つもありません');
  items.filter((i) => i.type === 'pipe').forEach((i) => assert.equal(i.floor, L.FLOOR_B1F, `${i.id}: パイプが地下にありません`));
  items.filter((i) => i.type === 'padPanel').forEach((i) => assert.ok(/^Padded Room/.test(i.room), `${i.id}: 保護室以外にパッドがあります`));
});

test('同じ入力なら、毎回同じ配置になる(オンラインで、全員が同じ部屋を見る)', () => {
  assert.deepEqual(P.planProps(L.computeLayout()), items);
});
