import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

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
  )?.name ?? "不明";
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 6, 24);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4, 1.6, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

// 壁・ドア
const wallBoxes = [];
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const doorHeight = 2.1;
const wallMaterial = new THREE.MeshStandardMaterial({ map: scaled(wallBase, 4, 2), roughness: 0.9 });
const doorMaterial = new THREE.MeshStandardMaterial({ map: scaled(makeDoorTexture(), 1, 1), roughness: 0.5 });
const doorFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.7 });
const doorHandleMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.35, metalness: 0.6 });

function addWallSegment(minX, maxX, minZ, maxZ) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX, wallHeight, maxZ - minZ),
    wallMaterial
  );
  mesh.position.set((minX + maxX) / 2, wallHeight / 2, (minZ + maxZ) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  wallBoxes.push({ minX, maxX, minZ, maxZ });
}

function addDoor(axis, fixedPos, doorAt) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      axis === 'x' ? doorWidth : wallThickness,
      doorHeight,
      axis === 'x' ? wallThickness : doorWidth
    ),
    doorMaterial
  );
  const trimW = 0.06;
  const trimDepth = wallThickness + 0.04;
  const sideLen = doorHeight + trimW;

  if (axis === 'x') {
    mesh.position.set(doorAt, doorHeight / 2, fixedPos);

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(x => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(trimW, sideLen, trimDepth), doorFrameMaterial);
      side.position.set(x, sideLen / 2, fixedPos);
      side.castShadow = true; side.receiveShadow = true;
      scene.add(side);
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + trimW * 2, trimW, trimDepth), doorFrameMaterial);
    top.position.set(doorAt, doorHeight + trimW / 2, fixedPos);
    top.castShadow = true; top.receiveShadow = true;
    scene.add(top);

    const header = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, wallHeight - doorHeight, wallThickness), wallMaterial);
    header.position.set(doorAt, doorHeight + (wallHeight - doorHeight) / 2, fixedPos);
    header.castShadow = true; header.receiveShadow = true;
    scene.add(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(zOff => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.05), doorHandleMaterial);
      handle.position.set(doorAt + doorWidth * 0.36, doorHeight * 0.45, fixedPos + zOff);
      handle.castShadow = true;
      scene.add(handle);
    });
  } else {
    mesh.position.set(fixedPos, doorHeight / 2, doorAt);

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(z => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(trimDepth, sideLen, trimW), doorFrameMaterial);
      side.position.set(fixedPos, sideLen / 2, z);
      side.castShadow = true; side.receiveShadow = true;
      scene.add(side);
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(trimDepth, trimW, doorWidth + trimW * 2), doorFrameMaterial);
    top.position.set(fixedPos, doorHeight + trimW / 2, doorAt);
    top.castShadow = true; top.receiveShadow = true;
    scene.add(top);

    const header = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight - doorHeight, doorWidth), wallMaterial);
    header.position.set(fixedPos, doorHeight + (wallHeight - doorHeight) / 2, doorAt);
    header.castShadow = true; header.receiveShadow = true;
    scene.add(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(xOff => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.035), doorHandleMaterial);
      handle.position.set(fixedPos + xOff, doorHeight * 0.45, doorAt + doorWidth * 0.36);
      handle.castShadow = true;
      scene.add(handle);
    });
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
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
  addWall('x', houseMaxZ, houseMinX, houseMaxX);
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
furnitureIn("浴室・洗面", 0.6, 0.3, 0.9, 0.5, 0.85, ceramicMaterial);
furnitureIn("浴室・洗面", 1.9, 0.8, 1.4, 1.4, 0.6, ceramicMaterial);
toiletIn("トイレ", 1.0, 0.35);
furnitureIn("納戸", 0.8, 0.5, 1.2, 0.4, 1.8);
furnitureIn("W.I.C", 0.6, 2.3, 0.8, 0.4, 1.8);
furnitureIn("Pantry", 0.8, 0.5, 1.2, 0.4, 1.8);

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
  { name: "Wraith", evidence: ["EMF5", "スピリットボックス", "UV痕跡"] },
  { name: "Poltergeist", evidence: ["スピリットボックス", "ゴーストライティング", "UV痕跡"] },
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
  "Pantry": addRoomLight("Pantry", 5),
};

// 各部屋の壁際にスイッチを設置(部屋の入口寄りの角、床上1.1m)
const lightSwitches = [];
function addLightSwitch(roomName) {
  const r = room(roomName);
  const x = r.minX + 0.15;
  const z = r.minZ + 0.6;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0x554400, emissiveIntensity: 0.5, roughness: 0.4 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat);
  mesh.position.set(x, 1.1, z);
  mesh.castShadow = true;
  scene.add(mesh);
  const rl = roomLights[roomName];
  lightSwitches.push({ x, z, light: rl.light, fixtureMat: rl.fixtureMat, switchMat: mat, on: true });
}
rooms.forEach(r => addLightSwitch(r.name));

// スイッチに近づいてクリックするとON/OFF切り替え(天井照明ごと)
document.addEventListener('click', () => {
  if (!controls.isLocked) return;
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
});

const flashlight = new THREE.PointLight(0xffeecc, 1.2, 8);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.1;
flashlight.shadow.camera.far = 10;
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
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') {
    emfActive = !emfActive;
    if (!emfActive) emfDisplay.textContent = '';
  }
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

function emfLevelAt(distance, hasEMF5) {
  let level = distance < 1 ? 5 : distance < 2 ? 4 : distance < 3.5 ? 3 : distance < 5 ? 2 : distance < 8 ? 1 : 0;
  if (level === 5 && !hasEMF5) level = 4;
  return level;
}

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
    if (collidesWithWalls(camera.position.x, camera.position.z)) {
      camera.position.x = prevX;
      camera.position.z = prevZ;
    }
    info.textContent = `現在の部屋: ${getRoomAt(camera.position.x, camera.position.z)}`;

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

    // EMFリーダー(Eキーでオン/オフ)
    if (emfActive) {
      const level = emfLevelAt(ghostDist, currentGhost.evidence.includes("EMF5"));
      emfDisplay.textContent = `EMF: ${'★'.repeat(level)}${'・'.repeat(5 - level)} (Lv.${level})`;
    }
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
