import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ▼ロビーサーバー(server.js)を動かしている場所に合わせて書き換える
//   ローカルで試すだけなら 'ws://localhost:8080' のままでOK。
//   本番でサーバーを立てた場合は 'wss://自分のサーバーのドメイン' に変更する。
const WS_URL = 'ws://localhost:8080';

// ---------- DOM ----------
const entryScreen = document.getElementById('entryScreen');
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const codeInput = document.getElementById('codeInput');
const entryError = document.getElementById('entryError');
const hud = document.getElementById('hud');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playerListEl = document.getElementById('playerList');
const clickHint = document.getElementById('clickHint');
const startBtn = document.getElementById('startBtn');
const waitingMsg = document.getElementById('waitingMsg');
const soloBtn = document.getElementById('soloBtn');

// 「1人で遊ぶ」はサーバーに一切接続せず、既存のソロプレイ用ゲーム(game.html)へそのまま移動する
soloBtn.addEventListener('click', () => {
  window.location.href = 'game.html';
});

// ---------- 通信まわり ----------
let ws = null;
let myId = null;
let isHost = false;
let roomCode = null;

function connectAndSend(msg) {
  entryError.textContent = '';
  ws = new WebSocket(WS_URL);
  ws.addEventListener('open', () => ws.send(JSON.stringify(msg)));
  ws.addEventListener('message', (ev) => handleServerMessage(JSON.parse(ev.data)));
  ws.addEventListener('close', () => {
    if (entryScreen.style.display !== 'none') entryError.textContent = 'サーバーに接続できませんでした(server.jsは起動していますか?)';
  });
}

createBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'プレイヤー';
  connectAndSend({ type: 'create', name });
});
joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'プレイヤー';
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { entryError.textContent = '部屋コードを入力してください'; return; }
  connectAndSend({ type: 'join', name, code });
});
startBtn.addEventListener('click', () => {
  if (isHost && ws) ws.send(JSON.stringify({ type: 'start' }));
});

function handleServerMessage(msg) {
  if (msg.type === 'created' || msg.type === 'joined') {
    myId = msg.playerId;
    isHost = msg.type === 'created';
    roomCode = msg.code;
    entryScreen.style.display = 'none';
    hud.style.display = 'block';
    clickHint.style.display = 'block';
    roomCodeDisplay.textContent = roomCode;
    msg.players.forEach(p => { if (p.id !== myId) addRemotePlayer(p); });
    refreshPlayerListFromScene();
    (isHost ? startBtn : waitingMsg).style.display = 'block';
  } else if (msg.type === 'error') {
    entryError.textContent = msg.message;
  } else if (msg.type === 'playerJoined') {
    addRemotePlayer(msg);
    refreshPlayerListFromScene();
  } else if (msg.type === 'playerLeft') {
    removeRemotePlayer(msg.id);
    refreshPlayerListFromScene();
  } else if (msg.type === 'playerMove') {
    moveRemotePlayer(msg);
  } else if (msg.type === 'hostChanged') {
    if (msg.id === myId) {
      isHost = true;
      startBtn.style.display = 'block';
      waitingMsg.style.display = 'none';
    }
    refreshPlayerListFromScene();
  } else if (msg.type === 'gameStart') {
    // ロビーの役割はここまで。本編(ゲーム本体)の同期は今後実装する
    alert('ホストがゲームを開始しました。\n(この先の本編との接続は未実装です)');
  }
}

// ---------- 他プレイヤーの見た目管理 ----------
const remotePlayers = new Map(); // id -> { group, info }

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.4, 0.35, 1);
  return sprite;
}

function addRemotePlayer(info) {
  if (remotePlayers.has(info.id)) return;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.1, 4, 8),
    new THREE.MeshLambertMaterial({ color: info.color })
  );
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);
  group.add(makeNameSprite(info.name + (info.host ? ' ★' : '')));
  group.children[1].position.y = 1.9;
  scene.add(group);
  remotePlayers.set(info.id, { group, info });
}
function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (!rp) return;
  scene.remove(rp.group);
  remotePlayers.delete(id);
}
function moveRemotePlayer(msg) {
  const rp = remotePlayers.get(msg.id);
  if (!rp) return;
  rp.group.position.set(msg.x, msg.y, msg.z);
  rp.group.rotation.y = msg.rotY;
}
function updatePlayerListUI(players) {
  playerListEl.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = (p.host ? '★ ' : '・') + p.name + (p.id === myId ? '(自分)' : '');
    playerListEl.appendChild(li);
  });
}
function refreshPlayerListFromScene() {
  const players = [{ id: myId, name: nameInput.value.trim() || 'プレイヤー', host: isHost }];
  remotePlayers.forEach(rp => players.push(rp.info));
  updatePlayerListUI(players);
}

// ---------- 3Dロビー空間 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.7, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

scene.add(new THREE.AmbientLight(0x556677, 0.9));
const lamp = new THREE.PointLight(0xfff2cc, 6, 14);
lamp.position.set(0, 3, 0);
scene.add(lamp);

// シンプルな待機用の部屋(床+壁のみ)
const floorSize = 8;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorSize, floorSize),
  new THREE.MeshLambertMaterial({ color: 0x2a2a33 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const wallMat = new THREE.MeshLambertMaterial({ color: 0x1c1c24 });
const wallH = 3;
[
  [0, -floorSize / 2, floorSize, 0],
  [0, floorSize / 2, floorSize, Math.PI],
  [-floorSize / 2, 0, floorSize, Math.PI / 2],
  [floorSize / 2, 0, floorSize, -Math.PI / 2],
].forEach(([x, z, w, rotY]) => {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH), wallMat);
  wall.position.set(x, wallH / 2, z);
  wall.rotation.y = rotY;
  scene.add(wall);
});

// ---------- 操作 ----------
const controls = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => { clickHint.style.display = 'none'; });
controls.addEventListener('unlock', () => { if (entryScreen.style.display === 'none') clickHint.style.display = 'block'; });

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

const speed = 3.5;
const clock = new THREE.Clock();
let moveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (controls.isLocked) {
    const move = speed * delta;
    if (keys['KeyW']) controls.moveForward(move);
    if (keys['KeyS']) controls.moveForward(-move);
    if (keys['KeyA']) controls.moveRight(-move);
    if (keys['KeyD']) controls.moveRight(move);
    // 部屋の外に出ないように軽く制限する
    const limit = floorSize / 2 - 0.4;
    camera.position.x = Math.max(-limit, Math.min(limit, camera.position.x));
    camera.position.z = Math.max(-limit, Math.min(limit, camera.position.z));
    camera.position.y = 1.7;

    // 通信は間引いて送る(秒間約12回)。動くたびに毎フレーム送ると無駄が多いため
    moveTimer += delta;
    if (moveTimer > 0.08 && ws && ws.readyState === WebSocket.OPEN) {
      moveTimer = 0;
      ws.send(JSON.stringify({ type: 'move', x: camera.position.x, y: 0, z: camera.position.z, rotY: camera.rotation.y }));
    }
  }

  renderer.render(scene, camera);
}
animate();
