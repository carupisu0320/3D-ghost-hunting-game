// ゲーム本編で、同じ部屋のほかのプレイヤーを、ロビーと同じロボットの見た目で表示する。
// ロビーから来たときだけ動く(ロビーが sessionStorage に入れた「部屋コードとtoken」を使って、同じプレイヤーとしてつなぎ直す)。
// 同期するのは、プレイヤーの位置・向き・歩きだけ。幽霊や証拠、ドアの開け閉めなどは、まだそれぞれのゲームの中で別々に動く。
import * as THREE from 'three';
import { io } from 'socket.io-client';
import { loadRobotTemplate, createRobotAvatar } from './lobby-avatar.js';
import { SERVER_URL } from './server-config.js';

const EYE_HEIGHT = 1.6;     // 本編のカメラの高さ(床から)。足元の高さ = カメラの高さ - これ
const NAME_VISIBLE_DIST = 12; // 名前を出す距離(m)

export function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem('ghost_session') || 'null');
    return s && s.code && s.token ? s : null;
  } catch (e) { return null; }
}

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 2.0;
  return sprite;
}

// scene, camera は engine.js のもの。ロビーから来ていなければ、何もせずnullを返す(ひとりで遊ぶとき)
export function startOnlineSession({ scene, camera }) {
  const session = readSession();
  if (!session) return null;

  // ---- 画面の隅の表示 ----
  const badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:6;color:#9fd3ff;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.45);padding:3px 8px;border-radius:3px;pointer-events:none;';
  document.body.appendChild(badge);
  let myId = null, joined = false;
  const remotes = new Map(); // id -> { group, body, avatar, target, prev, rotY, color, name, hasPos }
  const setBadge = (text) => { badge.textContent = text; };
  const refreshBadge = () => setBadge(`オンライン 部屋: ${session.code}  ${remotes.size + 1}人`);
  setBadge('オンライン: 接続中…');

  // ---- ほかのプレイヤーの体(ロボット。モデルが読み込めないときはカプセル) ----
  let template = null;
  function attachBody(rp) {
    if (rp.body) rp.group.remove(rp.body);
    if (template) {
      rp.avatar = createRobotAvatar(template, rp.color, { ringOpacity: 0.4 }); // 本編は暗いので、足元のリングは控えめに
      rp.body = rp.avatar.group;
    } else {
      rp.avatar = null;
      rp.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: rp.color, roughness: 0.8 }));
      rp.body.position.y = 0.85;
    }
    rp.group.add(rp.body);
  }
  loadRobotTemplate('./robot/').then((t) => { template = t; if (t) remotes.forEach(attachBody); });

  function setPos(rp, pos) {
    rp.target.set(pos.x, pos.y, pos.z); rp.rotY = pos.rotY;
    if (!rp.hasPos) { // 最初の位置は、滑らせずにその場所に置く
      rp.hasPos = true; rp.group.position.copy(rp.target); rp.prev.copy(rp.target); rp.group.rotation.y = rp.rotY; rp.group.visible = true;
    }
  }
  function addRemote(info) {
    if (info.id === myId || remotes.has(info.id)) return;
    const group = new THREE.Group();
    group.visible = false; // 位置が分かるまでは出さない(原点に現れないように)
    const label = makeNameSprite(info.name + (info.host ? ' ★' : ''));
    group.add(label);
    scene.add(group);
    const rp = { group, label, body: null, avatar: null, target: new THREE.Vector3(), prev: new THREE.Vector3(), rotY: 0, color: info.color, name: info.name, hasPos: false };
    remotes.set(info.id, rp);
    attachBody(rp);
    if (info.pos) setPos(rp, info.pos);
    refreshBadge();
  }
  function removeRemote(id) {
    const rp = remotes.get(id);
    if (!rp) return;
    scene.remove(rp.group); remotes.delete(id); refreshBadge();
  }

  // ---- 通信 ----
  const socket = io(SERVER_URL); // 切れたら自動でつなぎ直す(つながるたびに rejoin を送る)
  socket.on('connect', () => { socket.emit('rejoin', { code: session.code, token: session.token }); });
  socket.on('connect_error', () => { if (!joined) setBadge('オンライン: サーバーにつながりません(つながるまで待っています)'); });
  socket.on('disconnect', () => { joined = false; setBadge('オンライン: 切れました(つなぎ直しています)'); });
  socket.on('rejoined', (msg) => {
    joined = true; myId = msg.playerId;
    remotes.forEach((_, id) => removeRemote(id)); // つなぎ直したときは、一度まっさらにして、一覧から作り直す
    msg.players.forEach((p) => { if (p.online) addRemote(p); });
    refreshBadge(); sendMove(true);
  });
  socket.on('playerRejoined', (info) => { addRemote(info); const rp = remotes.get(info.id); if (rp && info.pos) setPos(rp, info.pos); });
  socket.on('playerLeft', (msg) => removeRemote(msg.id));
  socket.on('playerMove', (msg) => {
    const rp = remotes.get(msg.id);
    if (rp) setPos(rp, msg);
  });
  socket.on('error', (msg) => {
    if (msg && msg.rejoin) { setBadge('オンライン: 部屋に戻れませんでした(ひとりで続けます)'); socket.disconnect(); }
  });

  // 自分の位置を送る。動いたときはすぐ(約12回/秒まで)、止まっているときも1秒に1回(あとから来た人にも見えるように)
  let lastSent = { x: null, y: null, z: null, r: null, t: 0 };
  function sendMove(force = false) {
    if (!joined) return;
    const x = camera.position.x, y = camera.position.y - EYE_HEIGHT, z = camera.position.z, r = camera.rotation.y;
    const now = performance.now();
    const changed = Math.abs(x - lastSent.x) > 0.01 || Math.abs(y - lastSent.y) > 0.01 || Math.abs(z - lastSent.z) > 0.01 || Math.abs(r - lastSent.r) > 0.01;
    if (!force && !changed && now - lastSent.t < 1000) return;
    lastSent = { x, y, z, r, t: now };
    socket.emit('move', { x, y, z, rotY: r });
  }
  setInterval(() => sendMove(), 80);

  // ---- 毎フレームの表示更新(ゲームを一時停止しているときも動かす) ----
  let prevT = performance.now();
  function frame(t) {
    requestAnimationFrame(frame);
    const delta = Math.min((t - prevT) / 1000, 0.1); prevT = t;
    if (delta <= 0) return;
    remotes.forEach((rp) => {
      if (!rp.hasPos) return;
      rp.group.position.lerp(rp.target, Math.min(1, delta * 10));
      rp.group.rotation.y += (rp.rotY - rp.group.rotation.y) * Math.min(1, delta * 10);
      // 実際に動いた速さから、歩きの動きを決める(止まっている間は歩かない)
      if (rp.avatar) rp.avatar.update(delta, rp.group.position.distanceTo(rp.prev) / delta);
      rp.prev.copy(rp.group.position);
      rp.label.visible = rp.group.position.distanceTo(camera.position) < NAME_VISIBLE_DIST;
    });
  }
  requestAnimationFrame(frame);

  return { socket, remotes, session };
}
