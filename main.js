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
const doorMaterial = new THREE.MeshStandardMaterial({ map: scaled(makeWoodTexture('#6b4022'), 1, 1), roughness: 0.55 });

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
  if (axis === 'x') mesh.position.set(doorAt, doorHeight / 2, fixedPos);
  else mesh.position.set(fixedPos, doorHeight / 2, doorAt);
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

bedIn("Master Bed Room", 1.1, 1.2, 1.8, 2.0);
wardrobeIn("Master Bed Room", 3.8, 3.4, 1.0, 0.6, 1.8);
bedIn("Bed Room(4.5畳)", 3.8, 1.2, 1.0, 2.0);
furnitureIn("Bed Room(4.5畳)", 0.8, 4.0, 0.9, 0.5, 0.75);
bedIn("Bed Room(5.0畳)", 3.8, 1.2, 1.0, 2.0);
furnitureIn("Bed Room(5.0畳)", 0.8, 4.0, 0.9, 0.5, 0.75);

furnitureIn("玄関", 0.7, 0.8, 1.2, 0.4, 0.7);
furnitureIn("浴室・洗面", 0.7, 0.3, 0.9, 0.5, 0.85, ceramicMaterial);
furnitureIn("浴室・洗面", 2.2, 0.8, 1.4, 1.4, 0.6, ceramicMaterial);
furnitureIn("トイレ", 0.6, 0.5, 0.5, 0.7, 0.4, ceramicMaterial);
furnitureIn("納戸", 0.8, 0.5, 1.2, 0.4, 1.8);
furnitureIn("W.I.C", 0.6, 0.5, 0.8, 0.4, 1.8);
furnitureIn("Pantry", 0.8, 0.5, 1.2, 0.4, 1.8);

{
  const ldk = room("Living Dining Kitchen");
  addFurniture((ldk.minX + ldk.maxX) / 2, ldk.minZ + 1.6, 1.8, 0.9, 0.75);
  sofaAt(ldk.minX + 4.2, ldk.minZ + 6.5, 1.8, 0.9);
  counterAt(ldk.minX + 5.0, ldk.maxZ - 0.6, 2.6, 0.7, 0.9);
  fridgeAt(ldk.minX + 6.8, ldk.maxZ - 0.6, 0.7, 0.7, 1.7);
}

// 照明
scene.add(new THREE.AmbientLight(0x222233, 0.55));
function addRoomLight(name, intensity, color = 0x554433) {
  const r = room(name);
  const light = new THREE.PointLight(color, intensity, 7);
  light.position.set((r.minX + r.maxX) / 2, 2.5, (r.minZ + r.maxZ) / 2);
  scene.add(light);
}
addRoomLight("Living Dining Kitchen", 0.6);
addRoomLight("Master Bed Room", 0.4);
addRoomLight("Bed Room(4.5畳)", 0.4);
addRoomLight("Bed Room(5.0畳)", 0.4);
addRoomLight("玄関", 0.4);

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

const keys = {};
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);

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
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
