// 道具のモデル(手に持つ/壁に掛ける見た目)と、ペグボード(道具を並べて掛ける壁掛けの板)。
// ゲーム本編(engine.js)とロビー(lobby.js)で、同じ見た目の道具を使うために共有している。
// 道具のモデルは1つ1つが自己完結していて、画面やLEDはuserDataに入れてあり、使う側が後から光らせたり書き換えたりする。
import * as THREE from 'three';

// 道具の表示名とアイコン(ホットバー用)
export const toolNames = { flashlight: '懐中電灯', emf: 'EMFリーダー', thermometer: '温度計', notebook: 'ノート', spiritbox: 'スピリットボックス', uv: 'UVライト', dots: 'D.O.T.S投光器' };
export const toolIcons = { flashlight: '🔦', emf: '📡', thermometer: '🌡️', notebook: '📓', spiritbox: '📻', uv: '🔮', dots: '📽️' };

// 道具のメッシュ生成・収集・所持解除は、拾うときと捨てるときの両方で使い回す
export function makeFlashlightItemMesh() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 8), mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function makeEMFItemMesh() {
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

export function makeThermoItemMesh() {
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

// スピリットボックス(本体+アンテナ+スピーカーの網目)。原点は底面
export function makeSpiritBoxItemMesh() {
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
export function makeUVItemMesh() {
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
export function makeDotsItemMesh() {
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


// 手に持つ見た目(画面右下)の位置・向き・大きさ。ゲーム本編とロビーで同じ構えにする
export const viewmodelBase = { position: [0.34, -0.2, -0.62], rotation: [0.12, -0.4, 0.05], scale: 1.4 };
export const viewmodelOverrides = {
  flashlight: { rotation: [0.55, -0.4, 0.05] },
  thermometer: { position: [0.32, -0.26, -0.5], rotation: [0.3, -0.55, 0.15], scale: 1.8 },
  notebook: { position: [0.32, -0.26, -0.5], rotation: [0.3, -0.55, 0.15], scale: 1.8 },
  spiritbox: { position: [0.3, -0.28, -0.5], rotation: [0.2, -0.4, 0.05], scale: 1.6 },
  uv: { rotation: [0.55, -0.4, 0.05] },
  dots: { position: [0.32, -0.26, -0.52], rotation: [0.15, -0.4, 0.05], scale: 1.5 },
};

// 道具の名前→モデルを作る関数(ペグボードに掛ける6種類)
const hangMakers = {
  flashlight: makeFlashlightItemMesh, emf: makeEMFItemMesh, thermometer: makeThermoItemMesh,
  spiritbox: makeSpiritBoxItemMesh, uv: makeUVItemMesh, dots: makeDotsItemMesh,
};

// ペグボード(壁掛けの道具置き場)を作る。シーンへの追加はしない。呼び出し側が group と items[].mesh を scene に足す。
//   x, z   : ボードの前面の中心(壁の面の位置)
//   rotY   : ボードの前(部屋の側)を向ける回転。0なら+Z側が前、-Math.PI/2なら-X側が前(東の壁に付けるとき)
//   length : 壁に沿った長さ(m)、baseY: ボード下端の高さ、height: ボードの高さ
//   tools  : 掛ける道具の名前の配列(flashlight, emf, thermometer, spiritbox, uv, dots)。左から順に並ぶ
//   copies : 1種類あたりの数(1〜4)。2列×2段のかたまりで掛ける
//   woodMaterial: 梁と棚に使う木の素材(使う側の画面の質感に合わせて渡す)
// 戻り値: { group, items: [{ tool, mesh, center }] }。meshは世界座標に置いてある(sceneの直下に追加すること)
export function createPegboard({ x, z, rotY, length = 3.6, baseY = 0.5, height = 1.0, tools, copies = 4, woodMaterial }) {
  const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
  // ボード上の座標(lx=壁に沿って右、ly=高さ、lz=壁から部屋側へ)を、世界の座標に直す
  const toWorld = (lx, ly, lz) => new THREE.Vector3(x + lx * cosR + lz * sinR, ly, z - lx * sinR + lz * cosR);

  // ---- ボード本体(穴あきの灰色の板+上の梁+下の棚+上の照明+道具の名札) ----
  const board = new THREE.Group();
  board.position.set(x, 0, z);
  board.rotation.y = rotY;

  const holeCanvas = document.createElement('canvas');
  holeCanvas.width = holeCanvas.height = 128;
  const hctx = holeCanvas.getContext('2d');
  hctx.fillStyle = '#80858a';
  hctx.fillRect(0, 0, 128, 128);
  hctx.fillStyle = '#2e3134';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    hctx.beginPath(); hctx.arc(8 + i * 16, 8 + j * 16, 2.6, 0, Math.PI * 2); hctx.fill();
  }
  const holeTex = new THREE.CanvasTexture(holeCanvas);
  holeTex.colorSpace = THREE.SRGBColorSpace;
  holeTex.wrapS = holeTex.wrapT = THREE.RepeatWrapping;
  holeTex.repeat.set(length / 0.25, height / 0.25); // 0.25mごとに8つの穴(約3cm間隔)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(length, height, 0.03), new THREE.MeshLambertMaterial({ map: holeTex }));
  panel.position.set(0, baseY + height / 2, -0.015);
  board.add(panel);

  const woodMat = woodMaterial || new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(length + 0.1, 0.1, 0.1), woodMat);
  beam.position.set(0, baseY + height + 0.05, 0.02);
  board.add(beam);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(length + 0.1, 0.05, 0.14), woodMat);
  shelf.position.set(0, baseY - 0.025, 0.04);
  board.add(shelf);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
  for (let i = 0; i < 4; i++) { // 上の細長い照明(見た目だけ)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.022, 0.05), lampMat);
    lamp.position.set(((i + 0.5) / 4 - 0.5) * length, baseY + height - 0.03, 0.05);
    board.add(lamp);
  }

  // ---- 道具の掛け方(ボードの前面を+Zとして、どの向きで掛けると自然か) ----
  // rx: 横倒しの形で作られている道具を、縦に立てる回転。ry: 画面・レンズ・先端を向けたい向きに合わせる回転
  const hang = {
    flashlight: { rx: Math.PI / 2, ry: 0 },             // 頭を上にして縦に掛ける
    emf: { rx: 0, ry: 0 },                               // LEDを部屋側に向ける
    thermometer: { rx: 0, ry: -Math.PI / 2 },           // 先端を壁に沿って横に向ける(グリップを下に)
    spiritbox: { rx: 0, ry: 0 },
    uv: { rx: Math.PI / 2, ry: 0 },                      // レンズを上にして縦に掛ける
    dots: { rx: 0, ry: Math.PI },                        // レンズを部屋側に向ける
  };
  // 1種類ぶんのかたまり: 2列×2段。段の中心の高さは、下の段・上の段の順(1段だけのときは真ん中)
  const cols = copies >= 2 ? 2 : 1, rowsCount = copies >= 3 ? 2 : 1;
  const rowYs = rowsCount === 1 ? [baseY + height * 0.55] : [baseY + 0.34, baseY + 0.78];
  const colGap = 0.24; // 同じ段で並ぶ2つの道具の中心の間隔
  const items = [];
  tools.forEach((tool, i) => {
    const h = hang[tool], make = hangMakers[tool];
    if (!h || !make) return;
    const clusterX = ((i + 0.5) / tools.length - 0.5) * length;
    for (let k = 0; k < Math.min(copies, 4); k++) {
      const col = k % cols, row = Math.floor(k / cols);
      const lx = clusterX + (col - (cols - 1) / 2) * colGap, rowY = rowYs[row];
      const w = new THREE.Group(); // 向きを整えるための入れ物(中の道具が持つ元の向きは変えない)
      w.add(make());
      w.rotation.order = 'YXZ';
      w.rotation.set(h.rx, h.ry, 0);
      w.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(w); // ボード上の向きでの大きさ(まだ壁の向きは掛けていない)
      const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
      const depth = box.max.z - box.min.z;
      w.position.copy(toWorld(lx - cx, rowY - cy, 0.012 - box.min.z)); // 背面をボードの面に付ける
      w.rotation.set(h.rx, h.ry + rotY, 0);
      items.push({ tool, mesh: w, center: toWorld(lx, rowY, 0.012 + depth / 2) });
    }

    // 道具の名札(かたまりの下の帯に貼る)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 52;
    const lctx = labelCanvas.getContext('2d');
    lctx.fillStyle = 'rgba(15,15,15,0.55)';
    lctx.fillRect(0, 0, 256, 52);
    lctx.fillStyle = '#e8e8e8';
    lctx.font = 'bold 26px sans-serif';
    lctx.textAlign = 'center';
    lctx.fillText(toolNames[tool], 128, 36);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
    label.position.set(clusterX, baseY + 0.07, 0.004);
    board.add(label);
  });
  return { group: board, items };
}
