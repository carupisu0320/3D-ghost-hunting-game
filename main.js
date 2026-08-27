// このファイルはマップを増やしても書き換えなくて済むよう、薄いブートストラップだけにしてある。
// 実際のゲームの仕組みは engine.js、各マップの中身はそれぞれの map ファイルに分かれている。
// マップの実体(build())は、選ばれるまでは呼ばない(2つ以上のマップを同時に組み立ててしまわないようにするため)
import { addMapCard, startEngine, enterGame } from './engine.js';
import { build as buildHouse, mapLabel as houseLabel } from './house-map.js';
import { build as buildGrafton, mapLabel as graftonLabel } from './grafton-map.js';

addMapCard(houseLabel, true, () => { buildHouse(); enterGame(); });
addMapCard(graftonLabel, true, () => { buildGrafton(); enterGame(); });
addMapCard('近日追加予定', false, null);

startEngine();
