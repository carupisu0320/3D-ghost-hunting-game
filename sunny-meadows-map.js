// Sunny Meadows Mental Institution(精神病院)。1階と地下(B1F)の2階建て、部屋数は約90。
// 間取りの計算は sunny-meadows-layout.js がやっていて、このファイルは、それを three.js の壁・床・ドア・照明にして、
// エンジン(engine.js)に登録する。作りは、Grafton Farmhouse(階をまたぐ階段・部屋ごとの照明とスイッチ・ブレーカー・テント)とほぼ同じ。
//
// 階: 1階 = 床の高さ 0 / 地下(B1F) = 床の高さ -3m(エンジンの「上の階」の仕組みを、下向きに使っている)
// 階段: A1(玄関の左)・A2(男性棟の西)・A3(女性棟の東)の3か所で、1階と地下をつなぐ
// ブレーカー(ヒューズボックス): Utility Room(1階、中庭の東)
import {
  THREE, mergeGeometries, scene, camera, rooms, room,
  wallBoxes, doorFrameGeometries, wallGeometries, wallHeight, doorFrameMaterial,
  addWall, makeWoodTexture, scaled, addFramedPlane, pushWallBox,
  addSurveillanceCamera, videoCams, addToolPegboard, registerFlickerLight,
  addRoomLight, addLightSwitch, updateRoomLightCulling, breakerOn, registerBreaker, setBreakerOn,
  addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool, setNotebookWorldMesh,
  sanity, drawSanityScreen, sanityTexture,
  initHaunting, setExteriorDoor, setOrbRoom, doors,
  onFrame, setCurrentUpperFloor, currentUpperFloor, defineUpperFloor, setBuildingUpperFloor,
  bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn, addFurniture,
  addDetailMesh, addLeg, addLegsUnder, fabricMaterial, handleMaterial, ceramicMaterial,
  makeGrassTexture,
} from './engine.js';
import * as Layout from './sunny-meadows-layout.js';
import { buildProps, batchSceneMeshes, addMergedByChunk } from './sunny-meadows-props.js';
import { planDecals } from './sunny-meadows-decal-plan.js';
import {
  makeAsylumWallTexture, makeAsylumTileTexture, makeAsylumWoodTexture, makeAsylumConcreteTexture, makeAsylumCeilingTexture,
  remapWallUVs, makeDecalAtlas, buildDecalMesh,
} from './sunny-meadows-decor.js';

export const mapLabel = 'Sunny Meadows Mental Institution';

// ---------- 見た目の材質(床・天井・屋根) ----------
// 床の板は、材質ごとに1つのメッシュにまとめる(部屋が多いので、1部屋ずつ別にすると描画が重くなる)。
// 床の模様の繰り返しは、材質ではなく、頂点のUV(模様の座標)で調整している
const TILE = 2.0; // 模様1枚の大きさ(m)
function slabGeometry(b, y, facingUp) {
  const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / TILE, uv.getY(i) * d / TILE);
  g.rotateX(facingUp ? -Math.PI / 2 : Math.PI / 2);
  g.translate((b.minX + b.maxX) / 2, y, (b.minZ + b.maxZ) / 2);
  return g;
}
// 四角い板から、中の穴(階段の部分)をくり抜いた形を、4つの四角に分けて返す。穴がなければ、そのまま
function piecesAround(outer, hole) {
  if (!hole) return [outer];
  const p = [];
  if (hole.minZ > outer.minZ) p.push({ minX: outer.minX, maxX: outer.maxX, minZ: outer.minZ, maxZ: hole.minZ });
  if (hole.maxZ < outer.maxZ) p.push({ minX: outer.minX, maxX: outer.maxX, minZ: hole.maxZ, maxZ: outer.maxZ });
  if (hole.minX > outer.minX) p.push({ minX: outer.minX, maxX: hole.minX, minZ: hole.minZ, maxZ: hole.maxZ });
  if (hole.maxX < outer.maxX) p.push({ minX: hole.maxX, maxX: outer.maxX, minZ: hole.minZ, maxZ: hole.maxZ });
  return p;
}

// progress(割合0〜1, 文字) は、ロード画面の表示を更新して、ブラウザに描画の時間を渡す関数(main.js が渡す)。なくても動く。
// 段階のあいだ以外では await しない(家具をまとめる処理が、別の処理の追加を巻き込まないため)
export async function build(progress = async () => {}) {
  const FLOOR_1F = Layout.FLOOR_1F, FLOOR_B1F = Layout.FLOOR_B1F;
  const yB1F = -Layout.B1F_DEPTH;
  const px2x = Layout.px2x, px2z = Layout.px2z;
  defineUpperFloor(FLOOR_B1F, yB1F);

  // ---- 間取りを計算する ----
  const layout = Layout.computeLayout();
  if (layout.warnings.length) console.warn('Sunny Meadows の間取りに問題があります', layout.warnings);
  const byId = new Map(layout.rooms.map((r) => [r.id, r]));

  // ---- 部屋の登録(ミニマップ・今いる部屋の判定・照明・幽霊の出没部屋に使われる) ----
  // 中庭は屋外(屋根がない)なので、部屋としては登録しない(=ゲームの中では「外」の扱いになり、中庭では正気度が減らない)
  layout.rooms.forEach((r) => {
    if (r.kind === 'courtyard') return;
    rooms.push({ name: r.id, bounds: Layout.roomBounds(r), ...(r.floor === FLOOR_B1F ? { upperFloor: FLOOR_B1F } : {}), hallway: r.kind !== 'room' });
  });

  // ---- 階段の位置(世界の座標) ----
  const stairs = Layout.STAIRS.map((st) => {
    const b = { minX: px2x(st.rect.x0), maxX: px2x(st.rect.x1), minZ: px2z(st.rect.z1), maxZ: px2z(st.rect.z0) };
    return { ...st, b, highZ: px2z(st.highZ), lowZ: px2z(st.lowZ), sideX: px2x(st.sideX) };
  });

  // ---- 壁・ドア(階ごとに、建てる階を切り替えて作る) ----
  [FLOOR_1F, FLOOR_B1F].forEach((f) => {
    setBuildingUpperFloor(f);
    layout.walls.filter((w) => w.floor === f).forEach((w) => {
      const o = Layout.wallToWorld(w);
      addWall(o.axis, o.fixed, o.from, o.to, o.doorAt);
    });
  });

  // ---- 階段まわりの壁(階段の脇の壁と、間違った側から入れないようにする端の壁) ----
  stairs.forEach((st) => {
    const dir = Math.sign(st.lowZ - st.highZ); // 上り口から下り口へ向かう z の向き
    setBuildingUpperFloor(FLOOR_1F);
    addWall('z', st.sideX, st.b.minZ, st.b.maxZ);                       // 1階: 脇の壁(全長。穴に横から落ちないように)
    addWall('x', st.lowZ, st.b.minX, st.b.maxX);                        // 1階: 下り口の側の端
    setBuildingUpperFloor(FLOOR_B1F);
    const gapEnd = st.lowZ - dir * (Layout.STAIR_EXIT_GAP * Layout.PX); // 地下: 脇の壁は、下り口の手前まで。下り口で脇の通路へ出られる
    addWall('z', st.sideX, Math.min(st.highZ, gapEnd), Math.max(st.highZ, gapEnd));
    addWall('x', st.highZ, st.b.minX, st.b.maxX);                       // 地下: 上り口の側の端(階段の下から、上り口の側へは出られない)
  });
  setBuildingUpperFloor(FLOOR_1F);

  // ---- 壁・ドア枠をまとめて描画(全階ぶん、すべての addWall のあとに1回だけ) ----
  await progress(0.10, '壁を作っています');
  remapWallUVs(wallGeometries, wallHeight); // 壁の模様の縮尺を、壁の長さにかかわらずそろえる
  const wallMaterial = new THREE.MeshLambertMaterial({ map: makeAsylumWallTexture() });
  // 壁とドア枠は、全体を1つにせず、場所(16m四方)と階ごとに分ける(見た目は同じ。カメラや影の範囲の外は、描画されなくなる)
  addMergedByChunk(wallGeometries, wallMaterial);
  addMergedByChunk(doorFrameGeometries, doorFrameMaterial);

  // ---- 床・天井・屋根 ----
  await progress(0.20, '床と天井を作っています');
  const ceilingTexture = makeAsylumCeilingTexture();
  const mats = {
    wood: new THREE.MeshLambertMaterial({ map: makeAsylumWoodTexture() }),
    tile: new THREE.MeshLambertMaterial({ map: makeAsylumTileTexture() }),
    concrete: new THREE.MeshLambertMaterial({ map: makeAsylumConcreteTexture() }),
    ceiling: new THREE.MeshLambertMaterial({ map: ceilingTexture, side: THREE.DoubleSide }), // 天井(下から)と屋根(上から)を兼ねる
    ceilingB: new THREE.MeshLambertMaterial({ map: ceilingTexture, color: 0x9a9892 }),         // 地下の天井(1階の床の裏)
    grass: new THREE.MeshLambertMaterial({ map: scaled(makeGrassTexture(), 1, 1) }),
  };
  Object.values(mats).forEach((m) => { if (m.map) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; } });
  const slabs = { wood: [], tile: [], concrete: [], ceiling: [], ceilingB: [], grass: [] };
  const holeOf = (roomId, floor) => { const st = stairs.find((s) => (floor === FLOOR_1F ? s.room1F : s.roomB1F) === roomId); return st ? st.b : null; };
  const addSlab = (key, rect, y, up, hole) => piecesAround(rect, hole).forEach((p) => slabs[key].push(slabGeometry(p, y, up)));
  layout.rooms.forEach((r) => {
    const b = Layout.roomBounds(r);
    const hole = holeOf(r.id, r.floor);
    if (r.floor === FLOOR_1F) {
      if (r.kind === 'courtyard') return; // 中庭は屋根がなく、床は地面(芝)
      addSlab(r.kind === 'corridor' || r.cool ? 'tile' : 'wood', b, 0.03, true, hole);
      addSlab('ceiling', b, wallHeight, false, null);
    } else {
      addSlab(r.cool ? 'tile' : 'concrete', b, yB1F + 0.01, true, null);
      addSlab('ceilingB', b, 0, false, hole); // 地下の天井 = 1階の床の裏。階段の穴は開けておく
    }
  });
  // 1階の屋根は、上からも見える(外から建物を見たとき)ように、天井と同じ板を使う
  Object.entries(slabs).forEach(([key, list]) => {
    if (list.length === 0) return;
    const mesh = new THREE.Mesh(mergeGeometries(list), mats[key]);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // ---- 地面(芝)。階段の穴の部分だけ、くり抜く(地面が、階段の穴をふさがないように) ----
  {
    const outer = { minX: -90, maxX: 190, minZ: -90, maxZ: 130 };
    const xs = [outer.minX, ...stairs.flatMap((s) => [s.b.minX, s.b.maxX]), outer.maxX].sort((a, b) => a - b);
    const zs = [outer.minZ, ...stairs.flatMap((s) => [s.b.minZ, s.b.maxZ]), outer.maxZ].sort((a, b) => a - b);
    const cells = [];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const c = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
      if (c.maxX - c.minX < 0.01 || c.maxZ - c.minZ < 0.01) continue;
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      if (stairs.some((s) => cx > s.b.minX && cx < s.b.maxX && cz > s.b.minZ && cz < s.b.maxZ)) continue;
      cells.push(slabGeometry(c, -0.02, true));
    }
    const ground = new THREE.Mesh(mergeGeometries(cells), mats.grass);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ---- 階段の見た目(踏み板)と、手すり代わりの壁の見た目 ----
  const stepMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#4a3a28'), 1, 1) });
  stairs.forEach((st) => {
    const n = 14, w = st.b.maxX - st.b.minX;
    for (let i = 0; i < n; i++) { // 下り口(i=0)から上り口(i=n-1)へ、踏み板が高くなっていく。下は、床まで埋まった箱
      const t = (i + 0.5) / n;
      const z = st.lowZ + t * (st.highZ - st.lowZ);
      const topY = yB1F + (i + 1) / n * Layout.B1F_DEPTH;
      const h = topY - yB1F, depthZ = Math.abs(st.highZ - st.lowZ) / n;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, depthZ), stepMat);
      box.position.set((st.b.minX + st.b.maxX) / 2, yB1F + h / 2, z);
      box.receiveShadow = true; box.castShadow = true;
      scene.add(box);
    }
  });

  // ---- 階段の昇り降り: 階段の中にいる間は、位置から高さと「いまの階」を決める ----
  onFrame(() => {
    let inStairs = false;
    for (const st of stairs) {
      const p = camera.position;
      if (p.x > st.b.minX && p.x < st.b.maxX && p.z > st.b.minZ && p.z < st.b.maxZ) {
        const u = Math.min(1, Math.max(0, (p.z - st.highZ) / (st.lowZ - st.highZ))); // 0 = 上り口(1階の高さ) → 1 = 下り口(地下の高さ)
        p.y = 1.6 + u * yB1F;
        setCurrentUpperFloor(u > 0.5 ? FLOOR_B1F : FLOOR_1F);
        inStairs = true;
        break;
      }
    }
    if (!inStairs) { // 階段の脇から出たときに、高さが中途半端に残らないよう、いまの階の高さへそっと戻す
      const target = 1.6 + (currentUpperFloor === FLOOR_B1F ? yB1F : 0);
      camera.position.y += (target - camera.position.y) * 0.25;
    }
  });

  // ---- 家具 ----
  // 1) もとからある家具(個室のベッド・浴室・礼拝堂・教室など): 見た目はそのまま、描画だけまとめる(下の batchSceneMeshes)
  // 2) 空だった部屋・廊下の家具: sunny-meadows-furniture-plan.js の配置計画を、まとめて3Dにする(buildProps)
  await progress(0.35, '家具を置いています');
  const furnitureStart = scene.children.length;
  // もとからある家具(最低限。入口から遠い奥の壁際に置いて、ドアから部屋の中への通り道をふさがない)
  // 個室・談話室などの出入口は、どれも「手前(玄関側)の壁」か「脇の壁」にあるので、家具は、奥の壁と、ドアのない壁に寄せている
  {
    const dims = (id) => { const b = room(id); return { w: b.maxX - b.minX, d: b.maxZ - b.minZ }; };
    // 個室(男性棟・女性棟・病棟・立入禁止区域): ベッドを1つ、奥の壁際の西寄りに。東側の通路が空く
    layout.rooms.filter((r) => /^(Male|Female) Room|^Hospital Room|^Restricted Room/.test(r.id)).forEach((r) => {
      setBuildingUpperFloor(r.floor);
      bedIn(r.id, 0.75, dims(r.id).d - 1.15, 0.9, 1.9);
    });
    // 宿舎室: ベッドを3つ、ドアのない側の壁に沿って(男性棟は、ドアが東の壁なので西側。女性棟は左右が逆なので東側)
    [['Male Dorm', 0.7], ['Female Dorm', dims('Female Dorm').w - 0.7]].forEach(([id, dx]) => {
      setBuildingUpperFloor(FLOOR_1F);
      [1.2, 3.3, 5.4].forEach((dz) => bedIn(id, dx, dz, 0.9, 1.9));
    });
    // 浴室: 奥(北)の壁に、トイレ3つと洗面台。タンクと蛇口を壁側(北)にするため、向きを反転(flip = true)する
    ['Male Bath', 'Female Bath'].forEach((id) => {
      setBuildingUpperFloor(FLOOR_1F);
      const { d } = dims(id);
      [0.7, 1.7, 2.7].forEach((dx) => toiletIn(id, dx, d - 0.45, true));
      washstandIn(id, 3.9, d - 0.4, 0.7, 0.5, 0.85, true);
    });
    // 礼拝堂: 長椅子を、中央の通路をあけて、左右に3列ずつ(ドアが、通路の延長にある)
    {
      setBuildingUpperFloor(FLOOR_1F);
      const b = room('Chapel');
      [[45.6, 49.1], [53.0, 57.4]].forEach(([x0, x1]) => {
        [1.7, 2.9, 4.1].forEach((dz) => furnitureIn('Chapel', (x0 + x1) / 2 - b.minX, dz, x1 - x0, 0.5, 0.5));
      });
    }
    // 教室: 机を、西の壁に寄せて2列(ドアは東の壁)
    {
      setBuildingUpperFloor(FLOOR_1F);
      [1.0, 2.6, 4.2, 5.8].forEach((dz) => [0.7, 1.9].forEach((dx) => furnitureIn('Class Room', dx, dz, 0.5, 1.0, 0.75)));
    }
    // 手術室・遺体安置所: 台を置く
    setBuildingUpperFloor(FLOOR_B1F);
    { const b = room('Operating Room'); counterAt((b.minX + b.maxX) / 2, b.minZ + 3.0, 0.8, 2.0, 0.9); }
    { const b = room('Morgue'); [1.2, 3.3, 5.4].forEach((dz) => counterAt(b.minX + 0.9, b.minZ + dz, 0.8, 1.9, 0.85)); }
    setBuildingUpperFloor(FLOOR_1F);
  }
  const batched = batchSceneMeshes(furnitureStart); // (ここまで、await なし)
  const props = buildProps((f) => (f === FLOOR_B1F ? yB1F : 0));
  console.info(`Sunny Meadows: 既存の家具 ${batched.before} 個を ${batched.after} 個にまとめ、新しい家具 ${props.items} 点(部品 ${props.boxes})を ${props.meshes} 個にまとめました`);

  // ---- 汚れ・血痕・ひっかき傷(壁と床に貼る板。全部で1つのメッシュ) ----
  await progress(0.45, '壁と床の汚れを描いています');
  {
    const decalMesh = buildDecalMesh(planDecals(layout), (f) => (f === FLOOR_B1F ? yB1F : 0), makeDecalAtlas());
    if (decalMesh) scene.add(decalMesh);
  }

  await progress(0.55, '照明を付けています');
  // ---- 照明(Grafton Farmhouse と同じ作り: 部屋ごとに天井灯+スイッチ+全体照明。ブレーカーはUtility Room) ----
  const HEMI_ON = 0.9;   // ブレーカーが入っている間の全体照明の強さ
  const HEMI_OFF = 0;    // ブレーカーが落ちている間の全体照明の強さ(0=なし。暗くしたいほど0に近づける)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x605040, HEMI_ON);
  scene.add(hemiLight);
  registerFlickerLight(hemiLight, () => (breakerOn ? HEMI_ON : HEMI_OFF)); // ハント中は全体照明も天井灯と一緒に点滅させる

  const switchPos = Layout.switchPositions(layout);
  layout.rooms.forEach((r) => {
    if (r.kind === 'courtyard' || r.kind === 'sealed') return; // 中庭は屋外。入れない部屋には照明を付けない
    setBuildingUpperFloor(r.floor);
    const color = r.cool ? 0xdcecff : 0xfff2cc;                 // 浴室・手術室・遺体安置所などは青白い光
    const rl = addRoomLight(r.id, r.kind === 'stairs' ? 12 : 16, color, r.kind === 'corridor' ? 22 : 18);
    const pos = switchPos.get(r.id);
    addLightSwitch(r.id, rl, pos.x, pos.z);
  });
  setBuildingUpperFloor(FLOOR_1F);

  // ---- ブレーカー(ヒューズボックス): Utility Room の北の壁。部屋側(南向き)に付ける ----
  const bx = px2x(Layout.BREAKER.planX), bz = px2z(Layout.BREAKER.planZ) - 0.15;
  const breakerBox = { x: bx, z: bz };
  const breakerMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const breakerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.15), breakerMat);
  breakerMesh.position.set(breakerBox.x, 1.4, breakerBox.z);
  scene.add(breakerMesh);
  const breakerLeverMat = new THREE.MeshLambertMaterial({ color: 0x552222, emissive: 0x220000, emissiveIntensity: 0.4 });
  const breakerLever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.05), breakerLeverMat);
  breakerLever.position.set(breakerBox.x, 1.4, breakerBox.z - 0.1);
  scene.add(breakerLever);
  function applyBreakerState() {
    updateRoomLightCulling();
    hemiLight.intensity = breakerOn ? HEMI_ON : HEMI_OFF; // 停電中は補助の全体照明も落として、暗くする
    breakerLeverMat.color.set(breakerOn ? 0x2f6b2f : 0x552222);
    breakerLeverMat.emissive.set(breakerOn ? 0x113311 : 0x220000);
  }
  registerBreaker(breakerBox, applyBreakerState);
  setBreakerOn(false); // ゲーム開始時は電気が落ちている。Utility Room のブレーカーを入れると、スイッチで各部屋の照明がつけられる
  applyBreakerState();

  // ---- 監視カメラ(映像はテントの奥の壁のモニターに映る) ----
  Layout.CAMERAS.forEach((id) => addSurveillanceCamera(id, byId.get(id).floor === FLOOR_B1F ? yB1F : 0));

  // ---- 玄関(建物の外へ出るドア) ----
  const frontDoorX = px2x(Layout.EXTERIOR_DOORS[0].at);
  const frontDoor = doors.find((d) => !d.upperFloor && Math.abs(d.center.x - frontDoorX) < 0.05 && Math.abs(d.center.z) < 0.3);
  if (frontDoor) setExteriorDoor(frontDoor);

  await progress(0.72, 'テントを作っています');
  // ---- 拠点のテント(建物の南側、玄関と同じXに正面を合わせて設置。Grafton Farmhouse と同じテント) ----
  const tentX = frontDoorX, tentZ = -15;
  {
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x4a5540 });
    const halfWidth = 2.75, depth = 4.5, wallH = 1.6, rise = 1.4;

    // 入口は-Z側(家に向く側)。側面の壁はZ方向に、背面の壁はテントの+Z側に
    [1, -1].forEach(xSign => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallH, depth), tentMat);
      wall.position.set(tentX + xSign * halfWidth, wallH / 2, tentZ);
      wall.castShadow = true; wall.receiveShadow = true;
      scene.add(wall);
      wallBoxes.push({ minX: wall.position.x - 0.15, maxX: wall.position.x + 0.15, minZ: tentZ - depth / 2, maxZ: tentZ + depth / 2 });
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, wallH, 0.1), tentMat);
    backWall.position.set(tentX, wallH / 2, tentZ - depth / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    // 正気度モニター(入口を入ってすぐ左の壁)
    drawSanityScreen(sanity);
    const sanityFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    sanityFrame.position.set(tentX - halfWidth + 0.03, 1.5, tentZ + 1.6);
    sanityFrame.rotation.y = Math.PI / 2;
    sanityFrame.castShadow = true;
    scene.add(sanityFrame);
    const sanityScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: sanityTexture }));
    sanityScreen.position.set(tentX - halfWidth + 0.06, 1.5, tentZ + 1.6);
    sanityScreen.rotation.y = Math.PI / 2;
    scene.add(sanityScreen);
    wallBoxes.push({ minX: tentX - halfWidth, maxX: tentX + halfWidth, minZ: tentZ - depth / 2 - 0.15, maxZ: tentZ - depth / 2 + 0.15 });

    // 監視カメラの映像を映すモニターは、道具を置いた机の奥の壁(背面の壁)に横一列に並べる。画面はフレームから離して点滅(Zファイティング)を防ぐ
    const monitorFrameMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const monitorW = 0.6, monitorH = 0.45, monitorSpacing = 0.7;
    const monitorY = 1.15; // 中心の高さ。机の面(0.75m)より上で、上端が壁の高さ(1.6m)を超えない高さ
    const backWallZ = tentZ - depth / 2;
    videoCams.forEach((cam, i) => {
      const xOffset = (i - (videoCams.length - 1) / 2) * monitorSpacing;
      const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(monitorW + 0.08, monitorH + 0.08, 0.06), monitorFrameMat);
      monitorFrame.position.set(tentX + xOffset, monitorY, backWallZ + 0.06);
      monitorFrame.castShadow = true;
      scene.add(monitorFrame);
      const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(monitorW, monitorH), cam.material);
      monitorScreen.position.set(tentX + xOffset, monitorY, backWallZ + 0.11);
      scene.add(monitorScreen);
    });

    // 壁の上に乗る切妻屋根(棟はZ方向)
    const slopeLen = Math.sqrt(halfWidth * halfWidth + rise * rise) + 0.5;
    const angle = Math.atan2(rise, halfWidth);
    [1, -1].forEach(xSign => {
      const geo = new THREE.BoxGeometry(slopeLen, 0.25, depth + 0.3);
      const mesh = new THREE.Mesh(geo, tentMat);
      mesh.rotation.z = -xSign * angle;
      mesh.position.set(tentX + xSign * halfWidth / 2, wallH + rise / 2, tentZ);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // 妻側のすき間を三角の板で塞ぐ(+Z側が背面、-Z側が入口)
    {
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-halfWidth, 0);
      gableShape.lineTo(halfWidth, 0);
      gableShape.lineTo(0, rise);
      gableShape.closePath();
      const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
      const gable = new THREE.Mesh(gableGeo, tentMat);
      gable.position.set(tentX, wallH, tentZ - depth / 2 - 0.06);
      gable.castShadow = true; gable.receiveShadow = true;
      scene.add(gable);
    }

    // テント内のランタン
    const lanternLight = new THREE.PointLight(0xffcc77, 4, 7);
    lanternLight.position.set(tentX, wallH + 0.4, tentZ - 1.6);
    scene.add(lanternLight);
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 1.5 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lanternMat);
    lantern.position.copy(lanternLight.position);
    scene.add(lantern);

    // テーブルと道具(2列に並べる)
    const tableZ = tentZ - depth / 2 + 0.8;
    const tableMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 1.0), tableMat);
    table.position.set(tentX, 0.375, tableZ);
    table.castShadow = true; table.receiveShadow = true;
    scene.add(table);
    wallBoxes.push({ minX: tentX - 1.0, maxX: tentX + 1.0, minZ: tableZ - 0.5, maxZ: tableZ + 0.5 });

    // 道具は、東の壁に掛けたペグボードに並べる(視線を向けてクリックで取る)。ノートだけは机の上に置く
    addToolPegboard({
      x: tentX + halfWidth - 0.05 - 0.03, z: tentZ - 0.2, rotY: -Math.PI / 2, // 東の壁の内側の面に付け、ボードの前を西(テントの中)へ向ける
      tools: ['flashlight', 'emf', 'thermometer', 'spiritbox', 'uv', 'dots'],
    });
    const rowBackZ = tableZ + 0.26;
    const notebookItem = makeNotebookItemMesh();
    notebookItem.position.y = 0.75 + toolRestOffset.notebook;
    setNotebookWorldMesh(notebookItem);
    addPickupItem(tentX + 0.5, rowBackZ, notebookItem, () => collectTool('notebook'));
  }

  // ---- テントから玄関までの導線を照らす作業灯 ----
  {
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x2d5c3f });
    const lensMat = new THREE.MeshLambertMaterial({ color: 0xfffbe0, emissive: 0xfffbe0, emissiveIntensity: 1.4 });

    function addLegBetween(group, from, to) {
      const dir = to.clone().sub(from);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, dir.length(), 6), legMat);
      leg.position.copy(from).add(to).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      group.add(leg);
    }
    function addWorkLight(x, z, facingAngle) {
      const group = new THREE.Group();
      const hub = new THREE.Vector3(0, 0.55, 0);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        addLegBetween(group, hub, new THREE.Vector3(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4));
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.2, 8), legMat);
      pole.position.y = 1.15;
      group.add(pole);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), legMat);
      bar.position.y = 1.75;
      group.add(bar);
      [-0.18, 0.18].forEach(dx => {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.06), headMat);
        head.position.set(dx, 1.75, 0.045);
        group.add(head);
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.11), lensMat);
        lens.position.set(dx, 1.75, 0.076);
        group.add(lens);
      });
      group.position.set(x, 0, z);
      group.rotation.y = facingAngle;
      group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(group);
      const light = new THREE.PointLight(0xfff6e0, 6, 11);
      light.position.set(x, 1.75, z);
      scene.add(light);
      wallBoxes.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
    }

    const tentDepthHalf = 2.25;
    const doorPoint = new THREE.Vector2(frontDoorX, 0.0); // 玄関を出てすぐの位置(玄関ドアはZ=1)
    const tentEntrance = new THREE.Vector2(tentX, tentZ + tentDepthHalf + 1.0);
    const pathDir = tentEntrance.clone().sub(doorPoint).normalize();
    const pathPerp = new THREE.Vector2(-pathDir.y, pathDir.x);
    const pathFacing = Math.atan2(-pathDir.x, -pathDir.y);
    const pathStands = [0.2, 0.4, 0.6, 0.8].map((t, i) => {
      const base = doorPoint.clone().lerp(tentEntrance, t);
      const side = i % 2 === 0 ? 1 : -1;
      const p = base.addScaledVector(pathPerp, side * 1.2);
      return { x: p.x, z: p.y };
    });
    pathStands.forEach(p => addWorkLight(p.x, p.z, pathFacing));
  }

  await progress(0.85, '幽霊の準備をしています');
  // ---- 幽霊の出没部屋(廊下・階段室・入れない部屋・中庭は除外) ----
  const hauntableRooms = layout.rooms.filter((r) => r.kind === 'room').map((r) => rooms.find((x) => x.name === r.id));
  initHaunting(hauntableRooms);
  setOrbRoom(room(Layout.ORB_ROOM));

  // ---- スポーン地点(テント入口を入ってすぐ。テントのdepth=4.5の手前寄り) ----
  camera.position.set(tentX, 1.6, tentZ + 4.5 / 2 - 1.0);
  camera.rotation.y = Math.PI;
}
