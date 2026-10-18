// プレイヤーの見た目(メジロマックイーン)。skins.js から使う。ロビーとゲーム本編で、ほかのプレイヤーを表示するのに使う。
// モデル(mcqueen/mejiro_rigged.fbx)には、骨とアニメーション(idle / walk / run など)が入っている。
// テクスチャは FBX に埋め込まれているので、画像ファイルを別に置く必要はない。
// 歩く速さに合わせて、idle(立ち止まり)・walk・run を、なめらかに切り替える。
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const MCQUEEN_HEIGHT = 1.7;  // 背の高さ(m)。ロボットと同じ。変えたいときはここ
const FBX_FILE = 'mejiro_rigged.fbx';
// 各アニメーションが、足が滑らずにちょうど合う移動の速さ(m/秒)。クリップの脚の振り幅と脚の長さから計算した値
//   walk-casual: 1周期(1秒)で約1.6m / run: 1周期(0.67秒)で約2.3m。このモデルは脚が短い(腰の高さ約0.87m)ので、歩幅が小さい
// 本編の歩く速さは 4m/秒(engine.js の speed)。walk-casual で歩かせるため、run に切り替える速さを、それより上(6m/秒)にしてある。
// run を使いたいときは、RUN_THRESHOLD を 2.4 に下げる(4m/秒でも run になる)
const WALK_SPEED = 1.6;
const RUN_SPEED = 3.4;
const RUN_THRESHOLD = 6.0;       // これより速く動いているとき run にする
const WALK_MAX_TIMESCALE = 2.0;  // walk-casual を、最大で何倍の速さで再生するか。大きいほど足が滑らないが、足の動きがせわしなくなる(本編の4m/秒で足が滑らないのは 2.5)
const MOVE_THRESHOLD = 0.35; // これより遅いときは、立ち止まっている(idle)

// ひな形を読み込む。失敗したら null を返す(落ちてはいけない)。ひな形は { root, clips }
export function loadMcQueenTemplate(baseUrl = './mcqueen/') {
  return new Promise((resolve) => {
    new FBXLoader().load(baseUrl + FBX_FILE, (fbx) => {
      try {
        const clips = {};
        fbx.animations.forEach((c) => { clips[c.name] = c; });
        // このモデルは、顔が +Z 側を向いている(髪は -Z 側)。ゲームでは前が -Z なので、Y軸まわりに180°回す
        const root = new THREE.Group();
        fbx.rotation.y = Math.PI;
        root.add(fbx);
        root.updateMatrixWorld(true);
        // 大きさは、読み込んだあとに測って、背の高さをそろえる(FBX の単位に左右されない)
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        fbx.scale.multiplyScalar(MCQUEEN_HEIGHT / size.y);
        root.updateMatrixWorld(true);
        fbx.position.y -= new THREE.Box3().setFromObject(root).min.y; // 足をY=0に
        fbx.traverse((o) => {
          if (!o.isMesh && !o.isSkinnedMesh) return;
          o.frustumCulled = false; // 骨で動く体が、元の枠からはみ出して見えなくならないように
          const fix = (m) => {
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            m.side = THREE.DoubleSide;  // 髪・まつげなどの薄い面が、裏から見えなくならないように
            m.alphaTest = 0.5;          // 透明な部分(髪の先・まつげ)を切り抜く
            if (m.shininess !== undefined) m.shininess = 5; // 暗い本編でテカりすぎないように
          };
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(fix);
        });
        resolve({ root, clips });
      } catch (e) { console.warn('マックイーンのモデルの準備に失敗しました', e); resolve(null); }
    }, undefined, (e) => { console.warn(`マックイーンのモデル(${baseUrl}${FBX_FILE})の読み込みに失敗しました`, e); resolve(null); });
  });
}

// プレイヤー1人ぶんを作る。colorはそのプレイヤーの識別色(足元のリングと、ほんのりした発光に使う)
//   update(delta, speed): 毎フレーム呼ぶ。speedは今の移動の速さ(m/秒)
//   jump(): ジャンプの動きを1回流す(約1.1秒。体の高さは、動きの中で上がって戻る)
export function createMcQueenAvatar(template, color, { ringOpacity = 0.85 } = {}) {
  const group = new THREE.Group();
  const body = SkeletonUtils.clone(template.root);
  // 色の発光をプレイヤーごとに変えるため、材質をプレイヤーごとに複製する
  body.traverse((o) => {
    if (!o.material) return;
    const copy = (m) => { const c = m.clone(); if (c.emissive) c.emissive = new THREE.Color(color).multiplyScalar(0.12); return c; };
    o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
  });
  group.add(body);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ringOpacity, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  group.add(ring);

  // アニメーション: 3つを同時に再生しておき、速さに応じて重みだけを変える(切り替えがなめらかになる)
  const mixer = new THREE.AnimationMixer(body);
  const actions = {}, weight = { idle: 1, walk: 0, run: 0 };
  const source = { idle: template.clips.idle, walk: template.clips['walk-casual'] || template.clips.walk, run: template.clips.run };
  Object.keys(weight).forEach((name) => {
    if (!source[name]) return;
    const a = mixer.clipAction(source[name]);
    a.play(); a.setEffectiveWeight(weight[name]);
    actions[name] = a;
  });
  // ジャンプ(1回だけ再生する)。再生中は、ほかの動きの重みを下げて、ジャンプを前に出す
  const jumpClip = template.clips.jump;
  const jumpAction = jumpClip ? mixer.clipAction(jumpClip) : null;
  if (jumpAction) { jumpAction.setLoop(THREE.LoopOnce, 1); jumpAction.setEffectiveWeight(0); }
  let jumping = false, jumpWeight = 0;
  function jump() {
    if (!jumpAction || jumping) return;
    jumping = true;
    jumpAction.reset(); jumpAction.setEffectiveWeight(jumpWeight); jumpAction.play();
  }
  mixer.update(Math.random() * 2); // 全員が同じ動きでそろわないように、最初の時間をずらす

  function update(delta, speed) {
    const state = speed <= MOVE_THRESHOLD ? 'idle' : speed < RUN_THRESHOLD ? 'walk' : 'run';
    if (jumping && jumpAction.time >= jumpClip.duration - 0.15) jumping = false; // 終わりぎわで、ジャンプの重みを下げて、元の動きに戻る
    jumpWeight += ((jumping ? 1 : 0) - jumpWeight) * Math.min(1, delta * 14);
    if (jumpAction) { if (!jumping && jumpWeight < 0.01) { jumpWeight = 0; jumpAction.stop(); } else jumpAction.setEffectiveWeight(jumpWeight); }
    Object.keys(actions).forEach((name) => {
      weight[name] += ((name === state ? 1 : 0) - weight[name]) * Math.min(1, delta * 10);
      actions[name].setEffectiveWeight(weight[name] * (1 - jumpWeight));
    });
    if (actions.walk) actions.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_SPEED, 0.5, WALK_MAX_TIMESCALE);
    if (actions.run) actions.run.timeScale = THREE.MathUtils.clamp(speed / RUN_SPEED, 0.6, 2.2);
    mixer.update(delta);
  }
  return { group, body, update, jump, get walk() { return 1 - weight.idle; } };
}
