// ロビーの3D空間(画像のようなガレージ+ホワイトボードのある工房)を組み立てる。
// 画像ファイルは使わず、すべてコードで作る(テクスチャはcanvasで描く)。
// 座標はメートル。X=東西、Z=南北、Y=高さ。ガレージ(ホール)は X -9〜9 / Z -5〜5、工房は その西側(X -15〜-9.3)。
import * as THREE from 'three';

// ---------- 小道具 ----------
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// ---------- テクスチャ ----------
// 打ちっぱなしコンクリート(型枠の継ぎ目と、細かいムラ)
function concreteTexture(repeatX, repeatY, base = [128, 129, 131]) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rnd = makeRng(11);
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = Math.floor(rnd() * 60) - 30;
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
      ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5);
    }
    for (let i = 0; i < 22; i++) { // 横長の型枠の筋
      ctx.fillStyle = `rgba(0,0,0,${0.015 + rnd() * 0.035})`;
      ctx.fillRect(0, rnd() * h, w, 3 + rnd() * 18);
    }
    ctx.fillStyle = 'rgba(30,30,32,0.55)'; // 継ぎ目
    ctx.fillRect(0, 0, 3, h);
    ctx.fillRect(0, 0, w, 2);
  }, repeatX, repeatY);
}
// 磨いたコンクリートの床
function floorTexture(repeatX, repeatY, base = [96, 97, 100]) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rnd = makeRng(23);
    ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { // 大きなムラ
      const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 60 + rnd() * 120);
      g.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; // 目地
    ctx.strokeRect(0, 0, w, h);
  }, repeatX, repeatY);
}
// 木のスラット天井(縦縞の板)
function woodSlatTexture(repeatX, repeatY) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rnd = makeRng(37);
    const slat = 34;
    for (let x = 0; x < w; x += slat) {
      const t = rnd();
      ctx.fillStyle = `rgb(${150 + t * 40},${96 + t * 28},${56 + t * 18})`;
      ctx.fillRect(x, 0, slat - 3, h);
      for (let i = 0; i < 40; i++) { // 木目
        ctx.strokeStyle = `rgba(60,34,16,${0.05 + rnd() * 0.1})`;
        ctx.beginPath(); const gx = x + rnd() * (slat - 3);
        ctx.moveTo(gx, 0); ctx.lineTo(gx + (rnd() - 0.5) * 4, h); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(15,8,4,0.85)'; ctx.fillRect(x + slat - 3, 0, 3, h); // 板のすき間
    }
  }, repeatX, repeatY);
}
// レンガ(青い下壁/灰白の上壁に使い分ける)。baseは[r,g,b]
function brickTexture(base, repeatX, repeatY, seed) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    const rnd = makeRng(seed);
    ctx.fillStyle = '#16181a'; // 目地
    ctx.fillRect(0, 0, w, h);
    const bw = 64, bh = 32;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
        const v = (rnd() - 0.5) * 36;
        ctx.fillStyle = `rgb(${Math.max(0, base[0] + v)},${Math.max(0, base[1] + v)},${Math.max(0, base[2] + v)})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        for (let i = 0; i < 14; i++) { // 汚れ・かすれ
          ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
          ctx.fillRect(x + 2 + rnd() * bw, y + 2 + rnd() * bh, 2 + rnd() * 8, 1 + rnd() * 4);
        }
      }
    }
  }, repeatX, repeatY);
}
// ペルシャ風のラグ
function rugTexture() {
  return canvasTexture(512, 384, (ctx, w, h) => {
    const rnd = makeRng(53);
    ctx.fillStyle = '#4e1a18'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c9a56a'; ctx.lineWidth = 6; ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.strokeStyle = '#1b0d0b'; ctx.lineWidth = 10; ctx.strokeRect(34, 34, w - 68, h - 68);
    ctx.strokeStyle = '#a2693b'; ctx.lineWidth = 3; ctx.strokeRect(52, 52, w - 104, h - 104);
    for (let x = 70; x < w - 60; x += 28) { // 縁の模様
      for (const y of [24, h - 24]) { ctx.fillStyle = '#d8bb86'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.fill(); }
    }
    ctx.save(); ctx.translate(w / 2, h / 2); // 中央のメダリオン
    for (const [r, c] of [[110, '#2a1210'], [86, '#8c4a2a'], [58, '#d1b27a'], [30, '#2d1613']]) {
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.35, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < 1800; i++) { // すり切れ
      ctx.fillStyle = `rgba(20,10,8,${rnd() * 0.18})`;
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 3);
    }
  });
}
function clockTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0b1c33'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d4f8e'; ctx.beginPath(); ctx.arc(128, 150, 62, 0, Math.PI * 2); ctx.fill(); // 中の絵(ルート66風の盾)
    ctx.fillStyle = '#e8f1ff';
    for (let i = 0; i < 12; i++) { // 12の目盛り
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.arc(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108, i % 3 === 0 ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#e8f1ff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128, 62); ctx.stroke();   // 長針(12時)
    ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(80, 150); ctx.stroke();   // 短針
  });
}
function plateTexture(text) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1d3a68'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#1d3a68'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GHOST HUNT', w / 2, 38);
    ctx.font = 'bold 54px sans-serif'; ctx.fillText(text, w / 2, 98);
  });
}
function mapTexture() {
  return canvasTexture(256, 192, (ctx, w, h) => {
    const rnd = makeRng(71);
    ctx.fillStyle = '#d8d2bc'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60,70,90,0.55)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.moveTo(rnd() * w, rnd() * h); ctx.lineTo(rnd() * w, rnd() * h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(160,50,40,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(20, 150); ctx.bezierCurveTo(90, 40, 150, 160, 236, 40); ctx.stroke();
  });
}

// ---------- 車(横から見た輪郭を押し出した簡易モデル) ----------
function makeSportsCar(bodyColor, withSpoiler) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.35, roughness: 0.3 });
  // 輪郭(XY平面)。x=-2.3が鼻先(手前)、x=+2.3が後ろ。ボディは窓の下の高さまで(ベルトライン)
  const body = new THREE.Shape();
  body.moveTo(-2.3, 0.32);
  body.lineTo(-2.34, 0.52);
  body.quadraticCurveTo(-2.15, 0.7, -1.5, 0.78);   // ボンネット
  body.lineTo(-0.7, 0.92);
  body.lineTo(1.7, 0.96);
  body.quadraticCurveTo(2.2, 0.98, 2.35, 0.8);     // トランク
  body.lineTo(2.38, 0.6);
  body.lineTo(2.3, 0.32);
  body.lineTo(1.9, 0.3);
  body.absarc(1.5, 0.34, 0.44, Math.PI, 0, true);   // 後輪のアーチ
  body.lineTo(-1.0, 0.3);
  body.absarc(-1.5, 0.34, 0.44, Math.PI, 0, true);  // 前輪のアーチ
  body.lineTo(-2.3, 0.32);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 4, curveSegments: 14 });
  bodyGeo.translate(0, 0, -0.75);
  car.add(new THREE.Mesh(bodyGeo, paint));
  // キャビン(窓のかたまり)。ボディより少し細くして、暗いガラスにする
  const cabin = new THREE.Shape();
  cabin.moveTo(-0.72, 0.9);
  cabin.lineTo(-0.12, 1.27);
  cabin.quadraticCurveTo(0.4, 1.33, 1.0, 1.29);
  cabin.lineTo(1.72, 0.95);
  cabin.lineTo(-0.72, 0.9);
  const cabinGeo = new THREE.ExtrudeGeometry(cabin, { depth: 1.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 2 });
  cabinGeo.translate(0, 0, -0.61);
  car.add(new THREE.Mesh(cabinGeo, new THREE.MeshStandardMaterial({ color: 0x0b141c, metalness: 0.7, roughness: 0.1 })));
  // ルーフ(車体色)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.045, 1.3), paint);
  roof.position.set(0.45, 1.31, 0); roof.rotation.z = -0.02; car.add(roof);
  // タイヤ+ホイール
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.8, roughness: 0.3 });
  [[-1.5, 0.92], [-1.5, -0.92], [1.5, 0.92], [1.5, -0.92]].forEach(([x, z]) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 24), tireMat);
    tire.rotation.x = Math.PI / 2; tire.position.set(x, 0.36, z); car.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 18), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.36, z); car.add(rim);
  });
  // ライト
  const head = new THREE.MeshBasicMaterial({ color: 0xfff1cf }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  [0.6, -0.6].forEach(z => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), head); h.position.set(-2.4, 0.66, z); car.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.42), tail); t.position.set(2.42, 0.78, z); car.add(t);
  });
  if (withSpoiler) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 1.7), paint); sp.position.set(2.28, 1.18, 0); car.add(sp);
    [0.6, -0.6].forEach(z => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), paint); st.position.set(2.25, 1.07, z); car.add(st); });
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0x080808 }));
  under.position.set(0, 0.28, 0); car.add(under);
  return car;
}

// ---------- 空間全体 ----------
export function buildLobbySpace(scene) {
  const colliders = [];
  const add = (mesh) => { scene.add(mesh); return mesh; };
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return add(m); };
  const block = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ });

  const HALL = { minX: -9, maxX: 9, minZ: -5, maxZ: 5, h: 3.4 };
  const SHOP = { minX: -15, maxX: -9.3, minZ: -3.2, maxZ: 3.2, h: 3.4 };
  const T = 0.3; // 壁の厚み
  scene.background = new THREE.Color(0x0b0d10);

  // ---- 素材 ----
  const concreteMat = (rx, ry) => new THREE.MeshStandardMaterial({ map: concreteTexture(rx, ry), roughness: 0.92, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(9, 5), roughness: 0.4, metalness: 0.15 });
  const ceilingMat = new THREE.MeshStandardMaterial({ map: woodSlatTexture(6, 1), roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 });

  // ---- ガレージ(ホール) ----
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), floorMat);
  hallFloor.rotation.x = -Math.PI / 2; hallFloor.position.set(0, 0, 0); add(hallFloor);
  const hallCeil = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), ceilingMat);
  hallCeil.rotation.x = Math.PI / 2; hallCeil.position.set(0, HALL.h, 0); add(hallCeil);
  // 壁(北・南・東)
  box(18.6, HALL.h, T, concreteMat(5, 1), 0, HALL.h / 2, -5.15);
  box(18.6, HALL.h, T, concreteMat(5, 1), 0, HALL.h / 2, 5.15);
  box(T, HALL.h, 10.6, concreteMat(3, 1), 9.15, HALL.h / 2, 0);
  // 西の壁(工房への出入口 Z -1.5〜1.5 を開ける)
  box(T, HALL.h, 3.8, concreteMat(1, 1), -9.15, HALL.h / 2, -3.4);
  box(T, HALL.h, 3.8, concreteMat(1, 1), -9.15, HALL.h / 2, 3.4);
  box(T, 0.8, 3.0, concreteMat(1, 1), -9.15, HALL.h - 0.4, 0);

  // 北の壁の大きなガラス扉(画像の左側にある、暗いガラスの縦長の扉)
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0e1012, roughness: 0.5, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x10202c, roughness: 0.08, metalness: 0.85 });
  box(0.12, 2.9, 0.1, frameMat, -6.3, 1.45, -4.96);
  box(0.12, 2.9, 0.1, frameMat, -3.3, 1.45, -4.96);
  box(3.0, 0.12, 0.1, frameMat, -4.8, 2.9, -4.96);
  box(2.88, 2.8, 0.04, glassMat, -4.8, 1.44, -4.98);
  box(0.06, 2.8, 0.11, frameMat, -4.8, 1.44, -4.96);
  // 南の壁の奥まった開口(画像右側の、暗い凹み)
  [[3.4, 2.2], [6.6, 2.2]].forEach(([x, w]) => {
    box(w, 2.6, 0.3, darkMat, x, 1.3, 4.98);
    box(w + 0.2, 0.08, 0.34, frameMat, x, 2.63, 4.98);
  });
  // 東の壁の上の方に細長い木のパネル
  box(0.06, 0.5, 8.0, new THREE.MeshStandardMaterial({ map: woodSlatTexture(4, 1), roughness: 0.7 }), 8.96, 2.6, 0);

  // 床の光の帯(画像の、斜めに並ぶ光るタイル)
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff });
  for (let i = 0; i < 6; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.38), stripMat);
    strip.position.set(-7.4 + i * 1.12, 0.012, -0.9 + i * 0.38);
    strip.rotation.y = -0.32; add(strip);
  }
  // 天井のダウンライト
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xfff1d8 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), spotMat);
    d.rotation.x = Math.PI / 2; d.position.set(-6.5 + i * 4.3, HALL.h - 0.01, -3 + j * 3); add(d);
  }

  // 車(奥=東側に2台。鼻先を西=入口側に向ける)
  const orange = makeSportsCar(0xe8761a, true);
  orange.position.set(5.6, 0, 1.7); orange.rotation.y = 0.16; add(orange);
  const red = makeSportsCar(0xb41a1a, false);
  red.position.set(5.0, 0, -2.1); red.rotation.y = -0.08; add(red);
  block(2.9, 8.4, 0.2, 3.3);       // オレンジの車
  block(2.3, 7.7, -3.4, -0.8);     // 赤い車

  // ホールの照明
  scene.add(new THREE.AmbientLight(0x9aa8b8, 1.1));
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x40362c, 0.9));
  [[-5, 0], [0, 0], [5, 0]].forEach(([x, z]) => {
    const p = new THREE.PointLight(0xffe2b8, 34, 15, 2); p.position.set(x, 2.5, z); scene.add(p);
  });
  const carSpot = new THREE.SpotLight(0xffffff, 140, 14, 0.55, 0.6, 2);
  carSpot.position.set(1, 3.3, 0); carSpot.target.position.set(5.4, 0.6, 0); scene.add(carSpot, carSpot.target);

  // ---- 工房(2枚目の画像) ----
  const shopFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.7, 6.4), new THREE.MeshStandardMaterial({ map: floorTexture(3, 3, [64, 66, 70]), roughness: 0.85 }));
  shopFloor.rotation.x = -Math.PI / 2; shopFloor.position.set(-12.15, 0, 0); add(shopFloor);
  const doorFloor = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 3), floorMat);
  doorFloor.rotation.x = -Math.PI / 2; doorFloor.position.set(-9.15, 0.001, 0); add(doorFloor);
  const shopCeil = new THREE.Mesh(new THREE.PlaneGeometry(6.3, 7), new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.9 }));
  shopCeil.rotation.x = Math.PI / 2; shopCeil.position.set(-12.15, SHOP.h, 0); add(shopCeil);

  // レンガ1個が約23cm×11.5cmになるよう、壁の大きさに合わせて繰り返し数を決める(テクスチャ1枚=横8個×縦8段=1.84m×0.92m)
  const BLUE = [26, 62, 98], GRAY = [128, 129, 126];
  const blueBrick = new THREE.MeshStandardMaterial({ map: brickTexture(BLUE, 6.6 / 1.84, SHOP.h / 0.92, 5), roughness: 0.95 });
  const blueBrickLow = new THREE.MeshStandardMaterial({ map: brickTexture(BLUE, 7 / 1.84, 1.3 / 0.92, 6), roughness: 0.95 });
  const grayBrick = new THREE.MeshStandardMaterial({ map: brickTexture(GRAY, 7 / 1.84, (SHOP.h - 1.3) / 0.92, 7), roughness: 0.95 });
  // 北・南の壁は青いレンガ
  box(6.6, SHOP.h, T, blueBrick, -12.15, SHOP.h / 2, -3.35);
  box(6.6, SHOP.h, T, blueBrick, -12.15, SHOP.h / 2, 3.35);
  // 奥の壁(ホワイトボードの壁)は、下半分が青、上が灰白のレンガ
  box(T, 1.3, 7.0, blueBrickLow, -15.15, 0.65, 0);
  box(T, SHOP.h - 1.3, 7.0, grayBrick, -15.15, 1.3 + (SHOP.h - 1.3) / 2, 0);

  // ホワイトボード(中身は lobby.js がcanvasに描く)
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1280; boardCanvas.height = 672;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const BW = 4.4, BH = 2.31;
  box(0.08, BH + 0.2, BW + 0.2, new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.4 }), -14.96, 2.15, 0);
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: boardTex, color: 0xe6eaee }));
  boardMesh.rotation.y = Math.PI / 2; boardMesh.position.set(-14.915, 2.15, 0); add(boardMesh);
  box(0.06, 0.06, 0.9, darkMat, -14.9, 0.98, 0.7); // ペン置き

  // 机(白い机+引き出し)とラジオ
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.55 });
  box(0.75, 0.06, 1.6, white, -14.1, 0.8, 0.5);
  [[-0.65, 0.5], [0.65, -0.5]].forEach(() => {});
  [[-14.35, -0.2], [-14.35, 1.2], [-13.85, -0.2], [-13.85, 1.2]].forEach(([x, z]) => box(0.06, 0.78, 0.06, white, x, 0.39, z));
  box(0.6, 0.18, 0.34, white, -14.1, 0.62, -0.05);  // 引き出し
  box(0.6, 0.18, 0.34, white, -14.1, 0.62, 1.05);
  box(0.26, 0.15, 0.42, new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.6 }), -14.1, 0.9, 0.92); // ラジオ
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6), darkMat);
  antenna.position.set(-14.1, 1.12, 1.05); antenna.rotation.x = 0.5; add(antenna);
  box(0.16, 0.025, 0.1, darkMat, -14.1, 0.845, 0.3); // 小さな機器
  // 机の下の白い缶と段ボール
  [[-14.0, -0.05], [-14.0, 0.4], [-14.0, 0.85]].forEach(([x, z], i) => {
    const can = box(0.3, 0.42 + (i % 2) * 0.04, 0.3, new THREE.MeshStandardMaterial({ color: 0xdadad6, roughness: 0.6 }), x, 0.22, z + 0.2);
  });
  box(0.7, 0.55, 0.55, new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 }), -14.5, 0.28, -1.0);
  box(0.65, 0.45, 0.5, new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 }), -14.5, 0.78, -1.0);
  block(-15, -13.7, -1.4, -0.6);  // 段ボール
  block(-14.5, -13.65, -0.35, 1.4); // 机

  // ラグ
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.rotation.z = 0.06; rug.position.set(-12.0, 0.012, 0.1); add(rug);

  // ネオンの壁掛け時計(北の壁・左上)
  const clockGroup = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ map: clockTexture() }));
  clockGroup.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 10, 40), new THREE.MeshBasicMaterial({ color: 0x9fe4ff }));
  clockGroup.add(ring);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 28), new THREE.MeshStandardMaterial({ color: 0x15171a }));
  back.rotation.x = Math.PI / 2; back.position.z = -0.05; clockGroup.add(back);
  clockGroup.position.set(-14.0, 2.75, -3.16); add(clockGroup);
  // 壁の地図・ナンバープレート
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ map: mapTexture(), color: 0xc8c8c8 }));
  mapMesh.position.set(-12.9, 1.75, -3.19); add(mapMesh);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.28), new THREE.MeshBasicMaterial({ map: plateTexture('6DZG261'), color: 0xcccccc }));
  plate.rotation.y = Math.PI; plate.position.set(-12.2, 1.9, 3.19); add(plate);

  // スチール棚(塗料缶・赤い工具箱)。北の壁沿いに置き、西の壁のホワイトボードにかからないよう奥行きは0.6m
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.5, metalness: 0.6 });
  const SH = { minX: -14.5, maxX: -12.9, z: -2.85 }; // 棚の範囲(Xの幅1.6m、中心Z)
  [SH.minX, SH.maxX].forEach(x => [SH.z - 0.28, SH.z + 0.28].forEach(z => box(0.05, 2.0, 0.05, metal, x, 1.0, z)));
  [0.3, 0.95, 1.6].forEach(y => box(SH.maxX - SH.minX, 0.05, 0.6, metal, (SH.minX + SH.maxX) / 2, y, SH.z));
  const labelColors = [0x2c5db0, 0xb83a2a, 0xe0b83a, 0x3a8a4a, 0xd8d8d0];
  for (let s2 = 0; s2 < 3; s2++) for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22 + (k % 2) * 0.05, 14), new THREE.MeshStandardMaterial({ color: labelColors[(s2 + k) % 5], roughness: 0.55, metalness: 0.2 }));
    c.position.set(SH.minX + 0.25 + k * 0.38, 0.43 + s2 * 0.65, SH.z + (k % 2 ? 0.08 : -0.08)); add(c);
  }
  box(0.7, 0.4, 0.4, new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.5, metalness: 0.4 }), -13.7, 1.83, SH.z); // 赤い工具箱
  block(SH.minX - 0.1, SH.maxX + 0.1, SH.z - 0.35, SH.z + 0.35); // 棚

  // 黄色いバケツ(出入口の南側の隅)
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.7, 24), new THREE.MeshStandardMaterial({ color: 0xd9a62a, roughness: 0.6 }));
  bucket.position.set(-9.95, 0.35, 2.55); add(bucket);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.5 }));
  lid.position.set(-9.95, 0.72, 2.55); add(lid);
  block(-10.4, -9.5, 2.1, 3.0);

  // 工房の照明(冷たい青い光+ボードを照らす白い光)
  const blue = new THREE.PointLight(0x6aa8ff, 26, 9, 2); blue.position.set(-12.5, 2.8, -1.2); scene.add(blue);
  const blue2 = new THREE.PointLight(0x5a98ee, 20, 8, 2); blue2.position.set(-13.2, 2.7, 2.0); scene.add(blue2);
  const coolWhite = new THREE.PointLight(0xdbe8ff, 14, 7, 2); coolWhite.position.set(-11.0, 2.4, 0); scene.add(coolWhite);

  // 歩ける範囲(長方形の合体。出入口の通路も含む)
  const walkable = [
    { minX: HALL.minX, maxX: HALL.maxX, minZ: HALL.minZ, maxZ: HALL.maxZ },
    { minX: SHOP.minX, maxX: SHOP.maxX, minZ: SHOP.minZ, maxZ: SHOP.maxZ },
    { minX: -9.3, maxX: -9.0, minZ: -1.5, maxZ: 1.5 },
  ];
  return {
    colliders, walkable,
    spawn: { x: -6.5, z: 2.6, rotY: -Math.PI / 2 }, // ホールの西寄りから、奥(東)の車の方を向いて始まる(カメラのrotation.yが-π/2で+X向き)
    whiteboard: { mesh: boardMesh, canvas: boardCanvas, texture: boardTex },
    clock: clockGroup,
  };
}

// ---------- 歩行(壁・家具との当たり判定) ----------
export const PLAYER_RADIUS = 0.3;
// 立てる位置か。体の四隅が、歩ける範囲(長方形の合体)の中にあり、かつ家具などの箱にぶつかっていないこと
export function canStand(space, x, z) {
  const r = PLAYER_RADIUS;
  const inside = (px, pz) => space.walkable.some(w => px >= w.minX && px <= w.maxX && pz >= w.minZ && pz <= w.maxZ);
  if (!inside(x - r, z - r) || !inside(x + r, z - r) || !inside(x - r, z + r) || !inside(x + r, z + r)) return false;
  return !space.colliders.some(c => x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ);
}
// (x, z)から(dx, dz)だけ動く。ぶつかる方向だけ止めて、壁に沿って滑れるようにする
export function moveWithCollision(space, x, z, dx, dz) {
  let nx = x, nz = z;
  if (canStand(space, x + dx, z)) nx = x + dx;
  if (canStand(space, nx, z + dz)) nz = z + dz;
  return [nx, nz];
}
