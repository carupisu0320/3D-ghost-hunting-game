// 三人称視点のカメラの位置を決める小さな計算(three.js は使わない。ロビー(lobby.js)とゲーム本編(engine.js)で共通)。
// 目の位置 eye から、見ている向き dir の反対側へ下がる。壁にぶつかるところで止まる(壁にめり込まない)。
//   eye / dir: { x, y, z }(dir は、見ている向きの単位ベクトル)
//   blocked(x, z): その場所が壁なら true
//   戻り値: { x, y, z, distance }(distance: 実際に下がった距離。0 なら一人称と同じ位置)
export const TP_DISTANCE = 2.6; // 下がる距離(m)
export const TP_STEP = 0.2;     // 壁を調べる間隔(m)

export function thirdPersonPosition(eye, dir, blocked, { distance = TP_DISTANCE, step = TP_STEP, minY = null } = {}) {
  let back = 0;
  while (back + step <= distance + 1e-9) {
    const next = back + step;
    if (blocked(eye.x - dir.x * next, eye.z - dir.z * next)) break;
    back = next;
  }
  let y = eye.y - dir.y * back;
  if (minY !== null && y < minY) y = minY; // 床より下に入らない
  return { x: eye.x - dir.x * back, y, z: eye.z - dir.z * back, distance: back };
}
