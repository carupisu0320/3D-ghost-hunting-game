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
document.body.appendChild(renderer.domElement);

// 床
const floorColors = [0x666666, 0x337777, 0x555577, 0x775555, 0x333355, 0x553355, 0x444444, 0x557733, 0x777733, 0x773333, 0x557755];
rooms.forEach((r, i) => {
  const w = r.bounds.maxX - r.bounds.minX;
  const d = r.bounds.maxZ - r.bounds.minZ;
  const cx = (r.bounds.maxX + r.bounds.minX) / 2;
  const cz = (r.bounds.maxZ + r.bounds.minZ) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: floorColors[i] })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
});

// 壁・ドア
const wallBoxes = [];
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const doorHeight = 2.1;
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x707070 });
const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });

function addWallSegment(minX, maxX, minZ, maxZ) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX, wallHeight, maxZ - minZ),
    wallMaterial
  );
  mesh.position.set((minX + maxX) / 2, wallHeight / 2, (minZ + maxZ) / 2);
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

{
  const g = room("玄関"), b = room("浴室・洗面"), t = room("トイレ"), m = room("Master Bed Room");
  const s = room("納戸"), w = room("W.I.C"), h = room("廊下");
  const b45 = room("Bed Room(4.5畳)"), b50 = room("Bed Room(5.0畳)"), ldk = room("Living Dining Kitchen");
  const houseMinX = ldk.minX, houseMaxX = m.maxX, houseMinZ = ldk.minZ, houseMaxZ = g.maxZ;

  // 外周
  addWall('z', houseMinX, houseMinZ, houseMaxZ);
  addWall('z', houseMaxX, houseMinZ, houseMaxZ);
  addWall('x', houseMaxZ, houseMinX, houseMaxX);
  addWall('x', houseMinZ, houseMinX, houseMaxX);

  // ドアのある間仕切り
  addWall('z', g.maxX, g.minZ, g.maxZ, (g.minZ + g.maxZ) / 2);           // 玄関|浴室洗面
  addWall('z', b.maxX, b.minZ, b.maxZ, (b.minZ + b.maxZ) / 2);           // 浴室洗面|トイレ
  addWall('z', t.maxX, t.minZ, t.maxZ, (t.minZ + t.maxZ) / 2);           // トイレ|MasterBR
  addWall('x', g.minZ, g.minX, g.maxX, (g.minX + g.maxX) / 2);           // 玄関|廊下
  addWall('z', h.maxX, h.minZ, h.maxZ, (h.minZ + h.maxZ) / 2);           // 廊下|納戸
  addWall('x', h.minZ, h.minX, h.maxX, (h.minX + h.maxX) / 2);           // 廊下|Pantry
  addWall('x', w.minZ, w.minX, w.maxX, (w.minX + w.maxX) / 2);           // W.I.C|LDK
  addWall('z', b45.minX, b45.minZ, b45.maxZ, (b45.minZ + b45.maxZ) / 2); // BedRoom4.5|LDK
  addWall('z', b50.minX, b50.minZ, b50.maxZ, (b50.minZ + b50.maxZ) / 2); // BedRoom5.0|LDK

  // ドアなしの間仕切り
  addWall('x', b.minZ, b.minX, b.maxX);       // 浴室洗面|納戸
  addWall('x', t.minZ, t.minX, t.maxX);       // トイレ|W.I.C
  addWall('z', m.minX, w.minZ, w.maxZ);       // MasterBR|W.I.C
  addWall('x', b45.maxZ, m.minX, m.maxX);     // MasterBR|BedRoom4.5
  addWall('z', s.maxX, s.minZ, s.maxZ);       // 納戸|W.I.C
  addWall('x', s.minZ, s.minX, s.maxX);       // 納戸|LDK
  addWall('x', b50.maxZ, b45.minX, b45.maxX); // BedRoom4.5|BedRoom5.0
}

// 家具
const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4636 });
function addFurniture(x, z, w, d, h) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), furnitureMaterial);
  mesh.position.set(x, h / 2, z);
  scene.add(mesh);
  wallBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
}
function furnitureIn(name, dx, dz, w, d, h) {
  const r = room(name);
  addFurniture(r.minX + dx, r.minZ + dz, w, d, h);
}

furnitureIn("Master Bed Room", 1.1, 1.2, 1.8, 2.0, 0.6);   // ダブルベッド
furnitureIn("Master Bed Room", 2.4, 3.4, 1.0, 0.6, 1.8);   // ワードローブ
furnitureIn("Bed Room(4.5畳)", 0.9, 1.2, 1.0, 2.0, 0.6);    // シングルベッド
furnitureIn("Bed Room(4.5畳)", 1.7, 3.2, 0.9, 0.5, 0.75);   // 机
furnitureIn("Bed Room(5.0畳)", 0.9, 1.2, 1.0, 2.0, 0.6);    // シングルベッド
furnitureIn("Bed Room(5.0畳)", 1.7, 3.2, 0.9, 0.5, 0.75);   // 机
furnitureIn("玄関", 0.4, 0.4, 1.2, 0.4, 0.7);               // 下駄箱
furnitureIn("浴室・洗面", 0.6, 0.4, 0.9, 0.5, 0.85);         // 洗面台
furnitureIn("浴室・洗面", 1.3, 1.8, 1.4, 1.4, 0.6);          // 浴槽
furnitureIn("トイレ", 0.5, 0.4, 0.5, 0.7, 0.4);              // 便器
furnitureIn("納戸", 0.3, 0.3, 1.2, 0.4, 1.8);                // 棚
furnitureIn("W.I.C", 0.3, 0.3, 0.8, 0.4, 1.8);              // 棚
furnitureIn("Pantry", 0.3, 0.3, 1.2, 0.4, 1.8);             // 棚
{
  const ldk = room("Living Dining Kitchen");
  addFurniture((ldk.minX + ldk.maxX) / 2, ldk.minZ + 1.6, 1.8, 0.9, 0.75); // ダイニングテーブル
  addFurniture(ldk.maxX - 1.4, ldk.maxZ - 1.1, 1.8, 0.9, 0.8);            // ソファ
  addFurniture(ldk.minX + 0.6, ldk.maxZ - 0.5, 2.6, 0.7, 0.9);            // キッチンカウンター
  addFurniture(ldk.minX + 0.6, ldk.maxZ - 1.6, 0.7, 0.7, 1.7);            // 冷蔵庫
}

// 照明
scene.add(new THREE.AmbientLight(0x222233, 1.5));
function addRoomLight(name, intensity, color = 0x554433) {
  const r = room(name);
  const light = new THREE.PointLight(color, intensity, 7);
  light.position.set((r.minX + r.maxX) / 2, 2.5, (r.minZ + r.maxZ) / 2);
  scene.add(light);
}
addRoomLight("Living Dining Kitchen", 0.5);
addRoomLight("Master Bed Room", 0.3);
addRoomLight("Bed Room(4.5畳)", 0.3);
addRoomLight("Bed Room(5.0畳)", 0.3);
addRoomLight("玄関", 0.3);

const flashlight = new THREE.PointLight(0xffeecc, 1.2, 8);
camera.add(flashlight);
scene.add(camera);

// 一人称視点操作
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
