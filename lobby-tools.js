// ロビーで道具を試すときの、計算だけの部分(画面や3Dには触らない)。lobby.js が使う。
import * as THREE from 'three';

export const MAX_HELD = 3;                           // 持てる道具は3つまで(本編と同じ)
export const SPIRIT_WORD = 'テスト音声';   // テスト用ゴースト(ハヤト)がスピリットボックスに返す言葉
export const AMBIENT_TEMP = 18;                       // ロビーの気温(℃)

// EMFのレベル(0〜5)。テスト用ゴーストまでの距離(m)から決める。本編のemfLevelAtと同じ区切り(テスト用はEMF5を持つ)
export function emfLevelAt(distance) {
  return distance < 1 ? 5 : distance < 2 ? 4 : distance < 3.5 ? 3 : distance < 5 ? 2 : distance < 8 ? 1 : 0;
}

// 温度計の表示。テスト用ゴーストの近く(3m以内)ほど下がり、すぐ近くでは氷点下になる。tは表示が止まって見えないための揺らぎ用の時間(秒)
export function demoTemperature(distance, t) {
  const cold = Math.min(1, Math.max(0, (3 - distance) / 2.2)); // 3mで0、0.8m以内で1
  return AMBIENT_TEMP - (AMBIENT_TEMP + 1) * cold + Math.sin(t * 0.6) * 0.4;
}

// 壁掛けの道具のうち、画面の中央(視線)の先にあるものを返す。items=[{ center, taken }]。maxDist(m)以内かつ、視線から maxAngle(ラジアン)以内で最も近いもの
const _to = new THREE.Vector3();
export function pickGazeItem(items, camPos, camDir, maxDist = 1.8, maxAngle = 0.22) {
  let best = null, bestAngle = maxAngle;
  for (const item of items) {
    if (item.taken) continue;
    _to.copy(item.center).sub(camPos);
    if (_to.length() > maxDist) continue;
    const angle = camDir.angleTo(_to.normalize());
    if (angle < bestAngle) { bestAngle = angle; best = item; }
  }
  return best;
}
