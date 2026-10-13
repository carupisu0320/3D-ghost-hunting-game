// このファイルはマップを増やしても書き換えなくて済むよう、薄いブートストラップだけにしてある。
// 実際のゲームの仕組みは engine.js、各マップの中身はそれぞれの map ファイルに分かれている。
// マップの実体(build())は、選ばれるまでは呼ばない(2つ以上のマップを同時に組み立ててしまわないようにするため)
import { addMapCard, startEngine, enterGame, requestPadStart, setHauntSeed, setDifficulty, scene, camera } from './engine.js';
import { build as buildHouse, mapLabel as houseLabel } from './house-map.js';
import { build as buildGrafton, mapLabel as graftonLabel } from './grafton-map.js';
import { build as buildSunny, mapLabel as sunnyLabel } from './sunny-meadows-map.js';

// ---- ロード画面 ----
// マップの組み立てと描画の準備は重く、その間ブラウザが固まって見えるので、黒い画面と「読み込み中」を出しておく。
// 点滅はCSSアニメーション(ui.css の .gh-map-loading-text)なので、重い処理の最中でも止まらずに動き続ける。

function showLoadingScreen(mapName) {
  const overlay = document.createElement('div');
  overlay.className = 'gh-map-loading';
  overlay.innerHTML = `
    <div class="gh-map-loading-name">${mapName}</div>
    <div id="mapLoadingText" class="gh-map-loading-text">読み込み中...</div>
    <div class="gh-map-loading-note">しばらくお待ちください</div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// ロビーの部屋から来たときに、サーバーから受け取った { seed, difficulty } が入る(ひとりで遊ぶときや、つながらなかったときは null のまま)
let onlineInfo = null;
// 難易度: オンラインのときは、サーバー(ホストが選んだもの)が優先。ひとりで遊ぶときは、ロビーが ?difficulty= で渡したもの。どちらもなければ「普通」
const urlDifficulty = new URLSearchParams(location.search).get('difficulty');

// マップが選ばれたら、先にロード画面を出し、それが実際に画面に描かれてから重い処理(build + enterGame)を始める。
// (先に始めてしまうと、ロード画面が描かれる前にブラウザが固まって、意味がなくなる)
function selectMap(label, buildFn) {
  return () => {
    const overlay = showLoadingScreen(label);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        if (onlineInfo && onlineInfo.seed != null) setHauntSeed(onlineInfo.seed); // 全員で同じ幽霊・同じ出没部屋にする(マップを組み立てる前に渡す)
        setDifficulty((onlineInfo && onlineInfo.difficulty) || urlDifficulty || 'normal'); // 難易度も、マップを組み立てる前に渡す(ハヤトを抽選から外すかどうかが、組み立て中に決まるため)
        buildFn();
        enterGame();
      } catch (err) {
        console.error('マップの読み込みに失敗しました', err);
      } finally {
        overlay.remove();
      }
    }));
  };
}

const startHouse = selectMap(houseLabel, buildHouse);
const startGrafton = selectMap(graftonLabel, buildGrafton);
const startSunny = selectMap(sunnyLabel, buildSunny);
addMapCard(houseLabel, true, startHouse);
addMapCard(graftonLabel, true, startGrafton);
addMapCard(sunnyLabel, true, startSunny);
addMapCard('近日追加予定', false, null);

startEngine();

// ロビーの部屋から来たときだけ、同じ部屋のほかのプレイヤーをロボットの見た目で表示する(ひとりで遊ぶときは、何も読み込まない)
let hasOnlineSession = false;
try { hasOnlineSession = !!sessionStorage.getItem('ghost_session'); } catch (e) { /* ignore */ }
// ひとりで遊ぶときは、すぐ終わる。オンラインのときは、部屋につなぎ直して、乱数の種を受け取るまで待つ(つながらなければ null)
let onlineReady = Promise.resolve(null);
if (hasOnlineSession) {
  onlineReady = import('./online-game.js')
    .then((m) => m.startOnlineSession({ scene, camera }))
    .then((session) => (session ? session.ready : null))
    .catch((err) => { console.warn('オンラインの準備に失敗しました(ひとりで続けます)', err); return null; })
    .then((info) => { onlineInfo = info; return info; });
}

// ロビーから ?map=house / ?map=grafton で来たときは、マップ選択を飛ばしてそのマップを始める。
// ポインターロック(マウスで視点を動かす状態)は、ページを移動した直後はクリックがないと始められないので、
// 「クリックして開始」の画面を一度はさむ。
const lobbyMap = new URLSearchParams(location.search).get('map');
const lobbyMaps = { house: [houseLabel, startHouse], grafton: [graftonLabel, startGrafton], sunny: [sunnyLabel, startSunny] };
if (lobbyMap && lobbyMaps[lobbyMap]) {
  const [label, start] = lobbyMaps[lobbyMap];
  const gate = document.createElement('div');
  gate.className = 'gh-start-gate';
  gate.innerHTML = `<div class="gh-gate-map">${label}</div><div id="gateMain" class="gh-gate-main">${hasOnlineSession ? '部屋につなぎ直しています…' : 'クリックして開始'}</div><div id="gateSub" class="gh-gate-sub">(コントローラーのボタンでも始められます)</div>`;
  document.body.appendChild(gate);
  // オンラインのときは、部屋につなぎ直して乱数の種(全員で同じ幽霊にするため)を受け取るまで、開始できないようにする
  onlineReady.then((info) => {
    gate.querySelector('#gateMain').textContent = 'クリックして開始';
    if (hasOnlineSession && !info) gate.querySelector('#gateSub').textContent = '(オンラインにつながらなかったので、ひとりで始めます)';
    // コントローラーのボタンを押したときは、クリックの代わりにして、視点固定なし(コントローラーだけで遊ぶ状態)で始める
    const padWatch = setInterval(() => {
      const pad = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(p => p);
      if (pad && pad.buttons.some(b => b.pressed)) { requestPadStart(); gate.click(); }
    }, 100);
    gate.addEventListener('click', () => { clearInterval(padWatch); gate.remove(); start(); }, { once: true });
  });
}
