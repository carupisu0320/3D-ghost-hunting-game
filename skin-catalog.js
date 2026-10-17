// プレイヤーのスキン(見た目)の一覧。ここには「名前と説明」だけを書く(three.js は読み込まない軽いファイル)。
// ロビーのボードの選択画面と、サーバーへの送信に使う。見た目の作り方(3Dモデル)は skins.js に書く。
//
// 新しいスキンを足すには:
//   1. この一覧に { id, label, lines } を1行足す
//   2. skins.js の IMPLS に、同じ id で、モデルの読み込み(load)と作り方(create)を足す
//   id は、半角の小文字・数字・_ だけ(先頭は小文字、24文字まで)。サーバーもこの形だけを受け付ける。決めたら変えない(保存された選択が無効になる)
//   一覧に入れられるのは6個まで(ボードの選択画面に入る数)
export const DEFAULT_SKIN_ID = 'robot';
export const SKIN_ID_PATTERN = /^[a-z][a-z0-9_]{0,23}$/;
export const MAX_SKINS = 6;

export const SKIN_CATALOG = [
  { id: 'robot', label: 'ロボット', lines: ['黒いロボット(初期設定)', '歩くと手足を振ります'] },
  { id: 'capsule', label: 'カプセル', lines: ['色つきのカプセル', 'モデルを読み込めないときの、', '簡易の見た目と同じです'] },
  { id: 'mcqueen', label: 'マックイーン', lines: ['メジロマックイーン', '歩く・走るで動きが変わります'] },
  { id: 'josuke', label: '仗助', lines: ['東方仗助', '歩くと手足を振ります'] },
];

export function isSkinId(id) { return typeof id === 'string' && SKIN_CATALOG.some((s) => s.id === id); }
// 知らない id(古い保存・新しいスキンを知らない相手・空)は、既定のスキンにする
export function normalizeSkinId(id) { return isSkinId(id) ? id : DEFAULT_SKIN_ID; }
export function skinLabel(id) { const s = SKIN_CATALOG.find((x) => x.id === id); return s ? s.label : SKIN_CATALOG[0].label; }
