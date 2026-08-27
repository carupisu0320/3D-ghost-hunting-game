// Grafton Farmhouse マップ。今回は間取り(部屋・壁・ドア・階段・最低限の照明)だけを作ってあり、
// 「玄関・屋根裏が常に暗い」「壁に穴が開いている部屋は暖房が効かない」といった特殊ルールはまだ実装していない
import {
  THREE, mergeGeometries, scene, camera, rooms, room,
  wallBoxes, doorFrameGeometries, wallGeometries, wallHeight, wallMaterial, doorFrameMaterial,
  addWall, makeWoodTexture, scaled,
  addRoomLight, addLightSwitch, updateRoomLightCulling, registerBreaker,
  addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool, setNotebookWorldMesh,
  sanity, drawSanityScreen, sanityTexture,
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

  // ---- 拠点のテント(家の東側、玄関と同じZに正面を合わせて設置) ----
  const tentX = 26, tentZ = -1.0;
  {
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x4a5540 });
    const halfWidth = 2.75, depth = 4.5, wallH = 1.6, rise = 1.4;

    // 入口は-X側(家に向く側)。側面の壁はX方向に、背面の壁はテントの+X側に
    [1, -1].forEach(zSign => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(depth, wallH, 0.1), tentMat);
      wall.position.set(tentX, wallH / 2, tentZ + zSign * halfWidth);
      wall.castShadow = true; wall.receiveShadow = true;
      scene.add(wall);
      wallBoxes.push({ minX: tentX - depth / 2, maxX: tentX + depth / 2, minZ: wall.position.z - 0.15, maxZ: wall.position.z + 0.15 });
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallH, halfWidth * 2), tentMat);
    backWall.position.set(tentX + depth / 2, wallH / 2, tentZ);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    // 正気度モニター(入口を入ってすぐ左の壁)
    drawSanityScreen(sanity);
    const sanityFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    sanityFrame.position.set(tentX - 1.6, 1.5, tentZ - halfWidth + 0.03);
    sanityFrame.castShadow = true;
    scene.add(sanityFrame);
    const sanityScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: sanityTexture }));
    sanityScreen.position.set(tentX - 1.6, 1.5, tentZ - halfWidth + 0.06);
    scene.add(sanityScreen);
    wallBoxes.push({ minX: tentX + depth / 2 - 0.15, maxX: tentX + depth / 2 + 0.15, minZ: tentZ - halfWidth, maxZ: tentZ + halfWidth });

    // 壁の上に乗る切妻屋根(棟はX方向)
    const slopeLen = Math.sqrt(halfWidth * halfWidth + rise * rise) + 0.5;
    const angle = Math.atan2(rise, halfWidth);
    [1, -1].forEach(zSign => {
      const geo = new THREE.BoxGeometry(depth + 0.3, 0.25, slopeLen);
      const mesh = new THREE.Mesh(geo, tentMat);
      mesh.rotation.x = zSign * angle;
      mesh.position.set(tentX, wallH + rise / 2, tentZ + zSign * halfWidth / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // 妻側のすき間を三角の板で塞ぐ(+X側が背面、-X側が入口)
    {
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-halfWidth, 0);
      gableShape.lineTo(halfWidth, 0);
      gableShape.lineTo(0, rise);
      gableShape.closePath();
      const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
      const gable = new THREE.Mesh(gableGeo, tentMat);
      gable.rotation.y = Math.PI / 2;
      gable.position.set(tentX + depth / 2 + 0.06, wallH, tentZ);
      gable.castShadow = true; gable.receiveShadow = true;
      scene.add(gable);
    }

    // テント内のランタン
    const lanternLight = new THREE.PointLight(0xffcc77, 4, 7);
    lanternLight.position.set(tentX + 1.6, wallH + 0.4, tentZ);
    scene.add(lanternLight);
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 1.5 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lanternMat);
    lantern.position.copy(lanternLight.position);
    scene.add(lantern);

    // テーブルと道具(2列に並べる)
    const tableX = tentX + depth / 2 - 0.8;
    const tableMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 2.0), tableMat);
    table.position.set(tableX, 0.375, tentZ);
    table.castShadow = true; table.receiveShadow = true;
    scene.add(table);
    wallBoxes.push({ minX: tableX - 0.5, maxX: tableX + 0.5, minZ: tentZ - 1.0, maxZ: tentZ + 1.0 });

    const rowFrontX = tableX - 0.26, rowBackX = tableX + 0.26;
    const toolSlots = [
      ['flashlight', makeFlashlightItemMesh, rowFrontX, tentZ - 0.75],
      ['emf', makeEMFItemMesh, rowBackX, tentZ - 0.5],
      ['thermometer', makeThermoItemMesh, rowFrontX, tentZ + 0.25],
      ['spiritbox', makeSpiritBoxItemMesh, rowFrontX, tentZ - 0.25],
      ['uv', makeUVItemMesh, rowFrontX, tentZ + 0.75],
      ['dots', makeDotsItemMesh, rowBackX, tentZ],
    ];
    toolSlots.forEach(([tool, maker, x, z]) => {
      const item = maker();
      item.position.y = 0.75 + toolRestOffset[tool];
      addPickupItem(x, z, item, () => collectTool(tool));
    });
    const notebookItem = makeNotebookItemMesh();
    notebookItem.position.y = 0.75 + toolRestOffset.notebook;
    setNotebookWorldMesh(notebookItem);
    addPickupItem(rowBackX, tentZ + 0.5, notebookItem, () => collectTool('notebook'));
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
    const doorPoint = new THREE.Vector2(11, -1.0); // 玄関を出てすぐの位置
    const tentEntrance = new THREE.Vector2(tentX - tentDepthHalf - 1.0, tentZ);
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

  // ---- スポーン地点(テント入口を入ってすぐ) ----
  camera.position.set(tentX - 1.2, 1.6, tentZ);
  camera.rotation.y = -Math.PI / 2;
}
