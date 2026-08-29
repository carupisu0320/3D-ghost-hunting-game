import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 部屋一覧。中身は空のまま持っておき、マップ側(house-map.js)がpush()で登録する
const rooms = [];

function room(name) {
  return rooms.find(r => r.name === name).bounds;
}

function getRoomAt(x, z) {
  if (currentUpperFloor > 0) {
    return rooms.find(r =>
      r.upperFloor === currentUpperFloor &&
      x >= r.bounds.minX && x <= r.bounds.maxX &&
      z >= r.bounds.minZ && z <= r.bounds.maxZ
    )?.name ?? "外";
  }
  if (!onGroundFloor) return "地下室";
  return rooms.find(r =>
    !r.upperFloor &&
    x >= r.bounds.minX && x <= r.bounds.maxX &&
    z >= r.bounds.minZ && z <= r.bounds.maxZ
  )?.name ?? "外";
}


let onGroundFloor = true; // 階段を上り下りして今いる階(1階/地下)を判定するためのフラグ。既存マップ(一軒家)はこれだけで完結する

// 2階・屋根裏など、地下とは別に「地上より上の階」を持ちたいマップ向けの仕組み。
// 一軒家のような1階+地下だけのマップには一切影響しない(currentUpperFloorが0のときは今まで通りの分岐を通る)
const upperFloorHeights = {}; // 階のインデックス(1,2,...) -> その階の基準Y
const upperFloorWallBoxes = {}; // 階のインデックス -> 当たり判定の矩形一覧
let buildingUpperFloor = 0; // 今どの階のジオメトリを組み立てているか(addWall/addFurnitureが自動でYをずらすのに使う)
let currentUpperFloor = 0; // プレイヤーが今いる階(0=1階/地下の従来ロジックを使う、1以上=その階)
function defineUpperFloor(index, y) {
  upperFloorHeights[index] = y;
  upperFloorWallBoxes[index] = [];
}
function setBuildingUpperFloor(i) { buildingUpperFloor = i; }
function setCurrentUpperFloor(i) { currentUpperFloor = i; }

// 床・天井に矩形の穴を開けて、その周囲を4枚の板で埋める(階段の吹き抜け用)
function addFramedPlane(outer, hole, y, material, facingUp) {
  const pieces = [];
  if (outer.maxZ > hole.maxZ) pieces.push({ minX: outer.minX, maxX: outer.maxX, minZ: hole.maxZ, maxZ: outer.maxZ });
  if (hole.minZ > outer.minZ) pieces.push({ minX: outer.minX, maxX: outer.maxX, minZ: outer.minZ, maxZ: hole.minZ });
  if (hole.minX > outer.minX) pieces.push({ minX: outer.minX, maxX: hole.minX, minZ: hole.minZ, maxZ: hole.maxZ });
  if (outer.maxX > hole.maxX) pieces.push({ minX: hole.maxX, maxX: outer.maxX, minZ: hole.minZ, maxZ: hole.maxZ });
  pieces.forEach(p => {
    const w = p.maxX - p.minX, d = p.maxZ - p.minZ;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = facingUp ? -Math.PI / 2 : Math.PI / 2;
    mesh.position.set((p.minX + p.maxX) / 2, y, (p.minZ + p.maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03030a);
scene.fog = new THREE.Fog(0x03030a, 6, 24);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // 一番軽い影の種類に変更
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

function makeConcreteTexture(baseColor = '#9a9c9a') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  // 打ちっ放しコンクリートのパネル目地(大きめのグリッド)
  const cols = 2, rows = 3;
  const cw = 256 / cols, ch = 256 / rows;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, 256); ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(256, j * ch); ctx.stroke();
  }
  // セパレーター(型枠の丸い跡)をパネルの四隅寄りに配置
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]].forEach(([fx, fy]) => {
        const cx = i * cw + cw * fx, cy = j * ch + ch * fy;
        ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
  // 色ムラ・シミ
  for (let i = 0; i < 2000; i++) {
    const v = Math.random() * 22 - 11;
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

// 壁・ドア(描画は最後にまとめて1メッシュずつに結合する。当たり判定は今まで通りwallBoxesで個別管理)
const wallBoxes = [];
const basementWallBoxes = []; // 地下室の壁(1階にいる間は無視する)
const wallGeometries = [];
const doorFrameGeometries = [];
const doors = []; // { hinge, isOpen, targetRotation, box, center } 開閉・当たり判定用に個別管理する
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const doorHeight = 2.1;
const wallMaterial = new THREE.MeshLambertMaterial({ map: scaled(wallBase, 4, 2) });
const doorMaterial = new THREE.MeshLambertMaterial({ map: scaled(makeDoorTexture(), 1, 1) });
const doorFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2b1a });
const doorHandleMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

function addWallSegment(minX, maxX, minZ, maxZ) {
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const geo = new THREE.BoxGeometry(maxX - minX, wallHeight, maxZ - minZ);
  geo.translate((minX + maxX) / 2, y + wallHeight / 2, (minZ + maxZ) / 2);
  wallGeometries.push(geo);
  if (buildingUpperFloor > 0) {
    upperFloorWallBoxes[buildingUpperFloor].push({ minX, maxX, minZ, maxZ });
  } else {
    wallBoxes.push({ minX, maxX, minZ, maxZ });
  }
}

// 開け閉めできる扉(蝶番=doorAt-doorWidth/2の側。ちょうつがいのGroupごと回して開閉する)
function addDoor(axis, fixedPos, doorAt) {
  const trimW = 0.06;
  const trimDepth = wallThickness + 0.04;
  const sideLen = doorHeight + trimW;
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;

  if (axis === 'x') {
    const hinge = new THREE.Group();
    hinge.position.set(doorAt - doorWidth / 2, y, fixedPos);
    const panelGeo = new THREE.BoxGeometry(doorWidth, doorHeight, wallThickness);
    panelGeo.translate(doorWidth / 2, doorHeight / 2, 0);
    const panel = new THREE.Mesh(panelGeo, doorMaterial);
    panel.castShadow = true; panel.receiveShadow = true;
    hinge.add(panel);
    scene.add(hinge);
    doors.push({
      hinge, isOpen: false, targetRotation: 0, locked: false, upperFloor: buildingUpperFloor,
      box: { minX: doorAt - doorWidth / 2, maxX: doorAt + doorWidth / 2, minZ: fixedPos - wallThickness / 2, maxZ: fixedPos + wallThickness / 2 },
      center: { x: doorAt, z: fixedPos },
    });

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(x => {
      const side = new THREE.BoxGeometry(trimW, sideLen, trimDepth);
      side.translate(x, y + sideLen / 2, fixedPos);
      doorFrameGeometries.push(side);
    });
    const top = new THREE.BoxGeometry(doorWidth + trimW * 2, trimW, trimDepth);
    top.translate(doorAt, y + doorHeight + trimW / 2, fixedPos);
    doorFrameGeometries.push(top);

    const header = new THREE.BoxGeometry(doorWidth, wallHeight - doorHeight, wallThickness);
    header.translate(doorAt, y + doorHeight + (wallHeight - doorHeight) / 2, fixedPos);
    wallGeometries.push(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(zOff => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.05), doorHandleMaterial);
      handle.position.set(doorWidth * 0.86, doorHeight * 0.45, zOff);
      hinge.add(handle);
    });
  } else {
    const hinge = new THREE.Group();
    hinge.position.set(fixedPos, y, doorAt - doorWidth / 2);
    const panelGeo = new THREE.BoxGeometry(wallThickness, doorHeight, doorWidth);
    panelGeo.translate(0, doorHeight / 2, doorWidth / 2);
    const panel = new THREE.Mesh(panelGeo, doorMaterial);
    panel.castShadow = true; panel.receiveShadow = true;
    hinge.add(panel);
    scene.add(hinge);
    doors.push({
      hinge, isOpen: false, targetRotation: 0, locked: false, upperFloor: buildingUpperFloor,
      box: { minX: fixedPos - wallThickness / 2, maxX: fixedPos + wallThickness / 2, minZ: doorAt - doorWidth / 2, maxZ: doorAt + doorWidth / 2 },
      center: { x: fixedPos, z: doorAt },
    });

    [doorAt - doorWidth / 2 - trimW / 2, doorAt + doorWidth / 2 + trimW / 2].forEach(z => {
      const side = new THREE.BoxGeometry(trimDepth, sideLen, trimW);
      side.translate(fixedPos, y + sideLen / 2, z);
      doorFrameGeometries.push(side);
    });
    const top = new THREE.BoxGeometry(trimDepth, trimW, doorWidth + trimW * 2);
    top.translate(fixedPos, y + doorHeight + trimW / 2, doorAt);
    doorFrameGeometries.push(top);

    const header = new THREE.BoxGeometry(wallThickness, wallHeight - doorHeight, doorWidth);
    header.translate(fixedPos, y + doorHeight + (wallHeight - doorHeight) / 2, doorAt);
    wallGeometries.push(header);

    [wallThickness / 2 + 0.03, -(wallThickness / 2 + 0.03)].forEach(xOff => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.035), doorHandleMaterial);
      handle.position.set(xOff, doorHeight * 0.45, doorWidth * 0.86);
      hinge.add(handle);
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
  if (currentUpperFloor > 0) {
    const boxes = upperFloorWallBoxes[currentUpperFloor] || [];
    if (boxes.some(b => x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ)) {
      return true;
    }
    return doors.some(d => d.upperFloor === currentUpperFloor && !d.isOpen &&
      x + radius > d.box.minX && x - radius < d.box.maxX &&
      z + radius > d.box.minZ && z - radius < d.box.maxZ
    );
  }
  const boxes = onGroundFloor ? wallBoxes : basementWallBoxes;
  if (boxes.some(b => x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ)) {
    return true;
  }
  if (onGroundFloor) {
    return doors.some(d => !d.upperFloor && !d.isOpen &&
      x + radius > d.box.minX && x - radius < d.box.maxX &&
      z + radius > d.box.minZ && z - radius < d.box.maxZ
    );
  }
  return false;
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





// 拠点のテント(懐中電灯・EMFリーダーはここで拾うまで使えない)
let hasFlashlight = false;
let hasEMF = false;
let hasThermometer = false;
let hasNotebook = false;
let hasSpiritBox = false;
let hasUV = false;
let hasDots = false;
// 正気度(0〜100)。家の中(地下含む)にいる間だけ減っていき、30以下になると幽霊が襲ってくることがある
let sanity = 100;
let huntActive = false;
let huntTimer = 0;
let huntCheckTimer = 8; // 最初の判定までの猶予
const sanityCanvas = document.createElement('canvas');
sanityCanvas.width = 128; sanityCanvas.height = 96;
const sanityTexture = new THREE.CanvasTexture(sanityCanvas);
function drawSanityScreen(value) {
  const ctx = sanityCanvas.getContext('2d');
  const w = sanityCanvas.width, h = sanityCanvas.height;
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SANITY', w / 2, 20);
  const barX = 10, barY = 32, barW = w - 20, barH = 18;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);
  const fillW = Math.max(0, barW * (value / 100));
  ctx.fillStyle = value <= 30 ? '#ff3838' : value <= 60 ? '#ffaa33' : '#4fdc6a';
  ctx.fillRect(barX, barY, fillW, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`${Math.round(value)}%`, w / 2, h - 12);
  sanityTexture.needsUpdate = true;
}
const pickupItems = [];
function addPickupItem(x, z, mesh, onCollect) {
  mesh.position.x = x;
  mesh.position.z = z;
  scene.add(mesh);
  pickupItems.push({ x, z, mesh, collected: false, onCollect });
}

// 監視カメラ(複数の部屋に設置し、テントの複数モニターへ映像を送る)
const videoCams = []; // { camera, rt, material, roomName }
function addSurveillanceCamera(roomName) {
  const r = room(roomName);
  const rt = new THREE.WebGLRenderTarget(192, 144);
  const material = new THREE.MeshBasicMaterial({ map: rt.texture });
  const cam = new THREE.PerspectiveCamera(60, 256 / 192, 0.1, 30);
  cam.layers.enable(1);
  cam.position.set(r.minX + 1.0, 2.4, r.minZ + 1.0);
  cam.lookAt(r.maxX - 1.0, 1.0, r.maxZ - 1.0);
  scene.add(cam);
  videoCams.push({ camera: cam, rt, material, roomName });
}

// 道具のメッシュ生成・収集・所持解除は、拾うときと捨てるときの両方で使い回す
function makeFlashlightItemMesh() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 8), mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
function makeEMFItemMesh() {
  // 本体+縦に並んだ5個のLED(userData.ledsに入れておき、レベルに応じて後から光らせる)
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  group.add(body);
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.012), new THREE.MeshBasicMaterial({ color: 0x2a1010 }));
    led.position.set(0, -0.07 + i * 0.033, 0.028);
    group.add(led);
    leds.push(led);
  }
  group.userData.leds = leds;
  return group;
}
function makeThermoItemMesh() {
  // 放射温度計(グリップ+本体+先端センサー+レーザー点)。原点はグリップの下端
  const group = new THREE.Group();
  const gripH = 0.1;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, gripH, 0.045), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
  grip.position.set(0, gripH / 2, 0);
  group.add(grip);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.12), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  body.position.set(0, gripH + 0.018, -0.035);
  group.add(body);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.017, 0.022, 10), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, gripH + 0.018, -0.1);
  group.add(nose);
  // 画面は書き換え可能なキャンバスにして、実際の温度の数字を表示できるようにする
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 64; screenCanvas.height = 32;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.026, 0.016), new THREE.MeshBasicMaterial({ map: screenTexture }));
  screen.position.set(0, gripH + 0.04, 0.005);
  screen.rotation.x = -Math.PI / 2 + 0.25;
  group.add(screen);
  group.userData.screenCanvas = screenCanvas;
  group.userData.screenTexture = screenTexture;
  const laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  laserDot.position.set(0, gripH + 0.018, -0.112);
  group.add(laserDot);
  return group;
}
function makeNotebookItemMesh() {
  // 手持ち表示では開いた状態に見えるよう、ページを表紙より上に、はっきり見える高さで重ねる
  const group = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.008, 0.19), new THREE.MeshLambertMaterial({ color: 0x5a2a2a }));
  cover.position.y = -0.006;
  group.add(cover);
  // ページも書き換え可能なキャンバスにして、白紙/書き込みありを見た目で区別できるようにする
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = 128; pageCanvas.height = 160;
  drawNotebookPage(pageCanvas, false);
  const pageTexture = new THREE.CanvasTexture(pageCanvas);
  const pages = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.17), new THREE.MeshBasicMaterial({ map: pageTexture }));
  pages.rotation.x = -Math.PI / 2;
  pages.position.y = 0.001;
  group.add(pages);
  group.userData.pageCanvas = pageCanvas;
  group.userData.pageTexture = pageTexture;
  return group;
}
// ノートのページを描き直す(白紙、または幽霊が書き込んだ魔法陣)
function drawNotebookPage(canvas, written) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#f2ecd8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,140,170,0.5)';
  ctx.lineWidth = 1;
  for (let y = 14; y < h; y += 12) {
    ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke();
  }
  if (written) {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.4;
    ctx.strokeStyle = 'rgba(100,10,10,0.85)';
    ctx.lineWidth = 1.5;
    // 二重の円
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    // 内側の五芒星
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = Math.PI * 2 * ((i * 2) % 5) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * r * 0.8;
      const y = cy + Math.sin(a) * r * 0.8;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // 円周を囲む小さな印(ルーンのような十字の刻み)
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const x = cx + Math.cos(a) * r * 0.93;
      const y = cy + Math.sin(a) * r * 0.93;
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
  }
}
// スピリットボックス(本体+アンテナ+スピーカーの網目)。原点は底面
function makeSpiritBoxItemMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.03), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  body.position.y = 0.08;
  group.add(body);
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.06), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  grille.position.set(0, 0.12, 0.016);
  group.add(grille);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 6), new THREE.MeshLambertMaterial({ color: 0x999999 }));
  antenna.position.set(0.02, 0.22, 0);
  group.add(antenna);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.008), new THREE.MeshBasicMaterial({ color: 0x2a1010 }));
  led.position.set(0, 0.04, 0.016);
  group.add(led);
  group.userData.led = led;
  return group;
}
// UVライト(懐中電灯より太めの筒+紫のレンズ)。原点は底面
function makeUVItemMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.16, 10), new THREE.MeshLambertMaterial({ color: 0x1c1c1c }));
  body.rotation.x = Math.PI / 2;
  body.position.z = -0.02;
  group.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 10), new THREE.MeshBasicMaterial({ color: 0x8a2be2, emissive: 0x8a2be2, emissiveIntensity: 1.2 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.1;
  group.add(lens);
  return group;
}
// D.O.T.S(三脚+投光ヘッド)。原点は底面
function makeDotsItemMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.05), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  body.position.y = 0.045;
  group.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), new THREE.MeshBasicMaterial({ color: 0x33ff55, emissive: 0x33ff55, emissiveIntensity: 1.4 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.06, -0.03);
  group.add(lens);
  return group;
}
// 各道具の「置き場の面から自分の原点までの高さ」。テーブル(0.75)でも床(0)でも、この分だけ浮かせて自然に載せる
const toolRestOffset = { flashlight: 0.04, emf: 0.1, thermometer: 0.005, notebook: 0.03, spiritbox: 0, uv: 0, dots: 0.045 };
const toolMeshMakers = { flashlight: makeFlashlightItemMesh, emf: makeEMFItemMesh, thermometer: makeThermoItemMesh, notebook: makeNotebookItemMesh, spiritbox: makeSpiritBoxItemMesh, uv: makeUVItemMesh, dots: makeDotsItemMesh };
const toolNames = { flashlight: '懐中電灯', emf: 'EMFリーダー', thermometer: '温度計', notebook: 'ノート', spiritbox: 'スピリットボックス', uv: 'UVライト', dots: 'D.O.T.S投光器' };

// 手元に持っている道具を画面右下に表示するビューモデル(実体はカメラの子として後で作る。ここでは表示切り替えだけ用意)
let viewmodels = {};
let notebookWorldMesh = null; // 今、床やテーブルに置かれているノートのメッシュ(あれば)。書き込み発生時にここも更新する
function updateViewmodel() {
  Object.keys(viewmodels).forEach(tool => {
    viewmodels[tool].visible = (tool === currentTool);
  });
}

function collectTool(tool) {
  heldOrder.push(tool);
  currentTool = tool;
  if (tool === 'flashlight') { hasFlashlight = true; flashlight.intensity = 1.2; }
  else if (tool === 'emf') { hasEMF = true; emfActive = true; }
  else if (tool === 'thermometer') { hasThermometer = true; thermometerActive = true; }
  else if (tool === 'notebook') { hasNotebook = true; notebookActive = true; notebookWorldMesh = null; }
  else if (tool === 'spiritbox') { hasSpiritBox = true; spiritBoxActive = true; }
  else if (tool === 'uv') { hasUV = true; uvActive = true; }
  else if (tool === 'dots') { hasDots = true; dotsActive = true; }
  showPickupNotice(`${toolNames[tool]}を入手した`);
  updateHotbar();
  updateViewmodel();
}

// 今持っている道具を、今いるその場に置いて手放す(Qキー/ゲームパッド十字キー下)
function dropCurrentTool() {
  if (!currentTool) return;
  const tool = currentTool;
  if (tool === 'flashlight') { hasFlashlight = false; flashlight.intensity = 0; }
  else if (tool === 'emf') { hasEMF = false; emfActive = false; emfDisplay.textContent = ''; }
  else if (tool === 'thermometer') { hasThermometer = false; thermometerActive = false; thermoDisplay.textContent = ''; }
  else if (tool === 'notebook') { hasNotebook = false; notebookActive = false; notebookDisplay.textContent = ''; }
  else if (tool === 'spiritbox') { hasSpiritBox = false; spiritBoxActive = false; spiritBoxDisplay.textContent = ''; }
  else if (tool === 'uv') { hasUV = false; uvActive = false; }
  else if (tool === 'dots') { hasDots = false; dotsActive = false; dotsDisplay.textContent = ''; }
  heldOrder = heldOrder.filter(t => t !== tool);

  const mesh = toolMeshMakers[tool]();
  mesh.position.y = 0.03 + toolRestOffset[tool]; // 床置き(床=Y0の少し上)
  if (tool === 'notebook') {
    notebookWorldMesh = mesh;
    if (notebookWritten) { // 既に書き込み済みなら、置いた状態でも白紙に戻さず反映する
      drawNotebookPage(mesh.userData.pageCanvas, true);
      mesh.userData.pageTexture.needsUpdate = true;
    }
  }
  addPickupItem(camera.position.x, camera.position.z, mesh, () => collectTool(tool));

  if (heldOrder.length > 0) {
    selectTool(heldOrder[0]);
  } else {
    currentTool = null;
    updateHotbar();
  }
  updateViewmodel();
  showPickupNotice(`${toolNames[tool]}を置いた`);
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
const woodFurnitureMaterial = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#6b4a30'), 2, 2) });
const ceramicMaterial = new THREE.MeshLambertMaterial({ color: 0xe8e6e0 });
const fabricMaterial = new THREE.MeshLambertMaterial({ color: 0x4a4550 });
const metalMaterial = new THREE.MeshLambertMaterial({ color: 0xc8ccd0 });
const mattressMaterial = new THREE.MeshLambertMaterial({ color: 0xe8e2d0 });
const handleMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
const countertopMaterial = new THREE.MeshLambertMaterial({ color: 0xb8b4ac });

// 見た目だけの飾りパーツ(当たり判定には登録しない。細かい部品なので影は落とさず、受けるだけにして負荷を抑える)
function addDetailMesh(x, y, z, w, h, d, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
// 脚(円柱)。ベッド・ソファ・カウンター・冷蔵庫などの「浮いている感」をなくす細部パーツ
function addLeg(x, y, z, radius, height, material = woodFurnitureMaterial) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 8), material);
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
function addLegsUnder(x, z, w, d, inset, radius, height, material) {
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    addLeg(x + sx * (w / 2 - inset), 0, z + sz * (d / 2 - inset), radius, height, material);
  });
}

// ベッド = 脚 + 木の土台 + ヘッドボード + マットレス + 枕
function bedIn(name, dx, dz, w, d) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  const legH = 0.14, frameH = 0.16, mattressH = 0.22;
  addLegsUnder(x, z, w, d, 0.08, 0.025, legH, woodFurnitureMaterial);
  addFurniture(x, z, w, d, frameH, woodFurnitureMaterial, legH); // 脚の上に土台を乗せる(判定の高さは脚込みで扱う)
  addDetailMesh(x, legH + frameH + mattressH / 2, z, w * 0.92, mattressH, d * 0.92, mattressMaterial);
  // ヘッドボード(部屋の入口から遠いほう=-Z側を頭側と想定)
  const headboardH = 0.55;
  addDetailMesh(x, legH + frameH + headboardH / 2, z - d / 2 + 0.03, w * 0.94, headboardH, 0.05, woodFurnitureMaterial);
  // 枕(2つ、頭側に寄せて並べる)
  const pillowY = legH + frameH + mattressH + 0.045;
  addDetailMesh(x - w * 0.22, pillowY, z - d * 0.32, w * 0.32, 0.09, d * 0.24, ceramicMaterial);
  addDetailMesh(x + w * 0.22, pillowY, z - d * 0.32, w * 0.32, 0.09, d * 0.24, ceramicMaterial);
}

// ソファ = 脚 + 座面クッション(2分割)+ 肘掛け2つ + 背もたれクッション(2分割)
function sofaAt(x, z, w, d) {
  const legH = 0.1, seatH = 0.32, cushionH = 0.14, backH = 0.4, backT = 0.16, armW = 0.14;
  addLegsUnder(x, z, w, d, 0.06, 0.02, legH, handleMaterial);
  addFurniture(x, z, w, d, seatH, fabricMaterial, legH); // 脚の上に座面ベースを乗せる
  // 座面クッションを2つに分けて継ぎ目を見せる
  const cushionW = (w - armW * 2 - 0.04) / 2;
  [-1, 1].forEach(sx => {
    addDetailMesh(x + sx * (cushionW / 2 + 0.02), legH + seatH + cushionH / 2, z - backT / 2, cushionW, cushionH, d - backT - 0.06, fabricMaterial);
  });
  // 肘掛け(両端、座面より少し高く)
  const armH = 0.32;
  [-1, 1].forEach(sx => {
    addDetailMesh(x + sx * (w / 2 - armW / 2), legH + armH / 2, z, armW, armH, d, fabricMaterial);
  });
  // 背もたれクッションを2つに分けて配置
  [-1, 1].forEach(sx => {
    addDetailMesh(x + sx * (cushionW / 2 + 0.02), legH + seatH + backH / 2, z + d / 2 - backT / 2, cushionW, backH, backT, fabricMaterial);
  });
}

// ワードローブ = 本体 + 上部の見切り + 中央の縦の継ぎ目 + 取っ手2つ(部屋の内側=-X向きに面する想定)
function wardrobeIn(name, dx, dz, w, d, h) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  addFurniture(x, z, w, d, h, woodFurnitureMaterial);
  addDetailMesh(x, h + 0.02, z, w + 0.03, 0.04, d + 0.03, woodFurnitureMaterial); // 上部の見切り板
  const faceX = x - w / 2 - 0.01;
  addDetailMesh(faceX, h * 0.5, z, 0.015, h * 0.94, 0.006, handleMaterial); // 中央の縦の継ぎ目(左右の扉の境目)
  addDetailMesh(faceX - 0.02, h * 0.5, z - d * 0.2, 0.03, 0.15, 0.04, handleMaterial);
  addDetailMesh(faceX - 0.02, h * 0.5, z + d * 0.2, 0.03, 0.15, 0.04, handleMaterial);
}

// キッチンカウンター = 木の台 + 引き出し前板×2 + 取っ手 + 天板(少しはみ出す)
function counterAt(x, z, w, d, h) {
  addFurniture(x, z, w, d, h, woodFurnitureMaterial);
  addDetailMesh(x, h + 0.03, z, w + 0.08, 0.06, d + 0.08, countertopMaterial);
  // 引き出し前板を2枚、少し前面に張り出させて陰影を作る
  const faceZ = z + d / 2 + 0.005;
  const drawerW = w / 2 - 0.04;
  [-1, 1].forEach(sx => {
    addDetailMesh(x + sx * (drawerW / 2 + 0.02), h * 0.72, faceZ, drawerW, h * 0.32, 0.02, woodFurnitureMaterial);
    addDetailMesh(x + sx * (drawerW / 2 + 0.02), h * 0.72, faceZ + 0.015, 0.1, 0.02, 0.02, handleMaterial);
  });
}

// 冷蔵庫 = 脚 + 本体 + 冷凍庫との仕切りライン + 取っ手(部屋の内側=-Z向きに面する想定)
function fridgeAt(x, z, w, d, h) {
  const legH = 0.03;
  addLegsUnder(x, z, w, d, 0.05, 0.015, legH, handleMaterial);
  addFurniture(x, z, w, d, h, metalMaterial, legH);
  const faceZ = z - d / 2 - 0.01;
  addDetailMesh(x, legH + h * 0.72, faceZ, w - 0.03, 0.012, 0.01, handleMaterial); // 冷蔵室/冷凍室の仕切りライン
  addDetailMesh(x + w * 0.15, legH + h * 0.55, faceZ, 0.06, h * 0.35, 0.03, handleMaterial);
  addDetailMesh(x + w * 0.15, legH + h * 0.85, faceZ, 0.05, h * 0.14, 0.03, handleMaterial);
}

function addFurniture(x, z, w, d, h, material = woodFurnitureMaterial, baseY = 0) {
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + baseY + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (buildingUpperFloor > 0) {
    upperFloorWallBoxes[buildingUpperFloor].push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  } else {
    wallBoxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }
}
function furnitureIn(name, dx, dz, w, d, h, material) {
  const r = room(name);
  addFurniture(r.minX + dx, r.minZ + dz, w, d, h, material);
}
// 洗面台 = 支柱 + 台座 + くぼんだ洗面ボウル(円柱をくぼみに見立てて縁取り)+ 蛇口
function washstandIn(name, dx, dz, w, d, h) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  addLeg(x, 0, z, 0.035, h * 0.55, ceramicMaterial); // 中央の支柱
  addFurniture(x, z, w, d, h, ceramicMaterial);
  const basinR = Math.min(w, d) * 0.36;
  addDetailMesh(x, h + 0.02, z, w - 0.04, 0.04, d - 0.04, ceramicMaterial); // 天板
  const basinRim = new THREE.Mesh(new THREE.CylinderGeometry(basinR, basinR * 0.9, 0.05, 16), ceramicMaterial);
  basinRim.position.set(x, h + 0.035, z);
  basinRim.receiveShadow = true;
  scene.add(basinRim);
  const basinWell = new THREE.Mesh(new THREE.CylinderGeometry(basinR * 0.78, basinR * 0.6, 0.04, 16), new THREE.MeshLambertMaterial({ color: 0xd8d6ce }));
  basinWell.position.set(x, h + 0.025, z);
  basinWell.receiveShadow = true;
  scene.add(basinWell);
  addDetailMesh(x, h + 0.18, z - d / 2 + 0.06, 0.03, 0.22, 0.03, metalMaterial); // 蛇口の柱
  addDetailMesh(x, h + 0.27, z - d / 2 + 0.14, 0.03, 0.03, 0.14, metalMaterial); // 蛇口の口
}

// トイレ = ボウル(当たり判定あり) + 座面リング + 蓋 + 背面のタンク + 洗浄レバー(見た目のみ)
function toiletIn(name, dx, dz) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  const bowlW = 0.38, bowlD = 0.48, bowlH = 0.38;
  addFurniture(x, z, bowlW, bowlD, bowlH, ceramicMaterial);
  // 座面リング(楕円に近づけるため薄い円柱)+ 蓋(少し立て掛けた板)
  const seatRing = new THREE.Mesh(new THREE.CylinderGeometry(bowlW * 0.52, bowlW * 0.5, 0.03, 16), ceramicMaterial);
  seatRing.position.set(x, bowlH + 0.02, z + bowlD * 0.05);
  seatRing.scale.z = bowlD / bowlW * 1.05;
  seatRing.receiveShadow = true;
  scene.add(seatRing);
  addDetailMesh(x, bowlH + 0.045, z - bowlD * 0.32, bowlW * 0.9, 0.025, bowlD * 0.55, ceramicMaterial); // 蓋
  const tankH = 0.32;
  addDetailMesh(x, bowlH + tankH / 2, z - bowlD / 2 + 0.09, bowlW + 0.02, tankH, 0.16, ceramicMaterial);
  addDetailMesh(x + bowlW * 0.3, bowlH + tankH - 0.05, z - bowlD / 2 + 0.02, 0.05, 0.02, 0.03, metalMaterial); // 洗浄レバー
}


// 幽霊(証拠システムの土台込み)。証拠は7種類、幽霊ごとに異なる3種の組み合わせを持つ
// 幽霊の種類の一覧(証拠は7種類、幽霊ごとに異なる3種の組み合わせを持つ)。マップに依存しない共通のロースター
const ghostTypes = [
  { name: "Spirit", evidence: ["EMF5", "スピリットボックス", "ゴーストライティング"] },
  { name: "Wraith", evidence: ["EMF5", "オーブ", "冷えた温度"] },
  { name: "Poltergeist", evidence: ["スピリットボックス", "ゴーストライティング", "冷えた温度"] },
  { name: "Banshee", evidence: ["EMF5", "ゴーストライティング", "指紋"] },
  { name: "Jinn", evidence: ["EMF5", "スピリットボックス", "指紋"] },
  { name: "Mare", evidence: ["スピリットボックス", "オーブ", "指紋"] },
  { name: "Revenant", evidence: ["ゴーストライティング", "オーブ", "D.O.T.S"] },
  { name: "Yurei", evidence: ["冷えた温度", "指紋", "D.O.T.S"] },
];

// ノートへの書き込み(ゴーストライティングが証拠の幽霊だけ、幽霊のいる部屋に合計15〜45秒いると一度だけ書かれる)
let notebookWritten = false;
let notebookTimer = 15 + Math.random() * 30;

function randomPointInRoom(r, margin = 0.6) {
  return new THREE.Vector3(
    r.minX + margin + Math.random() * Math.max(0.1, r.maxX - r.minX - margin * 2),
    1.0,
    r.minZ + margin + Math.random() * Math.max(0.1, r.maxZ - r.minZ - margin * 2)
  );
}

// 幽霊の見た目(マテリアル・メッシュ自体はどのマップでも共通なので先に作っておく。実際にどこへ出すかはinitHaunting()で決める)
const ghostMaterial = new THREE.MeshLambertMaterial({
  color: 0xaad4ff, transparent: true, opacity: 0.35,
  emissive: 0x335577, emissiveIntensity: 0.6
});
const ghost = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), ghostMaterial);
scene.add(ghost);

// D.O.T.S用: 幽霊の体に浮かぶ緑の光点(普段は非表示。投光器を向けたときだけ見える)
const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x33ff55 });
const ghostDotMarkers = [];
for (let i = 0; i < 6; i++) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), dotMaterial);
  dot.position.set((Math.random() - 0.5) * 0.4, -0.5 + Math.random() * 1.2, (Math.random() - 0.5) * 0.2);
  dot.visible = false;
  ghost.add(dot);
  ghostDotMarkers.push(dot);
}

// スピリットボックスが返す単語(証拠に一致する幽霊が近くにいるときだけ、雑音の代わりにこの中から返る)
const spiritBoxWords = ['Y6uB4†b', 'P0см0три n4 меня', '0л4 0л4 0л4 0л4'];
let spiritBoxTimer = 2;

// 指紋(手形)のテクスチャ。手のひら+親指+4本指を手続き的に描き、UVを当てたときだけ浮かぶ薄紫の手形にする
function makeFingerprintTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(179,136,255,0.6)';
  try { ctx.filter = 'blur(1.5px)'; } catch (e) { /* 一部環境でblurが未対応でも問題ない */ }
  // 手のひら
  ctx.beginPath();
  ctx.ellipse(64, 80, 25, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // 親指
  ctx.save();
  ctx.translate(34, 62);
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 4本指(根元の位置・長さ・傾きをそれぞれ変えて自然な形に)
  [
    { x: 42, len: 32, rot: -0.2 },
    { x: 56, len: 40, rot: -0.06 },
    { x: 72, len: 42, rot: 0.05 },
    { x: 86, len: 34, rot: 0.18 },
  ].forEach(f => {
    ctx.save();
    ctx.translate(f.x, 48);
    ctx.rotate(f.rot);
    ctx.beginPath();
    ctx.ellipse(0, -f.len / 2, 6.5, f.len / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  // うっすらとした滲み(見た目に生々しさを足す)
  ctx.filter = 'none';
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(179,136,255,${Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(20 + Math.random() * 88, 30 + Math.random() * 80, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const fingerprintMat = new THREE.MeshBasicMaterial({ map: makeFingerprintTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
const fingerprintSpot = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), fingerprintMat);

// 指紋(UVライト)用: 幽霊の出没する部屋のドア(あれば)を探し、取っ手のそばに手形を貼り付ける。
// ドアに紐づけて追加するので、ドアの開閉と一緒に動く。部屋にドアが無ければ元の場所(部屋の中のランダムな壁沿い)に浮かべる
function doorBordersRoom(door, r, tol = 0.05) {
  const onXWall = (Math.abs(door.center.x - r.minX) < tol || Math.abs(door.center.x - r.maxX) < tol) &&
    door.center.z > r.minZ - tol && door.center.z < r.maxZ + tol;
  const onZWall = (Math.abs(door.center.z - r.minZ) < tol || Math.abs(door.center.z - r.maxZ) < tol) &&
    door.center.x > r.minX - tol && door.center.x < r.maxX + tol;
  return onXWall || onZWall;
}

// ゴーストオーブ(オーブを証拠に持つ幽霊のときだけ出現。肉眼では見えず、監視カメラの映像でのみ見える)
const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xddeeff, transparent: true, opacity: 0.85 });
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), orbMaterial);
orb.layers.set(1);
orb.visible = false;
scene.add(orb);
let orbRoom = null; // マップ側がsetOrbRoom()で設定する
function setOrbRoom(bounds) { orbRoom = bounds; }

// 家の外に出られるドアなど、マップ側が「ここはハント中にロックしたい」と決めたドア。マップ側がsetExteriorDoor()で設定する
let exteriorDoor = null;
function setExteriorDoor(door) { exteriorDoor = door; }

let currentGhost = null;
let hauntedRoom = null;
let ghostTarget = null;

// 幽霊を1体ランダムに選び、渡された候補部屋(マップ側が「出没してよい部屋」として絞り込んだもの)の中に配置する
function initHaunting(hauntableRoomEntries) {
  currentGhost = ghostTypes[Math.floor(Math.random() * ghostTypes.length)];
  const hauntedRoomEntry = hauntableRoomEntries[Math.floor(Math.random() * hauntableRoomEntries.length)];
  hauntedRoom = hauntedRoomEntry.bounds;
  console.log("[デバッグ] 幽霊の種類:", currentGhost.name, "証拠:", currentGhost.evidence, "出没部屋:", hauntedRoomEntry.name);

  ghostTarget = randomPointInRoom(hauntedRoom);
  ghost.position.copy(ghostTarget);

  const hauntedRoomDoors = doors.filter(d => doorBordersRoom(d, hauntedRoom));
  if (hauntedRoomDoors.length > 0) {
    const doorObj = hauntedRoomDoors[Math.floor(Math.random() * hauntedRoomDoors.length)];
    // 扉のヒンジGroupの子として付けることで、開閉に合わせて一緒に動くようにする。取っ手のすぐ下あたりに手のひらが来るよう配置
    const isXAxisDoor = Math.abs(doorObj.box.maxX - doorObj.box.minX) >= Math.abs(doorObj.box.maxZ - doorObj.box.minZ);
    if (isXAxisDoor) {
      fingerprintSpot.position.set(doorWidth * 0.72, doorHeight * 0.4, wallThickness / 2 + 0.003);
    } else {
      fingerprintSpot.rotation.y = Math.PI / 2;
      fingerprintSpot.position.set(wallThickness / 2 + 0.003, doorHeight * 0.4, doorWidth * 0.72);
    }
    doorObj.hinge.add(fingerprintSpot);
  } else {
    // 該当する部屋にドアが見つからなかった場合のフォールバック(部屋の中に浮かべる)
    const fingerprintSpotPos = randomPointInRoom(hauntedRoom, 0.9);
    fingerprintSpot.position.set(fingerprintSpotPos.x, 1.1, fingerprintSpotPos.z);
    scene.add(fingerprintSpot);
  }
}

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

// 天井の照明。実際に計算コストのかかるPointLightは一切使わず、
// 「照明器具の発光」+「床に落ちる光だまり(半透明の丸いテクスチャ)」を明るくするだけの、見た目だけの仕掛けにする。
// この方式なら、プレイヤーがどれだけ動いてもライトの数・位置は一切変わらないので、移動によるカクつきが原理的に発生しない。
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,214,0.9)');
  g.addColorStop(0.6, 'rgba(255,244,214,0.35)');
  g.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = makeGlowTexture(); // 全部屋で共有する(部屋ごとに用意する必要はない)
function addRoomLight(name, intensity, color = 0xfff2cc, distance = 10) {
  const r = room(name);
  const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;

  const fixtureMat = new THREE.MeshLambertMaterial({
    color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 0
  });
  const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), fixtureMat);
  fixture.position.set(cx, y + 2.97, cz);
  scene.add(fixture);

  // 床に落ちる光だまり(実際の光源ではなく、半透明の輝く円盤。加算合成っぽく見せるためdepthWriteはオフ)
  const glowSize = Math.min(3.2, Math.max(r.maxX - r.minX, r.maxZ - r.minZ) * 0.9);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture, color, transparent: true, opacity: 0, depthWrite: false
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(glowSize, glowSize), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(cx, y + 0.02, cz);
  scene.add(glow);

  return { fixtureMat, glowMat, baseGlowOpacity: Math.min(0.6, intensity / 12) };
}

// 各部屋の壁際にスイッチを設置(部屋の入口寄りの角、床上1.1m)。位置を指定すればそこに設置する。
// rlは addRoomLight() が返した「その部屋の照明の見た目一式」(マップ側が持っている)を渡してもらう
const lightSwitches = [];
function addLightSwitch(roomName, rl, customX, customZ) {
  const r = room(roomName);
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const x = customX !== undefined ? customX : r.maxX - 0.15;
  const z = customZ !== undefined ? customZ : r.maxZ - 0.6;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0x554400, emissiveIntensity: 0.5 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat);
  mesh.position.set(x, y + 1.1, z);
  mesh.castShadow = true;
  scene.add(mesh);
  lightSwitches.push({ x, z, roomName, rl, fixtureMat: rl.fixtureMat, switchMat: mat, on: true });
}

// スイッチ・ブレーカーが切り替わったときだけ呼ぶ(プレイヤーの位置は一切見ない=毎フレームは動かないので、移動によるコストは無い)
function updateRoomLightCulling() {
  lightSwitches.forEach(sw => {
    const wantsOn = sw.on && breakerOn;
    sw.fixtureMat.emissiveIntensity = wantsOn ? 1.2 : 0;
    sw.rl.glowMat.opacity = wantsOn ? sw.rl.baseGlowOpacity : 0;
  });
}

// ブレーカー(地下室などマップ固有の設備)。マップ側が箱の位置と、切り替え時に呼ぶ関数を登録する
let breakerOn = false; // ゲーム開始時は電気が落ちている想定
let breakerBox = null;
let onBreakerToggle = null;
function registerBreaker(box, onToggle) {
  breakerBox = box;
  onBreakerToggle = onToggle;
}
// マップ側から直接ブレーカーの状態を変えたいとき用(テストプレイで最初から電気を点けておきたい場合など)
function setBreakerOn(v) { breakerOn = v; }
// 地下室の深さなど、階をまたぐ演出(ハント中の幽霊の追跡など)に使うマップ固有の値。マップ側が設定する
let basementFloorY = 0;
function setBasementFloorY(y) { basementFloorY = y; }

// ESモジュールではimportした変数に直接代入できないため、マップ側から書き換えたい状態はセッター経由にする
function setOnGroundFloor(v) { onGroundFloor = v; }
function setNotebookWorldMesh(m) { notebookWorldMesh = m; }

// マップ固有の毎フレーム処理(階段の昇り降りの高さ補間など)を登録する。animateループから毎フレーム呼ばれる
const onFrameCallbacks = [];
function onFrame(fn) { onFrameCallbacks.push(fn); }

// スイッチ・ブレーカーに近づいてクリックするとON/OFF切り替え(天井照明ごと)
function tryInteract() {
  const heldCount = (hasFlashlight ? 1 : 0) + (hasEMF ? 1 : 0) + (hasThermometer ? 1 : 0) + (hasNotebook ? 1 : 0) +
    (hasSpiritBox ? 1 : 0) + (hasUV ? 1 : 0) + (hasDots ? 1 : 0);
  for (const item of pickupItems) {
    if (item.collected) continue;
    if (heldCount >= 3) break; // インベントリは3つまで
    const dx = camera.position.x - item.x, dz = camera.position.z - item.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
      item.collected = true;
      scene.remove(item.mesh);
      item.onCollect();
      return;
    }
  }

  if (breakerBox) {
    const dbx = camera.position.x - breakerBox.x, dbz = camera.position.z - breakerBox.z;
    if (Math.sqrt(dbx * dbx + dbz * dbz) < 1.2) {
      breakerOn = !breakerOn;
      if (onBreakerToggle) onBreakerToggle();
      showPickupNotice(breakerOn ? 'ブレーカーを入れた' : 'ブレーカーを落とした');
      return;
    }
  }

  let nearestDoor = null, nearestDoorDist = 1.5;
  for (const door of doors) {
    if ((door.upperFloor || 0) !== currentUpperFloor) continue; // 違う階に同じX/Zの扉があっても混同しない
    const dx = camera.position.x - door.center.x, dz = camera.position.z - door.center.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearestDoorDist) { nearestDoor = door; nearestDoorDist = d; }
  }
  if (nearestDoor) {
    if (nearestDoor.locked) { showPickupNotice('ドアが開かない…!'); return; }
    nearestDoor.isOpen = !nearestDoor.isOpen;
    nearestDoor.targetRotation = nearestDoor.isOpen ? Math.PI / 2 : 0;
    return;
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
    updateRoomLightCulling();
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
flashlight.shadow.mapSize.set(256, 256);
flashlight.shadow.camera.near = 0.1;
flashlight.shadow.camera.far = 8;
camera.add(flashlight);
scene.add(camera);

// 持っている道具を画面右下に表示するビューモデル本体(4種類ぶん作り、選択中の1つだけ表示する)
// 道具本体はラッパーGroupに入れる。直接rotationを上書きすると、各メッシュ自身が持つ向き(懐中電灯を寝かせる回転など)が
// 消えてしまうため、ラッパー側だけを回して「元の向き+構え角度」が足し合わさるようにする
const viewmodelBase = { position: [0.34, -0.2, -0.62], rotation: [0.12, -0.4, 0.05], scale: 1.4 };
const viewmodelOverrides = {
  flashlight: { rotation: [0.55, -0.4, 0.05] }, // もう少し手前(下向き)に傾ける
  // 温度計・ノートは元々クリップしていなかったので、以前の距離感(近く・大きく)に戻す
  thermometer: { position: [0.32, -0.26, -0.5], rotation: [0.3, -0.55, 0.15], scale: 1.8 },
  notebook: { position: [0.32, -0.26, -0.5], rotation: [0.3, -0.55, 0.15], scale: 1.8 },
  spiritbox: { position: [0.3, -0.28, -0.5], rotation: [0.2, -0.4, 0.05], scale: 1.6 },
  uv: { rotation: [0.55, -0.4, 0.05] },
  dots: { position: [0.32, -0.26, -0.52], rotation: [0.15, -0.4, 0.05], scale: 1.5 },
};
Object.keys(toolMeshMakers).forEach(tool => {
  const inner = toolMeshMakers[tool]();
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.userData = inner.userData; // LED/キャンバスの参照はラッパー側からも同じものを使えるようにする
  const t = { ...viewmodelBase, ...(viewmodelOverrides[tool] || {}) };
  wrapper.position.set(...t.position);
  wrapper.rotation.set(...t.rotation);
  wrapper.scale.setScalar(t.scale);
  wrapper.visible = false;
  wrapper.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  camera.add(wrapper);
  viewmodels[tool] = wrapper;
});

const controls = new PointerLockControls(camera, document.body);
const info = document.getElementById('info');
info.addEventListener('click', () => controls.lock()); // ESCで一時的に外れたときの再開クリック用
controls.addEventListener('unlock', () => { info.textContent = 'クリックで再開'; });

const emfDisplay = document.createElement('div');
emfDisplay.style.cssText = 'position:fixed;top:32px;left:8px;color:#0f0;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(emfDisplay);

const thermoDisplay = document.createElement('div');
thermoDisplay.style.cssText = 'position:fixed;top:52px;left:8px;color:#0ff;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(thermoDisplay);

const notebookDisplay = document.createElement('div');
notebookDisplay.style.cssText = 'position:fixed;top:72px;left:8px;color:#e8c060;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(notebookDisplay);

const spiritBoxDisplay = document.createElement('div');
spiritBoxDisplay.style.cssText = 'position:fixed;top:92px;left:8px;color:#ff66aa;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(spiritBoxDisplay);

const dotsDisplay = document.createElement('div');
dotsDisplay.style.cssText = 'position:fixed;top:112px;left:8px;color:#33ff55;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(dotsDisplay);

// タブキーで開く調査書(見開き)。左ページ=証拠チェック、右ページ=絞り込まれたゴースト一覧+特定ボタン
const evidenceTypes = ["EMF5", "スピリットボックス", "ゴーストライティング", "オーブ", "冷えた温度", "指紋", "D.O.T.S"];
let journalOpen = false;
const checkedEvidence = new Set();
let selectedGhostName = null;

// ロビーへ戻る(調査書内のボタン、またはPキーから呼ばれる)。誤操作で進行状況を失わないよう一度だけ確認する
function returnToLobby() {
  if (confirm('ロビーに戻りますか?(このマップでの進行状況は失われます)')) {
    window.location.href = 'lobby.html';
  }
}

const journalOverlay = document.createElement('div');
journalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:none;align-items:center;justify-content:center;z-index:50;';
document.body.appendChild(journalOverlay);

const journalBook = document.createElement('div');
journalBook.style.cssText = 'display:flex;width:min(860px,92vw);height:min(560px,82vh);box-shadow:0 10px 40px rgba(0,0,0,0.6);border-radius:4px;overflow:hidden;';
journalOverlay.appendChild(journalBook);

function makeJournalPage(borderSide) {
  const page = document.createElement('div');
  page.style.cssText = `flex:1;background:#ece3cf;color:#2a2419;font-family:Georgia,serif;padding:26px 24px;overflow-y:auto;border-${borderSide}:2px solid #b8a97e;box-sizing:border-box;`;
  return page;
}
const journalLeftPage = makeJournalPage('right');
const journalRightPage = makeJournalPage('left');
journalBook.appendChild(journalLeftPage);
journalBook.appendChild(journalRightPage);

// 左ページ: 証拠チェックリスト
const journalLeftTitle = document.createElement('h2');
journalLeftTitle.textContent = '証拠';
journalLeftTitle.style.cssText = 'margin:0 0 16px;font-size:20px;border-bottom:1px solid #b8a97e;padding-bottom:8px;';
journalLeftPage.appendChild(journalLeftTitle);

evidenceTypes.forEach(ev => {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;font-size:16px;cursor:pointer;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
  cb.addEventListener('change', () => {
    if (cb.checked) checkedEvidence.add(ev); else checkedEvidence.delete(ev);
    updateJournalGhostList();
  });
  const span = document.createElement('span');
  span.textContent = ev;
  row.appendChild(cb);
  row.appendChild(span);
  journalLeftPage.appendChild(row);
});

// 証拠リストの下に「ロビーに戻る」ボタンを置く(Pキーでも同じ動作)
const journalLobbyBtn = document.createElement('button');
journalLobbyBtn.textContent = '🚪 ロビーに戻る';
journalLobbyBtn.style.cssText = 'display:block;margin-top:24px;padding:9px 18px;font-size:14px;font-family:Georgia,serif;background:#3a3428;color:#ece3cf;border:none;border-radius:3px;cursor:pointer;';
journalLobbyBtn.addEventListener('click', returnToLobby);
journalLeftPage.appendChild(journalLobbyBtn);

// 右ページ: 証拠に一致するゴーストの一覧(チェック無しなら全種類)+特定ボタン
const journalRightTitle = document.createElement('h2');
journalRightTitle.textContent = 'ゴーストの種類';
journalRightTitle.style.cssText = 'margin:0 0 16px;font-size:20px;border-bottom:1px solid #b8a97e;padding-bottom:8px;';
journalRightPage.appendChild(journalRightTitle);

const journalGhostList = document.createElement('div');
journalRightPage.appendChild(journalGhostList);

const journalIdentifyBtn = document.createElement('button');
journalIdentifyBtn.textContent = '特定';
journalIdentifyBtn.style.cssText = 'display:none;margin-top:20px;padding:10px 28px;font-size:16px;font-family:Georgia,serif;background:#6b1f1f;color:#f0e6d2;border:none;border-radius:3px;cursor:pointer;';
journalIdentifyBtn.addEventListener('click', () => {
  const correct = selectedGhostName === currentGhost.name;
  const elapsedSeconds = gameStartTime ? Math.max(0, Math.floor((performance.now() - gameStartTime) / 1000)) : 0;
  const reward = calculateReward(correct, elapsedSeconds);
  // closeJournal()は「未ロックなら再ロックする」動作をするが、ここではリザルト画面操作のためカーソルを出したままにしたいので使わない
  journalOpen = false;
  journalOverlay.style.display = 'none';
  showIdentifyResult(correct, elapsedSeconds, reward);
});
journalRightPage.appendChild(journalIdentifyBtn);

function updateJournalGhostList() {
  journalGhostList.innerHTML = '';
  const checkedList = [...checkedEvidence];
  const matching = ghostTypes.filter(g => checkedList.every(ev => g.evidence.includes(ev)));
  matching.forEach(g => {
    const row = document.createElement('div');
    const isSelected = g.name === selectedGhostName;
    row.textContent = g.name;
    row.style.cssText = `padding:10px 8px;font-size:17px;cursor:pointer;border-radius:3px;margin-bottom:4px;${isSelected ? 'background:#b8a97e;font-weight:bold;' : ''}`;
    row.addEventListener('click', () => {
      selectedGhostName = g.name;
      journalIdentifyBtn.style.display = 'inline-block';
      updateJournalGhostList();
    });
    journalGhostList.appendChild(row);
  });
  if (matching.length === 0) {
    const none = document.createElement('div');
    none.textContent = '(条件に一致するゴーストがいません)';
    none.style.cssText = 'color:#8a7a5a;font-style:italic;padding:10px 8px;';
    journalGhostList.appendChild(none);
  }
}
updateJournalGhostList();

// Tabキーで開閉。開くとポインターロックを解除してカーソルで操作できるようにし、閉じるときは自動で再ロックしてクリックし直さずに操作を続けられるようにする
function openJournal() {
  journalOpen = true;
  journalOverlay.style.display = 'flex';
  if (controls.isLocked) controls.unlock();
}
function closeJournal() {
  journalOpen = false;
  journalOverlay.style.display = 'none';
  if (!controls.isLocked) controls.lock();
}
function toggleJournal() {
  if (journalOpen) closeJournal(); else openJournal();
}

// マイクラ風のホットバー(3スロット固定。持ち物は最大3つまで。拾った順に左から並ぶ)
let heldOrder = []; // 拾った道具名を、拾った順に積んでいく
const toolIcons = { flashlight: '🔦', emf: '📡', thermometer: '🌡️', notebook: '📓', spiritbox: '📻', uv: '🔮', dots: '📽️' };
const hotbar = document.createElement('div');
hotbar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:10;';
document.body.appendChild(hotbar);
const hotbarSlots = Array.from({ length: 3 }, (_, i) => {
  const slot = document.createElement('div');
  slot.style.cssText = 'width:52px;height:52px;background:rgba(20,20,20,0.6);border:2px solid rgba(255,255,255,0.25);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px;position:relative;box-sizing:border-box;transition:border-color 0.1s;';
  const num = document.createElement('div');
  num.textContent = i + 1;
  num.style.cssText = 'position:absolute;top:1px;left:3px;font-size:10px;color:#ccc;font-family:monospace;';
  const icon = document.createElement('span');
  slot.appendChild(num);
  slot.appendChild(icon);
  hotbar.appendChild(slot);
  return { el: slot, icon };
});
function updateHotbar() {
  for (let i = 0; i < 3; i++) {
    const tool = heldOrder[i];
    hotbarSlots[i].icon.textContent = tool ? toolIcons[tool] : '';
    hotbarSlots[i].el.style.opacity = tool ? '1' : '0.35';
    const selected = tool && tool === currentTool;
    hotbarSlots[i].el.style.borderColor = selected ? '#fff' : 'rgba(255,255,255,0.25)';
    hotbarSlots[i].el.style.boxShadow = selected ? '0 0 6px rgba(255,255,255,0.8)' : 'none';
  }
}

let emfActive = false;
let thermometerActive = false;
let notebookActive = false;
let spiritBoxActive = false;
let uvActive = false;
let dotsActive = false;
let currentTool = null; // 'flashlight' / 'emf' / 'thermometer' / ...。持ち替えで切り替える
function toggleEMF() {
  if (!hasEMF) return;
  emfActive = !emfActive;
  if (!emfActive) emfDisplay.textContent = '';
}
function toggleThermometer() {
  if (!hasThermometer) return;
  thermometerActive = !thermometerActive;
  if (!thermometerActive) thermoDisplay.textContent = '';
}
function toggleNotebook() {
  if (!hasNotebook) return;
  notebookActive = !notebookActive;
  if (!notebookActive) notebookDisplay.textContent = '';
}
function toggleSpiritBox() {
  if (!hasSpiritBox) return;
  spiritBoxActive = !spiritBoxActive;
  if (!spiritBoxActive) spiritBoxDisplay.textContent = '';
}
function toggleUV() {
  if (!hasUV) return;
  uvActive = !uvActive;
}
function toggleDots() {
  if (!hasDots) return;
  dotsActive = !dotsActive;
  if (!dotsActive) dotsDisplay.textContent = '';
}
// 数字キー(1/2/3)やゲームパッドのL/Rから、持っている道具を直接選ぶ
function selectTool(tool) {
  currentTool = tool;
  // フラッシュライトは持ち替えても常時点灯のまま。それ以外は選んだときだけオンになる
  emfActive = (tool === 'emf');
  thermometerActive = (tool === 'thermometer');
  notebookActive = (tool === 'notebook');
  spiritBoxActive = (tool === 'spiritbox');
  uvActive = (tool === 'uv');
  dotsActive = (tool === 'dots');
  if (!emfActive) emfDisplay.textContent = '';
  if (!thermometerActive) thermoDisplay.textContent = '';
  if (!notebookActive) notebookDisplay.textContent = '';
  if (!spiritBoxActive) spiritBoxDisplay.textContent = '';
  if (!dotsActive) dotsDisplay.textContent = '';
  updateHotbar();
  updateViewmodel();
}
function switchTool() {
  if (heldOrder.length === 0) return;
  const idx = heldOrder.indexOf(currentTool);
  selectTool(heldOrder[(idx + 1) % heldOrder.length]);
}
function toggleCurrentTool() {
  if (currentTool === 'emf') {
    toggleEMF();
  } else if (currentTool === 'flashlight') {
    flashlight.intensity = flashlight.intensity > 0 ? 0 : 1.2;
  } else if (currentTool === 'thermometer') {
    toggleThermometer();
  } else if (currentTool === 'notebook') {
    toggleNotebook();
  } else if (currentTool === 'spiritbox') {
    toggleSpiritBox();
  } else if (currentTool === 'uv') {
    toggleUV();
  } else if (currentTool === 'dots') {
    toggleDots();
  }
}
// ハントに捕まったときの演出(血の画面)とリザルト画面
function makeBloodSplatterDataURL() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 8 + Math.random() * 42;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(120,0,0,${0.45 + Math.random() * 0.4})`);
    grad.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // 画面の上端から垂れる血の筋
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 512;
    const len = 70 + Math.random() * 170;
    const grad = ctx.createLinearGradient(x, 0, x, len);
    grad.addColorStop(0, 'rgba(100,0,0,0.85)');
    grad.addColorStop(1, 'rgba(100,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - (4 + Math.random() * 6), 0, 8 + Math.random() * 10, len);
  }
  return canvas.toDataURL();
}
const bloodOverlay = document.createElement('div');
bloodOverlay.style.cssText = `
  position:fixed; inset:0; z-index:95; pointer-events:none; opacity:0;
  transition: opacity 0.15s ease-in;
  background:
    radial-gradient(circle, rgba(90,0,0,0.05) 0%, rgba(60,0,0,0.55) 60%, rgba(15,0,0,0.92) 100%),
    url(${makeBloodSplatterDataURL()});
  background-size: cover;
`;
document.body.appendChild(bloodOverlay);

const resultOverlay = document.createElement('div');
resultOverlay.style.cssText = 'position:fixed;inset:0;z-index:96;display:none;align-items:center;justify-content:center;flex-direction:column;color:#eee;font-family:monospace;background:rgba(0,0,0,0.55);';
const resultTitle = document.createElement('div');
resultTitle.textContent = 'あなたは死亡しました';
resultTitle.style.cssText = 'font-size:34px;color:#ff4444;letter-spacing:4px;margin-bottom:18px;text-shadow:0 0 12px rgba(255,0,0,0.6);';
resultOverlay.appendChild(resultTitle);
const resultGhostText = document.createElement('div');
resultGhostText.style.cssText = 'font-size:16px;margin-bottom:6px;';
resultOverlay.appendChild(resultGhostText);
const resultTimeText = document.createElement('div');
resultTimeText.style.cssText = 'font-size:14px;color:#aaa;margin-bottom:28px;';
resultOverlay.appendChild(resultTimeText);
const resultLobbyBtn = document.createElement('button');
resultLobbyBtn.textContent = 'ロビーに戻る';
resultLobbyBtn.style.cssText = 'padding:12px 30px;font-size:15px;background:#3a7ad9;color:#fff;border:none;border-radius:6px;cursor:pointer;';
resultLobbyBtn.addEventListener('click', () => { window.location.href = 'lobby.html'; });
resultOverlay.appendChild(resultLobbyBtn);
document.body.appendChild(resultOverlay);

let gameStartTime = null; // 最初にポインターロックした時刻(生存時間の計算用)
let gameOver = false;
controls.addEventListener('lock', () => { if (gameStartTime === null) gameStartTime = performance.now(); });

function triggerDeath() {
  if (gameOver) return;
  gameOver = true;
  huntActive = false;
  controls.unlock();
  info.style.display = 'none';
  bloodOverlay.style.opacity = '1';
  setTimeout(() => {
    resultGhostText.textContent = `幽霊の正体: ${currentGhost.name}`;
    const survived = gameStartTime ? Math.max(0, Math.floor((performance.now() - gameStartTime) / 1000)) : 0;
    const mm = String(Math.floor(survived / 60)).padStart(2, '0');
    const ss = String(survived % 60).padStart(2, '0');
    resultTimeText.textContent = `生存時間: ${mm}:${ss}`;
    resultOverlay.style.display = 'flex';
  }, 1800);
}

// 特定(調査書の「特定」ボタン)を押したときのリザルト画面
const identifyResultOverlay = document.createElement('div');
identifyResultOverlay.style.cssText = 'position:fixed;inset:0;z-index:96;display:none;align-items:center;justify-content:center;flex-direction:column;color:#eee;font-family:monospace;background:rgba(0,0,0,0.75);';
const identifyResultTitle = document.createElement('div');
identifyResultTitle.style.cssText = 'font-size:30px;letter-spacing:3px;margin-bottom:18px;';
identifyResultOverlay.appendChild(identifyResultTitle);
const identifyResultDetail = document.createElement('div');
identifyResultDetail.style.cssText = 'font-size:15px;color:#ccc;margin-bottom:6px;line-height:1.8;white-space:pre-line;text-align:center;';
identifyResultOverlay.appendChild(identifyResultDetail);
const identifyResultReward = document.createElement('div');
identifyResultReward.style.cssText = 'font-size:26px;color:#ffd54a;margin:18px 0 28px;';
identifyResultOverlay.appendChild(identifyResultReward);
const identifyResultLobbyBtn = document.createElement('button');
identifyResultLobbyBtn.textContent = 'ロビーに戻る';
identifyResultLobbyBtn.style.cssText = 'padding:12px 30px;font-size:15px;background:#3a7ad9;color:#fff;border:none;border-radius:6px;cursor:pointer;';
identifyResultLobbyBtn.addEventListener('click', () => { window.location.href = 'lobby.html'; });
identifyResultOverlay.appendChild(identifyResultLobbyBtn);
document.body.appendChild(identifyResultOverlay);

// 正解かどうかと、特定にかかった時間から報酬額を計算する。
// 正解なら基本報酬(1000円)+速く特定できたほど増えるボーナス(10分以内なら最大+1200円、それ以降はボーナス無し)。
// 不正解でも、調査した分の参加料としてわずかに支払う
function calculateReward(correct, elapsedSeconds) {
  if (!correct) return 100;
  const speedBonus = Math.max(0, Math.round((600 - Math.min(elapsedSeconds, 600)) * 2));
  return 1000 + speedBonus;
}

function showIdentifyResult(correct, elapsedSeconds, reward) {
  if (gameOver) return;
  gameOver = true; // 特定が終わったらこの回のプレイは終了(ハントなども止める)
  huntActive = false;
  controls.unlock();
  info.style.display = 'none';

  identifyResultTitle.textContent = correct ? '特定成功!' : '特定失敗…';
  identifyResultTitle.style.color = correct ? '#7CFC9A' : '#ff6666';
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');
  identifyResultDetail.textContent =
    `幽霊の正体: ${currentGhost.name}\nあなたの回答: ${selectedGhostName}\n特定にかかった時間: ${mm}:${ss}`;
  identifyResultReward.textContent = `報酬: ¥${reward.toLocaleString()}`;
  identifyResultOverlay.style.display = 'flex';
}

const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameOver) return; // 死亡後はリザルト画面の「ロビーに戻る」以外の操作を受け付けない
  if (e.code === 'KeyE') toggleCurrentTool();
  if (e.code === 'Digit1' && heldOrder[0]) selectTool(heldOrder[0]);
  if (e.code === 'Digit2' && heldOrder[1]) selectTool(heldOrder[1]);
  if (e.code === 'Digit3' && heldOrder[2]) selectTool(heldOrder[2]);
  if (e.code === 'KeyQ') dropCurrentTool();
  if (e.code === 'KeyR') { e.preventDefault(); toggleJournal(); }
  if (e.code === 'KeyP') { e.preventDefault(); returnToLobby(); }
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

// 幽霊の部屋(hauntedRoom)の中だけ気温が下がる。「冷えた温度」を証拠に持つ幽霊のときだけ氷点下まで下がる
function temperatureAt(x, z, t) {
  const inHauntedRoom = x >= hauntedRoom.minX && x <= hauntedRoom.maxX && z >= hauntedRoom.minZ && z <= hauntedRoom.maxZ;
  const wobble = Math.sin(t * 0.6) * 0.4; // 表示がぴたっと止まって見えないよう、ごくゆっくり揺らす
  if (inHauntedRoom) {
    return (currentGhost.evidence.includes("冷えた温度") ? -1 : 13) + wobble;
  }
  return 19 + wobble;
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
  // 今いる階の部屋だけを表示する(階が違う部屋の外枠まで重ねて描くと見づらいため)
  const floorRooms = currentUpperFloor > 0
    ? rooms.filter(r => r.upperFloor === currentUpperFloor)
    : rooms.filter(r => !r.upperFloor);
  if (floorRooms.length === 0) return;

  // 表示範囲は家の寸法を直接持たず、今の階の部屋一覧の外接矩形から毎回計算する
  const boundsMinX = Math.min(...floorRooms.map(r => r.bounds.minX));
  const boundsMaxX = Math.max(...floorRooms.map(r => r.bounds.maxX));
  const boundsMinZ = Math.min(...floorRooms.map(r => r.bounds.minZ));
  const boundsMaxZ = Math.max(...floorRooms.map(r => r.bounds.maxZ));
  const scale = Math.min(
    (mapCanvas.width - pad * 2) / (boundsMaxX - boundsMinX),
    (mapCanvas.height - pad * 2) / (boundsMaxZ - boundsMinZ)
  );
  const toMapX = x => pad + (x - boundsMinX) * scale;
  const toMapY = z => pad + (boundsMaxZ - z) * scale;

  mapCtx.strokeStyle = '#0f0';
  mapCtx.lineWidth = 1;
  floorRooms.forEach(r => {
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
let sanityScreenTimer = 0;
let monitorTimer = 0;
let monitorCycleIndex = 0; // 監視カメラは毎回1台ずつ順番に描画する(全台同時だと負荷が増えるため)

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
      if (xPressed && !gpPrevButtons[2]) toggleCurrentTool();
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

      const dpadDownPressed = !!(pad.buttons[13] && pad.buttons[13].pressed);
      if (dpadDownPressed && !gpPrevButtons[13]) dropCurrentTool();
      gpPrevButtons[13] = dpadDownPressed;
    }

    if (collidesWithWalls(camera.position.x, camera.position.z)) {
      camera.position.x = prevX;
      camera.position.z = prevZ;
    }
    onFrameCallbacks.forEach(fn => fn(delta)); // マップ固有の毎フレーム処理(階段の昇り降りなど)
    const currentRoomName = getRoomAt(camera.position.x, camera.position.z);
    info.textContent = `現在の部屋: ${currentRoomName}`;
    mapCanvas.style.display = currentRoomName === "外" ? 'none' : 'block';

    mapUpdateTimer += delta;
    if (mapUpdateTimer > 0.1) {
      mapUpdateTimer = 0;
      if (currentRoomName !== "外") drawMap();
    }

    // 正気度: 家の中(地下含む。テントや屋外は対象外)にいる間、じわじわ減っていく
    if (currentRoomName !== "外") {
      sanity = Math.max(0, sanity - (100 / 300) * delta); // 約5分で0まで減る計算
    }
    sanityScreenTimer += delta;
    if (sanityScreenTimer > 0.5) {
      sanityScreenTimer = 0;
      drawSanityScreen(sanity);
    }

    // 扉を目標角度(開/閉)へ滑らかに近づける
    doors.forEach(door => {
      door.hinge.rotation.y += (door.targetRotation - door.hinge.rotation.y) * Math.min(1, delta * 6);
    });

    // 幽霊の移動(自分の部屋の中だけ徘徊。家具や壁はすり抜ける)
    // 通常は自分の部屋の中だけ徘徊。正気度が低くハント中はプレイヤーへ直進する
    if (huntActive) {
      const toPlayer = new THREE.Vector3().subVectors(camera.position, ghost.position);
      toPlayer.y = 0;
      if (toPlayer.length() > 0.1) {
        toPlayer.normalize();
        ghost.position.x += toPlayer.x * 2.2 * delta;
        ghost.position.z += toPlayer.z * 2.2 * delta;
      }
    } else {
      const toTarget = new THREE.Vector3().subVectors(ghostTarget, ghost.position);
      toTarget.y = 0;
      if (toTarget.length() < 0.2) {
        ghostTarget = randomPointInRoom(hauntedRoom);
      } else {
        toTarget.normalize();
        ghost.position.x += toTarget.x * 1.0 * delta;
        ghost.position.z += toTarget.z * 1.0 * delta;
      }
    }
    // ハント中はプレイヤーがいる階の高さに合わせて追ってくる(上の階にも、地下にも)
    let huntFloorY = 0;
    if (huntActive) {
      huntFloorY = currentUpperFloor > 0 ? upperFloorHeights[currentUpperFloor] : (onGroundFloor ? 0 : basementFloorY);
    }
    ghost.position.y = huntFloorY + 1.0 + Math.sin(clock.elapsedTime * 2) * 0.1;
    ghost.rotation.y += delta * 0.5;

    // 懐中電灯を向けると少しはっきり見える
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const toGhost = new THREE.Vector3().subVectors(ghost.position, camera.position);
    const ghostDist = toGhost.length();
    toGhost.normalize();
    const lookingAtGhost = camDir.angleTo(toGhost) < 0.3 && ghostDist < 6;

    // 正気度が30以下の間、幽霊がいつプレイヤーを襲ってきてもおかしくない状態にする
    if (sanity <= 30) {
      if (huntActive) {
        huntTimer -= delta;
        if (ghostDist < 1.0) {
          triggerDeath();
        } else if (huntTimer <= 0) {
          huntActive = false;
          ghostTarget = randomPointInRoom(hauntedRoom);
          if (exteriorDoor) exteriorDoor.locked = false; // ハント終了、玄関のロックを解除
        }
      } else {
        huntCheckTimer -= delta;
        if (huntCheckTimer <= 0) {
          huntCheckTimer = 1.5 + Math.random() * 2; // 1.5〜3.5秒ごとに判定するので、いつでも起こりうる
          const chance = 0.12 + (30 - sanity) / 30 * 0.38; // 正気度が低いほど発生しやすくなる(30で12%、0で50%)
          if (Math.random() < chance) {
            huntActive = true;
            huntTimer = 12;
            showPickupNotice('…気配がする…');
            if (exteriorDoor) { // 家の外に逃げられないよう、玄関を閉めてロックする
              exteriorDoor.isOpen = false;
              exteriorDoor.targetRotation = 0;
              exteriorDoor.locked = true;
            }
          }
        }
      }
    } else if (huntActive) {
      huntActive = false; // 正気度が30を超えていれば、進行中のハントも打ち切る
      if (exteriorDoor) exteriorDoor.locked = false;
    }

    ghostMaterial.opacity = huntActive ? 0.9 : (lookingAtGhost ? 0.75 : 0.35);

    if (pickupNoticeTimer > 0) {
      pickupNoticeTimer -= delta;
      if (pickupNoticeTimer <= 0) pickupNotice.textContent = '';
    }

    // EMFリーダー(Eキーでオン/オフ、入手済みの場合のみ)
    if (emfActive) {
      const level = emfLevelAt(ghostDist, currentGhost.evidence.includes("EMF5"));
      emfDisplay.textContent = `EMF: ${'★'.repeat(level)}${'・'.repeat(5 - level)} (Lv.${level})`;
      if (viewmodels.emf && viewmodels.emf.userData.leds) {
        viewmodels.emf.userData.leds.forEach((led, i) => led.material.color.set(i < level ? 0x44ff44 : 0x2a1010));
      }
    }

    // 温度計(持ち替え/3キーでオン、入手済みの場合のみ)
    if (thermometerActive) {
      const temp = temperatureAt(camera.position.x, camera.position.z, clock.elapsedTime);
      thermoDisplay.textContent = `温度: ${temp.toFixed(1)}°C${temp <= 0 ? ' (氷点下!)' : ''}`;
      if (viewmodels.thermometer && viewmodels.thermometer.userData.screenCanvas) {
        const canvas = viewmodels.thermometer.userData.screenCanvas;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a2a12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = temp <= 0 ? '#ff7a7a' : '#7fffa0';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${temp.toFixed(1)}°C`, canvas.width / 2, canvas.height / 2);
        viewmodels.thermometer.userData.screenTexture.needsUpdate = true;
      }
    }

    // ノート(ゴーストライティングが証拠の幽霊なら、幽霊のいる部屋に滞在した時間の合計で一度だけ書き込みが現れる)
    if (!notebookWritten && notebookTimer > 0) {
      const inHauntedRoomForNotebook = camera.position.x >= hauntedRoom.minX && camera.position.x <= hauntedRoom.maxX &&
        camera.position.z >= hauntedRoom.minZ && camera.position.z <= hauntedRoom.maxZ;
      if (inHauntedRoomForNotebook) {
        notebookTimer -= delta;
        if (notebookTimer <= 0 && currentGhost.evidence.includes("ゴーストライティング")) {
          notebookWritten = true;
          [viewmodels.notebook, notebookWorldMesh].forEach(m => {
            if (m && m.userData.pageCanvas) {
              drawNotebookPage(m.userData.pageCanvas, true);
              m.userData.pageTexture.needsUpdate = true;
            }
          });
        }
      }
    }
    if (notebookActive) {
      notebookDisplay.textContent = `ノート: ${notebookWritten ? '何か書かれている…' : '白紙'}`;
    }

    // スピリットボックス(Eキーでオン/オフ)。近く(6m以内)にいる間、数秒おきに雑音か応答が返る
    if (spiritBoxActive) {
      spiritBoxTimer -= delta;
      if (spiritBoxTimer <= 0) {
        spiritBoxTimer = 2 + Math.random() * 2;
        const canRespond = currentGhost.evidence.includes("スピリットボックス") && ghostDist < 6;
        if (canRespond && Math.random() < 0.5) {
          const word = spiritBoxWords[Math.floor(Math.random() * spiritBoxWords.length)];
          spiritBoxDisplay.textContent = `スピリットボックス: 「${word}」`;
        } else {
          spiritBoxDisplay.textContent = 'スピリットボックス: …ザザ…';
        }
      }
      if (viewmodels.spiritbox && viewmodels.spiritbox.userData.led) {
        viewmodels.spiritbox.userData.led.material.color.set(Math.random() < 0.5 ? 0xff2266 : 0x2a1010);
      }
    }

    // UVライト(指紋)。証拠が指紋の幽霊のときだけ、幽霊の部屋のドア(取っ手そば)にある手形がUVを当てると浮かび上がる
    if (fingerprintSpot) {
      const showFingerprint = uvActive && currentGhost.evidence.includes("指紋");
      fingerprintSpot.material.opacity = showFingerprint ? 0.85 : 0;
    }
    if (flashlight) {
      flashlight.color.set(uvActive ? 0x8a2be2 : 0xffeecc);
    }

    // D.O.T.S(懐中電灯のように前方へ向ける)。投光器の視界内に幽霊が入ると、体に緑の光点が浮かぶ
    if (dotsActive) {
      const dotsCanShow = currentGhost.evidence.includes("D.O.T.S") && lookingAtGhost && ghostDist < 5;
      ghostDotMarkers.forEach(dot => { dot.visible = dotsCanShow; });
      dotsDisplay.textContent = `D.O.T.S: ${dotsCanShow ? '反応あり' : '反応なし'}`;
    } else {
      ghostDotMarkers.forEach(dot => { dot.visible = false; });
    }

    updateHotbar();
    updateOrb(delta);
  }

  // 監視カメラの映像をモニターへ(負荷を抑えるため、1回のタイマーで1台ずつ順番に更新)。カメラが無いマップなら何もしない
  monitorTimer += delta;
  if (monitorTimer > 0.35 && videoCams.length > 0) {
    monitorTimer = 0;
    const cam = videoCams[monitorCycleIndex];
    renderer.setRenderTarget(cam.rt);
    renderer.render(scene, cam.camera);
    renderer.setRenderTarget(null);
    monitorCycleIndex = (monitorCycleIndex + 1) % videoCams.length;
  }

  renderer.render(scene, camera);
}
// マップ選択画面。今は「一軒家」の1つだけだが、今後マップを追加してもここに並べていくだけで済むようにしてある
const mapSelectOverlay = document.createElement('div');
mapSelectOverlay.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at center,#1a1a2a 0%,#000 100%);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:90;font-family:monospace;color:#eee;';
document.body.appendChild(mapSelectOverlay);

const mapSelectTitle = document.createElement('h1');
mapSelectTitle.textContent = 'マップを選択';
mapSelectTitle.style.cssText = 'font-size:20px;color:#9fd3ff;margin-bottom:20px;';
mapSelectOverlay.appendChild(mapSelectTitle);

const mapSelectGrid = document.createElement('div');
mapSelectGrid.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:720px;';
mapSelectOverlay.appendChild(mapSelectGrid);

function addMapCard(label, enabled, onSelect) {
  const card = document.createElement('div');
  card.style.cssText = `width:180px;height:130px;border-radius:6px;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;box-sizing:border-box;font-size:14px;border:1px solid ${enabled ? '#3a7ad9' : '#333'};background:${enabled ? '#14141c' : '#0a0a0e'};color:${enabled ? '#eee' : '#555'};cursor:${enabled ? 'pointer' : 'default'};`;
  card.textContent = label;
  if (enabled) {
    card.addEventListener('mouseenter', () => { card.style.background = '#1c2438'; });
    card.addEventListener('mouseleave', () => { card.style.background = '#14141c'; });
    card.addEventListener('click', onSelect);
  }
  mapSelectGrid.appendChild(card);
}


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// マップ選択画面でマップが選ばれたときに main.js から呼ぶ。マップの構築(build())は既にこの時点で終わっている前提。
// このクリックがそのままポインターロック開始の合図になる(別途「クリックで開始」は挟まない)ので、
// 部屋を巡回してシェーダー・影を温める処理もここで行う(選ばれなかった方のマップのぶんまで温める必要が無い)
function enterGame() {
  const savedX = camera.position.x, savedY = camera.position.y, savedZ = camera.position.z;
  const savedRotY = camera.rotation.y;
  const savedFlashIntensity = flashlight.intensity;
  flashlight.intensity = 1.2; // 影のシェーダーも温めるため、巡回中だけ点灯させておく

  rooms.forEach(r => {
    const b = r.bounds;
    camera.position.set((b.minX + b.maxX) / 2, savedY, (b.minZ + b.maxZ) / 2);
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(ry => {
      camera.rotation.y = ry;
      renderer.render(scene, camera);
    });
  });

  camera.position.set(savedX, savedY, savedZ);
  camera.rotation.y = savedRotY;
  flashlight.intensity = savedFlashIntensity;

  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  videoCams.forEach(cam => {
    renderer.setRenderTarget(cam.rt);
    renderer.render(scene, cam.camera);
  });
  renderer.setRenderTarget(null);

  mapSelectOverlay.style.display = 'none';
  info.style.display = 'block';
  controls.lock();
}

// マップ(main.js側)が、マップ選択への登録を全部終えた後に呼ぶ。
// この時点ではまだどのマップも構築されていない(選ばれてから初めてbuild()される)ので、
// ここでの「読み込み中」はページの初期化だけを指す。部屋を巡る本格的な温めはenterGame()側で行う
function startEngine() {
  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'position:fixed;inset:0;background:#000;color:#0f0;font-family:monospace;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:100;';
  loadingDiv.textContent = '読み込み中...';
  document.body.appendChild(loadingDiv);
  info.style.display = 'none';

  setTimeout(() => {
    loadingDiv.remove();
    mapSelectOverlay.style.display = 'flex';
    animate();
  }, 50);
}

// ==== マップ側(house-map.js)や main.js が使う、共通エンジンのAPI ====
export {
  THREE, mergeGeometries,
  scene, camera, renderer, controls, clock, info,
  rooms, room, getRoomAt, onGroundFloor,
  currentUpperFloor, upperFloorHeights, defineUpperFloor, setBuildingUpperFloor, setCurrentUpperFloor,
  wallBoxes, basementWallBoxes, doors, wallGeometries, doorFrameGeometries,
  wallHeight, wallThickness, doorWidth, doorHeight,
  wallMaterial, doorMaterial, doorFrameMaterial, doorHandleMaterial,
  addWallSegment, addFramedPlane, addMergedMesh, addWall, addDoor,
  addFurniture, addDetailMesh, addLeg, addLegsUnder, collidesWithWalls,
  makeWoodTexture, makeTileTexture, makeWallTexture, makeConcreteTexture, makeDoorTexture, makeGrassTexture, scaled,
  woodBase, tileBase, wallBase,
  woodFurnitureMaterial, ceramicMaterial, fabricMaterial, metalMaterial, mattressMaterial, handleMaterial, countertopMaterial,
  bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn,
  addSurveillanceCamera, videoCams,
  addPickupItem, pickupItems,
  makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool,
  notebookWorldMesh,
  showPickupNotice,
  sanity, drawSanityScreen, sanityTexture,
  addRoomLight, addLightSwitch, lightSwitches, updateRoomLightCulling,
  breakerOn, registerBreaker, setBreakerOn, setBasementFloorY,
  ghostTypes, initHaunting, setExteriorDoor, setOrbRoom, currentGhost, hauntedRoom, ghost,
  onFrame,
  addMapCard, startEngine, enterGame,
  setOnGroundFloor, setNotebookWorldMesh,
};
