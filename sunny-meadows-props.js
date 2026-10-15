// 家具を3Dにする(sunny-meadows-furniture-plan.js の配置計画を、画面に出す)。
// 描画を軽くするため、家具は1つずつ別のメッシュにせず、「階 × 場所(16m四方) × 材質」ごとに1つのメッシュにまとめる
// (カメラの外にある場所は、まとめて描画されない)。色は、頂点の色で付けるので、色が違っても同じメッシュにまとめられる。
// 当たり判定は、これまでの家具と同じ pushWallBox で登録する(プレイヤーだけが使う。幽霊は壁も家具も通り抜ける)。
import {
  THREE, mergeGeometries, scene, scaled, makeWoodTexture, setBuildingUpperFloor, pushWallBox,
} from './engine.js';
import { planProps, footprintOf, itemBoxes } from './sunny-meadows-furniture-plan.js';

const CHUNK = 16; // まとめる場所の大きさ(m)
// 新しい家具が影を落とすか。落とすと、懐中電灯の影の描画(1フレームに6方向)で、近くの家具もすべて描き直すので重くなる。
// 軽さを優先して、落とさない(影を「受ける」ことは、これまで通り)。もとからある家具は、これまで通り影を落とす
const PROPS_CAST_SHADOW = false;
const WOOD_LIGHTEN = 0.45; // 木目の模様に色を掛けるので、色を白に近づけて、暗くなりすぎないようにする

// 頂点の色を付ける(色は、材質の色と同じく、見た目の色(sRGB)で渡す)
function paint(geometry, hex, lighten = 0) {
  const c = new THREE.Color(hex);
  if (lighten) c.lerp(new THREE.Color(0xffffff), lighten);
  const n = geometry.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geometry;
}

// 計画の家具を、まとめて3Dにして scene に足し、当たり判定を登録する。floorY(階) = その階の床の高さ。戻り値 = { meshes, boxes, items }
export function buildProps(floorY, layoutPlan = planProps()) {
  const colorMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: scaled(makeWoodTexture('#9a8468'), 1, 1) });
  const groups = new Map(); // キー(階|場所|材質|影) -> 形の一覧
  let boxes = 0;

  layoutPlan.forEach((it) => {
    const y0 = floorY(it.floor) + (it.floor === 0 ? 0.03 : 0.01); // 床の板の厚み(床板が少し浮いている)の分だけ上げる
    const cx = Math.floor(it.x / CHUNK), cz = Math.floor(it.z / CHUNK);
    itemBoxes(it).forEach((p) => {
      const wood = p.kind === 'w';
      const g = p.kind === 'c' ? new THREE.CylinderGeometry(p.w / 2, p.w / 2, p.h, 10) : new THREE.BoxGeometry(p.w, p.h, p.d);
      g.translate(p.x, y0 + p.y, p.z);
      paint(g, p.color, wood ? WOOD_LIGHTEN : 0);
      const key = `${it.floor}|${cx}|${cz}|${wood ? 'w' : 'c'}`;
      if (!groups.has(key)) groups.set(key, { wood, shadow: it.solid && PROPS_CAST_SHADOW, list: [] });
      groups.get(key).list.push(g);
      boxes++;
    });
    if (it.solid) { setBuildingUpperFloor(it.floor); pushWallBox(footprintOf(it)); }
  });
  setBuildingUpperFloor(0);

  const meshes = [];
  groups.forEach((grp) => {
    const merged = mergeGeometries(grp.list);
    grp.list.forEach((g) => g.dispose());
    if (!merged) { console.warn('家具のまとめに失敗した場所があります'); return; }
    const mesh = new THREE.Mesh(merged, grp.wood ? woodMat : colorMat);
    mesh.castShadow = grp.shadow; mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  });
  return { meshes: meshes.length, boxes, items: layoutPlan.length };
}

// すでにある家具(bedIn・toiletIn など、1つずつメッシュを作る関数)で、scene に足されたものを、見た目はそのまま、まとめて描画にする。
// startIndex = それらを作る前の scene.children.length。同じ材質・同じ影の設定のものを、場所ごとに1つのメッシュにする。
// 注意: 作っている最中に await などで処理を止めないこと(別の処理が scene に足したものを、まちがって巻き込まないため)。
export function batchSceneMeshes(startIndex) {
  const added = scene.children.slice(startIndex);
  const groups = new Map();
  let before = 0;
  added.forEach((obj) => {
    if (!obj.isMesh || Array.isArray(obj.material) || !obj.geometry.attributes.uv || !obj.geometry.index) return;
    before++;
    obj.updateMatrixWorld(true);
    const g = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const key = `${obj.material.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}|${Math.floor(c.x / CHUNK)}|${Math.floor(c.z / CHUNK)}|${Math.round(c.y / 3)}`;
    if (!groups.has(key)) groups.set(key, { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, list: [] });
    groups.get(key).list.push(g);
    scene.remove(obj);
    obj.geometry.dispose();
  });
  let after = 0;
  groups.forEach((grp) => {
    const merged = mergeGeometries(grp.list);
    grp.list.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, grp.material);
    mesh.castShadow = grp.cast; mesh.receiveShadow = grp.receive;
    scene.add(mesh);
    after++;
  });
  return { before, after };
}

// 壁やドア枠のように、全体を1つにまとめていた形を、場所(16m四方)と階ごとに分けて、メッシュにする。見た目は同じ。
// 1つの巨大なメッシュだと、カメラの外にある部分も毎回すべて描かれる(懐中電灯の影の6方向の描画も含む)が、
// 分けると、カメラや影の範囲の外にある場所は、描画されなくなる。
export function addMergedByChunk(geometries, material, { cast = true, receive = true } = {}) {
  const groups = new Map();
  geometries.forEach((g) => {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const key = `${Math.floor(c.y / 3)}|${Math.floor(c.x / CHUNK)}|${Math.floor(c.z / CHUNK)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  });
  groups.forEach((list) => {
    const merged = mergeGeometries(list);
    if (!merged) { console.warn('まとめに失敗した場所があります'); return; }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    scene.add(mesh);
  });
  return groups.size;
}
