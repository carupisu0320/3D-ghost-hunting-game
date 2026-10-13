// 幽霊の一覧(ghostTypes)と、難易度の設定(DIFFICULTIES)。値だけのファイルで、ほかのファイルを import しない。
// 幽霊を足す・難易度を調整するときは、ここを書き換える。engine.js から分けたファイル。

// 幽霊(証拠システムの土台込み)。証拠は7種類、幽霊ごとに異なる3種の組み合わせを持つ
// 幽霊の種類の一覧(証拠は7種類、幽霊ごとに異なる3種の組み合わせを持つ)。マップに依存しない共通のロースター
const ghostTypes = [
  // 通常の幽霊(28種類)。名前はジャーナルに表示される日本語名、enは英語名。証拠はどれも3つで、組み合わせは1体ずつ異なる(証拠がそろえば1体に絞れる)
  { name: "レイス", en: "Wraith", evidence: ["EMF5", "スピリットボックス", "D.O.T.S"] },
  { name: "ファントム", en: "Phantom", evidence: ["スピリットボックス", "指紋", "D.O.T.S"] },
  { name: "ポルターガイスト", en: "Poltergeist", evidence: ["スピリットボックス", "指紋", "ゴーストライティング"] },
  { name: "バンシー", en: "Banshee", evidence: ["指紋", "オーブ", "D.O.T.S"] },
  { name: "ジン", en: "Jinn", evidence: ["EMF5", "指紋", "冷えた温度"] },
  { name: "メアー", en: "Mare", evidence: ["スピリットボックス", "オーブ", "ゴーストライティング"] },
  { name: "レヴナント", en: "Revenant", evidence: ["オーブ", "ゴーストライティング", "冷えた温度"] },
  { name: "シェード", en: "Shade", evidence: ["EMF5", "ゴーストライティング", "冷えた温度"] },
  { name: "デーモン", en: "Demon", evidence: ["指紋", "ゴーストライティング", "冷えた温度"] },
  { name: "幽霊", en: "Yurei", evidence: ["オーブ", "冷えた温度", "D.O.T.S"] },
  { name: "鬼", en: "Oni", evidence: ["EMF5", "冷えた温度", "D.O.T.S"] },
  { name: "妖怪", en: "Yokai", evidence: ["スピリットボックス", "オーブ", "D.O.T.S"] },
  { name: "ハントゥ", en: "Hantu", evidence: ["指紋", "オーブ", "冷えた温度"] },
  { name: "御霊", en: "Goryo", evidence: ["EMF5", "指紋", "D.O.T.S"] },
  { name: "マイリング", en: "Myling", evidence: ["EMF5", "指紋", "ゴーストライティング"] },
  { name: "怨霊", en: "Onryo", evidence: ["スピリットボックス", "オーブ", "冷えた温度"] },
  { name: "ツインズ", en: "The Twins", evidence: ["EMF5", "スピリットボックス", "冷えた温度"] },
  { name: "雷獣", en: "Raiju", evidence: ["EMF5", "オーブ", "D.O.T.S"] },
  { name: "化け狐", en: "Obake", evidence: ["EMF5", "指紋", "オーブ"] },
  { name: "ミミック", en: "The Mimic", evidence: ["スピリットボックス", "指紋", "冷えた温度"] },
  { name: "モーロイ", en: "Moroi", evidence: ["スピリットボックス", "ゴーストライティング", "冷えた温度"] },
  { name: "デオヘン", en: "Deogen", evidence: ["スピリットボックス", "ゴーストライティング", "D.O.T.S"] },
  { name: "セーイ", en: "Thaye", evidence: ["オーブ", "ゴーストライティング", "D.O.T.S"] },
  { name: "ダヤン", en: "Dayan", evidence: ["EMF5", "オーブ", "スピリットボックス"] },
  { name: "ガルル", en: "Gallu", evidence: ["EMF5", "指紋", "スピリットボックス"] },
  { name: "オバンボ", en: "Obambo", evidence: ["ゴーストライティング", "指紋", "D.O.T.S"] },
  { name: "アスワング", en: "Aswang", evidence: ["冷えた温度", "ゴーストライティング", "D.O.T.S"] },
  { name: "コルモス", en: "Kormos", evidence: ["オーブ", "スピリットボックス", "指紋"] },
  // 特別な幽霊。証拠はスピリットボックスだけで、スピリットボックスには必ず同じ言葉で応える。
  // 見た目は常に人型モデル(ghost-model.fbx)で、襲ってこない(ハントも死亡もゲームオーバーも起きない)
  { name: "ハヤト", evidence: ["スピリットボックス"], spiritBoxWord: "いらっしゃいませ////", alwaysModel: true, noHunt: true },
];

// ==== 難易度 ====
// ロビーのボードで選ぶ(オンラインのときは、ホストが選んだものが全員に適用される)。main.js が、マップを組み立てる前に setDifficulty() で渡す。
//   普通 = これまでのゲーム(+ ブレーカーが、ポルターガイストのように落とされることがある)
//   canRaiseBreaker : false だと、ブレーカーを上げられない(ずっと停電)
//   breakerTrips    : 幽霊が、上がっているブレーカーを落とすことがあるか。tripMin〜tripMax 秒ごとに(ブレーカーを上げるたびに、時間は数え直す)
//   hayato          : false だと、ハヤト(襲ってこないテスト用の幽霊)が出ない(抽選・調査書の一覧・隠しコマンドのすべてから外れる)
const DIFFICULTIES = {
  easy:      { label: '易しい',     canRaiseBreaker: true,  breakerTrips: false, tripMin: 0,  tripMax: 0,   hayato: true },
  normal:    { label: '普通',       canRaiseBreaker: true,  breakerTrips: true,  tripMin: 150, tripMax: 300, hayato: true },
  hard:      { label: '難しい',     canRaiseBreaker: true,  breakerTrips: true,  tripMin: 60,  tripMax: 150, hayato: true },
  nightmare: { label: 'ナイトメア', canRaiseBreaker: false, breakerTrips: false, tripMin: 0,  tripMax: 0,   hayato: false },
};

export { ghostTypes, DIFFICULTIES };
