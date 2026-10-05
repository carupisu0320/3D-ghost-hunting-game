// プレイヤーの見た目(黒いロボット)。ロビーで、ほかのプレイヤーを表示するのに使う。
// 元のモデル(FBX)は、骨もアニメーションもない1枚のメッシュで、立った姿勢のまま固まっている。
// そこで、読み込み時に簡易の骨(腰×2・肩×2)を入れて、頂点の位置から「どの骨にどれだけ引っ張られるか」を計算する。
// 歩くときだけ、その骨を振って、手足を動かす。止まっているときは骨を元の角度に戻して、モデルの元の姿勢で立つ。
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const ROBOT_HEIGHT = 1.7; // 元のモデルは約1.0m。プレイヤーの目の高さ(1.65m)に合わせて、背の高さをこの値にそろえる

// 関節の位置(モデルの元の大きさ=高さ1.0での値)
const HIP_Y = 0.36, HIP_X = 0.085;
const SHOULDER_Y = 0.70, SHOULDER_X = 0.17;

const smooth = (edge0, edge1, v) => { const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

// 頂点ごとの骨の重みを計算して、geometryに入れる。骨の番号: 0=体全体 1=左脚(+X) 2=右脚(-X) 3=左腕(+X) 4=右腕(-X)
// 足は高さ0.2以下、腕は体の外側(|x|が大きい)で肩より下、という形のモデルなので、位置から決められる
export function computeSkinWeights(geometry) {
  const pos = geometry.attributes.position;
  const skinIndex = new Uint16Array(pos.count * 4), skinWeight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), ax = Math.abs(x);
    // 腕: 体の外側にあって、肩(0.78)から下に向かって1になる。足の高さ(0.2以下)は腕ではない
    //  腰より上(0.2〜0.5)では、脚と腕の間に隙間(x=0.13)があるので、そこではっきり分ける。胸のあたり(0.5〜0.64)は、体との境目を外側へずらしながら、ゆっくり移る
    const a0 = y < 0.5 ? 0.128 : y < 0.64 ? 0.128 + (y - 0.5) / 0.14 * 0.03 : 0.158;
    let wa = y < 0.2 ? 0 : smooth(a0, a0 + (y < 0.5 ? 0.012 : 0.03), ax) * smooth(0.77, 0.62, y);
    // 脚: 足(0.2以下)は全部、そこから腰(0.40)に向かってだんだん体に移る。腕の分を引いた残り
    let wl = y < 0.2 ? 1 : smooth(0.40, 0.28, y) * (1 - wa);
    const wr = Math.max(0, 1 - wa - wl);
    const left = smooth(-0.02, 0.02, x); // +X側なら1、-X側なら0。中央のすぐそばでは両方に半分ずつ
    const w = [[0, wr], [1, wl * left], [2, wl * (1 - left)], [3, wa * left], [4, wa * (1 - left)]].filter(p => p[1] > 1e-4);
    w.sort((a, b) => b[1] - a[1]);
    const top = w.slice(0, 4); const sum = top.reduce((s, p) => s + p[1], 0) || 1;
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = top[k] ? top[k][0] : 0; skinWeight[i * 4 + k] = top[k] ? top[k][1] / sum : 0; }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// 骨を入れたSkinnedMeshを作る(geometryは、足がY=0・前が-Z・高さ約1.0の向きに直したもの)
function buildSkinnedMesh(geometry, material) {
  const root = new THREE.Bone(); root.name = 'root';
  const mk = (name, x, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); root.add(b); return b; };
  const bones = [root, mk('hipL', HIP_X, HIP_Y), mk('hipR', -HIP_X, HIP_Y), mk('shoulderL', SHOULDER_X, SHOULDER_Y), mk('shoulderR', -SHOULDER_X, SHOULDER_Y)];
  root.updateMatrixWorld(true);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false; // 骨で動く体は、元の大きさの枠からはみ出して見えなくならないように
  return mesh;
}

// ロボットのひな形(1つだけ作って、プレイヤーごとにcloneして使う)を読み込む。失敗したらnullを返す
export function loadRobotTemplate(baseUrl = './robot/') {
  return new Promise((resolve) => {
    new FBXLoader().load(baseUrl + 'robot.fbx', (fbx) => {
      try {
        let src = null;
        fbx.updateMatrixWorld(true);
        fbx.traverse((o) => { if (o.isMesh && !src) src = o; });
        const geometry = src.geometry.clone();
        geometry.applyMatrix4(src.matrixWorld); // FBXはZ軸が上なので、Y軸が上になる向きに直す(足がY=0、前が-Z)
        geometry.computeBoundingBox();
        geometry.translate(0, -geometry.boundingBox.min.y, 0);
        computeSkinWeights(geometry);
        const loader = new THREE.TextureLoader();
        const tex = (name, srgb) => { const t = loader.load(baseUrl + name); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
        // 黒いロボットなので、つやを抑える(ロビーには明るい照明が多く、金属感を強くすると、銀色っぽく光りすぎる)
        const material = new THREE.MeshStandardMaterial({
          map: tex('black_robot_3d_model1_basecolor.JPEG', true),
          normalMap: tex('black_robot_3d_model1_normal.JPEG', false),
          metalness: 0.2, roughness: 0.72,
        });
        const template = buildSkinnedMesh(geometry, material);
        template.scale.setScalar(ROBOT_HEIGHT / geometry.boundingBox.getSize(new THREE.Vector3()).y);
        resolve(template);
      } catch (e) { console.warn('ロボットのモデルの準備に失敗しました', e); resolve(null); }
    }, undefined, (e) => { console.warn('ロボットのモデル(robot/robot.fbx)の読み込みに失敗しました', e); resolve(null); });
  });
}

// プレイヤー1人ぶんのロボットを作る。colorはそのプレイヤーの識別色(足元のリングと、ほんのりした発光に使う)
//   update(delta, speed): 毎フレーム呼ぶ。speedは今の移動の速さ(m/秒)。歩いている間だけ手足を振る
export function createRobotAvatar(template, color, { ringOpacity = 0.85 } = {}) {
  const group = new THREE.Group();
  const body = SkeletonUtils.clone(template);
  body.material = template.material.clone(); // 色の発光をプレイヤーごとに変えるため
  body.material.emissive = new THREE.Color(color).multiplyScalar(0.12);
  group.add(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ringOpacity, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  group.add(ring);

  const bones = {};
  body.skeleton.bones.forEach((b) => { bones[b.name] = b; });
  let phase = 0, walk = 0; // phase=歩きの周期の位置、walk=0(立ち止まり)〜1(歩き)
  const STRIDE = 2.4;      // 1周期(左右の足が1歩ずつ)で進む距離(m)
  function update(delta, speed) {
    const moving = speed > 0.35;
    walk += ((moving ? 1 : 0) - walk) * Math.min(1, delta * 12); // 止まったら、すばやく元の姿勢に戻る
    if (walk < 0.002) walk = 0;
    if (moving) phase += Math.min(speed, 6) * delta * (Math.PI * 2 / STRIDE);
    const s = Math.sin(phase) * walk;
    bones.hipL.rotation.x = s * 0.5;  bones.hipR.rotation.x = -s * 0.5;      // 脚: 左右で逆に前後へ振る
    bones.shoulderL.rotation.x = -s * 0.38; bones.shoulderR.rotation.x = s * 0.38; // 腕: 同じ側の脚とは逆に振る
    bones.root.position.y = Math.abs(Math.cos(phase)) * 0.018 * walk;           // 歩くときの、体の小さな上下
    bones.root.rotation.y = s * 0.05;                                             // 歩くときの、体の小さなひねり
  }
  return { group, body, update, get walk() { return walk; } };
}
