// ゲーム本編で、同じ部屋のほかのプレイヤーを、ロビーと同じロボットの見た目で表示する。
// ロビーから来たときだけ動く(ロビーが sessionStorage に入れた「部屋コードとtoken」を使って、同じプレイヤーとしてつなぎ直す)。
// 同期するのは、プレイヤーの位置・向き・歩き・正気度と、幽霊(位置・ハント・誰を狙うか)と、死亡。ドアの開け閉めやブレーカーなどは、まだそれぞれのゲームの中で別々に動く。
// 幽霊の動きと死亡の判定はホストのブラウザが計算して(engine.js の updateOnlineGhost)、このファイルが通信の窓口になる。
import * as THREE from 'three';
import { io } from 'socket.io-client';
import { loadRobotTemplate, createRobotAvatar } from './lobby-avatar.js';
import { SERVER_URL } from './server-config.js';
import { setNetHooks, applyNetGhost, applyPlayerDied, getSanity, isGameOver, hasEnteredGame } from './engine.js';

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
  let myId = null, joined = false, hostId = null;
  const remotes = new Map(); // id -> { group, body, avatar, target(足元の位置), prev, rotY, color, name, hasPos, sanity, dead(死んだ), out(特定などでプレイを終えた) }
  // ゲームに入る前に、サーバーから乱数の種を受け取るのを待つための合図(main.js が待つ)。つながらなければ null になって、ひとりで遊ぶ
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const setBadge = (text) => { badge.textContent = text; };
  const refreshBadge = () => setBadge(`オンライン 部屋: ${session.code}  ${Array.from(remotes.values()).filter((r) => !r.dead).length + 1}人`);
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
      rp.hasPos = true; rp.group.position.copy(rp.target); rp.prev.copy(rp.target); rp.group.rotation.y = rp.rotY; rp.group.visible = !rp.dead;
    }
  }
  function addRemote(info) {
    if (info.id === myId || remotes.has(info.id)) return;
    const group = new THREE.Group();
    group.visible = false; // 位置が分かるまでは出さない(原点に現れないように)
    const label = makeNameSprite(info.name + (info.host ? ' ★' : ''));
    group.add(label);
    scene.add(group);
    const rp = { group, label, body: null, avatar: null, target: new THREE.Vector3(), prev: new THREE.Vector3(), rotY: 0, color: info.color, name: info.name, hasPos: false,
      sanity: info.sanity, dead: info.alive === false, out: !!info.out };
    remotes.set(info.id, rp);
    attachBody(rp);
    if (info.pos) setPos(rp, info.pos);
    if (rp.dead) group.visible = false; // すでに死んでいる人は出さない
    refreshBadge();
  }
  function removeRemote(id) {
    const rp = remotes.get(id);
    if (!rp) return;
    scene.remove(rp.group); remotes.delete(id); refreshBadge();
  }

  // ---- engine.js(ゲーム本編)への窓口。登録すると、幽霊・ハント・死亡がオンライン用の動きになる ----
  const hooks = {
    isHost: () => myId !== null && hostId === myId,
    myId: () => myId,
    // 幽霊に狙われうる、ほかのプレイヤー(位置が分かっている人だけ)。x,y,z は足元の位置
    others: () => Array.from(remotes, ([id, rp]) => ({ id, name: rp.name, x: rp.target.x, y: rp.target.y, z: rp.target.z, sanity: rp.sanity, alive: !rp.dead, out: rp.out, hasPos: rp.hasPos }))
      .filter((p) => p.hasPos),
    sendGhost: (state) => socket.volatile.emit('ghost', state), // 切れている間にたまって、つながった瞬間にどっと届かないように(古い状態は捨てる)
    sendDeath: (id) => socket.emit('playerDied', { id }),
  };

  // ---- 通信 ----
  const socket = io(SERVER_URL); // 切れたら自動でつなぎ直す(つながるたびに rejoin を送る)
  // 一定時間つながらなかったら、オンラインはあきらめてひとりで続ける(あとからつながって、途中でオンライン用の動きに切り替わらないように、ここで切る)
  const connectTimeout = setTimeout(() => {
    if (joined) return;
    setBadge('オンライン: つながらなかったのでひとりで続けます');
    socket.disconnect();
    resolveReady(null);
  }, 15000);
  socket.on('connect', () => { socket.emit('rejoin', { code: session.code, token: session.token }); });
  socket.on('connect_error', () => { if (!joined) setBadge('オンライン: サーバーにつながりません(つながるまで待っています)'); });
  socket.on('disconnect', () => { joined = false; setBadge('オンライン: 切れました(つなぎ直しています)'); });
  socket.on('rejoined', (msg) => {
    clearTimeout(connectTimeout);
    joined = true; myId = msg.playerId;
    const host = msg.players.find((p) => p.host);
    hostId = host ? host.id : null;
    remotes.forEach((_, id) => removeRemote(id)); // つなぎ直したときは、一度まっさらにして、一覧から作り直す
    msg.players.forEach((p) => { if (p.online && p.id !== myId) addRemote(p); });
    setNetHooks(hooks);
    if (msg.ghost && !hooks.isHost()) applyNetGhost(msg.ghost); // つなぎ直したときに、幽霊の今の状態をすぐ受け取る
    resolveReady({ seed: msg.seed });
    refreshBadge(); sendMove(true);
  });
  socket.on('playerRejoined', (info) => {
    addRemote(info);
    const rp = remotes.get(info.id);
    if (rp && info.pos) setPos(rp, info.pos);
  });
  socket.on('playerLeft', (msg) => removeRemote(msg.id));
  socket.on('hostChanged', (msg) => { hostId = msg.id; }); // ホストが交代したら、新しいホストのブラウザが幽霊の計算を引き継ぐ
  socket.on('playerMove', (msg) => {
    const rp = remotes.get(msg.id);
    if (!rp) return;
    if (Number.isFinite(msg.sanity)) rp.sanity = msg.sanity;
    if (typeof msg.out === 'boolean') rp.out = msg.out;
    setPos(rp, msg);
  });
  socket.on('ghost', (msg) => { if (!hooks.isHost()) applyNetGhost(msg); }); // ホストが計算した幽霊の状態
  socket.on('playerDied', (msg) => { // 誰かが死んだ(自分のこともある)。ハントは全員分、そこで終わる
    const rp = remotes.get(msg.id);
    if (rp) { rp.dead = true; rp.group.visible = false; refreshBadge(); }
    applyPlayerDied(msg.id, rp ? rp.name : null);
  });
  socket.on('error', (msg) => {
    if (msg && msg.rejoin) {
      clearTimeout(connectTimeout);
      setBadge('オンライン: 部屋に戻れませんでした(ひとりで続けます)');
      setNetHooks(null); // オンライン用の動きをやめて、ひとり用に戻す
      socket.disconnect();
      resolveReady(null);
    }
  });

  // 自分の位置を送る。動いたときはすぐ(約12回/秒まで)、止まっているときも1秒に1回(あとから来た人にも見えるように)
  let lastSent = { x: null, y: null, z: null, r: null, t: 0 };
  function sendMove(force = false) {
    if (!joined || !hasEnteredGame()) return; // マップに入るまでは送らない(幽霊に狙われる対象にもならない)
    const x = camera.position.x, y = camera.position.y - EYE_HEIGHT, z = camera.position.z, r = camera.rotation.y;
    const now = performance.now();
    const changed = Math.abs(x - lastSent.x) > 0.01 || Math.abs(y - lastSent.y) > 0.01 || Math.abs(z - lastSent.z) > 0.01 || Math.abs(r - lastSent.r) > 0.01;
    if (!force && !changed && now - lastSent.t < 1000) return;
    lastSent = { x, y, z, r, t: now };
    socket.emit('move', { x, y, z, rotY: r, sanity: getSanity(), out: isGameOver() }); // 正気度も一緒に送る(ホストが、誰を狙うか決めるのに使う)
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

  return { socket, remotes, session, ready };
}
