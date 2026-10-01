// Grafton Farmhouse マップ。間取り(部屋・壁・ドア・階段)は実際のGrafton Farmhouseの間取り図に合わせてあり、
// 「玄関・屋根裏が常に暗い」「壁に穴が開いている部屋は暖房が効かない」といった特殊ルールはまだ実装していない
import {
  THREE, mergeGeometries, scene, camera, rooms, room,
  wallBoxes, doorFrameGeometries, wallGeometries, wallHeight, wallMaterial, doorFrameMaterial,
  addWall, makeWoodTexture, scaled, addFramedPlane, pushWallBox,
  addSurveillanceCamera, videoCams, addToolPegboard,
  addRoomLight, addLightSwitch, updateRoomLightCulling, breakerOn, registerBreaker, setBreakerOn,
  addPickupItem, makeFlashlightItemMesh, makeEMFItemMesh, makeThermoItemMesh, makeNotebookItemMesh,
  makeSpiritBoxItemMesh, makeUVItemMesh, makeDotsItemMesh, toolRestOffset, collectTool, setNotebookWorldMesh,
  sanity, drawSanityScreen, sanityTexture,
  initHaunting, setExteriorDoor, setOrbRoom, doors,
  onFrame, setCurrentUpperFloor, currentUpperFloor, defineUpperFloor, setBuildingUpperFloor,
  bedIn, sofaAt, wardrobeIn, counterAt, fridgeAt, washstandIn, toiletIn, furnitureIn, addFurniture,
  addDetailMesh, addLeg, addLegsUnder, fabricMaterial, handleMaterial, ceramicMaterial,
} from './engine.js';

export const mapId = 'grafton';
export const mapLabel = 'Grafton Farmhouse';

// ソファ(東側の壁を背にして、部屋の中央側=西向きに座る配置)。engineのsofaAtを90度回転させたもの
// w=左右の幅(Z方向)、d=前後の奥行き(X方向)。背もたれは+X側(壁側)に来る
function sofaAtFacingWest(x, z, w, d) {
  const legH = 0.1, seatH = 0.32, cushionH = 0.14, backH = 0.4, backT = 0.16, armW = 0.14;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    addLeg(x + sx * (d / 2 - 0.06), 0, z + sz * (w / 2 - 0.06), 0.02, legH, handleMaterial);
  });
  addFurniture(x, z, d, w, seatH, fabricMaterial, legH);
  const cushionW = (w - armW * 2 - 0.04) / 2;
  [-1, 1].forEach(sz => {
    addDetailMesh(x - backT / 2, legH + seatH + cushionH / 2, z + sz * (cushionW / 2 + 0.02), d - backT - 0.06, cushionH, cushionW, fabricMaterial);
  });
  const armH = 0.32;
  [-1, 1].forEach(sz => {
    addDetailMesh(x, legH + armH / 2, z + sz * (w / 2 - armW / 2), d, armH, armW, fabricMaterial);
  });
  [-1, 1].forEach(sz => {
    addDetailMesh(x + d / 2 - backT / 2, legH + seatH + backH / 2, z + sz * (cushionW / 2 + 0.02), backT, backH, cushionW, fabricMaterial);
  });
}

// ソファ(西側の壁を背にして、部屋の中央側=東向きに座る配置)。sofaAtFacingWestを左右反転させたもの
function sofaAtFacingEast(x, z, w, d) {
  const legH = 0.1, seatH = 0.32, cushionH = 0.14, backH = 0.4, backT = 0.16, armW = 0.14;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    addLeg(x + sx * (d / 2 - 0.06), 0, z + sz * (w / 2 - 0.06), 0.02, legH, handleMaterial);
  });
  addFurniture(x, z, d, w, seatH, fabricMaterial, legH);
  const cushionW = (w - armW * 2 - 0.04) / 2;
  [-1, 1].forEach(sz => {
    addDetailMesh(x + backT / 2, legH + seatH + cushionH / 2, z + sz * (cushionW / 2 + 0.02), d - backT - 0.06, cushionH, cushionW, fabricMaterial);
  });
  const armH = 0.32;
  [-1, 1].forEach(sz => {
    addDetailMesh(x, legH + armH / 2, z + sz * (w / 2 - armW / 2), d, armH, armW, fabricMaterial);
  });
  [-1, 1].forEach(sz => {
    addDetailMesh(x - d / 2 + backT / 2, legH + seatH + backH / 2, z + sz * (cushionW / 2 + 0.02), backT, backH, cushionW, fabricMaterial);
  });
}

// ---- 外装(ツタまみれ+汚れ) ----
// 外壁の外側に、壁から少し浮かせた透明な板を貼って表現する(壁そのものや内装、当たり判定は一切変えない)。
// 1階・2階・屋根裏の外周4面それぞれに「汚れの板」と「ツタの板(奥行きが出るよう2枚重ね)」を貼る。

// 乱数(毎回同じ見た目になるようシード固定。マップを選び直しても外装が変わらない)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ツタ1枚分の絵を描く。横は端でつながる(左右をまたぐものは反対側にも描く)ので、どこで切っても継ぎ目が出ない。
// variant 0=1階用(地面から密に生い茂る)、1=2階用、2=屋根裏用(まばら+上から垂れ下がる)
function drawIvyCanvas(canvas, variant, seed) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const rnd = makeRng(seed);
  ctx.clearRect(0, 0, W, H);
  const density = [(v) => 0.98 - v * 0.3, (v) => 0.78 - v * 0.28, (v) => 0.55 - v * 0.25][variant];
  const leafCount = [2800, 2000, 1300][variant];
  const vineCount = [46, 34, 22][variant];
  const greens = ['#2f5a2a', '#3f7a34', '#264a22', '#4c8a3c', '#1f3d1c', '#5a9a44', '#35682e'];
  const dead = ['#5a4a2a', '#6b5a33', '#4a3d22'];

  function wrapDraw(x, fn) { // 左右の端をまたぐ場合は反対側にも描く
    fn(x);
    if (x < 60) fn(x + W);
    if (x > W - 60) fn(x - W);
  }
  function leaf(x, y, size, angle) {
    const isDead = rnd() < 0.12;
    const col = isDead ? dead[Math.floor(rnd() * dead.length)] : greens[Math.floor(rnd() * greens.length)];
    wrapDraw(x, (px) => {
      ctx.save();
      ctx.translate(px, y);
      ctx.rotate(angle);
      ctx.beginPath(); // ハート形の葉(先端が下)
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.95, -size * 0.95, size * 0.95, size * 0.3, 0, size * 0.85);
      ctx.bezierCurveTo(-size * 0.95, size * 0.3, -size * 0.95, -size * 0.95, 0, -size);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,20,8,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath(); // 葉脈
      ctx.moveTo(0, -size * 0.7);
      ctx.lineTo(0, size * 0.6);
      ctx.strokeStyle = isDead ? 'rgba(200,180,120,0.25)' : 'rgba(200,235,150,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });
  }
  function stem(points, width) {
    [-W, 0, W].forEach((dx) => {
      ctx.beginPath();
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + dx, p.y) : ctx.lineTo(p.x + dx, p.y)));
      ctx.strokeStyle = '#2b2415';
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }
  // つるを生やして、その途中に葉をつける(葉は最後にまとめて描くと、つるが葉の下になって自然)
  function growVine(x, y, angle, length, width) {
    const pts = [{ x, y }];
    const leaves = [];
    let cx = x, cy = y, a = angle;
    for (let d = 0; d < length; d += 9) {
      a += (rnd() - 0.5) * 0.7;
      cx += Math.cos(a) * 9;
      cy += Math.sin(a) * 9;
      pts.push({ x: cx, y: cy }); // 折り返さず生の座標のまま持つ(描くときに左右へずらして描くので、横線が走らない)
      if (cy < 0 || cy > H) break;
      if (rnd() < 0.9) leaves.push([cx, cy, 11 + rnd() * 12, a + Math.PI / 2 + (rnd() - 0.5) * 2.2]);
      if (rnd() < 0.05 && width > 2) { // 枝分かれ
        const sub = growVine(cx, cy, a + (rnd() - 0.5) * 1.6, length * 0.35, width * 0.6);
        leaves.push(...sub);
      }
    }
    stem(pts, width);
    return leaves;
  }

  const allLeaves = [];
  // 下から這い上がるつる(1階は地面から。2階・屋根裏は途中から)
  for (let i = 0; i < vineCount; i++) {
    const startY = variant === 0 ? H + 5 : H * (0.4 + rnd() * 0.7);
    const len = H * (0.4 + rnd() * (variant === 0 ? 0.9 : 0.6));
    allLeaves.push(...growVine(rnd() * W, startY, -Math.PI / 2 + (rnd() - 0.5) * 0.6, len, 2.5 + rnd() * 2.5));
  }
  // 上の縁から垂れ下がるつる(屋根裏ほど多い)
  const hang = [10, 26, 40][variant];
  for (let i = 0; i < hang; i++) {
    allLeaves.push(...growVine(rnd() * W, -4, Math.PI / 2 + (rnd() - 0.5) * 0.4, 50 + rnd() * H * 0.45, 1.6 + rnd() * 1.6));
  }
  // 面を覆う葉のかたまり(高さごとの濃さに従って置く。下ほど密)
  for (let i = 0; i < leafCount; i++) {
    const y = rnd() * H;
    const v = 1 - y / H; // 下=0、上=1
    if (rnd() > density(v)) continue;
    allLeaves.push([rnd() * W, y, 10 + rnd() * 15, rnd() * Math.PI * 2]);
  }
  allLeaves.sort((a, b) => a[1] - b[1]); // 上から順に描くと、下の葉が上に重なって瓦のように見える
  allLeaves.forEach(([x, y, s, a]) => leaf(x, y, s, a));
}

// 汚れ1枚分の絵を描く(雨だれ・地面のはね返りの泥・カビ・シミ・ひび割れ・塗装のはがれ)。背景は透明
function drawGrimeCanvas(canvas, seed) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const rnd = makeRng(seed);
  ctx.clearRect(0, 0, W, H);
  // 大きなシミ(暗い+緑がかったカビ)
  for (let i = 0; i < 30; i++) {
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const mold = rnd() < 0.4;
    g.addColorStop(0, mold ? 'rgba(55,85,40,0.32)' : 'rgba(25,22,15,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 雨だれの筋(上から下へ)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y0 = rnd() * H * 0.5, len = 40 + rnd() * H * 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    let cx = x;
    for (let y = y0; y < y0 + len; y += 8) { cx += (rnd() - 0.5) * 1.6; ctx.lineTo(cx, y); }
    ctx.strokeStyle = `rgba(20,18,12,${0.06 + rnd() * 0.22})`;
    ctx.lineWidth = 1 + rnd() * 3.5;
    ctx.stroke();
  }
  // 下端の泥はね(地面に近いほど濃い茶色)
  const mud = ctx.createLinearGradient(0, H, 0, H * 0.55);
  mud.addColorStop(0, 'rgba(45,32,20,0.85)');
  mud.addColorStop(0.5, 'rgba(45,32,20,0.35)');
  mud.addColorStop(1, 'rgba(45,32,20,0)');
  ctx.fillStyle = mud;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  for (let i = 0; i < 500; i++) { // 泥の飛沫
    ctx.fillStyle = `rgba(40,28,16,${0.2 + rnd() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, H - Math.pow(rnd(), 2) * H * 0.5, 1 + rnd() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 上端の暗い汚れ(雨どい代わりの縁から流れる汚水)
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.18);
  top.addColorStop(0, 'rgba(20,18,12,0.5)');
  top.addColorStop(1, 'rgba(20,18,12,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.18);
  // ひび割れ
  for (let i = 0; i < 14; i++) {
    let x = rnd() * W, y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (rnd() - 0.5) * 26; y += rnd() * 22; ctx.lineTo(x, y); }
    ctx.strokeStyle = 'rgba(10,8,6,0.5)';
    ctx.lineWidth = 1 + rnd() * 1.5;
    ctx.stroke();
  }
  // 塗装のはがれ(明るい下地+暗い縁)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 26;
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const ang = (k / 9) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6);
      k === 0 ? ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7) : ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(190,175,140,0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,12,8,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// 外壁の外側に、汚れとツタの板を貼る。facesByFloor=[{ y: その階の床のY, faces: [{ side, fixed, a0, a1, cuts? }] }]。
// sideは外を向く方角(south/north/east/west)、fixedはその壁のX(東西面)またはZ(南北面)、a0〜a1は壁に沿った範囲、cutsは板を貼らずに空ける範囲
function addOvergrownExterior(facesByFloor) {
  const makeTex = (draw, w, h, ...args) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    draw(canvas, ...args);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  // 階ごと(0=1階,1=2階,2=屋根裏)に2種類ずつ用意。奥行きが出るよう、手前の層は別の絵と別の位置を使う
  const ivyTex = [0, 1, 2].map(v => [makeTex(drawIvyCanvas, 2048, 512, v, 100 + v), makeTex(drawIvyCanvas, 2048, 512, v, 200 + v)]);
  const grimeTex = [0, 1, 2].map(v => makeTex(drawGrimeCanvas, 1024, 256, 300 + v));
  const ivyMats = ivyTex.map(pair => pair.map(t => new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.45 })));
  const grimeMats = grimeTex.map(t => new THREE.MeshLambertMaterial({ map: t, transparent: true, depthWrite: false }));

  const H = wallHeight, TEX_W = 13; // 絵の横幅=13m分
  // 面ごとの向き。dは板のローカルX方向が世界のどちらの軸方向に進むか(絵を壁に沿って正しくつなぐため)
  const sides = {
    south: { rotY: Math.PI, d: -1, shift: 0 },
    east: { rotY: Math.PI / 2, d: -1, shift: 3.7 },
    north: { rotY: 0, d: 1, shift: 7.1 },
    west: { rotY: -Math.PI / 2, d: 1, shift: 10.3 },
  };

  // 1枚の板を貼る。a0〜a1は壁に沿った範囲(南北面ならX、東西面ならZ)、fixedは壁の位置、offは壁面からの浮かせ量
  function addPatch(y, face, a0, a1, mat, off, uShift) {
    const side = sides[face.side];
    const w = a1 - a0, ac = (a0 + a1) / 2;
    const geo = new THREE.PlaneGeometry(w, H);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setX(i, (ac + side.d * pos.getX(i) + side.shift + uShift) / TEX_W);
    }
    const mesh = new THREE.Mesh(geo, mat);
    const dist = 0.1 + off; // 壁の厚み(0.2)の半分+浮かせ量
    if (face.side === 'south') mesh.position.set(ac, y + H / 2, face.fixed - dist);
    else if (face.side === 'north') mesh.position.set(ac, y + H / 2, face.fixed + dist);
    else if (face.side === 'west') mesh.position.set(face.fixed - dist, y + H / 2, ac);
    else mesh.position.set(face.fixed + dist, y + H / 2, ac);
    mesh.rotation.y = side.rotY;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
  }

  facesByFloor.forEach((floor, fi) => {
    floor.faces.forEach(face => {
      // cuts(ドアとその枠など)に当たる範囲は、板を貼らずに空ける
      let ranges = [[face.a0, face.a1]];
      (face.cuts || []).forEach(([c0, c1]) => {
        ranges = ranges.flatMap(([s0, e0]) => {
          if (c1 <= s0 || c0 >= e0) return [[s0, e0]];
          const out = [];
          if (c0 > s0) out.push([s0, c0]);
          if (c1 < e0) out.push([c1, e0]);
          return out;
        });
      });
      ranges.forEach(([a0, a1]) => {
        addPatch(floor.y, face, a0, a1, grimeMats[fi], 0.012, 0);
        addPatch(floor.y, face, a0, a1, ivyMats[fi][0], 0.04, 0);
        addPatch(floor.y, face, a0, a1, ivyMats[fi][1], 0.08, 6.5);
      });
    });
  });
}

// 白黒のチェック柄(タイル張りの床用)。2×2マスの絵を描き、呼び出し側でrepeatして使う
function makeCheckerTexture(colorA, colorB) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? colorA : colorB;
      ctx.fillRect(i * 64, j * 64, 64, 64);
    }
  }
  for (let i = 0; i < 500; i++) { // 汚れ
    ctx.fillStyle = `rgba(30,22,10,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ラグ(敷物)の絵。同心円の縁取り+すり切れた汚れ。eye=trueで中央に目の模様を描く(Master Bedroomのラグ)
function makeRugTexture(base, accent, eye, round) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  if (round) {
    [118, 100, 70].forEach(r => { ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke(); });
  } else {
    [[6, 6], [24, 24]].forEach(([m]) => ctx.strokeRect(m, m, 256 - m * 2, 256 - m * 2));
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, 156, 156);
  }
  for (let i = 0; i < 700; i++) { // すり切れ・シミ
    ctx.fillStyle = `rgba(20,14,8,${Math.random() * 0.22})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (eye) {
    ctx.fillStyle = 'rgba(235,225,200,0.9)'; // まぶた(レモン形)
    ctx.beginPath();
    ctx.moveTo(62, 128);
    ctx.quadraticCurveTo(128, 70, 194, 128);
    ctx.quadraticCurveTo(128, 186, 62, 128);
    ctx.fill();
    ctx.strokeStyle = '#1a100a';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#6b1a14'; // 虹彩
    ctx.beginPath(); ctx.arc(128, 128, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0606'; // 瞳孔
    ctx.beginPath(); ctx.arc(128, 128, 9, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 実際にこの家を組み立てる。main.js がこのマップを選んだ瞬間だけ呼ばれる
export function build() {
  // ---- 階の基準Yを決める(1階=0、2階=3、屋根裏=6) ----
  const FLOOR_1F = 0, FLOOR_2F = 1, FLOOR_ATTIC = 2;
  const y2F = wallHeight;   // 3 (階と階の間に隙間を作らない。壁がそのまま次の階の壁の土台になる)
  const yAttic = y2F * 2;   // 6
  defineUpperFloor(FLOOR_2F, y2F);
  defineUpperFloor(FLOOR_ATTIC, yAttic);

  // ---- 部屋一覧(実際のGrafton Farmhouseの間取り図を、13m四方に収まるよう縮尺して写したもの) ----
  // X=東西(0が西端)、Z=南北(0が南端=玄関側)。L字の部屋は、同じ名前で長方形を2つ登録している
  // 1階(8部屋)。Living Roomだけ南へ1m張り出している(Z=0〜1、X=0〜3.87)。家の南面はそれ以外Z=1
  rooms.push(
    { name: "Living Room",  bounds: { minX: 0, maxX: 4.85, minZ: 1, maxZ: 5.66 } },
    { name: "Living Room",  bounds: { minX: 0, maxX: 3.87, minZ: 0, maxZ: 1 } },       // 南に張り出した部分
    { name: "Kitchen",      bounds: { minX: 0, maxX: 4.85, minZ: 5.66, maxZ: 10.4 } },
    { name: "Utility Room", bounds: { minX: 0, maxX: 4.85, minZ: 10.4, maxZ: 13 } },
    { name: "Library",      bounds: { minX: 8.87, maxX: 13, minZ: 7.96, maxZ: 13 } },
    { name: "Dining Room",  bounds: { minX: 4.85, maxX: 8.87, minZ: 5.66, maxZ: 13 } },
    { name: "Dining Room",  bounds: { minX: 8.87, maxX: 10.76, minZ: 5.66, maxZ: 7.96 } }, // Libraryの下に回り込んだ部分
    { name: "Downstairs Bathroom", bounds: { minX: 10.76, maxX: 13, minZ: 5.66, maxZ: 7.96 } },
    { name: "Foyer",        bounds: { minX: 4.85, maxX: 7.8, minZ: 1, maxZ: 5.66 } },
    { name: "Work Room",    bounds: { minX: 7.8, maxX: 13, minZ: 1, maxZ: 5.66 } },
  );
  // 2階(5部屋+廊下は2区画)。Master BedroomがLiving Roomの真上、廊下の東端は行き止まり
  rooms.push(
    { name: "Master Bedroom",   bounds: { minX: 0, maxX: 3.87, minZ: 0, maxZ: 7.25 }, upperFloor: FLOOR_2F },
    { name: "Master Bathroom",  bounds: { minX: 5.65, maxX: 8.35, minZ: 7.25, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Twin Bedroom",     bounds: { minX: 8.35, maxX: 13, minZ: 7.25, maxZ: 13 }, upperFloor: FLOOR_2F },
    { name: "Child Bedroom",    bounds: { minX: 8.87, maxX: 13, minZ: 1, maxZ: 5.25 }, upperFloor: FLOOR_2F },
    { name: "Upstairs Hallway", bounds: { minX: 3.87, maxX: 8.87, minZ: 1, maxZ: 7.25 }, upperFloor: FLOOR_2F, hallway: true },
    { name: "Upstairs Hallway", bounds: { minX: 8.87, maxX: 13, minZ: 5.25, maxZ: 7.25 }, upperFloor: FLOOR_2F, hallway: true }, // 東へ伸びる廊下(屋根裏への階段がある)
  );
  // 屋根裏(1部屋)。2階の真上に載る
  rooms.push(
    { name: "Attic", bounds: { minX: 6.5, maxX: 12.6, minZ: 5.4, maxZ: 12.6 }, upperFloor: FLOOR_ATTIC },
  );

  // ---- 1階の壁・ドア ----
  // 外壁(玄関ドアはFoyerの南壁、X=5.75)
  addWall('x', 0, 0, 3.87);          // Living Roomの南(張り出した部分)
  addWall('z', 3.87, 0, 1);          // 張り出した部分の東側
  addWall('x', 1, 3.87, 13, 5.75);   // 家の南面(玄関ドア付き)
  addWall('z', 13, 1, 13);           // 東
  addWall('x', 13, 0, 13);           // 北
  addWall('z', 0, 0, 13);            // 西
  // 内壁(ドアの位置は、図でつながっている部屋同士に開けてある)
  addWall('z', 4.85, 1, 5.66, 3.2);   // Living Room / Foyer
  addWall('z', 4.85, 5.66, 13, 8.0);  // Kitchen・Utility Room / Dining Room(ドアはKitchen側)
  addWall('x', 5.66, 0, 4.85, 4.0);   // Living Room / Kitchen(ソファの前を避けて東寄り)
  addWall('x', 10.4, 0, 4.85, 3.6);   // Kitchen / Utility Room
  addWall('x', 5.66, 4.85, 7.8, 5.85); // Foyer / Dining Room
  addWall('z', 7.8, 1, 5.66, 1.75);   // Foyer / Work Room(階段の手前)
  addWall('x', 5.66, 7.8, 13, 9.4);   // Work Room / Dining Room(回り込んだ部分)・Downstairs Bathroom
  addWall('z', 10.76, 5.66, 7.96, 7.0); // Dining Room / Downstairs Bathroom(洗面台を避けて北寄り)
  addWall('x', 7.96, 8.87, 13, 9.8);  // Library / Dining Room(回り込んだ部分)・Downstairs Bathroom
  addWall('z', 8.87, 7.96, 13, 9.6);  // Library / Dining Room

  // 玄関の外に出られるドアを、後でハント時にロックできるよう控えておく
  const entranceDoor = doors.find(d => !d.upperFloor && Math.abs(d.center.x - 5.75) < 0.01 && Math.abs(d.center.z - 1) < 0.01);
  if (entranceDoor) setExteriorDoor(entranceDoor);

  // ---- 2階の壁・ドア ----
  setBuildingUpperFloor(FLOOR_2F);
  // 外壁
  addWall('x', 0, 0, 3.87);          // Master Bedroomの南
  addWall('z', 0, 0, 7.25);          // Master Bedroomの西
  addWall('x', 1, 3.87, 13);         // 家の南面(廊下とChild Bedroomの南)
  addWall('z', 13, 1, 13);           // 東
  addWall('x', 13, 5.65, 13);        // 北
  addWall('z', 5.65, 7.25, 13);      // Master Bathroomの西
  addWall('x', 7.25, 0, 3.87);       // Master Bedroomの北
  // 内壁
  addWall('z', 3.87, 0, 7.25, 6.0);      // Master Bedroom / 廊下
  addWall('x', 7.25, 3.87, 8.35, 6.4);   // 廊下 / Master Bathroom(西側は外壁)
  addWall('z', 8.35, 7.25, 13);          // Master Bathroom / Twin Bedroom
  addWall('x', 7.25, 8.35, 13, 9.3);     // 廊下 / Twin Bedroom
  addWall('x', 5.25, 8.87, 13);          // 東の廊下 / Child Bedroom
  addWall('z', 8.87, 1, 5.25, 3.0);      // 廊下 / Child Bedroom

  // ---- 屋根裏の壁(単一の部屋なので外周のみ) ----
  setBuildingUpperFloor(FLOOR_ATTIC);
  addWall('x', 5.4, 6.5, 12.6);
  addWall('x', 12.6, 6.5, 12.6);
  addWall('z', 6.5, 5.4, 12.6);
  addWall('z', 12.6, 5.4, 12.6);

  setBuildingUpperFloor(FLOOR_1F); // 以降の呼び出しは1階の扱いに戻す

  // ---- 外装: ツタまみれ+汚れ(見た目だけ。壁・当たり判定は変えない)。外壁のある辺ごとに貼る ----
  addOvergrownExterior([
    { y: 0, faces: [
      { side: 'south', fixed: 0, a0: 0, a1: 3.87 },
      { side: 'east', fixed: 3.87, a0: 0, a1: 1 },
      { side: 'south', fixed: 1, a0: 3.87, a1: 13, cuts: [[5.05, 6.45]] }, // 玄関のドアとその枠を避ける
      { side: 'east', fixed: 13, a0: 1, a1: 13 },
      { side: 'north', fixed: 13, a0: 0, a1: 13 },
      { side: 'west', fixed: 0, a0: 0, a1: 13 },
    ] },
    { y: y2F, faces: [
      { side: 'south', fixed: 0, a0: 0, a1: 3.87 },
      { side: 'east', fixed: 3.87, a0: 0, a1: 1 },
      { side: 'south', fixed: 1, a0: 3.87, a1: 13 },
      { side: 'east', fixed: 13, a0: 1, a1: 13 },
      { side: 'north', fixed: 13, a0: 5.65, a1: 13 },
      { side: 'west', fixed: 5.65, a0: 7.25, a1: 13 },
      { side: 'north', fixed: 7.25, a0: 0, a1: 5.65 },
      { side: 'west', fixed: 0, a0: 0, a1: 7.25 },
    ] },
    { y: yAttic, faces: [
      { side: 'south', fixed: 5.4, a0: 6.5, a1: 12.6 },
      { side: 'east', fixed: 12.6, a0: 5.4, a1: 12.6 },
      { side: 'north', fixed: 12.6, a0: 6.5, a1: 12.6 },
      { side: 'west', fixed: 6.5, a0: 5.4, a1: 12.6 },
    ] },
  ]);

  // ---- 階段(1階Foyer⇔2階Upstairs Hallway、2階⇔屋根裏)。axisは登る向き('z'=北へ、'x'=東へ)。通路として壁で囲う ----
  // 階段Aは図の通りFoyerの東側(Work Roomとの壁沿い)、階段Bは図の通り2階廊下の東端
  const stairsA = { minX: 6.55, maxX: 7.75, minZ: 2.4, maxZ: 5.3, axis: 'z' };   // 1階Foyer ⇔ 2階Upstairs Hallway
  const stairsB = { minX: 9.6, maxX: 11.4, minZ: 5.65, maxZ: 6.85, axis: 'x' };  // 2階Upstairs Hallway ⇔ 屋根裏Attic
  const holeA = { minX: stairsA.minX, maxX: stairsA.maxX, minZ: stairsA.minZ, maxZ: stairsA.maxZ };
  const holeB = { minX: stairsB.minX, maxX: stairsB.maxX, minZ: stairsB.minZ, maxZ: stairsB.maxZ };
  // 登る向きの「始点の辺」と「終点の辺」を返す(始点=降り口側、終点=登りきった先)
  const stairLen = (s) => (s.axis === 'z' ? s.maxZ - s.minZ : s.maxX - s.minX);
  const stairWidth = (s) => (s.axis === 'z' ? s.maxX - s.minX : s.maxZ - s.minZ);
  const stairPos = (s, t) => (s.axis === 'z' ? s.minZ + t * stairLen(s) : s.minX + t * stairLen(s)); // 登る向きの座標

  // ---- 床・天井(見た目だけの板。家の輪郭は長方形ではないので、部屋のかたまりごとに敷く) ----
  // 上向き・下向きの板をそれぞれ別に(法線を正しく)敷いて、上下どちらからもきちんと見えるようにする
  function addSlab(rect, y, material, facingUp) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect.maxX - rect.minX, rect.maxZ - rect.minZ), material);
    mesh.rotation.x = facingUp ? -Math.PI / 2 : Math.PI / 2;
    mesh.position.set((rect.minX + rect.maxX) / 2, y, (rect.minZ + rect.maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const woodTex = makeWoodTexture('#5a4632');
  const floorMatFor = (r) => new THREE.MeshLambertMaterial({ map: scaled(woodTex, (r.maxX - r.minX) * 0.54, (r.maxZ - r.minZ) * 0.54) });
  // 1階の家の輪郭(=2階の床の下、1階の天井)
  const foot1F = [{ minX: 0, maxX: 13, minZ: 1, maxZ: 13 }, { minX: 0, maxX: 3.87, minZ: 0, maxZ: 1 }];
  // 2階の家の輪郭(=屋根裏の床の下、2階の天井)
  const foot2F = [
    { minX: 0, maxX: 3.87, minZ: 0, maxZ: 7.25 }, { minX: 3.87, maxX: 8.87, minZ: 1, maxZ: 7.25 },
    { minX: 8.87, maxX: 13, minZ: 5.25, maxZ: 7.25 }, { minX: 8.87, maxX: 13, minZ: 1, maxZ: 5.25 },
    { minX: 5.65, maxX: 8.35, minZ: 7.25, maxZ: 13 }, { minX: 8.35, maxX: 13, minZ: 7.25, maxZ: 13 },
  ];
  // 歩く面(上向き)は、真下の階の壁の上端とちょうど同じ高さだとZファイティングで壁が透けて見えるため、ほんの少しだけ上にずらす
  const floorLift = 0.03;
  foot1F.forEach(r => {
    addSlab(r, 0, floorMatFor(r), true); // 1階の床(すぐ下は地面なので穴なし)
    const m = floorMatFor(r);
    if (r.maxX === 13) { // 階段Aの吹き抜けだけ穴を開ける(1階の天井=2階の床)
      addFramedPlane(r, holeA, y2F + floorLift, m, true);
      addFramedPlane(r, holeA, y2F, m, false);
    } else {
      addSlab(r, y2F + floorLift, m, true);
      addSlab(r, y2F, m, false);
    }
  });
  foot2F.forEach(r => {
    const m = floorMatFor(r);
    if (r.minX === 8.87 && r.minZ === 5.25) { // 階段Bの吹き抜けだけ穴を開ける(2階の天井=屋根裏の床)
      addFramedPlane(r, holeB, yAttic + floorLift, m, true);
      addFramedPlane(r, holeB, yAttic, m, false);
    } else {
      addSlab(r, yAttic + floorLift, m, true);
      addSlab(r, yAttic, m, false);
    }
  });

  // 部屋ごとの床の模様(図に合わせて、Kitchen・Downstairs Bathroom・Master Bathroomは白黒のタイル張り)。少し浮かせて重ねる
  function addTileFloor(rect, y) {
    const tex = makeCheckerTexture('#d9d4c6', '#2b2825');
    tex.repeat.set((rect.maxX - rect.minX) / 0.7, (rect.maxZ - rect.minZ) / 0.7);
    addSlab(rect, y + 0.012, new THREE.MeshLambertMaterial({ map: tex }), true);
  }
  addTileFloor({ minX: 0.1, maxX: 4.75, minZ: 5.76, maxZ: 10.3 }, 0);                 // Kitchen
  addTileFloor({ minX: 10.86, maxX: 12.9, minZ: 5.76, maxZ: 7.86 }, 0);               // Downstairs Bathroom
  addTileFloor({ minX: 5.75, maxX: 8.25, minZ: 7.35, maxZ: 12.9 }, y2F + floorLift);  // Master Bathroom
  // 丸いラグ・長方形のラグ(図にある敷物)。床から少し浮かせて置く
  function addRug(x, z, size, y, palette, round = true, eye = false) {
    const tex = makeRugTexture(palette[0], palette[1], eye, round);
    const geo = round ? new THREE.CircleGeometry(size, 40) : new THREE.PlaneGeometry(size[0], size[1]);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.02, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const rugBrown = ['#6a5a48', '#3e3228'], rugRed = ['#6b3a30', '#2e1a16'], rugTan = ['#8a7450', '#4a3a24'], rugGrey = ['#5d5a52', '#35332e'];
  addRug(2.0, 1.9, 1.15, 0, rugBrown);                            // Living Room
  addRug(6.9, 9.6, [2.3, 3.5], 0, rugRed, false);                 // Dining Room(長いテーブルの下)
  addRug(11.2, 10.4, 1.4, 0, rugBrown);                           // Library
  addRug(10.6, 3.1, 1.25, 0, rugGrey);                            // Work Room
  addRug(1.9, 3.3, 1.2, y2F + floorLift, rugTan, true, true);     // Master Bedroom(中央に目の模様)
  addRug(10.4, 10.4, 1.1, y2F + floorLift, rugBrown);             // Twin Bedroom
  addRug(10.4, 3.9, 0.95, y2F + floorLift, rugGrey);              // Child Bedroom

  // 階段の両脇に壁を立てて、通路をきちんと囲う。1階分の高さ(wallHeight)だけあれば階段自体は覆えるので、
  // 見た目は下側の階でだけ作る(上側の階でも作ると2階分の高さに積み上がってしまう)
  function addStairSideWalls(s) {
    if (s.axis === 'z') {
      addWall('z', s.minX, s.minZ, s.maxZ); // 西側の壁
      addWall('z', s.maxX, s.minZ, s.maxZ); // 東側の壁
    } else {
      addWall('x', s.minZ, s.minX, s.maxX); // 南側の壁
      addWall('x', s.maxZ, s.minX, s.maxX); // 北側の壁
    }
  }
  setBuildingUpperFloor(FLOOR_1F);
  addStairSideWalls(stairsA);
  setBuildingUpperFloor(FLOOR_2F);
  addStairSideWalls(stairsB);
  setBuildingUpperFloor(FLOOR_1F);

  // 階段のゾーンは「正しい側から少しずつ上る」以外の入り方をすると、登る向きの座標だけで高さが決まる都合上、
  // 逆側からいきなり足を踏み入れた瞬間に高さが飛んでしまう(踏んだだけでワープする)。
  // これを防ぐため、上側の入口を「まだ下の階のつもりでいる間」だけ塞ぐ壁と、
  // 下側の入口を「まだ上の階のつもりでいる間」だけ塞ぐ壁を追加する。
  function addStairEndWall(s, atTop) {
    if (s.axis === 'z') addWall('x', atTop ? s.maxZ : s.minZ, s.minX, s.maxX);
    else addWall('z', atTop ? s.maxX : s.minX, s.minZ, s.maxZ);
  }
  setBuildingUpperFloor(FLOOR_1F);
  addStairEndWall(stairsA, true);    // Foyer側から誤って上の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_2F);
  addStairEndWall(stairsA, false);   // 廊下側から誤って下の入口に踏み込むのを防ぐ
  addStairEndWall(stairsB, true);    // 廊下の東端から誤って上の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_ATTIC);
  addStairEndWall(stairsB, false);   // Attic側から誤って下の入口に踏み込むのを防ぐ
  setBuildingUpperFloor(FLOOR_1F);

  // 壁・ドア枠をまとめて描画(全階ぶんまとめて1回でよい)。
  // ここまでで壁を追加するaddWallの呼び出しは全部終わっているので、必ずこのタイミングでまとめて描画する
  // (これより前でmergeしてしまうと、階段の側壁など後から追加した壁が見た目に反映されない=当たり判定はあるのに見えない、というバグになる)
  const mergedWall = new THREE.Mesh(mergeGeometries(wallGeometries), wallMaterial);
  mergedWall.castShadow = true; mergedWall.receiveShadow = true;
  scene.add(mergedWall);
  const mergedFrame = new THREE.Mesh(mergeGeometries(doorFrameGeometries), doorFrameMaterial);
  mergedFrame.castShadow = true; mergedFrame.receiveShadow = true;
  scene.add(mergedFrame);

  // 見た目だけの階段(踏み板を並べるだけの簡易版)+階段の下の空洞を塞ぐ箱
  const stepMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#4a3a28'), 1, 1) });
  function addSteps(s, baseY, topY) {
    const stepCount = 14;
    const along = stairLen(s) / stepCount + 0.02, across = stairWidth(s) - 0.1;
    const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2;
    for (let i = 0; i < stepCount; i++) {
      const t = i / (stepCount - 1);
      const p = stairPos(s, t);
      const stepY = baseY + t * (topY - baseY);
      const fillHeight = Math.max(0.05, stepY - baseY);
      const sx = s.axis === 'z' ? across : along, sz = s.axis === 'z' ? along : across;
      const px = s.axis === 'z' ? cx : p, pz = s.axis === 'z' ? p : cz;
      const step = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.05, sz), stepMat);
      step.position.set(px, stepY, pz);
      step.receiveShadow = true; step.castShadow = true;
      scene.add(step);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(sx, fillHeight, sz), stepMat);
      fill.position.set(px, baseY + fillHeight / 2, pz);
      fill.receiveShadow = true; fill.castShadow = true;
      scene.add(fill);
    }
  }
  addSteps(stairsA, 0, y2F);
  addSteps(stairsB, y2F, yAttic);

  // 階段の登った先(吹き抜けの縁)に落下防止の柵を作る。細い柱+上の横木のシンプルな作り。
  // 登りきった先(終点の辺)だけは乗り降り口として塞がずに残し、残りの3辺に柵を立てる
  const railMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#8a6642'), 1, 1) });
  function addStairRailing(s, y) {
    const railHeight = 0.9, postSize = 0.05, railSize = 0.06, postSpacing = 0.3;
    const all = {
      west:  { x0: s.minX, z0: s.minZ, x1: s.minX, z1: s.maxZ },
      east:  { x0: s.maxX, z0: s.minZ, x1: s.maxX, z1: s.maxZ },
      south: { x0: s.minX, z0: s.minZ, x1: s.maxX, z1: s.minZ },
      north: { x0: s.minX, z0: s.maxZ, x1: s.maxX, z1: s.maxZ },
    };
    const openSide = s.axis === 'z' ? 'north' : 'east'; // 登りきった先
    Object.keys(all).filter(k => k !== openSide).forEach(k => {
      const e = all[k];
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0;
      const len = Math.sqrt(dx * dx + dz * dz);
      const postCount = Math.max(2, Math.round(len / postSpacing) + 1);
      for (let i = 0; i < postCount; i++) {
        const t = i / (postCount - 1);
        const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, railHeight, postSize), railMat);
        post.position.set(e.x0 + dx * t, y + railHeight / 2, e.z0 + dz * t);
        post.castShadow = true;
        scene.add(post);
      }
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(dz === 0 ? len + postSize : railSize, railSize, dx === 0 ? len + postSize : railSize),
        railMat
      );
      rail.position.set((e.x0 + e.x1) / 2, y + railHeight, (e.z0 + e.z1) / 2);
      rail.castShadow = true;
      scene.add(rail);
      // 柵の当たり判定(通り抜けできないように、今組み立てている階に正しく登録する)
      pushWallBox({
        minX: Math.min(e.x0, e.x1) - postSize, maxX: Math.max(e.x0, e.x1) + postSize,
        minZ: Math.min(e.z0, e.z1) - postSize, maxZ: Math.max(e.z0, e.z1) + postSize,
      });
    });
  }
  setBuildingUpperFloor(FLOOR_2F);
  addStairRailing(stairsA, y2F); // 2階側、階段Aの吹き抜けの縁
  setBuildingUpperFloor(FLOOR_ATTIC);
  addStairRailing(stairsB, yAttic); // 屋根裏側、階段Bの吹き抜けの縁
  setBuildingUpperFloor(FLOOR_1F);

  // ---- 階段の昇り降り(登る向きの位置に応じてYを補間する。毎フレームengineから呼ばれる)。
  // 今いる階が、その階段がつなぐ2つの階のどちらかであるときだけ判定する(でないと、
  // 別の階のたまたま同じX/Z座標を歩いただけで階段の判定に巻き込まれてしまう) ----
  function updateGraftonFloor() {
    const x = camera.position.x, z = camera.position.z;
    const onFloorForA = currentUpperFloor === FLOOR_1F || currentUpperFloor === FLOOR_2F;
    const onFloorForB = currentUpperFloor === FLOOR_2F || currentUpperFloor === FLOOR_ATTIC;
    const inside = (s) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
    const progress = (s) => ((s.axis === 'z' ? z : x) - (s.axis === 'z' ? s.minZ : s.minX)) / stairLen(s); // 0(降り口側)〜1(登りきった先)
    if (onFloorForA && inside(stairsA)) {
      const t = progress(stairsA);
      camera.position.y = t * y2F + 1.6;
      setCurrentUpperFloor(t > 0.5 ? FLOOR_2F : FLOOR_1F);
    } else if (onFloorForB && inside(stairsB)) {
      const t = progress(stairsB);
      camera.position.y = y2F + t * (yAttic - y2F) + 1.6;
      setCurrentUpperFloor(t > 0.5 ? FLOOR_ATTIC : FLOOR_2F);
    }
  }
  onFrame(updateGraftonFloor);

  // ---- 照明(部屋ごとに天井灯+スイッチ。ブレーカーはUtility Roomに設置) ----
  // テストプレイ用の補助的な全体照明(部屋の隅など、天井灯の光が届きにくい場所を底上げする)
  const HEMI_ON = 0.9;   // ブレーカーが入っている間の全体照明の強さ
  const HEMI_OFF = 0;    // ブレーカーが落ちている間の全体照明の強さ(0=なし。暗くしたいほど0に近づける、明るくしたいときは上げる)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x605040, HEMI_ON);
  scene.add(hemiLight);
  // スイッチは既定では部屋の東壁の北寄りに付く。壁がない・ドアや家具とぶつかる部屋は、位置を指定している
  const roomLights = {
    "Living Room": addRoomLight("Living Room", 16, 0xfff2cc, 18),
    "Kitchen": addRoomLight("Kitchen", 16, 0xfff2cc, 18),
    "Utility Room": addRoomLight("Utility Room", 12, 0xfff2cc, 18),
    "Library": addRoomLight("Library", 14, 0xfff2cc, 18),
    "Dining Room": addRoomLight("Dining Room", 18, 0xfff2cc, 20),
    "Downstairs Bathroom": addRoomLight("Downstairs Bathroom", 10, 0xdcecff, 18),
    "Work Room": addRoomLight("Work Room", 12, 0xfff2cc, 18),
    "Foyer": addRoomLight("Foyer", 12, 0xfff2cc, 18),
  };
  Object.keys(roomLights).forEach(name => {
    if (name === "Library") addLightSwitch(name, roomLights[name], 9.02, 11.5);   // 西壁(本棚は東壁側)
    else if (name === "Foyer") addLightSwitch(name, roomLights[name], 5.0, 1.8);  // 西壁の玄関寄り(東は階段)
    else addLightSwitch(name, roomLights[name]);
  });

  setBuildingUpperFloor(FLOOR_2F);
  const roomLights2F = {
    "Master Bathroom": addRoomLight("Master Bathroom", 11, 0xdcecff, 18),
    "Master Bedroom": addRoomLight("Master Bedroom", 16, 0xfff2cc, 18),
    "Upstairs Hallway": addRoomLight("Upstairs Hallway", 16, 0xfff2cc, 22),
    "Twin Bedroom": addRoomLight("Twin Bedroom", 14, 0xfff2cc, 18),
    "Child Bedroom": addRoomLight("Child Bedroom", 14, 0xfff2cc, 18),
  };
  Object.keys(roomLights2F).forEach(name => {
    if (name === "Master Bedroom") addLightSwitch(name, roomLights2F[name], 3.72, 4.4);   // 東壁(ドアを避けた位置)
    else if (name === "Upstairs Hallway") addLightSwitch(name, roomLights2F[name], 4.02, 3.5); // 西壁
    else addLightSwitch(name, roomLights2F[name]);
  });

  setBuildingUpperFloor(FLOOR_ATTIC);
  const roomLightsAttic = { "Attic": addRoomLight("Attic", 14, 0xfff2cc, 20) };
  addLightSwitch("Attic", roomLightsAttic["Attic"]);

  setBuildingUpperFloor(FLOOR_1F);

  // ブレーカー(図の通り、Utility RoomとKitchenの間の壁、西寄りに設置。Utility Room側=北向きに付ける)
  const breakerBox = { x: 1.5, z: 10.575 };
  const breakerMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const breakerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.15), breakerMat);
  breakerMesh.position.set(breakerBox.x, 1.4, breakerBox.z);
  scene.add(breakerMesh);
  // 状態が見えるレバー(落ちている間は赤、入っている間は緑)
  const breakerLeverMat = new THREE.MeshLambertMaterial({ color: 0x552222, emissive: 0x220000, emissiveIntensity: 0.4 });
  const breakerLever = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.05), breakerLeverMat);
  breakerLever.position.set(breakerBox.x, 1.4, breakerBox.z + 0.1);
  scene.add(breakerLever);
  // ブレーカーの状態を全ての照明とレバーに反映する
  function applyBreakerState() {
    updateRoomLightCulling();
    hemiLight.intensity = breakerOn ? HEMI_ON : HEMI_OFF; // 停電中は補助の全体照明も落として、暗くする
    breakerLeverMat.color.set(breakerOn ? 0x2f6b2f : 0x552222);
    breakerLeverMat.emissive.set(breakerOn ? 0x113311 : 0x220000);
  }
  registerBreaker(breakerBox, applyBreakerState);
  setBreakerOn(false); // ゲーム開始時は電気が落ちている。Utility Roomのブレーカーを入れると、スイッチで各部屋の照明がつけられるようになる
  applyBreakerState();

  // ---- 家具(図の配置に合わせた。座標は特記がなければ世界座標) ----
  // 1階
  sofaAt(2.3, 5.1, 2.2, 0.9);                                  // Living Room: 北の壁を背にしたソファ
  addFurniture(2.3, 3.8, 1.0, 0.5, 0.4);                       // Living Room: ローテーブル
  addFurniture(0.4, 3.0, 0.5, 1.4, 0.9);                       // Living Room: 西の壁際のチェスト
  counterAt(0.45, 7.6, 0.7, 2.6, 0.9);                         // Kitchen: 西の壁際のカウンター
  fridgeAt(0.65, 9.9, 0.7, 0.7, 1.7);                          // Kitchen: 北西の隅の冷蔵庫
  addFurniture(2.6, 7.9, 1.2, 1.0, 0.75);                      // Kitchen: 中央のテーブル
  counterAt(2.0, 10.0, 1.8, 0.6, 0.9);                         // Kitchen: 北の壁際の調理台
  addFurniture(3.5, 12.6, 1.6, 0.5, 1.6);                      // Utility Room: 北の壁際の棚(スイッチを避けた位置)
  addFurniture(0.6, 12.2, 0.7, 0.7, 0.9);                      // Utility Room: 洗濯機
  addFurniture(6.9, 9.6, 1.0, 2.4, 0.75);                      // Dining Room: 長いダイニングテーブル
  [[6.15, 8.7], [7.65, 8.7], [6.15, 10.5], [7.65, 10.5]].forEach(([x, z]) => addFurniture(x, z, 0.4, 0.4, 0.45)); // 椅子
  addFurniture(6.9, 12.6, 1.8, 0.5, 0.9);                      // Dining Room: 北の壁際のサイドボード
  wardrobeIn("Library", 3.85, 2.0, 0.5, 1.6, 1.9);            // Library: 東の壁際の本棚(2つ)
  wardrobeIn("Library", 3.85, 4.0, 0.5, 1.6, 1.9);
  addFurniture(10.0, 12.3, 1.4, 0.7, 0.75);                    // Library: 北の壁際の読書机
  addFurniture(5.05, 4.8, 0.3, 0.9, 1.0);                      // Foyer: 西の壁際の靴箱(2つのドアの通り道を避けた位置)
  addFurniture(10.6, 3.2, 1.6, 0.9, 0.75);                     // Work Room: 作業テーブル
  counterAt(12.6, 3.4, 0.7, 2.8, 0.9);                         // Work Room: 東の壁際の作業台
  addFurniture(11.8, 1.5, 1.8, 0.45, 1.6);                     // Work Room: 南の壁際の棚
  toiletIn("Downstairs Bathroom", 1.6, 0.45);
  washstandIn("Downstairs Bathroom", 0.9, 0.4, 0.9, 0.5, 0.85);

  // 2階
  setBuildingUpperFloor(FLOOR_2F);
  washstandIn("Master Bathroom", 2.25, 0.4, 0.7, 0.5, 0.85);
  toiletIn("Master Bathroom", 1.6, 0.45);
  addFurniture(6.45, 12.4, 1.6, 0.75, 0.55, ceramicMaterial);  // Master Bathroom: 北の壁際の浴槽
  bedIn("Master Bedroom", 2.0, 1.3, 1.8, 2.0);
  wardrobeIn("Master Bedroom", 3.45, 2.3, 0.5, 1.4, 1.9);
  addFurniture(4.4, 2.0, 0.5, 1.2, 0.5);                       // Upstairs Hallway: 西の壁際のベンチ
  addFurniture(5.0, 6.9, 1.0, 0.4, 0.5);                       // Upstairs Hallway: 北の壁際の箱
  bedIn("Twin Bedroom", 3.95, 2.05, 1.0, 1.8);                 // Twin Bedroom: 東の壁際にツインベッド(ドア前を空ける)
  bedIn("Twin Bedroom", 3.95, 3.95, 1.0, 1.8);
  addFurniture(9.6, 12.6, 1.4, 0.5, 0.9);                      // Twin Bedroom: 北の壁際のドレッサー
  bedIn("Child Bedroom", 2.13, 1.1, 1.0, 1.8);
  wardrobeIn("Child Bedroom", 3.85, 2.9, 0.5, 1.2, 1.7);

  // 屋根裏(階段Bの吹き抜け: X9.6-11.4, Z5.65-6.85 を避けて配置)
  setBuildingUpperFloor(FLOOR_ATTIC);
  furnitureIn("Attic", 1.5, 6.1, 1.2, 0.8, 0.9);               // 古びたトランク
  furnitureIn("Attic", 5.3, 6.1, 1.0, 0.6, 1.6);               // 古い戸棚
  addFurniture(7.3, 7.0, 0.8, 0.8, 0.7);                       // 積まれた木箱
  addFurniture(8.4, 7.3, 0.6, 0.6, 0.5);
  setBuildingUpperFloor(FLOOR_1F);

  // ---- 監視カメラ(1階3台・2階2台・屋根裏1台。映像はテントの奥の壁(机の後ろ)のモニターに映る) ----
  addSurveillanceCamera("Foyer");
  addSurveillanceCamera("Living Room");
  addSurveillanceCamera("Dining Room");
  addSurveillanceCamera("Master Bedroom", y2F);
  addSurveillanceCamera("Child Bedroom", y2F);
  addSurveillanceCamera("Attic", yAttic);

  // ---- 拠点のテント(家の南側、玄関(X=5.75)と同じXに正面を合わせて設置) ----
  const tentX = 5.75, tentZ = -15;
  {
    const tentMat = new THREE.MeshLambertMaterial({ color: 0x4a5540 });
    const halfWidth = 2.75, depth = 4.5, wallH = 1.6, rise = 1.4;

    // 入口は-Z側(家に向く側)。側面の壁はZ方向に、背面の壁はテントの+Z側に
    [1, -1].forEach(xSign => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, wallH, depth), tentMat);
      wall.position.set(tentX + xSign * halfWidth, wallH / 2, tentZ);
      wall.castShadow = true; wall.receiveShadow = true;
      scene.add(wall);
      wallBoxes.push({ minX: wall.position.x - 0.15, maxX: wall.position.x + 0.15, minZ: tentZ - depth / 2, maxZ: tentZ + depth / 2 });
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, wallH, 0.1), tentMat);
    backWall.position.set(tentX, wallH / 2, tentZ - depth / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    scene.add(backWall);

    // 正気度モニター(入口を入ってすぐ左の壁)
    drawSanityScreen(sanity);
    const sanityFrame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.05), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    sanityFrame.position.set(tentX - halfWidth + 0.03, 1.5, tentZ + 1.6);
    sanityFrame.rotation.y = Math.PI / 2;
    sanityFrame.castShadow = true;
    scene.add(sanityFrame);
    const sanityScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: sanityTexture }));
    sanityScreen.position.set(tentX - halfWidth + 0.06, 1.5, tentZ + 1.6);
    sanityScreen.rotation.y = Math.PI / 2;
    scene.add(sanityScreen);
    wallBoxes.push({ minX: tentX - halfWidth, maxX: tentX + halfWidth, minZ: tentZ - depth / 2 - 0.15, maxZ: tentZ - depth / 2 + 0.15 });

    // 監視カメラの映像を映すモニターは、道具を置いた机の奥の壁(背面の壁)に横一列に並べる。画面はフレームから離して点滅(Zファイティング)を防ぐ
    const monitorFrameMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const monitorW = 0.6, monitorH = 0.45, monitorSpacing = 0.7;
    const monitorY = 1.15; // 中心の高さ。机の面(0.75m)より上で、上端が壁の高さ(1.6m)を超えない高さ
    const backWallZ = tentZ - depth / 2;
    videoCams.forEach((cam, i) => {
      const xOffset = (i - (videoCams.length - 1) / 2) * monitorSpacing;
      const monitorFrame = new THREE.Mesh(new THREE.BoxGeometry(monitorW + 0.08, monitorH + 0.08, 0.06), monitorFrameMat);
      monitorFrame.position.set(tentX + xOffset, monitorY, backWallZ + 0.06);
      monitorFrame.castShadow = true;
      scene.add(monitorFrame);
      const monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(monitorW, monitorH), cam.material);
      monitorScreen.position.set(tentX + xOffset, monitorY, backWallZ + 0.11);
      scene.add(monitorScreen);
    });

    // 壁の上に乗る切妻屋根(棟はZ方向)
    const slopeLen = Math.sqrt(halfWidth * halfWidth + rise * rise) + 0.5;
    const angle = Math.atan2(rise, halfWidth);
    [1, -1].forEach(xSign => {
      const geo = new THREE.BoxGeometry(slopeLen, 0.25, depth + 0.3);
      const mesh = new THREE.Mesh(geo, tentMat);
      mesh.rotation.z = -xSign * angle;
      mesh.position.set(tentX + xSign * halfWidth / 2, wallH + rise / 2, tentZ);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    });

    // 妻側のすき間を三角の板で塞ぐ(+Z側が背面、-Z側が入口)
    {
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-halfWidth, 0);
      gableShape.lineTo(halfWidth, 0);
      gableShape.lineTo(0, rise);
      gableShape.closePath();
      const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.12, bevelEnabled: false });
      const gable = new THREE.Mesh(gableGeo, tentMat);
      gable.position.set(tentX, wallH, tentZ - depth / 2 - 0.06);
      gable.castShadow = true; gable.receiveShadow = true;
      scene.add(gable);
    }

    // テント内のランタン
    const lanternLight = new THREE.PointLight(0xffcc77, 4, 7);
    lanternLight.position.set(tentX, wallH + 0.4, tentZ - 1.6);
    scene.add(lanternLight);
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 1.5 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lanternMat);
    lantern.position.copy(lanternLight.position);
    scene.add(lantern);

    // テーブルと道具(2列に並べる)
    const tableZ = tentZ - depth / 2 + 0.8;
    const tableMat = new THREE.MeshLambertMaterial({ map: scaled(makeWoodTexture('#5a4632'), 1, 1) });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 1.0), tableMat);
    table.position.set(tentX, 0.375, tableZ);
    table.castShadow = true; table.receiveShadow = true;
    scene.add(table);
    wallBoxes.push({ minX: tentX - 1.0, maxX: tentX + 1.0, minZ: tableZ - 0.5, maxZ: tableZ + 0.5 });

    // 道具は、東の壁に掛けたペグボードに並べる(視線を向けてクリックで取る)。ノートだけは机の上に置く
    addToolPegboard({
      x: tentX + halfWidth - 0.05 - 0.03, z: tentZ - 0.2, rotY: -Math.PI / 2, // 東の壁の内側の面に付け、ボードの前を西(テントの中)へ向ける
      tools: ['flashlight', 'emf', 'thermometer', 'spiritbox', 'uv', 'dots'],
    });
    const rowBackZ = tableZ + 0.26;
    const notebookItem = makeNotebookItemMesh();
    notebookItem.position.y = 0.75 + toolRestOffset.notebook;
    setNotebookWorldMesh(notebookItem);
    addPickupItem(tentX + 0.5, rowBackZ, notebookItem, () => collectTool('notebook'));
  }

  // ---- テントから玄関までの導線を照らす作業灯 ----
  {
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x2d5c3f });
    const lensMat = new THREE.MeshLambertMaterial({ color: 0xfffbe0, emissive: 0xfffbe0, emissiveIntensity: 1.4 });

    function addLegBetween(group, from, to) {
      const dir = to.clone().sub(from);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, dir.length(), 6), legMat);
      leg.position.copy(from).add(to).multiplyScalar(0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      group.add(leg);
    }
    function addWorkLight(x, z, facingAngle) {
      const group = new THREE.Group();
      const hub = new THREE.Vector3(0, 0.55, 0);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        addLegBetween(group, hub, new THREE.Vector3(Math.cos(angle) * 0.4, 0, Math.sin(angle) * 0.4));
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 1.2, 8), legMat);
      pole.position.y = 1.15;
      group.add(pole);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), legMat);
      bar.position.y = 1.75;
      group.add(bar);
      [-0.18, 0.18].forEach(dx => {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.06), headMat);
        head.position.set(dx, 1.75, 0.045);
        group.add(head);
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.11), lensMat);
        lens.position.set(dx, 1.75, 0.076);
        group.add(lens);
      });
      group.position.set(x, 0, z);
      group.rotation.y = facingAngle;
      group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(group);
      const light = new THREE.PointLight(0xfff6e0, 6, 11);
      light.position.set(x, 1.75, z);
      scene.add(light);
      wallBoxes.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42 });
    }

    const tentDepthHalf = 2.25;
    const doorPoint = new THREE.Vector2(5.75, 0.0); // 玄関を出てすぐの位置(玄関ドアはZ=1)
    const tentEntrance = new THREE.Vector2(tentX, tentZ + tentDepthHalf + 1.0);
    const pathDir = tentEntrance.clone().sub(doorPoint).normalize();
    const pathPerp = new THREE.Vector2(-pathDir.y, pathDir.x);
    const pathFacing = Math.atan2(-pathDir.x, -pathDir.y);
    const pathStands = [0.2, 0.4, 0.6, 0.8].map((t, i) => {
      const base = doorPoint.clone().lerp(tentEntrance, t);
      const side = i % 2 === 0 ? 1 : -1;
      const p = base.addScaledVector(pathPerp, side * 1.2);
      return { x: p.x, z: p.y };
    });
    pathStands.forEach(p => addWorkLight(p.x, p.z, pathFacing));
  }

  // ---- 幽霊の出没部屋(Upstairs Hallwayは通路なので除外) ----
  const hauntableRooms = rooms.filter((r, i) => !r.hallway && rooms.findIndex(o => o.name === r.name) === i);
  initHaunting(hauntableRooms);
  setOrbRoom(room("Dining Room"));

  // ---- スポーン地点(テント入口を入ってすぐ。テントのdepth=4.5の手前寄り) ----
  camera.position.set(tentX, 1.6, tentZ + 4.5 / 2 - 1.0);
  camera.rotation.y = Math.PI;
}
