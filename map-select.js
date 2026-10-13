// マップ選択画面(engine.js から分けたファイル)。main.js が addMapCard() でカードを並べる。
// 画面の部品を作るだけで、ゲームの状態には触らない。engine.js が、表示・非表示を切り替えるために mapSelectOverlay を使う。

// マップ選択画面。今は「一軒家」の1つだけだが、今後マップを追加してもここに並べていくだけで済むようにしてある
const mapSelectOverlay = document.createElement('div');
mapSelectOverlay.className = 'gh-map-select-overlay';
document.body.appendChild(mapSelectOverlay);

const mapSelectTitle = document.createElement('h1');
mapSelectTitle.textContent = 'マップを選択';
mapSelectTitle.className = 'gh-map-select-title';
mapSelectOverlay.appendChild(mapSelectTitle);

const mapSelectGrid = document.createElement('div');
mapSelectGrid.className = 'gh-map-select-grid';
mapSelectOverlay.appendChild(mapSelectGrid);

function addMapCard(label, enabled, onSelect) {
  const card = document.createElement('div');
  card.className = 'gh-map-card ' + (enabled ? 'is-enabled' : 'is-disabled'); // マウスを乗せたときの色も、ui.css(:hover)
  card.textContent = label;
  if (enabled) card.addEventListener('click', onSelect);
  mapSelectGrid.appendChild(card);
}

export { mapSelectOverlay, addMapCard };
