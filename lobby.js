import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildLobbySpace, moveWithCollision } from './lobby-space.js';
import { drawBoard, hitButton, BOARD_W, BOARD_H, MAPS, mapLabel } from './lobby-board.js';

// ▼ロビーサーバー(server.js)を動かしている場所に合わせて書き換える
//   ローカルで試すだけなら 'ws://localhost:8080' のままでOK。
//   本番でサーバーを立てた場合は 'wss://自分のサーバーのドメイン' に変更する。
const WS_URL = 'ws://localhost:8080';

// ---------- DOM ----------
const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');
const toast = document.getElementById('toast');
const roomBadge = document.getElementById('roomBadge');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalInput = document.getElementById('modalInput');
const modalError = document.getElementById('modalError');
const modalOk = document.getElementById('modalOk');
const modalCancel = document.getElementById('modalCancel');

// ---------- 状態 ----------
function loadSetting(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
function saveSetting(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても動く */ } }

const board = {
  screen: 'main',                                   // 'main' | 'maps'
  name: loadSetting('ghost_name', 'プレイヤー'),
  selectedMap: loadSetting('ghost_map', 'grafton'),
  hoverId: null,
  message: '',
  room: null,                                       // null | { code, isHost, myId, map, players: [{ id, name, host }] }
};
if (!MAPS.some(m => m.id === board.selectedMap)) board.selectedMap = MAPS[0].id;
let boardButtons = [];
let boardDirty = true;
let messageTimer = null;

function showMessage(text, ms = 4000) {
  board.message = text; boardDirty = true;
  toast.textContent = text; toast.style.display = 'block';
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { board.message = ''; toast.style.display = 'none'; boardDirty = true; }, ms);
}

// ---------- 3D空間 ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 80);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const space = buildLobbySpace(scene);
const boardCtx = space.whiteboard.canvas.getContext('2d');
camera.position.set(space.spawn.x, 1.65, space.spawn.z);
camera.rotation.set(0, space.spawn.rotY, 0, 'YXZ');

// ---------- 操作(移動・視点) ----------
const controls = new PointerLockControls(camera, renderer.domElement);
let modalOpen = false;
function showHintIfNeeded() { hint.style.display = (controls.isLocked || modalOpen) ? 'none' : 'flex'; crosshair.style.display = controls.isLocked ? 'block' : 'none'; }
hint.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', showHintIfNeeded);
controls.addEventListener('unlock', showHintIfNeeded);

const keys = {};
window.addEventListener('keydown', (e) => { if (!modalOpen) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const WALK = 3.2, RUN = 5.4;
const forward = new THREE.Vector3(), rightV = new THREE.Vector3();
function updateMovement(delta) {
  if (!controls.isLocked) return;
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? RUN : WALK;
  let f = 0, r = 0;
  if (keys['KeyW'] || keys['ArrowUp']) f += 1;
  if (keys['KeyS'] || keys['ArrowDown']) f -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) r += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) r -= 1;
  if (f === 0 && r === 0) return;
  const len = Math.hypot(f, r);
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  rightV.set(-forward.z, 0, forward.x);
  const dx = (forward.x * f + rightV.x * r) / len * speed * delta;
  const dz = (forward.z * f + rightV.z * r) / len * speed * delta;
  const [nx, nz] = moveWithCollision(space, camera.position.x, camera.position.z, dx, dz);
  camera.position.x = nx; camera.position.z = nz; camera.position.y = 1.65;
}

// ---------- ホワイトボード ----------
const raycaster = new THREE.Raycaster();
const centerPoint = new THREE.Vector2(0, 0);
function updateBoardHover() {
  let hover = null;
  if (controls.isLocked) {
    raycaster.setFromCamera(centerPoint, camera);
    raycaster.far = 8;
    const hit = raycaster.intersectObject(space.whiteboard.mesh, false)[0];
    if (hit && hit.uv) {
      const b = hitButton(boardButtons, hit.uv.x * BOARD_W, (1 - hit.uv.y) * BOARD_H);
      if (b && b.enabled) hover = b.id;
    }
  }
  if (hover !== board.hoverId) { board.hoverId = hover; boardDirty = true; }
  crosshair.style.background = hover ? '#7fd0ff' : 'rgba(255,255,255,0.85)';
  crosshair.style.transform = hover ? 'scale(1.8)' : 'scale(1)';
}
function redrawBoardIfNeeded() {
  if (!boardDirty) return;
  boardDirty = false;
  boardButtons = drawBoard(boardCtx, board);
  space.whiteboard.texture.needsUpdate = true;
}

// 照準のボタンをクリックしたときの処理
renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked || !board.hoverId) return;
  handleButton(board.hoverId);
});

function handleButton(id) {
  if (id.startsWith('map:')) { chooseMap(id.slice(4)); return; }
  switch (id) {
    case 'solo': goToGame(board.selectedMap); break;
    case 'create': createRoom(); break;
    case 'join': askText('部屋コードを入力', '5文字のコード(例: AB3XQ)', '', 5, (code) => joinRoom(code.toUpperCase())); break;
    case 'rename': askText('名前を入力', '12文字まで', board.name, 12, (name) => { board.name = name; saveSetting('ghost_name', name); boardDirty = true; }); break;
    case 'maps': board.screen = 'maps'; boardDirty = true; break;
    case 'back': board.screen = 'main'; boardDirty = true; break;
    case 'start': if (ws) send({ type: 'start' }); break;
    case 'leave': leaveRoom(); break;
  }
}
function chooseMap(mapId) {
  if (board.room && !board.room.isHost) return;
  board.selectedMap = mapId; saveSetting('ghost_map', mapId);
  if (board.room) { board.room.map = mapId; send({ type: 'setMap', map: mapId }); }
  board.screen = 'main'; boardDirty = true;
}
function goToGame(mapId) { window.location.href = 'game.html?map=' + encodeURIComponent(mapId); }

// ---------- 入力ダイアログ(名前・部屋コード) ----------
let modalCallback = null;
function askText(title, placeholder, initial, maxLen, onOk) {
  modalOpen = true; modalCallback = onOk;
  controls.unlock();
  modalTitle.textContent = title; modalInput.placeholder = placeholder; modalInput.value = initial; modalInput.maxLength = maxLen; modalError.textContent = '';
  modal.style.display = 'flex'; showHintIfNeeded();
  setTimeout(() => { modalInput.focus(); modalInput.select(); }, 0);
}
function closeModal() { modalOpen = false; modal.style.display = 'none'; modalCallback = null; showHintIfNeeded(); }
modalOk.addEventListener('click', () => {
  const value = modalInput.value.trim();
  if (!value) { modalError.textContent = '入力してください'; return; }
  const cb = modalCallback; closeModal(); if (cb) cb(value);
});
modalCancel.addEventListener('click', closeModal);
modalInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') modalOk.click(); if (e.key === 'Escape') closeModal(); });

// ---------- 通信 ----------
let ws = null;
function send(msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

function connectAndSend(msg) {
  if (ws) { ws.onclose = null; ws.close(); }
  let opened = false;
  ws = new WebSocket(WS_URL);
  ws.addEventListener('open', () => { opened = true; ws.send(JSON.stringify(msg)); });
  ws.addEventListener('message', (ev) => { try { handleServerMessage(JSON.parse(ev.data)); } catch (e) { console.warn(e); } });
  ws.addEventListener('close', () => {
    ws = null;
    if (!opened) showMessage('サーバーに接続できませんでした(server.jsは起動していますか?)');
    else if (board.room) { clearRoom(); showMessage('サーバーとの接続が切れました'); }
  });
}
function createRoom() { connectAndSend({ type: 'create', name: board.name, map: board.selectedMap }); }
function joinRoom(code) { connectAndSend({ type: 'join', name: board.name, code }); }
function leaveRoom() { if (ws) { ws.onclose = null; ws.close(); ws = null; } clearRoom(); }
function clearRoom() {
  board.room = null; board.screen = 'main'; boardDirty = true;
  remotePlayers.forEach((rp) => scene.remove(rp.group)); remotePlayers.clear();
  updateRoomBadge();
}
function updateRoomBadge() {
  const r = board.room;
  roomBadge.style.display = r ? 'block' : 'none';
  if (r) roomBadge.textContent = `部屋コード: ${r.code}  (${r.players.length}/4人)`;
}

function handleServerMessage(msg) {
  const room = board.room;
  if (msg.type === 'created' || msg.type === 'joined') {
    board.room = { code: msg.code, isHost: msg.type === 'created', myId: msg.playerId, map: msg.map, players: msg.players.slice() };
    if (msg.type === 'joined') board.selectedMap = msg.map;
    board.screen = 'main'; boardDirty = true;
    msg.players.forEach(p => { if (p.id !== msg.playerId) addRemotePlayer(p); });
    updateRoomBadge();
    sendMove(true);
  } else if (msg.type === 'error') {
    showMessage(msg.message);
  } else if (!room) {
    return;
  } else if (msg.type === 'playerJoined') {
    room.players.push({ id: msg.id, name: msg.name, host: msg.host });
    addRemotePlayer(msg); boardDirty = true; updateRoomBadge();
  } else if (msg.type === 'playerLeft') {
    room.players = room.players.filter(p => p.id !== msg.id);
    removeRemotePlayer(msg.id); boardDirty = true; updateRoomBadge();
  } else if (msg.type === 'hostChanged') {
    room.players.forEach(p => { p.host = p.id === msg.id; });
    if (msg.id === room.myId) { room.isHost = true; showMessage('あなたが新しいホストになりました', 3000); }
    boardDirty = true;
  } else if (msg.type === 'mapChanged') {
    room.map = msg.map; board.selectedMap = msg.map; boardDirty = true;
  } else if (msg.type === 'playerMove') {
    moveRemotePlayer(msg);
  } else if (msg.type === 'gameStart') {
    // 本編は、今のところ全員が同じマップを「それぞれ」遊ぶ形(プレイヤー同士の同期は今後実装する)
    goToGame(msg.map || room.map);
  }
}

// ---------- 他プレイヤーの見た目 ----------
const remotePlayers = new Map(); // id -> { group, target }
function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.y = 1.95;
  return sprite;
}
const PLAYER_COLORS = [0xff5555, 0x55aaff, 0x55dd77, 0xffcc33];
function addRemotePlayer(info) {
  if (remotePlayers.has(info.id)) return;
  const group = new THREE.Group();
  const color = info.color != null ? info.color : PLAYER_COLORS[remotePlayers.size % PLAYER_COLORS.length];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.85;
  group.add(body);
  group.add(makeNameSprite(info.name + (info.host ? ' ★' : '')));
  group.position.set(-6.5, 0, 2.6);
  scene.add(group);
  remotePlayers.set(info.id, { group, target: new THREE.Vector3(-6.5, 0, 2.6), rotY: 0 });
}
function removeRemotePlayer(id) {
  const rp = remotePlayers.get(id);
  if (!rp) return;
  scene.remove(rp.group); remotePlayers.delete(id);
}
function moveRemotePlayer(msg) {
  const rp = remotePlayers.get(msg.id);
  if (!rp) return;
  rp.target.set(msg.x, msg.y, msg.z); rp.rotY = msg.rotY;
}
let moveTimer = 0, lastSent = { x: null, z: null, r: null };
function sendMove(force = false) {
  if (!board.room) return;
  const x = camera.position.x, z = camera.position.z, r = camera.rotation.y;
  if (!force && Math.abs(x - lastSent.x) < 0.01 && Math.abs(z - lastSent.z) < 0.01 && Math.abs(r - lastSent.r) < 0.01) return;
  lastSent = { x, z, r };
  send({ type: 'move', x, y: 0, z, rotY: r });
}

// ---------- メインループ ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  updateMovement(delta);
  updateBoardHover();
  redrawBoardIfNeeded();
  // 他のプレイヤーは、受け取った位置へなめらかに寄せる(通信は間引いて届くため)
  remotePlayers.forEach((rp) => {
    rp.group.position.lerp(rp.target, Math.min(1, delta * 10));
    rp.group.rotation.y += (rp.rotY - rp.group.rotation.y) * Math.min(1, delta * 10);
  });
  moveTimer += delta;
  if (moveTimer > 0.08) { moveTimer = 0; sendMove(); } // 秒間約12回まで
  space.clock.rotation.z = 0; // 時計は止まった絵(針は絵に含まれている)
  renderer.render(scene, camera);
}
showHintIfNeeded();
animate();
