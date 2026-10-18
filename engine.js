import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh,
  createPegboard, toolNames, toolIcons, viewmodelBase, viewmodelOverrides,
} from './tool-models.js'; // 道具の見た目とペグボード(ロビーと共有)
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
// ---- engine.js から分けたファイル(engine/ フォルダ)。このファイルは、それらを使って、残りの仕組みを組み立てる ----
import { scene, camera, renderer, rooms, room, getRoomAt, onGroundFloor, currentUpperFloor, upperFloorHeights, defineUpperFloor, setBuildingUpperFloor, setCurrentUpperFloor, addFramedPlane, setOnGroundFloor, buildingUpperFloor } from './engine/scene.js';
import { makeWoodTexture, makeTileTexture, makeWallTexture, makeConcreteTexture, makeDoorTexture, makeGrassTexture, scaled, woodBase, tileBase, wallBase, makeFingerprintTexture, makeGlowTexture } from './engine/textures.js';
import { wallBoxes, basementWallBoxes, doors, wallGeometries, doorFrameGeometries, wallHeight, wallThickness, doorWidth, doorHeight, wallMaterial, doorMaterial, doorFrameMaterial, doorHandleMaterial, addWallSegment, addMergedMesh, addWall, addDoor, collidesWithWalls } from './engine/walls.js';
import { addFurniture, addDetailMesh, addLeg, addLegsUnder, pushWallBox, woodFurnitureMaterial, ceramicMaterial, fabricMaterial, metalMaterial, mattressMaterial, handleMaterial, countertopMaterial, bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn } from './engine/furniture.js';
import { ghostTypes, DIFFICULTIES } from './engine/ghost-data.js';
import { createPauseMenu } from './pause-menu.js';
import { thirdPersonPosition } from './third-person.js';
import { loadSkin, createSkinAvatar, createPlaceholderAvatar } from './skins.js'; // 三人称のときに見せる、自分の体
import { normalizeSkinId } from './skin-catalog.js';
import { randomPointInRoom, calculateReward, rewardBreakdown, formatTime, deadzone, emfLevelAt } from './engine/calc.js';
import { makeNotebookItemMesh, drawNotebookPage, makeBloodSplatterDataURL } from './engine/art.js';
import { mapSelectOverlay, addMapCard } from './engine/map-select.js';

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
// ハントが続く長さ(秒)。始まるたびに、この範囲のランダムな長さが選ばれる
const HUNT_MIN_SECONDS = 10, HUNT_MAX_SECONDS = 60;
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
// 画面の左下に出る正気度のバー(60%以下で橙、30%以下で赤く点滅)
const sanityHud = document.createElement('div');
sanityHud.className = 'gh-sanity-hud';
const sanityHudFill = document.createElement('div');
sanityHudFill.className = 'gh-sanity-fill';
const sanityHudText = document.createElement('div');
sanityHudText.className = 'gh-sanity-text';
sanityHud.append(sanityHudFill, sanityHudText);
document.body.appendChild(sanityHud);
function updateSanityHud(value) {
  const v = Math.max(0, Math.min(100, value));
  sanityHudFill.style.width = `${v}%`;
  sanityHudText.textContent = `正気度 ${Math.round(v)}%`;
  sanityHud.classList.toggle('is-mid', v <= 60 && v > 30);
  sanityHud.classList.toggle('is-low', v <= 30);
  sanityHud.classList.toggle('is-visible', gameEntered && !gameOver);
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
// カメラ映像を1台ぶん描き直す間隔(秒)。小さいほど映像がなめらかになるが、そのぶん重くなる(以前は0.35)
const MONITOR_INTERVAL = 0.12;

function addSurveillanceCamera(roomName, floorY = 0) {
  const r = room(roomName);
  const rt = new THREE.WebGLRenderTarget(192, 144);
  const material = new THREE.MeshBasicMaterial({ map: rt.texture });
  const cam = new THREE.PerspectiveCamera(60, 256 / 192, 0.1, 30);
  cam.layers.enable(1);
  cam.position.set(r.minX + 1.0, floorY + 2.4, r.minZ + 1.0);
  cam.lookAt(r.maxX - 1.0, floorY + 1.0, r.maxZ - 1.0);
  scene.add(cam);
  videoCams.push({ camera: cam, rt, material, roomName });
}

// 各道具の「置き場の面から自分の原点までの高さ」。テーブル(0.75)でも床(0)でも、この分だけ浮かせて自然に載せる
const toolRestOffset = { flashlight: 0.04, emf: 0.1, thermometer: 0.005, notebook: 0.03, spiritbox: 0, uv: 0, dots: 0.045 };
const toolMeshMakers = { flashlight: makeFlashlightItemMesh, emf: makeEMFItemMesh, thermometer: makeThermoItemMesh, notebook: makeNotebookItemMesh, spiritbox: makeSpiritBoxItemMesh, uv: makeUVItemMesh, dots: makeDotsItemMesh };

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

// 持っている道具の数(インベントリは3つまで)
function countHeldTools() {
  return (hasFlashlight ? 1 : 0) + (hasEMF ? 1 : 0) + (hasThermometer ? 1 : 0) + (hasNotebook ? 1 : 0) +
    (hasSpiritBox ? 1 : 0) + (hasUV ? 1 : 0) + (hasDots ? 1 : 0);
}

// その道具をすでに持っているか(ペグボードには同じ道具が複数掛かっているので、重ねて取らないための判定)
function isToolHeld(tool) {
  return { flashlight: hasFlashlight, emf: hasEMF, thermometer: hasThermometer, notebook: hasNotebook,
    spiritbox: hasSpiritBox, uv: hasUV, dots: hasDots }[tool] === true;
}

// 壁掛けの道具置き場(ペグボード)。道具を壁に掛けて並べ、視線を向けてクリックすると、その道具が取れる。
//   x, z   : ボードの前面の中心(壁の面の位置)
//   rotY   : ボードの前(部屋の側)を向ける回転。0なら+Z側が前、-Math.PI/2なら-X側が前(東の壁に付けるとき)
//   length : 壁に沿った長さ(m)、baseY: ボード下端の高さ、height: ボードの高さ
//   tools  : 掛ける道具の名前の配列(flashlight, emf, thermometer, spiritbox, uv, dots)。左から順に並ぶ
//   copies : 1種類あたりの数(1〜4)。2列×2段のかたまりで掛ける(4個なら4人が1つずつ取れる)
function addToolPegboard({ x, z, rotY, length = 3.6, baseY = 0.5, height = 1.0, tools, copies = 4 }) {
  // ボードと道具の形・並べ方は、ロビーと共有の tool-models.js(createPegboard)が作る。ここでは、それをシーンに足して、拾えるようにするだけ
  const woodMaterial = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
  const { group, items } = createPegboard({ x, z, rotY, length, baseY, height, tools, copies, woodMaterial });
  scene.add(group);
  items.forEach((it) => {
    scene.add(it.mesh);
    pickupItems.push({ x: it.center.x, z: it.center.z, mesh: it.mesh, collected: false, onCollect: () => collectTool(it.tool), gaze: true, center: it.center, tool: it.tool });
  });
}

// 壁掛けの道具のうち、今画面の中央(視線)の先にあるものを返す(1.8m以内、約12度以内。なければnull)
const _gazeDir = new THREE.Vector3(), _gazeTo = new THREE.Vector3();
function findGazePickup() {
  camera.getWorldDirection(_gazeDir);
  let best = null, bestAngle = 0.22;
  for (const item of pickupItems) {
    if (item.collected || !item.gaze) continue;
    _gazeTo.copy(item.center).sub(camera.position);
    if (_gazeTo.length() > 1.8) continue;
    const angle = _gazeDir.angleTo(_gazeTo.normalize());
    if (angle < bestAngle) { bestAngle = angle; best = item; }
  }
  return best;
}
// 視線の先に取れる道具があるとき、画面に名前を出す
let gazeHintEl = null;
function updateGazeHint() {
  if (!pickupItems.some(i => i.gaze && !i.collected)) { if (gazeHintEl) gazeHintEl.style.display = 'none'; return; }
  if (!gazeHintEl) {
    gazeHintEl = document.createElement('div');
    gazeHintEl.className = 'gh-gaze-hint';
    document.body.appendChild(gazeHintEl);
  }
  const item = inControl() ? findGazePickup() : null;
  if (!item) { gazeHintEl.style.display = 'none'; return; }
  gazeHintEl.textContent = toolNames[item.tool] + (isToolHeld(item.tool) ? '(すでに持っている)' : countHeldTools() >= 3 ? '(持ち物がいっぱい)' : (pollGamepad() ? '(Yボタンで取る)' : '(クリックで取る)'));
  gazeHintEl.style.display = 'block';
}

// 今持っている道具を、今いるその場に置いて手放す(Qキー/ゲームパッド十字キー下)
function dropCurrentTool() {
  if (!currentTool) return;
  const tool = currentTool;
  if (tool === 'flashlight') { hasFlashlight = false; flashlight.intensity = 0; }
  else if (tool === 'emf') { hasEMF = false; emfActive = false; }
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
  const dropped = pickupItems[pickupItems.length - 1];
  dropped.netId = `d${net ? net.myId() : 'me'}-${++dropCounter}`; // 置いた道具の目印(ほかの人の画面でも、同じ道具として拾えるように)
  netWorld({ kind: 'drop', id: dropped.netId, tool, x: dropped.x, z: dropped.z, y: mesh.position.y });

  if (heldOrder.length > 0) {
    selectTool(heldOrder[0]);
  } else {
    currentTool = null;
    updateHotbar();
  }
  updateViewmodel();
  showPickupNotice(`${toolNames[tool]}を置いた`);
}


// 左上の黄色い通知(道具を入手した・ブレーカーが落ちた など)は、画面をすっきりさせるため、出さないことにした。
// 呼び出しは残してあるので、必要になったら、ここで別の見せ方(中央に小さく出す、など)に戻せる
function showPickupNotice() {}

// 扉が開く向き。扉はプレイヤーから遠ざかる側へ開く(1 か -1。hinge.rotation.y の符号)。
// x軸の扉(板がx方向): +回転は -z 側へ振れる → プレイヤーが +z 側なら 1。z軸の扉(板がz方向): +回転は +x 側へ振れる → プレイヤーが -x 側なら 1
function doorOpenDir(door) {
  if (door.axis === 'x') return camera.position.z >= door.center.z ? 1 : -1;
  return camera.position.x <= door.center.x ? 1 : -1;
}

// 画面中央の通知(いまは「ドアが開かない」だけ)。一定時間で消える
const centerNotice = document.createElement('div');
centerNotice.className = 'gh-center-notice';
document.body.appendChild(centerNotice);
let centerNoticeTimer = null;
function showCenterNotice(text) {
  centerNotice.textContent = text;
  centerNotice.classList.add('is-visible');
  clearTimeout(centerNoticeTimer);
  centerNoticeTimer = setTimeout(() => centerNotice.classList.remove('is-visible'), 1500);
}

// ハント中、視界の端が赤く点滅する
const huntVignette = document.createElement('div');
huntVignette.className = 'gh-hunt-vignette';
document.body.appendChild(huntVignette);
function updateHuntVignette() {
  huntVignette.classList.toggle('is-active', huntActive && !gameOver);
}

// ノートへの書き込み(ゴーストライティングが証拠の幽霊だけ、幽霊のいる部屋に合計15〜45秒いると一度だけ書かれる)
let notebookWritten = false;
let notebookTimer = 15 + Math.random() * 30;

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

// 低確率で、幽霊の見た目がカプセル型ではなく、寝転がって自転車こぎ運動をする人型モデル(ghost-model.fbx)になる
// (モデルが無い/読み込みに失敗した場合は、コンソールに警告を出すだけでカプセル型のまま動く)
const GHOST_MODEL_CHANCE = 0.1; // モデル版になる確率(0.1 = 10%)。変えたいときはこの数字だけ変える
let ghostUsesModel = false;     // このゲームでモデル版になるか(initHaunting()で抽選する)
let ghostModel = null;
let ghostMixer = null;
let ghostModelMaterials = [];
// 読み込みが終わった(成功でも失敗でも)ら解決する約束。enterGame() が、これを待ってから、モデルの描画の準備もする
const ghostModelReady = new Promise((resolve) => {
  new FBXLoader().load('./ghost-model.fbx', (fbx) => {
    ghostModel = fbx;
    applyGhostModel();
    resolve();
  }, undefined, () => {
    console.warn('幽霊モデル(ghost-model.fbx)の読み込みに失敗しました。engine.jsと同じフォルダに置かれているか確認してください');
    resolve();
  });
});

// 隠しコマンド: マップを選んだあとに「hayato」とキーボードで打つと、その回の幽霊が確定でハヤトになる
// (見た目は人型モデル、証拠はスピリットボックスのみ、襲ってこない。進行中のハントもその場で終わる)
let secretBuffer = '';
window.addEventListener('keydown', (e) => {
  if (net || !difficulty.hayato || !hauntedRoom || (currentGhost && currentGhost.name === 'ハヤト')) return; // ナイトメアでは、ハヤトは出ない。 // オンライン中は、ひとりだけ幽霊が変わってしまうので無効。マップ選択前(幽霊がまだいない)や、すでにハヤトのときは何もしない
  if (typeof e.key !== 'string' || e.key.length !== 1) return;
  secretBuffer = (secretBuffer + e.key.toLowerCase()).slice(-6);
  if (secretBuffer === 'hayato') {
    const hayato = ghostTypes.find(g => g.name === 'ハヤト');
    if (hayato) currentGhost = hayato;
    huntActive = false; // 襲ってこない幽霊になるので、ハント中ならその場で打ち切る
    if (exteriorDoor) exteriorDoor.locked = false;
    ghostUsesModel = true;
    applyGhostModel(); // モデルの読み込みがまだなら、読み込み完了時に自動で入れ替わる
    console.log("[デバッグ] 幽霊の種類:", currentGhost.name, "証拠:", currentGhost.evidence);
    showPickupNotice('…何かが変わった…');
  }
});

// 抽選に当たっていて、モデルの読み込みも終わっているときに、カプセルをモデルへ入れ替える(どちらが先に揃っても一度だけ実行される)
function applyGhostModel() {
  if (!ghostUsesModel || !ghostModel || ghostModel.parent === ghost) return;
  ghostModel.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // 動くスキンメッシュが画面端で消えないように
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      m.transparent = true;
      m.opacity = ghostMaterial.opacity;
      m.color.copy(ghostMaterial.color); // 普段の幽霊と同じ青白い半透明にそろえる
      if (m.emissive) { m.emissive.copy(ghostMaterial.emissive); m.emissiveIntensity = ghostMaterial.emissiveIntensity; }
      ghostModelMaterials.push(m);
    });
  });
  ghostModel.position.y = -0.85; // カプセルの中心(床から約1m)から下げて、寝転がった体が床すれすれになるようにする
  ghost.add(ghostModel);
  ghostMaterial.visible = false; // カプセル本体だけ隠す(D.O.T.S.の光点は子なので残る)
  ghostDotMarkers.forEach((dot) => dot.position.set(-0.25 + Math.random() * 0.6, -0.9 + Math.random() * 0.5, -0.6 + Math.random() * 1.3));
  if (ghostModel.animations.length > 0) {
    ghostMixer = new THREE.AnimationMixer(ghostModel);
    ghostMixer.clipAction(ghostModel.animations[0]).play(); // ずっとループ再生
  }
}

// スピリットボックスが返す単語(証拠に一致する幽霊が近くにいるときだけ、雑音の代わりにこの中から返る)
const spiritBoxWords = ['Y6uB4†b', 'P0см0три n4 меня', '0л4 0л4 0л4 0л4'];
let spiritBoxTimer = 2;
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
let hauntedFloor = 0; // 幽霊の部屋がある階(0=1階/地下側、1=2階、2=屋根裏など。マップのupperFloorと同じ番号)
let ghostFloorY = 0;  // 幽霊が今いる階の床の高さ(階を移るときは滑らかに動かす)
let ghostTarget = null;

function hauntedFloorY() {
  return hauntedFloor > 0 ? upperFloorHeights[hauntedFloor] : 0;
}
// プレイヤーが「幽霊の部屋」の中にいるか(XZの範囲だけでなく、階も一致しているときだけtrue)
function playerInHauntedRoom(x, z) {
  if (!hauntedRoom) return false;
  const sameFloor = hauntedFloor > 0 ? currentUpperFloor === hauntedFloor : (currentUpperFloor === 0 && onGroundFloor);
  return sameFloor && x >= hauntedRoom.minX && x <= hauntedRoom.maxX && z >= hauntedRoom.minZ && z <= hauntedRoom.maxZ;
}
let difficultyId = 'normal';
let difficulty = DIFFICULTIES.normal;
let breakerTripTimer = -1; // 上がっているブレーカーが落とされるまでの残り秒数(-1 は「まだ決めていない/いまは数えない」)
function setDifficulty(id) {
  difficultyId = DIFFICULTIES[id] ? id : 'normal';
  difficulty = DIFFICULTIES[difficultyId];
  breakerTripTimer = -1;
  updateJournalGhostList(); // ハヤトが出ない難易度では、調査書の一覧からも外す
}
function getDifficultyId() { return difficultyId; }

// ポルターガイストのように、幽霊が上がっているブレーカーを落とす。毎フレーム呼ぶ。落とす時間になったら true を返す
function breakerTick(delta) {
  if (!difficulty.breakerTrips || !breakerOn) { breakerTripTimer = -1; return false; } // 落ちているとき・落とさない難易度のときは数えない
  if (breakerTripTimer < 0) breakerTripTimer = difficulty.tripMin + Math.random() * (difficulty.tripMax - difficulty.tripMin);
  breakerTripTimer -= delta;
  if (breakerTripTimer > 0) return false;
  breakerTripTimer = -1;
  return true;
}
function tripBreaker() {
  if (!breakerOn) return;
  breakerOn = false;
  if (onBreakerToggle) onBreakerToggle();
  showPickupNotice('ブレーカーが落ちた…!');
}

// 全員で同じ幽霊・同じ出没部屋・同じ手形のドアにするための、種(シード)つきの乱数。
// ロビーの部屋から来たときだけ、main.js がサーバーから受け取った種を setHauntSeed() で渡す。ひとりで遊ぶときは、普通の乱数のまま
let hauntRand = Math.random;
function setHauntSeed(seed) {
  let a = (Number(seed) >>> 0) || 1; // mulberry32
  hauntRand = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 幽霊を1体ランダムに選び、渡された候補部屋(マップ側が「出没してよい部屋」として絞り込んだもの)の中に配置する
function initHaunting(hauntableRoomEntries) {
  const ghostPool = difficulty.hayato ? ghostTypes : ghostTypes.filter((g) => g.name !== 'ハヤト'); // 普通などは、これまでと同じ抽選
  currentGhost = ghostPool[Math.floor(hauntRand() * ghostPool.length)];
  const hauntedRoomEntry = hauntableRoomEntries[Math.floor(hauntRand() * hauntableRoomEntries.length)];
  hauntedRoom = hauntedRoomEntry.bounds;
  notebookTimer = 15 + hauntRand() * 30; // ゴーストライティングが起こるまでの時間も、全員で同じ値にする
  ghostUsesModel = currentGhost.alwaysModel === true || hauntRand() < GHOST_MODEL_CHANCE;
  console.log("[デバッグ] 幽霊の見た目:", ghostUsesModel ? "人型モデル" : "カプセル");
  applyGhostModel();
  hauntedFloor = hauntedRoomEntry.upperFloor || 0;
  ghostFloorY = hauntedFloorY();
  console.log("[デバッグ] 幽霊の種類:", currentGhost.name, "証拠:", currentGhost.evidence, "出没部屋:", hauntedRoomEntry.name);

  ghostTarget = randomPointInRoom(hauntedRoom);
  ghost.position.copy(ghostTarget);
  ghost.position.y = ghostFloorY + 1.0;

  const hauntedRoomDoors = doors.filter(d => (d.upperFloor || 0) === hauntedFloor && doorBordersRoom(d, hauntedRoom));
  if (hauntedRoomDoors.length > 0) {
    const doorObj = hauntedRoomDoors[Math.floor(hauntRand() * hauntedRoomDoors.length)];
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
    const fingerprintSpotPos = randomPointInRoom(hauntedRoom, 0.9, hauntRand);
    fingerprintSpot.position.set(fingerprintSpotPos.x, hauntedFloorY() + 1.1, fingerprintSpotPos.z);
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
// wallAxis: スイッチが付く壁が延びる向き('x' か 'z')。'z'(x が一定の壁)のときは、箱を90度回して、薄い面を壁に向ける。指定しなければ、これまで通り
function addLightSwitch(roomName, rl, customX, customZ, wallAxis) {
  const r = room(roomName);
  const y = buildingUpperFloor > 0 ? upperFloorHeights[buildingUpperFloor] : 0;
  const x = customX !== undefined ? customX : r.maxX - 0.15;
  const z = customZ !== undefined ? customZ : r.maxZ - 0.6;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0x554400, emissiveIntensity: 0.5 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), mat);
  mesh.position.set(x, y + 1.1, z);
  if (wallAxis === 'z') mesh.rotation.y = Math.PI / 2;
  mesh.castShadow = true;
  scene.add(mesh);
  lightSwitches.push({ x, z, roomName, rl, fixtureMat: rl.fixtureMat, switchMat: mat, on: true, upperFloor: buildingUpperFloor }); // 階も覚えておく(上下の階に同じ位置のスイッチがあっても、いまいる階のものだけを押せるように)
}

// スイッチ・ブレーカーが切り替わったときだけ呼ぶ(プレイヤーの位置は一切見ない=毎フレームは動かないので、移動によるコストは無い)
function updateRoomLightCulling() {
  lightSwitches.forEach(sw => {
    const wantsOn = sw.on && breakerOn;
    sw.fixtureMat.emissiveIntensity = wantsOn ? 1.2 : 0;
    sw.rl.glowMat.opacity = wantsOn ? sw.rl.baseGlowOpacity : 0;
  });
}

// ハント中に照明を点滅させる。部屋の天井灯(器具と床の光だまり)に加えて、マップ側が登録した全体照明も一緒に点滅する
const flickerLights = []; // { light, getBase }: getBase()は「点滅していないときの明るさ」(ブレーカーの状態などで変わるので関数にしてある)
function registerFlickerLight(light, getBase) { flickerLights.push({ light, getBase }); }
let huntFlickerOn = true, huntFlickerTimer = 0, huntFlickerWas = false;
function updateHuntFlicker(delta) {
  if (!huntActive) {
    if (huntFlickerWas) { // ハントが終わったので、通常の明るさに戻す
      huntFlickerWas = false;
      huntFlickerOn = true;
      updateRoomLightCulling();
      flickerLights.forEach(f => { f.light.intensity = f.getBase(); });
    }
    return;
  }
  huntFlickerWas = true;
  huntFlickerTimer -= delta;
  if (huntFlickerTimer <= 0) {
    huntFlickerOn = !huntFlickerOn;
    huntFlickerTimer = huntFlickerOn ? 0.05 + Math.random() * 0.35 : 0.04 + Math.random() * 0.18; // 消えている時間は短く、点いている時間は少し長め(不規則に)
  }
  const k = huntFlickerOn ? 1 : 0.08; // 消えている間も、ほんのり残す
  lightSwitches.forEach(sw => {
    if (!(sw.on && breakerOn)) return; // もともと消えている照明はそのまま
    sw.fixtureMat.emissiveIntensity = 1.2 * k;
    sw.rl.glowMat.opacity = sw.rl.baseGlowOpacity * k;
  });
  flickerLights.forEach(f => { f.light.intensity = f.getBase() * k; });
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
function setNotebookWorldMesh(m) { notebookWorldMesh = m; }

// マップ固有の毎フレーム処理(階段の昇り降りの高さ補間など)を登録する。animateループから毎フレーム呼ばれる
const onFrameCallbacks = [];
function onFrame(fn) { onFrameCallbacks.push(fn); }

// スイッチ・ブレーカーに近づいてクリックするとON/OFF切り替え(天井照明ごと)
// 道具を拾う(壁掛けの道具は視線の先のもの、床や机の上の道具は近くのもの)。拾った/「すでに持っている」と伝えたときはtrueを返す
// (クリックやYボタンは tryInteract から呼ばれる。拾えるものがなければ、そのままドアなどの操作に進む)
function tryPickup() {
  const heldCount = (hasFlashlight ? 1 : 0) + (hasEMF ? 1 : 0) + (hasThermometer ? 1 : 0) + (hasNotebook ? 1 : 0) +
    (hasSpiritBox ? 1 : 0) + (hasUV ? 1 : 0) + (hasDots ? 1 : 0);
  // 壁掛けの道具(ペグボード)は、近くにあるどれでもではなく、視線を向けているものを取る
  const gazeItem = findGazePickup();
  if (gazeItem && isToolHeld(gazeItem.tool)) { // 同じ道具が何個も掛かっているので、持っている種類は取らない
    showPickupNotice('すでに持っている');
    return true;
  }
  if (gazeItem && heldCount < 3) {
    gazeItem.collected = true;
    scene.remove(gazeItem.mesh);
    gazeItem.onCollect();
    netWorld({ kind: 'take', id: gazeItem.netId }); // オンライン: 取った道具は、ほかの人の画面からも消える
    return true;
  }
  for (const item of pickupItems) {
    if (item.collected || item.gaze) continue;
    if (heldCount >= 3) break; // インベントリは3つまで
    const dx = camera.position.x - item.x, dz = camera.position.z - item.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.2) {
      item.collected = true;
      scene.remove(item.mesh);
      item.onCollect();
      netWorld({ kind: 'take', id: item.netId });
      return true;
    }
  }
  return false;
}

// ブレーカー・ドア・照明のスイッチを操作する。includePickup が true(クリックのとき)なら、先に拾えるものを拾う
function tryInteract({ includePickup = true } = {}) {
  if (includePickup && tryPickup()) return;

  if (breakerBox) {
    const dbx = camera.position.x - breakerBox.x, dbz = camera.position.z - breakerBox.z;
    if (Math.sqrt(dbx * dbx + dbz * dbz) < 1.2) {
      if (!breakerOn && !difficulty.canRaiseBreaker) { // ナイトメア: ブレーカーが上がらない(ずっと停電)
        showPickupNotice('ブレーカーが上がらない…');
        return;
      }
      breakerOn = !breakerOn;
      if (onBreakerToggle) onBreakerToggle();
      showPickupNotice(breakerOn ? 'ブレーカーを入れた' : 'ブレーカーを落とした');
      netWorld({ kind: 'breaker', on: breakerOn }); // オンライン: ほかの人にも知らせる
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
    if (nearestDoor.locked) { showCenterNotice('ドアが開かない…!'); return; }
    nearestDoor.isOpen = !nearestDoor.isOpen;
    if (nearestDoor.isOpen) nearestDoor.openDir = doorOpenDir(nearestDoor); // 開けた人から遠ざかる向きに開く
    nearestDoor.targetRotation = nearestDoor.isOpen ? (nearestDoor.openDir || 1) * Math.PI / 2 : 0;
    netWorld({ kind: 'door', id: doors.indexOf(nearestDoor), open: nearestDoor.isOpen, dir: nearestDoor.openDir || 1 }); // オンライン: ほかの人にも知らせる
    return;
  }

  let nearest = null, nearestDist = 1.4;
  for (const sw of lightSwitches) {
    if ((sw.upperFloor || 0) !== currentUpperFloor) continue; // ほかの階のスイッチは押せない
    const dx = camera.position.x - sw.x;
    const dz = camera.position.z - sw.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < nearestDist) { nearest = sw; nearestDist = d; }
  }
  if (nearest) {
    setSwitchState(nearest, !nearest.on);
    netWorld({ kind: 'switch', id: lightSwitches.indexOf(nearest), on: nearest.on }); // オンライン: ほかの人にも知らせる
  }
}
// 照明スイッチを入れる/切る(自分で押したときも、ほかの人が押したのが届いたときも、同じ処理)
function setSwitchState(sw, on) {
  sw.on = on;
  updateRoomLightCulling();
  sw.switchMat.color.set(on ? 0xffffcc : 0x555555);
  sw.switchMat.emissiveIntensity = on ? 0.5 : 0;
}
document.addEventListener('click', () => {
  if (!controls.isLocked) return; // クリックはポインターロック中だけ(コントローラーはYボタンで tryInteract を呼ぶ)
  tryInteract();
});

const flashlight = new THREE.PointLight(0xffeecc, 0, 8); // 懐中電灯を拾うまで光量0
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(256, 256);
flashlight.shadow.camera.near = 0.1;
flashlight.shadow.camera.far = 8;
// 影の描き直しは、「懐中電灯が点いているときの、メインの描画」だけにする(animate で、毎フレーム needsUpdate を立てる)。
// 初期設定の自動更新だと、render() を呼ぶたびに(監視カメラの映像の描画でも)、影を6方向ぶん描き直してしまう
renderer.shadowMap.autoUpdate = false;
camera.add(flashlight);
scene.add(camera);

// 持っている道具を画面右下に表示するビューモデル本体(4種類ぶん作り、選択中の1つだけ表示する)
// 道具本体はラッパーGroupに入れる。直接rotationを上書きすると、各メッシュ自身が持つ向き(懐中電灯を寝かせる回転など)が
// 消えてしまうため、ラッパー側だけを回して「元の向き+構え角度」が足し合わさるようにする
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
controls.addEventListener('unlock', () => { info.textContent = 'クリックで再開(H: 操作説明)'; });

// コントローラーだけで遊ぶ状態(マウスの視点固定=ポインターロックなし)。
// ボタン押下はブラウザにとって「クリック」ではないので、ポインターロックを始められない。そのため、このフラグで「操作中」とみなす。
// main.js が、ロビーから来たときの「クリックして開始」の画面でコントローラーのボタンが押されたときに呼ぶ
let padPlay = false;
function requestPadStart() {
  padPlay = true;
  if (gameStartTime === null) gameStartTime = performance.now(); // 'lock' イベントが来ないので、ここで開始時刻を記録する
}
const inControl = () => controls.isLocked || padPlay;


const thermoDisplay = document.createElement('div');
thermoDisplay.className = 'gh-thermo-display';
document.body.appendChild(thermoDisplay);

const notebookDisplay = document.createElement('div');
notebookDisplay.className = 'gh-notebook-display';
document.body.appendChild(notebookDisplay);

const spiritBoxDisplay = document.createElement('div');
spiritBoxDisplay.className = 'gh-spirit-box-display';
document.body.appendChild(spiritBoxDisplay);

const dotsDisplay = document.createElement('div');
dotsDisplay.className = 'gh-dots-display';
document.body.appendChild(dotsDisplay);

// タブキーで開く調査書(見開き)。左ページ=証拠チェック、右ページ=絞り込まれたゴースト一覧+特定ボタン
const evidenceTypes = ["EMF5", "スピリットボックス", "ゴーストライティング", "オーブ", "冷えた温度", "指紋", "D.O.T.S"];
let journalOpen = false;
const checkedEvidence = new Set();
let selectedGhostName = null;
let myVote = null;   // 自分が特定(投票)した幽霊の名前。まだならnull
// コントローラーで調査書を操作するときのカーソル(zone: 'evidence'=左ページの証拠 / 'ghost'=右ページのゴースト一覧)
const padCursor = { zone: 'ghost', ev: 0, ghost: 0 };
let padCursorOn = false; // コントローラーで操作しているときだけ、カーソルの枠を出す
let voteState = null; // オンライン: { voted: [投票済みの人のid], total: 投票する人の数 }

// ロビーへ戻る(調査書内のボタン、またはPキーから呼ばれる)。誤操作で進行状況を失わないよう一度だけ確認する
function returnToLobby() {
  if (confirm('ロビーに戻りますか?(このマップでの進行状況は失われます)')) {
    window.location.href = 'lobby.html';
  }
}

// Esc で視点固定が外れたときの一時停止の画面(再開・視点の感度・ロビーに戻る)
createPauseMenu({
  controls,
  shouldShow: () => gameEntered && !gameOver && !journalOpen && !padPlay && !loadingMap,
  onLobby: returnToLobby,
});

const journalOverlay = document.createElement('div');
journalOverlay.className = 'gh-journal-overlay';
document.body.appendChild(journalOverlay);

const journalBook = document.createElement('div');
journalBook.className = 'gh-journal-book';
journalOverlay.appendChild(journalBook);

function makeJournalPage(borderSide) {
  const page = document.createElement('div');
  page.className = `gh-journal-page gh-journal-page--${borderSide}`; // borderSide は 'left' か 'right'(綴じ目の側の線)
  return page;
}
const journalLeftPage = makeJournalPage('right');
const journalRightPage = makeJournalPage('left');
journalBook.appendChild(journalLeftPage);
journalBook.appendChild(journalRightPage);

// 左ページ: 証拠チェックリスト
const journalLeftTitle = document.createElement('h2');
journalLeftTitle.textContent = '証拠';
journalLeftTitle.className = 'gh-journal-left-title';
journalLeftPage.appendChild(journalLeftTitle);

const evidenceRows = []; // { ev, row, cb }(コントローラーで、カーソルを合わせたりチェックしたりするため)
evidenceTypes.forEach(ev => {
  const row = document.createElement('label');
  row.className = 'gh-evidence-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'gh-evidence-checkbox';
  cb.addEventListener('change', () => {
    if (cb.checked) checkedEvidence.add(ev); else checkedEvidence.delete(ev);
    updateJournalGhostList();
  });
  const span = document.createElement('span');
  span.textContent = ev;
  row.appendChild(cb);
  row.appendChild(span);
  journalLeftPage.appendChild(row);
  evidenceRows.push({ ev, row, cb });
});

// 証拠リストの下に「ロビーに戻る」ボタンを置く(Pキーでも同じ動作)
const journalLobbyBtn = document.createElement('button');
journalLobbyBtn.textContent = '🚪 ロビーに戻る';
journalLobbyBtn.className = 'gh-journal-lobby-btn';
journalLobbyBtn.addEventListener('click', returnToLobby);
journalLeftPage.appendChild(journalLobbyBtn);

// 右ページ: 証拠に一致するゴーストの一覧(チェック無しなら全種類)+特定ボタン
const journalRightTitle = document.createElement('h2');
journalRightTitle.textContent = 'ゴーストの種類';
journalRightTitle.className = 'gh-journal-right-title';
journalRightPage.appendChild(journalRightTitle);

const journalGhostList = document.createElement('div');
journalGhostList.className = 'gh-journal-ghost-list';
journalRightPage.appendChild(journalGhostList);

const journalIdentifyBtn = document.createElement('button');
journalIdentifyBtn.textContent = '特定';
journalIdentifyBtn.className = 'gh-journal-identify-btn';
journalIdentifyBtn.addEventListener('click', () => submitIdentify());
journalRightPage.appendChild(journalIdentifyBtn);

// 特定したあとの表示(自分の回答と、何人が特定を終えたか)と、ホストだけが押せる「いまの票で決める」
const journalVoteStatus = document.createElement('div');
journalVoteStatus.className = 'gh-journal-vote-status';
journalRightPage.appendChild(journalVoteStatus);
const journalForceBtn = document.createElement('button');
journalForceBtn.textContent = 'いまの票で決める';
journalForceBtn.className = 'gh-journal-force-btn';
journalForceBtn.addEventListener('click', () => { if (net && net.forceFinalize) net.forceFinalize(); });
journalRightPage.appendChild(journalForceBtn);

let journalGhostRows = []; // いま一覧に出ている { name, row }(コントローラーのカーソル用)
function updateJournalGhostList() {
  journalGhostList.innerHTML = '';
  journalGhostRows = [];
  const checkedList = [...checkedEvidence];
  const matching = ghostTypes.filter(g => (difficulty.hayato || g.name !== 'ハヤト') && checkedList.every(ev => g.evidence.includes(ev)));
  matching.forEach(g => {
    const row = document.createElement('div');
    const isSelected = g.name === (myVote || selectedGhostName);
    row.textContent = g.name;
    row.className = 'gh-journal-ghost-row' + (myVote ? ' is-locked' : '') + (isSelected ? ' is-selected' : '');
    row.addEventListener('click', () => {
      if (myVote) return; // 特定したあとは、変えられない
      selectedGhostName = g.name;
      journalIdentifyBtn.style.display = 'inline-block';
      updateJournalGhostList();
    });
    journalGhostList.appendChild(row);
    journalGhostRows.push({ name: g.name, row });
  });
  if (matching.length === 0) {
    const none = document.createElement('div');
    none.textContent = '(条件に一致するゴーストがいません)';
    none.className = 'gh-journal-empty';
    journalGhostList.appendChild(none);
  }
  refreshPadCursor(); // 一覧が作り直されても、コントローラーのカーソルは残す
}
updateJournalGhostList();

// Tabキーで開閉。開くとポインターロックを解除してカーソルで操作できるようにし、閉じるときは自動で再ロックしてクリックし直さずに操作を続けられるようにする
// keepLock: コントローラーで開くとき。マウスの視点固定は外さない(閉じるときにボタンでは固定をやり直せない=クリックにならないため)
let journalKeptLock = false;
function openJournal(keepLock = false) {
  journalOpen = true;
  journalKeptLock = keepLock;
  padCursorOn = keepLock; // コントローラーで開いたときだけ、カーソルの枠を出す(十字キーなどを押せば、キーボードで開いたときも出る)
  journalOverlay.style.display = 'flex';
  if (!keepLock && controls.isLocked) controls.unlock();
  refreshPadCursor();
}
function closeJournal() {
  journalOpen = false;
  journalOverlay.style.display = 'none';
  if (!journalKeptLock && !controls.isLocked && !padPlay) controls.lock();
  journalKeptLock = false;
}
function toggleJournal() {
  if (journalOpen) closeJournal(); else openJournal();
}

// ---- コントローラーで調査書を操作する(＋で開閉・特定まで) ----
//  ＋: 調査書を開く/閉じる(ゲーム中ならいつでも)
//  十字キー/左スティック: カーソル移動(左ページの証拠 ↔ 右ページのゴースト一覧)
//  B(下)・Y(左): 証拠のチェックを付け外し/ゴーストを選ぶ    X(上): 選んでいるゴーストで特定    A(右): 閉じる
// 調査書を開いている間は、動く・見回す・道具を使うなどのボタン操作は止める(閉じるときの押しっぱなしで誤作動しないよう、状態は読み続ける)
const journalPadHint = document.createElement('div');
journalPadHint.textContent = '🎮 十字キー/スティック: 移動   B・Y: 選ぶ・チェック   X: 特定   A・＋: 閉じる';
journalPadHint.className = 'gh-journal-pad-hint';
journalOverlay.appendChild(journalPadHint);

// カーソルのある行に枠を付ける(一覧が作り直されたときも呼ばれる)
function refreshPadCursor() {
  evidenceRows.forEach((e) => { e.row.style.outline = ''; });
  journalGhostRows.forEach((g) => { g.row.style.outline = ''; });
  if (!journalOpen || !padCursorOn) return;
  if (journalGhostRows.length === 0) padCursor.zone = 'evidence';
  padCursor.ev = Math.max(0, Math.min(evidenceRows.length - 1, padCursor.ev));
  padCursor.ghost = Math.max(0, Math.min(journalGhostRows.length - 1, padCursor.ghost));
  const target = padCursor.zone === 'evidence' ? evidenceRows[padCursor.ev].row : journalGhostRows[padCursor.ghost].row;
  target.style.outline = '3px solid #2f6fbf';
  target.style.outlineOffset = '-1px';
  if (target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
}

function movePadCursor(dir) {
  padCursorOn = true;
  const n = journalGhostRows.length;
  if (padCursor.zone === 'evidence') {
    if (dir === 'up') padCursor.ev = Math.max(0, padCursor.ev - 1);
    else if (dir === 'down') padCursor.ev = Math.min(evidenceRows.length - 1, padCursor.ev + 1);
    else if (dir === 'right' && n > 0) { padCursor.zone = 'ghost'; padCursor.ghost = Math.min(padCursor.ghost - (padCursor.ghost % 2), n - 1); } // 一覧の左の列へ
  } else {
    const i = padCursor.ghost, col = i % 2; // 一覧は2列(左から右、上から下の順)
    if (dir === 'up') { if (i - 2 >= 0) padCursor.ghost = i - 2; }
    else if (dir === 'down') { if (i + 2 < n) padCursor.ghost = i + 2; }
    else if (dir === 'left') { if (col === 1) padCursor.ghost = i - 1; else padCursor.zone = 'evidence'; }
    else if (dir === 'right') { if (col === 0 && i + 1 < n) padCursor.ghost = i + 1; }
  }
  refreshPadCursor();
}

const gpJournalPrev = {};
const padNavHold = { dir: null, timer: 0 };
const GAME_PAD_BUTTONS = [0, 2, 3, 4, 5, 7, 13]; // 普段のゲーム操作が使うボタン(調査書の間も、押している状態を覚えておく)
function updateJournalPad(pad, delta) {
  const down = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const edge = (i) => { const p = down(i); const e = p && !gpJournalPrev[i]; gpJournalPrev[i] = p; return e; };
  const wasOpen = journalOpen;
  const plus = edge(9), btnA = edge(1), btnB = edge(0), btnY = edge(2), btnX = edge(3);

  // ＋で開閉(マップに入ったあと、結果が出るまで)
  if (plus && gameEntered && !gameOver && !groupResultShown) {
    if (journalOpen) closeJournal(); else { padCursorOn = true; openJournal(true); }
  }

  if (wasOpen && journalOpen) {
    if (btnA) { closeJournal(); }
    else {
      // 十字キー・左スティックの移動(押しっぱなしで、少し待ってから連続で動く)
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      let dir = null;
      if (down(12) || ay < -0.6) dir = 'up';
      else if (down(13) || ay > 0.6) dir = 'down';
      else if (down(14) || ax < -0.6) dir = 'left';
      else if (down(15) || ax > 0.6) dir = 'right';
      let fire = false;
      if (!dir) padNavHold.dir = null;
      else if (dir !== padNavHold.dir) { padNavHold.dir = dir; padNavHold.timer = 0.4; fire = true; }
      else { padNavHold.timer -= delta; if (padNavHold.timer <= 0) { padNavHold.timer = 0.14; fire = true; } }
      if (fire) movePadCursor(dir);

      if (btnB || btnY) {
        padCursorOn = true;
        if (padCursor.zone === 'evidence') {
          const e = evidenceRows[padCursor.ev];
          e.cb.checked = !e.cb.checked;
          e.cb.dispatchEvent(new Event('change')); // マウスでチェックしたときと同じ処理(一覧が絞り込まれる)
        } else if (journalGhostRows[padCursor.ghost]) {
          journalGhostRows[padCursor.ghost].row.click(); // マウスでクリックしたときと同じ処理(選ぶ)
        }
      }
      if (btnX && selectedGhostName && !myVote) submitIdentify(); // 選んでいるゴーストで特定する
    }
  } else padNavHold.dir = null;

  if (wasOpen || journalOpen) GAME_PAD_BUTTONS.forEach((i) => { gpPrevButtons[i] = down(i); });
}

// マイクラ風のホットバー(3スロット固定。持ち物は最大3つまで。拾った順に左から並ぶ)
let heldOrder = []; // 拾った道具名を、拾った順に積んでいく
const hotbar = document.createElement('div');
hotbar.className = 'gh-hotbar';
document.body.appendChild(hotbar);
const hotbarSlots = Array.from({ length: 3 }, (_, i) => {
  const slot = document.createElement('div');
  slot.className = 'gh-hotbar-slot';
  const num = document.createElement('div');
  num.textContent = i + 1;
  num.className = 'gh-hotbar-num';
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
const bloodOverlay = document.createElement('div');
bloodOverlay.className = 'gh-blood-overlay';
bloodOverlay.style.setProperty('--blood-splatter', `url(${makeBloodSplatterDataURL()})`); // 血のしぶきの絵は、コードで描くので、ここで渡す(並べ方は ui.css)
document.body.appendChild(bloodOverlay);

const resultOverlay = document.createElement('div');
resultOverlay.className = 'gh-result-overlay';
const resultTitle = document.createElement('div');
resultTitle.textContent = 'あなたは死亡しました';
resultTitle.className = 'gh-result-title';
resultOverlay.appendChild(resultTitle);
const resultGhostText = document.createElement('div');
resultGhostText.className = 'gh-result-ghost-text';
resultOverlay.appendChild(resultGhostText);
const resultTimeText = document.createElement('div');
resultTimeText.className = 'gh-result-time-text';
resultOverlay.appendChild(resultTimeText);
const resultLobbyBtn = document.createElement('button');
resultLobbyBtn.textContent = 'ロビーに戻る';
resultLobbyBtn.className = 'gh-result-lobby-btn';
resultLobbyBtn.addEventListener('click', () => { window.location.href = 'lobby.html'; });
resultOverlay.appendChild(resultLobbyBtn);
document.body.appendChild(resultOverlay);

let gameStartTime = null; // 最初にポインターロックした時刻(生存時間の計算用)
let gameOver = false;
controls.addEventListener('lock', () => { if (gameStartTime === null) gameStartTime = performance.now(); });

// 死亡時にジャンプスケア的に目の前へ出す3Dモデル(アニメーション付きFBX)。同じフォルダに death-model.fbx を置いておくと読み込まれる
// (無い/読み込みに失敗した場合はコンソールに警告を出すだけで、血の画面・リザルト画面はいつも通り動く)
const fbxLoader = new FBXLoader();
let deathModel = null;
let deathClips = [];
let deathMixer = null;
const deathModelReady = new Promise((resolve) => {
  fbxLoader.load('./death-model.fbx', (fbx) => {
    deathModel = fbx;
    deathClips = fbx.animations;
    resolve();
  }, undefined, () => {
    console.warn('死亡演出モデル(death-model.fbx)の読み込みに失敗しました。engine.jsと同じフォルダに置かれているか確認してください');
    resolve();
  });
});

// 幽霊がこの距離(m)まで近づいたら死亡演出が始まる
const DEATH_TRIGGER_DIST = 1.0;
// 死亡演出のモデルを、プレイヤーの正面何m先に出すか。大きいほど遠くに出る(以前は1.3)
const DEATH_MODEL_DIST = 3.0;

function triggerDeath() {
  if (gameOver) return;
  gameOver = true;
  huntActive = false;

  // 死亡演出モデルを、カメラの目の前に出す(ジャンプスケア)。読み込みが間に合っていなければ何もしない
  if (deathModel) {
    const scareModel = SkeletonUtils.clone(deathModel);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    scareModel.position.copy(camera.position).addScaledVector(forward, DEATH_MODEL_DIST);
    scareModel.position.y = camera.position.y - 1.6; // 目の高さ(1.6m)ぶん下げて、足元を床に合わせる。もっと上/下にしたいときはこの1.6を増減する
    scareModel.lookAt(camera.position.x, scareModel.position.y, camera.position.z);
    scareModel.scale.setScalar(1.0); // ※モデルの実寸に応じて、大きすぎ/小さすぎる場合はここを調整する
    scareModel.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); // 動くスキンメッシュが画面端で消えないように
    scene.add(scareModel);
    if (deathClips.length > 0) {
      deathMixer = new THREE.AnimationMixer(scareModel);
      const action = deathMixer.clipAction(deathClips[0]);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true; // 再生が終わったら最後のポーズで止める
      action.play();
    }
    const scareLight = new THREE.PointLight(0xff3333, 6, 4);
    scareLight.position.copy(camera.position);
    scene.add(scareLight);
  }

  controls.unlock();
  padPlay = false;
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
identifyResultOverlay.className = 'gh-identify-result-overlay';
const identifyResultTitle = document.createElement('div');
identifyResultTitle.className = 'gh-identify-result-title';
identifyResultOverlay.appendChild(identifyResultTitle);
const identifyResultDetail = document.createElement('div');
identifyResultDetail.className = 'gh-identify-result-detail';
identifyResultOverlay.appendChild(identifyResultDetail);
const identifyResultBreakdown = document.createElement('div'); // 報酬の内訳(行ごと)
identifyResultBreakdown.className = 'gh-reward-breakdown';
identifyResultOverlay.appendChild(identifyResultBreakdown);
const identifyResultReward = document.createElement('div');
identifyResultReward.className = 'gh-identify-result-reward';
identifyResultOverlay.appendChild(identifyResultReward);
// 報酬を、Googleアカウントに保存したかどうか(ログインしているときだけ保存される)
const identifyResultMoney = document.createElement('div');
identifyResultMoney.className = 'gh-identify-result-money';
identifyResultOverlay.appendChild(identifyResultMoney);
const identifyResultLobbyBtn = document.createElement('button');
identifyResultLobbyBtn.textContent = 'ロビーに戻る';
identifyResultLobbyBtn.className = 'gh-identify-result-lobby-btn';
identifyResultLobbyBtn.addEventListener('click', () => { window.location.href = 'lobby.html'; }); // オンラインのときは、ロビーで同じ部屋に戻れる
identifyResultOverlay.appendChild(identifyResultLobbyBtn);
document.body.appendChild(identifyResultOverlay);

// ---- 特定(多数決) ----
// 特定は一人ひとりが自分の調査書で行う(投票)。生きている人が全員特定し終えたら、多数決で幽霊の正体が決まる。同票なら、同票の中からランダムに決まる。
// オンラインのときはサーバーが集計して結果を全員へ送る(applyIdentifyResult)。ひとりで遊ぶときは、その場で結果になる。
// 結果が出たら、ロビーのホワイトボードに表示できるよう、ブラウザに保存しておく
const LAST_RESULT_KEY = 'ghost_last_result';
const voteBanner = document.createElement('div');
voteBanner.className = 'gh-vote-banner';
document.body.appendChild(voteBanner);
let groupResultShown = false;

// 自分の特定の状態を、調査書と画面の上のほうに出す
function refreshVoteUi() {
  const voted = voteState ? voteState.voted.length : 1;
  const total = voteState ? Math.max(voteState.total, voted) : '?';
  if (myVote && net && !groupResultShown) {
    voteBanner.textContent = `特定済み: ${myVote} / ほかの人を待っています (${voted}/${total})`;
    voteBanner.style.display = 'block';
    journalVoteStatus.textContent = `あなたの特定: ${myVote}\n特定を終えた人: ${voted}/${total}人\n全員が終えると、多数決で正体が決まります。\n(同票のときは、同票の中からランダムです)`;
    journalVoteStatus.style.display = 'block';
    journalForceBtn.style.display = net.isHost() && voted > 0 ? 'inline-block' : 'none';
  } else {
    voteBanner.style.display = 'none';
    journalVoteStatus.style.display = 'none';
    journalForceBtn.style.display = 'none';
  }
  journalIdentifyBtn.style.display = (!myVote && selectedGhostName) ? 'inline-block' : 'none';
}

function submitIdentify() {
  if (!selectedGhostName || myVote || gameOver) return;
  const elapsedSeconds = gameStartTime ? Math.max(0, Math.floor((performance.now() - gameStartTime) / 1000)) : 0;
  myVote = selectedGhostName;
  if (net) {
    net.sendVote({ ghost: myVote, truth: currentGhost.name, elapsed: elapsedSeconds });
    voteState = voteState || { voted: ['me'], total: '?' };
    refreshVoteUi();
    updateJournalGhostList();
    closeJournal(); // 特定したあとも、ほかの人が終えるまで調査を続けられる(カーソルを戻して、そのまま操作できる)
  } else {
    // ひとりで遊ぶとき: 自分の1票がそのまま結果になる
    // closeJournal()は「未ロックなら再ロックする」動作をするが、ここではリザルト画面操作のためカーソルを出したままにしたいので使わない
    journalOpen = false;
    journalOverlay.style.display = 'none';
    const correct = myVote === currentGhost.name;
    showGroupResult({
      winner: myVote, tie: false, tied: [myVote], tally: [{ ghost: myVote, count: 1 }],
      votes: [{ id: 'me', name: 'あなた', ghost: myVote }], truth: currentGhost.name, correct, wipe: false,
      elapsed: elapsedSeconds, reward: calculateReward(correct, elapsedSeconds), mode: 'solo', at: Date.now(),
    });
  }
}

// オンライン: 何人が特定を終えたか(サーバーから届く)
function applyVoteUpdate(state) {
  voteState = state;
  refreshVoteUi();
}

// オンライン: 多数決の結果(サーバーから全員へ届く)
function applyIdentifyResult(result) {
  if (!result) return;
  showGroupResult({ ...result, mode: 'online' });
}

// 結果の画面。ひとりで遊ぶとき・オンラインのとき、どちらも同じ画面を使う
function showGroupResult(result) {
  if (groupResultShown) return;
  groupResultShown = true;
  const truth = result.truth || currentGhost.name; // 誰も特定しないまま全滅したときは、サーバーが正体を知らないので、こちらで補う
  const correct = result.winner != null && result.winner === truth;
  const reward = result.wipe ? 0 : (result.reward != null ? result.reward : calculateReward(correct, result.elapsed || 0));
  const saved = { ...result, truth, correct, reward, difficulty: difficultyId }; // 難易度も一緒に保存する(ロビーのボードに出す)
  try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(saved)); } catch (e) { /* 保存できなくても、結果は出せる */ }

  gameOver = true; // 結果が出たら、この回のプレイは全員終了(ハントなども止める)
  huntActive = false;
  if (exteriorDoor) exteriorDoor.locked = false;
  journalOpen = false;
  journalOverlay.style.display = 'none';
  voteBanner.style.display = 'none';
  controls.unlock();
  padPlay = false;
  info.style.display = 'none';

  identifyResultTitle.textContent = result.wipe ? '全滅…' : correct ? '特定成功!' : '特定失敗…';
  identifyResultTitle.style.color = result.wipe ? '#ff6666' : correct ? '#7CFC9A' : '#ff6666';
  const lines = [`難易度: ${difficulty.label}`, `幽霊の正体: ${truth}`];
  if (result.wipe) {
    lines.push('特定できないまま、全員が死亡しました');
  } else {
    if (result.mode !== 'solo') {
      lines.push(`多数決: ${result.tally.map((t) => `${t.ghost} ${t.count}票`).join(' / ')}`);
      if (result.tie) lines.push(`同票だったので、${result.tied.map((g) => `「${g}」`).join('')}の中からランダムに「${result.winner}」に決まりました`);
      else lines.push(`「${result.winner}」に決まりました`);
      lines.push('みんなの回答:');
      result.votes.forEach((v) => lines.push(`${v.name} → ${v.ghost}`));
    }
    lines.push(`あなたの回答: ${myVote || '(特定していません)'}`);
    lines.push(`特定にかかった時間: ${formatTime(result.elapsed || 0)}`);
  }
  identifyResultDetail.textContent = lines.join('\n');
  // 報酬の内訳。全滅は0円。サーバーの額が内訳の合計と違うときは、「その他」で合わせる
  const rows = result.wipe ? [{ label: '全滅のため報酬なし', amount: 0 }] : rewardBreakdown(correct, result.elapsed || 0);
  const rowsTotal = rows.reduce((a, r) => a + r.amount, 0);
  if (rowsTotal !== reward) rows.push({ label: 'その他', amount: reward - rowsTotal });
  identifyResultBreakdown.textContent = '';
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'gh-reward-row';
    const label = document.createElement('span');
    label.textContent = r.label;
    const amount = document.createElement('span');
    amount.className = 'gh-reward-amount';
    amount.textContent = `${r.amount < 0 ? '-' : '+'}¥${Math.abs(r.amount).toLocaleString()}`;
    row.appendChild(label); row.appendChild(amount);
    identifyResultBreakdown.appendChild(row);
  });
  identifyResultReward.textContent = `合計: ¥${reward.toLocaleString()}`;
  identifyResultOverlay.style.display = 'flex';
  setupMoneyLine({ ...saved, reward });
  if (pendingMoney) { const m = pendingMoney; pendingMoney = null; applyMoneyUpdate(m); }
}

// ---- お金の保存(Googleアカウント) ----
// ログインしている人だけ、報酬が保存される。オンラインはサーバーが自動で保存して、applyMoneyUpdate で届く。
// ひとりで遊んだときは、ここでサーバーへ受け取りを頼む(額はサーバーが計算する)
let moneyFinal = false;   // 保存の結果(所持金)がもう表示されたか(あとから「保存中…」で上書きしないため)
let pendingMoney = null;  // 結果の画面が出る前に届いた、保存の知らせ
function showMoney(text, final = false) { identifyResultMoney.textContent = text; if (final) moneyFinal = true; }
function applyMoneyUpdate(info) {
  if (!info) return;
  if (!groupResultShown) { pendingMoney = info; return; }
  if (info.error) { showMoney('お金を保存できませんでした(あとでロビーのボードで所持金を確認してください)', true); return; }
  if (info.duplicate) { showMoney(`所持金: ¥${Number(info.balance).toLocaleString()}(同じアカウントで、すでに受け取り済みです)`, true); return; }
  showMoney(`所持金: ¥${Number(info.balance).toLocaleString()}(Googleアカウントに保存しました)`, true);
}
async function setupMoneyLine(result) {
  if (!moneyFinal) showMoney('');
  if (result.wipe || !result.reward) return;
  try {
    const account = await import('./account.js');
    const st = await account.waitForAuth();
    if (!st.configured) return; // ログイン機能が設定されていないゲームでは、何も出さない
    if (!st.signedIn) { showMoney('ログインしていないので、報酬は保存されません(ロビーのボードで、Googleでログインできます)'); return; }
    if (!moneyFinal) showMoney('お金を保存中…');
    if (result.mode === 'solo') {
      const r = await account.claimSoloReward({ correct: result.correct, elapsed: result.elapsed || 0, claimId: String(result.at) });
      if (r.enabled === false) showMoney('サーバー側のお金の保存が、まだ設定されていません');
      else if (r.duplicate) showMoney(`所持金: ¥${Number(r.balance).toLocaleString()}(すでに受け取り済みです)`);
      else if (r.reward === undefined) showMoney(`所持金: ¥${Number(r.balance).toLocaleString()}(受け取りは、1分に1回までです。この報酬は保存されませんでした)`);
      else showMoney(`所持金: ¥${Number(r.balance).toLocaleString()}(Googleアカウントに保存しました)`);
    } // オンラインは、サーバーが保存して、applyMoneyUpdate で知らせてくれる(届くまで「保存中…」)
  } catch (e) {
    console.warn('お金の保存に失敗しました', e);
    showMoney('お金を保存できませんでした(サーバーにつながらなかった可能性があります)');
  }
}

// ジャンプ(見た目だけ): Space・コントローラーのBボタンで、ほかのプレイヤーの画面に、自分のアバターがジャンプする動きを出す。
// 自分の高さ・当たり判定・階段は変えない(ひとりで遊ぶときや、ジャンプの動きがないスキン(ロボット・カプセル)では、何も起きない)。
// 動き(約1.1秒)の途中で、次のジャンプはしない
const JUMP_COOLDOWN_MS = 1100;
let lastJumpAt = -Infinity;
function tryJump() {
  if (gameOver || journalOpen || !inControl()) return;
  const now = performance.now();
  if (now - lastJumpAt < JUMP_COOLDOWN_MS) return;
  lastJumpAt = now;
  if (ownAvatar && ownAvatar.jump) ownAvatar.jump(); // 三人称のとき、自分の体もジャンプの動きをする
  ownHopT = 0; // ジャンプの動きがないスキン(ロボット・カプセル)は、体ごと跳ねる
  if (net && net.sendJump) net.sendJump();
}

const keys = {};
let debugKeyBuffer = ''; // デバッグ用: 「sinu」と連続で打つと、幽霊に捕まらなくても死亡画面を確認できる
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.key && e.key.length === 1) {
    debugKeyBuffer = (debugKeyBuffer + e.key.toLowerCase()).slice(-4);
    if (debugKeyBuffer === 'sinu' && !net) triggerDeath(); // オンライン中は、ひとりだけ死んだことになってしまうので無効
  }
  if (gameOver) return; // 死亡後はリザルト画面の「ロビーに戻る」以外の操作を受け付けない
  if (e.code === 'Space' && inControl()) { e.preventDefault(); if (!e.repeat) tryJump(); } // ジャンプ(見た目だけ)。押しっぱなしでは繰り返さない
  if (e.code === 'KeyC' && inControl() && !e.repeat) toggleThirdPerson(); // 三人称視点の切り替え
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

// 幽霊の部屋(hauntedRoom)の中だけ気温が下がる。「冷えた温度」を証拠に持つ幽霊のときだけ氷点下まで下がる
function temperatureAt(x, z, t) {
  const inHauntedRoom = playerInHauntedRoom(x, z);
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
mapCanvas.className = 'gh-minimap';
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
// ==== オンライン: 世界(ドア・ブレーカー・照明スイッチ・床の道具・ノート)の同期 ====
// 自分が操作したら、サーバー経由でほかの全員へ知らせる(netWorld)。ほかの人の操作が届いたら、そのまま反映する(applyWorldEvent)。
// 途中から入った人・つなぎ直した人には、サーバーが覚えている「今の状態」(applyWorldState)をまとめて渡す。
// ドアとスイッチの目印は、マップの組み立て順の番号(全員同じ)。道具は pickupItems の番号('s' + 番号)、置いた道具は置いた人が付けた目印('d…')
let dropCounter = 0;
const extraNotebookMeshes = []; // ほかの人が置いたノート(書き込みが現れたら、これも書き換える)

function netWorld(ev) { if (net && net.sendWorld) net.sendWorld(ev); }

// ノートに書き込みが現れる(自分の条件を満たしたときも、ほかの人の分が届いたときも、同じ処理)
function writeNotebook() {
  if (notebookWritten) return;
  notebookWritten = true;
  [viewmodels.notebook, notebookWorldMesh, ...extraNotebookMeshes].forEach((m) => {
    if (m && m.userData && m.userData.pageCanvas) {
      drawNotebookPage(m.userData.pageCanvas, true);
      m.userData.pageTexture.needsUpdate = true;
    }
  });
}

function addRemoteDrop(ev) {
  const make = toolMeshMakers[ev.tool];
  if (!make || !Number.isFinite(ev.x) || !Number.isFinite(ev.z) || pickupItems.some((i) => i.netId === ev.id)) return;
  const mesh = make();
  mesh.position.y = Number.isFinite(ev.y) ? ev.y : 0.03 + (toolRestOffset[ev.tool] || 0);
  if (ev.tool === 'notebook') {
    extraNotebookMeshes.push(mesh);
    if (notebookWritten && mesh.userData.pageCanvas) { drawNotebookPage(mesh.userData.pageCanvas, true); mesh.userData.pageTexture.needsUpdate = true; }
  }
  addPickupItem(ev.x, ev.z, mesh, () => collectTool(ev.tool));
  pickupItems[pickupItems.length - 1].netId = ev.id;
}

// ほかの人の操作を反映する。instant が true のときは、ドアの開閉の動きを省いて、すぐその状態にする(途中から入ったとき)
function applyWorldEvent(ev, { instant = false } = {}) {
  if (!gameEntered || !ev) return; // マップに入る前に届いたものは捨てる(入った直後に、今の状態をまとめてもらう)
  switch (ev.kind) {
    case 'door': {
      const d = doors[ev.id];
      if (!d || (d === exteriorDoor && huntActive)) return; // ハント中の玄関は、全員で閉まってロックされている
      d.isOpen = !!ev.open;
      if (ev.dir === 1 || ev.dir === -1) d.openDir = ev.dir;
      d.targetRotation = d.isOpen ? (d.openDir || 1) * Math.PI / 2 : 0;
      if (instant) d.hinge.rotation.y = d.targetRotation;
      break;
    }
    case 'breaker': {
      const on = !!ev.on;
      if (breakerOn === on) return;
      breakerOn = on;
      if (onBreakerToggle) onBreakerToggle();
      if (!instant) showPickupNotice(ev.ghost ? 'ブレーカーが落ちた…!' : `${ev.name || 'だれか'}がブレーカーを${on ? '入れた' : '落とした'}`);
      break;
    }
    case 'switch': {
      const sw = lightSwitches[ev.id];
      if (sw && sw.on !== !!ev.on) setSwitchState(sw, !!ev.on);
      break;
    }
    case 'take': {
      const it = pickupItems.find((i) => i.netId === ev.id);
      if (it && !it.collected) { it.collected = true; scene.remove(it.mesh); } // 持ち物にはせず、場所から消すだけ
      break;
    }
    case 'drop': addRemoteDrop(ev); break;
    case 'notebook': writeNotebook(); break;
  }
}

// サーバーが覚えている今の状態を、まとめて反映する(ブレーカー → スイッチの順: スイッチの見た目はブレーカーに左右されるため)
function applyWorldState(state) {
  if (!gameEntered || !state) return;
  const opt = { instant: true };
  if (state.breaker === true || state.breaker === false) applyWorldEvent({ kind: 'breaker', on: state.breaker }, opt);
  Object.entries(state.doors || {}).forEach(([id, open]) => applyWorldEvent({ kind: 'door', id: Number(id), open, dir: (state.doorDirs || {})[id] }, opt));
  Object.entries(state.switches || {}).forEach(([id, on]) => applyWorldEvent({ kind: 'switch', id: Number(id), on }, opt));
  Object.keys(state.taken || {}).forEach((id) => applyWorldEvent({ kind: 'take', id }, opt));
  Object.entries(state.drops || {}).forEach(([id, d]) => applyWorldEvent({ kind: 'drop', id, ...d }, opt));
  if (state.notebook) applyWorldEvent({ kind: 'notebook' }, opt);
}

// ==== オンライン(協力)プレイ: 幽霊・ハント・死亡の同期 ====
// ホストのブラウザだけが、幽霊の動き・ハントの開始と終了・死亡の判定を計算し、その状態を全員へ送る。ほかの人は届いた状態を表示するだけ。
//  - 襲撃(ハント)の開始・終了は全員で同じタイミング。
//  - 正気度は一人ひとり別。ハントが始まりやすさは「生きている人の中で一番低い正気度」で決まり、幽霊は一番低い人を狙う。
//  - 死亡は個人ごと。幽霊が誰かに近づいたらその人だけが死に、その時点でハントは全員分すぐ終わる。
// online-game.js が setNetHooks() で通信の窓口を登録したときだけ動く。登録がなければ(ひとりで遊ぶとき)、これまで通りの処理になる。
//   hooks = { isHost(), myId(), others() => [{ id, name, x, y, z, sanity, alive, out }], sendGhost(state), sendDeath(id), sendVote({ ghost, truth, elapsed }), forceFinalize(), sendWorld(event), requestWorld(), sendJump() }
//   (x, y, z は足元の位置。out は特定などで、この回のプレイをすでに終えている人)
let net = null;
const PLAYER_EYE_HEIGHT = 1.6;       // 足元から目(カメラ)までの高さ
const HUNT_SANITY = 30;              // 一番低い人の正気度がこれ以下だと、ハントが起こりうる
const HUNT_RETARGET_MARGIN = 5;      // 狙う相手は、ほかの人の正気度がこれ以上低くなったときだけ変える(ころころ変わらないように)
const GHOST_SEND_INTERVAL = 0.1;     // ホストが幽霊の状態を送る間隔(秒)
let gameEntered = false;             // マップの中に入ったか(まだなら、位置も正気度も送らない)
let huntTargetId = null;
let huntRetargetTimer = 0;
let ghostSendTimer = 0;
const ghostNetTarget = new THREE.Vector3(); // ホスト以外が見る、幽霊の位置(ここへ滑らかに寄せる)
const orbNetTarget = new THREE.Vector3();   // 同じく、オーブの位置
let ghostNetHasState = false;
const deadPlayerIds = new Set();

function setNetHooks(hooks) { net = hooks || null; }
function getSanity() { return sanity; }
function isGameOver() { return gameOver; }
function hasEnteredGame() { return gameEntered; }

function startHuntEffects() {
  huntActive = true;
  if (!gameOver) showPickupNotice('…気配がする…');
  if (exteriorDoor) { // 家の外に逃げられないよう、玄関を閉めてロックする
    exteriorDoor.isOpen = false;
    exteriorDoor.targetRotation = 0;
    exteriorDoor.locked = true;
  }
}
function stopHuntEffects() {
  huntActive = false;
  if (exteriorDoor) exteriorDoor.locked = false;
}

// ホスト以外: ホストから届いた幽霊の状態を反映する
function applyNetGhost(state) {
  if (!hauntedRoom || !state) return;
  ghostNetTarget.set(state.x, state.y, state.z);
  if (!ghostNetHasState) { ghostNetHasState = true; ghost.position.copy(ghostNetTarget); }
  if (state.orb) { // オーブ: 現れている間だけ、ホストの位置へ寄せる
    orbNetTarget.set(state.orb.x, state.orb.y, state.orb.z);
    if (!orb.visible) { orb.position.copy(orbNetTarget); orb.visible = true; }
  } else orb.visible = false;
  huntTimer = state.left || 0;           // ホストが交代したときに、残り時間を引き継げるように持っておく
  huntTargetId = state.target || null;
  if (gameOver) return;                  // 死んだ(特定を終えた)人の画面は、ハントの演出を出し直さない
  if (state.hunt && !huntActive) startHuntEffects();
  else if (!state.hunt && huntActive) stopHuntEffects();
}

// 全員: 誰かが死んだ(ホストが判定して全員へ知らせる)。本人だけが死亡演出になり、ハントは全員分終わる
function applyPlayerDied(id, name) {
  if (!net || deadPlayerIds.has(id)) return;
  deadPlayerIds.add(id);
  if (huntActive) {
    stopHuntEffects();
    if (hauntedRoom) ghostTarget = randomPointInRoom(hauntedRoom);
  }
  if (id === net.myId()) triggerDeath();
  else showPickupNotice(`${name || 'だれか'} が死んだ…`);
}

// ホスト用: 幽霊に狙われうる(生きていて、マップの中にいる)プレイヤーの一覧
function hostPlayers() {
  const list = [];
  if (gameEntered && !gameOver) {
    list.push({ id: net.myId(), x: camera.position.x, y: camera.position.y - PLAYER_EYE_HEIGHT, z: camera.position.z, sanity });
  }
  net.others().forEach((p) => { if (p.alive && !p.out && Number.isFinite(p.sanity)) list.push(p); });
  return list;
}

// 毎フレーム(操作中かどうかに関わらず)呼ばれる。ホストなら幽霊を動かして状態を送り、ホスト以外なら届いた状態へ寄せるだけ
function updateOnlineGhost(delta) {
  if (!hauntedRoom || !ghost) return;
  if (!net.isHost()) {
    if (ghostNetHasState) ghost.position.lerp(ghostNetTarget, Math.min(1, delta * 10));
    ghost.rotation.y += delta * 0.5;
    if (orb.visible) orb.position.lerp(orbNetTarget, Math.min(1, delta * 10));
    return;
  }

  const players = hostPlayers();
  const lowest = players.reduce((best, p) => (!best || p.sanity < best.sanity ? p : best), null);
  let changed = false; // ハントの開始・終了があったら、すぐに全員へ送る

  if (currentGhost.noHunt || !lowest) {
    if (huntActive) { stopHuntEffects(); changed = true; } // 襲ってこない幽霊や、狙える人がいないときは、ハントしない
  } else if (huntActive) {
    huntTimer -= delta;
    huntRetargetTimer -= delta;
    let target = players.find((p) => p.id === huntTargetId) || null;
    if (!target || (huntRetargetTimer <= 0 && lowest.sanity < target.sanity - HUNT_RETARGET_MARGIN)) {
      huntRetargetTimer = 1;
      target = lowest; huntTargetId = lowest.id; // 一番正気度が低い人を狙う
    }
    const dx = target.x - ghost.position.x, dz = target.z - ghost.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.1) { ghost.position.x += (dx / dist) * 2.2 * delta; ghost.position.z += (dz / dist) * 2.2 * delta; }
    ghostFloorY += (target.y - ghostFloorY) * Math.min(1, delta * 4); // 狙っている人のいる階(上の階にも地下にも)へ

    // 死亡の判定: 幽霊に近づかれた人のうち、一番近い一人だけが死ぬ
    let caught = null, nearest = DEATH_TRIGGER_DIST;
    players.forEach((p) => {
      const d = Math.hypot(p.x - ghost.position.x, p.y + PLAYER_EYE_HEIGHT - ghost.position.y, p.z - ghost.position.z);
      if (d < nearest) { nearest = d; caught = p; }
    });
    if (caught) {
      stopHuntEffects(); // 誰かが死んだら、ハントは全員分すぐ終わる
      ghostTarget = randomPointInRoom(hauntedRoom);
      changed = true;
      net.sendDeath(caught.id);
      applyPlayerDied(caught.id, caught.name);
    } else if (huntTimer <= 0 || lowest.sanity > HUNT_SANITY) {
      stopHuntEffects(); // 時間切れ、または全員の正気度が戻った
      ghostTarget = randomPointInRoom(hauntedRoom);
      changed = true;
    }
  } else {
    // ハントしていないときは、自分の部屋の中だけ徘徊する
    const toTarget = new THREE.Vector3().subVectors(ghostTarget, ghost.position);
    toTarget.y = 0;
    if (toTarget.length() < 0.2) {
      ghostTarget = randomPointInRoom(hauntedRoom);
    } else {
      toTarget.normalize();
      ghost.position.x += toTarget.x * 1.0 * delta;
      ghost.position.z += toTarget.z * 1.0 * delta;
    }
    ghostFloorY += (hauntedFloorY() - ghostFloorY) * Math.min(1, delta * 4);
    if (lowest.sanity <= HUNT_SANITY) {
      huntCheckTimer -= delta;
      if (huntCheckTimer <= 0) {
        huntCheckTimer = 1.5 + Math.random() * 2; // 1.5〜3.5秒ごとに判定するので、いつでも起こりうる
        const chance = 0.12 + (HUNT_SANITY - lowest.sanity) / HUNT_SANITY * 0.38; // 一番低い人の正気度が低いほど起こりやすい(30で12%、0で50%)
        if (Math.random() < chance) {
          startHuntEffects();
          huntTimer = HUNT_MIN_SECONDS + Math.random() * (HUNT_MAX_SECONDS - HUNT_MIN_SECONDS);
          huntTargetId = lowest.id;
          huntRetargetTimer = 1;
          changed = true;
        }
      }
    }
  }

  ghost.position.y = ghostFloorY + 1.0 + Math.sin(clock.elapsedTime * 2) * 0.1;
  ghost.rotation.y += delta * 0.5;
  if (orbRoom) updateOrb(delta); // オーブ(オーブが証拠の幽霊のときだけ出る)もホストが動かして、位置を全員へ送る
  if (breakerTick(delta)) { tripBreaker(); netWorld({ kind: 'breaker', on: false, ghost: true }); } // ポルターガイスト: 幽霊がブレーカーを落とす(落とすのはホストだけ。全員に知らせる)

  ghostSendTimer -= delta;
  if (changed || ghostSendTimer <= 0) {
    ghostSendTimer = GHOST_SEND_INTERVAL;
    net.sendGhost({
      x: ghost.position.x, y: ghost.position.y, z: ghost.position.z,
      hunt: huntActive, left: Math.max(0, huntTimer), target: huntActive ? huntTargetId : null,
      orb: orb.visible ? { x: orb.position.x, y: orb.position.y, z: orb.position.z } : null,
    });
  }
}

let sanityScreenTimer = 0;
let monitorTimer = 0;
let monitorCycleIndex = 0; // 監視カメラは毎回1台ずつ順番に描画する(全台同時だと負荷が増えるため)

const speed = 4;
const clock = new THREE.Clock();

// 性能の確認用: URLに ?perf=1 を付けて開くと、タブの名前に「FPS・描画回数(影の分も含む)・三角形の数」が出る(0.5秒ごと)。
// 遊んでいる最中の重さの原因を探すときに使う。付けなければ、何もしない
const PERF_DEBUG = new URLSearchParams(location.search).get('perf') === '1';
let perfFrames = 0, perfLast = performance.now();
function reportPerf() {
  perfFrames++;
  const now = performance.now();
  if (now - perfLast < 500) return;
  const r = renderer.info.render;
  document.title = `FPS ${Math.round(perfFrames * 1000 / (now - perfLast))} | 描画 ${r.calls}回 | 三角形 ${r.triangles}`;
  perfFrames = 0; perfLast = now;
}

// 見える距離(霧の始まりと終わり)と、描く距離(camera.far)を、いっしょに変える。マップの build から呼ぶ(呼ばなければ、scene.js の初期値: 6〜24m)。
// 霧の終わりより遠くは、霧の色に染まりきって見えないので、描く距離は、霧の終わりより少しだけ先にする(それ以上は、描いても見えない無駄になる)。
// 遠くまで見せるほど、描くものが増えて重くなる
function setViewDistance(fogNear, fogEnd) {
  scene.fog.near = fogNear;
  scene.fog.far = fogEnd;
  camera.far = fogEnd + 4;
  camera.updateProjectionMatrix();
}

// マップの読み込み中(build と enterGame の間)は、時間も進めず、描画もしない。
// 読み込みのための描画(カメラをあちこちに動かして描く)と、ふだんの更新(階段の判定など)が、ぶつからないようにするため
let loadingMap = false;
function setMapLoading(v) { loadingMap = !!v; if (!loadingMap) clock.getDelta(); }

// ---- 三人称視点(C キーで切り替え) ----
// カメラを、自分の後ろ上に下げて描く。当たり判定・操作・幽霊の判定は、いつもの(目の)位置のまま。描くときだけ、カメラをずらして、すぐ戻す。
// 自分の体は、ロビーで選んだスキン(ghost_skin)。手に持つ道具の見た目は、三人称のときは隠す
let thirdPerson = false;
let ownAvatar = null, ownAvatarSkin = null, ownFeetPrev = null;
let ownHopT = -1; // 体ごと跳ねる動き(0〜0.6秒)。-1: 跳んでいない
function ownSkinId() { try { return normalizeSkinId(localStorage.getItem('ghost_skin') || ''); } catch (e) { return normalizeSkinId(''); } }
function buildOwnAvatar() {
  const id = ownSkinId();
  if (ownAvatar && ownAvatarSkin === id) return;
  if (ownAvatar) scene.remove(ownAvatar.group);
  ownAvatarSkin = id;
  ownAvatar = createSkinAvatar(id, 0xffffff, { ringOpacity: 0 }) || createPlaceholderAvatar(0xffffff, { ringOpacity: 0 });
  ownAvatar.group.visible = false;
  scene.add(ownAvatar.group);
  loadSkin(id).then(() => { if (ownAvatarSkin === id) { scene.remove(ownAvatar.group); ownAvatar = createSkinAvatar(id, 0xffffff, { ringOpacity: 0 }) || ownAvatar; ownAvatar.group.visible = thirdPerson; scene.add(ownAvatar.group); } }); // 読み込めたら、そのスキンに差し替える
}
function toggleThirdPerson() {
  thirdPerson = !thirdPerson;
  if (thirdPerson) buildOwnAvatar();
  if (ownAvatar) ownAvatar.group.visible = thirdPerson;
}
const tpEye = new THREE.Vector3(), tpDir = new THREE.Vector3();
// 三人称のときだけ、描く直前にカメラをずらす(begin)。描いたあとに戻す(end)。描く行(renderer.render)自体は、animate の中にそのまま残してある
// (影の更新の行と並んでいることを、test/loading.test.js が確かめているため)
function beginThirdPersonView(delta) {
  if (!thirdPerson || !ownAvatar) return null;
  const g = ownAvatar.group;
  const feetY = camera.position.y - PLAYER_EYE_HEIGHT;
  // 実際に動いた速さから、歩きの動きを決める(止まっている間は歩かない)
  const speed = ownFeetPrev && delta > 0 ? Math.hypot(camera.position.x - ownFeetPrev.x, camera.position.z - ownFeetPrev.z) / delta : 0;
  ownFeetPrev = { x: camera.position.x, z: camera.position.z };
  let hop = 0;
  if (ownHopT >= 0) { // ジャンプの動きがないスキン(ロボット・カプセル)だけ、体ごと放物線で跳ねる(動きがあるスキンは、その動きに任せる)
    ownHopT += delta;
    if (ownHopT >= 0.6) ownHopT = -1; else if (!ownAvatar.jump) { const u = ownHopT / 0.6; hop = 0.5 * 4 * u * (1 - u); }
  }
  g.position.set(camera.position.x, feetY + hop, camera.position.z);
  g.rotation.y = camera.rotation.y; // 見ている向きに体を向ける(ほかの人に見える向きと同じ)
  g.visible = true;
  if (delta > 0) ownAvatar.update(delta, speed);
  tpEye.copy(camera.position);
  camera.getWorldDirection(tpDir);
  const p = thirdPersonPosition(tpEye, tpDir, (x, z) => collidesWithWalls(x, z, 0.15), { minY: feetY + 0.3 });
  const vis = Object.keys(viewmodels).map((k) => [viewmodels[k], viewmodels[k].visible]);
  vis.forEach(([v]) => { v.visible = false; });
  camera.position.set(p.x, p.y, p.z);
  return { vis };
}
function endThirdPersonView(state) {
  if (!state) return;
  camera.position.copy(tpEye);
  state.vis.forEach(([v, was]) => { v.visible = was; });
}

function animate() {
  requestAnimationFrame(animate);
  if (loadingMap) { clock.getDelta(); return; }
  const delta = clock.getDelta();
  if (deathMixer) deathMixer.update(delta);
  if (ghostMixer) ghostMixer.update(delta);
  if (net) updateOnlineGhost(delta); // オンライン: 一時停止中でも、幽霊とハントは止めない(ホストが止まるとみんなの幽霊も止まってしまうため)

  const journalPad = pollGamepad();
  if (journalPad) updateJournalPad(journalPad, delta); // ＋で調査書を開閉。開いている間は、十字キー・ボタンで操作する(視点の固定中でなくても動く)

  if (inControl()) {
    const move = speed * delta;
    const prevX = camera.position.x;
    const prevZ = camera.position.z;
    if (!journalOpen) { // 調査書を開いている間は、歩かない
      if (keys['KeyW']) controls.moveForward(move);
      if (keys['KeyS']) controls.moveForward(-move);
      if (keys['KeyA']) controls.moveRight(-move);
      if (keys['KeyD']) controls.moveRight(move);
    }

    const pad = pollGamepad();
    if (pad && !journalOpen) {
      const lx = deadzone(pad.axes[0] || 0);
      const ly = deadzone(pad.axes[1] || 0);
      const rx = deadzone(pad.axes[2] || 0);
      const ry = deadzone(pad.axes[3] || 0);
      if (ly !== 0) controls.moveForward(-ly * move);
      if (lx !== 0) controls.moveRight(lx * move);
      camera.rotation.y -= rx * 2.0 * delta;
      camera.rotation.x = Math.max(-1.3, Math.min(1.3, camera.rotation.x - ry * 1.5 * delta));

      // Switchのコントローラーの配置(標準マッピング): [0]=下のボタン(B)、[2]=左のボタン(Y)、[3]=上のボタン(X)
      const aPressed = !!(pad.buttons[0] && pad.buttons[0].pressed); // 下のボタン(B): ジャンプ(見た目だけ)。ものを拾う・ドア・スイッチは、左のボタン(Y)
      if (aPressed && !gpPrevButtons[0]) tryJump();
      gpPrevButtons[0] = aPressed;

      const yPressed = !!(pad.buttons[2] && pad.buttons[2].pressed); // 左のボタン(Y): ものを拾う・ドアを開け閉めする・照明のスイッチ・ブレーカー(クリックと同じ操作)
      if (yPressed && !gpPrevButtons[2]) tryInteract();
      gpPrevButtons[2] = yPressed;

      const xPressed = !!(pad.buttons[3] && pad.buttons[3].pressed); // 上のボタン(X): 道具を使う(右のトリガーZRと同じ)
      if (xPressed && !gpPrevButtons[3]) toggleCurrentTool();
      gpPrevButtons[3] = xPressed;

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
      const nx = camera.position.x, nz = camera.position.z;
      if (!collidesWithWalls(nx, prevZ)) { // 壁にそって、横にだけ動く(滑る)
        camera.position.z = prevZ;
      } else if (!collidesWithWalls(prevX, nz)) {
        camera.position.x = prevX;
      } else {
        camera.position.x = prevX;
        camera.position.z = prevZ;
      }
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
    // ブレーカーが上がっていて、その部屋のスイッチもオン(=電気がついている)の部屋では減らない
    if (currentRoomName !== "外") {
      const roomIsLit = breakerOn && lightSwitches.some(sw => sw.roomName === currentRoomName && sw.on);
      if (!roomIsLit) {
        sanity = Math.max(0, sanity - (100 / 180) * delta); // 約3分で0まで減る計算
      }
    }
    sanityScreenTimer += delta;
    if (sanityScreenTimer > 0.5) {
      sanityScreenTimer = 0;
      drawSanityScreen(sanity);
      updateSanityHud(sanity);
    }

    // 扉を目標角度(開/閉)へ滑らかに近づける
    doors.forEach(door => {
      door.hinge.rotation.y += (door.targetRotation - door.hinge.rotation.y) * Math.min(1, delta * 6);
    });

    // 幽霊の移動(自分の部屋の中だけ徘徊。家具や壁はすり抜ける)。オンラインのときは updateOnlineGhost() が担当するので、ここはひとりで遊ぶときだけ
    if (!net) {
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
    // 普段は幽霊の部屋がある階の高さ、ハント中はプレイヤーがいる階の高さ(上の階にも、地下にも)。階の移動は滑らかに行う
    const targetFloorY = huntActive
      ? (currentUpperFloor > 0 ? upperFloorHeights[currentUpperFloor] : (onGroundFloor ? 0 : basementFloorY))
      : hauntedFloorY();
    ghostFloorY += (targetFloorY - ghostFloorY) * Math.min(1, delta * 4);
    ghost.position.y = ghostFloorY + 1.0 + Math.sin(clock.elapsedTime * 2) * 0.1;
    ghost.rotation.y += delta * 0.5;
    }

    // 懐中電灯を向けると少しはっきり見える
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const toGhost = new THREE.Vector3().subVectors(ghost.position, camera.position);
    const ghostDist = toGhost.length();
    toGhost.normalize();
    const lookingAtGhost = camDir.angleTo(toGhost) < 0.3 && ghostDist < 6;

    // 正気度が30以下の間、幽霊がいつプレイヤーを襲ってきてもおかしくない状態にする(ひとりで遊ぶときだけ。オンラインは updateOnlineGhost() が担当)
    if (!net) {
    if (sanity <= 30 && !currentGhost.noHunt) { // 襲ってこない幽霊(ハヤト)は、正気度が下がってもハントを起こさない
      if (huntActive) {
        huntTimer -= delta;
        if (ghostDist < DEATH_TRIGGER_DIST) {
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
            huntTimer = HUNT_MIN_SECONDS + Math.random() * (HUNT_MAX_SECONDS - HUNT_MIN_SECONDS);
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
    }

    updateHuntVignette();
    ghostMaterial.opacity = huntActive ? 0.9 : (lookingAtGhost ? 0.75 : 0.35);
    ghostModelMaterials.forEach((m) => { m.opacity = ghostMaterial.opacity; }); // モデル版のときも同じ透明度にそろえる


    // EMFリーダー(Eキーでオン/オフ、入手済みの場合のみ)
    if (emfActive) {
      const level = emfLevelAt(ghostDist, currentGhost.evidence.includes("EMF5"));
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
      const inHauntedRoomForNotebook = playerInHauntedRoom(camera.position.x, camera.position.z);
      if (inHauntedRoomForNotebook) {
        notebookTimer -= delta;
        if (notebookTimer <= 0 && currentGhost.evidence.includes("ゴーストライティング")) {
          writeNotebook();
          netWorld({ kind: 'notebook' }); // オンライン: 書かれたのは、全員のノートに(一人が書かれたら、みんなに書かれる)
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
        // 決まった言葉を持つ幽霊(ハヤト)は、範囲内なら毎回その言葉で応える。それ以外は今まで通り半分の確率でランダムな言葉
        if (canRespond && (currentGhost.spiritBoxWord || Math.random() < 0.5)) {
          const word = currentGhost.spiritBoxWord || spiritBoxWords[Math.floor(Math.random() * spiritBoxWords.length)];
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
    if (!net) { // オンラインのオーブ・ブレーカーは、ホストが動かして全員へ送る(updateOnlineGhost)
      updateOrb(delta);
      if (breakerTick(delta)) tripBreaker(); // ポルターガイスト: 上がっているブレーカーを、幽霊が落とす
    }
  }

  // 監視カメラの映像をモニターへ(負荷を抑えるため、1回のタイマーで1台ずつ順番に更新)。カメラが無いマップなら何もしない
  // 1台が更新される間隔 = MONITOR_INTERVAL × カメラの台数(Graftonの6台なら0.12×6≒0.7秒、一軒家の4台なら約0.5秒)
  monitorTimer += delta;
  if (monitorTimer > MONITOR_INTERVAL && videoCams.length > 0) {
    monitorTimer = 0;
    const cam = videoCams[monitorCycleIndex];
    renderer.setRenderTarget(cam.rt);
    renderer.render(scene, cam.camera);
    renderer.setRenderTarget(null);
    monitorCycleIndex = (monitorCycleIndex + 1) % videoCams.length;
  }

  updateGazeHint();
  updateHuntFlicker(delta);

  const tpView = beginThirdPersonView(delta); // 三人称のときだけ、カメラをずらす(下の描画のあとに戻す)
  renderer.shadowMap.needsUpdate = flashlight.intensity > 0; // 懐中電灯が消えている間は、影を描かない(影が見えないので、見た目は同じ)
  renderer.render(scene, camera);
  endThirdPersonView(tpView);
  if (PERF_DEBUG) reportPerf();
}
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// マップ選択画面でマップが選ばれたときに main.js から呼ぶ。マップの構築(build())は既にこの時点で終わっている前提。
// このクリックがそのままポインターロック開始の合図になる(別途「クリックで開始」は挟まない)ので、
// 部屋を巡回してシェーダー・影を温める処理もここで行う(選ばれなかった方のマップのぶんまで温める必要が無い)
// 部屋を巡って描画しておく間隔(m)。細長い廊下は、この間隔ごとに1か所ずつ立ち止まって、四方を向く
const WARMUP_SPACING = 12;

// マップに入る前の「読み込み」。最初に時間をかけて、遊び始めてからのカクつきを減らす:
//   1) 幽霊・死亡演出のモデル(FBX)の読み込みを待つ
//   2) ふだんは隠れているもの(幽霊・オーブ・手に持つ道具・死亡演出のモデル)を、一度だけ画面に出して、シェーダーと画像を準備する
//   3) すべての部屋(広い部屋・長い廊下は複数の場所)で、四方を向いて描画して、壁・床・家具の形を、GPU に送っておく(階の高さも合わせる)
//   4) 監視カメラの映像を、一度描く
// 時間を区切って進める(1回に約40ミリ秒まで)ので、読み込み中も画面は固まらず、進み具合が出せる。
// opts.onProgress(割合0〜1, 文字): ロード画面の表示を更新して、ブラウザに描画の時間を渡す関数(main.js が渡す。なくても動く)
async function enterGame(opts = {}) {
  const report = opts.onProgress || (async () => {});
  const savedX = camera.position.x, savedY = camera.position.y, savedZ = camera.position.z;
  const savedRotY = camera.rotation.y;
  const savedFlashIntensity = flashlight.intensity;
  loadingMap = true;
  try {
    flashlight.intensity = 1.2; // 影のシェーダーも温めるため、読み込み中だけ点灯させておく

    // 1) モデルの読み込みを待つ(つながりが悪くても、20秒で諦めて進む)
    await report(0.0, 'モデルを読み込んでいます');
    await Promise.race([Promise.all([ghostModelReady, deathModelReady]), new Promise((r) => setTimeout(r, 20000))]);

    // 2) 隠れているものを一度だけ出して、シェーダーを準備する(カメラの前 2.5m に置く)
    await report(0.08, '描画の準備をしています');
    const fx = -Math.sin(savedRotY) * 2.5, fz = -Math.cos(savedRotY) * 2.5;
    const savedGhostPos = ghost.position.clone(), savedGhostVisible = ghost.visible;
    const savedOrbPos = orb.position.clone(), savedOrbVisible = orb.visible;
    const savedViewVisible = Object.fromEntries(Object.entries(viewmodels).map(([k, v]) => [k, v.visible]));
    ghost.position.set(savedX + fx, savedY - 0.6, savedZ + fz); ghost.visible = true;
    orb.position.set(savedX + fx * 0.6, savedY - 0.3, savedZ + fz * 0.6); orb.visible = true;
    Object.values(viewmodels).forEach((v) => { v.visible = true; });
    let scare = null;
    if (deathModel) { scare = SkeletonUtils.clone(deathModel); scare.position.set(savedX + fx, savedY - 1.6, savedZ + fz); scene.add(scare); }
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); // シェーダーの組み立ては、並列に(画面を止めずに)行う
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    if (scare) scene.remove(scare);
    ghost.position.copy(savedGhostPos); ghost.visible = savedGhostVisible;
    orb.position.copy(savedOrbPos); orb.visible = savedOrbVisible;
    Object.entries(viewmodels).forEach(([k, v]) => { v.visible = savedViewVisible[k]; });

    // 3) 部屋を巡る。階が上・下にある部屋は、その階の目の高さで
    const jobs = [];
    rooms.forEach((r) => {
      const b = r.bounds, up = r.upperFloor ? (upperFloorHeights[r.upperFloor] || 0) : 0;
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
      const n = Math.max(1, Math.round(Math.max(w, d) / WARMUP_SPACING));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = w >= d ? b.minX + w * t : (b.minX + b.maxX) / 2;
        const z = w >= d ? (b.minZ + b.maxZ) / 2 : b.minZ + d * t;
        [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((ry) => jobs.push({ x, y: savedY + up, z, ry }));
      }
    });
    let sliceStart = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      camera.position.set(j.x, j.y, j.z);
      camera.rotation.y = j.ry;
      renderer.shadowMap.needsUpdate = true; // 影の描画の準備も、部屋ごとに行う
      renderer.render(scene, camera);
      if (performance.now() - sliceStart > 40) {
        await report(0.15 + 0.75 * (i + 1) / jobs.length, 'マップ全体を読み込んでいます');
        sliceStart = performance.now();
      }
    }

    camera.position.set(savedX, savedY, savedZ);
    camera.rotation.y = savedRotY;
    flashlight.intensity = savedFlashIntensity;

    // 4) 監視カメラの映像を、一度描く
    await report(0.92, '監視カメラを準備しています');
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    for (const cam of videoCams) {
      renderer.setRenderTarget(cam.rt);
      renderer.render(scene, cam.camera);
    }
    renderer.setRenderTarget(null);
    await report(1.0, '準備ができました');
  } finally {
    camera.position.set(savedX, savedY, savedZ);
    camera.rotation.y = savedRotY;
    flashlight.intensity = savedFlashIntensity;
    renderer.setRenderTarget(null);
    loadingMap = false;
    clock.getDelta();
  }

  mapSelectOverlay.style.display = 'none';
  info.style.display = 'block';
  gameEntered = true; // オンライン: ここから、位置と正気度を送り、幽霊に狙われる対象になる
  pickupItems.forEach((it, i) => { if (!it.netId) it.netId = 's' + i; }); // 床や壁の道具に、全員で同じ目印を振る(マップの組み立て順は全員同じ)
  if (net && net.requestWorld) net.requestWorld(); // 先に入っていた人が開けたドアなどを、今の状態にそろえてもらう
  if (!padPlay) { // コントローラー開始のときは、ポインターロックを始められない(クリックではないため)
    // 読み込みに時間がかかると、クリックから何秒もたってしまい、ブラウザがポインターロックを断ることがある。その場合は「クリックして開始」を出す
    try { controls.lock(); } catch (e) { /* 下で案内を出す */ }
    setTimeout(() => { if (!controls.isLocked && !padPlay) info.textContent = 'クリックして開始'; }, 400);
  }
}

// マップ(main.js側)が、マップ選択への登録を全部終えた後に呼ぶ。
// この時点ではまだどのマップも構築されていない(選ばれてから初めてbuild()される)ので、
// ここでの「読み込み中」はページの初期化だけを指す。部屋を巡る本格的な温めはenterGame()側で行う
function startEngine() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'gh-loading';
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
  addFurniture, addDetailMesh, addLeg, addLegsUnder, collidesWithWalls, pushWallBox,
  makeWoodTexture, makeTileTexture, makeWallTexture, makeConcreteTexture, makeDoorTexture, makeGrassTexture, scaled,
  woodBase, tileBase, wallBase,
  woodFurnitureMaterial, ceramicMaterial, fabricMaterial, metalMaterial, mattressMaterial, handleMaterial, countertopMaterial,
  bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn,
  addSurveillanceCamera, videoCams,
  addPickupItem, pickupItems, addToolPegboard, registerFlickerLight,
  makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool,
  notebookWorldMesh,
  showPickupNotice,
  sanity, drawSanityScreen, sanityTexture,
  addRoomLight, addLightSwitch, lightSwitches, updateRoomLightCulling,
  breakerOn, registerBreaker, setBreakerOn, setBasementFloorY,
  ghostTypes, initHaunting, setExteriorDoor, setOrbRoom, currentGhost, hauntedRoom, ghost,
  onFrame,
  addMapCard, startEngine, enterGame, setMapLoading, setViewDistance,
  setOnGroundFloor, setNotebookWorldMesh, requestPadStart,
  setHauntSeed, setNetHooks, applyNetGhost, applyPlayerDied, getSanity, isGameOver, hasEnteredGame,
  applyVoteUpdate, applyIdentifyResult, applyWorldEvent, applyWorldState, applyMoneyUpdate,
  setDifficulty, getDifficultyId,
};
