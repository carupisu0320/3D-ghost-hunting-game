import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const rooms = [
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
];

const SCALE = 2;
rooms.forEach(r => {
  r.bounds.minX *= SCALE; r.bounds.maxX *= SCALE;
  r.bounds.minZ *= SCALE; r.bounds.maxZ *= SCALE;
});

function room(name) {
  return rooms.find(r => r.name === name).bounds;
}

function getRoomAt(x, z) {
  return rooms.find(r =>
    x >= r.bounds.minX && x <= r.bounds.maxX &&
    z >= r.bounds.minZ && z <= r.bounds.maxZ
  )?.name ?? "外";
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03030a);
scene.fog = new THREE.Fog(0x03030a, 6, 24);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(7, 1.6, 35.9); // テント入口の外側からスタート(houseMaxZ + 19.5)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// ---- 手続き的テクスチャ(画像ファイルを使わず、その場で模様を描く) ----
function makeWoodTexture(baseColor = '#8a6642') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  const plankCount = 6;
  const plankH = 256 / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const shade = (Math.random() - 0.5) * 40;
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade / 255})` : `rgba(0,0,0,${-shade / 255})`;
    ctx.fillRect(0, i * plankH, 256, plankH);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * plankH);
    ctx.lineTo(256, i * plankH);
    ctx.stroke();
  }
  for (let i = 0; i < 250; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 200, y);
    ctx.lineTo(Math.random() * 200 + 40, y + (Math.random() * 4 - 2));
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeTileTexture(baseColor = '#d9d4c8') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  const gridSize = 4;
  const cell = 256 / gridSize;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(256, i * cell); ctx.stroke();
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeWallTexture(baseColor = '#767676') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = Math.random() * 24 - 12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 200})` : `rgba(0,0,0,${-v / 200})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeDoorTexture(baseColor = '#6b4022') {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 60, y);
    ctx.lineTo(Math.random() * 60 + 60, y + (Math.random() * 3 - 1.5));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 18, 100, 96);
  ctx.strokeRect(14, 142, 100, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2e3d24';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5
      ? `rgba(110,130,80,${Math.random() * 0.5})`
      : `rgba(15,20,10,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function scaled(base, rx, ry) {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

const woodBase = makeWoodTexture();
const tileBase = makeTileTexture();
const wallBase = makeWallTexture();

// 床(水回りはタイル、それ以外は木目)
const wetRooms = new Set(["浴室・洗面", "トイレ", "玄関"]);
rooms.forEach((r) => {
  const w = r.bounds.maxX - r.bounds.minX;
  const d = r.bounds.maxZ - r.bounds.minZ;
  const cx = (r.bounds.maxX + r.bounds.minX) / 2;
  const cz = (r.bounds.maxZ + r.bounds.minZ) / 2;
  const isWet = wetRooms.has(r.name);
  const tex = isWet ? scaled(tileBase, w / 0.5, d / 0.5) : scaled(woodBase, w / 1.5, d / 1.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: tex, roughness: isWet ? 0.35 : 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  scene.add(floor);
});

// 壁・ドア(描画は最後にまとめて1メッシュずつに結合する。当たり判定は今まで通りwallBoxesで個別管理)
const wallBoxes = [];
const wallGeometries = [];
const doorPanelGeometries = [];
const doorFrameGeometries = [];
const doorHandleGeometries = [];
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const doorHeight = 2.1;
const wallMaterial = new THREE.MeshStandardMaterial({ map: scaled(wallBase, 4, 2), roughness: 0.9 });
const doorMaterial = new THREE.MeshStandardMaterial({ map: scaled(makeDoorTexture(), 1, 1), roughness: 0.5 });
const doorFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.7 });
const doorHandleMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.6 });

function addWallSegment(minX, maxX, minZ, maxZ) {
  const geo = new THREE.BoxGeometry(maxX - minX, wallHeight, maxZ - minZ);
  geo.translate((minX + maxX) / 2, wallHeight / 2, (minZ + maxZ) / 2);
  wallGeometries.push(geo);
  wallBoxes.push({ minX, maxX, minZ, maxZ });
}

function addDoor(axis, fixedPos, doorAt) {
  const panelGeo = new THREE.BoxGeometry(
    axis === 'x' ? doorWidth : wallThickness,
    doorHeight,
    axis === 'x' ? wallThickness : doorWidth
  );
  const trimW = 0.06;
  const trimDepth = wallThickness + 0.04;
  const sideLen = doorHeight + trimW;

  if (axis === 'x') {
    panelGeo.translate(doorAt, doorHeight / 2, fixedPos);
    doorPanelGeometries.push(panelGeo);

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(x => {
      const side = new THREE.BoxGeometry(trimW, sideLen, trimDepth);
      side.translate(x, sideLen / 2, fixedPos);
      doorFrameGeometries.push(side);
    });
    const top = new THREE.BoxGeometry(doorWidth + trimW * 2, trimW, trimDepth);
    top.translate(doorAt, doorHeight + trimW / 2, fixedPos);
    doorFrameGeometries.push(top);

    const header = new THREE.BoxGeometry(doorWidth, wallHeight - doorHeight, wallThickness);
    header.translate(doorAt, doorHeight + (wallHeight - doorHeight) / 2, fixedPos);
    wallGeometries.push(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(zOff => {
      const handle = new THREE.BoxGeometry(0.035, 0.14, 0.05);
      handle.translate(doorAt + doorWidth * 0.36, doorHeight * 0.45, fixedPos + zOff);
      doorHandleGeometries.push(handle);
    });
  } else {
    panelGeo.translate(fixedPos, doorHeight / 2, doorAt);
    doorPanelGeometries.push(panelGeo);

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(z => {
      const side = new THREE.BoxGeometry(trimDepth, sideLen, trimW);
      side.translate(fixedPos, sideLen / 2, z);
      doorFrameGeometries.push(side);
    });
    const top = new THREE.BoxGeometry(trimDepth, trimW, doorWidth + trimW * 2);
    top.translate(fixedPos, doorHeight + trimW / 2, doorAt);
    doorFrameGeometries.push(top);

    const header = new THREE.BoxGeometry(wallThickness, wallHeight - doorHeight, doorWidth);
    header.translate(fixedPos, doorHeight + (wallHeight - doorHeight) / 2, doorAt);
    wallGeometries.push(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(xOff => {
      const handle = new THREE.BoxGeometry(0.05, 0.14, 0.035);
      handle.translate(fixedPos + xOff, doorHeight * 0.45, doorAt + doorWidth * 0.36);
      doorHandleGeometries.push(handle);
    });
  }
}

function addWall(axis, fixedPos, from, to, doorAt) {
  const ranges = doorAt === undefined
    ? [[from, to]]
    : [[from, doorAt - doorWidth / 2], [doorAt + doorWidth / 2, to]];

  ranges.forEach(([s, e]) => {
    if (e - s < 0.05) return;
    if (axis === 'x') addWallSegment(s, e, fixedPos - wallThickness / 2, fixedPos + wallThickness / 2);
    else addWallSegment(fixedPos - wallThickness / 2, fixedPos + wallThickness / 2, s, e);
  });
  if (doorAt !== undefined) addDoor(axis, fixedPos, doorAt);
}

function collidesWithWalls(x, z, radius = 0.3) {
  return wallBoxes.some(b =>
    x + radius > b.minX && x - radius < b.maxX &&
    z + radius > b.minZ && z - radius < b.maxZ
  );
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

// 壁・ドアをまとめて1メッシュずつにする(個別に作るより描画負荷が大幅に軽い)
function addMergedMesh(geometries, material) {
  if (geometries.length === 0) return;
  const merged = mergeGeometries(geometries);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
addMergedMesh(wallGeometries, wallMaterial);
addMergedMesh(doorPanelGeometries, doorMaterial);
addMergedMesh(doorFrameGeometries, doorFrameMaterial);
addMergedMesh(doorHandleGeometries, doorHandleMaterial);

// 天井
{
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(houseMaxX - houseMinX, houseMaxZ - houseMinZ),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.95, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((houseMinX + houseMaxX) / 2, wallHeight, (houseMinZ + houseMaxZ) / 2);
  ceiling.receiveShadow = true;
  scene.add(ceiling);
}

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
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 0.85 });

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

// 外の地面
const groundTexture = scaled(makeGrassTexture(), 34, 34);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set((houseMinX + houseMaxX) / 2, -0.02, (houseMinZ + houseMaxZ) / 2);
ground.receiveShadow = true;
scene.add(ground);

// 森の木(家の周り、玄関の外は少し広めに開けておく)
const trunkGeometries = [];
const foliageGeometries = [];
const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.9 });
const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x142414, roughness: 0.95 });

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

// 木をまとめて2メッシュ(幹・葉)にする
{
  const trunkMesh = new THREE.Mesh(mergeGeometries(trunkGeometries), trunkMaterial);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  scene.add(trunkMesh);

  const foliageMesh = new THREE.Mesh(mergeGeometries(foliageGeometries), foliageMaterial);
  foliageMesh.castShadow = true;
  scene.add(foliageMesh);
}

// 拠点のテント(懐中電灯・EMFリーダーはここで拾うまで使えない)
let hasFlashlight = false;
let hasEMF = false;
const pickupItems = [];
function addPickupItem(x, z, mesh, onCollect) {
  mesh.position.x = x;
  mesh.position.z = z;
  scene.add(mesh);
  pickupItems.push({ x, z, mesh, collected: false, onCollect });
}

// 監視カメラ(Living Dining Kitchenに設置し、テントのモニターへ映像を送る)
const monitorRT = new THREE.WebGLRenderTarget(192, 144);
const monitorMaterial = new THREE.MeshBasicMaterial({ map: monitorRT.texture });
const videoCam = new THREE.PerspectiveCamera(60, 256 / 192, 0.1, 30);
videoCam.layers.enable(1);
{
  const ldkForCam = room("Living Dining Kitchen");
  videoCam.position.set(ldkForCam.minX + 1.0, 2.4, ldkForCam.minZ + 1.0);
  videoCam.lookAt(ldkForCam.maxX - 1.0, 1.0, ldkForCam.maxZ - 1.0);
  scene.add(videoCam);
}

const tentX = 7, tentZ = houseMaxZ + 15; // マスターベッドルーム側へ寄せつつ、さらに家から離す
{
  const tentMat = new THREE.MeshStandardMaterial({ color: 0x4a5540, roughness: 0.9 });
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
  backWall.position.set(tentX - depth / 2, wallH / 2, tentZ);
  backWall.castShadow = true; backWall.receiveShadow = true;
  scene.add(backWall);
  wallBoxes.push({ minX: tentX - depth / 2 - 0.15, maxX: tentX - depth / 2 + 0.15, minZ: tentZ - halfWidth, maxZ: tentZ + halfWidth });

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

  // 背面(-X側)の妻側のすき間を三角の板で塞ぐ(入口の+X側は開けたままにする)
  {
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-halfWidth, 0);
    gableShape.lineTo(halfWidth, 0);
    gableShape.lineTo(0, rise);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
    const gable = new THREE.Mesh(gableGeo, tentMat);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(tentX - depth / 2 - 0.06, wallH, tentZ);
    gable.castShadow = true;
    gable.receiveShadow = true;
    scene.add(gable);
  }

  // テント内のランタン(奥=-X側寄り)
  const lanternLight = new THREE.PointLight(0xffcc77, 4, 7);
  lanternLight.position.set(tentX - 0.6, wallH + 0.4, tentZ);
  scene.add(lanternLight);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 1.5, roughness: 0.5 });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lanternMat);
  lantern.position.copy(lanternLight.position);
  scene.add(lantern);

  // テーブルと道具は、テントの内側(奥寄り=-X側)に設置
  const tableX = tentX - 0.8;
  const tableMat = new THREE.MeshStandardMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1), roughness: 0.7 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.6), tableMat);
  table.position.set(tableX, 0.375, tentZ);
  table.castShadow = true;
  table.receiveShadow = true;
  scene.add(table);
  wallBoxes.push({ minX: tableX - 0.6, maxX: tableX + 0.6, minZ: tentZ - 0.3, maxZ: tentZ + 0.3 });

  const flashlightMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.5 });
  const flashlightItem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 8), flashlightMat);
  flashlightItem.rotation.z = Math.PI / 2;
  flashlightItem.position.y = 0.75 + 0.04;
  addPickupItem(tableX, tentZ - 0.25, flashlightItem, () => {
    hasFlashlight = true;
    flashlight.intensity = 1.2;
    currentTool = 'flashlight';
    showPickupNotice('懐中電灯を入手した');
  });

  const emfMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
  const emfItem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), emfMat);
  emfItem.position.y = 0.75 + 0.1;
  addPickupItem(tableX, tentZ + 0.25, emfItem, () => {
    hasEMF = true;
    currentTool = 'emf';
    emfActive = true;
    showPickupNotice('EMFリーダーを入手した');
  });

  // 監視カメラの映像を映すモニター(テーブル脇、入口側を向く)
  const monitorFrameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.5), monitorFrameMat);
  monitorFrame.position.set(tableX, 0.75 + 0.25, tentZ + 0.75);
  monitorFrame.castShadow = true;
  scene.add(monitorFrame);
  const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), monitorMaterial);
  monitorScreen.rotation.y = Math.PI / 2;
  monitorScreen.position.set(tableX + 0.026, 0.75 + 0.25, tentZ + 0.75);
  scene.add(monitorScreen);
}

// 道具入手時の通知
const pickupNotice = document.createElement('div');
pickupNotice.style.cssText = 'position:fixed;top:56px;left:8px;color:#ff0;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(pickupNotice);
let pickupNoticeTimer = 0;
function showPickupNotice(text) {
  pickupNotice.textContent = text;
  pickupNoticeTimer = 2.5;
}

// ---- 家具の材質(木・陶器・布・金属) ----
const woodFurnitureMaterial = new THREE.MeshStandardMaterial({ map: scaled(makeWoodTexture('#6b4a30'), 2, 2), roughness: 0.7 });
const ceramicMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.25 });
const fabricMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4550, roughness: 0.95 });
const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.6 });
const mattressMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.85 });
const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.5 });
const countertopMaterial = new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.3 });

// 見た目だけの飾りパーツ(当たり判定には登録しない)
function addDetailMesh(x, y, z, w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ベッド = 木の土台 + マットレス
function bedIn(name, dx, dz, w, d) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  const frameH = 0.3, mattressH = 0.25;
  addFurniture(x, z, w, d, frameH);
  addDetailMesh(x, frameH + mattressH / 2, z, w * 0.92, mattressH, d * 0.92, mattressMaterial);
}

// ソファ = 座面 + 背もたれ
function sofaAt(x, z, w, d) {
  const seatH = 0.42, backH = 0.4, backT = 0.18;
  addFurniture(x, z, w, d, seatH, fabricMaterial);
  addDetailMesh(x, seatH + backH / 2, z + d / 2 - backT / 2, w, backH, backT, fabricMaterial);
}

// ワードローブ = 本体 + 中央の継ぎ目 + 取っ手2つ(部屋の内側=-X向きに面する想定)
function wardrobeIn(name, dx, dz, w, d, h) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  addFurniture(x, z, w, d, h, woodFurnitureMaterial);
  const faceX = x - w / 2 - 0.01;
  addDetailMesh(faceX, h * 0.5, z, 0.02, h * 0.9, 0.02, handleMaterial);
  addDetailMesh(faceX - 0.02, h * 0.5, z - d * 0.2, 0.03, 0.15, 0.04, handleMaterial);
  addDetailMesh(faceX - 0.02, h * 0.5, z + d * 0.2, 0.03, 0.15, 0.04, handleMaterial);
}

// キッチンカウンター = 木の台 + 天板(少しはみ出す)
function counterAt(x, z, w, d, h) {
  addFurniture(x, z, w, d, h, woodFurnitureMaterial);
  addDetailMesh(x, h + 0.03, z, w + 0.08, 0.06, d + 0.08, countertopMaterial);
}

// 冷蔵庫 = 本体 + 取っ手(部屋の内側=-Z向きに面する想定)
function fridgeAt(x, z, w, d, h) {
  addFurniture(x, z, w, d, h, metalMaterial);
  const faceZ = z - d / 2 - 0.01;
  addDetailMesh(x + w * 0.15, h * 0.55, faceZ, 0.06, h * 0.5, 0.03, handleMaterial);
}

function addFurniture(x, z, w, d, h, material = woodFurnitureMaterial) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  wallBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}
function furnitureIn(name, dx, dz, w, d, h, material) {
  const r = room(name);
  addFurniture(r.minX + dx, r.minZ + dz, w, d, h, material);
}
// 洗面台 = 台座 + 天板 + 蛇口
function washstandIn(name, dx, dz, w, d, h) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  addFurniture(x, z, w, d, h, ceramicMaterial);
  addDetailMesh(x, h + 0.02, z, w - 0.04, 0.04, d - 0.04, ceramicMaterial);
  addDetailMesh(x, h + 0.18, z - d / 2 + 0.06, 0.03, 0.22, 0.03, metalMaterial);
}

// トイレ = ボウル(当たり判定あり) + 背面のタンク(見た目のみ)
function toiletIn(name, dx, dz) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  const bowlW = 0.38, bowlD = 0.48, bowlH = 0.38;
  addFurniture(x, z, bowlW, bowlD, bowlH, ceramicMaterial);
  const tankH = 0.32;
  addDetailMesh(x, bowlH + tankH / 2, z - bowlD / 2 + 0.09, bowlW + 0.02, tankH, 0.16, ceramicMaterial);
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
furnitureIn("Pantry", 0.7, 0.3, 1.2, 0.4, 1.8);

{
  const ldk = room("Living Dining Kitchen");
  addFurniture((ldk.minX + ldk.maxX) / 2, ldk.minZ + 1.6, 1.8, 0.9, 0.75);
  sofaAt(ldk.minX + 4.2, ldk.minZ + 6.5, 1.8, 0.9);
  counterAt(ldk.minX + 5.0, ldk.maxZ - 0.6, 2.6, 0.7, 0.9);
  fridgeAt(ldk.minX + 2.7, ldk.maxZ - 0.6, 0.7, 0.7, 1.7);
}

// 幽霊(証拠システムの土台込み)
const ghostTypes = [
  { name: "Spirit", evidence: ["EMF5", "スピリットボックス", "ゴーストライティング"] },
  { name: "Wraith", evidence: ["EMF5", "スピリットボックス", "オーブ"] },
  { name: "Poltergeist", evidence: ["スピリットボックス", "ゴーストライティング", "オーブ"] },
];
const currentGhost = ghostTypes[Math.floor(Math.random() * ghostTypes.length)];
const hauntableRooms = rooms.filter(r => r.name !== "廊下" && r.name !== "Pantry");
const hauntedRoom = hauntableRooms[Math.floor(Math.random() * hauntableRooms.length)].bounds;
console.log("[デバッグ] 幽霊の種類:", currentGhost.name, "証拠:", currentGhost.evidence);

function randomPointInRoom(r, margin = 0.6) {
  return new THREE.Vector3(
    r.minX + margin + Math.random() * Math.max(0.1, r.maxX - r.minX - margin * 2),
    1.0,
    r.minZ + margin + Math.random() * Math.max(0.1, r.maxZ - r.minZ - margin * 2)
  );
}

const ghostMaterial = new THREE.MeshStandardMaterial({
  color: 0xaad4ff, transparent: true, opacity: 0.35,
  emissive: 0x335577, emissiveIntensity: 0.6
});
const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), ghostMaterial);
let ghostTarget = randomPointInRoom(hauntedRoom);
ghost.position.copy(ghostTarget);
scene.add(ghost);

// ゴーストオーブ(オーブを証拠に持つ幽霊のときだけ出現。肉眼では見えず、監視カメラの映像でのみ見える)
const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.85 });
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), orbMaterial);
orb.layers.set(1);
orb.visible = false;
scene.add(orb);

const orbRoom = room("Living Dining Kitchen");
let orbSpawnTimer = 6 + Math.random() * 12;
let orbVisibleTimer = 0;
function updateOrb(delta) {
  if (!currentGhost.evidence.includes("オーブ")) return;
  if (orb.visible) {
    orbVisibleTimer -= delta;
    orb.position.x += (Math.random() - 0.5) * 0.6 * delta;
    orb.position.z += (Math.random() - 0.5) * 0.6 * delta;
    orb.position.y += (Math.random() - 0.5) * 0.4 * delta;
    if (orbVisibleTimer <= 0) {
      orb.visible = false;
      orbSpawnTimer = 8 + Math.random() * 18;
    }
  } else {
    orbSpawnTimer -= delta;
    if (orbSpawnTimer <= 0) {
      orb.position.set(
        orbRoom.minX + 0.8 + Math.random() * (orbRoom.maxX - orbRoom.minX - 1.6),
        0.9 + Math.random() * 1.2,
        orbRoom.minZ + 0.8 + Math.random() * (orbRoom.maxZ - orbRoom.minZ - 1.6)
      );
      orb.visible = true;
      orbVisibleTimer = 2 + Math.random() * 3;
    }
  }
}

// 照明(部屋ごとに管理して、スイッチでON/OFFできるようにする)
scene.add(new THREE.AmbientLight(0x222233, 0.55));

// 天井の照明本体(光源+見た目のランプ部分)
function addRoomLight(name, intensity, color = 0xfff2cc, distance = 13) {
  const r = room(name);
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;

  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(cx, 2.85, cz);
  scene.add(light);

  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 1.2, roughness: 0.6
  });
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), fixtureMat);
  fixture.position.set(cx, 2.97, cz);
  scene.add(fixture);

  return { light, fixtureMat };
}
const roomLights = {
  "Living Dining Kitchen": addRoomLight("Living Dining Kitchen", 14),
  "Master Bed Room": addRoomLight("Master Bed Room", 10),
  "Bed Room(4.5畳)": addRoomLight("Bed Room(4.5畳)", 9),
  "Bed Room(5.0畳)": addRoomLight("Bed Room(5.0畳)", 9),
  "玄関": addRoomLight("玄関", 7),
  "浴室・洗面": addRoomLight("浴室・洗面", 8, 0xdcecff),
  "トイレ": addRoomLight("トイレ", 6, 0xdcecff),
  "納戸": addRoomLight("納戸", 6),
  "W.I.C": addRoomLight("W.I.C", 5),
  "廊下": addRoomLight("廊下", 6),
  // Pantryは壁で仕切られておらずLDKと同じ空間なので、専用の照明は持たない
};

// 各部屋の壁際にスイッチを設置(部屋の入口寄りの角、床上1.1m)。位置を指定すればそこに設置する
const lightSwitches = [];
function addLightSwitch(roomName, customX, customZ) {
  const r = room(roomName);
  const x = customX !== undefined ? customX : r.maxX - 0.15;
  const z = customZ !== undefined ? customZ : r.maxZ - 0.6;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0x554400, emissiveIntensity: 0.5, roughness: 0.4 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat);
  mesh.position.set(x, 1.1, z);
  mesh.castShadow = true;
  scene.add(mesh);
  const rl = roomLights[roomName];
  lightSwitches.push({ x, z, light: rl.light, fixtureMat: rl.fixtureMat, switchMat: mat, on: true });
}
rooms.forEach(r => {
  if (r.name === "Pantry") return; // 専用の照明がないので、スイッチも設置しない
  if (r.name === "Living Dining Kitchen") {
    addLightSwitch(r.name, 6.3, 9.5); // W.I.C側の扉付近(廊下・玄関に近い側)
  } else {
    addLightSwitch(r.name);
  }
});

// スイッチに近づいてクリックするとON/OFF切り替え(天井照明ごと)
function tryInteract() {
  for (const item of pickupItems) {
    if (item.collected) continue;
    const dx = camera.position.x - item.x, dz = camera.position.z - item.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
      item.collected = true;
      scene.remove(item.mesh);
      item.onCollect();
      return;
    }
  }

  let nearest = null, nearestDist = 1.4;
  for (const sw of lightSwitches) {
    const dx = camera.position.x - sw.x;
    const dz = camera.position.z - sw.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearestDist) { nearest = sw; nearestDist = d; }
  }
  if (nearest) {
    nearest.on = !nearest.on;
    nearest.light.visible = nearest.on;
    nearest.fixtureMat.emissiveIntensity = nearest.on ? 1.2 : 0;
    nearest.switchMat.color.set(nearest.on ? 0xffffcc : 0x555555);
    nearest.switchMat.emissiveIntensity = nearest.on ? 0.5 : 0;
  }
}
document.addEventListener('click', () => {
  if (!controls.isLocked) return;
  tryInteract();
});

const flashlight = new THREE.PointLight(0xffeecc, 0, 8); // 懐中電灯を拾うまで光量0
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(512, 512);
flashlight.shadow.camera.near = 0.1;
flashlight.shadow.camera.far = 8;
camera.add(flashlight);
scene.add(camera);

const controls = new PointerLockControls(camera, document.body);
const info = document.getElementById('info');
info.addEventListener('click', () => controls.lock());
controls.addEventListener('unlock', () => { info.textContent = 'クリックで開始'; });

const emfDisplay = document.createElement('div');
emfDisplay.style.cssText = 'position:fixed;top:32px;left:8px;color:#0f0;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(emfDisplay);

let emfActive = false;
let currentTool = null; // 'flashlight' か 'emf'。持ち替えで切り替える
function toggleEMF() {
  if (!hasEMF) return;
  emfActive = !emfActive;
  if (!emfActive) emfDisplay.textContent = '';
}
function switchTool() {
  if (hasFlashlight && hasEMF) {
    currentTool = currentTool === 'emf' ? 'flashlight' : 'emf';
  } else if (hasEMF) {
    currentTool = 'emf';
  } else if (hasFlashlight) {
    currentTool = 'flashlight';
  } else {
    return;
  }
  // フラッシュライトは持ち替えても常時点灯のまま。EMFだけ、持っている間だけオンになる
  emfActive = (currentTool === 'emf');
  if (!emfActive) emfDisplay.textContent = '';
}
function toggleCurrentTool() {
  if (currentTool === 'emf') {
    toggleEMF();
  } else if (currentTool === 'flashlight') {
    flashlight.intensity = flashlight.intensity > 0 ? 0 : 1.2;
  }
}
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') toggleEMF();
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// ゲームパッド対応(接続されていれば移動・視点・ボタンに使う)
const gpPrevButtons = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) if (pad) return pad;
  return null;
}
function deadzone(v, dz = 0.15) {
  return Math.abs(v) < dz ? 0 : v;
}

function emfLevelAt(distance, hasEMF5) {
  let level = distance < 1 ? 5 : distance < 2 ? 4 : distance < 3.5 ? 3 : distance < 5 ? 2 : distance < 8 ? 1 : 0;
  if (level === 5 && !hasEMF5) level = 4;
  return level;
}

// 右上のミニマップ
const mapCanvas = document.createElement('canvas');
mapCanvas.width = 180;
mapCanvas.height = 230;
mapCanvas.style.cssText = 'position:fixed;top:8px;right:8px;background:rgba(0,0,0,0.6);border:1px solid #0f0;z-index:10;';
document.body.appendChild(mapCanvas);
const mapCtx = mapCanvas.getContext('2d');

function drawMap() {
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  const pad = 6;
  const scale = Math.min(
    (mapCanvas.width - pad * 2) / (houseMaxX - houseMinX),
    (mapCanvas.height - pad * 2) / (houseMaxZ - houseMinZ)
  );
  const toMapX = x => pad + (x - houseMinX) * scale;
  const toMapY = z => pad + (houseMaxZ - z) * scale;

  mapCtx.strokeStyle = '#0f0';
  mapCtx.lineWidth = 1;
  rooms.forEach(r => {
    const x0 = toMapX(r.bounds.minX);
    const y0 = toMapY(r.bounds.maxZ);
    const w = (r.bounds.maxX - r.bounds.minX) * scale;
    const h = (r.bounds.maxZ - r.bounds.minZ) * scale;
    mapCtx.strokeRect(x0, y0, w, h);
  });

  const px = Math.max(pad, Math.min(mapCanvas.width - pad, toMapX(camera.position.x)));
  const py = Math.max(pad, Math.min(mapCanvas.height - pad, toMapY(camera.position.z)));
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  mapCtx.strokeStyle = '#0f0';
  mapCtx.beginPath();
  mapCtx.moveTo(px, py);
  mapCtx.lineTo(px + dir.x * 10, py - dir.z * 10);
  mapCtx.stroke();
  mapCtx.fillStyle = '#0f0';
  mapCtx.beginPath();
  mapCtx.arc(px, py, 4, 0, Math.PI * 2);
  mapCtx.fill();
}
let mapUpdateTimer = 0;
let monitorTimer = 0;

const speed = 4;
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (controls.isLocked) {
    const move = speed * delta;
    const prevX = camera.position.x;
    const prevZ = camera.position.z;
    if (keys['KeyW']) controls.moveForward(move);
    if (keys['KeyS']) controls.moveForward(-move);
    if (keys['KeyA']) controls.moveRight(-move);
    if (keys['KeyD']) controls.moveRight(move);

    const pad = pollGamepad();
    if (pad) {
      const lx = deadzone(pad.axes[0] || 0);
      const ly = deadzone(pad.axes[1] || 0);
      const rx = deadzone(pad.axes[2] || 0);
      const ry = deadzone(pad.axes[3] || 0);
      if (ly !== 0) controls.moveForward(-ly * move);
      if (lx !== 0) controls.moveRight(lx * move);
      camera.rotation.y -= rx * 2.0 * delta;
      camera.rotation.x = Math.max(-1.3, Math.min(1.3, camera.rotation.x - ry * 1.5 * delta));

      const aPressed = !!(pad.buttons[0] && pad.buttons[0].pressed);
      if (aPressed && !gpPrevButtons[0]) tryInteract();
      gpPrevButtons[0] = aPressed;

      const xPressed = !!(pad.buttons[2] && pad.buttons[2].pressed);
      if (xPressed && !gpPrevButtons[2]) toggleEMF();
      gpPrevButtons[2] = xPressed;

      const lPressed = !!(pad.buttons[4] && pad.buttons[4].pressed);
      if (lPressed && !gpPrevButtons[4]) switchTool();
      gpPrevButtons[4] = lPressed;

      const rPressed = !!(pad.buttons[5] && pad.buttons[5].pressed);
      if (rPressed && !gpPrevButtons[5]) switchTool();
      gpPrevButtons[5] = rPressed;

      const zrPressed = !!(pad.buttons[7] && pad.buttons[7].pressed);
      if (zrPressed && !gpPrevButtons[7]) toggleCurrentTool();
      gpPrevButtons[7] = zrPressed;
    }

    if (collidesWithWalls(camera.position.x, camera.position.z)) {
      camera.position.x = prevX;
      camera.position.z = prevZ;
    }
    const currentRoomName = getRoomAt(camera.position.x, camera.position.z);
    info.textContent = `現在の部屋: ${currentRoomName}`;
    mapCanvas.style.display = currentRoomName === "外" ? 'none' : 'block';

    mapUpdateTimer += delta;
    if (mapUpdateTimer > 0.1) {
      mapUpdateTimer = 0;
      if (currentRoomName !== "外") drawMap();
    }

    // 幽霊の移動(自分の部屋の中だけ徘徊。家具や壁はすり抜ける)
    const toTarget = new THREE.Vector3().subVectors(ghostTarget, ghost.position);
    toTarget.y = 0;
    if (toTarget.length() < 0.2) {
      ghostTarget = randomPointInRoom(hauntedRoom);
    } else {
      toTarget.normalize();
      ghost.position.x += toTarget.x * 1.0 * delta;
      ghost.position.z += toTarget.z * 1.0 * delta;
    }
    ghost.position.y = 1.0 + Math.sin(clock.elapsedTime * 2) * 0.1;
    ghost.rotation.y += delta * 0.5;

    // 懐中電灯を向けると少しはっきり見える
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const toGhost = new THREE.Vector3().subVectors(ghost.position, camera.position);
    const ghostDist = toGhost.length();
    toGhost.normalize();
    const lookingAtGhost = camDir.angleTo(toGhost) < 0.3 && ghostDist < 6;
    ghostMaterial.opacity = lookingAtGhost ? 0.75 : 0.35;

    if (pickupNoticeTimer > 0) {
      pickupNoticeTimer -= delta;
      if (pickupNoticeTimer <= 0) pickupNotice.textContent = '';
    }

    // EMFリーダー(Eキーでオン/オフ、入手済みの場合のみ)
    if (emfActive) {
      const level = emfLevelAt(ghostDist, currentGhost.evidence.includes("EMF5"));
      emfDisplay.textContent = `EMF: ${'★'.repeat(level)}${'・'.repeat(5 - level)} (Lv.${level})`;
    }

    updateOrb(delta);
  }

  // 監視カメラの映像をモニターへ(負荷を抑えるため、間隔を空けて低フレームレートで更新)
  monitorTimer += delta;
  if (monitorTimer > 0.35) {
    monitorTimer = 0;
    renderer.setRenderTarget(monitorRT);
    renderer.render(scene, videoCam);
    renderer.setRenderTarget(null);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
