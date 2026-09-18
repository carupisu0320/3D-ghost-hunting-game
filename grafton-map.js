// Grafton Farmhouse マップ。今回は間取り(部屋・壁・ドア・階段・最低限の照明)だけを作ってあり、
// 「玄関・屋根裏が常に暗い」「壁に穴が開いている部屋は暖房が効かない」といった特殊ルールはまだ実装していない
import {
  THREE, mergeGeometries, scene, camera, rooms, room,
  wallBoxes, doorFrameGeometries, wallGeometries, wallHeight, wallMaterial, doorFrameMaterial,
  addWall, makeWoodTexture, scaled, addFramedPlane, pushWallBox,
  addRoomLight, addLightSwitch, updateRoomLightCulling, registerBreaker, setBreakerOn,
  addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool, setNotebookWorldMesh,
  sanity, drawSanityScreen, sanityTexture,
  initHaunting, setExteriorDoor, setOrbRoom, doors,
  onFrame, setCurrentUpperFloor, currentUpperFloor, defineUpperFloor, setBuildingUpperFloor,
  bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn, addFurniture,
  addDetailMesh, addLeg, addLegsUnder, fabricMaterial, handleMaterial,
} from './engine.js';

export const mapId = 'grafton';
export const mapLabel = 'Grafton Farmhouse';

// ソファ(東側の壁を背にして、部屋の中央側=西向きに座る配置)。engineのsofaAtを90度回転させたもの
// w=左右の幅(Z方向)、d=前後の奥行き(X方向)。背もたれは+X側(壁側)に来る
function sofaAtFacingWest(x, z, w, d) {
  const legH = 0.1, seatH = 0.32, cushionH = 0.14, backH = 0.4, backT = 0.16, armW = 0.14;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    addLeg(x + sx * (d / 2 - 0.06), 0, z + sz * (w / 2 - 0.06), 0.02, legH, handleMaterial);
  });
  addFurniture(x, z, d, w, seatH, fabricMaterial, legH);
  const cushionW = (w - armW * 2 - 0.04) / 2;
  [-1, 1].forEach(sz => {
    addDetailMesh(x - backT / 2, legH + seatH + cushionH / 2, z + sz * (cushionW / 2 + 0.02), d - backT - 0.06, cushionH, cushionW, fabricMaterial);
  });
  const armH = 0.32;
  [-1, 1].forEach(sz => {
    addDetailMesh(x, legH + armH / 2, z + sz * (w / 2 - armW / 2), d, armH, armW, fabricMaterial);
  });
  [-1, 1].forEach(sz => {
    addDetailMesh(x + d / 2 - backT / 2, legH + seatH + backH / 2, z + sz * (cushionW / 2 + 0.02), backT, backH, cushionW, fabricMaterial);
  });
}

// 実際にこの家を組み立てる。main.js がこのマップを選んだ瞬間だけ呼ばれる
export function build() {
  // ---- 階の基準Yを決める(1階=0、2階=3.3、屋根裏=6.6) ----
  const FLOOR_1F = 0, FLOOR_2F = 1, FLOOR_ATTIC = 2;
  const y2F = wallHeight;   // 3 (階と階の間に隙間を作らない。壁がそのまま次の階の壁の土台になる)
  const yAttic = y2F * 2;   // 6
  defineUpperFloor(FLOOR_2F, y2F);
  defineUpperFloor(FLOOR_ATTIC, yAttic);

  // ---- 部屋一覧 ----
  // 1階(8部屋)。Living Roomが玄関側(南)、Utility Roomは奥(北)
  rooms.push(
    { name: "Living Room",  bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } },
    { name: "Kitchen",      bounds: { minX: 0, maxX: 4, minZ: 4, maxZ: 8 } },
    { name: "Utility Room", bounds: { minX: 0, maxX: 4, minZ: 8, maxZ: 13 } },
    { name: "Dining Room",  bounds: { minX: 4, maxX: 8, minZ: 0, maxZ: 8 } },
    { name: "Library",      bounds: { minX: 4, maxX: 8, minZ: 8, maxZ: 13 } },
    { name: "Foyer",        bounds: { minX: 8, maxX: 13, minZ: 0, maxZ: 5 } },
    { name: "Work Room",    bounds: { minX: 8, maxX: 13, minZ: 5, maxZ: 10 } },
    { name: "Downstairs Bathroom", bounds: { minX: 8, maxX: 13, minZ: 10, maxZ: 13 } },
  );
  // 2階(5部屋)。Upstairs HallwayをFoyerの階段と噛み合うよう少し東へ広げてある
  rooms.push(
    { name: "Master Bathroom", bounds: { minX: 0, maxX: 4, minZ: 8, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Master Bedroom",  bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 8 }, upperFloor: FLOOR_2F },
    { name: "Upstairs Hallway", bounds: { minX: 4, maxX: 10.5, minZ: 0, maxZ: 13 }, upperFloor: FLOOR_2F, hallway: true },
    { name: "Twin Bedroom",    bounds: { minX: 10.5, maxX: 13, minZ: 8, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Child Bedroom",   bounds: { minX: 10.5, maxX: 13, minZ: 0, maxZ: 8 }, upperFloor: FLOOR_2F },
  );
  // 屋根裏(1部屋)
  rooms.push(
    { name: "Attic", bounds: { minX: 1, maxX: 12, minZ: 1, maxZ: 12 }, upperFloor: FLOOR_ATTIC },
  );

  // ---- 1階の壁・ドア ----
  // 外壁(南側、Living Roomの位置に玄関を開ける)
  addWall('x', 0, 0, 13, 2);
  addWall('x', 13, 0, 13);
  addWall('z', 0, 0, 13);
  addWall('z', 13, 0, 13);
  // 内壁
  addWall('x', 4, 0, 4, 2);     // Living Room / Kitchen
  addWall('x', 8, 0, 4, 2);     // Kitchen / Utility Room
  addWall('z', 4, 0, 4, 2);     // Living Room / Dining Room
  addWall('z', 4, 4, 8, 6);     // Kitchen / Dining Room
  addWall('z', 4, 8, 13, 10.5); // Utility Room / Library
  addWall('x', 8, 4, 8, 6);     // Dining Room / Library
  addWall('z', 8, 5, 8, 6.5);   // Dining Room / Work Room
  // Dining Room / Foyer(階段そのものの区間Z1.8〜3.6は階段の側壁で塞がれているので、それ以外を壁で埋める)
  addWall('z', 8, 0, 1.8);
  addWall('z', 8, 3.6, 5);
  addWall('z', 8, 8, 10, 9);    // Library / Work Room(壁が抜けていたので追加)
  addWall('z', 8, 10, 13, 11.5); // Library / Downstairs Bathroom(壁が抜けていたので追加)
  addWall('x', 5, 8, 13, 11);   // Foyer / Work Room(階段から離して東寄りに)
  addWall('x', 10, 8, 13, 11);  // Work Room / Downstairs Bathroom
  // Foyer / Dining Roomの間は、階段の通路そのものなのであえて壁を作らない(階段側で塞ぐ)

  // 玄関の外に出られるドアを、後でハント時にロックできるよう控えておく
  const entranceDoor = doors.find(d => !d.upperFloor && Math.abs(d.center.x - 2) < 0.01 && Math.abs(d.center.z - 0) < 0.01);
  if (entranceDoor) setExteriorDoor(entranceDoor);

  // ---- 2階の壁・ドア ----
  setBuildingUpperFloor(FLOOR_2F);
  addWall('x', 0, 0, 13);   // 外壁(2階に玄関は無い)
  addWall('x', 13, 0, 13);
  addWall('z', 0, 0, 13);
  addWall('z', 13, 0, 13);
  addWall('x', 8, 0, 4, 2);       // Master Bedroom / Master Bathroom
  addWall('z', 4, 0, 8, 4);       // Master Bedroom / Upstairs Hallway
  addWall('z', 4, 8, 13, 10.5);   // Master Bathroom / Upstairs Hallway
  addWall('z', 10.5, 0, 8, 4);    // Upstairs Hallway / Child Bedroom
  addWall('z', 10.5, 8, 13, 11.5); // Upstairs Hallway / Twin Bedroom
  addWall('x', 8, 10.5, 13, 11.5); // Child Bedroom / Twin Bedroom

  // ---- 屋根裏の壁(単一の部屋なので外周のみ) ----
  setBuildingUpperFloor(FLOOR_ATTIC);
  addWall('x', 1, 1, 12);
  addWall('x', 12, 1, 12);
  addWall('z', 1, 1, 12);
  addWall('z', 12, 1, 12);

  setBuildingUpperFloor(FLOOR_1F); // 以降の呼び出しは1階の扱いに戻す

  // ---- 床(見た目だけの板)。階段の吹き抜け部分だけ、addFramedPlaneで正確に穴を開ける
  // 下からも見えるよう両面表示にしておく(片面だけだと下の階から素通しになってしまう)
  // 天井/床の板。DoubleSide一枚で両面をまかなうと、裏側がライティングの都合で真っ黒に見えることがあるため、
  // 上向き・下向きの板をそれぞれ別に(法線を正しく)敷いて両方向からきちんと見えるようにする
  const floorMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 7, 7) });

  // ---- 階段の吹き抜け(1階Foyer⇔2階Upstairs Hallway、2階⇔屋根裏)。通路として壁で囲う ----
  const stairsA = { minX: 8.0, maxX: 9.6, bottomZ: 1.8, topZ: 3.6 };   // 1階Foyer ⇔ 2階Upstairs Hallway(幅を広く・奥行きを急に)
  const stairsB = { minX: 5.8, maxX: 7.2, bottomZ: 7, topZ: 8.8 };  // 2階Upstairs Hallway ⇔ 屋根裏Attic(登り始めは据え置き、奥行きをstairsAと同じ1.8mに)
  const holeA = { minX: stairsA.minX, maxX: stairsA.maxX, minZ: stairsA.bottomZ, maxZ: stairsA.topZ };
  const holeB = { minX: stairsB.minX, maxX: stairsB.maxX, minZ: stairsB.bottomZ, maxZ: stairsB.topZ };

  // 1階の床(穴なし。すぐ下は地面なので階段の始点がここに接していて問題ない)
  {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), floorMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(6.5, 0, 6.5);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  addFramedPlane({ minX: 0, maxX: 13, minZ: 0, maxZ: 13 }, holeA, y2F, floorMat, true);     // 1階の天井(上から見た2階の床)
  addFramedPlane({ minX: 0, maxX: 13, minZ: 0, maxZ: 13 }, holeA, y2F, floorMat, false);    // 2階の床(下から見た1階の天井)
  addFramedPlane({ minX: 1, maxX: 12, minZ: 1, maxZ: 12 }, holeB, yAttic, floorMat, true);  // 2階の天井(上から見た屋根裏の床)
  addFramedPlane({ minX: 1, maxX: 12, minZ: 1, maxZ: 12 }, holeB, yAttic, floorMat, false); // 屋根裏の床(下から見た2階の天井)

  // 階段の両脇に壁を立てて、通路をきちんと囲う。1階分の高さ(wallHeight)だけあれば階段自体は覆えるので、
  // 上側の階でも同じ壁を作ると2階分の高さに積み上がって不自然に大きくなってしまう。見た目は下側の階でだけ作る
  // (昇っている間、後半だけ横方向の当たり判定が緩くなるが、通路の外に出ても見た目上の壁の大きさの方を優先する)
  setBuildingUpperFloor(FLOOR_1F);
  addWall('z', stairsA.minX, stairsA.bottomZ, stairsA.topZ); // 西側の壁
  addWall('z', stairsA.maxX, stairsA.bottomZ, stairsA.topZ); // 東側の壁
  setBuildingUpperFloor(FLOOR_2F);
  addWall('z', stairsB.minX, stairsB.bottomZ, stairsB.topZ); // 西側の壁
  addWall('z', stairsB.maxX, stairsB.bottomZ, stairsB.topZ); // 東側の壁
  setBuildingUpperFloor(FLOOR_1F);

  // 階段のゾーンは「正しい側から少しずつ上る」以外の入り方をすると、Z座標だけで高さが決まる都合上、
  // 逆側からいきなり足を踏み入れた瞬間に高さが飛んでしまう(踏んだだけでワープする)。
  // これを防ぐため、上側の入口を「まだ下の階のつもりでいる間」だけ塞ぐ壁と、
  // 下側の入口を「まだ上の階のつもりでいる間」だけ塞ぐ壁を追加する。
  // (実際に下から登り切る頃には既に「上の階」判定に切り替わっているので、この壁には引っかからない)
  setBuildingUpperFloor(FLOOR_1F);
  addWall('x', stairsA.topZ, stairsA.minX, stairsA.maxX); // Foyer側から誤って上の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_2F);
  addWall('x', stairsA.bottomZ, stairsA.minX, stairsA.maxX); // Upstairs Hallway側から誤って下の入口に踏み込むのを防ぐ
  addWall('x', stairsB.topZ, stairsB.minX, stairsB.maxX); // Upstairs Hallway側から誤って上の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_ATTIC);
  addWall('x', stairsB.bottomZ, stairsB.minX, stairsB.maxX); // Attic側から誤って下の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_1F);

  // 壁・ドア枠をまとめて描画(全階ぶんまとめて1回でよい)。
  // ここまでで壁を追加するaddWallの呼び出しは全部終わっているので、必ずこのタイミングでまとめて描画する
  // (これより前でmergeしてしまうと、階段の側壁など後から追加した壁が見た目に反映されない=当たり判定はあるのに見えない、というバグになる)
  const mergedWall = new THREE.Mesh(mergeGeometries(wallGeometries), wallMaterial);
  mergedWall.castShadow = true; mergedWall.receiveShadow = true;
  scene.add(mergedWall);
  const mergedFrame = new THREE.Mesh(mergeGeometries(doorFrameGeometries), doorFrameMaterial);
  mergedFrame.castShadow = true; mergedFrame.receiveShadow = true;
  scene.add(mergedFrame);

  // 見た目だけの階段(踏み板を並べるだけの簡易版)
  const stepMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#4a3a28'), 1, 1) });
  function addSteps(stairs, baseY, topY) {
    const stepCount = 14;
    for (let i = 0; i < stepCount; i++) {
      const t = i / (stepCount - 1);
      const z = stairs.bottomZ + t * (stairs.topZ - stairs.bottomZ);
      const stepY = baseY + t * (topY - baseY);
      const step = new THREE.Mesh(new THREE.BoxGeometry(stairs.maxX - stairs.minX - 0.1, 0.05, (stairs.topZ - stairs.bottomZ) / stepCount + 0.02), stepMat);
      step.position.set((stairs.minX + stairs.maxX) / 2, stepY, z);
      step.receiveShadow = true; step.castShadow = true;
      scene.add(step);
    }
  }
  addSteps(stairsA, 0, y2F);
  addSteps(stairsB, y2F, yAttic);

  // 階段の下(踏み板と床の間の空洞)を塞ぐ。各段の位置に、床からその段の高さまでの箱を積んで埋める
  function addStairFill(stairs, baseY, topY) {
    const stepCount = 14;
    for (let i = 0; i < stepCount; i++) {
      const t = i / (stepCount - 1);
      const z = stairs.bottomZ + t * (stairs.topZ - stairs.bottomZ);
      const stepY = baseY + t * (topY - baseY);
      const fillHeight = Math.max(0.05, stepY - baseY);
      const fill = new THREE.Mesh(
        new THREE.BoxGeometry(stairs.maxX - stairs.minX - 0.1, fillHeight, (stairs.topZ - stairs.bottomZ) / stepCount + 0.02),
        stepMat
      );
      fill.position.set((stairs.minX + stairs.maxX) / 2, baseY + fillHeight / 2, z);
      fill.receiveShadow = true; fill.castShadow = true;
      scene.add(fill);
    }
  }
  addStairFill(stairsA, 0, y2F);
  addStairFill(stairsB, y2F, yAttic);

  // 階段の登った先(吹き抜けの縁)に落下防止の柵を作る。細い柱+上の横木のシンプルな作り。
  // 東西の側面と、降り始めではない側の短辺(手前側)に柵を立てる。降り始め側だけは乗り降り口として塞がずに残す
  const railMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#8a6642'), 1, 1) });
  function addStairRailing(hole, y) {
    const railHeight = 0.9, postSize = 0.05, railSize = 0.06, postSpacing = 0.3;
    const edges = [
      { x0: hole.minX, z0: hole.minZ, x1: hole.minX, z1: hole.maxZ }, // 西辺
      { x0: hole.maxX, z0: hole.minZ, x1: hole.maxX, z1: hole.maxZ }, // 東辺
      { x0: hole.minX, z0: hole.minZ, x1: hole.maxX, z1: hole.minZ }, // 手前側の短辺(降り始めの反対側)
    ];
    edges.forEach(e => {
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0;
      const len = Math.sqrt(dx * dx + dz * dz);
      const postCount = Math.max(2, Math.round(len / postSpacing) + 1);
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1);
        const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, railHeight, postSize), railMat);
        post.position.set(e.x0 + dx * t, y + railHeight / 2, e.z0 + dz * t);
        post.castShadow = true;
        scene.add(post);
      }
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(dz === 0 ? len + postSize : railSize, railSize, dx === 0 ? len + postSize : railSize),
        railMat
      );
      rail.position.set((e.x0 + e.x1) / 2, y + railHeight, (e.z0 + e.z1) / 2);
      rail.castShadow = true;
      scene.add(rail);
      // 柵の当たり判定(通り抜けできないように、今組み立てている階に正しく登録する)
      pushWallBox({
        minX: Math.min(e.x0, e.x1) - postSize, maxX: Math.max(e.x0, e.x1) + postSize,
        minZ: Math.min(e.z0, e.z1) - postSize, maxZ: Math.max(e.z0, e.z1) + postSize,
      });
    });
  }
  setBuildingUpperFloor(FLOOR_2F);
  addStairRailing(holeA, y2F); // 2階側、階段Aの吹き抜けの縁
  setBuildingUpperFloor(FLOOR_ATTIC);
  addStairRailing(holeB, yAttic); // 屋根裏側、階段Bの吹き抜けの縁
  setBuildingUpperFloor(FLOOR_1F);

  // ---- 階段の昇り降り(Zの位置に応じてYを補間する。毎フレームengineから呼ばれる)。
  // 今いる階が、その階段がつなぐ2つの階のどちらかであるときだけ判定する(でないと、
  // 別の階のたまたま同じX/Z座標を歩いただけで階段の判定に巻き込まれてしまう) ----
  function updateGraftonFloor() {
    const x = camera.position.x, z = camera.position.z;
    const onFloorForA = currentUpperFloor === FLOOR_1F || currentUpperFloor === FLOOR_2F;
    const onFloorForB = currentUpperFloor === FLOOR_2F || currentUpperFloor === FLOOR_ATTIC;
    const inA = onFloorForA && x >= stairsA.minX && x <= stairsA.maxX && z >= stairsA.bottomZ && z <= stairsA.topZ;
    const inB = onFloorForB && x >= stairsB.minX && x <= stairsB.maxX && z >= stairsB.bottomZ && z <= stairsB.topZ;
    if (inA) {
      const t = (z - stairsA.bottomZ) / (stairsA.topZ - stairsA.bottomZ); // 0(1階側)〜1(2階側)
      camera.position.y = t * y2F + 1.6;
      setCurrentUpperFloor(t > 0.5 ? FLOOR_2F : FLOOR_1F);
    } else if (inB) {
      const t = (z - stairsB.bottomZ) / (stairsB.topZ - stairsB.bottomZ); // 0(2階側)〜1(屋根裏側)
      camera.position.y = y2F + t * (yAttic - y2F) + 1.6;
      setCurrentUpperFloor(t > 0.5 ? FLOOR_ATTIC : FLOOR_2F);
    }
  }
  onFrame(updateGraftonFloor);

  // ---- 照明(部屋ごとに天井灯+スイッチ。ブレーカーはUtility Roomに設置) ----
  // テストプレイ用の補助的な全体照明(部屋の隅など、天井灯の光が届きにくい場所を底上げする)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x605040, 0.9));
  const roomLights = {
    "Living Room": addRoomLight("Living Room", 16, 0xfff2cc, 18),
    "Kitchen": addRoomLight("Kitchen", 16, 0xfff2cc, 18),
    "Utility Room": addRoomLight("Utility Room", 12, 0xfff2cc, 18),
    "Library": addRoomLight("Library", 14, 0xfff2cc, 18),
    "Dining Room": addRoomLight("Dining Room", 18, 0xfff2cc, 20),
    "Downstairs Bathroom": addRoomLight("Downstairs Bathroom", 10, 0xdcecff, 18),
    "Work Room": addRoomLight("Work Room", 12, 0xfff2cc, 18),
    "Foyer": addRoomLight("Foyer", 12, 0xfff2cc, 18),
  };
  rooms.filter(r => !r.upperFloor).forEach(r => addLightSwitch(r.name, roomLights[r.name]));

  setBuildingUpperFloor(FLOOR_2F);
  const roomLights2F = {
    "Master Bathroom": addRoomLight("Master Bathroom", 11, 0xdcecff, 18),
    "Master Bedroom": addRoomLight("Master Bedroom", 16, 0xfff2cc, 18),
    "Upstairs Hallway": addRoomLight("Upstairs Hallway", 16, 0xfff2cc, 22),
    "Twin Bedroom": addRoomLight("Twin Bedroom", 14, 0xfff2cc, 18),
    "Child Bedroom": addRoomLight("Child Bedroom", 14, 0xfff2cc, 18),
  };
  rooms.filter(r => r.upperFloor === FLOOR_2F).forEach(r => addLightSwitch(r.name, roomLights2F[r.name]));

  setBuildingUpperFloor(FLOOR_ATTIC);
  const roomLightsAttic = { "Attic": addRoomLight("Attic", 14, 0xfff2cc, 20) };
  addLightSwitch("Attic", roomLightsAttic["Attic"]);

  setBuildingUpperFloor(FLOOR_1F);

  // ブレーカー(Utility Room内、部屋の隅に設置。Utility RoomはZ8-13に移動したのでそちらに合わせる)
  const breakerBox = { x: 0.6, z: 12.82 }; // 北側の壁(Z=13)にきちんと接するように
  const breakerMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const breakerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.15), breakerMat);
  breakerMesh.position.set(breakerBox.x, 1.4, breakerBox.z);
  scene.add(breakerMesh);
  function applyBreakerState() {
    updateRoomLightCulling();
  }
  registerBreaker(breakerBox, applyBreakerState);
  setBreakerOn(true); // ※テストプレイ用に最初から電気を点けてある。本番はfalseに戻す
  applyBreakerState();

  // ---- 家具 ----
  // 1階
  sofaAtFacingWest(3.5, 2.0, 2.4, 0.8);                      // Living Room: 東側の壁際(玄関から見て右手)、部屋の中央を向く
  furnitureIn("Living Room", 2.5, 2.0, 0.5, 1.0, 0.4);        // Living Room: ソファの前にローテーブル
  counterAt(0.6, 5.1, 0.7, 2.2, 0.9);                        // Kitchen: 西側の壁際にカウンター
  fridgeAt(0.65, 7.4, 0.7, 0.7, 1.7);                        // Kitchen: 南西の隅に冷蔵庫
  furnitureIn("Utility Room", 3.5, 2.5, 0.5, 1.2, 1.0);      // Utility Room: 東側の壁際に棚(キッチンのドアからは離した)
  addFurniture(6, 4, 1.8, 1.0, 0.75);                        // Dining Room: 中央にダイニングテーブル
  wardrobeIn("Dining Room", 3.5, 0.6, 0.9, 0.5, 1.2);        // Dining Room: 東側の壁際にサイドボード
  wardrobeIn("Library", 3.5, 2.5, 0.9, 0.5, 1.9);            // Library: 東側の壁際に本棚
  furnitureIn("Library", 0.6, 3.5, 1.0, 0.6, 0.75);          // Library: 読書用の机
  furnitureIn("Foyer", 3.8, 0.4, 1.0, 0.4, 0.9);             // Foyer: 玄関そばに靴箱(階段から離した位置)
  counterAt(12.4, 7.5, 0.6, 3.0, 0.9);                       // Work Room: 東側の壁際に作業台
  toiletIn("Downstairs Bathroom", 3.8, 0.5);
  washstandIn("Downstairs Bathroom", 0.7, 0.4, 0.9, 0.5, 0.85);

  // 2階
  setBuildingUpperFloor(FLOOR_2F);
  washstandIn("Master Bathroom", 0.6, 0.4, 0.9, 0.5, 0.85);
  toiletIn("Master Bathroom", 3.2, 0.5);
  bedIn("Master Bedroom", 1.1, 1.2, 1.8, 2.0);
  wardrobeIn("Master Bedroom", 3.5, 6.5, 0.9, 0.6, 1.9);
  bedIn("Twin Bedroom", 1.85, 1.0, 1.0, 1.8);                 // 2段ベッドではなく2台並べたツインベッド(東側の壁際に変更)
  bedIn("Twin Bedroom", 1.85, 3.1, 1.0, 1.8);
  bedIn("Child Bedroom", 0.65, 1.0, 1.0, 1.8);
  wardrobeIn("Child Bedroom", 1.9, 5.5, 0.9, 0.5, 1.7);

  // 屋根裏(階段(stairsB: X5.8-7.2, Z7-8.8)を避けて配置)
  setBuildingUpperFloor(FLOOR_ATTIC);
  furnitureIn("Attic", 0.7, 0.5, 1.2, 0.8, 0.9);              // 古びたトランク
  furnitureIn("Attic", 7.5, 1.0, 1.0, 0.6, 1.6);              // 古い戸棚
  setBuildingUpperFloor(FLOOR_1F);

  // ---- 拠点のテント(家の南側、玄関と同じXに正面を合わせて設置) ----
  const tentX = 2, tentZ = -15;
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

    const rowFrontZ = tableZ - 0.26, rowBackZ = tableZ + 0.26;
    const toolSlots = [
      ['flashlight', makeFlashlightItemMesh, tentX - 0.75, rowFrontZ],
      ['emf', makeEMFItemMesh, tentX - 0.5, rowBackZ],
      ['thermometer', makeThermoItemMesh, tentX + 0.25, rowFrontZ],
      ['spiritbox', makeSpiritBoxItemMesh, tentX - 0.25, rowFrontZ],
      ['uv', makeUVItemMesh, tentX + 0.75, rowFrontZ],
      ['dots', makeDotsItemMesh, tentX, rowBackZ],
    ];
    toolSlots.forEach(([tool, maker, x, z]) => {
      const item = maker();
      item.position.y = 0.75 + toolRestOffset[tool];
      addPickupItem(x, z, item, () => collectTool(tool));
    });
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
    const doorPoint = new THREE.Vector2(2, -1.0); // 玄関を出てすぐの位置
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

  // ---- 幽霊の出没部屋(Upstairs Hallwayは通路なので除外) ----
  const hauntableRooms = rooms.filter(r => !r.hallway);
  initHaunting(hauntableRooms);
  setOrbRoom(room("Dining Room"));

  // ---- スポーン地点(テント入口を入ってすぐ。テントのdepth=4.5の手前寄り) ----
  camera.position.set(tentX, 1.6, tentZ + 4.5 / 2 - 1.0);
  camera.rotation.y = Math.PI;
}
