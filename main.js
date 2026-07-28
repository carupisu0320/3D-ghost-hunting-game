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
    if (keys['KeyW']) controls.moveForward(move);
    if (keys['KeyS']) controls.moveForward(-move);
    if (keys['KeyA']) controls.moveRight(-move);
    if (keys['KeyD']) controls.moveRight(move);
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
EOF
