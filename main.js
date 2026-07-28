import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const rooms = [
  { name: "寝室1",   bounds: { minX: -6, maxX: -2, minZ: 4, maxZ: 8 } },
  { name: "浴室",     bounds: { minX: -2, maxX:  2, minZ: 4, maxZ: 8 } },
  { name: "寝室2",   bounds: { minX:  2, maxX:  6, minZ: 4, maxZ: 8 } },
  { name: "廊下",     bounds: { minX: -6, maxX:  6, minZ: 2, maxZ: 4 } },
  { name: "リビング", bounds: { minX: -6, maxX:  0, minZ: -4, maxZ: 2 } },
  { name: "キッチン", bounds: { minX:  0, maxX:  6, minZ: -4, maxZ: 2 } },
];

function getRoomAt(x, z) {
  return rooms.find(r =>
    x >= r.bounds.minX && x <= r.bounds.maxX &&
    z >= r.bounds.minZ && z <= r.bounds.maxZ
  )?.name ?? "不明";
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 5, 20);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const floorColors = [0x555577, 0x557755, 0x775555, 0x666666, 0x777733, 0x337777];
rooms.forEach((room, i) => {
  const w = room.bounds.maxX - room.bounds.minX;
  const d = room.bounds.maxZ - room.bounds.minZ;
  const cx = (room.bounds.maxX + room.bounds.minX) / 2;
  const cz = (room.bounds.maxZ + room.bounds.minZ) / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: floorColors[i] })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
});
// 壁とドア
const wallBoxes = [];
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x707070 });
function addWallSegment(minX, maxX, minZ, maxZ) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(maxX - minX, wallHeight, maxZ - minZ),
    wallMaterial
  );
  mesh.position.set((minX + maxX) / 2, wallHeight / 2, (minZ + maxZ) / 2);
  scene.add(mesh);
  wallBoxes.push({ minX, maxX, minZ, maxZ });
}

// axis:'x' はX方向に伸びる壁(Zが固定)、axis:'z' はZ方向に伸びる壁(Xが固定)
// doorAtを指定すると、その位置にドア幅ぶんの隙間を空ける
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
const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
const doorHeight = 2.1;

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
addWall('x', 8,  -6, 6);        // 外周: 上
addWall('x', -4, -6, 6);        // 外周: 下
addWall('z', -6, -4, 8);        // 外周: 左
addWall('z', 6,  -4, 8);        // 外周: 右
addWall('z', -2, 4, 8);         // 寝室1と浴室の間(ドアなし)
addWall('z', 2,  4, 8);         // 浴室と寝室2の間(ドアなし)
addWall('x', 4, -6, -2, -4);    // 寝室1 → 廊下 のドア
addWall('x', 4, -2, 2,  0);     // 浴室 → 廊下 のドア
addWall('x', 4, 2,  6,  4);     // 寝室2 → 廊下 のドア
addWall('x', 2, -6, 6,  0);     // 廊下 → リビング/キッチン のドア
// リビングとキッチンの間(X=0)はオープンのまま、壁を作らない

function collidesWithWalls(x, z, radius = 0.3) {
  return wallBoxes.some(b =>
    x + radius > b.minX && x - radius < b.maxX &&
    z + radius > b.minZ && z - radius < b.maxZ
  );
}
scene.add(new THREE.AmbientLight(0x222233, 1.5));
const flashlight = new THREE.PointLight(0xffeecc, 1.2, 8);
camera.add(flashlight);
scene.add(camera);

const controls = new PointerLockControls(camera, document.body);
const info = document.getElementById('info');
info.addEventListener('click', () => controls.lock());
controls.addEventListener('unlock', () => { info.textContent = 'クリックで開始'; });

const keys = {};
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);

const speed = 3;
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
