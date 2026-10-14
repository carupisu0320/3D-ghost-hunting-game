// Sunny Meadows の家具の配置計画。「どの部屋の、どこに、何を置くか」を計算するだけのファイル(three.js には触らない)。
// 実際に3Dにするのは sunny-meadows-props.js。ここは計算だけなので、test/furniture.test.js で、画面を開かずに検査できる。
//
// 考え方
//   - 家具は「型」(TYPES: 大きさと、いくつかの直方体の組み合わせ)と「置き場所」(部屋ごとの手順 RECIPES)に分けてある。
//   - 置き場所は、壁に沿って並べる(run)か、部屋の隅からの距離で指定する(at)。
//     ドアの前・照明スイッチの前・ブレーカーの前・開口(壁なしでつながる所)・すでにある家具には置かない(置けない所は、自動で飛ばす)。
//   - 向き(face)は、家具の「前」が向く方角。N=+z(図の上)、S=-z、E=+x、W=-x。
//   - flip(左右反転): 東の棟など、ドアが反対側にある部屋は、同じ手順を左右反転して使う。
// 家具を足す・動かすときは、型を足すか、RECIPES の手順を直す。壁・ドアの位置は sunny-meadows-layout.js から読むので、間取りを変えても自動で避ける。

import * as Layout from './sunny-meadows-layout.js';

export const WALL_IN = 0.12;        // 壁の面から家具まで、最低限あけるすき間(壁の厚み0.2の半分 + 少し)
export const DOOR_ALONG = 1.15;     // ドアの中心から、壁に沿って空ける長さ(ドア幅1.2の半分 + 余白)
export const DOOR_DEPTH = 1.6;      // ドアから部屋の中へ空ける奥行き(扉が開く分も含む)
export const SWITCH_CLEAR = 0.6;    // 照明スイッチの前(まわり)に空ける長さ
export const ITEM_GAP = 0.08;       // 家具どうしの最低限のすき間
export const CORRIDOR_MIN_WIDTH = 3.0; // 廊下に家具を置くのは、幅がこれ以上あるときだけ(置いても2m近く空く)

// ---- 色(荒れた病院の雰囲気: 色あせた緑・黄ばんだ白・錆) ----
export const COL = {
  wood: 0x5a4632, darkWood: 0x3a2a1c, steel: 0x9aa0a0, darkSteel: 0x55595b, rust: 0x6b3f2a, enamel: 0xd0cec2,
  green: 0x4a5a48, mustard: 0x6e5d33, maroon: 0x5a2f2f, grayBlue: 0x4a5560, linen: 0xcfc9b4, linenStained: 0xa79a7a,
  black: 0x222222, brick: 0x6a3b2e, padded: 0xb8b6aa, sack: 0x8a7a58, coal: 0x1c1c1c, teal: 0x3d5a58,
};

// 部品: B(...) = 直方体、C(...) = 縦の円柱。dx,dz = 家具の中心から横・前へのずれ、dy = 部品の中心の高さ(床から)。
// color が null のときは、家具ごとの色(tint)になる。kind 'w' の直方体は、木目の模様が付く。
const B = (dx, dy, dz, w, h, d, color, kind = 'b') => ({ dx, dy, dz, w, h, d, color, kind });
const C = (dx, dy, dz, r, h, color) => ({ dx, dy, dz, w: r * 2, h, d: r * 2, color, kind: 'c' });

// 型: w, d = 標準の大きさ(置くときに opts.w / opts.d で変えられる)、solid = false なら、当たり判定なし(壁の飾りなど)
// build(w, d, tint) = 部品の一覧。家具の「前」は +z 向き、後ろ(壁側)は -z 向き。
export const TYPES = {
  sofa: { w: 1.9, d: 0.85, tint: COL.green, build: (w, d, t) => [
    B(0, 0.14, 0, w - 0.1, 0.14, d - 0.1, COL.darkWood, 'w'),
    B(0, 0.34, 0.05, w - 0.36, 0.22, d - 0.22, t),
    B(0, 0.62, -d / 2 + 0.12, w - 0.04, 0.6, 0.22, t),
    B(-w / 2 + 0.1, 0.42, 0, 0.2, 0.5, d - 0.04, t), B(w / 2 - 0.1, 0.42, 0, 0.2, 0.5, d - 0.04, t)] },
  armchair: { w: 0.8, d: 0.8, tint: COL.mustard, build: (w, d, t) => [
    B(0, 0.12, 0, w - 0.1, 0.12, d - 0.1, COL.darkWood, 'w'),
    B(0, 0.32, 0.05, w - 0.3, 0.22, d - 0.2, t),
    B(0, 0.6, -d / 2 + 0.1, w - 0.04, 0.6, 0.2, t),
    B(-w / 2 + 0.09, 0.42, 0, 0.18, 0.46, d - 0.04, t), B(w / 2 - 0.09, 0.42, 0, 0.18, 0.46, d - 0.04, t)] },
  chair: { w: 0.45, d: 0.45, tint: COL.wood, build: (w, d) => [
    B(0, 0.45, 0, w - 0.03, 0.05, d - 0.03, COL.wood, 'w'),
    B(0, 0.76, -d / 2 + 0.03, w - 0.03, 0.55, 0.04, COL.wood, 'w'),
    B(-w / 2 + 0.04, 0.22, -d / 2 + 0.04, 0.04, 0.44, 0.04, COL.darkWood), B(w / 2 - 0.04, 0.22, -d / 2 + 0.04, 0.04, 0.44, 0.04, COL.darkWood),
    B(-w / 2 + 0.04, 0.22, d / 2 - 0.04, 0.04, 0.44, 0.04, COL.darkWood), B(w / 2 - 0.04, 0.22, d / 2 - 0.04, 0.04, 0.44, 0.04, COL.darkWood)] },
  table: { w: 1.4, d: 0.9, tint: COL.wood, build: (w, d) => [
    B(0, 0.74, 0, w, 0.06, d, COL.wood, 'w'),
    B(-w / 2 + 0.08, 0.36, -d / 2 + 0.08, 0.07, 0.72, 0.07, COL.darkWood), B(w / 2 - 0.08, 0.36, -d / 2 + 0.08, 0.07, 0.72, 0.07, COL.darkWood),
    B(-w / 2 + 0.08, 0.36, d / 2 - 0.08, 0.07, 0.72, 0.07, COL.darkWood), B(w / 2 - 0.08, 0.36, d / 2 - 0.08, 0.07, 0.72, 0.07, COL.darkWood)] },
  bookshelf: { w: 1.2, d: 0.35, tint: COL.wood, build: (w, d) => [
    B(0, 1.0, -d / 2 + 0.02, w, 2.0, 0.04, COL.darkWood, 'w'),
    B(-w / 2 + 0.02, 1.0, 0, 0.04, 2.0, d, COL.wood, 'w'), B(w / 2 - 0.02, 1.0, 0, 0.04, 2.0, d, COL.wood, 'w'),
    B(0, 0.04, 0, w, 0.08, d, COL.wood, 'w'), B(0, 1.98, 0, w, 0.04, d, COL.wood, 'w'),
    B(0, 0.5, 0.02, w - 0.1, 0.3, d - 0.12, COL.maroon), B(0, 0.95, 0.02, w - 0.1, 0.3, d - 0.12, COL.green),
    B(0, 1.4, 0.02, w - 0.1, 0.3, d - 0.12, COL.mustard), B(0, 1.8, 0.02, w - 0.1, 0.25, d - 0.12, COL.grayBlue)] },
  shelf: { w: 1.2, d: 0.5, tint: COL.darkSteel, build: (w, d, t) => [
    B(-w / 2 + 0.03, 0.95, -d / 2 + 0.03, 0.05, 1.9, 0.05, t), B(w / 2 - 0.03, 0.95, -d / 2 + 0.03, 0.05, 1.9, 0.05, t),
    B(-w / 2 + 0.03, 0.95, d / 2 - 0.03, 0.05, 1.9, 0.05, t), B(w / 2 - 0.03, 0.95, d / 2 - 0.03, 0.05, 1.9, 0.05, t),
    B(0, 0.2, 0, w, 0.04, d, COL.wood, 'w'), B(0, 0.75, 0, w, 0.04, d, COL.wood, 'w'), B(0, 1.3, 0, w, 0.04, d, COL.wood, 'w'), B(0, 1.88, 0, w, 0.04, d, COL.wood, 'w'),
    B(-0.25, 0.37, 0, 0.4, 0.28, d - 0.12, COL.sack), B(0.3, 0.9, 0, 0.35, 0.22, d - 0.14, COL.linenStained), B(-0.2, 1.46, 0, 0.5, 0.26, d - 0.12, COL.rust)] },
  locker: { w: 0.9, d: 0.5, tint: COL.teal, build: (w, d, t) => [
    B(0, 0.95, 0, w, 1.9, d, t),
    B(-w / 4, 1.5, d / 2 + 0.005, 0.02, 0.6, 0.01, COL.black), B(w / 4, 1.5, d / 2 + 0.005, 0.02, 0.6, 0.01, COL.black),
    B(0, 1.75, d / 2 + 0.005, w - 0.1, 0.06, 0.01, COL.black), B(0, 0.4, d / 2 + 0.005, w - 0.1, 0.04, 0.01, COL.black)] },
  cabinet: { w: 0.8, d: 0.4, tint: COL.enamel, build: (w, d, t) => [
    B(0, 0.85, 0, w, 1.7, d, t), B(0, 1.3, d / 2 + 0.005, w - 0.1, 0.6, 0.01, COL.grayBlue),
    B(0, 0.5, d / 2 + 0.005, w - 0.1, 0.5, 0.01, COL.darkSteel), B(0, 0.1, d / 2, w, 0.2, d + 0.02, COL.black)] },
  desk: { w: 1.5, d: 0.75, tint: COL.wood, build: (w, d) => [
    B(0, 0.74, 0, w, 0.05, d, COL.wood, 'w'),
    B(-w / 2 + 0.25, 0.36, 0, 0.45, 0.72, d - 0.06, COL.darkWood, 'w'), B(w / 2 - 0.25, 0.36, 0, 0.45, 0.72, d - 0.06, COL.darkWood, 'w'),
    B(-w / 2 + 0.25, 0.55, d / 2 - 0.02, 0.38, 0.12, 0.02, COL.black), B(w / 2 - 0.25, 0.55, d / 2 - 0.02, 0.38, 0.12, 0.02, COL.black)] },
  filing: { w: 0.45, d: 0.6, tint: COL.darkSteel, build: (w, d, t) => [
    B(0, 0.65, 0, w, 1.3, d, t), B(0, 0.3, d / 2 + 0.005, w - 0.06, 0.02, 0.01, COL.black), B(0, 0.7, d / 2 + 0.005, w - 0.06, 0.02, 0.01, COL.black), B(0, 1.1, d / 2 + 0.005, w - 0.06, 0.02, 0.01, COL.black)] },
  counter: { w: 1.4, d: 0.65, tint: COL.darkWood, build: (w, d) => [
    B(0, 0.43, 0, w, 0.86, d, COL.darkWood, 'w'), B(0, 0.9, 0, w + 0.04, 0.05, d + 0.04, COL.steel),
    B(-w / 4, 0.62, d / 2 + 0.005, w / 2 - 0.06, 0.3, 0.01, COL.black), B(w / 4, 0.62, d / 2 + 0.005, w / 2 - 0.06, 0.3, 0.01, COL.black)] },
  sink: { w: 1.2, d: 0.65, tint: COL.darkWood, build: (w, d) => [
    B(0, 0.43, 0, w, 0.86, d, COL.darkWood, 'w'), B(0, 0.9, 0, w + 0.04, 0.05, d + 0.04, COL.steel),
    B(0, 0.93, 0.02, 0.5, 0.02, 0.38, COL.black), B(0, 1.08, -d / 2 + 0.08, 0.03, 0.25, 0.03, COL.steel), B(0, 1.2, -d / 2 + 0.16, 0.03, 0.03, 0.18, COL.steel)] },
  stove: { w: 1.1, d: 0.7, tint: COL.darkSteel, build: (w, d, t) => [
    B(0, 0.45, 0, w, 0.9, d, t), B(0, 0.93, 0, w, 0.04, d, COL.black),
    B(-0.25, 0.96, -0.12, 0.2, 0.02, 0.2, COL.coal), B(0.25, 0.96, -0.12, 0.2, 0.02, 0.2, COL.coal), B(-0.25, 0.96, 0.18, 0.2, 0.02, 0.2, COL.coal), B(0.25, 0.96, 0.18, 0.2, 0.02, 0.2, COL.coal),
    B(0, 0.5, d / 2 + 0.005, w - 0.2, 0.4, 0.01, COL.black), B(0, 1.9, -0.05, w, 0.55, d - 0.15, COL.steel)] },
  fridge: { w: 0.9, d: 0.8, tint: COL.enamel, build: (w, d, t) => [
    B(0, 1.0, 0, w, 2.0, d, t), B(0, 1.45, d / 2 + 0.005, w - 0.04, 0.02, 0.01, COL.black),
    B(w / 2 - 0.12, 1.0, d / 2 + 0.02, 0.04, 0.5, 0.04, COL.darkSteel), B(w / 2 - 0.12, 1.75, d / 2 + 0.02, 0.04, 0.3, 0.04, COL.darkSteel)] },
  oven: { w: 1.5, d: 1.1, tint: COL.brick, build: (w, d, t) => [
    B(0, 0.7, 0, w, 1.4, d, t), B(0, 0.7, d / 2 + 0.005, 0.7, 0.5, 0.02, COL.black), B(0, 2.2, -0.2, 0.5, 1.6, 0.5, t), B(0, 1.42, 0, w + 0.06, 0.04, d + 0.06, COL.darkSteel)] },
  boilerTank: { w: 1.2, d: 1.2, tint: COL.darkSteel, build: (w, d, t) => [
    B(0, 0.1, 0, w, 0.2, d, COL.black), C(0, 1.2, 0, 0.52, 2.0, t), C(0, 2.3, 0, 0.3, 0.2, COL.rust), C(0.25, 2.65, 0, 0.07, 0.7, COL.rust),
    B(0.4, 1.0, 0.45, 0.06, 0.06, 0.4, COL.rust), B(0, 0.8, d / 2 - 0.02, 0.3, 0.3, 0.04, COL.black)] },
  coalbin: { w: 1.4, d: 1.0, tint: COL.coal, build: (w, d, t) => [
    B(0, 0.4, 0, w, 0.8, d, COL.darkWood, 'w'), B(0, 0.82, 0, w - 0.14, 0.1, d - 0.14, t), B(0.1, 0.9, 0.05, w - 0.5, 0.1, d - 0.4, t)] },
  tub: { w: 1.2, d: 0.7, tint: COL.enamel, build: (w, d, t) => [
    B(0, 0.4, 0, w, 0.8, d, t), B(0, 0.81, 0, w - 0.16, 0.02, d - 0.16, COL.teal), B(0, 1.0, -d / 2 + 0.08, 0.03, 0.3, 0.03, COL.steel)] },
  mangle: { w: 1.0, d: 0.6, tint: COL.darkWood, build: (w, d) => [
    B(0, 0.5, 0, w, 1.0, d, COL.darkWood, 'w'), B(0, 1.1, 0, w - 0.1, 0.18, d - 0.2, COL.steel), B(w / 2 + 0.05, 1.2, 0, 0.06, 0.5, 0.06, COL.rust)] },
  cart: { w: 0.9, d: 0.6, tint: COL.linen, build: (w, d, t) => [
    B(0, 0.2, 0, w, 0.05, d, COL.steel), B(-w / 2 + 0.03, 0.45, 0, 0.04, 0.5, d, COL.darkSteel), B(w / 2 - 0.03, 0.45, 0, 0.04, 0.5, d, COL.darkSteel),
    B(0, 0.5, 0, w - 0.1, 0.4, d - 0.1, t), B(0.1, 0.78, 0.05, w - 0.4, 0.2, d - 0.3, COL.linenStained),
    B(-w / 2 + 0.06, 0.07, -d / 2 + 0.06, 0.06, 0.14, 0.06, COL.black), B(w / 2 - 0.06, 0.07, d / 2 - 0.06, 0.06, 0.14, 0.06, COL.black)] },
  linenPile: { w: 1.0, d: 1.0, tint: COL.linenStained, build: (w, d, t) => [
    B(0, 0.15, 0, w - 0.1, 0.3, d - 0.1, t), B(0.1, 0.4, 0.05, 0.6, 0.2, 0.6, COL.linen), B(-0.2, 0.3, -0.2, 0.4, 0.2, 0.4, t)] },
  barrel: { w: 0.6, d: 0.6, tint: COL.wood, build: (w, d, t) => [
    C(0, 0.45, 0, 0.3, 0.9, t), C(0, 0.2, 0, 0.315, 0.04, COL.darkSteel), C(0, 0.7, 0, 0.315, 0.04, COL.darkSteel)] },
  bucket: { w: 0.4, d: 0.4, tint: COL.steel, build: (w, d, t) => [C(0, 0.18, 0, 0.18, 0.36, t), B(0.35, 0.5, 0, 0.05, 0.9, 0.05, COL.wood, 'w')] },
  crate: { w: 0.6, d: 0.6, tint: COL.wood, build: (w, d) => [
    B(0, 0.25, 0, w, 0.5, d, COL.wood, 'w'), B(0.05, 0.62, 0.02, w - 0.15, 0.24, d - 0.15, COL.darkWood, 'w')] },
  sacks: { w: 0.9, d: 0.6, tint: COL.sack, build: (w, d, t) => [
    B(0, 0.18, 0, w, 0.36, d, t), B(-0.1, 0.5, 0, w - 0.3, 0.28, d - 0.08, COL.linenStained), B(0.15, 0.75, 0, w - 0.5, 0.22, d - 0.14, t)] },
  churn: { w: 0.5, d: 0.5, tint: COL.steel, build: (w, d, t) => [C(0, 0.3, 0, 0.2, 0.6, t), C(0, 0.68, 0, 0.12, 0.16, t), C(0, 0.8, 0, 0.14, 0.04, COL.darkSteel)] },
  bench: { w: 2.0, d: 0.45, tint: COL.wood, build: (w, d) => [
    B(0, 0.45, 0, w, 0.06, d, COL.wood, 'w'), B(-w / 2 + 0.12, 0.22, 0, 0.06, 0.44, d - 0.08, COL.darkWood), B(w / 2 - 0.12, 0.22, 0, 0.06, 0.44, d - 0.08, COL.darkWood),
    B(0, 0.8, -d / 2 + 0.03, w, 0.08, 0.04, COL.wood, 'w')] },
  receptionDesk: { w: 2.4, d: 0.8, tint: COL.darkWood, build: (w, d) => [
    B(0, 0.55, 0, w, 1.1, d, COL.darkWood, 'w'), B(0, 1.12, 0.05, w + 0.1, 0.06, d + 0.12, COL.wood, 'w'), B(0, 0.5, d / 2 + 0.005, w - 0.2, 0.6, 0.01, COL.black)] },
  cot: { w: 0.9, d: 1.9, tint: COL.linenStained, build: (w, d, t) => [
    B(-w / 2 + 0.04, 0.15, -d / 2 + 0.04, 0.05, 0.3, 0.05, COL.darkSteel), B(w / 2 - 0.04, 0.15, -d / 2 + 0.04, 0.05, 0.3, 0.05, COL.darkSteel),
    B(-w / 2 + 0.04, 0.15, d / 2 - 0.04, 0.05, 0.3, 0.05, COL.darkSteel), B(w / 2 - 0.04, 0.15, d / 2 - 0.04, 0.05, 0.3, 0.05, COL.darkSteel),
    B(0, 0.32, 0, w - 0.04, 0.05, d - 0.04, COL.darkSteel), B(0, 0.42, 0, w - 0.08, 0.14, d - 0.1, t), B(0, 0.54, -d / 2 + 0.3, 0.6, 0.1, 0.3, COL.linen),
    B(0, 0.62, -d / 2 + 0.02, w, 0.62, 0.04, COL.darkSteel), B(0, 0.5, d / 2 - 0.02, w, 0.34, 0.04, COL.darkSteel)] },
  gurney: { w: 0.7, d: 1.9, tint: COL.linen, build: (w, d, t) => [
    B(0, 0.5, 0, w - 0.2, 0.06, d - 0.3, COL.darkSteel), B(0, 0.8, 0, w, 0.08, d, COL.steel), B(0, 0.88, 0, w - 0.06, 0.08, d - 0.1, t),
    B(-w / 2 + 0.06, 0.1, -d / 2 + 0.2, 0.08, 0.2, 0.08, COL.black), B(w / 2 - 0.06, 0.1, -d / 2 + 0.2, 0.08, 0.2, 0.08, COL.black),
    B(-w / 2 + 0.06, 0.1, d / 2 - 0.2, 0.08, 0.2, 0.08, COL.black), B(w / 2 - 0.06, 0.1, d / 2 - 0.2, 0.08, 0.2, 0.08, COL.black),
    B(-w / 2 + 0.06, 0.3, 0, 0.04, 0.4, 0.06, COL.darkSteel), B(w / 2 - 0.06, 0.3, 0, 0.04, 0.4, 0.06, COL.darkSteel)] },
  wheelchair: { w: 0.65, d: 0.9, tint: COL.black, build: (w, d, t) => [
    B(0, 0.5, 0.05, w - 0.2, 0.06, 0.45, t), B(0, 0.8, -0.2, w - 0.2, 0.55, 0.04, t),
    B(-w / 2 + 0.03, 0.32, 0, 0.05, 0.6, 0.6, COL.darkSteel), B(w / 2 - 0.03, 0.32, 0, 0.05, 0.6, 0.6, COL.darkSteel),
    B(-w / 2 + 0.1, 0.08, d / 2 - 0.1, 0.05, 0.16, 0.16, COL.black), B(w / 2 - 0.1, 0.08, d / 2 - 0.1, 0.05, 0.16, 0.16, COL.black), B(0, 0.95, -0.25, w - 0.1, 0.04, 0.05, COL.darkSteel)] },
  examTable: { w: 0.8, d: 2.0, tint: COL.teal, build: (w, d, t) => [
    B(0, 0.8, 0, w - 0.1, 0.1, d - 0.1, COL.steel), B(0, 0.88, 0, w - 0.14, 0.06, d - 0.14, t),
    B(0, 0.4, 0, 0.2, 0.8, 0.5, COL.darkSteel), B(0, 0.05, 0, w - 0.2, 0.1, 1.2, COL.darkSteel)] },
  trolley: { w: 0.5, d: 0.8, tint: COL.steel, build: (w, d, t) => [
    B(0, 0.8, 0, w, 0.04, d, t), B(0, 0.25, 0, w, 0.04, d, t),
    B(-w / 2 + 0.03, 0.4, -d / 2 + 0.03, 0.03, 0.8, 0.03, COL.darkSteel), B(w / 2 - 0.03, 0.4, -d / 2 + 0.03, 0.03, 0.8, 0.03, COL.darkSteel),
    B(-w / 2 + 0.03, 0.4, d / 2 - 0.03, 0.03, 0.8, 0.03, COL.darkSteel), B(w / 2 - 0.03, 0.4, d / 2 - 0.03, 0.03, 0.8, 0.03, COL.darkSteel),
    B(0, 0.84, 0, 0.3, 0.03, 0.5, COL.darkSteel), B(0.1, 0.85, -0.2, 0.08, 0.02, 0.2, COL.rust)] },
  lampStand: { w: 0.5, d: 0.5, tint: COL.steel, build: (w, d, t) => [
    B(0, 0.03, 0, 0.45, 0.06, 0.45, COL.darkSteel), C(0, 0.95, 0, 0.03, 1.8, t), B(0, 1.85, 0.15, 0.4, 0.12, 0.4, t)] },
  morgueUnit: { w: 2.4, d: 0.9, tint: COL.steel, build: (w, d, t) => [
    B(0, 0.8, 0, w, 1.6, d, t),
    B(-0.8, 0.4, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel), B(0, 0.4, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel), B(0.8, 0.4, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel),
    B(-0.8, 1.2, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel), B(0, 1.2, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel), B(0.8, 1.2, d / 2 + 0.005, 0.7, 0.55, 0.01, COL.darkSteel),
    B(-0.8, 0.4, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black), B(0, 0.4, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black), B(0.8, 0.4, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black),
    B(-0.8, 1.2, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black), B(0, 1.2, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black), B(0.8, 1.2, d / 2 + 0.02, 0.2, 0.03, 0.03, COL.black)] },
  mattress: { w: 1.0, d: 2.0, tint: COL.padded, build: (w, d, t) => [B(0, 0.07, 0, w, 0.14, d, t), B(0, 0.15, 0, w - 0.2, 0.02, d - 0.2, COL.linenStained)] },
  // ---- 当たり判定のない飾り(solid: false) ----
  padPanel: { w: 1.0, d: 0.08, solid: false, tint: COL.padded, build: (w, d, t) => [B(0, 1.1, 0, w, 2.2, d, t), B(0, 0.55, d / 2 + 0.002, w - 0.1, 0.03, 0.002, COL.linenStained), B(0, 1.65, d / 2 + 0.002, w - 0.1, 0.03, 0.002, COL.linenStained)] },
  rail: { w: 1.0, d: 0.06, solid: false, tint: COL.darkWood, build: (w, d, t) => [B(0, 0.92, 0, w, 0.05, d, t, 'w')] },
  pipe: { w: 1.0, d: 0.14, solid: false, tint: COL.rust, build: (w, d, t) => [B(0, 2.72, 0, w, 0.14, d, t), B(-w / 4, 2.72, 0, 0.1, 0.2, d + 0.04, COL.darkSteel), B(w / 4, 2.72, 0, 0.1, 0.2, d + 0.04, COL.darkSteel)] },
};

// 廊下の壁に沿って置くための、向きを90度回した型(ストレッチャーを、壁と平行に置く)
function alongOf(src) {
  return { w: src.d, d: src.w, tint: src.tint, solid: src.solid, build: (w, d, t) => src.build(d, w, t).map((p) => ({ ...p, dx: p.dz, dz: -p.dx, w: p.d, d: p.w })) };
}
TYPES.gurneyAlong = alongOf(TYPES.gurney);

// 家具の向き(前が向く方角)→ 部品のずれ・大きさの変換(ひとつの向きは90度ずつなので、直方体は軸にそろったまま)
const ROT = {
  N: (x, z) => [x, z], S: (x, z) => [-x, -z], E: (x, z) => [z, -x], W: (x, z) => [-z, x],
};
const SWAP = { N: false, S: false, E: true, W: true };

// 家具1つぶんの床の範囲(世界の座標)
export function footprintOf(it) {
  const sw = SWAP[it.face];
  const hw = (sw ? it.d : it.w) / 2, hd = (sw ? it.w : it.d) / 2;
  return { minX: it.x - hw, maxX: it.x + hw, minZ: it.z - hd, maxZ: it.z + hd };
}

// 家具1つぶんの部品を、世界の座標の直方体(x, y, z = 中心、w, h, d = 大きさ。y は、その階の床からの高さ)にする
export function itemBoxes(it) {
  const type = TYPES[it.type];
  const rot = ROT[it.face], sw = SWAP[it.face];
  return type.build(it.w, it.d, it.tint).map((p) => {
    const [ox, oz] = rot(p.dx, p.dz);
    return { x: it.x + ox, y: p.dy, z: it.z + oz, w: sw ? p.d : p.w, h: p.h, d: sw ? p.w : p.d, color: p.color === null ? it.tint : p.color, kind: p.kind };
  });
}

// ---- 部屋ごとの置き場所の計算 ----
const FLIP_FACE = { E: 'W', W: 'E', N: 'N', S: 'S' };
const overlaps = (a, b, gap = 0) => a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;

// すでにある家具(sunny-meadows-map.js の「家具」のブロックが置くもの)。同じ場所に重ねて置かないための範囲(世界の座標)
export const PRE_EXISTING = {
  'Operating Room': [{ minX: 16.25, maxX: 17.05, minZ: 16.2, maxZ: 18.2 }],           // counterAt((minX+maxX)/2, minZ+3.0, 0.8, 2.0, 0.9)
  'Morgue': [12.0, 14.1, 16.2].map((z) => ({ minX: 3.1, maxX: 3.9, minZ: z - 0.95, maxZ: z + 0.95 })), // counterAt(minX+0.9, minZ+{1.2,3.3,5.4}, 0.8, 1.9, 0.85)
};

function makeContext(layout, byId, switches, roomId, flip) {
  const room = byId.get(roomId);
  const b = Layout.roomBounds(room);
  const inner = { minX: b.minX + WALL_IN, maxX: b.maxX - WALL_IN, minZ: b.minZ + WALL_IN, maxZ: b.maxZ - WALL_IN };
  const mx = (x) => (flip ? b.minX + b.maxX - x : x);
  const mf = (f) => (flip ? FLIP_FACE[f] : f);

  // 置いてはいけない範囲: ドアの前・開口(壁なしでつながる所)・照明スイッチ・ブレーカーの前
  const zones = [];
  const addZone = (minX, maxX, minZ, maxZ) => zones.push({ minX, maxX, minZ, maxZ });
  layout.doors.forEach((d) => {
    if (d.floor !== room.floor || !d.between.includes(room.id)) return;
    const w = Layout.wallToWorld({ axis: d.axis, fixed: d.fixed, from: 0, to: 0, doorAt: d.at });
    if (w.axis === 'z') addZone(w.fixed - DOOR_DEPTH, w.fixed + DOOR_DEPTH, w.doorAt - DOOR_ALONG, w.doorAt + DOOR_ALONG);
    else addZone(w.doorAt - DOOR_ALONG, w.doorAt + DOOR_ALONG, w.fixed - DOOR_DEPTH, w.fixed + DOOR_DEPTH);
  });
  layout.segments.forEach((s) => {
    if (!s.open || s.a.floor !== room.floor || (s.a.id !== room.id && s.b.id !== room.id)) return;
    const w = Layout.wallToWorld({ axis: s.axis, fixed: s.fixed, from: s.lo, to: s.hi, doorAt: null });
    if (w.axis === 'z') addZone(w.fixed - DOOR_DEPTH, w.fixed + DOOR_DEPTH, w.from, w.to);
    else addZone(w.from, w.to, w.fixed - DOOR_DEPTH, w.fixed + DOOR_DEPTH);
  });
  const sw = switches.get(room.id);
  if (sw) addZone(sw.x - SWITCH_CLEAR, sw.x + SWITCH_CLEAR, sw.z - SWITCH_CLEAR, sw.z + SWITCH_CLEAR);
  if (room.id === Layout.BREAKER.room) { // ブレーカーの前は、操作できるように空ける
    const bx = Layout.px2x(Layout.BREAKER.planX), bz = Layout.px2z(Layout.BREAKER.planZ);
    addZone(bx - 0.9, bx + 0.9, bz - 1.3, bz + 0.3);
  }
  const fixedRects = (PRE_EXISTING[room.id] || []).slice();

  const items = [];
  function tryPlace(type, cx, cz, face, opts) { // cx, cz, face は「左右反転する前」の値
    const def = TYPES[type];
    const w = opts.w !== undefined ? opts.w : def.w, d = opts.d !== undefined ? opts.d : def.d;
    const it = { type, room: room.id, floor: room.floor, x: mx(cx), z: cz, face: mf(face), w, d, solid: def.solid !== false, tint: opts.tint !== undefined ? opts.tint : def.tint };
    const r = footprintOf(it);
    if (r.minX < inner.minX - 1e-6 || r.maxX > inner.maxX + 1e-6 || r.minZ < inner.minZ - 1e-6 || r.maxZ > inner.maxZ + 1e-6) return null;
    if (it.solid) {
      if (zones.some((z) => overlaps(r, z))) return null;
      if (fixedRects.some((z) => overlaps(r, z, ITEM_GAP))) return null;
      if (items.some((o) => o.solid && overlaps(r, footprintOf(o), ITEM_GAP))) return null;
    }
    items.push(it);
    return it;
  }
  const length = (side) => (side === 'N' || side === 'S' ? inner.maxX - inner.minX : inner.maxZ - inner.minZ);
  const FACE_OF = { N: 'S', S: 'N', W: 'E', E: 'W' }; // 壁に背を向けて、部屋の中を向く
  function wallSpot(side, type, along, opts) { // 壁に沿って、「along」m の所に置く(左右反転する前の座標)
    const def = TYPES[type];
    const w = opts.w !== undefined ? opts.w : def.w, d = opts.d !== undefined ? opts.d : def.d;
    if (side === 'N') return tryPlace(type, inner.minX + along + w / 2, inner.maxZ - d / 2, FACE_OF.N, opts);
    if (side === 'S') return tryPlace(type, inner.minX + along + w / 2, inner.minZ + d / 2, FACE_OF.S, opts);
    if (side === 'W') return tryPlace(type, inner.minX + d / 2, inner.minZ + along + w / 2, FACE_OF.W, opts);
    return tryPlace(type, inner.maxX - d / 2, inner.minZ + along + w / 2, FACE_OF.E, opts);
  }

  const ctx = {
    items, inner, bounds: b, flip,
    // 壁に沿って、順に並べる。置けない所は、少しずつずらして探す(それでも置けなければ飛ばす)。戻り値: 次に置く位置(壁の端からの距離)
    run(side, list, from = 0, gap = 0.12) {
      let cursor = from;
      list.forEach((spec) => {
        const [type, opts] = Array.isArray(spec) ? spec : [spec, {}];
        const def = TYPES[type], w = opts.w !== undefined ? opts.w : def.w;
        for (let a = cursor; a + w <= length(side) + 1e-6; a += 0.05) {
          if (wallSpot(side, type, a, opts)) { cursor = a + w + gap; break; }
        }
      });
      return cursor;
    },
    // 壁に沿った、1か所を指定して置く(置けなければ null)
    wall(side, type, along, opts = {}) { return wallSpot(side, type, along, opts); },
    // 部屋の隅(図の左下 = 西・南の角)から (ox, oz) m の所に、向き face で置く
    at(type, ox, oz, face = 'N', opts = {}) { return tryPlace(type, b.minX + ox, b.minZ + oz, face, opts); },
  };
  return ctx;
}

// ---- 部屋ごとの手順(床に置く家具。flip = 左右反転) ----
// 手順は、「ドアが東の壁にある」つもりで書く。ドアが西の壁にある部屋は flip = true にする(ドアの前は自動で避ける)。
const dayRoom = (c) => {
  c.run('W', ['sofa', 'sofa'], 0.4);
  c.run('S', ['bookshelf', 'bookshelf'], 1.4);
  c.at('table', 3.3, 3.7, 'N', { w: 1.5, d: 0.9 });
  c.at('chair', 2.2, 3.7, 'E'); c.at('chair', 4.4, 3.7, 'W'); c.at('chair', 3.3, 2.9, 'N'); c.at('chair', 3.3, 4.5, 'S');
  c.run('N', ['armchair', 'armchair', 'armchair'], 0.6, 0.5);
  c.at('barrel', 1.0, 6.2, 'N');
};
const linenRoom = (c) => {
  c.run('N', ['shelf', 'shelf'], 0.2);
  c.run('W', ['cart', 'barrel'], 0.3, 0.4);
  c.at('linenPile', 1.5, 1.4, 'N'); c.at('linenPile', 2.8, 3.0, 'N'); c.at('linenPile', 1.2, 2.6, 'N', { w: 0.8, d: 0.8 });
  c.run('S', ['crate', 'crate'], 0.2);
};
const visitorsRoom = (c) => {
  c.at('table', 1.6, 3.2, 'N', { w: 1.8, d: 0.8 });
  [1.1, 2.1].forEach((x) => { c.at('chair', x, 2.45, 'N'); c.at('chair', x, 3.96, 'S'); });
  c.run('S', ['bench'], 0.4);
  c.run('W', ['locker', 'locker'], 0.9, 0.2);
};
const servantRoom = (c) => {
  c.run('W', ['cot', 'cot'], 0.3, 0.3);
  c.run('N', ['cabinet', 'locker'], 0.4, 0.3);
};
const RECIPES = [
  ['Male Day Room', false, dayRoom],
  ['Female Day Room', true, dayRoom],
  ['East Foul Linen', false, linenRoom],
  ['West Foul Linen', true, linenRoom],
  ['West Visitors Room', false, visitorsRoom],
  ['East Visitors Room', true, visitorsRoom],
  ['Servant Room 2', true, servantRoom],
  ['Utility Room', false, (c) => {
    c.run('S', ['shelf', 'shelf'], 1.2, 0.15);
    c.run('N', ['barrel', 'bucket'], 3.0, 0.2);
    c.wall('W', 'crate', 1.4);
  }],
  ['Scullery', false, (c) => {
    c.run('W', ['sink', 'counter', 'sink'], 0.3, 0.1);
    c.run('N', ['shelf', 'shelf'], 0.4, 0.2);
    c.at('table', 2.6, 3.4, 'N', { w: 1.4, d: 0.8 });
    c.at('barrel', 3.8, 4.9, 'N');
  }],
  ['Servant Dining Room', false, (c) => {
    c.at('table', 2.15, 1.3, 'N', { w: 0.8, d: 1.8 });
    c.at('bench', 1.3, 1.3, 'E', { w: 1.6 });
    c.at('chair', 3.0, 0.7, 'W'); c.at('chair', 3.0, 1.35, 'W');
    c.run('N', ['cabinet', 'cabinet'], 0.3, 0.3);
    c.at('chair', 1.0, 4.9, 'S');
  }],
  ['Kitchen', false, (c) => {
    c.run('N', ['counter', 'sink', 'stove', 'counter', 'counter'], 0.2, 0.05);
    c.at('counter', 3.0, 5.3, 'N', { w: 1.0, d: 3.0 }); // 中央の調理台(両側の壁のドアの間を通れる幅をあけて置く)
    c.run('W', ['fridge', 'shelf'], 4.6, 0.2);
    c.run('E', ['shelf', 'cabinet'], 4.6, 0.2);
    c.at('barrel', 1.0, 0.7, 'N'); c.at('crate', 5.0, 0.7, 'N');
  }],
  ['Boiler House', false, (c) => {
    c.run('N', ['boilerTank', 'boilerTank'], 0.3, 0.3);
    c.run('E', ['coalbin'], 1.2, 0.2);
    c.at('crate', 0.7, 0.9, 'N'); c.at('barrel', 3.7, 0.9, 'N');
  }],
  ['Bake House', false, (c) => {
    c.run('W', ['oven', 'sacks', 'shelf'], 0.2, 0.2);
    c.at('crate', 3.7, 0.5, 'N'); c.at('crate', 3.7, 5.0, 'N');
  }],
  ['Wash House', false, (c) => {
    c.run('W', ['tub', 'tub'], 4.3, 0.2);
    c.at('bucket', 1.9, 5.0, 'N'); c.at('barrel', 2.0, 0.6, 'N');
  }],
  ['Laundry Room', false, (c) => {
    c.run('E', ['mangle', 'tub', 'tub'], 2.2, 0.2);
    c.run('N', ['cart', 'cart'], 0.3, 0.3);
    c.at('linenPile', 2.0, 5.6, 'N'); c.at('linenPile', 1.2, 1.2, 'N', { w: 0.8, d: 0.8 });
  }],
  ['Dairy Store', false, (c) => {
    c.run('N', ['shelf', 'shelf', 'shelf'], 0.2, 0.2);
    c.run('S', ['churn', 'churn', 'churn', 'crate'], 0.3, 0.2);
  }],
  ['Food Store', false, (c) => {
    c.run('N', ['shelf', 'shelf', 'shelf'], 0.2, 0.2);
    c.run('S', ['sacks', 'barrel', 'barrel', 'crate'], 0.3, 0.2);
  }],
  ['Nurse Room', false, (c) => {
    c.at('examTable', 2.1, 3.4, 'N');
    c.run('W', ['cabinet', 'cabinet', 'desk'], 0.5, 0.3);
    c.at('trolley', 3.4, 2.4, 'N'); c.at('lampStand', 3.4, 4.6, 'N');
    c.run('E', ['cot'], 1.5);
  }],
  ['Managers Office', false, (c) => {
    c.at('desk', 3.0, 3.6, 'S', { w: 1.8, d: 0.9 }); c.at('chair', 3.0, 4.45, 'S'); c.at('chair', 3.0, 2.7, 'N');
    c.run('W', ['bookshelf', 'bookshelf', 'bookshelf'], 0.4, 0.2);
    c.run('N', ['filing', 'filing', 'filing'], 0.4, 0.15);
    c.at('armchair', 4.9, 1.0, 'W');
  }],
  ['Waiting Room', true, (c) => {
    c.run('W', ['bench', 'bench'], 0.4, 0.3);
    c.at('bench', 3.0, 3.0, 'N', { w: 1.8 }); c.at('bench', 3.0, 1.2, 'S', { w: 1.8 });
    c.run('N', ['bookshelf', 'chair', 'chair'], 0.4, 0.4);
    c.at('table', 4.8, 4.2, 'N', { w: 0.8, d: 0.6 });
  }],
  ['Morgue', false, (c) => {
    c.run('N', ['morgueUnit'], 0.8);
    c.run('S', ['cabinet', 'cabinet', 'trolley'], 0.6, 0.4);
    c.at('gurney', 4.6, 2.4, 'N');
    c.at('lampStand', 1.0, 5.6, 'N');
  }],
  ['Operating Room', false, (c) => {
    c.run('W', ['cabinet', 'trolley'], 0.5, 0.3);
    c.at('lampStand', 2.4, 2.1, 'N'); c.at('lampStand', 3.2, 2.1, 'N');
    c.run('N', ['cabinet', 'cabinet'], 1.4, 0.3);
  }],
  ['Examination Room', false, (c) => {
    c.at('examTable', 2.8, 2.6, 'E'); c.run('N', ['cabinet', 'cabinet', 'desk'], 0.5, 0.3);
    c.at('trolley', 4.0, 1.9, 'N'); c.at('chair', 0.8, 2.6, 'E'); c.at('lampStand', 1.0, 3.2, 'N');
  }],
  ['Matron Office 1', false, (c) => {
    c.run('N', ['filing', 'filing', 'filing', 'bookshelf', 'bookshelf'], 0.4, 0.2);
    c.at('desk', 3.5, 2.6, 'S', { w: 1.8, d: 0.9 }); c.at('chair', 3.5, 3.2, 'S'); c.at('chair', 3.5, 1.9, 'N');
    c.run('S', ['cot'], 0.4); c.at('crate', 6.3, 3.9, 'N');
  }],
  ['Basement Storage', false, (c) => {
    c.run('W', ['shelf'], 0.1, 0.1); c.run('E', ['shelf'], 0.1, 0.1);
    c.at('crate', 2.2, 1.6, 'N'); c.at('barrel', 3.4, 1.6, 'N');
  }],
];
// 床に置く家具がある部屋(検査で「家具が0個になっていない」ことを確かめる)
export const FURNISHED_ROOMS = RECIPES.map((r) => r[0]);

// 廊下に置く物(ベンチ・車いす・ストレッチャー・カート)。幅が足りない廊下には置かない
const CORRIDOR_STUFF = ['bench', 'wheelchair', 'gurneyAlong', 'cart', 'locker', 'wheelchair'];
const CORRIDOR_ROOMS_SKIP = new Set(['Basement West Corridor N']);

export function planProps(layout = Layout.computeLayout()) {
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const switches = Layout.switchPositions(layout);
  const items = [];

  RECIPES.forEach(([id, flip, fn]) => {
    if (!byId.has(id)) return;
    const c = makeContext(layout, byId, switches, id, flip);
    fn(c);
    c.items.forEach((it, i) => items.push({ ...it, id: `${id}#${i}` }));
  });

  // 廊下: 長い壁に沿って、ところどころに置く(ドア・開口・スイッチの前は自動で避ける)
  let seq = 0;
  layout.rooms.forEach((r) => {
    if (r.kind !== 'corridor' || CORRIDOR_ROOMS_SKIP.has(r.id)) return;
    const b = Layout.roomBounds(r);
    const wx = b.maxX - b.minX, wz = b.maxZ - b.minZ;
    if (Math.min(wx, wz) < CORRIDOR_MIN_WIDTH) return;
    const c = makeContext(layout, byId, switches, r.id, false);
    const longX = wx >= wz;
    const sides = longX ? ['N', 'S'] : ['E', 'W'];
    sides.forEach((side, k) => {
      const len = side === 'N' || side === 'S' ? c.inner.maxX - c.inner.minX : c.inner.maxZ - c.inner.minZ;
      let cursor = 0.8 + k * 3.5;
      for (let guard = 0; guard < 6 && cursor < len - 1; guard++) {
        const type = CORRIDOR_STUFF[(seq++) % CORRIDOR_STUFF.length];
        const w = TYPES[type].w;
        let at = cursor, placed = null;
        for (; at + w <= len && !placed; at += 0.1) placed = c.wall(side, type, at);
        if (!placed) break;
        cursor = at + w + 6.5 + (seq % 3) * 1.5; // 次の物までは、6m以上あける
      }
    });
    c.items.forEach((it, i) => items.push({ ...it, id: `${r.id}#${i}` }));
  });

  items.push(...planDecor(layout, byId));
  return items;
}

// 手すり・パイプ・パッド壁(当たり判定のない飾り)
function planDecor(layout, byId) {
  const out = [];
  const bounds = new Map(layout.rooms.map((r) => [r.id, Layout.roomBounds(r)]));
  const isCorridor = (id) => { const r = byId.get(id); const b = bounds.get(id); return r && r.kind === 'corridor' && Math.min(b.maxX - b.minX, b.maxZ - b.minZ) >= CORRIDOR_MIN_WIDTH; };

  // 廊下の壁に、木の手すり(ドアの前は途切れる)。廊下の側の壁の面に付ける
  layout.walls.forEach((w, wi) => {
    const corr = w.between.find((id) => id !== '外' && isCorridor(id));
    if (!corr) return;
    const o = Layout.wallToWorld(w);
    const cb = bounds.get(corr);
    const spans = o.doorAt === undefined ? [[o.from + 0.3, o.to - 0.3]] : [[o.from + 0.3, o.doorAt - 0.9], [o.doorAt + 0.9, o.to - 0.3]];
    spans.forEach(([a, e], si) => {
      if (e - a < 0.8) return;
      const mid = (a + e) / 2, len = e - a;
      const off = 0.1 + 0.03; // 壁の厚みの半分 + 手すりの厚みの半分
      if (o.axis === 'x') { // z が一定の壁(x方向に延びる)
        const side = (cb.minZ + cb.maxZ) / 2 > o.fixed ? 1 : -1;
        out.push({ id: `rail#${wi}.${si}`, type: 'rail', room: corr, floor: w.floor, x: mid, z: o.fixed + side * off, face: 'N', w: len, d: 0.06, solid: false, tint: COL.darkWood });
      } else {
        const side = (cb.minX + cb.maxX) / 2 > o.fixed ? 1 : -1;
        out.push({ id: `rail#${wi}.${si}`, type: 'rail', room: corr, floor: w.floor, x: o.fixed + side * off, z: mid, face: 'E', w: len, d: 0.06, solid: false, tint: COL.darkWood });
      }
    });
  });

  // 地下の廊下の天井に、古いパイプ(長い壁の脇に2本)
  layout.rooms.forEach((r) => {
    if (r.floor !== Layout.FLOOR_B1F || !isCorridor(r.id)) return;
    const b = bounds.get(r.id);
    const longX = b.maxX - b.minX >= b.maxZ - b.minZ;
    const len = (longX ? b.maxX - b.minX : b.maxZ - b.minZ) - 0.6;
    if (len < 3) return;
    [0.45, (longX ? b.maxZ - b.minZ : b.maxX - b.minX) - 0.45].forEach((s, k) => {
      if (longX) out.push({ id: `pipe#${r.id}.${k}`, type: 'pipe', room: r.id, floor: r.floor, x: (b.minX + b.maxX) / 2, z: b.minZ + s, face: 'N', w: len, d: 0.14, solid: false, tint: k === 0 ? COL.rust : COL.darkSteel });
      else out.push({ id: `pipe#${r.id}.${k}`, type: 'pipe', room: r.id, floor: r.floor, x: b.minX + s, z: (b.minZ + b.maxZ) / 2, face: 'E', w: len, d: 0.14, solid: false, tint: k === 0 ? COL.rust : COL.darkSteel });
    });
  });

  // 保護室(パッド壁): 部屋の壁を、ドアの前をあけて、パッドで囲む
  ['Padded Room 01', 'Padded Room 02'].forEach((id) => {
    const r = byId.get(id);
    if (!r) return;
    const b = bounds.get(id);
    const doors = layout.doors.filter((d) => d.floor === r.floor && d.between.includes(id)).map((d) => Layout.wallToWorld({ axis: d.axis, fixed: d.fixed, from: 0, to: 0, doorAt: d.at }));
    const t = 0.08, e = 0.1 + t / 2; // 壁の面にぴったり付ける
    const sidesDef = [
      { axis: 'x', fixed: b.minZ, from: b.minX, to: b.maxX, dir: 1, face: 'N' }, { axis: 'x', fixed: b.maxZ, from: b.minX, to: b.maxX, dir: -1, face: 'S' },
      { axis: 'z', fixed: b.minX, from: b.minZ, to: b.maxZ, dir: 1, face: 'E' }, { axis: 'z', fixed: b.maxX, from: b.minZ, to: b.maxZ, dir: -1, face: 'W' },
    ];
    sidesDef.forEach((sd, si) => {
      const door = doors.find((d) => d.axis === sd.axis && Math.abs(d.fixed - sd.fixed) < 0.05);
      const spans = door ? [[sd.from + 0.1, door.doorAt - 0.7], [door.doorAt + 0.7, sd.to - 0.1]] : [[sd.from + 0.1, sd.to - 0.1]];
      spans.forEach(([a, z1], k) => {
        if (z1 - a < 0.3) return;
        const len = z1 - a, mid = (a + z1) / 2;
        if (sd.axis === 'x') out.push({ id: `pad#${id}.${si}.${k}`, type: 'padPanel', room: id, floor: r.floor, x: mid, z: sd.fixed + sd.dir * e, face: sd.face, w: len, d: t, solid: false, tint: COL.padded });
        else out.push({ id: `pad#${id}.${si}.${k}`, type: 'padPanel', room: id, floor: r.floor, x: sd.fixed + sd.dir * e, z: mid, face: sd.face, w: len, d: t, solid: false, tint: COL.padded });
      });
    });
    // 床にマットレス
    out.push({ id: `mat#${id}`, type: 'mattress', room: id, floor: r.floor, x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 + 0.3, face: 'N', w: Math.min(1.0, b.maxX - b.minX - 1.0), d: Math.min(1.8, b.maxZ - b.minZ - 0.9), solid: false, tint: COL.padded });
  });
  return out;
}
