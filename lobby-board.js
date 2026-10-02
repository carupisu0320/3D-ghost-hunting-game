// ホワイトボードの画面(ロビーのメニュー)を描く。描画とボタンの配置だけを担当し、通信や操作は lobby.js 側が行う。
// ボードの大きさ(canvas)は 1280×672。drawBoard() は描いたボタンの一覧(位置つき)を返すので、視線の先のボタンを調べるのに使う。
export const BOARD_W = 1280, BOARD_H = 672;
const FONT = '"Yomogi","Klee One","Hiragino Maru Gothic ProN","Yu Gothic","Meiryo","Noto Sans CJK JP",sans-serif';
const INK = '#2a2c30', SUB = '#6a6e75', RED = '#c0392b', BLUE = '#2f6fbf';

// 選べるマップ(idは main.js の ?map= と同じ)
export const MAPS = [
  { id: 'house', label: '一軒家', lines: ['1階+地下室の小さな一軒家', '玄関・リビング・寝室などがある', 'ブレーカーは地下にあります'] },
  { id: 'grafton', label: 'Grafton Farmhouse', lines: ['3階建て(1階・2階・屋根裏)の農家の廃屋', '部屋数14、推奨2人', 'ブレーカーはUtility Room'] },
];
export function mapLabel(id) { const m = MAPS.find(x => x.id === id); return m ? m.label : id; }

// state: { screen: 'main'|'maps', name, selectedMap, hoverId, message,
//          room: null | { code, isHost, myId, map, players: [{ id, name, host }] } }
export function drawBoard(ctx, state) {
  const { room } = state;
  const buttons = [];
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  // 紙面(ほんの少しだけムラをつけた白)
  const bg = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  bg.addColorStop(0, '#f6f7f5'); bg.addColorStop(1, '#e9ebe9');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.textBaseline = 'alphabetic';

  // タイトル
  ctx.fillStyle = INK; ctx.textAlign = 'center';
  ctx.font = `bold 58px ${FONT}`;
  ctx.fillText(state.screen === 'maps' ? 'マップ選択' : 'ゴーストハンティング', BOARD_W / 2, 92);
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(300, 112); ctx.lineTo(980, 112); ctx.stroke();

  // 左右のパネル(手書き風の枠)
  const panel = (x, y, w, h, title) => {
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h); ctx.strokeRect(x + 2, y + 1, w - 3, h - 2);
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = `bold 32px ${FONT}`;
    ctx.fillText(title, x + w / 2, y + 48);
    ctx.beginPath(); ctx.moveTo(x + 28, y + 62); ctx.lineTo(x + w - 28, y + 62); ctx.lineWidth = 2; ctx.stroke();
  };
  const line = (text, x, y, size = 27, color = INK) => { ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.font = `${size}px ${FONT}`; ctx.fillText(text, x, y); };
  const fit = (text, max) => { let t = text; while (ctx.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + '…'; return t; };

  // ボタン
  const BX = 430, BW = 420, BH = 80, BY0 = 150, GAP = 14;
  const button = (id, label, row, enabled = true, sub = '') => {
    const x = BX, y = BY0 + row * (BH + GAP);
    const hover = enabled && state.hoverId === id;
    if (hover) { ctx.fillStyle = 'rgba(60,120,200,0.20)'; ctx.fillRect(x, y, BW, BH); }
    ctx.strokeStyle = enabled ? (hover ? BLUE : INK) : '#a9acb2';
    ctx.lineWidth = hover ? 6 : 3;
    ctx.strokeRect(x, y, BW, BH);
    if (!hover) ctx.strokeRect(x + 2, y + 2, BW - 3, BH - 3);
    ctx.fillStyle = enabled ? (hover ? BLUE : INK) : '#a9acb2';
    ctx.textAlign = 'center'; ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(label, x + BW / 2, y + (sub ? 40 : 54));
    if (sub) { ctx.font = `24px ${FONT}`; ctx.fillStyle = enabled ? SUB : '#b4b7bc'; ctx.fillText(fit(sub, BW - 24), x + BW / 2, y + 68); }
    buttons.push({ id, label, x, y, w: BW, h: BH, enabled });
  };

  const mapName = mapLabel(state.selectedMap);
  const rightLines = (title, lines) => { panel(900, 150, 340, 470, title); lines.forEach((t, i) => line(t, 922, 232 + i * 38, 25)); };

  if (state.screen === 'maps') {
    // ---- マップ選択 ----
    const canChoose = !room || room.isHost;
    MAPS.forEach((m, i) => button('map:' + m.id, (state.selectedMap === m.id ? '✓ ' : '') + m.label, i, canChoose));
    button('back', '戻る', MAPS.length);
    panel(40, 150, 340, 470, '選んだマップ');
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.font = `bold 34px ${FONT}`; ctx.fillText(fit(mapName, 300), 210, 260);
    line(canChoose ? 'クリックで選択' : 'ホストだけが選べます', 62, 330, 24, SUB);
    const hovered = MAPS.find(m => state.hoverId === 'map:' + m.id) || MAPS.find(m => m.id === state.selectedMap);
    rightLines(hovered ? hovered.label : 'マップ', hovered ? hovered.lines : []);
  } else if (room) {
    // ---- 部屋の中(参加者の一覧・開始・マップ・退出) ----
    panel(40, 150, 340, 470, `プレイヤー ${room.players.length}/4`);
    room.players.forEach((p, i) => line(`${p.host ? '★' : '・'} ${fit(p.name, 220)}${p.id === room.myId ? ' (自分)' : ''}`, 62, 252 + i * 46, 29));
    if (room.isHost) button('start', 'ゲーム開始', 0); else button('wait', 'ホストの開始待ち', 0, false);
    button('maps', 'マップ選択', 1, room.isHost, mapName);
    button('leave', '部屋を出る', 2);
    panel(900, 150, 340, 470, '部屋コード');
    ctx.fillStyle = BLUE; ctx.textAlign = 'center'; ctx.font = `bold 72px ${FONT}`; ctx.fillText(room.code, 1070, 270);
    line('友達にこのコードを', 930, 350, 25); line('教えて参加してもらおう', 930, 388, 25);
    line('マップ:', 930, 470, 25, SUB); line(fit(mapLabel(room.map), 280), 930, 508, 29);
  } else {
    // ---- メイン ----
    button('solo', 'プレイ(1人で)', 0, true, mapName);
    button('create', '部屋を作る', 1);
    button('join', '部屋に参加', 2);
    button('maps', 'マップ選択', 3, true, mapName);
    button('rename', '名前を変える', 4, true, state.name);
    panel(40, 150, 340, 470, 'ステータス');
    line('名前', 62, 252, 24, SUB); line(fit(state.name, 290), 62, 290, 32);
    line('マップ', 62, 360, 24, SUB); line(fit(mapName, 290), 62, 398, 32);
    line('接続', 62, 468, 24, SUB); line('ソロ(オフライン)', 62, 506, 28);
    rightLines('あそびかた', ['WASD: 移動', 'Shift: 走る', 'マウス: 見回す', 'クリック: ボードを選ぶ', 'Esc: カーソルを出す', '', '部屋は最大4人', 'コードは5文字']);
  }

  if (state.message) { ctx.fillStyle = RED; ctx.textAlign = 'center'; ctx.font = `bold 28px ${FONT}`; ctx.fillText(state.message, BOARD_W / 2, 650); }
  return buttons;
}

// 画面の座標(canvasのpx)にあるボタンを返す
export function hitButton(buttons, px, py) {
  return buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) || null;
}
