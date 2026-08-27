// このファイルは「一軒家」マップ固有のデータ・配置だけを持つ。共通の仕組み(移動・道具・証拠・ハント・UIなど)はすべて engine.js 側にある
import {
  THREE, mergeGeometries, scene, camera, rooms, room, onGroundFloor, wallBoxes, basementWallBoxes, doors, wallGeometries, doorFrameGeometries, wallHeight, wallThickness, wallMaterial, doorFrameMaterial, addFramedPlane, addMergedMesh, addWall, addFurniture, makeWoodTexture, makeConcreteTexture, makeGrassTexture, scaled, woodBase, tileBase, ceramicMaterial, bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn, addSurveillanceCamera, videoCams, addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh, makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool, sanity, drawSanityScreen, sanityTexture, addRoomLight, addLightSwitch, updateRoomLightCulling, breakerOn, registerBreaker, setBasementFloorY, initHaunting, setExteriorDoor, setOrbRoom, onFrame, setOnGroundFloor, setNotebookWorldMesh,
} from './engine.js';

export const mapId = 'house';
export const mapLabel = '一軒家';

// 実際にこの家を組み立てる。main.js がこのマップを選んだ瞬間だけ呼ばれる(常に読み込み時に作られるわけではない)
export function build() {

// このマップの部屋一覧(engineが持つ空のroomsに登録する)
rooms.push(
  { name: "玄関",              bounds: { minX: 0,   maxX: 1.7, minZ: 6.3, maxZ: 8.2 } },
  { name: "浴室・洗面",         bounds: { minX: 1.7, maxX: 3.2, minZ: 6.3, maxZ: 8.2 } },
  { name: "トイレ",             bounds: { minX: 3.2, maxX: 4.2, minZ: 6.3, maxZ: 8.2 } },
  { name: "Master Bed Room",   bounds: { minX: 4.2, maxX: 6.4, minZ: 4.9, maxZ: 8.2 } },
  { name: "納戸",               bounds: { minX: 1.7, maxX: 3.2, minZ: 4.9, maxZ: 6.3 } },
  { name: "W.I.C",             bounds: { minX: 3.2, maxX: 4.2, minZ: 4.9, maxZ: 6.3 } },
  { name: "廊下",               bounds: { minX: 0,   maxX: 1.7, minZ: 4.9, maxZ: 6.3 } },
  { name: "Pantry",            bounds: { minX: 0,   maxX: 1.7, minZ: 3.9, maxZ: 4.9 } },
  { name: "Bed Room(4.5畳)",   bounds: { minX: 4.2, maxX: 6.4, minZ: 2.4, maxZ: 4.9 } },
  { name: "Bed Room(5.0畳)",   bounds: { minX: 4.2, maxX: 6.4, minZ: 0,   maxZ: 2.4 } },
  { name: "Living Dining Kitchen", bounds: { minX: 0, maxX: 4.2, minZ: 0, maxZ: 4.9 } },
);

const SCALE = 2;
rooms.forEach(r => {
  r.bounds.minX *= SCALE; r.bounds.maxX *= SCALE;
  r.bounds.minZ *= SCALE; r.bounds.maxZ *= SCALE;
});


// 地下室・階段の寸法(1階の床=Y0、地下の床=basementFloorY)。階段は納戸の東側(壁際、家具・ドアを避けた位置)を使う
const basement = { minX: 0, maxX: 6.4, minZ: 9.8, maxZ: 12.6 }; // 廊下+納戸の直下
const basementFloorY = -2.4;
const basementWallHeight = 2.4;
const stairs = { minX: 5.2, maxX: 6.0, topZ: 12.5, bottomZ: 10.3, steps: 10 };


camera.position.set(5.8, 1.6, 31.4); // テント内部、反転後の入口を入ってすぐの位置からスタート
camera.rotation.y = -Math.PI / 2; // テーブル・モニターのある奥(+X側)を向く


const wetRooms = new Set(["浴室・洗面", "トイレ", "玄関"]);
rooms.forEach((r) => {
  if (r.name === "納戸") return; // 地下への階段の穴を開けるため、専用の処理で床を張る
  const w = r.bounds.maxX - r.bounds.minX;
  const d = r.bounds.maxZ - r.bounds.minZ;
  const cx = (r.bounds.maxX + r.bounds.minX) / 2;
  const cz = (r.bounds.maxZ + r.bounds.minZ) / 2;
  const isWet = wetRooms.has(r.name);
  const tex = isWet ? scaled(tileBase, w / 0.5, d / 0.5) : scaled(woodBase, w / 1.5, d / 1.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);
});

// 納戸の床は階段の吹き抜け分だけ穴を開けて張る
{
  const s2 = room("納戸");
  const sw = s2.maxX - s2.minX, sd = s2.maxZ - s2.minZ;
  const storageFloorMat = new THREE.MeshLambertMaterial({ map: scaled(woodBase, sw / 1.5, sd / 1.5) });
  addFramedPlane(s2, { minX: stairs.minX, maxX: stairs.maxX, minZ: stairs.bottomZ, maxZ: stairs.topZ }, 0, storageFloorMat, true);
}


let houseMinX, houseMaxX, houseMinZ, houseMaxZ;
{
  const g = room("玄関"), b = room("浴室・洗面"), t = room("トイレ"), m = room("Master Bed Room");
  const s = room("納戸"), w = room("W.I.C"), h = room("廊下");
  const b45 = room("Bed Room(4.5畳)"), b50 = room("Bed Room(5.0畳)"), ldk = room("Living Dining Kitchen");
  houseMinX = ldk.minX; houseMaxX = m.maxX; houseMinZ = ldk.minZ; houseMaxZ = g.maxZ;

  addWall('z', houseMinX, houseMinZ, houseMaxZ);
  addWall('z', houseMaxX, houseMinZ, houseMaxZ);
  addWall('x', houseMaxZ, houseMinX, houseMaxX, 1.7); // 玄関側だけ外に出られるドアを開ける
  addWall('x', houseMinZ, houseMinX, houseMaxX);

  addWall('z', g.maxX, g.minZ, g.maxZ, (g.minZ + g.maxZ) / 2);
  addWall('z', b.maxX, b.minZ, b.maxZ, (b.minZ + b.maxZ) / 2);
  addWall('z', t.maxX, t.minZ, t.maxZ, (t.minZ + t.maxZ) / 2);
  addWall('x', g.minZ, g.minX, g.maxX, (g.minX + g.maxX) / 2);
  addWall('z', h.maxX, h.minZ, h.maxZ, (h.minZ + h.maxZ) / 2);
  addWall('x', h.minZ, h.minX, h.maxX, (h.minX + h.maxX) / 2);
  addWall('x', w.minZ, w.minX, w.maxX, (w.minX + w.maxX) / 2);
  addWall('z', b45.minX, b45.minZ, b45.maxZ, (b45.minZ + b45.maxZ) / 2);
  addWall('z', b50.minX, b50.minZ, b50.maxZ, (b50.minZ + b50.maxZ) / 2);

  addWall('x', b.minZ, b.minX, b.maxX);
  addWall('x', t.minZ, t.minX, t.maxX);
  addWall('z', m.minX, w.minZ, w.maxZ);
  addWall('x', b45.maxZ, m.minX, m.maxX);
  addWall('z', s.maxX, s.minZ, s.maxZ);
  addWall('x', s.minZ, s.minX, s.maxX);
  addWall('x', b50.maxZ, b45.minX, b45.maxX);
}


addMergedMesh(wallGeometries, wallMaterial);
addMergedMesh(doorFrameGeometries, doorFrameMaterial);

// 天井
{
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(houseMaxX - houseMinX, houseMaxZ - houseMinZ),
    new THREE.MeshLambertMaterial({ color: 0x1c1c1c, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((houseMinX + houseMaxX) / 2, wallHeight, (houseMinZ + houseMaxZ) / 2);
  ceiling.receiveShadow = true;
  scene.add(ceiling);
}


// ---- 地下室(コンクリート壁+木の床、納戸からの階段でつながる) ----
const concreteMat = new THREE.MeshLambertMaterial({ map: scaled(makeConcreteTexture(), 3, 1.2) });
const basementFloorMat = new THREE.MeshLambertMaterial({
  map: scaled(makeWoodTexture('#7a5a3a'), (basement.maxX - basement.minX) / 1.5, (basement.maxZ - basement.minZ) / 1.5)
});

// 地下の床
{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(basement.maxX - basement.minX, basement.maxZ - basement.minZ),
    basementFloorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((basement.minX + basement.maxX) / 2, basementFloorY, (basement.minZ + basement.maxZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);
}

// 地下の天井(1階の床の裏側にあたる。階段の吹き抜け分だけ穴を開ける)
// ※ 屋外の地面もY=-0.02にあるため、それと重ならないよう少し下げてある(Z-fighting対策)
{
  const ceilingMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  addFramedPlane(basement, { minX: stairs.minX, maxX: stairs.maxX, minZ: stairs.bottomZ, maxZ: stairs.topZ }, -0.06, ceilingMat, false);
}

// 地下の壁(四方を囲むだけ。出入りは階段のみ)
{
  const geometries = [];
  function addBasementWallSegment(minX, maxX, minZ, maxZ) {
    const geo = new THREE.BoxGeometry(maxX - minX, basementWallHeight, maxZ - minZ);
    geo.translate((minX + maxX) / 2, basementFloorY + basementWallHeight / 2, (minZ + maxZ) / 2);
    geometries.push(geo);
    basementWallBoxes.push({ minX, maxX, minZ, maxZ });
  }
  addBasementWallSegment(basement.minX - wallThickness / 2, basement.minX + wallThickness / 2, basement.minZ, basement.maxZ);
  addBasementWallSegment(basement.maxX - wallThickness / 2, basement.maxX + wallThickness / 2, basement.minZ, basement.maxZ);
  addBasementWallSegment(basement.minX, basement.maxX, basement.minZ - wallThickness / 2, basement.minZ + wallThickness / 2);
  // 北壁(階段側)は階段の幅ぶんだけ開口を空けて2つに分ける(ふさぐと階段を上りきれない)
  addBasementWallSegment(basement.minX, stairs.minX, basement.maxZ - wallThickness / 2, basement.maxZ + wallThickness / 2);
  addBasementWallSegment(stairs.maxX, basement.maxX, basement.maxZ - wallThickness / 2, basement.maxZ + wallThickness / 2);
  const mesh = new THREE.Mesh(mergeGeometries(geometries), concreteMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// 階段(踏み面を積み重ねた無垢のブロックとして表現)
const stepRise = -basementFloorY / stairs.steps;
const stepRun = (stairs.topZ - stairs.bottomZ) / stairs.steps;
{
  const stepMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#6b4a30'), 1, 1) });
  const stepGeometries = [];
  for (let i = 0; i < stairs.steps - 1; i++) {
    const topY = -stepRise * (i + 1);
    const zFar = stairs.topZ - stepRun * i;
    const zNear = stairs.topZ - stepRun * (i + 1);
    const h = topY - basementFloorY;
    const geo = new THREE.BoxGeometry(stairs.maxX - stairs.minX, h, zFar - zNear);
    geo.translate((stairs.minX + stairs.maxX) / 2, basementFloorY + h / 2, (zNear + zFar) / 2);
    stepGeometries.push(geo);
  }
  const stepsMesh = new THREE.Mesh(mergeGeometries(stepGeometries), stepMat);
  stepsMesh.castShadow = true;
  stepsMesh.receiveShadow = true;
  scene.add(stepsMesh);

  // 手すり(開口側=部屋の中央寄りに沿った1本の金属パイプ+支柱3本)
  const railMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const railX = stairs.minX - 0.04;
  const p1 = new THREE.Vector3(railX, 0.9, stairs.topZ);
  const p2 = new THREE.Vector3(railX, basementFloorY + 0.9, stairs.bottomZ);
  const dir = p2.clone().sub(p1);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, dir.length(), 8), railMat);
  rail.position.copy(p1).add(p2).multiplyScalar(0.5);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  rail.castShadow = true;
  scene.add(rail);

  const postGeometries = [];
  [0, Math.floor(stairs.steps / 2), stairs.steps - 1].forEach(i => {
    const z = stairs.topZ - stepRun * i;
    const floorY = -stepRise * i;
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8);
    geo.translate(railX, floorY + 0.45, z);
    postGeometries.push(geo);
  });
  const postsMesh = new THREE.Mesh(mergeGeometries(postGeometries), railMat);
  postsMesh.castShadow = true;
  scene.add(postsMesh);
}

// 地下の照明(壁付けのブラケットライト。ブレーカーが入っているときだけ点灯)。西側の壁、ブレーカーのそば
let basementLight, basementFixtureMat;
{
  basementLight = new THREE.PointLight(0xffdca8, 9, 10);
  basementLight.position.set(basement.minX + 0.3, basementFloorY + 2.0, (basement.minZ + basement.maxZ) / 2);
  basementLight.visible = false;
  scene.add(basementLight);
  basementFixtureMat = new THREE.MeshLambertMaterial({ color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 0 });
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), basementFixtureMat);
  fixture.rotation.z = Math.PI / 2;
  fixture.position.copy(basementLight.position);
  scene.add(fixture);
}

// ブレーカー(地下室内、西側の壁の中央に設置。近づいてクリックでON/OFF)
let breakerLeverMat;
const breakerBox = { x: basement.minX + 0.1, z: (basement.minZ + basement.maxZ) / 2 };
{
  const panelMat = new THREE.MeshLambertMaterial({ color: 0x2e2e2e });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.32), panelMat);
  panel.position.set(breakerBox.x + 0.03, basementFloorY + 1.3, breakerBox.z);
  panel.castShadow = true;
  scene.add(panel);
  breakerLeverMat = new THREE.MeshLambertMaterial({ color: 0x552222, emissive: 0x220000, emissiveIntensity: 0.4 });
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.05), breakerLeverMat);
  lever.position.set(breakerBox.x + 0.07, basementFloorY + 1.3, breakerBox.z - 0.08);
  scene.add(lever);
}

// ブレーカーの状態を全ての照明に反映する
function applyBreakerState() {
  updateRoomLightCulling();
  basementLight.visible = breakerOn;
  basementFixtureMat.emissiveIntensity = breakerOn ? 1.2 : 0;
  breakerLeverMat.color.set(breakerOn ? 0x2f6b2f : 0x552222);
  breakerLeverMat.emissive.set(breakerOn ? 0x113311 : 0x220000);
}
registerBreaker(breakerBox, applyBreakerState);
applyBreakerState(); // 開始時点ではbreakerOnがfalseなので、家中の照明がここで消灯される

// 階段の範囲にいればYを補間し、いなければ現在の階の高さに合わせる。毎フレームengineから呼んでもらう
function updateFloorHeight() {
  const x = camera.position.x, z = camera.position.z;
  const inStairs = x >= stairs.minX && x <= stairs.maxX && z <= stairs.topZ && z >= stairs.bottomZ;
  if (inStairs) {
    const t = (stairs.topZ - z) / (stairs.topZ - stairs.bottomZ); // 0(上)〜1(下)
    camera.position.y = basementFloorY * t + 1.6;
    setOnGroundFloor(t < 0.5);
  } else {
    camera.position.y = (onGroundFloor ? 0 : basementFloorY) + 1.6;
  }
}
setBasementFloorY(basementFloorY);
onFrame(updateFloorHeight);


// 屋根(切妻。外から見たときに屋根らしく見えるようにする)
{
  const overhang = 0.6;
  const rise = 2.0;
  const roofThickness = 0.3;
  const midX = (houseMinX + houseMaxX) / 2;
  const roofMinX = houseMinX - overhang;
  const roofMaxX = houseMaxX + overhang;
  const roofDepth = (houseMaxZ - houseMinZ) + overhang * 2;
  const halfSpan = (roofMaxX - roofMinX) / 2;
  const slopeLen = Math.sqrt(halfSpan * halfSpan + rise * rise) + 0.5; // 棟ですき間が出ないよう長めに
  const angle = Math.atan2(rise, halfSpan);
  const roofMaterial = new THREE.MeshLambertMaterial({ color: 0x2b2320 });

  [1, -1].forEach(xSign => {
    const geo = new THREE.BoxGeometry(slopeLen, roofThickness, roofDepth);
    const mesh = new THREE.Mesh(geo, roofMaterial);
    mesh.rotation.z = -xSign * angle;
    mesh.position.set(midX + xSign * halfSpan / 2, wallHeight + rise / 2, (houseMinZ + houseMaxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // 妻側(壁の上、屋根の三角の下)のすき間を三角の板で塞ぐ
  const gableHalfWidth = (houseMaxX - houseMinX) / 2;
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-gableHalfWidth, 0);
  gableShape.lineTo(gableHalfWidth, 0);
  gableShape.lineTo(0, rise);
  gableShape.closePath();
  [houseMinZ, houseMaxZ].forEach(z => {
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
    const gable = new THREE.Mesh(gableGeo, wallMaterial);
    gable.position.set(midX, wallHeight, z - 0.06);
    gable.castShadow = true;
    gable.receiveShadow = true;
    scene.add(gable);
  });
}

// 外の地面(納戸の階段の吹き抜け分だけ穴を開ける。地下から見上げたときに屋外の地面が透けて見えるのを防ぐ)
const grassBase = makeGrassTexture();
{
  const groundOuter = { minX: (houseMinX + houseMaxX) / 2 - 50, maxX: (houseMinX + houseMaxX) / 2 + 50, minZ: (houseMinZ + houseMaxZ) / 2 - 50, maxZ: (houseMinZ + houseMaxZ) / 2 + 50 };
  const groundHole = { minX: stairs.minX, maxX: stairs.maxX, minZ: stairs.bottomZ, maxZ: stairs.topZ };
  const tileSize = 100 / 34; // 元の地面(100角、34回リピート)と同じ目の細かさに揃える
  [
    { minX: groundOuter.minX, maxX: groundOuter.maxX, minZ: groundHole.maxZ, maxZ: groundOuter.maxZ },
    { minX: groundOuter.minX, maxX: groundOuter.maxX, minZ: groundOuter.minZ, maxZ: groundHole.minZ },
    { minX: groundOuter.minX, maxX: groundHole.minX, minZ: groundHole.minZ, maxZ: groundHole.maxZ },
    { minX: groundHole.maxX, maxX: groundOuter.maxX, minZ: groundHole.minZ, maxZ: groundHole.maxZ },
  ].forEach(p => {
    const w = p.maxX - p.minX, d = p.maxZ - p.minZ;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ map: scaled(grassBase, w / tileSize, d / tileSize) })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((p.minX + p.maxX) / 2, -0.02, (p.minZ + p.maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}


// 森の木(家の周り、玄関の外は少し広めに開けておく)
const trunkGeometries = [];
const foliageGeometries = [];
const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2b1a });
const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x142414 });

function addTree(x, z) {
  const trunkH = 3 + Math.random() * 2;
  const trunkR = 0.15 + Math.random() * 0.1;
  const trunkGeo = new THREE.CylinderGeometry(trunkR, trunkR * 1.3, trunkH, 8);
  trunkGeo.translate(x, trunkH / 2, z);
  trunkGeometries.push(trunkGeo);

  const foliageH = 2.5 + Math.random() * 1.5;
  const foliageGeo = new THREE.ConeGeometry(1.1 + Math.random() * 0.6, foliageH, 8);
  foliageGeo.translate(x, trunkH + foliageH / 2 - 0.3, z);
  foliageGeometries.push(foliageGeo);

  wallBoxes.push({ minX: x - trunkR - 0.2, maxX: x + trunkR + 0.2, minZ: z - trunkR - 0.2, maxZ: z + trunkR + 0.2 });
}

function placeForest(count) {
  const margin = 22;
  const buffer = 1.5;
  let placed = 0, attempts = 0;
  while (placed < count && attempts < count * 6) {
    attempts++;
    const x = houseMinX - margin + Math.random() * (houseMaxX - houseMinX + margin * 2);
    const z = houseMinZ - margin + Math.random() * (houseMaxZ - houseMinZ + margin * 2);
    const nearHouse = x > houseMinX - buffer && x < houseMaxX + buffer && z > houseMinZ - buffer && z < houseMaxZ + buffer;
    const nearEntranceDoor = Math.abs(x - 1.7) < 2.2 && z > houseMaxZ && z < houseMaxZ + 3.5;
    const nearTent = Math.abs(x - 7) < 4.5 && z > houseMaxZ + 10.5 && z < houseMaxZ + 20;
    if (nearHouse || nearEntranceDoor || nearTent) continue;
    addTree(x, z);
    placed++;
  }
}
placeForest(60);

// 木をまとめて2メッシュ(幹・葉)にする(屋外の木は影を落とさず負荷を抑える)
{
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunkGeometries), trunkMaterial);
  trunkMesh.castShadow = false;
  trunkMesh.receiveShadow = true;
  scene.add(trunkMesh);

  const foliageMesh = new THREE.Mesh(mergeGeometries(foliageGeometries), foliageMaterial);
  foliageMesh.castShadow = false;
  scene.add(foliageMesh);
}


addSurveillanceCamera("Living Dining Kitchen");
addSurveillanceCamera("Master Bed Room");
addSurveillanceCamera("Bed Room(5.0畳)");
addSurveillanceCamera("玄関");


const tentX = 7, tentZ = houseMaxZ + 15; // マスターベッドルーム側へ寄せつつ、さらに家から離す
{
  const tentMat = new THREE.MeshLambertMaterial({ color: 0x4a5540 });
  const halfWidth = 2.75, depth = 4.5, wallH = 1.6, rise = 1.4;

  // 90度回転版: 入口は+X側(横向き)。側面の壁はX方向に、背面の壁はテントの-X側に
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

  // 正気度モニター(入口(-X側)を入ってすぐ左の壁。入口を向いて進む方向(+X)から見て左は-Z側の壁)
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
  const slopeLen = Math.sqrt(halfWidth * halfWidth + rise * rise) + 0.5; // 棟ですき間が出ないよう長めに
  const angle = Math.atan2(rise, halfWidth);
  [1, -1].forEach(zSign => {
    const geo = new THREE.BoxGeometry(depth + 0.3, 0.25, slopeLen);
    const mesh = new THREE.Mesh(geo, tentMat);
    mesh.rotation.x = zSign * angle;
    mesh.position.set(tentX, wallH + rise / 2, tentZ + zSign * halfWidth / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // 妻側のすき間を三角の板で塞ぐ(向きを反転したので+X側が背面、-X側が入口)
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
    gable.castShadow = true;
    gable.receiveShadow = true;
    scene.add(gable);
  }

  // テント内のランタン(テーブル・モニターの上あたりを照らす)
  const lanternLight = new THREE.PointLight(0xffcc77, 4, 7);
  lanternLight.position.set(tentX + 1.6, wallH + 0.4, tentZ);
  scene.add(lanternLight);
  const lanternMat = new THREE.MeshLambertMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 1.5 });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lanternMat);
  lantern.position.copy(lanternLight.position);
  scene.add(lantern);

  // テーブルは奥の壁際(+X側)に設置。道具が7種類に増えたので、余裕を持って2列に並べられるよう天板を広くする
  const tableX = tentX + depth / 2 - 0.8;
  const tableMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 2.0), tableMat);
  table.position.set(tableX, 0.375, tentZ);
  table.castShadow = true;
  table.receiveShadow = true;
  scene.add(table);
  wallBoxes.push({ minX: tableX - 0.5, maxX: tableX + 0.5, minZ: tentZ - 1.0, maxZ: tentZ + 1.0 });

  // 道具はテーブルの上に、手前列・奥列の2列に間隔を広めにとって並べる(メッシュ生成・収集処理は上でモジュール直下に定義済み。捨てたときの再配置にも使い回す)
  const rowFrontX = tableX - 0.26, rowBackX = tableX + 0.26;

  const flashlightItem = makeFlashlightItemMesh();
  flashlightItem.position.y = 0.75 + toolRestOffset.flashlight;
  addPickupItem(rowFrontX, tentZ - 0.75, flashlightItem, () => collectTool('flashlight'));

  const emfItem = makeEMFItemMesh();
  emfItem.position.y = 0.75 + toolRestOffset.emf;
  addPickupItem(rowBackX, tentZ - 0.5, emfItem, () => collectTool('emf'));

  // 温度計は手前列の中央あたりに置く
  const thermoItem = makeThermoItemMesh();
  thermoItem.position.y = 0.75 + toolRestOffset.thermometer;
  addPickupItem(rowFrontX, tentZ + 0.25, thermoItem, () => collectTool('thermometer'));

  // ノート(ゴーストライティング用)は懐中電灯・EMFと同じ収集物として、奥列の端に置く
  const notebookItem = makeNotebookItemMesh();
  notebookItem.position.y = 0.75 + toolRestOffset.notebook;
  setNotebookWorldMesh(notebookItem); // まだ拾われていない間も、書き込み発生時にここへ反映する
  addPickupItem(rowBackX, tentZ + 0.5, notebookItem, () => collectTool('notebook'));

  // 追加の道具(スピリットボックス・UVライト・D.O.T.S)も同じ2列の空いている位置に並べる
  const spiritBoxItem = makeSpiritBoxItemMesh();
  spiritBoxItem.position.y = 0.75 + toolRestOffset.spiritbox;
  addPickupItem(rowFrontX, tentZ - 0.25, spiritBoxItem, () => collectTool('spiritbox'));

  const uvItem = makeUVItemMesh();
  uvItem.position.y = 0.75 + toolRestOffset.uv;
  addPickupItem(rowFrontX, tentZ + 0.75, uvItem, () => collectTool('uv'));

  const dotsItem = makeDotsItemMesh();
  dotsItem.position.y = 0.75 + toolRestOffset.dots;
  addPickupItem(rowBackX, tentZ, dotsItem, () => collectTool('dots'));

  // 監視カメラの映像を映すモニターは、テーブルの奥(+X側)の背面の壁に横一列に並べる。画面はフレームから離して点滅(Zファイティング)を防ぐ
  const monitorFrameMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const monitorW = 0.6, monitorH = 0.45, monitorSpacing = 0.75;
  videoCams.forEach((cam, i) => {
    const zOffset = (i - (videoCams.length - 1) / 2) * monitorSpacing;
    const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, monitorH + 0.08, monitorW + 0.08), monitorFrameMat);
    monitorFrame.position.set(tentX + depth / 2 - 0.06, 1.5, tentZ + zOffset);
    monitorFrame.castShadow = true;
    scene.add(monitorFrame);
    const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(monitorW, monitorH), cam.material);
    monitorScreen.rotation.y = -Math.PI / 2;
    monitorScreen.position.set(tentX + depth / 2 - 0.14, 1.5, tentZ + zOffset);
    scene.add(monitorScreen);
  });
}

// テントから玄関までの導線を照らす作業灯(三脚+2灯式。ブレーカーとは無関係に常時点灯)
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

    // 三脚(3本の脚をハブから均等に開く)
    const hub = new THREE.Vector3(0, 0.55, 0);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      addLegBetween(group, hub, new THREE.Vector3(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4));
    }

    // 伸縮ポール+上部の横バー
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.2, 8), legMat);
    pole.position.y = 1.15;
    group.add(pole);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), legMat);
    bar.position.y = 1.75;
    group.add(bar);

    // ライトヘッド2灯(緑の筐体+発光面)
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

    // 光源はlightSwitches/breakerには登録しない = 常時点灯
    const light = new THREE.PointLight(0xfff6e0, 6, 11);
    light.position.set(x, 1.75, z);
    scene.add(light);

    wallBoxes.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
  }

  // テント入口(-X側)から玄関の扉まで、玄関とテント入口を結ぶ直線上に均等間隔で4本(交互に少しだけ左右へ振り分ける)
  const tentDepthHalf = 2.25; // テント本体のブロックで使っているdepth(4.5)の半分。ここではブロックが別なので直接参照できず、値だけ合わせている
  const doorPoint = new THREE.Vector2(1.7, houseMaxZ + 1.0); // 玄関を出てすぐの位置
  const tentEntrance = new THREE.Vector2(tentX - tentDepthHalf - 1.0, tentZ); // テント入口の少し手前
  const pathDir = tentEntrance.clone().sub(doorPoint).normalize();
  const pathPerp = new THREE.Vector2(-pathDir.y, pathDir.x);
  const pathFacing = Math.atan2(-pathDir.x, -pathDir.y); // テント側から玄関側を向く角度
  const pathStands = [0.2, 0.4, 0.6, 0.8].map((t, i) => {
    const base = doorPoint.clone().lerp(tentEntrance, t);
    const side = i % 2 === 0 ? 1 : -1;
    const p = base.addScaledVector(pathPerp, side * 1.2);
    return { x: p.x, z: p.y };
  });
  pathStands.forEach(p => addWorkLight(p.x, p.z, pathFacing));
}


bedIn("Master Bed Room", 1.1, 1.2, 1.8, 2.0);
wardrobeIn("Master Bed Room", 3.8, 3.4, 1.0, 0.6, 1.8);
bedIn("Bed Room(4.5畳)", 3.8, 1.2, 1.0, 2.0);
furnitureIn("Bed Room(4.5畳)", 0.8, 4.65, 0.9, 0.5, 0.75);
bedIn("Bed Room(5.0畳)", 3.8, 1.2, 1.0, 2.0);
furnitureIn("Bed Room(5.0畳)", 0.8, 4.45, 0.9, 0.5, 0.75);

furnitureIn("玄関", 0.7, 0.8, 1.2, 0.4, 0.7);
washstandIn("浴室・洗面", 0.6, 0.3, 0.9, 0.5, 0.85);
furnitureIn("浴室・洗面", 1.9, 0.8, 1.4, 1.4, 0.6, ceramicMaterial);
toiletIn("トイレ", 1.0, 0.35);
furnitureIn("納戸", 0.8, 0.5, 1.2, 0.4, 1.8);
furnitureIn("W.I.C", 0.6, 2.5, 0.8, 0.4, 1.8);
// Pantryの棚は廊下/LDK間のドアの開閉範囲(X:1.0〜1.2)と重なっていたため削除

{
  const ldk = room("Living Dining Kitchen");
  addFurniture((ldk.minX + ldk.maxX) / 2, ldk.minZ + 1.6, 1.8, 0.9, 0.75);
  sofaAt(ldk.minX + 4.2, ldk.minZ + 6.5, 1.8, 0.9);
  counterAt(ldk.minX + 5.0, ldk.maxZ - 0.6, 2.6, 0.7, 0.9);
  fridgeAt(ldk.minX + 2.7, ldk.maxZ - 0.6, 0.7, 0.7, 1.7);
}


// 納戸は階段の穴があるため、幽霊の出没候補から除外する
const hauntableRooms = rooms.filter(r => r.name !== "廊下" && r.name !== "Pantry" && r.name !== "納戸");
initHaunting(hauntableRooms);

// 家の外に出られる唯一のドア(玄関)。ハント中はengine側がここをロックする
const entranceDoor = doors.find(d => Math.abs(d.center.x - 1.7) < 0.01 && Math.abs(d.center.z - houseMaxZ) < 0.01);
if (entranceDoor) setExteriorDoor(entranceDoor);

setOrbRoom(room("Living Dining Kitchen"));

const roomLights = {
  "Living Dining Kitchen": addRoomLight("Living Dining Kitchen", 8),
  "Master Bed Room": addRoomLight("Master Bed Room", 6),
  "Bed Room(4.5畳)": addRoomLight("Bed Room(4.5畳)", 5),
  "Bed Room(5.0畳)": addRoomLight("Bed Room(5.0畳)", 5),
  "玄関": addRoomLight("玄関", 4),
  "浴室・洗面": addRoomLight("浴室・洗面", 5, 0xdcecff),
  "トイレ": addRoomLight("トイレ", 3.5, 0xdcecff),
  "納戸": addRoomLight("納戸", 3.5),
  "W.I.C": addRoomLight("W.I.C", 3),
  "廊下": addRoomLight("廊下", 3.5),
  // Pantryは壁で仕切られておらずLDKと同じ空間なので、専用の照明は持たない
};


rooms.forEach(r => {
  if (r.name === "Pantry") return; // 専用の照明がないので、スイッチも設置しない
  if (r.name === "Living Dining Kitchen") {
    addLightSwitch(r.name, roomLights[r.name], 6.3, 9.5); // W.I.C側の扉付近(廊下・玄関に近い側)
  } else {
    addLightSwitch(r.name, roomLights[r.name]);
  }
});

// このマップの情報(main.js がマップ選択画面に登録するときに使う)
}
