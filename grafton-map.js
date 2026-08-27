// Grafton Farmhouse マップ。今回は間取り(部屋・壁・ドア・階段・最低限の照明)だけを作ってあり、
// 「玄関・屋根裏が常に暗い」「壁に穴が開いている部屋は暖房が効かない」といった特殊ルールはまだ実装していない
import {
  THREE, mergeGeometries, scene, camera, rooms, room,
  wallBoxes, doorFrameGeometries, wallGeometries, wallHeight, wallMaterial, doorFrameMaterial,
  addWall, makeWoodTexture, scaled, woodBase,
  addRoomLight, addLightSwitch, updateRoomLightCulling, registerBreaker,
  addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool,
  initHaunting, setExteriorDoor, setOrbRoom, doors,
  onFrame, setCurrentUpperFloor, defineUpperFloor, setBuildingUpperFloor,
} from './engine.js';

export const mapId = 'grafton';
export const mapLabel = 'Grafton Farmhouse';

// 実際にこの家を組み立てる。main.js がこのマップを選んだ瞬間だけ呼ばれる
export function build() {
  // ---- 階の基準Yを決める(1階=0、2階=3.3、屋根裏=6.6) ----
  const FLOOR_1F = 0, FLOOR_2F = 1, FLOOR_ATTIC = 2;
  const y2F = wallHeight + 0.3;   // 3.3
  const yAttic = y2F * 2;         // 6.6
  defineUpperFloor(FLOOR_2F, y2F);
  defineUpperFloor(FLOOR_ATTIC, yAttic);

  // ---- 部屋一覧 ----
  // 1階(8部屋)
  rooms.push(
    { name: "Living Room",  bounds: { minX: 0, maxX: 4, minZ: 8, maxZ: 13 } },
    { name: "Kitchen",      bounds: { minX: 0, maxX: 4, minZ: 4, maxZ: 8 } },
    { name: "Utility Room", bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 } },
    { name: "Library",      bounds: { minX: 4, maxX: 9, minZ: 8, maxZ: 13 } },
    { name: "Dining Room",  bounds: { minX: 4, maxX: 9, minZ: 0, maxZ: 8 } },
    { name: "Downstairs Bathroom", bounds: { minX: 9, maxX: 13, minZ: 10, maxZ: 13 } },
    { name: "Work Room",    bounds: { minX: 9, maxX: 13, minZ: 5, maxZ: 10 } },
    { name: "Foyer",        bounds: { minX: 9, maxX: 13, minZ: 0, maxZ: 5 } },
  );
  // 2階(5部屋)
  rooms.push(
    { name: "Master Bathroom", bounds: { minX: 0, maxX: 4, minZ: 8, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Master Bedroom",  bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 8 }, upperFloor: FLOOR_2F },
    { name: "Upstairs Hallway", bounds: { minX: 4, maxX: 9, minZ: 0, maxZ: 13 }, upperFloor: FLOOR_2F, hallway: true },
    { name: "Twin Bedroom",    bounds: { minX: 9, maxX: 13, minZ: 8, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Child Bedroom",   bounds: { minX: 9, maxX: 13, minZ: 0, maxZ: 8 }, upperFloor: FLOOR_2F },
  );
  // 屋根裏(1部屋)
  rooms.push(
    { name: "Attic", bounds: { minX: 1, maxX: 12, minZ: 1, maxZ: 12 }, upperFloor: FLOOR_ATTIC },
  );

  // ---- 1階の壁・ドア ----
  // 外壁(南側、Foyerの位置に玄関を開ける)
  addWall('x', 0, 0, 13, 11);
  addWall('x', 13, 0, 13);
  addWall('z', 0, 0, 13);
  addWall('z', 13, 0, 13);
  // 内壁
  addWall('x', 4, 0, 4, 2);     // Utility Room / Kitchen
  addWall('x', 8, 0, 4, 2);     // Kitchen / Living Room
  addWall('z', 4, 0, 4, 2);     // Utility Room / Dining Room
  addWall('z', 4, 4, 8, 6);     // Kitchen / Dining Room
  addWall('z', 4, 8, 13, 10.5); // Living Room / Library
  addWall('x', 8, 4, 9, 6.5);   // Library / Dining Room
  addWall('z', 9, 0, 5, 2.5);   // Dining Room / Foyer
  addWall('z', 9, 5, 8, 6.5);   // Dining Room / Work Room
  addWall('x', 5, 9, 13, 11);   // Foyer / Work Room
  addWall('x', 10, 9, 13, 11);  // Work Room / Downstairs Bathroom

  // 玄関の外に出られるドアを、後でハント時にロックできるよう控えておく
  const entranceDoor = doors.find(d => !d.upperFloor && Math.abs(d.center.x - 11) < 0.01 && Math.abs(d.center.z - 0) < 0.01);
  if (entranceDoor) setExteriorDoor(entranceDoor);

  // ---- 2階の壁・ドア ----
  setBuildingUpperFloor(FLOOR_2F);
  addWall('x', 0, 0, 13);   // 外壁(2階に玄関は無い)
  addWall('x', 13, 0, 13);
  addWall('z', 0, 0, 13);
  addWall('z', 13, 0, 13);
  addWall('x', 8, 0, 4, 2);     // Master Bedroom / Master Bathroom
  addWall('z', 4, 0, 8, 4);     // Master Bedroom / Upstairs Hallway
  addWall('z', 4, 8, 13, 10.5); // Master Bathroom / Upstairs Hallway
  addWall('z', 9, 0, 8, 4);     // Upstairs Hallway / Child Bedroom
  addWall('z', 9, 8, 13, 10.5); // Upstairs Hallway / Twin Bedroom
  addWall('x', 8, 9, 13, 11);   // Child Bedroom / Twin Bedroom

  // ---- 屋根裏の壁(単一の部屋なので外周のみ) ----
  setBuildingUpperFloor(FLOOR_ATTIC);
  addWall('x', 1, 1, 12);
  addWall('x', 12, 1, 12);
  addWall('z', 1, 1, 12);
  addWall('z', 12, 1, 12);

  setBuildingUpperFloor(FLOOR_1F); // 以降の呼び出しは1階の扱いに戻す

  // 壁・ドア枠をまとめて描画(全階ぶんまとめて1回でよい)
  const mergedWall = new THREE.Mesh(mergeGeometries(wallGeometries), wallMaterial);
  mergedWall.castShadow = true; mergedWall.receiveShadow = true;
  scene.add(mergedWall);
  const mergedFrame = new THREE.Mesh(mergeGeometries(doorFrameGeometries), doorFrameMaterial);
  mergedFrame.castShadow = true; mergedFrame.receiveShadow = true;
  scene.add(mergedFrame);

  // ---- 床(見た目だけの板。階段の吹き抜け部分には敷かない・簡易グリッド版) ----
  const floorMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 7, 7) });
  function layFloor(outer, y, holes) {
    const cols = 6, rowsN = 6;
    const cw = (outer.maxX - outer.minX) / cols, ch = (outer.maxZ - outer.minZ) / rowsN;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsN; j++) {
        const cx0 = outer.minX + i * cw, cx1 = cx0 + cw;
        const cz0 = outer.minZ + j * ch, cz1 = cz0 + ch;
        const overlapsHole = holes.some(h => cx1 > h.minX && cx0 < h.maxX && cz1 > h.minZ && cz0 < h.maxZ);
        if (overlapsHole) continue;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), floorMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set((cx0 + cx1) / 2, y, (cz0 + cz1) / 2);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }
  }
  // 階段の吹き抜け(1階⇔2階、2階⇔屋根裏)
  const stairsA = { minX: 5.5, maxX: 7.5, bottomZ: 1, topZ: 5 };   // 1階Dining Room ⇔ 2階Upstairs Hallway
  const stairsB = { minX: 5.5, maxX: 7.5, bottomZ: 7, topZ: 11 };  // 2階Upstairs Hallway ⇔ 屋根裏Attic
  layFloor({ minX: 0, maxX: 13, minZ: 0, maxZ: 13 }, 0, []);                 // 1階の床(穴なし)
  layFloor({ minX: 0, maxX: 13, minZ: 0, maxZ: 13 }, y2F, [stairsA]);        // 1階の天井 兼 2階の床
  layFloor({ minX: 1, maxX: 12, minZ: 1, maxZ: 12 }, yAttic, [stairsB]);     // 2階の天井 兼 屋根裏の床

  // ---- 階段の昇り降り(Zの位置に応じてYを補間する。毎フレームengineから呼ばれる) ----
  function updateGraftonFloor() {
    const x = camera.position.x, z = camera.position.z;
    const inA = x >= stairsA.minX && x <= stairsA.maxX && z >= stairsA.bottomZ && z <= stairsA.topZ;
    const inB = x >= stairsB.minX && x <= stairsB.maxX && z >= stairsB.bottomZ && z <= stairsB.topZ;
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
  const roomLights = {
    "Living Room": addRoomLight("Living Room", 6),
    "Kitchen": addRoomLight("Kitchen", 6),
    "Utility Room": addRoomLight("Utility Room", 4),
    "Library": addRoomLight("Library", 5),
    "Dining Room": addRoomLight("Dining Room", 7),
    "Downstairs Bathroom": addRoomLight("Downstairs Bathroom", 3.5, 0xdcecff),
    "Work Room": addRoomLight("Work Room", 4),
    "Foyer": addRoomLight("Foyer", 4),
  };
  rooms.filter(r => !r.upperFloor).forEach(r => addLightSwitch(r.name, roomLights[r.name]));

  setBuildingUpperFloor(FLOOR_2F);
  const roomLights2F = {
    "Master Bathroom": addRoomLight("Master Bathroom", 4, 0xdcecff),
    "Master Bedroom": addRoomLight("Master Bedroom", 6),
    "Upstairs Hallway": addRoomLight("Upstairs Hallway", 5),
    "Twin Bedroom": addRoomLight("Twin Bedroom", 5),
    "Child Bedroom": addRoomLight("Child Bedroom", 5),
  };
  rooms.filter(r => r.upperFloor === FLOOR_2F).forEach(r => addLightSwitch(r.name, roomLights2F[r.name]));

  setBuildingUpperFloor(FLOOR_ATTIC);
  const roomLightsAttic = { "Attic": addRoomLight("Attic", 4) };
  addLightSwitch("Attic", roomLightsAttic["Attic"]);

  setBuildingUpperFloor(FLOOR_1F);

  // ブレーカー(Utility Room内、部屋の隅に設置)
  const breakerBox = { x: 0.6, z: 0.6 };
  const breakerMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const breakerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.15), breakerMat);
  breakerMesh.position.set(breakerBox.x, 1.4, breakerBox.z);
  scene.add(breakerMesh);
  function applyBreakerState() {
    updateRoomLightCulling();
  }
  registerBreaker(breakerBox, applyBreakerState);
  applyBreakerState(); // 開始時点ではbreakerOnがfalseなので、家中の照明がここで消灯される

  // ---- 道具一式(Utility Roomの作業台に置いておく。テントは無いので、この部屋が拠点になる) ----
  const toolTableMat = new THREE.MeshLambertMaterial({ map: scaled(woodBase, 1, 1) });
  const toolTable = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.6), toolTableMat);
  toolTable.position.set(2, 0.375, 3.6);
  toolTable.castShadow = true; toolTable.receiveShadow = true;
  scene.add(toolTable);
  wallBoxes.push({ minX: 0.9, maxX: 3.1, minZ: 3.3, maxZ: 3.9 });

  const toolSlots = [
    ['flashlight', makeFlashlightItemMesh, 1.1],
    ['emf', makeEMFItemMesh, 1.5],
    ['thermometer', makeThermoItemMesh, 1.9],
    ['notebook', makeNotebookItemMesh, 2.3],
    ['spiritbox', makeSpiritBoxItemMesh, 2.7],
    ['uv', makeUVItemMesh, 3.1],
    ['dots', makeDotsItemMesh, 3.5],
  ];
  toolSlots.forEach(([tool, maker, x]) => {
    const item = maker();
    item.position.y = 0.75 + toolRestOffset[tool];
    addPickupItem(x, 3.6, item, () => collectTool(tool));
  });

  // ---- 幽霊の出没部屋(Upstairs Hallwayは通路なので除外) ----
  const hauntableRooms = rooms.filter(r => !r.hallway);
  initHaunting(hauntableRooms);
  setOrbRoom(room("Dining Room"));

  // ---- スポーン地点(玄関を入ってすぐのFoyer) ----
  camera.position.set(11, 1.6, 1.5);
  camera.rotation.y = Math.PI;
}
