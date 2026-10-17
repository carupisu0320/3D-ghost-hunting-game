// 壁・ドア・当たり判定。壁やドアの材質・形・作り方は、ここにある(Sunny Meadows のドアや壁の雰囲気を変えるときは、このファイル)。
// engine.js から分けたファイル。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scaled, wallBase, makeDoorTexture } from './textures.js';
import { buildingUpperFloor, upperFloorHeights, upperFloorWallBoxes, scene, currentUpperFloor, onGroundFloor } from './scene.js';

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
      hinge, axis: 'x', isOpen: false, targetRotation: 0, locked: false, upperFloor: buildingUpperFloor,
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
      hinge, axis: 'z', isOpen: false, targetRotation: 0, locked: false, upperFloor: buildingUpperFloor,
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

export { wallBoxes, doors, doorWidth, doorHeight, wallThickness, collidesWithWalls, basementWallBoxes, wallGeometries, doorFrameGeometries, wallHeight, wallMaterial, doorMaterial, doorFrameMaterial, doorHandleMaterial, addWallSegment, addMergedMesh, addWall, addDoor };
