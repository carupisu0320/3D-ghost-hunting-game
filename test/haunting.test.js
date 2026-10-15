// 幽霊の出没部屋と、浴室の家具の向きの検査(Sunny Meadows)。
//   - 幽霊は、1階だけでなく、地下の部屋にも出る(出没部屋の候補に、地下の部屋が入っている。階の高さはエンジンが扱う)
//   - 浴室のトイレ・洗面台は、北の壁に付くので、タンク・蛇口が壁側(北)を向く(flip)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm, ROOT } = require('./helpers');
const { stripComments } = require('./lib/modgraph');

const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

test('出没部屋の候補(kind が room の部屋)に、地下の部屋が十分に入っている', async () => {
  const L = await loadEsm('sunny-meadows-layout.js');
  const layout = L.computeLayout();
  const candidates = layout.rooms.filter((r) => r.kind === 'room');
  const basement = candidates.filter((r) => r.floor === L.FLOOR_B1F);
  assert.ok(basement.length >= 10, `地下の出没部屋が${basement.length}部屋しかありません`);
  // 候補は部屋ごとに同じ確率なので、地下になる確率は部屋の数の比
  assert.ok(basement.length / candidates.length > 0.2, '地下に出る確率が低すぎます');
});

test('マップは、出没部屋を階で絞らず、地下の部屋も upperFloor 付きで登録している(幽霊の高さが地下になる)', () => {
  const src = read('sunny-meadows-map.js');
  const line = /const hauntableRooms = [^;]*;/.exec(src);
  assert.ok(line, 'hauntableRooms が見つかりません');
  assert.doesNotMatch(line[0], /floor/, '出没部屋を、階で絞っています(地下に出なくなります)');
  assert.match(line[0], /r\.kind === 'room'/);
  assert.match(src, /r\.floor === FLOOR_B1F \? \{ upperFloor: FLOOR_B1F \} : \{\}/, '地下の部屋に upperFloor が付いていません(幽霊が地下の部屋の上空に出ます)');
  assert.match(src, /defineUpperFloor\(FLOOR_B1F, yB1F\)/);
});

test('浴室のトイレと洗面台は、北の壁に付くので、向きを反転(flip)している', () => {
  const src = read('sunny-meadows-map.js');
  assert.match(src, /toiletIn\(id, dx, d - 0\.45, true\)/, 'トイレのタンクが、部屋の中を向いてしまいます');
  assert.match(src, /washstandIn\(id, 3\.9, d - 0\.4, 0\.7, 0\.5, 0\.85, true\)/, '洗面台の蛇口が、部屋の中を向いてしまいます');
  const f = read('engine/furniture.js');
  assert.match(f, /function toiletIn\(name, dx, dz, flip = false\)/);
  assert.match(f, /function washstandIn\(name, dx, dz, w, d, h, flip = false\)/);
});

test('浴室の家具は、ドアのある南の壁ではなく、北の壁側にある(flip の前提)', async () => {
  const L = await loadEsm('sunny-meadows-layout.js');
  const layout = L.computeLayout();
  ['Male Bath', 'Female Bath'].forEach((id) => {
    const r = layout.rooms.find((q) => q.id === id), b = L.roomBounds(r);
    const door = layout.doors.find((d) => d.between.includes(id));
    const w = L.wallToWorld({ axis: door.axis, fixed: door.fixed, from: 0, to: 0, doorAt: door.at });
    assert.ok(w.axis === 'x' && Math.abs(w.fixed - b.minZ) < 0.01, `${id}: ドアが南の壁にありません。トイレを置く向き(flip)を見直してください`);
  });
});
