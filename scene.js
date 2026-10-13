// 場面の土台: 部屋の一覧・階の管理・scene / camera / renderer(engine.js から分けたファイル)。
// ここは、ほかのファイルを import しない(一番下の層)。
import * as THREE from 'three';

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
// 回転の順番は「左右の向き → 上下の向き」(YXZ)にする(ロビーのカメラと同じ)。
// 初期設定(XYZ)のままだと、上や下を向いたままコントローラーのスティックで左右に振り向くと、画面が傾いてしまう。
// また、オンラインで他のプレイヤーへ送る「向き」(camera.rotation.y)が、上下を向いているときにずれてしまうのも、これで直る
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // 一番軽い影の種類に変更
document.body.appendChild(renderer.domElement);

// ESモジュールではimportした変数に直接代入できないため、マップ側から書き換えたい状態はセッター経由にする
function setOnGroundFloor(v) { onGroundFloor = v; }

export { buildingUpperFloor, upperFloorHeights, upperFloorWallBoxes, scene, currentUpperFloor, onGroundFloor, room, camera, rooms, getRoomAt, renderer, defineUpperFloor, setBuildingUpperFloor, setCurrentUpperFloor, addFramedPlane, setOnGroundFloor };
