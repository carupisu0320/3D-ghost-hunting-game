// 計算だけの小さな関数(報酬・時間の表示・EMFのレベル・スティックの遊び・部屋の中のランダムな点)。画面や3Dには触らない。
// engine.js から分けたファイル。
import * as THREE from 'three';

function randomPointInRoom(r, margin = 0.6, rand = Math.random) {
  return new THREE.Vector3(
    r.minX + margin + rand() * Math.max(0.1, r.maxX - r.minX - margin * 2),
    1.0,
    r.minZ + margin + rand() * Math.max(0.1, r.maxZ - r.minZ - margin * 2)
  );
}

// 正解かどうかと、特定にかかった時間から報酬額を計算する。
// 正解なら基本報酬(1000円)+速く特定できたほど増えるボーナス(10分以内なら最大+1200円、それ以降はボーナス無し)。
// 不正解でも、調査した分の参加料としてわずかに支払う
function calculateReward(correct, elapsedSeconds) {
  if (!correct) return 100;
  const speedBonus = Math.max(0, Math.round((600 - Math.min(elapsedSeconds, 600)) * 2));
  return 1000 + speedBonus;
}

// 報酬の内訳(結果の画面に出す)。合計は calculateReward と同じになる(テストで確かめている)
function rewardBreakdown(correct, elapsedSeconds) {
  if (!correct) return [{ label: '調査の参加料', amount: 100 }];
  const speedBonus = Math.max(0, Math.round((600 - Math.min(elapsedSeconds, 600)) * 2));
  return [{ label: '基本報酬(正解)', amount: 1000 }, { label: 'スピードボーナス', amount: speedBonus }];
}

function formatTime(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function deadzone(v, dz = 0.15) {
  return Math.abs(v) < dz ? 0 : v;
}

function emfLevelAt(distance, hasEMF5) {
  let level = distance < 1 ? 5 : distance < 2 ? 4 : distance < 3.5 ? 3 : distance < 5 ? 2 : distance < 8 ? 1 : 0;
  if (level === 5 && !hasEMF5) level = 4;
  return level;
}

export { randomPointInRoom, calculateReward, rewardBreakdown, formatTime, deadzone, emfLevelAt };
