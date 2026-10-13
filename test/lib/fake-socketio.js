// socket.io の「偽物」(メモリの中だけで動く)。server.js を、ネットワークも socket.io のインストールもなしで動かすために使う。
// server.js が使っているところだけを再現している:
//   new Server(httpServer, opts) / io.on('connection') / io.to(部屋).emit / io.to(部屋).except(接続id).emit / io.sockets.sockets
//   socket.id / socket.data / socket.on / socket.emit / socket.join / socket.leave / socket.to(部屋).emit / socket.disconnect
// 本物の通信路(WebSocket)は試験していない。サーバーのルール(部屋・投票・ホスト交代・世界の状態・お金)を試験するためのもの。
const Module = require('module');

class FakeIO {
  constructor(httpServer, opts) {
    this.httpServer = httpServer; this.opts = opts;
    this.handlers = {};
    this.rooms = new Map();            // 部屋名 -> Set(接続id)
    this.sockets = { sockets: new Map() }; // 接続id -> サーバー側の socket
    this.nextId = 1;
    FakeIO.last = this;
  }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  to(room) {
    const io = this; const except = new Set();
    const target = { except(id) { except.add(id); return target; }, emit(ev, payload) { io._deliver(room, ev, payload, except); } };
    return target;
  }
  _deliver(room, ev, payload, except = new Set()) {
    for (const id of this.rooms.get(room) || []) {
      if (except.has(id)) continue;
      const s = this.sockets.sockets.get(id);
      if (s) s.client._receive(ev, payload);
    }
  }
  // 試験用: 新しいクライアントを接続する
  connect() {
    const io = this; const id = 's' + this.nextId++;
    const handlers = {};
    const server = {
      id, data: {}, client: null,
      on(ev, fn) { handlers[ev] = fn; },
      emit(ev, payload) { client._receive(ev, payload); },
      join(room) { if (!io.rooms.has(room)) io.rooms.set(room, new Set()); io.rooms.get(room).add(id); },
      leave(room) { const set = io.rooms.get(room); if (set) set.delete(id); },
      to(room) { return { emit(ev, payload) { io._deliver(room, ev, payload, new Set([id])); } }; },
      disconnect() { client._drop(); },
      handlers,
    };
    const client = {
      id, received: [], listeners: {}, connected: true,
      _receive(ev, payload) { this.received.push([ev, payload]); (this.listeners[ev] || []).forEach((fn) => fn(payload)); },
      on(ev, fn) { (this.listeners[ev] ||= []).push(fn); return this; },
      emit(ev, payload) { if (!this.connected) return; const fn = handlers[ev]; if (fn) return fn(payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))); },
      // これまでに受け取った、そのイベントの本文(新しい順ではなく、届いた順)
      all(ev) { return this.received.filter(([e]) => e === ev).map(([, p]) => p); },
      last(ev) { const a = this.all(ev); return a[a.length - 1]; },
      clear() { this.received.length = 0; },
      disconnect() { this._drop(); },
      _drop() {
        if (!this.connected) return; this.connected = false;
        io.sockets.sockets.delete(id);
        for (const set of io.rooms.values()) set.delete(id);
        if (handlers.disconnect) handlers.disconnect();
      },
    };
    server.client = client;
    this.sockets.sockets.set(id, server);
    this.handlers.connection(server);
    return client;
  }
}

// require('socket.io') を偽物に差し替える(server.js を読み込む前に呼ぶ)
function installFakeSocketIO() {
  const originalLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'socket.io') return { Server: FakeIO };
    return originalLoad.call(this, request, ...rest);
  };
  return () => { Module._load = originalLoad; };
}

module.exports = { FakeIO, installFakeSocketIO };
