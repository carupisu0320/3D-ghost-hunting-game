// プレイヤーの見た目(東方仗助)。skins.js から使う。
// 元のモデル(GLB)は、骨もアニメーションもない1枚のメッシュで、腕を横に広げた姿勢(Tポーズ)で固まっている。
// そこで、読み込み時に簡易の骨(腰×2・肩×2)を入れて、頂点の位置から「どの骨にどれだけ引っ張られるか」を計算する(lobby-avatar.js のロボットと同じ作り)。
// 腕は、常に少し下ろした姿勢にして(Tポーズのままにしない)、歩くときだけ手足を振る。止まっているときは、腕を下ろした姿勢で立つ。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const JOSUKE_HEIGHT = 1.75; // 背の高さ(m)。リーゼントを含む。変えたいときはここ

// 関節の位置(モデルの高さを1.0にそろえたときの値)
const HIP_Y = 0.40, HIP_X = 0.075;
const SHOULDER_Y = 0.80, SHOULDER_X = 0.17;

const REST_ARM = 1.3;  // 腕を下ろす角度(ラジアン。1.57で真下)
const LEG_SWING = 0.6, ARM_SWING = 0.45; // 歩くときの手足の振り幅(ラジアン)
const STRIDE = 1.6;    // 1周期(左右の足が1歩ずつ)で進む距離(m)。脚の長さ(約0.7m)と振り幅から、足が滑らない値にしてある
const MOVE_THRESHOLD = 0.35; // これより遅いときは、立ち止まっている

const smooth = (edge0, edge1, v) => { const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

// 1つの頂点(x, y)の骨の重み。骨の番号: 0=体全体 1=左脚(+X) 2=右脚(-X) 3=左腕(+X) 4=右腕(-X)
// 腕: 体の外側(|x|が大きい)で、胸より上。脚: 腰(0.42)より下。そのあいだの境目は、ゆっくり移る
export function skinWeightsAt(x, y) {
  const ax = Math.abs(x);
  const wa = smooth(0.13, 0.22, ax) * smooth(0.62, 0.72, y);
  const wl = smooth(0.42, 0.32, y) * (1 - wa);
  const wr = Math.max(0, 1 - wa - wl);
  const left = smooth(-0.015, 0.015, x); // +X側なら1、-X側なら0
  return [[0, wr], [1, wl * left], [2, wl * (1 - left)], [3, wa * left], [4, wa * (1 - left)]];
}

function computeSkinWeights(geometry) {
  const pos = geometry.attributes.position;
  const skinIndex = new Uint16Array(pos.count * 4), skinWeight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const w = skinWeightsAt(pos.getX(i), pos.getY(i)).filter((p) => p[1] > 1e-4);
    w.sort((a, b) => b[1] - a[1]);
    const top = w.slice(0, 4), sum = top.reduce((s, p) => s + p[1], 0) || 1;
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = top[k] ? top[k][0] : 0; skinWeight[i * 4 + k] = top[k] ? top[k][1] / sum : 0; }
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// ひな形を読み込む。失敗したら null を返す(落ちてはいけない)
export function loadJosukeTemplate(baseUrl = './models/') {
  return new Promise((resolve) => {
    new GLTFLoader().load(baseUrl + 'josuke-higashikata.glb', (gltf) => {
      try {
        gltf.scene.updateMatrixWorld(true);
        const sources = [];
        gltf.scene.traverse((o) => { if (o.isMesh) sources.push(o); });
        if (sources.length === 0) throw new Error('メッシュがありません');
        // 元のモデルは、Z軸が上(ファイルの中の変換でY軸が上になる)で、顔が +Z 側を向いている。
        // ゲームでは前が -Z なので、Y軸まわりに180°回す。そのあと、足をY=0・高さを1.0・左右と前後の中心を原点にそろえる(体と目で、同じ変換を使う)
        const rotY = new THREE.Matrix4().makeRotationY(Math.PI);
        const geos = sources.map((m) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); g.applyMatrix4(rotY); return g; });
        const box = new THREE.Box3();
        geos.forEach((g) => { g.computeBoundingBox(); box.union(g.boundingBox); });
        const h = box.max.y - box.min.y, c = box.getCenter(new THREE.Vector3());
        const fit = new THREE.Matrix4().makeScale(1 / h, 1 / h, 1 / h).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
        geos.forEach((g) => { g.applyMatrix4(fit); computeSkinWeights(g); });

        // 骨(全員で共有する1組)
        const root = new THREE.Bone(); root.name = 'root';
        const mk = (name, x, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); root.add(b); return b; };
        const bones = [root, mk('hipL', HIP_X, HIP_Y), mk('hipR', -HIP_X, HIP_Y), mk('shoulderL', SHOULDER_X, SHOULDER_Y), mk('shoulderR', -SHOULDER_X, SHOULDER_Y)];
        const holder = new THREE.Group();
        holder.add(root);
        holder.updateMatrixWorld(true);
        const skeleton = new THREE.Skeleton(bones);
        sources.forEach((src, i) => {
          const mats = Array.isArray(src.material) ? src.material : [src.material];
          mats.forEach((m) => {
            m.side = THREE.DoubleSide;
            if (m.clearcoat !== undefined) m.clearcoat = 0; // 元の材質は、表面にツヤの層(clearcoat)がある。暗い本編でテカりすぎるので切る
            if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.8);
          });
          const mesh = new THREE.SkinnedMesh(geos[i], src.material);
          mesh.frustumCulled = false; // 骨で動く体が、元の枠からはみ出して見えなくならないように
          holder.add(mesh);
          mesh.bind(skeleton);
        });
        holder.scale.setScalar(JOSUKE_HEIGHT);
        resolve(holder);
      } catch (e) { console.warn('仗助のモデルの準備に失敗しました', e); resolve(null); }
    }, undefined, (e) => { console.warn(`仗助のモデル(${baseUrl}josuke-higashikata.glb)の読み込みに失敗しました`, e); resolve(null); });
  });
}

// プレイヤー1人ぶんを作る。colorはそのプレイヤーの識別色(足元のリングと、ほんのりした発光に使う)
//   update(delta, speed): 毎フレーム呼ぶ。speedは今の移動の速さ(m/秒)。歩いている間だけ手足を振る
export function createJosukeAvatar(template, color, { ringOpacity = 0.85 } = {}) {
  const group = new THREE.Group();
  const body = SkeletonUtils.clone(template);
  body.traverse((o) => { // 色の発光をプレイヤーごとに変えるため、材質をプレイヤーごとに複製する
    if (!o.material) return;
    const copy = (m) => { const c = m.clone(); if (c.emissive) c.emissive = new THREE.Color(color).multiplyScalar(0.12); return c; };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
  });
  group.add(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ringOpacity, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  group.add(ring);

  const bones = {};
  body.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  let phase = 0, walk = 0; // phase=歩きの周期の位置、walk=0(立ち止まり)〜1(歩き)
  function update(delta, speed) {
    const moving = speed > MOVE_THRESHOLD;
    walk += ((moving ? 1 : 0) - walk) * Math.min(1, delta * 12); // 止まったら、すばやく元の姿勢に戻る
    if (walk < 0.002) walk = 0;
    if (moving) phase += Math.min(speed, 6) * delta * (Math.PI * 2 / STRIDE);
    const s = Math.sin(phase) * walk;
    bones.hipL.rotation.x = s * LEG_SWING; bones.hipR.rotation.x = -s * LEG_SWING;           // 脚: 左右で逆に前後へ振る
    bones.shoulderL.rotation.set(-s * ARM_SWING, 0, -REST_ARM);                                // 腕: 下ろした姿勢(z)のまま、同じ側の脚とは逆に前後へ振る(x)
    bones.shoulderR.rotation.set(s * ARM_SWING, 0, REST_ARM);
    bones.root.position.y = Math.abs(Math.cos(phase)) * 0.012 * walk;                          // 歩くときの、体の小さな上下
    bones.root.rotation.y = s * 0.05;                                                          // 歩くときの、体の小さなひねり
  }
  update(0, 0); // 最初から、腕を下ろした姿勢にする
  return { group, body, update, get walk() { return walk; } };
}
