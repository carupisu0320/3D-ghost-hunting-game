// プレイヤーのスキン(見た目)の作り方。ロビー(lobby.js)とゲーム本編(online-game.js)が、ほかのプレイヤーを出すのに使う。
// 一覧(名前・説明)は skin-catalog.js。ここには、その id ごとに、モデルの読み込みと作り方を書く。
//
// スキン1つの決まり:
//   load():   モデルなどを読み込んで、「ひな形」を Promise で返す。失敗したら null を返す(落ちてはいけない)
//   create(template, color, { ringOpacity }):  プレイヤー1人ぶんを作って { group, body, update(delta, speed) } を返す
//       group: シーンに入れる3Dオブジェクト(足元が y=0、前が -Z、背の高さ 約1.7m)
//       update: 毎フレーム呼ばれる。delta=前のフレームからの秒数、speed=今の移動の速さ(m/秒)。動かさないスキンなら空でよい
//       color: そのプレイヤーの識別色(足元のリングなどに使うと、誰か分かる)
import * as THREE from 'three';
import { DEFAULT_SKIN_ID, normalizeSkinId } from './skin-catalog.js';
import { loadRobotTemplate, createRobotAvatar } from './lobby-avatar.js';
import { loadMcQueenTemplate, createMcQueenAvatar } from './mcqueen-avatar.js';

// 足元の識別色のリング(スキン共通で使える)
function makeRing(color, ringOpacity = 0.85) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: ringOpacity, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  return ring;
}

// カプセル。いちばん簡単なスキンなので、新しいスキンを作るときのお手本にもなる
function createCapsuleAvatar(template, color, { ringOpacity = 0.4 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  body.position.y = 0.85;
  group.add(body);
  group.add(makeRing(color, ringOpacity));
  return { group, body, update() {} };
}

// id は skin-catalog.js の SKIN_CATALOG と同じにする(試験で確かめている)
const IMPLS = {
  robot: { load: () => loadRobotTemplate('./robot/'), create: createRobotAvatar },
  capsule: { load: () => Promise.resolve({}), create: createCapsuleAvatar },
  mcqueen: { load: () => loadMcQueenTemplate('./mcqueen/'), create: createMcQueenAvatar },
};

const templates = new Map(); // id -> ひな形(読み込めたもの)
const loading = new Map();   // id -> 読み込み中の Promise(同じスキンを何度も読み込まない)

// そのスキンのモデルを読み込む。終わったら(失敗しても)解決する。読み込めたかは createSkinAvatar が分かる
export function loadSkin(skinId) {
  const id = normalizeSkinId(skinId);
  if (!loading.has(id)) {
    loading.set(id, Promise.resolve().then(() => IMPLS[id].load()).then((t) => { if (t) templates.set(id, t); }).catch((e) => { console.warn(`スキン ${id} の読み込みに失敗しました`, e); }));
  }
  return loading.get(id);
}

// プレイヤーの体を作る。そのスキンがまだ(または読み込めなかった)ときは、既定のスキン、それもだめなら null(呼び出し側が仮の見た目を出す)
export function createSkinAvatar(skinId, color, opts) {
  for (const id of [normalizeSkinId(skinId), DEFAULT_SKIN_ID]) {
    if (templates.has(id)) return IMPLS[id].create(templates.get(id), color, opts);
  }
  return null;
}

// モデルがまだ読み込めていないときの、仮の見た目(カプセル)
export function createPlaceholderAvatar(color, opts) { return createCapsuleAvatar(null, color, opts); }
