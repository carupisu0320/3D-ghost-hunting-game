import * as THREE from 'three';
import { io } from 'socket.io-client'; // 通信(Socket.IO)。読み込み先はlobby.htmlのimportmapに書いてある
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildLobbySpace, moveWithCollision } from './lobby-space.js';
import { drawBoard, hitButton, BOARD_W, BOARD_H, MAPS } from './lobby-board.js';
import {
  makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh,
  toolNames, toolIcons, viewmodelBase, viewmodelOverrides,
} from './tool-models.js';
import { MAX_HELD, SPIRIT_WORD, emfLevelAt, demoTemperature, pickGazeItem } from './lobby-tools.js';
import { loadRobotTemplate, createRobotAvatar } from './lobby-avatar.js'; // プレイヤーの見た目(黒いロボット)
import { SERVER_URL } from './server-config.js';

// 接続先のサーバー(server.js)のURLは、server-config.js に書いてある(ロビーとゲーム本編で共通)

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
try { sessionStorage.removeItem('ghost_session'); } catch (e) { /* 使えなくても動く */ }
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
scene.add(camera); // 手に持つ道具とライトをカメラに付けるため

// ---------- 操作(移動・視点) ----------
const controls = new PointerLockControls(camera, renderer.domElement);
let modalOpen = false;
let padActive = false; // コントローラーで操作中(マウスのクリックによる視点固定なしで、スティックだけで動かしている状態)
const inControl = () => controls.isLocked || padActive;
function showHintIfNeeded() { hint.style.display = (inControl() || modalOpen) ? 'none' : 'flex'; crosshair.style.display = inControl() ? 'block' : 'none'; }
hint.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', showHintIfNeeded);
controls.addEventListener('unlock', showHintIfNeeded);

const keys = {};
window.addEventListener('keydown', (e) => {
  if (modalOpen) return;
  keys[e.code] = true;
  if (e.repeat || !inControl()) return;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { const t = held[Number(e.code.slice(5)) - 1]; if (t) selectTool(t); }
  else if (e.code === 'KeyE') toggleCurrentTool();
  else if (e.code === 'KeyQ') returnCurrentTool();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const WALK = 3.2, RUN = 5.4;
const forward = new THREE.Vector3(), rightV = new THREE.Vector3();
function updateMovement(delta, pad) {
  if (!inControl()) return;
  const running = keys['ShiftLeft'] || keys['ShiftRight'] || (pad && padButton(pad, 6)); // Shift、またはコントローラーのZL
  const speed = running ? RUN : WALK;
  let f = 0, r = 0;
  if (keys['KeyW'] || keys['ArrowUp']) f += 1;
  if (keys['KeyS'] || keys['ArrowDown']) f -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) r += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) r -= 1;
  if (pad) { f -= deadzone(pad.axes[1] || 0); r += deadzone(pad.axes[0] || 0); } // 左スティック(上に倒すと前進)
  if (f === 0 && r === 0) return;
  const len = Math.hypot(f, r);
  const scale = Math.min(1, len) / len; // キーボードは常に全速、スティックは倒した量に比例(1を超える分は全速)
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  rightV.set(-forward.z, 0, forward.x);
  const dx = (forward.x * f + rightV.x * r) * scale * speed * delta;
  const dz = (forward.z * f + rightV.z * r) * scale * speed * delta;
  const [nx, nz] = moveWithCollision(space, camera.position.x, camera.position.z, dx, dz);
  camera.position.x = nx; camera.position.z = nz; camera.position.y = 1.65;
}

// ---------- ホワイトボード ----------
const raycaster = new THREE.Raycaster();
const centerPoint = new THREE.Vector2(0, 0);
function updateBoardHover() {
  let hover = null;
  if (inControl()) {
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
// 狙っているもの(壁の道具、なければボードのボタン)を使う。マウスのクリックとコントローラーのYボタンが、同じ操作を呼ぶ
function activateAim() {
  if (!inControl()) return;
  const item = gazedPegItem();
  if (item) { takePegItem(item); return; }
  if (board.hoverId) handleButton(board.hoverId);
}
renderer.domElement.addEventListener('click', () => { if (controls.isLocked) activateAim(); });

function handleButton(id) {
  if (id.startsWith('map:')) { chooseMap(id.slice(4)); return; }
  switch (id) {
    case 'solo': try { sessionStorage.removeItem('ghost_session'); } catch (e) { /* ignore */ } goToGame(board.selectedMap); break;
    case 'create': createRoom(); break;
    case 'join': askText('部屋コードを入力', '5文字のコード(例: AB3XQ)', '', 5, (code) => joinRoom(code.toUpperCase())); break;
    case 'rename': askText('名前を入力', '12文字まで', board.name, 12, (name) => { board.name = name; saveSetting('ghost_name', name); boardDirty = true; }); break;
    case 'maps': board.screen = 'maps'; boardDirty = true; break;
    case 'back': board.screen = 'main'; boardDirty = true; break;
    case 'start': if (socket) send({ type: 'start' }); break;
    case 'leave': leaveRoom(); break;
  }
}
function chooseMap(mapId) {
  if (board.room && !board.room.isHost) return;
  board.selectedMap = mapId; saveSetting('ghost_map', mapId);
  if (board.room) { board.room.map = mapId; send({ type: 'setMap', map: mapId }); }
  board.screen = 'main'; boardDirty = true;
}
let leavingForGame = false; // ゲームのページへ移動中(このあとの接続切れは、部屋を出たのではなく、ページの移動)
function goToGame(mapId) { leavingForGame = true; window.location.href = 'game.html?map=' + encodeURIComponent(mapId); }

// ---------- 入力ダイアログ(名前・部屋コード) ----------
let modalCallback = null;
function askText(title, placeholder, initial, maxLen, onOk) {
  modalOpen = true; modalCallback = onOk;
  padActive = false;
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

// ---------- 通信(Socket.IO) ----------
// socket.emit('イベント名', データ) で送り、サーバーから届くイベントは onAny でまとめて受け取って handleServerMessage に渡す
let socket = null;
function send(msg) { if (socket && socket.connected) socket.emit(msg.type, msg); }

function closeSocket() {
  if (!socket) return;
  socket.removeAllListeners(); // 切断したときの「接続が切れました」の表示が出ないように、先に外す
  socket.disconnect();
  socket = null;
}
function clearMessage() { board.message = ''; toast.style.display = 'none'; boardDirty = true; clearTimeout(messageTimer); }

// サーバーにつないで、つながったらmsg(create / join)を送る
function connectAndSend(msg) {
  closeSocket();
  // 無料のサーバーは、しばらく使われていないと眠っていて、起こすのに最大1分ほどかかる
  showMessage('サーバーに接続中…(最初は起動に1分ほどかかることがあります)', 70000);
  const s = io(SERVER_URL, { reconnection: false, timeout: 70000 });
  socket = s;
  s.on('connect', () => { clearMessage(); s.emit(msg.type, msg); });
  s.on('connect_error', () => {
    if (socket !== s) return;
    closeSocket();
    showMessage('サーバーに接続できませんでした(サーバーは動いていますか? 接続先: ' + SERVER_URL + ')', 7000);
  });
  s.on('disconnect', () => {
    if (socket !== s) return;
    socket = null;
    if (leavingForGame) return;
    if (board.room) { clearRoom(); showMessage('サーバーとの接続が切れました'); }
  });
  s.onAny((event, payload) => handleServerMessage({ ...payload, type: event }));
}
function createRoom() { connectAndSend({ type: 'create', name: board.name, map: board.selectedMap }); }
function joinRoom(code) { connectAndSend({ type: 'join', name: board.name, code }); }
function leaveRoom() { closeSocket(); clearRoom(); }
function clearRoom() {
  try { sessionStorage.removeItem('ghost_session'); } catch (e) { /* ignore */ }
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
    try { sessionStorage.setItem('ghost_session', JSON.stringify({ code: msg.code, token: msg.token, playerId: msg.playerId, name: board.name })); } catch (e) { /* 覚えられなくても、ロビーは使える(ゲームでほかの人が見えなくなる) */ }
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

// ほかのプレイヤーの体。ロボットのモデル(robot/robot.fbx)が読み込めたらロボット、まだ(または読み込めなかった)ときはカプセル
let robotTemplate = null;
function attachBody(rp) {
  if (rp.body) { rp.group.remove(rp.body); rp.body = null; }
  if (robotTemplate) {
    rp.avatar = createRobotAvatar(robotTemplate, rp.color);
    rp.body = rp.avatar.group;
  } else {
    rp.avatar = null;
    rp.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 4, 8), new THREE.MeshLambertMaterial({ color: rp.color }));
    rp.body.position.y = 0.85;
  }
  rp.group.add(rp.body);
}
loadRobotTemplate().then((template) => {
  robotTemplate = template; // 失敗したときはnull(カプセルのまま)
  if (template) remotePlayers.forEach(attachBody); // すでに部屋にいる人も、ロボットに差し替える
});

function addRemotePlayer(info) {
  if (remotePlayers.has(info.id)) return;
  const group = new THREE.Group();
  const color = info.color != null ? info.color : PLAYER_COLORS[remotePlayers.size % PLAYER_COLORS.length];
  const rp = { group, color, body: null, avatar: null, target: new THREE.Vector3(-6.5, 0, 2.6), prev: new THREE.Vector3(-6.5, 0, 2.6), rotY: 0 };
  group.add(makeNameSprite(info.name + (info.host ? ' ★' : '')));
  group.position.set(-6.5, 0, 2.6);
  scene.add(group);
  remotePlayers.set(info.id, rp);
  attachBody(rp);
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

// ---------- 道具(壁のボードから取って、テスト用ゴーストの装置で試せる) ----------
const held = [];            // 持っている道具の名前(取った順、最大3)
let currentTool = null;     // 今手に持っている道具
let flashlightOn = false;
const active = { emf: false, thermometer: false, spiritbox: false, uv: false, dots: false };

// 手に持つ見た目(画面右下)。本編と同じ構え(位置・角度・大きさ)を使う
const viewmodels = {};
const viewmodelMakers = { flashlight: makeFlashlightItemMesh, emf: makeEMFItemMesh, thermometer: makeThermoItemMesh, spiritbox: makeSpiritBoxItemMesh, uv: makeUVItemMesh, dots: makeDotsItemMesh };
Object.keys(viewmodelMakers).forEach((tool) => {
  const inner = viewmodelMakers[tool]();
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.userData = inner.userData; // LED・画面の参照を、ラッパー側からも使えるようにする
  const t = { ...viewmodelBase, ...(viewmodelOverrides[tool] || {}) };
  wrapper.position.set(...t.position);
  wrapper.rotation.set(...t.rotation);
  wrapper.scale.setScalar(t.scale);
  wrapper.visible = false;
  wrapper.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  camera.add(wrapper);
  viewmodels[tool] = wrapper;
});

// 手元を照らすライト(懐中電灯・UVライト共用)。UVライトのときは紫になる
const torch = new THREE.SpotLight(0xffeecc, 0, 14, 0.5, 0.55, 1.6);
torch.position.set(0.1, -0.05, 0);
torch.target.position.set(0, 0, -1);
camera.add(torch, torch.target);

// 画面左上の表示(本編と同じ書式)と、画面下のホットバー
const hud = {};
[['emf', '#0f0'], ['thermometer', '#0ff'], ['spiritbox', '#ff66aa'], ['dots', '#33ff55']].forEach(([key, color], i) => {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:${44 + i * 20}px;left:10px;color:${color};font-family:monospace;font-size:14px;z-index:7;text-shadow:0 0 3px #000;`;
  document.body.appendChild(el); hud[key] = el;
});
const hotbarEl = document.createElement('div');
hotbarEl.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:7;';
const hotbarSlots = [0, 1, 2].map((i) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:52px;height:52px;border:2px solid rgba(255,255,255,0.25);border-radius:6px;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:26px;opacity:0.35;';
  const num = document.createElement('div');
  num.textContent = String(i + 1);
  num.style.cssText = 'position:absolute;top:1px;left:4px;font-size:11px;color:#ccc;font-family:monospace;';
  const icon = document.createElement('div');
  el.appendChild(num); el.appendChild(icon); hotbarEl.appendChild(el);
  return { el, icon };
});
document.body.appendChild(hotbarEl);
const toolHint = document.createElement('div');
toolHint.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,0.55);padding:4px 12px;border-radius:4px;font-family:monospace;font-size:14px;z-index:7;pointer-events:none;display:none;';
document.body.appendChild(toolHint);

function refreshHotbar() {
  hotbarSlots.forEach((slot, i) => {
    const tool = held[i];
    slot.icon.textContent = tool ? toolIcons[tool] : '';
    slot.el.style.opacity = tool ? '1' : '0.35';
    const selected = tool && tool === currentTool;
    slot.el.style.borderColor = selected ? '#fff' : 'rgba(255,255,255,0.25)';
    slot.el.style.boxShadow = selected ? '0 0 6px rgba(255,255,255,0.8)' : 'none';
  });
  Object.keys(viewmodels).forEach((t) => { viewmodels[t].visible = (t === currentTool); });
  Object.keys(hud).forEach((k) => { if (!active[k]) hud[k].textContent = ''; });
}
// 持ち替え。懐中電灯は持ち替えてもつけたまま、ほかの道具は選んだときだけオンになる(本編と同じ)
function selectTool(tool) {
  currentTool = tool;
  Object.keys(active).forEach((k) => { active[k] = (k === tool); });
  refreshHotbar();
}
function toggleCurrentTool() {
  if (currentTool === 'flashlight') flashlightOn = !flashlightOn;
  else if (currentTool in active) { active[currentTool] = !active[currentTool]; refreshHotbar(); }
}
// 視線の先にある、まだ取られていない壁の道具
const gazeDir = new THREE.Vector3();
function gazedPegItem() {
  camera.getWorldDirection(gazeDir);
  return pickGazeItem(space.pegItems, camera.position, gazeDir);
}
const isHeld = (tool) => held.includes(tool);
function takePegItem(item) {
  if (isHeld(item.tool)) { showMessage('すでに持っている', 2000); return; }
  if (held.length >= MAX_HELD) { showMessage('持ち物がいっぱいです(Qで戻せます)', 2500); return; }
  item.taken = true; item.mesh.visible = false;
  held.push(item.tool);
  if (item.tool === 'flashlight') flashlightOn = true;
  selectTool(item.tool);
}
// 今持っている道具を、ボードの元の場所に戻す
function returnCurrentTool() {
  if (!currentTool) return;
  const tool = currentTool;
  const item = space.pegItems.find(it => it.tool === tool && it.taken);
  if (item) { item.taken = false; item.mesh.visible = true; }
  held.splice(held.indexOf(tool), 1);
  if (tool === 'flashlight') flashlightOn = false;
  active[tool] = false;
  selectTool(held.length ? held[held.length - 1] : null);
}

// 毎フレーム: テスト用ゴースト(ハヤト)に対する、各道具の反応
const toDummy = new THREE.Vector3();
let spiritTimer = 0;
function updateTools(delta, t) {
  const st = space.testStation;
  // 玉をゆっくり上下させる
  st.orb.position.y = st.baseY + Math.sin(t * 1.4) * 0.05;
  const orbWorld = st.orb.getWorldPosition(toDummy);
  const dist = camera.position.distanceTo(orbWorld);
  camera.getWorldDirection(gazeDir);
  const toOrb = orbWorld.clone().sub(camera.position);
  const lookingAtOrb = gazeDir.angleTo(toOrb.normalize()) < 0.3 && dist < 6;

  // 懐中電灯・UVライト(UVは紫)
  torch.color.set(active.uv ? 0x8a2be2 : 0xffeecc);
  torch.intensity = (flashlightOn || active.uv) ? 60 : 0;

  if (active.emf) {
    const level = emfLevelAt(dist);
    hud.emf.textContent = `EMF: ${'★'.repeat(level)}${'・'.repeat(5 - level)} (Lv.${level})`;
    viewmodels.emf.userData.leds.forEach((led, i) => led.material.color.set(i < level ? 0x44ff44 : 0x2a1010));
  }
  if (active.thermometer) {
    const temp = demoTemperature(dist, t);
    hud.thermometer.textContent = `温度: ${temp.toFixed(1)}°C${temp <= 0 ? ' (氷点下!)' : ''}`;
    const canvas = viewmodels.thermometer.userData.screenCanvas, ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a2a12'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = temp <= 0 ? '#ff7a7a' : '#7fffa0';
    ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${temp.toFixed(1)}°C`, canvas.width / 2, canvas.height / 2);
    viewmodels.thermometer.userData.screenTexture.needsUpdate = true;
  }
  if (active.spiritbox) {
    spiritTimer -= delta;
    if (spiritTimer <= 0) { // 数秒おきに、雑音か応答(6m以内なら必ず応える)
      spiritTimer = 2 + Math.random() * 2;
      hud.spiritbox.textContent = dist < 6 ? `スピリットボックス: 「${SPIRIT_WORD}」` : 'スピリットボックス: …ザザ…';
    }
    viewmodels.spiritbox.userData.led.material.color.set(Math.random() < 0.5 ? 0xff2266 : 0x2a1010);
  } else spiritTimer = 0;
  // D.O.T.S: 投光器を向けると、テスト用ゴーストの体に緑の光点が浮かぶ
  st.dots.visible = active.dots && lookingAtOrb;
  if (active.dots) hud.dots.textContent = `D.O.T.S: ${st.dots.visible ? '反応あり' : '反応なし'}`;
  // UVライト: 看板の下の手形が浮かび上がる
  const nearSign = camera.position.distanceTo(st.signPos) < 4.5;
  st.prints.material.opacity = (active.uv && nearSign) ? 0.85 : 0;

  // 壁の道具を狙っているとき、名前を出す
  const item = inControl() ? gazedPegItem() : null;
  if (item) {
    toolHint.textContent = toolNames[item.tool] + (isHeld(item.tool) ? '(すでに持っている)' : held.length >= MAX_HELD ? '(持ち物がいっぱい)' : (padActive ? '(Yボタンで取る)' : '(クリックで取る)'));
    toolHint.style.display = 'block';
  } else toolHint.style.display = 'none';
}
refreshHotbar();

// ---------- コントローラー(Switchのコントローラーの標準マッピング) ----------
//   左スティック: 移動 / 右スティック: 見回す / ZL: 走る
//   Y(左のボタン)・B(下のボタン): 狙っているものを使う(ボードのボタンを押す・壁の道具を取る。クリックと同じ)
//   X(上のボタン)・ZR: 道具を使う(Eキーと同じ) / L・R: 道具の持ち替え / 十字キーの下: ボードに戻す(Qキーと同じ)
//   +(9): 一時停止(案内の画面に戻る)。案内の画面で何かボタンを押すと、クリックしなくても操作を始められる
const padPrev = {};
function deadzone(v, dz = 0.15) { return Math.abs(v) < dz ? 0 : v; }
function padButton(pad, i) { return !!(pad.buttons[i] && pad.buttons[i].pressed); }
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) if (pad) return pad;
  return null;
}
// ボタンが「押された瞬間」だけtrueを返す
function padPressed(pad, i) {
  const now = padButton(pad, i), was = !!padPrev[i];
  padPrev[i] = now;
  return now && !was;
}
function cycleTool(step) {
  if (held.length === 0) return;
  const i = held.indexOf(currentTool);
  selectTool(held[(i + step + held.length) % held.length]);
}
// 今押されているボタンの状態を「前回の状態」として控える(押しっぱなしのボタンが、あとから反応しないように)
function syncPadPrev(pad) { pad.buttons.forEach((b, i) => { padPrev[i] = b.pressed; }); }
let padWasPressed = false;
function updatePad(delta, pad) {
  if (!pad) return;
  if (!inControl()) {
    // ダイアログが開いている間は、キーボードで入力するので、コントローラーは見ない
    if (modalOpen) { syncPadPrev(pad); padWasPressed = true; return; }
    // 案内の画面が出ている間に何かボタンを押したら、クリックなしで操作を始める(その押したボタン自体の操作は行わない)
    const anyPressed = pad.buttons.some((b, i) => i !== 9 && b.pressed);
    if (anyPressed && !padWasPressed) { padActive = true; showHintIfNeeded(); syncPadPrev(pad); }
    padWasPressed = anyPressed;
    return;
  }
  if (padPressed(pad, 9)) { padActive = false; if (controls.isLocked) controls.unlock(); showHintIfNeeded(); return; } // +: 一時停止
  // 右スティック: 見回す
  const rx = deadzone(pad.axes[2] || 0), ry = deadzone(pad.axes[3] || 0);
  camera.rotation.y -= rx * 2.2 * delta;
  camera.rotation.x = Math.max(-1.3, Math.min(1.3, camera.rotation.x - ry * 1.6 * delta));
  if (padPressed(pad, 2) || padPressed(pad, 0)) activateAim(); // Y・B
  if (padPressed(pad, 3) || padPressed(pad, 7)) toggleCurrentTool(); // X・ZR
  if (padPressed(pad, 4)) cycleTool(-1); // L
  if (padPressed(pad, 5)) cycleTool(1);  // R
  if (padPressed(pad, 13)) returnCurrentTool(); // 十字キーの下
}

// ---------- メインループ ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  const pad = pollPad();
  updatePad(delta, pad);
  updateMovement(delta, pad);
  updateBoardHover();
  redrawBoardIfNeeded();
  updateTools(delta, clock.elapsedTime);
  // 他のプレイヤーは、受け取った位置へなめらかに寄せる(通信は間引いて届くため)
  remotePlayers.forEach((rp) => {
    rp.group.position.lerp(rp.target, Math.min(1, delta * 10));
    rp.group.rotation.y += (rp.rotY - rp.group.rotation.y) * Math.min(1, delta * 10);
    // 実際に動いた距離から速さを出して、歩きの動きに渡す。止まっている間は速さが0なので、手足は動かず、元の姿勢で立つ
    if (rp.avatar && delta > 0) rp.avatar.update(delta, rp.group.position.distanceTo(rp.prev) / delta);
    rp.prev.copy(rp.group.position);
  });
  moveTimer += delta;
  if (moveTimer > 0.08) { moveTimer = 0; sendMove(); } // 秒間約12回まで
  space.clock.rotation.z = 0; // 時計は止まった絵(針は絵に含まれている)
  renderer.render(scene, camera);
}
showHintIfNeeded();
animate();
