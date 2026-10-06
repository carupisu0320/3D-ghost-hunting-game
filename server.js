// マルチプレイ用ロビーサーバー(Node.js + Socket.IO)
//
// 使い方:
//   npm install
//   node server.js
//   (環境変数 PORT でポート番号を指定可能。デフォルトは 8080)
//
// このサーバーが持つ役割は「部屋(ルーム)の管理(参加者・マップ選択・ゲーム開始の合図)」と「プレイヤー同士の情報の橋渡し」。
// ゲーム本編では、次のものを橋渡しする(幽霊の動きや死亡の判定そのものは、ホストのブラウザが計算する。サーバーは中継するだけ):
//   - ゲーム開始のときに乱数の種(seed)を配る → 全員が同じ幽霊・同じ出没部屋になる
//   - プレイヤーの位置・正気度 → ホストが「誰を狙うか」を決めるのに使う
//   - 幽霊の状態(位置・ハント中か・狙っている人) → ホストから全員へ
//   - 死亡(ホストが判定) → 全員へ。死んだ人は、以後、狙われない
//
// Socket.IOの基本(このファイルを読むときの目安):
//   socket.on('イベント名', (データ) => {...})  : クライアントから届いたイベントを受け取る
//   socket.emit('イベント名', データ)           : そのクライアントだけに送る
//   io.to(部屋名).emit(...)                      : 同じ部屋にいる全員に送る
//   socket.to(部屋名).emit(...)                  : 同じ部屋の、送ってきた本人以外に送る
//   socket.join(部屋名)                          : そのクライアントを部屋に入れる(ここでは部屋コードをそのまま部屋名にしている)

const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I など紛らわしい文字は除外
const PLAYER_COLORS = [0xff5555, 0x55aaff, 0x55dd77, 0xffcc33]; // 最大4人ぶんの識別色
const MAPS = ['house', 'grafton']; // 選べるマップのid(lobby-board.js の MAPS と同じ。main.js の ?map= にもそのまま使う)
const DEFAULT_MAP = 'grafton';
// ゲームが始まると、全員がロビーのページからゲームのページへ移動する(いったん接続が切れて、つなぎ直す)。
// その間にプレイヤーを部屋から外してしまわないよう、ゲーム中に切れたときは、この時間(ミリ秒)だけ待つ。戻ってこなければ外す
const REJOIN_GRACE_MS = Number(process.env.REJOIN_GRACE_MS) || 90000;
// ゲーム中にホストの接続が、この時間(ミリ秒)切れたままなら、つながっている別のプレイヤーをホストにする(幽霊の計算を引き継ぐため)。
// ページの移動ですぐ戻ってくる場合に交代してしまわないよう、少し待つ
const HOST_TRANSFER_MS = Number(process.env.HOST_TRANSFER_MS) || 8000;

// ---------- 接続を許可するサイト(CORS) ----------
// ブラウザは、別のドメインのサーバーへの接続を、サーバーが許可したサイトからのものに限っている。
// ここに、ロビーのページを公開しているサイトのURLを書いておく。環境変数 ALLOWED_ORIGINS(カンマ区切り)でも追加できる。
const ALLOWED_ORIGINS = [
  'https://carupisu0320.github.io', // GitHub Pages(ユーザー名のサイトの下にあるページ全部)
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []),
];
function isAllowedOrigin(origin) {
  if (!origin) return true;                                           // ブラウザ以外(テスト用のスクリプトなど)
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // 自分のパソコンで試すとき(ポートは何番でもOK)
}

// ---------- サーバー本体 ----------
// 普通のURLにアクセスされたときは「動いています」と返す(ホスティング側の死活確認と、ブラウザでの動作確認用)
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('ghost-hunting lobby server is running\n');
});
const io = new Server(httpServer, {
  cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
});

const rooms = new Map(); // code -> { code, map, inGame, seed, ghost(ホストが最後に送った幽霊の状態), players: Map(playerId -> player) }
// player = { id(ページを移動しても変わらない目印), token(つなぎ直すときの合言葉。本人にしか教えない), sockId(いまの接続。切れている間はnull), name, color, host, timer,
//            hostTimer(ホスト交代の待ち), pos(最後の位置), sanity(正気度。ゲームに入るまでundefined), alive(死んでいないか), out(特定などで、この回のプレイを終えたか) }

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, color: p.color, host: p.host, online: p.sockId !== null, pos: p.pos || null, sanity: p.sanity, alive: p.alive !== false, out: !!p.out }));
}
function newPlayer(socket, name, host, color) {
  return { id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'), sockId: socket.id, name, color, host, timer: null, hostTimer: null, sanity: undefined, alive: true, out: false };
}
// 部屋の全員に送る。exceptIdがあれば、そのプレイヤー(の今の接続)には送らない
function emitRoom(room, event, payload, exceptId) {
  const target = exceptId ? room.players.get(exceptId) : null;
  let to = io.to(room.code);
  if (target && target.sockId) to = to.except(target.sockId);
  to.emit(event, payload);
}

function cleanName(value) {
  return String(value || 'プレイヤー').trim().slice(0, 12) || 'プレイヤー';
}

// プレイヤーを部屋から外す(自分から抜けた・切れたまま戻ってこなかった)。部屋が空になったら部屋も消す
function removePlayer(room, playerId) {
  const leaving = room.players.get(playerId);
  if (!leaving) return;
  clearTimeout(leaving.timer);
  clearTimeout(leaving.hostTimer);
  room.players.delete(playerId);
  if (leaving.sockId) {
    const sock = io.sockets.sockets.get(leaving.sockId);
    if (sock) { sock.leave(room.code); sock.data.roomCode = null; sock.data.playerId = null; }
  }
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (leaving.host) {
    // ホストが抜けたら、残っている中で一番古参のプレイヤー(つながっている人を優先)を次のホストにする
    const next = pickNextHost(room, null) || room.players.values().next().value;
    next.host = true;
    emitRoom(room, 'hostChanged', { id: next.id });
  }
  emitRoom(room, 'playerLeft', { id: playerId });
}

// ホストの接続が切れたままのとき、つながっている別のプレイヤーをホストにする(戻ってきた元のホストは、ホストではなくなる)
// 次のホストにふさわしい人: つながっている人のうち、まだ生きていて(結果画面からロビーへ戻りにくい)プレイを続けている人を優先する
function pickNextHost(room, exceptId) {
  const online = Array.from(room.players.values()).filter(p => p.id !== exceptId && p.sockId !== null);
  return online.find(p => p.alive !== false && !p.out) || online[0] || null;
}
function transferHost(room, hostId) {
  if (rooms.get(room.code) !== room) return;
  const old = room.players.get(hostId);
  if (!old || !old.host || old.sockId !== null) return; // すでに戻ってきた、または別の人がホストになっている
  const next = pickNextHost(room, hostId);
  if (!next) return;
  old.host = false;
  next.host = true;
  emitRoom(room, 'hostChanged', { id: next.id });
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  // 部屋を作る
  socket.on('create', (msg = {}) => {
    if (socket.data.roomCode) return; // すでにどこかの部屋にいる
    const code = generateRoomCode();
    const map = MAPS.includes(msg.map) ? msg.map : DEFAULT_MAP;
    const player = newPlayer(socket, cleanName(msg.name), true, PLAYER_COLORS[0]);
    const room = { code, map, inGame: false, seed: 0, ghost: null, players: new Map([[player.id, player]]) };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.join(code);
    socket.emit('created', { code, map, playerId: player.id, token: player.token, players: roomPlayerList(room) });
  });

  // 部屋に参加する
  socket.on('join', (msg = {}) => {
    if (socket.data.roomCode) return;
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!room) { socket.emit('error', { message: 'その部屋コードは見つかりませんでした' }); return; }
    if (room.inGame) { socket.emit('error', { message: 'この部屋はもうゲームが始まっています' }); return; }
    if (room.players.size >= MAX_PLAYERS) { socket.emit('error', { message: 'この部屋は満員です(最大4人)' }); return; }

    const color = PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
    const player = newPlayer(socket, cleanName(msg.name), false, color);
    room.players.set(player.id, player);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.emit('joined', { code: room.code, map: room.map, playerId: player.id, token: player.token, players: roomPlayerList(room) });
    socket.to(room.code).emit('playerJoined', { id: player.id, name: player.name, color: player.color, host: player.host });
  });

  // 自分の位置を伝える(ほかの人にだけ中継する)
  socket.on('move', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || ![msg.x, msg.y, msg.z, msg.rotY].every(Number.isFinite)) return;
    const me = room.players.get(socket.data.playerId);
    const out = { id: socket.data.playerId, x: msg.x, y: msg.y, z: msg.z, rotY: msg.rotY };
    if (Number.isFinite(msg.sanity)) out.sanity = Math.min(100, Math.max(0, msg.sanity)); // ゲーム本編だけが送ってくる(ロビーでは付かない)
    if (typeof msg.out === 'boolean') out.out = msg.out;
    if (me) {
      me.pos = { x: msg.x, y: msg.y, z: msg.z, rotY: msg.rotY }; // 最後の位置を覚えておく(あとからつないだ人に教えるため)
      if (out.sanity !== undefined) me.sanity = out.sanity;
      if (out.out !== undefined) me.out = out.out;
    }
    socket.to(room.code).emit('playerMove', out);
  });

  // マップを変える(ホストだけ。存在するマップにだけ変えられる)
  socket.on('setMap', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host || !MAPS.includes(msg.map)) return;
    room.map = msg.map;
    socket.to(room.code).emit('mapChanged', { map: room.map }); // 変えた本人は手元で反映済みなので、ほかの人にだけ送る
  });

  // ゲーム開始(ホストだけ)。全員(ホスト自身も)に、選ばれているマップを伝える
  socket.on('start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host) return;
    room.inGame = true; // これ以降、途中参加はできない。切れたプレイヤーは、つなぎ直すまで少し待つ
    room.seed = crypto.randomBytes(4).readUInt32BE(0); // 全員が同じ幽霊・同じ出没部屋になるための乱数の種
    room.ghost = null;
    room.players.forEach((pl) => { pl.pos = null; pl.sanity = undefined; pl.alive = true; pl.out = false; }); // ロビーでの位置などは持ち越さない
    io.to(room.code).emit('gameStart', { map: room.map, seed: room.seed });
  });

  // 幽霊の状態(ホストだけが送れる)。ホスト以外の全員へ中継する
  socket.on('ghost', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inGame) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host || ![msg.x, msg.y, msg.z].every(Number.isFinite)) return;
    const state = {
      x: msg.x, y: msg.y, z: msg.z,
      hunt: !!msg.hunt,
      left: Number.isFinite(msg.left) ? Math.max(0, msg.left) : 0,
      target: typeof msg.target === 'string' ? msg.target : null,
    };
    room.ghost = state; // ホストが交代したり、つなぎ直した人がいたときのために、最後の状態を覚えておく
    socket.to(room.code).emit('ghost', state);
  });

  // 死亡(ホストだけが、判定の結果として送れる)。全員(ホスト自身も)へ知らせる
  socket.on('playerDied', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inGame) return;
    const p = room.players.get(socket.data.playerId);
    const victim = room.players.get(String(msg.id || ''));
    if (!p || !p.host || !victim || !victim.alive) return;
    victim.alive = false;
    io.to(room.code).emit('playerDied', { id: victim.id });
  });

  // ゲームのページで、ロビーのときと同じプレイヤーとしてつなぎ直す(codeと、ロビーで受け取ったtokenが合っていれば戻れる)
  socket.on('rejoin', (msg = {}) => {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const player = room && Array.from(room.players.values()).find(p => p.token === msg.token);
    if (!room || !player) { socket.emit('error', { message: '部屋に戻れませんでした', rejoin: true }); return; }
    clearTimeout(player.timer);
    clearTimeout(player.hostTimer);
    if (player.sockId && player.sockId !== socket.id) { // 古い接続が残っていたら切る
      const old = io.sockets.sockets.get(player.sockId);
      if (old) { old.data.roomCode = null; old.data.playerId = null; old.disconnect(true); }
    }
    player.sockId = socket.id;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.emit('rejoined', { code: room.code, map: room.map, seed: room.seed, ghost: room.ghost, playerId: player.id, players: roomPlayerList(room) });
    socket.to(room.code).emit('playerRejoined', { id: player.id, name: player.name, color: player.color, host: player.host, pos: player.pos || null, sanity: player.sanity, alive: player.alive !== false, out: !!player.out });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && room.players.get(socket.data.playerId);
    if (!room || !player || player.sockId !== socket.id) return; // すでに別の接続に引き継がれている
    if (room.inGame) {
      // ゲーム中の切断は、ページの移動かもしれないので、少し待つ。戻ってこなければ部屋から外す
      player.sockId = null;
      clearTimeout(player.timer);
      player.timer = setTimeout(() => { if (rooms.get(room.code) === room && player.sockId === null) removePlayer(room, player.id); }, REJOIN_GRACE_MS);
      if (player.host) { // 幽霊を計算しているホストが切れたままなら、つながっている別の人に交代する
        clearTimeout(player.hostTimer);
        player.hostTimer = setTimeout(() => transferHost(room, player.id), HOST_TRANSFER_MS);
      }
    } else {
      removePlayer(room, player.id);
    }
  });
});

httpServer.listen(PORT, () => console.log(`ロビーサーバー起動: http://localhost:${PORT}`));
