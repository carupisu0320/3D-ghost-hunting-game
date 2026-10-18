// プレイヤーの見た目(東方仗助)。skins.js から使う。ロビーとゲーム本編で、ほかのプレイヤーを表示するのに使う。
// モデル(models/josuke-higashikata_rigged.glb)には、骨とアニメーション(idle / run / walk-casual など)が入っている。
// 歩く速さに合わせて、idle(立ち止まり)・walk-casual・run を、なめらかに切り替える。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const JOSUKE_HEIGHT = 1.75;  // 背の高さ(m)。リーゼントを含む。変えたいときはここ
const GLB_FILE = 'josuke-higashikata_rigged.glb';
// 各アニメーションが、足が滑らずにちょうど合う移動の速さ(m/秒)。クリップの脚の振り幅と脚の長さから計算した値
//   walk-casual: 1周期(1秒)で約1.6m / run: 1周期(0.67秒)で約2.2m
// 本編の歩く速さは 4m/秒(engine.js の speed)。walk-casual で歩かせるため、run に切り替える速さを、それより上(6m/秒)にしてある。
// run を使いたいときは、RUN_THRESHOLD を 2.4 に下げる(4m/秒でも run になる)
const WALK_SPEED = 1.6;
const RUN_SPEED = 3.3;
const RUN_THRESHOLD = 6.0;       // これより速く動いているとき run にする
const WALK_MAX_TIMESCALE = 2.0;  // walk-casual を、最大で何倍の速さで再生するか。大きいほど足が滑らないが、足の動きがせわしなくなる(本編の4m/秒で足が滑らないのは 2.5)
const MOVE_THRESHOLD = 0.35; // これより遅いときは、立ち止まっている(idle)

// ひな形を読み込む。失敗したら null を返す(落ちてはいけない)。ひな形は { root, clips }
export function loadJosukeTemplate(baseUrl = './models/') {
  return new Promise((resolve) => {
    new GLTFLoader().load(baseUrl + GLB_FILE, (gltf) => {
      try {
        const clips = {};
        gltf.animations.forEach((c) => { clips[c.name] = c; });
        // このモデルは、顔が +Z 側を向いている。ゲームでは前が -Z なので、Y軸まわりに180°回す
        const root = new THREE.Group();
        gltf.scene.rotation.y = Math.PI;
        root.add(gltf.scene);
        root.updateMatrixWorld(true);
        // 大きさは、読み込んだあとに測って、背の高さをそろえる(モデルの単位に左右されない)
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        gltf.scene.scale.multiplyScalar(JOSUKE_HEIGHT / size.y);
        root.updateMatrixWorld(true);
        gltf.scene.position.y -= new THREE.Box3().setFromObject(root).min.y; // 足をY=0に
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false; // 骨で動く体が、元の枠からはみ出して見えなくならないように
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.side = THREE.DoubleSide;
            if (m.clearcoat !== undefined) m.clearcoat = 0; // 元の材質は、表面にツヤの層(clearcoat)がある。暗い本編でテカりすぎるので切る
            if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.8);
          });
        });
        resolve({ root, clips });
      } catch (e) { console.warn('仗助のモデルの準備に失敗しました', e); resolve(null); }
    }, undefined, (e) => { console.warn(`仗助のモデル(${baseUrl}${GLB_FILE})の読み込みに失敗しました`, e); resolve(null); });
  });
}

// プレイヤー1人ぶんを作る。colorはそのプレイヤーの識別色(足元のリングと、ほんのりした発光に使う)
//   update(delta, speed): 毎フレーム呼ぶ。speedは今の移動の速さ(m/秒)
//   jump(): ジャンプの動きを1回流す(約1.1秒。体の高さは、動きの中で上がって戻る)
export function createJosukeAvatar(template, color, { ringOpacity = 0.85 } = {}) {
  const group = new THREE.Group();
  const body = SkeletonUtils.clone(template.root);
  body.traverse((o) => { // 色の発光をプレイヤーごとに変えるため、材質をプレイヤーごとに複製する
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
  const source = { idle: template.clips.idle, walk: template.clips['walk-casual'] || template.clips.walk, run: template.clips.run };
  const actions = {}, weight = { idle: 1, walk: 0, run: 0 };
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
  mixer.update(Math.random() * 2); // 腕を広げた姿勢(Tポーズ)で出ないように、すぐに1回進める。全員が同じ動きでそろわないよう、時間もずらす

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
