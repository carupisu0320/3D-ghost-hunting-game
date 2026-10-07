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
//   - 幽霊の状態(位置・ハント中か・狙っている人・オーブ) → ホストから全員へ
//   - 世界の操作(ドア・ブレーカー・照明スイッチ・床の道具を拾う/置く・ノートへの書き込み) → 全員へ。サーバーが「今の状態」も覚えていて、あとから入った人にまとめて渡す
//   - 死亡(ホストが判定) → 全員へ。死んだ人は、以後、狙われない
//   - お金: Googleにログインしている人には、特定の結果の報酬を、Googleアカウントごとに保存する(money.js / FIREBASE_SETUP.md)
//   - 特定(一人ひとりの投票) → サーバーが多数決で集計(同票なら同票の中からランダム)して、結果を全員へ。結果が出たら、部屋はそのまま残る(ロビーに戻って続けられる)
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
const { createMoneyStore } = require('./money'); // 稼いだお金のGoogleアカウントごとの保存(設定がなければオフ)

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 4;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I など紛らわしい文字は除外
const PLAYER_COLORS = [0xff5555, 0x55aaff, 0x55dd77, 0xffcc33]; // 最大4人ぶんの識別色
const MAPS = ['house', 'grafton']; // 選べるマップのid(lobby-board.js の MAPS と同じ。main.js の ?map= にもそのまま使う)
const DEFAULT_MAP = 'grafton';
// 選べる難易度のid(lobby-board.js の DIFFICULTIES・engine.js の DIFFICULTIES と同じ)。普通がこれまでのゲーム
//   easy=易しい(ブレーカーは一度上げれば落ちない) / normal=普通 / hard=難しい(ブレーカーが落とされやすい) / nightmare=ナイトメア(ブレーカーが上がらない・ハヤトは出ない)
const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
const DEFAULT_DIFFICULTY = 'normal';
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
const money = createMoneyStore();
console.log(money.enabled ? `お金の保存: オン(${money.mode})` : `お金の保存: オフ(${money.reason})`);

// ---- お金の窓口(HTTP) ----
//   GET  /me     ログイン中の本人の所持金を返す             ヘッダー: Authorization: Bearer <GoogleログインのIDトークン>
//   POST /claim  ひとりで遊んだ結果の報酬を受け取る       本文(JSON): { correct, elapsed, claimId }
// 報酬の額は、ブラウザから受け取らず、サーバーが correct と elapsed から計算する。同じ claimId は二重に受け取れない。
// ひとりで遊ぶ結果は、ブラウザの申告をそのまま信じるしかないので、受け取りは1分に1回までにしてある(オンラインの報酬は、サーバーが計算する)
const CLAIM_INTERVAL_MS = Number(process.env.CLAIM_INTERVAL_MS) || 60000;
const lastClaimAt = new Map(); // uid -> 最後に受け取った時刻
function sendJson(req, res, status, body) {
  const origin = req.headers.origin;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (origin && isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}
function bearerToken(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}
function readJsonBody(req, limit = 2000) {
  return new Promise((resolve, reject) => {
    let size = 0, data = '';
    req.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else data += chunk; });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const httpServer = http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS' && (path === '/me' || path === '/claim')) { // ブラウザが先に送ってくる確認(CORS)
    const origin = req.headers.origin;
    const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' };
    if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(204, headers); res.end(); return;
  }
  if ((path === '/me' && req.method === 'GET') || (path === '/claim' && req.method === 'POST')) {
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) { sendJson(req, res, 403, { error: 'forbidden' }); return; }
    if (!money.enabled) { sendJson(req, res, 200, { enabled: false }); return; } // サーバー側の保存設定がまだ
    let user;
    try { user = await money.verify(bearerToken(req)); } catch (e) { sendJson(req, res, 401, { error: 'ログインを確認できませんでした' }); return; }
    try {
      if (path === '/me') {
        sendJson(req, res, 200, { enabled: true, uid: user.uid, name: user.name, balance: await money.get(user.uid) });
        return;
      }
      const body = await readJsonBody(req);
      const claimId = String(body.claimId || '').slice(0, 64);
      if (!claimId || typeof body.correct !== 'boolean') { sendJson(req, res, 400, { error: 'bad request' }); return; }
      const now = Date.now();
      if (now - (lastClaimAt.get(user.uid) || 0) < CLAIM_INTERVAL_MS) {
        sendJson(req, res, 429, { error: 'too fast', balance: await money.get(user.uid) }); return;
      }
      const elapsed = Math.min(36000, Math.max(0, Number(body.elapsed) || 0));
      const reward = body.correct ? calcReward(true, elapsed) : calcReward(false, elapsed);
      const r = await money.add(user.uid, reward, { name: user.name, claimId: 'solo:' + claimId });
      if (!r.duplicate) lastClaimAt.set(user.uid, now);
      sendJson(req, res, 200, { enabled: true, reward: r.duplicate ? 0 : reward, balance: r.balance, duplicate: r.duplicate });
    } catch (e) {
      console.error('お金の処理に失敗:', e.message);
      sendJson(req, res, 500, { error: 'server error' });
    }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('ghost-hunting lobby server is running\n');
});
const io = new Server(httpServer, {
  cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
});

// 世界の状態(ドア・スイッチは、マップの組み立て順の番号。道具は 's'+番号(最初からある道具)か 'd…'(誰かが置いた道具))
const WORLD_TOOLS = new Set(['flashlight', 'emf', 'thermometer', 'notebook', 'spiritbox', 'uv', 'dots']);
function newWorld() { return { doors: {}, switches: {}, breaker: null, taken: {}, drops: {}, notebook: false }; }

const rooms = new Map(); // code -> { code, map, inGame, seed, ghost(ホストが最後に送った幽霊の状態), truth(本当の幽霊の名前), elapsedMax(特定までの時間), result(最後の特定の結果), players: Map(playerId -> player) }
// player = { id(ページを移動しても変わらない目印), token(つなぎ直すときの合言葉。本人にしか教えない), sockId(いまの接続。切れている間はnull), name, color, host, timer,
//            hostTimer(ホスト交代の待ち), pos(最後の位置), sanity(正気度。ゲームに入るまでundefined), alive(死んでいないか), out(特定の投票に数えない: 結果が出た・ロビーに戻った),
//            vote(特定で選んだ幽霊の名前。まだならnull), gameBound(ゲームのページへ移動中・ゲーム中。切れても、すぐには部屋から外さない),
//            inLobby(いまロビーのページにいるか。ロビーでは、ロビーにいる人だけをアバターで出す),
//            uid(Googleにログインしていて、サーバーがトークンを確認できた人だけ。報酬の保存先) }

function generateRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function roomPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name, color: p.color, host: p.host, online: p.sockId !== null, pos: p.pos || null, sanity: p.sanity, alive: p.alive !== false, out: !!p.out, inLobby: p.inLobby !== false }));
}
function newPlayer(socket, name, host, color) {
  return { id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'), sockId: socket.id, name, color, host, timer: null, hostTimer: null, sanity: undefined, alive: true, out: false, vote: null, gameBound: false, inLobby: true, uid: null };
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

// ---------- 特定(多数決) ----------
// 生きていて、まだ投票していない(つながっている)人が全員投票を終えたら、結果を出す。
// 一番票が多い幽霊に決まり、同票なら、同票の中からランダムに決める。結果が出たら、ゲームは終わり、部屋はそのまま残る(inGameがfalseに戻る)。
// 本当の幽霊の名前はサーバーは知らないので、投票と一緒に各自のブラウザから送ってもらう(全員同じ幽霊なので、どれも同じ値)
function calcReward(correct, elapsed) { // 本編(engine.js)の calculateReward と同じ式
  if (!correct) return 100;
  return 1000 + Math.max(0, Math.round((600 - Math.min(elapsed, 600)) * 2));
}
function voteStatus(room) {
  const players = Array.from(room.players.values());
  const voted = players.filter(p => p.vote);
  const pending = players.filter(p => !p.vote && p.alive !== false && !p.out && p.sockId !== null);
  return { voted, pending, status: { voted: voted.map(p => p.id), total: voted.length + pending.length } };
}
function finalizeVote(room, voted) {
  const counts = new Map();
  voted.forEach(p => counts.set(p.vote, (counts.get(p.vote) || 0) + 1));
  const tally = Array.from(counts, ([ghost, count]) => ({ ghost, count })).sort((a, b) => b.count - a.count);
  let winner = null, tied = [];
  if (tally.length > 0) {
    tied = tally.filter(t => t.count === tally[0].count).map(t => t.ghost);
    winner = tied[Math.floor(Math.random() * tied.length)]; // 同票なら、同票の中からランダム
  }
  const correct = winner !== null && winner === room.truth;
  const elapsed = room.elapsedMax || 0;
  const result = {
    winner, tie: tied.length > 1, tied, tally,
    votes: voted.map(p => ({ id: p.id, name: p.name, ghost: p.vote })),
    truth: room.truth, correct, wipe: winner === null, // wipe: 誰も特定できないまま全滅した
    elapsed, reward: winner === null ? 0 : calcReward(correct, elapsed), at: Date.now(),
  };
  room.result = result;
  room.inGame = false; // ここでゲームは終わり。部屋は残るので、ロビーに戻ってまた始められる
  io.to(room.code).emit('identifyResult', { result });
  payout(room, result).catch((e) => console.error('報酬の保存に失敗:', e.message)); // 保存を待たずに、結果は先に全員へ届いている
}
// 結果が出たら、Googleにログインしている全員に、報酬を保存する(同じアカウントで2人入っていても、二重には受け取れない)
async function payout(room, result) {
  if (!money.enabled || !result.reward) return;
  const claimId = `room:${room.code}:${result.at}`;
  for (const p of Array.from(room.players.values())) {
    if (!p.uid) continue;
    const sock = p.sockId && io.sockets.sockets.get(p.sockId);
    try {
      const r = await money.add(p.uid, result.reward, { name: p.name, claimId });
      if (sock) sock.emit('moneyUpdate', { reward: r.duplicate ? 0 : result.reward, balance: r.balance, duplicate: r.duplicate });
    } catch (e) {
      console.error('報酬の保存に失敗:', e.message);
      if (sock) sock.emit('moneyUpdate', { error: true });
    }
  }
}
function maybeFinalize(room) {
  if (!room.inGame) return;
  const { voted, pending, status } = voteStatus(room);
  io.to(room.code).emit('voteUpdate', status);
  if (pending.length === 0) finalizeVote(room, voted);
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
  maybeFinalize(room); // 投票を待っていた人が抜けたら、残りの票で結果を出す
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

  // Googleログインの確認。ブラウザがIDトークンを送ってきて、サーバーが本物か確かめる(確かめられた uid だけを使う)
  // 部屋に入る前でも後でもよい(どちらの順でも、部屋のプレイヤーに結びつく)
  socket.on('auth', async (msg = {}) => {
    if (!money.enabled) return;
    try {
      const user = await money.verify(String(msg.token || ''));
      socket.data.uid = user.uid;
      const room = rooms.get(socket.data.roomCode);
      const me = room && room.players.get(socket.data.playerId);
      if (me) me.uid = user.uid;
      socket.emit('authed', { name: user.name, balance: await money.get(user.uid) });
    } catch (e) {
      socket.emit('authed', { error: true });
    }
  });

  // 部屋を作る
  socket.on('create', (msg = {}) => {
    if (socket.data.roomCode) return; // すでにどこかの部屋にいる
    const code = generateRoomCode();
    const map = MAPS.includes(msg.map) ? msg.map : DEFAULT_MAP;
    const player = newPlayer(socket, cleanName(msg.name), true, PLAYER_COLORS[0]);
    player.uid = socket.data.uid || null; // 先にログインの確認が済んでいれば、ここで結びつく
    const difficulty = DIFFICULTIES.includes(msg.difficulty) ? msg.difficulty : DEFAULT_DIFFICULTY;
    const room = { code, map, difficulty, inGame: false, seed: 0, ghost: null, world: newWorld(), truth: null, elapsedMax: 0, result: null, players: new Map([[player.id, player]]) };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.join(code);
    socket.emit('created', { code, map, difficulty, playerId: player.id, token: player.token, players: roomPlayerList(room) });
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
    player.uid = socket.data.uid || null;
    room.players.set(player.id, player);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.emit('joined', { code: room.code, map: room.map, difficulty: room.difficulty, playerId: player.id, token: player.token, players: roomPlayerList(room) });
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

  // 難易度を変える(ホストだけ。決まっている難易度にだけ変えられる)
  socket.on('setDifficulty', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.inGame) return; // ゲーム中は変えられない
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host || !DIFFICULTIES.includes(msg.difficulty)) return;
    room.difficulty = msg.difficulty;
    socket.to(room.code).emit('difficultyChanged', { difficulty: room.difficulty });
  });

  // ゲーム開始(ホストだけ)。全員(ホスト自身も)に、選ばれているマップを伝える
  socket.on('start', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host) return;
    if (room.inGame) { socket.emit('error', { message: 'まだゲーム中です。特定が終わるまで待ってください' }); return; }
    room.inGame = true; // これ以降、途中参加はできない。切れたプレイヤーは、つなぎ直すまで少し待つ
    room.result = null; room.truth = null; room.elapsedMax = 0;
    room.seed = crypto.randomBytes(4).readUInt32BE(0); // 全員が同じ幽霊・同じ出没部屋になるための乱数の種
    room.ghost = null;
    room.world = newWorld(); // ドアやスイッチは、新しいゲームではまっさらから
    room.players.forEach((pl) => { pl.pos = null; pl.sanity = undefined; pl.alive = true; pl.out = false; pl.vote = null; pl.gameBound = true; pl.inLobby = false; }); // ロビーでの位置などは持ち越さない
    io.to(room.code).emit('gameStart', { map: room.map, difficulty: room.difficulty, seed: room.seed });
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
      orb: msg.orb && [msg.orb.x, msg.orb.y, msg.orb.z].every(Number.isFinite) ? { x: msg.orb.x, y: msg.orb.y, z: msg.orb.z } : null, // 出ているときだけ
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
    maybeFinalize(room); // 死んだ人は投票を待たれない。全員死んだら、そこでゲーム終了
  });

  // 世界の操作(ドアを開ける・ブレーカー・スイッチ・道具を拾う/置く・ノートへの書き込み)。覚えておいて、ほかの全員へ中継する
  socket.on('world', (ev = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inGame) return;
    const me = room.players.get(socket.data.playerId);
    if (!me || !room.world) return;
    const w = room.world;
    const idOk = (v) => Number.isInteger(v) && v >= 0 && v < 1000;
    const out = { kind: ev.kind, name: me.name };
    switch (ev.kind) {
      case 'door': if (!idOk(ev.id)) return; w.doors[ev.id] = !!ev.open; out.id = ev.id; out.open = !!ev.open; break;
      case 'switch': if (!idOk(ev.id)) return; w.switches[ev.id] = !!ev.on; out.id = ev.id; out.on = !!ev.on; break;
      case 'breaker': w.breaker = !!ev.on; out.on = !!ev.on; if (ev.ghost && me.host) out.ghost = true; break; // ghost: 幽霊(ポルターガイスト)が落とした。ホストだけが送れる
      case 'take': {
        const id = String(ev.id || '').slice(0, 40);
        if (!id) return;
        if (id[0] === 'd') delete w.drops[id]; else w.taken[id] = true; // 置かれた道具を拾ったら、置かれた道具の一覧から消す
        out.id = id; break;
      }
      case 'drop': {
        const id = String(ev.id || '').slice(0, 40);
        if (!id || id[0] !== 'd' || !WORLD_TOOLS.has(ev.tool) || ![ev.x, ev.z].every(Number.isFinite)) return;
        const drop = { tool: ev.tool, x: ev.x, z: ev.z };
        if (Number.isFinite(ev.y)) drop.y = ev.y;
        w.drops[id] = drop; Object.assign(out, { id }, drop); break;
      }
      case 'notebook': w.notebook = true; break;
      default: return;
    }
    socket.to(room.code).emit('world', out);
  });

  // マップに入ったとき・つなぎ直したときに、今の世界の状態をまとめてもらう
  socket.on('worldSync', () => {
    const room = rooms.get(socket.data.roomCode);
    if (room && room.world) socket.emit('worldState', room.world);
  });

  // 特定(投票)。一人1回だけ。生きていて、まだこの回のプレイを続けている人だけが投票できる
  socket.on('vote', (msg = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inGame) return;
    const p = room.players.get(socket.data.playerId);
    const ghost = String(msg.ghost || '').slice(0, 30);
    if (!p || p.vote || p.alive === false || p.out || !ghost) return;
    p.vote = ghost;
    if (!room.truth && typeof msg.truth === 'string' && msg.truth) room.truth = msg.truth.slice(0, 30);
    if (Number.isFinite(msg.elapsed)) room.elapsedMax = Math.max(room.elapsedMax || 0, Math.min(msg.elapsed, 36000));
    maybeFinalize(room);
  });

  // ホストが、いまある票で結果を出す(まだ投票していない人が、動かなくなったときの逃げ道)
  socket.on('forceFinalize', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inGame) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || !p.host) return;
    const { voted } = voteStatus(room);
    if (voted.length > 0) finalizeVote(room, voted);
  });

  // 「部屋を出る」。切れたときと違って、待たずにすぐ部屋から外す
  socket.on('leave', () => {
    const room = rooms.get(socket.data.roomCode);
    if (room) removePlayer(room, socket.data.playerId);
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
    if (socket.data.uid) player.uid = socket.data.uid;
    player.inLobby = msg.lobby === true;
    if (msg.lobby === true) { // ロビーに戻ってきた(ゲームが続いているなら、その回の投票には数えない)
      player.out = true; player.gameBound = false;
      maybeFinalize(room); // 最後の一人が戻ったなら、ここで結果が出る(下の rejoined に、出たばかりの結果を入れるため、先に行う)
    }
    socket.emit('rejoined', { code: room.code, map: room.map, difficulty: room.difficulty, seed: room.seed, ghost: room.ghost, inGame: room.inGame, result: room.result, voteStatus: voteStatus(room).status, playerId: player.id, players: roomPlayerList(room) });
    socket.to(room.code).emit('playerRejoined', { id: player.id, name: player.name, color: player.color, host: player.host, pos: player.pos || null, sanity: player.sanity, alive: player.alive !== false, out: !!player.out, inLobby: player.inLobby });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    const player = room && room.players.get(socket.data.playerId);
    if (!room || !player || player.sockId !== socket.id) return; // すでに別の接続に引き継がれている
    if (room.inGame || player.gameBound) {
      // ゲーム中(結果が出たあと、ロビーへ戻る途中も含む)の切断は、ページの移動かもしれないので、少し待つ。戻ってこなければ部屋から外す
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
