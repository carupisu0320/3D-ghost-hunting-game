// Sunny Meadows Mental Institution の間取り(部屋・ドア・階段)と、そこから壁・ドア・スイッチの位置を計算する部分。
// 画面(three.js)には触らない、計算だけのファイル。sunny-meadows-map.js が使う。
//
// 元になった図(2枚)の「ピクセル座標」をそのまま使っている(図の左上が原点、右が+x、下が+y)。
//   1ピクセル = 0.1m。1階の図は、そのまま 約100m × 44m の建物になる。
//   地下(B1F)は、1階の真下にそのまま重なっている(図では、地下だけ上にずらして描いてあったので、1階と同じ座標になるよう直してある)。
// ゲームの世界の座標に直すとき(px2x, px2z): 玄関(図の下側)を z=0 にして、奥(図の上側)へ行くほど z が大きくなる。
//   これは、ほかのマップ(Grafton Farmhouse)と同じ向き(玄関が z=0、ミニマップの上が +z)。
//
// 部屋は、四角形(x0,x1,z0,z1: 図の座標で、z0 < z1)で表す。L字や長い廊下は、同じ group の四角形を並べて表す。
// 壁は、「となり合う2つの四角形が接している線」と「どこにも接していない線(外壁)」から、自動で作る。
//   - 同じ group の四角形どうし → 壁なし(つながった1つの空間)
//   - LINKS に書いたペア → ドア(type: 'door')か、壁なし(type: 'open')
//   - どちらでもない → 壁(ドアなし)
// ドアのない部屋は、行き来できない部屋(図で赤い×が付いている部屋など)になる。

export const PX = 0.1;                       // 1ピクセルあたりのメートル
export const PLAN_X0 = 20;                   // 図の x=20 を、世界の x=0 にする
export const PLAN_Z_FRONT = 665;             // 図の y=665(玄関の前の壁)を、世界の z=0 にする
export const px2x = (px) => (px - PLAN_X0) * PX;
export const px2z = (py) => (PLAN_Z_FRONT - py) * PX;
export const FLOOR_1F = 0;
export const FLOOR_B1F = 1;
export const B1F_DEPTH = 3.0;                // 地下の床は、1階の床より、これだけ低い(壁の高さと同じ)

const R = (id, floor, x0, x1, z0, z1, o = {}) => ({ id, floor, x0, x1, z0, z1, group: o.group || id, kind: o.kind || 'room', ...o });
// kind: 'room'(普通の部屋) / 'corridor'(廊下) / 'stairs'(階段室) / 'sealed'(入れない部屋) / 'courtyard'(中庭。屋根なし)

// 東側の棟は、西側の棟を、建物の中心線(x=520)で折り返した形
const mx = (x) => 1040 - x;
const mirror = (id, floor, x0, x1, z0, z1, o = {}) => R(id, floor, mx(x1), mx(x0), z0, z1, o);

export const ROOMS = [
  // ============ 1階 ============
  // ---- 男性棟(西) ----
  R('Male Dorm', FLOOR_1F, 24, 85, 449, 514),
  R('Male Day Room', FLOOR_1F, 24, 85, 514, 587),
  R('Male Wing Spur', FLOOR_1F, 85, 109, 482, 523, { group: 'Male Wing', kind: 'corridor' }),
  R('Male Wing 1', FLOOR_1F, 85, 190, 523, 555, { group: 'Male Wing', kind: 'corridor' }),
  R('Male Wing 2', FLOOR_1F, 190, 297, 523, 555, { group: 'Male Wing', kind: 'corridor' }),
  R('Male Wing 3', FLOOR_1F, 297, 404, 523, 555, { group: 'Male Wing', kind: 'corridor' }),
  R('Male West Stairwell', FLOOR_1F, 119, 163, 480, 523, { kind: 'stairs' }),
  R('Male Bath', FLOOR_1F, 163, 210, 480, 523, { cool: true }),
  R('Male Room 05', FLOOR_1F, 210, 240, 480, 523),
  R('Male Room 04', FLOOR_1F, 240, 270, 480, 523),
  R('Male Room 03', FLOOR_1F, 270, 300, 480, 523),
  R('Male Room 02', FLOOR_1F, 300, 330, 480, 523),
  R('Male Room 01', FLOOR_1F, 330, 360, 480, 523),
  // ---- 女性棟(東) ----
  mirror('Female Dorm', FLOOR_1F, 24, 85, 449, 514),
  mirror('Female Day Room', FLOOR_1F, 24, 85, 514, 587),
  mirror('Female Wing Spur', FLOOR_1F, 85, 109, 482, 523, { group: 'Female Wing', kind: 'corridor' }),
  mirror('Female Wing 1', FLOOR_1F, 85, 190, 523, 555, { group: 'Female Wing', kind: 'corridor' }),
  mirror('Female Wing 2', FLOOR_1F, 190, 297, 523, 555, { group: 'Female Wing', kind: 'corridor' }),
  mirror('Female Wing 3', FLOOR_1F, 297, 404, 523, 555, { group: 'Female Wing', kind: 'corridor' }),
  mirror('Female East Stairwell', FLOOR_1F, 119, 163, 480, 523, { kind: 'stairs' }),
  mirror('Female Bath', FLOOR_1F, 163, 210, 480, 523, { cool: true }),
  mirror('Female Room 05', FLOOR_1F, 210, 240, 480, 523),
  mirror('Female Room 04', FLOOR_1F, 240, 270, 480, 523),
  mirror('Female Room 03', FLOOR_1F, 270, 300, 480, 523),
  mirror('Female Room 02', FLOOR_1F, 300, 330, 480, 523),
  mirror('Female Room 01', FLOOR_1F, 330, 360, 480, 523),
  // ---- 中央の左右の列(中庭廊下の外側) ----
  R('East Foul Linen', FLOOR_1F, 360, 404, 339, 381),
  R('Class Room', FLOOR_1F, 360, 404, 381, 459),
  R('West Visitors Room', FLOOR_1F, 360, 404, 459, 502),
  R('Male Closet', FLOOR_1F, 360, 404, 502, 523, { kind: 'sealed' }),
  R('West Foul Linen', FLOOR_1F, 636, 680, 339, 381),
  R('Servant Room 2', FLOOR_1F, 636, 680, 381, 420),
  R('Servant Room 1', FLOOR_1F, 636, 680, 420, 459, { kind: 'sealed' }),
  R('East Visitors Room', FLOOR_1F, 636, 680, 459, 502),
  R('Utility Room', FLOOR_1F, 636, 680, 502, 523),
  // ---- 北の棟(キッチンなど) ----
  R('Scullery', FLOOR_1F, 446, 489, 226, 282),
  R('Servant Dining Room', FLOOR_1F, 446, 489, 282, 339),
  R('Kitchen', FLOOR_1F, 489, 549, 226, 339),
  R('Boiler House', FLOOR_1F, 549, 592, 226, 282),
  R('Bake House', FLOOR_1F, 549, 592, 282, 339),
  R('Wash House', FLOOR_1F, 592, 617, 265, 339),
  R('Laundry Room', FLOOR_1F, 617, 666, 265, 339),
  R('Dairy Store', FLOOR_1F, 372, 429, 282, 310),
  R('Food Store', FLOOR_1F, 372, 429, 310, 339),
  // ---- 中庭廊下(中庭をぐるりと囲む) ----
  R('CC Strip', FLOOR_1F, 429, 446, 282, 339, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC North 1', FLOOR_1F, 404, 481, 339, 359, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC North 2', FLOOR_1F, 481, 559, 339, 359, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC North 3', FLOOR_1F, 559, 636, 339, 359, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC West 1', FLOOR_1F, 404, 424, 359, 441, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC West 2', FLOOR_1F, 404, 424, 441, 523, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC East 1', FLOOR_1F, 616, 636, 359, 441, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC East 2', FLOOR_1F, 616, 636, 441, 523, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC South West', FLOOR_1F, 404, 466, 523, 555, { group: 'Courtyard Corridor', kind: 'corridor' }),
  R('CC South East', FLOOR_1F, 574, 636, 523, 555, { group: 'Courtyard Corridor', kind: 'corridor' }),
  // ---- 中庭・礼拝堂・診療所 ----
  R('Courtyard', FLOOR_1F, 424, 616, 359, 456, { kind: 'courtyard' }),
  R('Nurse Room', FLOOR_1F, 424, 466, 456, 523),
  R('Chapel', FLOOR_1F, 466, 616, 456, 523),
  R('Entrance Corridor', FLOOR_1F, 466, 574, 523, 555, { kind: 'corridor' }),
  // ---- 玄関まわり ----
  R('Left Entrance Stairwell', FLOOR_1F, 470, 510, 555, 592, { kind: 'stairs' }),
  R('Connecting Corridor', FLOOR_1F, 510, 530, 555, 592, { kind: 'corridor' }),
  R('Right Entrance Stairwell', FLOOR_1F, 530, 570, 555, 592, { kind: 'sealed' }),
  R('Managers Office', FLOOR_1F, 440, 500, 592, 644),
  R('Foyer', FLOOR_1F, 500, 540, 592, 665),
  R('Waiting Room', FLOOR_1F, 540, 600, 592, 644),

  // ============ 地下(B1F) ============
  // ---- 病棟(西) ----
  R('Morgue', FLOOR_B1F, 46, 106, 484, 557, { cool: true }),
  R('Hospital West Stairwell', FLOOR_B1F, 119, 163, 480, 523, { kind: 'stairs' }),
  R('Operating Room', FLOOR_B1F, 163, 210, 480, 523, { cool: true }),
  R('Hospital Room 05', FLOOR_B1F, 210, 240, 480, 523),
  R('Hospital Room 04', FLOOR_B1F, 240, 270, 480, 523),
  R('Hospital Room 03', FLOOR_B1F, 270, 300, 480, 523),
  R('Hospital Room 02', FLOOR_B1F, 300, 330, 480, 523),
  R('Hospital Room 01', FLOOR_B1F, 330, 360, 480, 523),
  R('Hospital Wing 1', FLOOR_B1F, 106, 205, 523, 555, { group: 'Hospital Wing', kind: 'corridor' }),
  R('Hospital Wing 2', FLOOR_B1F, 205, 305, 523, 555, { group: 'Hospital Wing', kind: 'corridor' }),
  R('Hospital Wing 3', FLOOR_B1F, 305, 404, 523, 555, { group: 'Hospital Wing', kind: 'corridor' }),
  R('Basement Storage', FLOOR_B1F, 360, 404, 502, 523),
  // ---- 中央の地下 ----
  R('Basement West Corridor', FLOOR_B1F, 404, 466, 523, 555, { group: 'Basement West Corridor', kind: 'corridor' }),
  R('Basement West Corridor N', FLOOR_B1F, 404, 428, 499, 523, { group: 'Basement West Corridor', kind: 'corridor' }),
  R('Padded Room 01', FLOOR_B1F, 428, 452, 499, 523),
  R('Matron Office 1', FLOOR_B1F, 452, 522, 480, 523),
  R('Matron Office 2', FLOOR_B1F, 522, 580, 480, 523, { kind: 'sealed' }),
  R('Padded Room 02', FLOOR_B1F, 580, 614, 497, 523),
  R('Basement Corridor', FLOOR_B1F, 466, 574, 523, 555, { kind: 'corridor' }),
  R('Basement East Corridor', FLOOR_B1F, 574, 636, 523, 555, { kind: 'corridor' }),
  R('Basement Left Stairwell', FLOOR_B1F, 470, 510, 555, 592, { kind: 'stairs' }),
  // ---- 立入禁止区域(東) ----
  R('Restricted Area 1', FLOOR_B1F, 636, 780, 523, 555, { group: 'Restricted Area', kind: 'corridor' }),
  R('Restricted Area 2', FLOOR_B1F, 780, 925, 523, 555, { group: 'Restricted Area', kind: 'corridor' }),
  R('Restricted Room 01', FLOOR_B1F, 680, 710, 480, 523),
  R('Restricted Room 02', FLOOR_B1F, 710, 740, 480, 523),
  R('Restricted Room 03', FLOOR_B1F, 740, 770, 480, 523),
  R('Restricted Room 04', FLOOR_B1F, 770, 800, 480, 523),
  R('Restricted Room 05', FLOOR_B1F, 800, 830, 480, 523),
  R('Examination Room', FLOOR_B1F, 830, 877, 480, 523, { cool: true }),
  R('Restricted East Stairwell', FLOOR_B1F, 877, 921, 480, 523, { kind: 'stairs' }),
];

// ---- ドア・開口の一覧 ----
// L(a, b, type, opts): a と b は、部屋の id か group の名前。type: 'door'(ドア) / 'open'(壁なし)
//   opts.at: ドアの位置(図の座標。壁に沿った方向)。省略すると、接している線の真ん中。
// 同じペアが何か所かで接しているときは、一番長く接している所だけにドアが付く('open' は、接している所すべて)。
const L = (a, b, type = 'door', opts = {}) => ({ a, b, type, ...opts });

export const LINKS = [
  // ---- 玄関まわり ----
  L('Foyer', 'Managers Office'), L('Foyer', 'Waiting Room'), L('Foyer', 'Connecting Corridor'),
  L('Connecting Corridor', 'Entrance Corridor', 'open'),
  L('Connecting Corridor', 'Left Entrance Stairwell'),
  L('Left Entrance Stairwell', 'Entrance Corridor', 'door', { at: 481 }), // 階段の上り口の、すぐ前
  L('Entrance Corridor', 'Chapel'),
  L('Entrance Corridor', 'CC South West'), L('Entrance Corridor', 'CC South East'),
  // ---- 中庭まわり ----
  L('Courtyard', 'CC North 2'), L('Courtyard', 'CC West 1'), L('Courtyard', 'CC East 1'),
  L('Courtyard', 'Nurse Room', 'door', { at: 445 }), L('Courtyard', 'Chapel', 'door', { at: 540 }),
  L('Nurse Room', 'CC West 2'),
  L('East Foul Linen', 'CC West 1'), L('Class Room', 'CC West 1'), L('West Visitors Room', 'CC West 2'),
  L('West Foul Linen', 'CC East 1'), L('Servant Room 2', 'CC East 1'), L('East Visitors Room', 'CC East 2'), L('Utility Room', 'CC East 2'),
  // ---- 北の棟 ----
  L('Dairy Store', 'CC Strip'), L('Food Store', 'CC Strip'), L('Servant Dining Room', 'CC Strip'),
  L('Scullery', 'Servant Dining Room'), L('Scullery', 'Kitchen'), L('Servant Dining Room', 'Kitchen'),
  L('Kitchen', 'CC North 2'), L('Kitchen', 'Bake House'), L('Kitchen', 'Boiler House'), L('Boiler House', 'Bake House'),
  L('Bake House', 'CC North 3'), L('Bake House', 'Wash House'), L('Wash House', 'CC North 3'), L('Wash House', 'Laundry Room'), L('Laundry Room', 'CC North 3'),
  // ---- 男性棟 ----
  L('Male Dorm', 'Male Wing'), L('Male Day Room', 'Male Wing'),
  L('Male West Stairwell', 'Male Wing', 'door', { at: 131 }), // 階段の上り口の、すぐ前
  L('Male Bath', 'Male Wing'),
  L('Male Room 05', 'Male Wing'), L('Male Room 04', 'Male Wing'), L('Male Room 03', 'Male Wing'), L('Male Room 02', 'Male Wing'), L('Male Room 01', 'Male Wing'),
  L('Male Wing', 'Courtyard Corridor'),
  // ---- 女性棟 ----
  L('Female Dorm', 'Female Wing'), L('Female Day Room', 'Female Wing'),
  L('Female East Stairwell', 'Female Wing', 'door', { at: mx(131) }),
  L('Female Bath', 'Female Wing'),
  L('Female Room 05', 'Female Wing'), L('Female Room 04', 'Female Wing'), L('Female Room 03', 'Female Wing'), L('Female Room 02', 'Female Wing'), L('Female Room 01', 'Female Wing'),
  L('Female Wing', 'Courtyard Corridor'),
  // ---- 地下: 病棟 ----
  L('Morgue', 'Hospital Wing'), L('Operating Room', 'Hospital Wing'),
  L('Hospital West Stairwell', 'Hospital Wing', 'door', { at: 152 }), // 階段の脇の、ひと続きの空間から出る
  L('Hospital Room 05', 'Hospital Wing'), L('Hospital Room 04', 'Hospital Wing'), L('Hospital Room 03', 'Hospital Wing'), L('Hospital Room 02', 'Hospital Wing'), L('Hospital Room 01', 'Hospital Wing'),
  L('Basement Storage', 'Hospital Wing'),
  L('Hospital Wing', 'Basement West Corridor'),
  // ---- 地下: 中央 ----
  L('Padded Room 01', 'Basement West Corridor'), L('Matron Office 1', 'Basement Corridor'),
  L('Basement West Corridor', 'Basement Corridor'), L('Basement Corridor', 'Basement East Corridor'),
  L('Padded Room 02', 'Basement East Corridor'),
  L('Basement Left Stairwell', 'Basement Corridor', 'door', { at: 500 }),
  L('Basement East Corridor', 'Restricted Area'),
  // ---- 地下: 立入禁止区域 ----
  L('Restricted Room 01', 'Restricted Area'), L('Restricted Room 02', 'Restricted Area'), L('Restricted Room 03', 'Restricted Area'),
  L('Restricted Room 04', 'Restricted Area'), L('Restricted Room 05', 'Restricted Area'),
  L('Examination Room', 'Restricted Area'),
  L('Restricted East Stairwell', 'Restricted Area', 'door', { at: mx(152) }),
];

// 玄関(外へ出るドア): 玄関(Foyer)の、南の壁(図の下側)
export const EXTERIOR_DOORS = [{ room: 'Foyer', side: 'S', at: 520 }];

// ---- 階段 ----
// 1階と地下をつなぐ、まっすぐな階段が3か所。図の A1(玄関の左の階段)・A2(男性棟の西の階段)・A3(女性棟の東の階段)。
//   rect: 階段の部分(図の座標。z0 < z1)。axis は z 方向(南北)に延びる。
//   highZ: 1階の高さ(上り口)がある側の z、lowZ: 地下の床(下り口)がある側の z
//   sideX: 階段の脇の壁の x(その向こうが、階段の脇の通路)。1階はこの壁が全長、地下は下り口の手前までで、下り口で脇の通路へ出られる
//   outerSide: 階段の脇の壁の、階段と反対側(通路の側)が +x か -x か
export const STAIRS = [
  { id: 'A2', rect: { x0: 121, x1: 141, z0: 490, z1: 520 }, highZ: 520, lowZ: 490, sideX: 141, outer: +1, room1F: 'Male West Stairwell', roomB1F: 'Hospital West Stairwell' },
  { id: 'A3', rect: { x0: mx(141), x1: mx(121), z0: 490, z1: 520 }, highZ: 520, lowZ: 490, sideX: mx(141), outer: -1, room1F: 'Female East Stairwell', roomB1F: 'Restricted East Stairwell' },
  { id: 'A1', rect: { x0: 472, x1: 490, z0: 557, z1: 590 }, highZ: 557, lowZ: 590, sideX: 490, outer: +1, room1F: 'Left Entrance Stairwell', roomB1F: 'Basement Left Stairwell' },
];
export const STAIR_EXIT_GAP = 10; // 地下の脇の壁を、下り口の手前で止める長さ(図のピクセル。10 = 1.0m)

// ---- 場所の設定 ----
export const BREAKER = { room: 'Utility Room', planX: 655, planZ: 502, wall: 'N' }; // ブレーカー(ヒューズボックス)。北の壁
export const ORB_ROOM = 'Chapel';
// 監視カメラを置く部屋。テントのモニターは、横一列に6台までしか並ばない(テントの幅が5.5mで、Grafton Farmhouse と同じ作り)
export const CAMERAS = ['Foyer', 'Chapel', 'Kitchen', 'Male Wing 2', 'Female Wing 2', 'Basement Corridor'];

// ---- 計算: 部屋の四角形のとなり合わせから、壁・ドアを作る ----
const sameGroup = (a, b) => a.group === b.group;
const matches = (room, key) => room.id === key || room.group === key;

// となり合う2つの四角形(同じ階)が接している線を、すべて求める
//   axis 'z': x が一定の縦の線(壁は z 方向に延びる)/ axis 'x': z が一定の横の線(壁は x 方向に延びる)
export function sharedSegments(rooms) {
  const segs = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const A = rooms[i], B = rooms[j];
    if (A.floor !== B.floor) continue;
    const zlo = Math.max(A.z0, B.z0), zhi = Math.min(A.z1, B.z1);
    const xlo = Math.max(A.x0, B.x0), xhi = Math.min(A.x1, B.x1);
    if (zhi > zlo) { // 縦の線
      if (A.x1 === B.x0) segs.push({ a: A, b: B, axis: 'z', fixed: A.x1, lo: zlo, hi: zhi });
      else if (B.x1 === A.x0) segs.push({ a: A, b: B, axis: 'z', fixed: A.x0, lo: zlo, hi: zhi });
    }
    if (xhi > xlo) { // 横の線
      if (A.z1 === B.z0) segs.push({ a: A, b: B, axis: 'x', fixed: A.z1, lo: xlo, hi: xhi });
      else if (B.z1 === A.z0) segs.push({ a: A, b: B, axis: 'x', fixed: A.z0, lo: xlo, hi: xhi });
    }
  }
  return segs;
}

export const DOOR_HALF_PX = 6;       // ドアの幅(1.2m)の半分(図のピクセル)
export const DOOR_MARGIN_PX = 1;     // ドアの端と、壁の端の間に、最低限あける長さ

// 戻り値: { rooms, segments(壁ごとの情報), walls(壁), doors(ドア), warnings }
export function computeLayout(rooms = ROOMS, links = LINKS, exteriorDoors = EXTERIOR_DOORS) {
  const warnings = [];
  const segs = sharedSegments(rooms);
  segs.forEach((s) => { s.open = sameGroup(s.a, s.b); s.door = null; });

  // 部屋どうしの設定を、接している線に当てはめる
  links.forEach((lk) => {
    const cands = segs.filter((s) => (matches(s.a, lk.a) && matches(s.b, lk.b)) || (matches(s.a, lk.b) && matches(s.b, lk.a)));
    if (cands.length === 0) { warnings.push(`接している線がありません: ${lk.a} - ${lk.b}`); return; }
    if (lk.type === 'open') { cands.forEach((s) => { s.open = true; }); return; }
    let best = null;
    if (lk.at !== undefined) best = cands.find((s) => s.lo <= lk.at && lk.at <= s.hi) || null;
    if (!best) best = cands.reduce((m, s) => (!m || s.hi - s.lo > m.hi - m.lo ? s : m), null);
    const at = lk.at !== undefined && lk.at >= best.lo && lk.at <= best.hi ? lk.at : (best.lo + best.hi) / 2;
    if (at - DOOR_HALF_PX < best.lo + DOOR_MARGIN_PX || at + DOOR_HALF_PX > best.hi - DOOR_MARGIN_PX) {
      warnings.push(`ドアが入りません(接している長さ ${best.hi - best.lo}px): ${lk.a} - ${lk.b}`);
    }
    if (best.door) warnings.push(`同じ壁に、ドアが2つ指定されています: ${lk.a} - ${lk.b}`);
    best.door = { at, locked: !!lk.locked };
  });

  const walls = [];
  const doors = [];
  const addWallRec = (floor, axis, fixed, from, to, door, between) => {
    walls.push({ floor, axis, fixed, from, to, doorAt: door ? door.at : null, between });
    if (door) doors.push({ floor, axis, fixed, at: door.at, locked: !!door.locked, between });
  };
  // 1) 部屋どうしの壁
  segs.forEach((s) => { if (!s.open) addWallRec(s.a.floor, s.axis, s.fixed, s.lo, s.hi, s.door, [s.a.id, s.b.id]); });
  // 2) 外壁(どの部屋にも接していない辺)
  const sides = (r) => [
    { side: 'W', axis: 'z', fixed: r.x0, lo: r.z0, hi: r.z1 }, { side: 'E', axis: 'z', fixed: r.x1, lo: r.z0, hi: r.z1 },
    { side: 'N', axis: 'x', fixed: r.z0, lo: r.x0, hi: r.x1 }, { side: 'S', axis: 'x', fixed: r.z1, lo: r.x0, hi: r.x1 },
  ];
  rooms.forEach((r) => {
    sides(r).forEach((sd) => {
      // この辺に接している線(となりの部屋との)を集めて、残りの部分を外壁にする
      const covered = segs
        .filter((s) => (s.a === r || s.b === r) && s.axis === sd.axis && s.fixed === sd.fixed)
        .map((s) => [Math.max(s.lo, sd.lo), Math.min(s.hi, sd.hi)])
        .filter(([a, b]) => b > a)
        .sort((p, q) => p[0] - q[0]);
      let cur = sd.lo; const gaps = [];
      covered.forEach(([a, b]) => { if (a > cur) gaps.push([cur, a]); cur = Math.max(cur, b); });
      if (cur < sd.hi) gaps.push([cur, sd.hi]);
      gaps.forEach(([a, b]) => {
        const ex = exteriorDoors.find((e) => e.room === r.id && e.side === sd.side && e.at >= a && e.at <= b);
        if (ex && (ex.at - DOOR_HALF_PX < a + DOOR_MARGIN_PX || ex.at + DOOR_HALF_PX > b - DOOR_MARGIN_PX)) warnings.push(`外のドアが入りません: ${r.id}`);
        addWallRec(r.floor, sd.axis, sd.fixed, a, b, ex ? { at: ex.at, locked: false, exterior: true } : null, [r.id, '外']);
      });
    });
  });
  // 3) 近すぎる(すき間の細い)壁の検出: 平行な辺が1〜5pxだけ離れていて重なっている部屋の組(つなぎ目のずれ)
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const A = rooms[i], B = rooms[j];
    if (A.floor !== B.floor) continue;
    const zov = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0), xov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
    const gapX = Math.min(Math.abs(A.x1 - B.x0), Math.abs(B.x1 - A.x0)), gapZ = Math.min(Math.abs(A.z1 - B.z0), Math.abs(B.z1 - A.z0));
    if (zov > 0 && gapX > 0 && gapX <= 5) warnings.push(`すき間が細すぎます(${gapX}px): ${A.id} と ${B.id}`);
    if (xov > 0 && gapZ > 0 && gapZ <= 5) warnings.push(`すき間が細すぎます(${gapZ}px): ${A.id} と ${B.id}`);
    if (zov > 0 && xov > 0) warnings.push(`部屋が重なっています: ${A.id} と ${B.id}`);
  }
  return { rooms, segments: segs, walls, doors, warnings };
}

// 階をまたいで、行き来できる部屋の範囲を調べる(階段でつなぐ)。fromId から入れる部屋の id の集合
export function reachableRooms(layout, fromId, stairs = STAIRS) {
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));
  const adj = new Map(layout.rooms.map((r) => [r.id, new Set()]));
  const link = (a, b) => { adj.get(a).add(b); adj.get(b).add(a); };
  layout.segments.forEach((s) => { if (s.open || s.door) link(s.a.id, s.b.id); });
  stairs.forEach((st) => link(st.room1F, st.roomB1F));
  const seen = new Set([fromId]); const q = [fromId];
  while (q.length) { const x = q.shift(); adj.get(x).forEach((y) => { if (!seen.has(y)) { seen.add(y); q.push(y); } }); }
  return seen;
}

// ---- 世界の座標(メートル)への変換 ----
export function roomBounds(r) {
  return { minX: px2x(r.x0), maxX: px2x(r.x1), minZ: px2z(r.z1), maxZ: px2z(r.z0) };
}
// 壁(図の座標)を、addWall が受け取る形(世界の座標)にする。axis は同じ('x': x方向に延びる壁 / 'z': z方向に延びる壁)
export function wallToWorld(w) {
  if (w.axis === 'x') { // 横の線(図の z が一定)→ 世界でも z が一定
    return { axis: 'x', fixed: px2z(w.fixed), from: px2x(w.from), to: px2x(w.to), doorAt: w.doorAt === null ? undefined : px2x(w.doorAt) };
  }
  const a = px2z(w.to), b = px2z(w.from); // z は向きが逆になる
  return { axis: 'z', fixed: px2x(w.fixed), from: Math.min(a, b), to: Math.max(a, b), doorAt: w.doorAt === null ? undefined : px2z(w.doorAt) };
}

// 照明スイッチの位置(世界の座標)。部屋のドアのすぐ脇の、壁の内側。
// ドアがない部屋や、ドアの脇に壁がない部屋(開口のそば)は、その部屋の一番長い壁の端に付ける(壁のない所には付けない)。
// 戻り値: { x, z, axis } axis = スイッチが付いている壁が延びる向き('x' = x方向の壁(z が一定)、'z' = z方向の壁(x が一定))。スイッチの箱の向きを、壁に合わせるために使う
export const SWITCH_OFFSET = 0.12; // 壁の中心から、スイッチの中心まで(壁の厚み0.2の半分 + スイッチの厚み0.04の半分 = ぴったり壁に付く)
const SWITCH_DOOR_GAP = 0.6;       // ドアの穴の半分の幅(ドア幅1.2の半分)

// 部屋の壁(階と部屋が合うもの)を、世界の座標で返す。壁のうち、ドアの穴を除いた「壁のある範囲」の一覧付き
function wallSpansOf(layout, r) {
  return layout.walls.filter((w) => w.floor === r.floor && w.between.includes(r.id)).map((w) => {
    const o = wallToWorld(w);
    const spans = o.doorAt === undefined ? [[o.from, o.to]] : [[o.from, o.doorAt - SWITCH_DOOR_GAP], [o.doorAt + SWITCH_DOOR_GAP, o.to]];
    return { o, spans: spans.filter(([a, e]) => e - a > 0.05) };
  });
}
// 部屋の中心がある側(壁から見て、部屋の側)の向き: +1 / -1
function sideOf(o, b) { return ((o.axis === 'x' ? (b.minZ + b.maxZ) / 2 : (b.minX + b.maxX) / 2) > o.fixed) ? +1 : -1; }

// スイッチが、その部屋の本物の壁(ドアの穴ではない所)のすぐ内側にあるか
export function isSwitchOnWall(layout, r, p) {
  const b = roomBounds(r), eps = 0.02;
  return wallSpansOf(layout, r).some(({ o, spans }) => {
    const perp = (o.axis === 'x' ? p.z : p.x) - o.fixed, along = o.axis === 'x' ? p.x : p.z;
    return Math.abs(perp - sideOf(o, b) * SWITCH_OFFSET) < eps && spans.some(([a, e]) => along >= a + 0.05 && along <= e - 0.05);
  });
}

function switchOnLongestWall(layout, r) {
  const b = roomBounds(r);
  let best = null;
  wallSpansOf(layout, r).forEach(({ o, spans }) => spans.forEach(([a, e]) => { if (e - a >= 0.9 && (!best || e - a > best.len)) best = { o, a, len: e - a }; }));
  if (!best) return null;
  const { o } = best, along = best.a + 0.4, perp = o.fixed + sideOf(o, b) * SWITCH_OFFSET;
  return o.axis === 'x' ? { x: along, z: perp, axis: 'x' } : { x: perp, z: along, axis: 'z' };
}

export function switchPositions(layout) {
  const out = new Map();
  layout.rooms.forEach((r) => {
    if (r.kind === 'courtyard' || r.kind === 'sealed') return;
    const b = roomBounds(r);
    const cand = layout.doors.filter((d) => d.floor === r.floor && d.between[0] === r.id); // 部屋どうしのドア(この部屋が a 側)
    const cand2 = layout.doors.filter((d) => d.floor === r.floor && d.between[1] === r.id);
    const mine = [...cand, ...cand2][0];
    let pos = null;
    if (mine) { // ドアのすぐ脇(ドアの中心から0.9m)
      const w = wallToWorld({ axis: mine.axis, fixed: mine.fixed, from: 0, to: 0, doorAt: mine.at });
      if (mine.axis === 'x') { // 横の壁(z が一定)
        const x = w.doorAt + 0.9 + 0.3 <= b.maxX ? w.doorAt + 0.9 : Math.max(b.minX + 0.3, w.doorAt - 0.9);
        pos = { x, z: w.fixed + sideOf(w, b) * SWITCH_OFFSET, axis: 'x' };
      } else { // 縦の壁(x が一定)
        const z = w.doorAt + 0.9 + 0.3 <= b.maxZ ? w.doorAt + 0.9 : Math.max(b.minZ + 0.3, w.doorAt - 0.9);
        pos = { x: w.fixed + sideOf(w, b) * SWITCH_OFFSET, z, axis: 'z' };
      }
    }
    if (!pos || !isSwitchOnWall(layout, r, pos)) pos = switchOnLongestWall(layout, r) || pos || { x: b.maxX - 0.15, z: b.maxZ - 0.6, axis: 'x' };
    out.set(r.id, pos);
  });
  return out;
}
