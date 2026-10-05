// ロビーサーバー(server.js)の場所。ロビー(lobby.js)とゲーム本編(online-game.js)の両方がここを見る。
// 自分のパソコンで試すときは自動で localhost:8080 につながる。インターネットに公開したサーバーを使うときは、PUBLIC_SERVER_URL を書き換える。
export const PUBLIC_SERVER_URL = 'https://threed-ghost-hunting-game.onrender.com';
export const SERVER_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:8080' : PUBLIC_SERVER_URL;
