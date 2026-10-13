// 絵を描くだけの関数(ノートの見た目・血の画面)。engine.js から分けたファイル。
// ゲームの状態には触らず、three.js と canvas だけで動く。
import * as THREE from 'three';

function makeNotebookItemMesh() {
  // 手持ち表示では開いた状態に見えるよう、ページを表紙より上に、はっきり見える高さで重ねる
  const group = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.008, 0.19), new THREE.MeshLambertMaterial({ color: 0x5a2a2a }));
  cover.position.y = -0.006;
  group.add(cover);
  // ページも書き換え可能なキャンバスにして、白紙/書き込みありを見た目で区別できるようにする
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = 128; pageCanvas.height = 160;
  drawNotebookPage(pageCanvas, false);
  const pageTexture = new THREE.CanvasTexture(pageCanvas);
  const pages = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.17), new THREE.MeshBasicMaterial({ map: pageTexture }));
  pages.rotation.x = -Math.PI / 2;
  pages.position.y = 0.001;
  group.add(pages);
  group.userData.pageCanvas = pageCanvas;
  group.userData.pageTexture = pageTexture;
  return group;
}
// ノートのページを描き直す(白紙、または幽霊が書き込んだ魔法陣)
function drawNotebookPage(canvas, written) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#f2ecd8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,140,170,0.5)';
  ctx.lineWidth = 1;
  for (let y = 14; y < h; y += 12) {
    ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 6, y); ctx.stroke();
  }
  if (written) {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.4;
    ctx.strokeStyle = 'rgba(100,10,10,0.85)';
    ctx.lineWidth = 1.5;
    // 二重の円
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.stroke();
    // 内側の五芒星
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = Math.PI * 2 * ((i * 2) % 5) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * r * 0.8;
      const y = cy + Math.sin(a) * r * 0.8;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    // 円周を囲む小さな印(ルーンのような十字の刻み)
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const x = cx + Math.cos(a) * r * 0.93;
      const y = cy + Math.sin(a) * r * 0.93;
      ctx.beginPath();
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      ctx.stroke();
    }
  }
}

// ハントに捕まったときの演出(血の画面)
function makeBloodSplatterDataURL() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 8 + Math.random() * 42;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(120,0,0,${0.45 + Math.random() * 0.4})`);
    grad.addColorStop(1, 'rgba(120,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // 画面の上端から垂れる血の筋
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 512;
    const len = 70 + Math.random() * 170;
    const grad = ctx.createLinearGradient(x, 0, x, len);
    grad.addColorStop(0, 'rgba(100,0,0,0.85)');
    grad.addColorStop(1, 'rgba(100,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - (4 + Math.random() * 6), 0, 8 + Math.random() * 10, len);
  }
  return canvas.toDataURL();
}

export { makeNotebookItemMesh, drawNotebookPage, makeBloodSplatterDataURL };
