// このファイルはマップを増やしても書き換えなくて済むよう、薄いブートストラップだけにしてある。
// 実際のゲームの仕組みは engine.js、各マップの中身はそれぞれの map ファイルに分かれている。
// マップの実体(build())は、選ばれるまでは呼ばない(2つ以上のマップを同時に組み立ててしまわないようにするため)
import { addMapCard, startEngine, enterGame } from './engine.js';
import { build as buildHouse, mapLabel as houseLabel } from './house-map.js';
import { build as buildGrafton, mapLabel as graftonLabel } from './grafton-map.js';

// ---- ロード画面 ----
// マップの組み立てと描画の準備は重く、その間ブラウザが固まって見えるので、黒い画面と「読み込み中」を出しておく。
// 点滅はCSSアニメーションなので、重い処理の最中でも止まらずに動き続ける。
const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
  @keyframes mapLoadingPulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
  #mapLoadingText { animation: mapLoadingPulse 1.2s ease-in-out infinite; }
`;
document.head.appendChild(loadingStyle);

function showLoadingScreen(mapName) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:#000;color:#ccc;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:200;';
  overlay.innerHTML = `
    <div style="font-size:14px;color:#777;">${mapName}</div>
    <div id="mapLoadingText" style="font-size:22px;color:#9fe6a0;letter-spacing:2px;">読み込み中...</div>
    <div style="font-size:12px;color:#555;">しばらくお待ちください</div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// マップが選ばれたら、先にロード画面を出し、それが実際に画面に描かれてから重い処理(build + enterGame)を始める。
// (先に始めてしまうと、ロード画面が描かれる前にブラウザが固まって、意味がなくなる)
function selectMap(label, buildFn) {
  return () => {
    const overlay = showLoadingScreen(label);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
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

addMapCard(houseLabel, true, selectMap(houseLabel, buildHouse));
addMapCard(graftonLabel, true, selectMap(graftonLabel, buildGrafton));
addMapCard('近日追加予定', false, null);

startEngine();
