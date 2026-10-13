// 手続き的テクスチャ(画像ファイルを使わず、その場で模様を描く)。壁・床・ドア・草などの模様の作り方は、ここにある。
// engine.js から分けたファイル。
import * as THREE from 'three';

// ---- 手続き的テクスチャ(画像ファイルを使わず、その場で模様を描く) ----
function makeWoodTexture(baseColor = '#8a6642') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  const plankCount = 6;
  const plankH = 256 / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const shade = (Math.random() - 0.5) * 40;
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade / 255})` : `rgba(0,0,0,${-shade / 255})`;
    ctx.fillRect(0, i * plankH, 256, plankH);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, i * plankH);
    ctx.lineTo(256, i * plankH);
    ctx.stroke();
  }
  for (let i = 0; i < 250; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 200, y);
    ctx.lineTo(Math.random() * 200 + 40, y + (Math.random() * 4 - 2));
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeTileTexture(baseColor = '#d9d4c8') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  const gridSize = 4;
  const cell = 256 / gridSize;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= gridSize; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(256, i * cell); ctx.stroke();
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeWallTexture(baseColor = '#767676') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = Math.random() * 24 - 12;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 200})` : `rgba(0,0,0,${-v / 200})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeConcreteTexture(baseColor = '#9a9c9a') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  // 打ちっ放しコンクリートのパネル目地(大きめのグリッド)
  const cols = 2, rows = 3;
  const cw = 256 / cols, ch = 256 / rows;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, 256); ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * ch); ctx.lineTo(256, j * ch); ctx.stroke();
  }
  // セパレーター(型枠の丸い跡)をパネルの四隅寄りに配置
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]].forEach(([fx, fy]) => {
        const cx = i * cw + cw * fx, cy = j * ch + ch * fy;
        ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
  // 色ムラ・シミ
  for (let i = 0; i < 2000; i++) {
    const v = Math.random() * 22 - 11;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 200})` : `rgba(0,0,0,${-v / 200})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeDoorTexture(baseColor = '#6b4022') {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 60, y);
    ctx.lineTo(Math.random() * 60 + 60, y + (Math.random() * 3 - 1.5));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 18, 100, 96);
  ctx.strokeRect(14, 142, 100, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2e3d24';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5
      ? `rgba(110,130,80,${Math.random() * 0.5})`
      : `rgba(15,20,10,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function scaled(base, rx, ry) {
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

const woodBase = makeWoodTexture();
const tileBase = makeTileTexture();
const wallBase = makeWallTexture();

// 指紋(手形)のテクスチャ。手のひら+親指+4本指を手続き的に描き、UVを当てたときだけ浮かぶ薄紫の手形にする
function makeFingerprintTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(179,136,255,0.6)';
  try { ctx.filter = 'blur(1.5px)'; } catch (e) { /* 一部環境でblurが未対応でも問題ない */ }
  // 手のひら
  ctx.beginPath();
  ctx.ellipse(64, 80, 25, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  // 親指
  ctx.save();
  ctx.translate(34, 62);
  ctx.rotate(-0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 4本指(根元の位置・長さ・傾きをそれぞれ変えて自然な形に)
  [
    { x: 42, len: 32, rot: -0.2 },
    { x: 56, len: 40, rot: -0.06 },
    { x: 72, len: 42, rot: 0.05 },
    { x: 86, len: 34, rot: 0.18 },
  ].forEach(f => {
    ctx.save();
    ctx.translate(f.x, 48);
    ctx.rotate(f.rot);
    ctx.beginPath();
    ctx.ellipse(0, -f.len / 2, 6.5, f.len / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  // うっすらとした滲み(見た目に生々しさを足す)
  ctx.filter = 'none';
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(179,136,255,${Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.arc(20 + Math.random() * 88, 30 + Math.random() * 80, Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 天井の照明。実際に計算コストのかかるPointLightは一切使わず、
// 「照明器具の発光」+「床に落ちる光だまり(半透明の丸いテクスチャ)」を明るくするだけの、見た目だけの仕掛けにする。
// この方式なら、プレイヤーがどれだけ動いてもライトの数・位置は一切変わらないので、移動によるカクつきが原理的に発生しない。
function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,214,0.9)');
  g.addColorStop(0.6, 'rgba(255,244,214,0.35)');
  g.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export { scaled, wallBase, makeDoorTexture, makeWoodTexture, makeFingerprintTexture, makeGlowTexture, makeTileTexture, makeWallTexture, makeConcreteTexture, makeGrassTexture, woodBase, tileBase };
