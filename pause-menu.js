// 一時停止の画面(Esc でマウスの視点固定が外れたときに出る)。
// 「再開」「視点の感度」「ロビーに戻る」だけの、小さな画面。見た目は ui.css の gh-pause-*。
// engine.js から createPauseMenu({ controls, shouldShow, onLobby }) で作る。shouldShow() が true のときだけ出す
// (調査書を開いたとき・結果が出たとき・読み込み中などは出さない)。

const SENS_KEY = 'ghost_sensitivity';
const SENS_MIN = 0.3, SENS_MAX = 2, SENS_STEP = 0.1;

function loadSensitivity() {
  try {
    const v = parseFloat(localStorage.getItem(SENS_KEY));
    if (Number.isFinite(v)) return Math.min(SENS_MAX, Math.max(SENS_MIN, v));
  } catch (e) { /* 読めなくても、既定の感度で遊べる */ }
  return 1;
}

function createPauseMenu({ controls, shouldShow, onLobby }) {
  controls.pointerSpeed = loadSensitivity();

  const overlay = document.createElement('div');
  overlay.className = 'gh-pause';
  const panel = document.createElement('div');
  panel.className = 'gh-pause-panel';
  const title = document.createElement('div');
  title.className = 'gh-pause-title';
  title.textContent = '一時停止';
  const resume = document.createElement('button');
  resume.className = 'gh-pause-btn gh-pause-btn--main';
  resume.textContent = '再開';
  const sensRow = document.createElement('label');
  sensRow.className = 'gh-pause-row';
  const sensName = document.createElement('span');
  sensName.textContent = '視点の感度';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(SENS_MIN); slider.max = String(SENS_MAX); slider.step = String(SENS_STEP);
  slider.value = String(controls.pointerSpeed);
  const sensValue = document.createElement('span');
  sensValue.className = 'gh-pause-value';
  const showValue = () => { sensValue.textContent = `x${Number(slider.value).toFixed(1)}`; };
  showValue();
  sensRow.append(sensName, slider, sensValue);
  const lobby = document.createElement('button');
  lobby.className = 'gh-pause-btn';
  lobby.textContent = 'ロビーに戻る';
  const note = document.createElement('div');
  note.className = 'gh-pause-note';
  note.textContent = 'H: 操作説明';
  panel.append(title, resume, sensRow, lobby, note);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const hide = () => overlay.classList.remove('is-open');
  const show = () => overlay.classList.add('is-open');

  slider.addEventListener('input', () => {
    controls.pointerSpeed = Number(slider.value);
    showValue();
    try { localStorage.setItem(SENS_KEY, slider.value); } catch (e) { /* 保存できなくても、今回は反映される */ }
  });
  resume.addEventListener('click', () => { hide(); try { controls.lock(); } catch (e) { /* 失敗したら、画面のクリックで再開 */ } });
  lobby.addEventListener('click', () => onLobby());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) resume.click(); }); // 外側をクリックしても再開
  controls.addEventListener('unlock', () => { if (shouldShow()) show(); });
  controls.addEventListener('lock', hide);
  return { hide, show, isOpen: () => overlay.classList.contains('is-open') };
}

export { createPauseMenu, SENS_KEY, SENS_MIN, SENS_MAX };
