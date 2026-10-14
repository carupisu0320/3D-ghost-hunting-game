// Sunny Meadows の汚れ(血痕・カビ・ひっかき傷など)を、「どこに・何を貼るか」決める計算だけのファイル(three.js には触らない)。
// 貼り付けは sunny-meadows-decor.js。乱数の種を固定しているので、同じ間取りなら、毎回・全員が同じ場所に同じ汚れが出る。
import * as Layout from './sunny-meadows-layout.js';

export const DECAL_COUNTS = { wall: 150, floor: 70 }; // 汚れの量(壁・床)。増やすほど荒れた感じになる(描画は1回にまとめるので、重くならない)
export const BLOOD_ROOMS = ['Operating Room', 'Morgue', 'Padded Room 01', 'Padded Room 02', 'Examination Room', 'Chapel']; // 血の跡を多めにする部屋

// 乱数(種を固定): 毎回同じ模様・同じ配置になる
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const DECAL = { blood: 0, hands: 1, pool: 2, claws: 3, mold: 4, streak: 5, tally: 6, crack: 7, grime: 8, flake: 9, rust: 10 };
// 汚れの貼る場所を決める(計算だけ。同じ間取りなら、毎回同じ結果)。three.js は使わない
export function planDecals(layout = Layout.computeLayout()) {
  const rnd = mulberry32(7007);
  const out = [];
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const sw = Layout.switchPositions(layout);
  const swList = [...sw.entries()].map(([id, p]) => ({ floor: layout.rooms.find((r) => r.id === id).floor, ...p }));
  const nearSwitch = (floor, x, z) => swList.some((s) => s.floor === floor && Math.hypot(s.x - x, s.z - z) < 0.8);

  const walls = layout.walls.filter((w) => { const o = Layout.wallToWorld(w); return o.to - o.from >= 1.4; });
  const WALL_KINDS = [[DECAL.mold, 3], [DECAL.streak, 4], [DECAL.crack, 3], [DECAL.flake, 3], [DECAL.grime, 3], [DECAL.rust, 2], [DECAL.blood, 2], [DECAL.hands, 1], [DECAL.claws, 1], [DECAL.tally, 1]];
  const wallBag = WALL_KINDS.flatMap(([k, n]) => Array(n).fill(k));
  for (let i = 0; i < DECAL_COUNTS.wall; i++) {
    const w = pick(walls), o = Layout.wallToWorld(w);
    const size = 0.6 + rnd() * 0.9;
    let lo = o.from + size / 2 + 0.1, hi = o.to - size / 2 - 0.1;
    if (hi <= lo) continue;
    let t = lo + rnd() * (hi - lo);
    if (o.doorAt !== undefined && Math.abs(t - o.doorAt) < 0.6 + size / 2 + 0.2) continue; // ドアの上には貼らない
    const side = rnd() > 0.5 ? 1 : -1;
    const x = o.axis === 'x' ? t : o.fixed, z = o.axis === 'x' ? o.fixed : t;
    if (nearSwitch(w.floor, x, z)) continue;
    out.push({ kind: pick(wallBag), plane: 'wall', floor: w.floor, axis: o.axis, side, fixed: o.fixed, t, y: size / 2 + 0.1 + rnd() * Math.max(0.1, 2.85 - size), size });
  }
  const floorRooms = layout.rooms.filter((r) => r.kind !== 'courtyard' && r.kind !== 'stairs');
  const FLOOR_KINDS = [[DECAL.grime, 4], [DECAL.mold, 2], [DECAL.pool, 1], [DECAL.rust, 1]];
  const floorBag = FLOOR_KINDS.flatMap(([k, n]) => Array(n).fill(k));
  const addFloor = (r, kind) => {
    const b = Layout.roomBounds(r), size = 0.8 + rnd() * 1.2;
    if (b.maxX - b.minX < size + 0.4 || b.maxZ - b.minZ < size + 0.4) return;
    out.push({ kind, plane: 'floor', floor: r.floor, x: b.minX + size / 2 + 0.2 + rnd() * (b.maxX - b.minX - size - 0.4), z: b.minZ + size / 2 + 0.2 + rnd() * (b.maxZ - b.minZ - size - 0.4), rot: rnd() * Math.PI * 2, size });
  };
  for (let i = 0; i < DECAL_COUNTS.floor; i++) addFloor(pick(floorRooms), pick(floorBag));
  BLOOD_ROOMS.forEach((id) => { const r = layout.rooms.find((q) => q.id === id); if (r) { addFloor(r, DECAL.pool); addFloor(r, DECAL.pool); addFloor(r, DECAL.grime); } });
  return out;
}

