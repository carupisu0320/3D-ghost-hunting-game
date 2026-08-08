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
  if (!onGroundFloor) return "地下室";
  return rooms.find(r =>
    x >= r.bounds.minX && x <= r.bounds.maxX &&
    z >= r.bounds.minZ && z <= r.bounds.maxZ
  )?.name ?? "外";
}

// 地下室・階段の寸法(1階の床=Y0、地下の床=basementFloorY)。階段は納戸の東側(壁際、家具・ドアを避けた位置)を使う
const basement = { minX: 0, maxX: 6.4, minZ: 9.8, maxZ: 12.6 }; // 廊下+納戸の直下
const basementFloorY = -2.4;
const basementWallHeight = 2.4;
const stairs = { minX: 5.2, maxX: 6.0, topZ: 12.5, bottomZ: 10.3, steps: 10 };

let onGroundFloor = true; // 階段を上り下りして今いる階を判定するためのフラグ

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
camera.position.set(5.8, 1.6, 31.4); // テント内部、反転後の入口を入ってすぐの位置からスタート
camera.rotation.y = -Math.PI / 2; // テーブル・モニターのある奥(+X側)を向く

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

// 壁・ドア(描画は最後にまとめて1メッシュずつに結合する。当たり判定は今まで通りwallBoxesで個別管理)
const wallBoxes = [];
const basementWallBoxes = []; // 地下室の壁(1階にいる間は無視する)
const wallGeometries = [];
const doorPanelGeometries = [];
const doorFrameGeometries = [];
const doorHandleGeometries = [];
const wallHeight = 3;
const wallThickness = 0.2;
const doorWidth = 1.2;
const doorHeight = 2.1;
const wallMaterial = new THREE.MeshLambertMaterial({ map: scaled(wallBase, 4, 2) });
const doorMaterial = new THREE.MeshLambertMaterial({ map: scaled(makeDoorTexture(), 1, 1) });
const doorFrameMaterial = new THREE.MeshLambertMaterial({ color: 0x3d2b1a });
const doorHandleMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

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
  const boxes = onGroundFloor ? wallBoxes : basementWallBoxes;
  return boxes.some(b =>
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
let breakerOn = false; // ゲーム開始時は電気が落ちている想定(地下で入れるまで家中真っ暗)
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
  lightSwitches.forEach(sw => {
    sw.light.visible = sw.on && breakerOn;
    sw.fixtureMat.emissiveIntensity = (sw.on && breakerOn) ? 1.2 : 0;
  });
  basementLight.visible = breakerOn;
  basementFixtureMat.emissiveIntensity = breakerOn ? 1.2 : 0;
  breakerLeverMat.color.set(breakerOn ? 0x2f6b2f : 0x552222);
  breakerLeverMat.emissive.set(breakerOn ? 0x113311 : 0x220000);
}

// 階段の範囲にいればYを補間し、いなければ現在の階の高さに合わせる
function updateFloorHeight() {
  const x = camera.position.x, z = camera.position.z;
  const inStairs = x >= stairs.minX && x <= stairs.maxX && z <= stairs.topZ && z >= stairs.bottomZ;
  if (inStairs) {
    const t = (stairs.topZ - z) / (stairs.topZ - stairs.bottomZ); // 0(上)〜1(下)
    camera.position.y = basementFloorY * t + 1.6;
    onGroundFloor = t < 0.5;
  } else {
    camera.position.y = (onGroundFloor ? 0 : basementFloorY) + 1.6;
  }
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

// 拠点のテント(懐中電灯・EMFリーダーはここで拾うまで使えない)
let hasFlashlight = false;
let hasEMF = false;
let hasThermometer = false;
let hasNotebook = false;
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

  // テーブルは奥の壁際(+X側)に設置
  const tableX = tentX + depth / 2 - 0.6;
  const tableMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 1.4), tableMat);
  table.position.set(tableX, 0.375, tentZ);
  table.castShadow = true;
  table.receiveShadow = true;
  scene.add(table);
  wallBoxes.push({ minX: tableX - 0.3, maxX: tableX + 0.3, minZ: tentZ - 0.7, maxZ: tentZ + 0.7 });

  // 道具はテーブルの上に、左右に並べて置く
  const flashlightMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const flashlightItem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 8), flashlightMat);
  flashlightItem.rotation.x = Math.PI / 2;
  flashlightItem.position.y = 0.75 + 0.04;
  addPickupItem(tableX, tentZ - 0.4, flashlightItem, () => {
    hasFlashlight = true;
    heldOrder.push('flashlight');
    flashlight.intensity = 1.2;
    currentTool = 'flashlight';
    showPickupNotice('懐中電灯を入手した');
  });

  const emfMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const emfItem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), emfMat);
  emfItem.position.y = 0.75 + 0.1;
  addPickupItem(tableX, tentZ + 0.4, emfItem, () => {
    hasEMF = true;
    heldOrder.push('emf');
    currentTool = 'emf';
    emfActive = true;
    showPickupNotice('EMFリーダーを入手した');
  });

  // 温度計はテーブル中央(懐中電灯とEMFの間)に置く
  const thermoItem = new THREE.Group();
  const thermoTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
  const thermoBulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x330000, emissiveIntensity: 0.3 }));
  thermoBulb.position.y = -0.1;
  thermoItem.add(thermoTube, thermoBulb);
  thermoItem.position.y = 0.75 + 0.12;
  addPickupItem(tableX, tentZ, thermoItem, () => {
    hasThermometer = true;
    heldOrder.push('thermometer');
    currentTool = 'thermometer';
    thermometerActive = true;
    showPickupNotice('温度計を入手した');
  });

  // ノート(ゴーストライティング用)は懐中電灯・EMFと同じ収集物として、テーブルの端に置く
  const notebookItem = new THREE.Group();
  const notebookCover = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.18), new THREE.MeshLambertMaterial({ color: 0x5a2a2a }));
  const notebookPages = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.16), new THREE.MeshLambertMaterial({ color: 0xf2ecd8 }));
  notebookPages.position.y = -0.005;
  notebookItem.add(notebookCover, notebookPages);
  notebookItem.position.y = 0.75 + 0.03;
  addPickupItem(tableX, tentZ + 0.6, notebookItem, () => {
    hasNotebook = true;
    heldOrder.push('notebook');
    currentTool = 'notebook';
    notebookActive = true;
    showPickupNotice('ノートを入手した');
  });

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

  // テント入口(-X側)から玄関の扉まで、道の両脇に4本立てる
  const pathStands = [
    { x: 3.30, z: 29.03 },
    { x: 4.68, z: 25.27 },
    { x: 1.77, z: 22.53 },
    { x: 3.15, z: 18.77 },
  ];
  const pathFacing = -2.9111; // テント側から玄関側を向く角度(ラジアン)
  pathStands.forEach(p => addWorkLight(p.x, p.z, pathFacing));
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
  { name: "Wraith", evidence: ["EMF5", "オーブ", "冷えた温度"] },
  { name: "Poltergeist", evidence: ["スピリットボックス", "ゴーストライティング", "冷えた温度"] },
];
const currentGhost = ghostTypes[Math.floor(Math.random() * ghostTypes.length)];
const hauntableRooms = rooms.filter(r => r.name !== "廊下" && r.name !== "Pantry" && r.name !== "納戸"); // 納戸は階段の穴があるため除外
const hauntedRoom = hauntableRooms[Math.floor(Math.random() * hauntableRooms.length)].bounds;
console.log("[デバッグ] 幽霊の種類:", currentGhost.name, "証拠:", currentGhost.evidence);

// ノートへの書き込み(ゴーストライティングが証拠の幽霊だけ、しばらく持ち歩くと一度だけ書かれる)
let notebookWritten = false;
let notebookTimer = 15 + Math.random() * 30; // 15〜45秒後に一度だけ判定

function randomPointInRoom(r, margin = 0.6) {
  return new THREE.Vector3(
    r.minX + margin + Math.random() * Math.max(0.1, r.maxX - r.minX - margin * 2),
    1.0,
    r.minZ + margin + Math.random() * Math.max(0.1, r.maxZ - r.minZ - margin * 2)
  );
}

const ghostMaterial = new THREE.MeshLambertMaterial({
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

  const fixtureMat = new THREE.MeshLambertMaterial({
    color: 0xfff6d8, emissive: 0xfff6d8, emissiveIntensity: 1.2
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
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0x554400, emissiveIntensity: 0.5 });
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
applyBreakerState(); // 開始時点ではbreakerOnがfalseなので、家中の照明がここで消灯される

// スイッチ・ブレーカーに近づいてクリックするとON/OFF切り替え(天井照明ごと)
function tryInteract() {
  const heldCount = (hasFlashlight ? 1 : 0) + (hasEMF ? 1 : 0) + (hasThermometer ? 1 : 0) + (hasNotebook ? 1 : 0);
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

  const dbx = camera.position.x - breakerBox.x, dbz = camera.position.z - breakerBox.z;
  if (Math.sqrt(dbx * dbx + dbz * dbz) < 1.2) {
    breakerOn = !breakerOn;
    applyBreakerState();
    showPickupNotice(breakerOn ? 'ブレーカーを入れた' : 'ブレーカーを落とした');
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
    nearest.light.visible = nearest.on && breakerOn;
    nearest.fixtureMat.emissiveIntensity = (nearest.on && breakerOn) ? 1.2 : 0;
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

const controls = new PointerLockControls(camera, document.body);
const info = document.getElementById('info');
info.addEventListener('click', () => controls.lock());
controls.addEventListener('unlock', () => { info.textContent = 'クリックで開始'; });

const emfDisplay = document.createElement('div');
emfDisplay.style.cssText = 'position:fixed;top:32px;left:8px;color:#0f0;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(emfDisplay);

const thermoDisplay = document.createElement('div');
thermoDisplay.style.cssText = 'position:fixed;top:52px;left:8px;color:#0ff;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(thermoDisplay);

const notebookDisplay = document.createElement('div');
notebookDisplay.style.cssText = 'position:fixed;top:72px;left:8px;color:#e8c060;font-family:monospace;font-size:14px;z-index:10;';
document.body.appendChild(notebookDisplay);

// マイクラ風のホットバー(3スロット固定。持ち物は最大3つまで。拾った順に左から並ぶ)
let heldOrder = []; // 拾った道具名を、拾った順に積んでいく
const toolIcons = { flashlight: '🔦', emf: '📡', thermometer: '🌡️', notebook: '📓' };
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
let currentTool = null; // 'flashlight' / 'emf' / 'thermometer'。持ち替えで切り替える
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
// 数字キー(1/2/3)やゲームパッドのL/Rから、持っている道具を直接選ぶ
function selectTool(tool) {
  currentTool = tool;
  // フラッシュライトは持ち替えても常時点灯のまま。EMF・温度計・ノートは選んだときだけオンになる
  emfActive = (tool === 'emf');
  thermometerActive = (tool === 'thermometer');
  notebookActive = (tool === 'notebook');
  if (!emfActive) emfDisplay.textContent = '';
  if (!thermometerActive) thermoDisplay.textContent = '';
  if (!notebookActive) notebookDisplay.textContent = '';
  updateHotbar();
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
  }
}
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') toggleCurrentTool();
  if (e.code === 'Digit1' && heldOrder[0]) selectTool(heldOrder[0]);
  if (e.code === 'Digit2' && heldOrder[1]) selectTool(heldOrder[1]);
  if (e.code === 'Digit3' && heldOrder[2]) selectTool(heldOrder[2]);
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
    updateFloorHeight(); // 階段の範囲にいればYを補間し、onGroundFloorも更新する
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

    // 温度計(持ち替え/3キーでオン、入手済みの場合のみ)
    if (thermometerActive) {
      const temp = temperatureAt(camera.position.x, camera.position.z, clock.elapsedTime);
      thermoDisplay.textContent = `温度: ${temp.toFixed(1)}°C${temp <= 0 ? ' (氷点下!)' : ''}`;
    }

    // ノート(ゴーストライティングが証拠の幽霊なら、時間経過で一度だけ書き込みが現れる)
    if (!notebookWritten && notebookTimer > 0) {
      notebookTimer -= delta;
      if (notebookTimer <= 0 && currentGhost.evidence.includes("ゴーストライティング")) {
        notebookWritten = true;
      }
    }
    if (notebookActive) {
      notebookDisplay.textContent = `ノート: ${notebookWritten ? '何か書かれている…' : '白紙'}`;
    }

    updateHotbar();
    updateOrb(delta);
  }

  // 監視カメラの映像をモニターへ(負荷を抑えるため、1回のタイマーで1台ずつ順番に更新)
  monitorTimer += delta;
  if (monitorTimer > 0.35) {
    monitorTimer = 0;
    const cam = videoCams[monitorCycleIndex];
    renderer.setRenderTarget(cam.rt);
    renderer.render(scene, cam.camera);
    renderer.setRenderTarget(null);
    monitorCycleIndex = (monitorCycleIndex + 1) % videoCams.length;
  }

  renderer.render(scene, camera);
}
// 起動時に一度、家全体を巡回しながら描画しておく(影を含めた準備を済ませ、プレイ中のカクつきを減らす)
const loadingDiv = document.createElement('div');
loadingDiv.style.cssText = 'position:fixed;inset:0;background:#000;color:#0f0;font-family:monospace;font-size:20px;display:flex;align-items:center;justify-content:center;z-index:100;';
loadingDiv.textContent = '読み込み中...';
document.body.appendChild(loadingDiv);
info.style.display = 'none';

setTimeout(() => {
  const savedX = camera.position.x, savedY = camera.position.y, savedZ = camera.position.z;
  const savedRotY = camera.rotation.y;
  const savedFlashIntensity = flashlight.intensity;
  flashlight.intensity = 1.2; // 影のシェーダーも温めるため、巡回中だけ点灯させておく

  const warmupRoomNames = [
    "Living Dining Kitchen", "Master Bed Room", "浴室・洗面", "トイレ",
    "Bed Room(4.5畳)", "Bed Room(5.0畳)", "玄関", "納戸", "W.I.C", "廊下"
  ];
  warmupRoomNames.forEach(name => {
    const r = room(name);
    camera.position.set((r.minX + r.maxX) / 2, 1.6, (r.minZ + r.maxZ) / 2);
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

  loadingDiv.remove();
  info.style.display = 'block';
  animate();
}, 50);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
