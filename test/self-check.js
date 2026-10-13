// 「検査そのものが、本当に事故を見つけられるか」を確かめる(npm run test:selfcheck)。
// リポジトリを一時フォルダにコピーして、1か所ずつわざと壊し、そのたびに npm test が失敗することを確認する。
// 失敗するはずなのに全部通ってしまった壊し方があれば、その部分の検査は役に立っていない。
// 検査を足したり直したりしたときに実行する。実際のファイルは変更しない(コピーだけを壊す)。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'robot']);

function copyRepo(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const from = path.join(ROOT, e.name), to = path.join(dest, e.name);
    if (e.isDirectory()) copyRepo2(from, to); else fs.copyFileSync(from, to);
  }
}
function copyRepo2(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyRepo2(a, b); else fs.copyFileSync(a, b);
  }
}

// [壊し方の説明, ファイル, 探す文字列, 置き換える文字列]  探す文字列は、必ず1か所以上ある(なければ、この一覧が古いので、失敗にする)
const MUTATIONS = [
  ['engine.js の export 一覧から、マップが使う名前(setOrbRoom)を消す', 'engine.js', 'initHaunting, setExteriorDoor, setOrbRoom, currentGhost', 'initHaunting, setExteriorDoor, currentGhost'],
  ['engine.js の export 一覧に、存在しない名前を書く', 'engine.js', '  setDifficulty, getDifficultyId,\n};', '  setDifficulty, getDifficultyId, ghostThatDoesNotExist,\n};'],
  ['house-map.js の import の名前を1文字間違える', 'house-map.js', 'addFurniture, makeWoodTexture', 'addFurnitur, makeWoodTexture'],
  ['online-game.js の import の名前を間違える', 'online-game.js', 'applyMoneyUpdate }', 'applyMoneyUpdat }'],
  ['main.js が読み込むマップのファイル名を間違える', 'main.js', "'./sunny-meadows-map.js'", "'./sunny-meadow-map.js'"],
  ['sunny-meadows-map.js が使う Layout の関数名を間違える', 'sunny-meadows-map.js', 'Layout.computeLayout()', 'Layout.computeLayouts()'],
  ['lobby.html の importmap から three/addons を消す', 'lobby.html', '        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/",\n', ''],
  ['game.html の importmap から socket.io-client を消す(最後の行なので、前の行のカンマも消す)', 'game.html', 'examples/jsm/",\n        "socket.io-client": "https://cdn.socket.io/4.7.5/socket.io.esm.min.js"', 'examples/jsm/"'],
  ['移動先の html の名前を間違える', 'lobby.js', "'game.html?map='", "'gamee.html?map='"],
  ['engine.js の末尾に、閉じていない括弧を足す(文法エラー)', 'engine.js', '  setDifficulty, getDifficultyId,\n};', '  setDifficulty, getDifficultyId,\n};\nfunction broken( {'],
  ['server.js が require する名前を間違える', 'server.js', "const { createMoneyStore } = require('./money');", "const { createMoneyStores } = require('./money');"],
  ['間取り: ドアの指定の部屋名を間違える', 'sunny-meadows-layout.js', "L('Foyer', 'Managers Office')", "L('Foyer', 'Manager Office')"],
  ['間取り: ドアを1つ消して、部屋に入れなくする(Utility Room)', 'sunny-meadows-layout.js', ", L('Utility Room', 'CC East 2')", ''],
  ['間取り: 部屋の座標をずらして、となりの部屋と重ねる', 'sunny-meadows-layout.js', "R('Male Room 05', FLOOR_1F, 210, 240, 480, 523)", "R('Male Room 05', FLOOR_1F, 200, 240, 480, 523)"],
  ['間取り: 玄関の位置をずらす(z=0 でなくなる)', 'sunny-meadows-layout.js', "R('Foyer', FLOOR_1F, 500, 540, 592, 665)", "R('Foyer', FLOOR_1F, 500, 540, 592, 655)"],
  ['お金: 二重受け取りの防止を壊す', 'money.js', 'if (claimId && claims.includes(claimId))', 'if (false)'],
  ['お金: サーバーの報酬の式だけ変える', 'server.js', 'return 1000 + Math.max(0, Math.round((600 - Math.min(elapsed, 600)) * 2));', 'return 1100 + Math.max(0, Math.round((600 - Math.min(elapsed, 600)) * 2));'],
  ['お金: 報酬の保存の目印を、プレイヤーごとに違うものにする(同じアカウントに二重に保存される)', 'server.js', '{ name: p.name, claimId });', '{ name: p.name, claimId: claimId + p.id });'],
  ['サーバー: 幽霊の状態を、ホスト以外も送れるようにする', 'server.js', "if (!p || !p.host || ![msg.x, msg.y, msg.z].every(Number.isFinite)) return;\n    const state", "if (!p || ![msg.x, msg.y, msg.z].every(Number.isFinite)) return;\n    const state"],
  ['サーバー: 同じ人が何度でも投票できるようにする', 'server.js', 'if (!p || p.vote || p.alive === false || p.out || !ghost) return;', 'if (!p || p.alive === false || p.out || !ghost) return;'],
  ['サーバー: ホスト交代をやめる', 'server.js', 'if (player.host) { // 幽霊を計算しているホストが', 'if (false) { // 幽霊を計算しているホストが'],
  ['サーバー: ドアの番号の検証をゆるくする', 'server.js', 'v >= 0 && v < 1000;', 'v >= 0;'],
  ['サーバー: 4人の上限を外す', 'server.js', 'room.players.size >= MAX_PLAYERS', 'room.players.size >= 99'],
  ['サーバー: マップの一覧に、ボードにないものを足す', 'server.js', "const MAPS = ['house', 'grafton', 'sunny'];", "const MAPS = ['house', 'grafton', 'sunny', 'castle'];"],
  ['ボード: 「ゲーム開始」ボタンがホストに出ないようにする', 'lobby-board.js', "if (room.isHost) button('start'", "if (!room.isHost) button('start'"],
  ['ボード: マップの一覧から Sunny Meadows を消す', 'lobby-board.js', "  { id: 'sunny', label: 'Sunny Meadows'", "  { id: 'sunnyy', label: 'Sunny Meadows'"],
  ['本編: 難易度の表示名をボードと違うものにする', 'engine/ghost-data.js', "label: 'ナイトメア'", "label: 'ナイトメアー'"],
  ['見た目: ui.css のクラス名の綴りを変える', 'ui.css', '.gh-blood-overlay', '.gh-blood-overlays'],
  ['見た目: lobby.js が付けるクラス名を間違える', 'lobby.js', 'gh-lobby-hotbar-slot', 'gh-lobby-hotbar-slott'],
  ['見た目: lobby.html が lobby.css を読み込まなくなる', 'lobby.html', 'href="lobby.css"', 'href="lobbyy.css"'],
  ['見た目: engine.js に style.cssText を書き足す', 'engine.js', "bloodOverlay.className = 'gh-blood-overlay';", "bloodOverlay.className = 'gh-blood-overlay'; bloodOverlay.style.cssText = 'top:0';"],
  ['スキン: 一覧にスキンを足して、skins.js に作り方を書き忘れる', 'skin-catalog.js', "  { id: 'capsule',", "  { id: 'ghostly', label: 'ゴースト', lines: ['未実装'] },\n  { id: 'capsule',"],
  ['スキン: サーバーが受け付ける id の形を、一覧と変えてしまう', 'server.js', '/^[a-z][a-z0-9_]{0,23}$/.test(value)', '/^[a-z][a-z0-9_]{0,40}$/.test(value)'],
  ['スキン: サーバーが、形の違う id も受け付ける', 'server.js', "const skin = cleanSkin(msg.skin);\n    if (!p || !skin) return;", "const skin = msg.skin;\n    if (!p || !skin) return;"],
  ['スキン: サーバーが、変えた本人にも skinChanged を送る(別の人への通知を全員へ)', 'server.js', "emitRoom(room, 'skinChanged', { id: p.id, skin }, p.id);", "emitRoom(room, 'skinChanged', { id: p.id, skin });"],
  ['スキン: つなぎ直した人の一覧に、スキンが入らない', 'server.js', "inLobby: p.inLobby !== false, skin: p.skin }));", "inLobby: p.inLobby !== false }));"],
  ['スキン: ロビーが、部屋を作るときに、スキンを送らない', 'lobby.js', "type: 'create', name: board.name, skin: board.skin,", "type: 'create', name: board.name,"],
  ['スキン: ボードの部屋の中から「スキン」ボタンを消す', 'lobby-board.js', "button('skin', 'スキン', 2, true, skinLabel(state.skin));", ""],
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-selfcheck-'));
function runIn(dir) {
  const r = spawnSync(process.execPath, [path.join(dir, 'test', 'run.js')], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  const failed = [...(r.stdout || '').matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { ok: r.status === 0, failed, out: (r.stdout || '') + (r.stderr || '') };
}

const base = path.join(tmp, 'base');
copyRepo(base);
const baseline = runIn(base);
if (!baseline.ok) { console.error('壊す前の状態で、すでに npm test が失敗しています。先にそちらを直してください。\n' + baseline.failed.join('\n')); process.exit(1); }
console.log(`壊す前: 全部通る。これから ${MUTATIONS.length} か所を、1つずつ壊して確かめます。\n`);

let escaped = 0;
MUTATIONS.forEach(([what, file, find, replace], i) => {
  const dir = path.join(tmp, 'm' + i);
  copyRepo(dir);
  const p = path.join(dir, file);
  const src = fs.readFileSync(p, 'utf8');
  if (!src.includes(find)) { console.log(`✗ [${i + 1}] ${what}\n    → この一覧が古くなっています(${file} に「${find.slice(0, 40)}…」が見つかりません)`); escaped++; return; }
  fs.writeFileSync(p, src.replace(find, replace));
  const r = runIn(dir);
  if (r.ok) { console.log(`✗ [${i + 1}] ${what}\n    → 壊したのに、検査が全部通りました(検査が足りません)`); escaped++; }
  else console.log(`✓ [${i + 1}] ${what}\n    → 検出: ${r.failed.length ? r.failed[0] + (r.failed.length > 1 ? ` ほか${r.failed.length - 1}件` : '') : '(試験の実行そのものが失敗)'}`);
  fs.rmSync(dir, { recursive: true, force: true });
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(escaped === 0 ? `\n${MUTATIONS.length} か所すべて、検査が事故を見つけました。` : `\n${escaped} か所は、見つけられませんでした。`);
process.exit(escaped === 0 ? 0 : 1);
