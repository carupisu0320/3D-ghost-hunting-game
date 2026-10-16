// Sunny Meadows の「雰囲気」(見た目)。荒れた廃病院らしい、壁・床・天井の質感と、壁や床の汚れ・血痕・ひっかき傷。
// 照明(部屋の灯り・全体照明・霧)には触らない。明るさの平均は、これまでの壁・床とほぼ同じになるようにしてある。
// 模様は、乱数の種を固定した手続き的テクスチャ(画像ファイルなし)。毎回・全員が同じ見た目になる。
// 雰囲気を変えたいときは、このファイルの色(# で始まる文字列)と、sunny-meadows-decal-plan.js の DECAL_COUNTS(汚れの量)を書き換える。
// 汚れの「どこに貼るか」の計算は sunny-meadows-decal-plan.js(three.js なし・検査あり)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DECAL, mulberry32 } from './sunny-meadows-decal-plan.js';

export const WALL_TILE_M = 3.0;                       // 壁の模様1枚の横幅(m)。高さは壁の高さ(3m)ぴったり

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function finish(canvas, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// 左右の端でつながるように、円形のしみを、端をまたぐときは反対側にも描く
function blot(ctx, S, x, y, r, rgba, squash = 1) {
  [-S, 0, S].forEach((ox) => {
    if (x + ox + r < 0 || x + ox - r > S) return;
    const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
    g.addColorStop(0, rgba(1)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x + ox, y, r, r * squash, 0, 0, Math.PI * 2); ctx.fill();
  });
}
function speckle(ctx, rnd, S, count, amp) {
  for (let i = 0; i < count; i++) {
    const v = (rnd() - 0.5) * amp;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
}
function crack(ctx, rnd, x, y, len, alpha = 0.5) {
  ctx.strokeStyle = `rgba(20,18,14,${alpha})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (let i = 0; i < len; i += 6) { x += (rnd() - 0.5) * 10; y += 3 + rnd() * 6; ctx.lineTo(x, y); }
  ctx.stroke();
}

// ---- 壁: 上は黄ばんだ漆喰、下(1.3mまで)は色あせた緑のペンキ。はがれ・水のしみ・カビ・ひび ----
export function makeAsylumWallTexture() {
  const S = 512, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(1001);
  const rail = Math.round(S * 0.57);
  ctx.fillStyle = '#98947f'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#4e5e53'; ctx.fillRect(0, rail, S, S - rail);
  speckle(ctx, rnd, S, 5000, 26);
  for (let i = 0; i < 9; i++) { // 上から垂れる水のしみ
    const x = rnd() * S, h = 60 + rnd() * 170;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(90,64,30,0.38)'); g.addColorStop(1, 'rgba(90,64,30,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 6 - rnd() * 10, 0, 12 + rnd() * 20, h);
  }
  for (let i = 0; i < 7; i++) blot(ctx, S, rnd() * S, rnd() * rail, 30 + rnd() * 50, (a) => `rgba(110,84,40,${0.22 * a})`, 0.7);
  for (let i = 0; i < 14; i++) { // ペンキのはがれ(下の漆喰が見える)
    const x = rnd() * S, y = rail + 14 + rnd() * (S - rail - 30), w = 14 + rnd() * 40, h = 10 + rnd() * 30;
    ctx.fillStyle = rnd() > 0.4 ? '#8d8c78' : '#6f6a56';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + rnd() * 8); ctx.lineTo(x + w * 0.8, y + h); ctx.lineTo(x + rnd() * 6, y + h * 0.8); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 10; i++) blot(ctx, S, rnd() * S, S - rnd() * 90, 20 + rnd() * 40, (a) => `rgba(14,22,14,${0.35 * a})`, 0.8); // 床ぎわのカビ・汚れ
  const g = ctx.createLinearGradient(0, S - 70, 0, S);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, S - 70, S, 70);
  ctx.fillStyle = 'rgba(25,30,24,0.9)'; ctx.fillRect(0, rail - 2, S, 5);       // ペンキの境目の線
  ctx.fillStyle = 'rgba(190,200,180,0.25)'; ctx.fillRect(0, rail + 3, S, 2);
  for (let i = 0; i < 6; i++) crack(ctx, rnd, rnd() * S, rnd() * rail * 0.7, 40 + rnd() * 90);
  return finish(canvas);
}

// ---- 床 ----
export function makeAsylumTileTexture() { // 廊下・水回り: 白と灰色の市松のタイル(2mに4×4枚)。ひび・汚れ・欠け
  const S = 512, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(2002), n = 4, c = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = (i + j) % 2 ? '#a8a494' : '#cdc8b8'; ctx.fillRect(i * c, j * c, c, c); }
  ctx.strokeStyle = 'rgba(30,28,22,0.55)'; ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * c, 0); ctx.lineTo(i * c, S); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * c); ctx.lineTo(S, i * c); ctx.stroke(); }
  speckle(ctx, rnd, S, 3500, 22);
  for (let i = 0; i < 10; i++) blot(ctx, S, rnd() * S, rnd() * S, 25 + rnd() * 55, (a) => `rgba(60,44,24,${0.22 * a})`, 0.7);
  for (let i = 0; i < 5; i++) blot(ctx, S, rnd() * S, rnd() * S, 18 + rnd() * 30, (a) => `rgba(70,10,8,${0.22 * a})`, 0.8);
  for (let i = 0; i < 9; i++) crack(ctx, rnd, rnd() * S, rnd() * S, 50 + rnd() * 80, 0.55);
  for (let i = 0; i < 5; i++) { const x = Math.floor(rnd() * n) * c, y = Math.floor(rnd() * n) * c; ctx.fillStyle = 'rgba(40,36,28,0.5)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 28, y); ctx.lineTo(x, y + 22); ctx.closePath(); ctx.fill(); } // 欠けた角
  return finish(canvas);
}
export function makeAsylumWoodTexture() { // 部屋: すり減った暗い木の床。汚れ・傷・黒ずみ
  const S = 512, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(3003), planks = 8, ph = S / planks;
  ctx.fillStyle = '#5a4632'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < planks; i++) {
    const shade = (rnd() - 0.5) * 44;
    ctx.fillStyle = shade > 0 ? `rgba(255,240,220,${shade / 255})` : `rgba(0,0,0,${-shade / 255})`; ctx.fillRect(0, i * ph, S, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, i * ph); ctx.lineTo(S, i * ph); ctx.stroke();
    const j = rnd() * S; ctx.beginPath(); ctx.moveTo(j, i * ph); ctx.lineTo(j, (i + 1) * ph); ctx.stroke(); // 板のつなぎ目
  }
  for (let i = 0; i < 420; i++) { ctx.strokeStyle = `rgba(0,0,0,${rnd() * 0.1})`; const y = rnd() * S; ctx.beginPath(); ctx.moveTo(rnd() * 380, y); ctx.lineTo(rnd() * 380 + 80, y + (rnd() * 4 - 2)); ctx.stroke(); }
  for (let i = 0; i < 12; i++) blot(ctx, S, rnd() * S, rnd() * S, 30 + rnd() * 60, (a) => `rgba(14,10,6,${0.3 * a})`, 0.7);
  for (let i = 0; i < 6; i++) blot(ctx, S, rnd() * S, rnd() * S, 16 + rnd() * 28, (a) => `rgba(80,12,10,${0.3 * a})`, 0.8);
  speckle(ctx, rnd, S, 2500, 18);
  return finish(canvas);
}
export function makeAsylumConcreteTexture() { // 地下: 湿ったコンクリート。錆の筋・黒い水たまりのしみ・ひび
  const S = 512, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(4004);
  ctx.fillStyle = '#6c6e6c'; ctx.fillRect(0, 0, S, S);
  speckle(ctx, rnd, S, 5000, 30);
  for (let i = 0; i < 10; i++) blot(ctx, S, rnd() * S, rnd() * S, 30 + rnd() * 70, (a) => `rgba(20,28,30,${0.32 * a})`, 0.65); // 湿ったしみ
  for (let i = 0; i < 8; i++) { const x = rnd() * S, h = 50 + rnd() * 140; const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(120,60,24,0.35)'); g.addColorStop(1, 'rgba(120,60,24,0)'); ctx.fillStyle = g; ctx.fillRect(x, rnd() * S, 6 + rnd() * 10, h); } // 錆の筋
  for (let i = 0; i < 4; i++) blot(ctx, S, rnd() * S, rnd() * S, 18 + rnd() * 26, (a) => `rgba(70,8,6,${0.3 * a})`, 0.8);
  for (let i = 0; i < 10; i++) crack(ctx, rnd, rnd() * S, rnd() * S, 70 + rnd() * 110, 0.6);
  return finish(canvas);
}
export function makeAsylumCeilingTexture() { // 天井: 黄ばんだ白。雨漏りのしみの輪・カビ
  const S = 512, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(5005);
  ctx.fillStyle = '#bab7ab'; ctx.fillRect(0, 0, S, S);
  speckle(ctx, rnd, S, 3000, 18);
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 60;
    blot(ctx, S, x, y, r, (a) => `rgba(110,84,40,${0.3 * a})`, 0.8);
    ctx.strokeStyle = 'rgba(80,58,26,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * 0.64, 0, 0, Math.PI * 2); ctx.stroke(); // しみの縁の輪
  }
  for (let i = 0; i < 6; i++) blot(ctx, S, rnd() * S, rnd() * S, 18 + rnd() * 30, (a) => `rgba(24,30,20,${0.3 * a})`, 0.8);
  return finish(canvas);
}

// ---- 壁の模様の座標(UV)を、壁の大きさにかかわらず、同じ縮尺にそろえる ----
// 箱の面ごとに、横は「世界の座標 / WALL_TILE_M」、縦は「階の床からの高さ / 壁の高さ」にする。長い壁も短い壁も、同じ模様の大きさになる。
export function remapWallUVs(geometries, wallHeight = 3) {
  geometries.forEach((g) => {
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    g.computeBoundingBox();
    const base = wallHeight * Math.floor((g.boundingBox.min.y + 0.01) / wallHeight); // その壁が立っている階の床の高さ(1階は0、地下は-3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
      if (ay > 0.5) uv.setXY(i, x / WALL_TILE_M, z / WALL_TILE_M);
      else if (ax > 0.5) uv.setXY(i, z / WALL_TILE_M, (y - base) / wallHeight);
      else uv.setXY(i, x / WALL_TILE_M, (y - base) / wallHeight);
    }
    uv.needsUpdate = true;
  });
}

// ---- 汚れ・血痕・ひっかき傷(デカール)の絵と、メッシュ作り ----
// 1枚の絵(4×4の升目)に、汚れの種類を並べて、壁や床に貼る板から参照する。全部で1つのメッシュ(描画1回)。
export function makeDecalAtlas() {
  const S = 512, c = S / 4, [canvas, ctx] = makeCanvas(S, S), rnd = mulberry32(6006);
  const cell = (i, draw) => { ctx.save(); ctx.translate((i % 4) * c, Math.floor(i / 4) * c); ctx.beginPath(); ctx.rect(0, 0, c, c); ctx.clip(); draw(); ctx.restore(); };
  const rg = (x, y, r, rgb, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  cell(DECAL.blood, () => { // 垂れた血
    rg(64, 30, 34, '110,6,6', 0.85);
    for (let i = 0; i < 6; i++) { const x = 40 + rnd() * 48, len = 40 + rnd() * 80, g = ctx.createLinearGradient(0, 30, 0, 30 + len); g.addColorStop(0, 'rgba(100,4,4,0.9)'); g.addColorStop(1, 'rgba(100,4,4,0)'); ctx.fillStyle = g; ctx.fillRect(x - 2.5, 30, 5, len); rg(x, 30 + len * 0.9, 4, '100,4,4', 0.7); }
  });
  cell(DECAL.hands, () => { // 血の手形(2つ)
    [[44, 70, -0.2], [86, 54, 0.25]].forEach(([x, y, rot]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = 'rgba(105,6,6,0.8)';
      ctx.beginPath(); ctx.ellipse(0, 12, 17, 20, 0, 0, Math.PI * 2); ctx.fill();
      [[-15, -10, 5, 18], [-6, -20, 5, 22], [4, -22, 5, 24], [14, -14, 5, 20]].forEach(([fx, fy, fw, fh]) => { ctx.beginPath(); ctx.ellipse(fx, fy, fw, fh / 2, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.beginPath(); ctx.ellipse(-20, 14, 5, 12, -0.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
  });
  cell(DECAL.pool, () => { // 血だまり(床用)
    rg(64, 64, 56, '84,4,4', 0.85); rg(50, 58, 30, '60,2,2', 0.7);
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = 36 + rnd() * 20; rg(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + rnd() * 6, '84,4,4', 0.7); }
  });
  cell(DECAL.claws, () => { // ひっかき傷(4本)
    for (let i = 0; i < 4; i++) { const x0 = 30 + i * 18; ctx.strokeStyle = 'rgba(30,26,20,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, 14); ctx.quadraticCurveTo(x0 + 14, 60, x0 + 6, 116); ctx.stroke(); ctx.strokeStyle = 'rgba(200,190,160,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 3, 14); ctx.quadraticCurveTo(x0 + 17, 60, x0 + 9, 116); ctx.stroke(); }
  });
  cell(DECAL.mold, () => { rg(64, 64, 52, '14,22,12', 0.75); for (let i = 0; i < 12; i++) rg(64 + (rnd() - 0.5) * 80, 64 + (rnd() - 0.5) * 80, 10 + rnd() * 14, '10,18,10', 0.55); });
  cell(DECAL.streak, () => { for (let i = 0; i < 5; i++) { const x = 30 + rnd() * 70, g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(84,60,26,0.55)'); g.addColorStop(1, 'rgba(84,60,26,0)'); ctx.fillStyle = g; ctx.fillRect(x, 0, 6 + rnd() * 10, 90 + rnd() * 38); } });
  cell(DECAL.tally, () => { // 壁の「正」ならぬ、数えた線
    ctx.strokeStyle = 'rgba(40,34,28,0.85)'; ctx.lineWidth = 3;
    for (let g = 0; g < 3; g++) { for (let i = 0; i < 4; i++) { const x = 16 + g * 38 + i * 7; ctx.beginPath(); ctx.moveTo(x, 38 + g * 6); ctx.lineTo(x + 1, 80 + g * 6); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(12 + g * 38, 74 + g * 6); ctx.lineTo(48 + g * 38, 44 + g * 6); ctx.stroke(); }
  });
  cell(DECAL.crack, () => { crack(ctx, rnd, 64, 4, 120, 0.8); crack(ctx, rnd, 64, 50, 70, 0.7); });
  cell(DECAL.grime, () => { rg(64, 64, 60, '20,18,14', 0.55); for (let i = 0; i < 6; i++) rg(64 + (rnd() - 0.5) * 70, 64 + (rnd() - 0.5) * 70, 14 + rnd() * 18, '18,16,12', 0.4); });
  cell(DECAL.flake, () => { ctx.fillStyle = 'rgba(176,172,150,0.9)'; ctx.strokeStyle = 'rgba(40,36,28,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, 40); ctx.lineTo(90, 26); ctx.lineTo(108, 70); ctx.lineTo(74, 104); ctx.lineTo(34, 90); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  cell(DECAL.rust, () => { for (let i = 0; i < 4; i++) { const x = 30 + rnd() * 70, g = ctx.createLinearGradient(0, 10, 0, 128); g.addColorStop(0, 'rgba(130,64,26,0.7)'); g.addColorStop(1, 'rgba(130,64,26,0)'); ctx.fillStyle = g; ctx.fillRect(x, 10, 4 + rnd() * 6, 70 + rnd() * 50); } rg(64, 12, 22, '120,58,22', 0.6); });
  return finish(canvas, false);
}

// 汚れを、1つのメッシュにして返す(階の床の高さを、floorY で渡す)
export function buildDecalMesh(decals, floorY, atlas) {
  const geos = decals.map((d) => {
    const g = new THREE.PlaneGeometry(d.size, d.size);
    const uv = g.attributes.uv, col = d.kind % 4, row = Math.floor(d.kind / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, 1 - (row + 1 - uv.getY(i)) / 4);
    const y0 = floorY(d.floor);
    if (d.plane === 'floor') {
      g.rotateX(-Math.PI / 2); g.rotateY(d.rot);
      g.translate(d.x, y0 + 0.045, d.z);
    } else {
      const off = 0.1 + 0.004;
      if (d.axis === 'x') { if (d.side < 0) g.rotateY(Math.PI); g.translate(d.t, y0 + d.y, d.fixed + d.side * off); }
      else { g.rotateY(d.side > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(d.fixed + d.side * off, y0 + d.y, d.t); }
    }
    return g;
  });
  if (geos.length === 0) return null;
  const mat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.receiveShadow = true; mesh.renderOrder = 1;
  return mesh;
}

// ---- ドア: 病院らしい、緑がかった鉄のドア(覗き窓・蹴り板・番号札・はがれと錆)。一軒家の茶色い木のドアと区別する ----
// 模様は、ドアの板1枚ぶん(128×256)。覗き窓は、目の高さ(ドアの上から0.4〜0.9m)。表と裏で左右が反転しても同じに見えるよう、左右対称に描く
export function makeAsylumDoorTexture() {
  const W = 128, H = 256, [canvas, ctx] = makeCanvas(W, H), rnd = mulberry32(8008);
  ctx.fillStyle = '#4f6155'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) { ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)'; ctx.fillRect(rnd() * W, 0, 1 + rnd() * 2, H); } // 刷毛目
  for (let i = 0; i < 1400; i++) { const v = (rnd() - 0.5) * 26; ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`; ctx.fillRect(rnd() * W, rnd() * H, 2, 2); }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, W - 10, H - 10); // 縁の段
  ctx.strokeStyle = 'rgba(190,205,190,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(8, 8, W - 16, H - 16);
  for (let i = 0; i < 16; i++) { // ペンキのはがれ(下は、さびた鉄)
    const x = rnd() < 0.5 ? 4 + rnd() * 22 : W - 26 + rnd() * 22, y = 8 + rnd() * 200, w = 6 + rnd() * 16, h = 5 + rnd() * 14;
    ctx.fillStyle = rnd() > 0.35 ? '#6e4a34' : '#8a8c80';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + rnd() * 4); ctx.lineTo(x + w * 0.8, y + h); ctx.lineTo(x + rnd() * 3, y + h * 0.8); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < 6; i++) { const x = 14 + rnd() * 100, h = 40 + rnd() * 70, g = ctx.createLinearGradient(0, 214 - h, 0, 214); g.addColorStop(0, 'rgba(120,60,24,0)'); g.addColorStop(1, 'rgba(120,60,24,0.5)'); ctx.fillStyle = g; ctx.fillRect(x, 214 - h, 3 + rnd() * 5, h); } // さびの筋
  ctx.fillStyle = '#707876'; ctx.fillRect(7, 214, W - 14, 35);                       // 蹴り板
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(7, 214, W - 14, 35);
  ctx.fillStyle = '#3a3f3e'; [[14, 221], [W - 14, 221], [14, 242], [W - 14, 242]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#262e2c'; ctx.fillRect(33, 44, 62, 74);                          // 覗き窓(枠)
  ctx.fillStyle = '#0f1719'; ctx.fillRect(39, 50, 50, 62);                          // ガラス
  ctx.strokeStyle = 'rgba(150,170,165,0.5)'; ctx.lineWidth = 1;                     // 網入りガラスの格子
  for (let k = -70; k < 70; k += 9) { ctx.beginPath(); ctx.moveTo(39, 50 + k + 62); ctx.lineTo(89, 50 + k + 12); ctx.stroke(); ctx.beginPath(); ctx.moveTo(39, 50 + k); ctx.lineTo(89, 50 + k + 50); ctx.stroke(); }
  ctx.save(); ctx.beginPath(); ctx.rect(39, 50, 50, 62); ctx.clip(); ctx.fillStyle = 'rgba(180,200,200,0.08)'; ctx.beginPath(); ctx.moveTo(39, 50); ctx.lineTo(70, 50); ctx.lineTo(39, 100); ctx.closePath(); ctx.fill(); ctx.restore(); // 光の反射
  ctx.fillStyle = '#c9c5b0'; ctx.fillRect(48, 20, 32, 14);                          // 番号札
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(48, 20, 32, 14);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(54, 24, 4, 6); ctx.fillRect(62, 24, 4, 6); ctx.fillRect(70, 24, 4, 6);
  for (let i = 0; i < 5; i++) blot(ctx, W, rnd() * W, rnd() * H, 12 + rnd() * 22, (a) => `rgba(20,16,10,${0.3 * a})`, 0.8); // 汚れ
  for (let i = 0; i < 2; i++) blot(ctx, W, rnd() * W, 100 + rnd() * 100, 8 + rnd() * 12, (a) => `rgba(70,8,6,${0.3 * a})`, 0.9);   // 血のしみ
  return finish(canvas, false);
}

// doors(エンジンの、ドアの一覧)のドアの板と取っ手の材質を、病院のドアに替える。壁を組み立てたあと(ドアが作られたあと)に呼ぶ。
// 板 = hinge の最初の子、取っ手 = 残りの子(engine/walls.js の addDoor の作り)。ドア枠は、別の材質(マップ側で渡す)
export function applyAsylumDoors(doors) {
  const panel = new THREE.MeshLambertMaterial({ map: makeAsylumDoorTexture() });
  const handle = new THREE.MeshLambertMaterial({ color: 0xaab0ad }); // 明るい鉄のレバー
  let n = 0;
  doors.forEach((d) => d.hinge.children.forEach((c, i) => { if (c.isMesh) { c.material = i === 0 ? panel : handle; n++; } }));
  return n;
}
