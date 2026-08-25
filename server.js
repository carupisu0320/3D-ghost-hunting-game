// マルチプレイ用ロビーサーバー(Node.js + ws)
//
// 使い方:
//   npm install
//   node server.js
//   (環境変数 PORT でポート番号を指定可能。デフォルトは 8080)
//
// このサーバーが持つ役割は「部屋(ルーム)の管理」と「プレイヤー同士の情報の橋渡し」だけ。
// 幽霊の正解データなど、ゲーム本編の同期はまだ実装していない(ロビーが固まってから着手する)。

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I など紛らわしい文字は除外
const PLAYER_COLORS = [0xff5555, 0x55aaff, 0x55dd77, 0xffcc33]; // 最大4人ぶんの識別色

const rooms = new Map(); // code -> { code, players: Map(id -> player) }
let nextId = 1;

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptId) {
  for (const p of room.players.values()) {
    if (p.id !== exceptId) send(p.ws, msg);
  }
}

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, color: p.color, host: p.host }));
}

function removePlayerFromRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const leaving = room.players.get(ws.playerId);
  room.players.delete(ws.playerId);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (leaving && leaving.host) {
    // ホストが抜けたら、残っている中で一番古参のプレイヤーを次のホストにする
    const next = room.players.values().next().value;
    next.host = true;
    broadcast(room, { type: 'hostChanged', id: next.id });
  }
  broadcast(room, { type: 'playerLeft', id: ws.playerId });
}

const wss = new WebSocketServer({ port: PORT });
console.log(`ロビーサーバー起動: ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  ws.playerId = null;
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'create') {
      const code = generateRoomCode();
      const id = nextId++;
      const player = {
        id, ws, host: true, color: PLAYER_COLORS[0],
        name: String(msg.name || 'プレイヤー').slice(0, 12),
        x: 0, y: 0, z: 0, rotY: 0,
      };
      const room = { code, players: new Map([[id, player]]) };
      rooms.set(code, room);
      ws.playerId = id;
      ws.roomCode = code;
      send(ws, { type: 'created', code, playerId: id, players: roomPlayerList(room) });
      return;
    }

    if (msg.type === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) { send(ws, { type: 'error', message: 'その部屋コードは見つかりませんでした' }); return; }
      if (room.players.size >= MAX_PLAYERS) { send(ws, { type: 'error', message: 'この部屋は満員です(最大4人)' }); return; }

      const id = nextId++;
      const color = PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
      const player = {
        id, ws, host: false, color,
        name: String(msg.name || 'プレイヤー').slice(0, 12),
        x: 0, y: 0, z: 0, rotY: 0,
      };
      room.players.set(id, player);
      ws.playerId = id;
      ws.roomCode = room.code;
      send(ws, { type: 'joined', code: room.code, playerId: id, players: roomPlayerList(room) });
      broadcast(room, { type: 'playerJoined', id, name: player.name, color: player.color, host: player.host }, id);
      return;
    }

    if (msg.type === 'move') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const p = room.players.get(ws.playerId);
      if (!p) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.rotY = msg.rotY;
      broadcast(room, { type: 'playerMove', id: ws.playerId, x: msg.x, y: msg.y, z: msg.z, rotY: msg.rotY }, ws.playerId);
      return;
    }

    if (msg.type === 'start') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const p = room.players.get(ws.playerId);
      if (!p || !p.host) return; // ホストだけが開始できる
      broadcast(room, { type: 'gameStart' });
      return;
    }
  });

  ws.on('close', () => {
    if (ws.roomCode) removePlayerFromRoom(ws);
  });
});
