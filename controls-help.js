// 操作説明の画面。ロビーでもゲーム本編でも、H キーでいつでも開け閉めできる(ゲーム中に開いても、ゲームは止まらない)。
// 内容(どのキーで何ができるか)は、下の HELP の表だけを直せばよい。見た目は help.css(クラス名は gh-help-)。
// codes: 実際のキー(KeyboardEvent.code)。ここに書いたキーが、本当にコードにあるかを npm test が確かめる(説明とコードのずれの検出)。
// 道具・ボタンの割り当てを変えたら、ここも直すこと。

export const HELP = {
  lobby: [
    { title: '移動・視点', rows: [
      { keys: ['W', 'A', 'S', 'D'], text: '移動(矢印キーでも動けます)', codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD'] },
      { keys: ['Shift'], text: '走る', codes: ['ShiftLeft'] },
      { keys: ['マウス'], text: '見回す' },
      { keys: ['Esc'], text: '一時停止(クリックか WASD で再開)' },
    ] },
    { title: 'ボードと道具', rows: [
      { keys: ['クリック'], text: 'ホワイトボードのボタンを押す・壁の道具を取る' },
      { keys: ['1', '2', '3'], text: '持っている道具を持ち替える', codes: ['Digit1', 'Digit2', 'Digit3'] },
      { keys: ['E'], text: '道具を使う(オン・オフ)', codes: ['KeyE'] },
      { keys: ['Q'], text: '道具をボードに戻す', codes: ['KeyQ'] },
      { keys: ['H'], text: 'この説明を開く・閉じる', codes: ['KeyH'] },
    ] },
    { title: 'コントローラー', pad: true, rows: [
      { keys: ['左スティック'], text: '移動' },
      { keys: ['右スティック'], text: '見回す' },
      { keys: ['ZL'], text: '走る' },
      { keys: ['Y'], text: '選ぶ・取る' },
      { keys: ['X', 'ZR'], text: '道具を使う' },
      { keys: ['L', 'R'], text: '道具を持ち替える' },
      { keys: ['十字キー下'], text: '道具を戻す' },
      { keys: ['＋'], text: '一時停止' },
    ] },
  ],
  game: [
    { title: '移動・視点', rows: [
      { keys: ['W', 'A', 'S', 'D'], text: '移動', codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD'] },
      { keys: ['マウス'], text: '見回す' },
      { keys: ['Esc'], text: '一時停止(クリックで再開)' },
    ] },
    { title: '調べる・道具', rows: [
      { keys: ['クリック'], text: '拾う・ドアを開け閉めする・照明スイッチ・ブレーカー' },
      { keys: ['1', '2', '3'], text: '持っている道具を持ち替える', codes: ['Digit1', 'Digit2', 'Digit3'] },
      { keys: ['E'], text: '道具を使う(オン・オフ)', codes: ['KeyE'] },
      { keys: ['Q'], text: '道具を置く', codes: ['KeyQ'] },
      { keys: ['R'], text: '調査書を開く・閉じる(幽霊の特定はここで)', codes: ['KeyR'] },
      { keys: ['P'], text: 'ロビーに戻る(確認が出ます)', codes: ['KeyP'] },
      { keys: ['H'], text: 'この説明を開く・閉じる', codes: ['KeyH'] },
    ] },
    { title: 'コントローラー', pad: true, rows: [
      { keys: ['左スティック'], text: '移動' },
      { keys: ['右スティック'], text: '見回す' },
      { keys: ['B', 'Y'], text: 'ものを拾う・ドア・スイッチ・ブレーカー' },
      { keys: ['X', 'ZR'], text: '道具を使う' },
      { keys: ['L', 'R'], text: '道具を持ち替える' },
      { keys: ['十字キー下'], text: '道具を置く' },
      { keys: ['＋'], text: '調査書を開く・閉じる' },
      { keys: ['調査書の中'], text: '十字キー=カーソル / B・Y=チェック / X=特定 / A=閉じる' },
    ] },
  ],
};

// mode: 'lobby' | 'game'。画面に説明を作って、H キーで開け閉めできるようにする。
// 返す値: { open(), close(), toggle(), isOpen(), showTip() }  showTip: 「H: 操作説明」の小さな案内を数秒だけ出す(ゲーム本編が始まったときに呼ぶ)
export function createControlsHelp(mode) {
  const sections = HELP[mode] || HELP.game;
  const root = document.createElement('div');
  root.className = 'gh-help';
  const panel = document.createElement('div');
  panel.className = 'gh-help-panel';
  const head = document.createElement('div');
  head.className = 'gh-help-head';
  const title = document.createElement('div');
  title.className = 'gh-help-title';
  title.textContent = '操作説明';
  const close = document.createElement('button');
  close.className = 'gh-help-close';
  close.type = 'button';
  close.textContent = '閉じる (H)';
  head.append(title, close);
  panel.appendChild(head);
  const cols = document.createElement('div');
  cols.className = 'gh-help-cols';
  sections.forEach((sec) => {
    const box = document.createElement('div');
    box.className = 'gh-help-section' + (sec.pad ? ' gh-help-section--pad' : '');
    const h = document.createElement('div');
    h.className = 'gh-help-section-title';
    h.textContent = (sec.pad ? '🎮 ' : '') + sec.title;
    box.appendChild(h);
    sec.rows.forEach((row) => {
      const line = document.createElement('div');
      line.className = 'gh-help-row';
      const keys = document.createElement('span');
      keys.className = 'gh-help-keys';
      row.keys.forEach((k) => { const kc = document.createElement('kbd'); kc.className = 'gh-help-key'; kc.textContent = k; keys.appendChild(kc); });
      const text = document.createElement('span');
      text.className = 'gh-help-text';
      text.textContent = row.text;
      line.append(keys, text);
      box.appendChild(line);
    });
    cols.appendChild(box);
  });
  panel.appendChild(cols);
  if (mode === 'game') {
    const note = document.createElement('div');
    note.className = 'gh-help-note';
    note.textContent = '※ 開いている間も、ゲームは止まりません(一人で遊んでいても止まりません)';
    panel.appendChild(note);
  }
  root.appendChild(panel);
  document.body.appendChild(root);

  let opened = false;
  const set = (v) => { opened = v; root.classList.toggle('is-open', v); };
  close.addEventListener('click', () => set(false));
  root.addEventListener('click', (e) => { if (e.target === root) set(false); }); // 外側のクリックでも閉じる
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // 名前などを入力している間は反応しない
    set(!opened);
  });

  let tipTimer = null;
  function showTip() {
    const tip = document.createElement('div');
    tip.className = 'gh-help-tip';
    tip.textContent = 'H: 操作説明';
    document.body.appendChild(tip);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.classList.add('is-fading'); setTimeout(() => tip.remove(), 800); }, 6000);
  }
  return { open: () => set(true), close: () => set(false), toggle: () => set(!opened), isOpen: () => opened, showTip };
}
