// 家具の材質と、ベッド・ソファ・トイレなどの家具の作り方。engine.js から分けたファイル。　
import * as THREE from 'three';
import { scaled, makeWoodTexture } from './textures.js';
import { buildingUpperFloor, upperFloorHeights, scene, room, upperFloorWallBoxes } from './scene.js';
import { wallBoxes } from './walls.js';

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
  const floorY = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, floorY + y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
// 脚(円柱)。ベッド・ソファ・カウンター・冷蔵庫などの「浮いている感」をなくす細部パーツ
function addLeg(x, y, z, radius, height, material = woodFurnitureMaterial) {
  const floorY = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, height, 8), material);
  mesh.position.set(x, floorY + y + height / 2, z);
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
// 見た目のメッシュは自前で作りたいが、当たり判定だけは「今組み立てている階」に正しく登録したい場合に使う
// (addFurnitureと同じ振り分けルールを、矩形の当たり判定だけ単独で使えるようにしたもの)
function pushWallBox(box) {
  if (buildingUpperFloor > 0) {
    upperFloorWallBoxes[buildingUpperFloor].push(box);
  } else {
    wallBoxes.push(box);
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
  const floorY = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  addLeg(x, 0, z, 0.035, h * 0.55, ceramicMaterial); // 中央の支柱
  addFurniture(x, z, w, d, h, ceramicMaterial);
  const basinR = Math.min(w, d) * 0.36;
  addDetailMesh(x, h + 0.02, z, w - 0.04, 0.04, d - 0.04, ceramicMaterial); // 天板
  const basinRim = new THREE.Mesh(new THREE.CylinderGeometry(basinR, basinR * 0.9, 0.05, 16), ceramicMaterial);
  basinRim.position.set(x, floorY + h + 0.035, z);
  basinRim.receiveShadow = true;
  scene.add(basinRim);
  const basinWell = new THREE.Mesh(new THREE.CylinderGeometry(basinR * 0.78, basinR * 0.6, 0.04, 16), new THREE.MeshLambertMaterial({ color: 0xd8d6ce }));
  basinWell.position.set(x, floorY + h + 0.025, z);
  basinWell.receiveShadow = true;
  scene.add(basinWell);
  addDetailMesh(x, h + 0.18, z - d / 2 + 0.06, 0.03, 0.22, 0.03, metalMaterial); // 蛇口の柱
  addDetailMesh(x, h + 0.27, z - d / 2 + 0.14, 0.03, 0.03, 0.14, metalMaterial); // 蛇口の口
}

// トイレ = ボウル(当たり判定あり) + 座面リング + 蓋 + 背面のタンク + 洗浄レバー(見た目のみ)
function toiletIn(name, dx, dz) {
  const r = room(name);
  const x = r.minX + dx, z = r.minZ + dz;
  const floorY = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const bowlW = 0.38, bowlD = 0.48, bowlH = 0.38;
  addFurniture(x, z, bowlW, bowlD, bowlH, ceramicMaterial);
  // 座面リング(楕円に近づけるため薄い円柱)+ 蓋(少し立て掛けた板)
  const seatRing = new THREE.Mesh(new THREE.CylinderGeometry(bowlW * 0.52, bowlW * 0.5, 0.03, 16), ceramicMaterial);
  seatRing.position.set(x, floorY + bowlH + 0.02, z + bowlD * 0.05);
  seatRing.scale.z = bowlD / bowlW * 1.05;
  seatRing.receiveShadow = true;
  scene.add(seatRing);
  addDetailMesh(x, bowlH + 0.045, z - bowlD * 0.32, bowlW * 0.9, 0.025, bowlD * 0.55, ceramicMaterial); // 蓋
  const tankH = 0.32;
  addDetailMesh(x, bowlH + tankH / 2, z - bowlD / 2 + 0.09, bowlW + 0.02, tankH, 0.16, ceramicMaterial);
  addDetailMesh(x + bowlW * 0.3, bowlH + tankH - 0.05, z - bowlD / 2 + 0.02, 0.05, 0.02, 0.03, metalMaterial); // 洗浄レバー
}

export { addFurniture, addDetailMesh, addLeg, addLegsUnder, pushWallBox, woodFurnitureMaterial, ceramicMaterial, fabricMaterial, metalMaterial, mattressMaterial, handleMaterial, countertopMaterial, bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn };
