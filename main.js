// このファイルはマップを増やしても書き換えなくて済むよう、薄いブートストラップだけにしてある。
// 実際のゲームの仕組みは engine.js、この家の中身は house-map.js に分かれている
import { addMapCard, startEngine, enterGame } from './engine.js';
import { mapId, mapLabel } from './house-map.js'; // importした時点でマップの中身がまるごと構築される

// マップ選択画面に登録する。今後マップが増えたら、同じ形でここに1行足すだけでよい
addMapCard(mapLabel, true, enterGame);
addMapCard('近日追加予定', false, null);
addMapCard('近日追加予定', false, null);

startEngine();
