// マルチプレイ用ロビーサーバー(Node.js + Socket.IO)
//
// 使い方:
//   npm install
//   node server.js
//   (環境変数 PORT でポート番号を指定可能。デフォルトは 8080)
//
// このサーバーが持つ役割は「部屋(ルーム)の管理(参加者・マップ選択・ゲーム開始の合図)」と「プレイヤー同士の位置情報の橋渡し」だけ。
// 幽霊の正解データなど、ゲーム本編の同期はまだ実装していない(ロビーが固まってから着手する)。
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

const rooms = new Map(); // code -> { code, map, inGame, players: Map(playerId -> player) }
// player = { id(ページを移動しても変わらない目印), token(つなぎ直すときの合言葉。本人にしか教えない), sockId(いまの接続。切れている間はnull), name, color, host, timer }

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, color: p.color, host: p.host, online: p.sockId !== null, pos: p.pos || null }));
}
function newPlayer(socket, name, host, color) {
  return { id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'), sockId: socket.id, name, color, host, timer: null };
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
  room.players.delete(playerId);
  if (leaving.sockId) {
    const sock = io.sockets.sockets.get(leaving.sockId);
    if (sock) { sock.leave(room.code); sock.data.roomCode = null; sock.data.playerId = null; }
  }
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  if (leaving.host) {
    // ホストが抜けたら、残っている中で一番古参のプレイヤーを次のホストにする
    const next = room.players.values().next().value;
    next.host = true;
    emitRoom(room, 'hostChanged', { id: next.id });
  }
  emitRoom(room, 'playerLeft', { id: playerId });
}

io.on('connection', (socket) => {
  socket.data.roomCode = null;

  // 部屋を作る
  socket.on('create', (msg = {}) => {
    if (socket.data.roomCode) return; // すでにどこかの部屋にいる
    const code = generateRoomCode();
    const map = MAPS.includes(msg.map) ? msg.map : DEFAULT_MAP;
    const player = newPlayer(socket, cleanName(msg.name), true, PLAYER_COLORS[0]);
    const room = { code, map, inGame: false, players: new Map([[player.id, player]]) };
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
    if (me) me.pos = { x: msg.x, y: msg.y, z: msg.z, rotY: msg.rotY }; // 最後の位置を覚えておく(あとからつないだ人に教えるため)
    socket.to(room.code).emit('playerMove', { id: socket.data.playerId, x: msg.x, y: msg.y, z: msg.z, rotY: msg.rotY });
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
    io.to(room.code).emit('gameStart', { map: room.map });
  });

  // ゲームのページで、ロビーのときと同じプレイヤーとしてつなぎ直す(codeと、ロビーで受け取ったtokenが合っていれば戻れる)
  socket.on('rejoin', (msg = {}) => {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const player = room && Array.from(room.players.values()).find(p => p.token === msg.token);
    if (!room || !player) { socket.emit('error', { message: '部屋に戻れませんでした', rejoin: true }); return; }
    clearTimeout(player.timer);
    if (player.sockId && player.sockId !== socket.id) { // 古い接続が残っていたら切る
      const old = io.sockets.sockets.get(player.sockId);
      if (old) { old.data.roomCode = null; old.data.playerId = null; old.disconnect(true); }
    }
    player.sockId = socket.id;
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.emit('rejoined', { code: room.code, map: room.map, playerId: player.id, players: roomPlayerList(room) });
    socket.to(room.code).emit('playerRejoined', { id: player.id, name: player.name, color: player.color, host: player.host, pos: player.pos || null });
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
    } else {
      removePlayer(room, player.id);
    }
  });
});

httpServer.listen(PORT, () => console.log(`ロビーサーバー起動: http://localhost:${PORT}`));
