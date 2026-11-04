// Procedural canvas textures, no image files: worn concrete slabs (a 4 m tile of two 2 m slabs with saw-cut joints,
// mottling, oil stains, hairline cracks) and a large-scale variation map that breaks up any tiling on a big ground.
import * as THREE from 'three';
import {rng} from './shapes.js';

export function concreteTexture(seed = 7, base = '#a39d94', joints = true) {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {
    const x = r() * N;
    const y = r() * N;
    const rad = 4 + r() ** 3 * 90;
    const v = r() < 0.5 ? 0 : 255;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${v},${v},${v},${0.02 + r() * 0.05})`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 24;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 12; i++) {
    const x = r() * N;
    const y = r() * N;
    const rad = 30 + r() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(40,34,28,0.2)');
    gr.addColorStop(0.7, 'rgba(40,34,28,0.07)');
    gr.addColorStop(1, 'rgba(40,34,28,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // hairline cracks
  g.strokeStyle = 'rgba(28,27,25,0.35)';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = 0.8 + r();
    let x = r() * N;
    let y = r() * N;
    let a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a) * 14;
      y += Math.sin(a) * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  if (joints) {
    for (const k of [0, N / 2]) {
      for (const [lw, col] of [[7, 'rgba(60,58,55,0.55)'], [2.5, 'rgba(25,24,22,0.9)']]) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(k + 1, 0);
        g.lineTo(k + 1, N);
        g.moveTo(0, k + 1);
        g.lineTo(N, k + 1);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

// large-scale variation for the ground, so the 4 m concrete tile never reads as a repeat: grey 128 is neutral
export function macroTexture() {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = rng(91);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, N, N);
  const blob = (x, y, rad, col, a) => {
    for (const [dx, dy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(${col},${a})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 260; i++) blob(r() * N, r() * N, 20 + r() ** 2 * 160, r() < 0.5 ? '60,60,60' : '170,170,170', 0.18 + r() * 0.2);
  // windblown dirt and sand
  for (let i = 0; i < 90; i++) blob(r() * N, r() * N, 30 + r() * 140, '150,118,82', 0.25 + r() * 0.3);
  // oil and soot
  for (let i = 0; i < 40; i++) blob(r() * N, r() * N, 8 + r() * 40, '35,30,26', 0.3 + r() * 0.3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
