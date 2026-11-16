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

/** Large concrete tiles for a showroom or studio floor, as two tiling textures: `map` (colour) and `data` (red = height
 *  for bumpMap, green = roughness for roughnessMap). One repeat is 8 x 16 tiles laid in a half bond: 1.2 m x 0.6 m
 *  tiles when it is stretched over 9.6 m. Joints are dark, low and rough; tiles differ a little in tone and polish. */
export function slabTextures({size = 2048, tone = 0.43} = {}) {
  const S = size, N = 512;
  const lerp = (a, b, u) => a + (b - a) * u;
  // tileable fractal noise
  const field = (seed, octaves, first) => {
    const f = new Float32Array(N * N);
    let amp = 0.5, sum = 0;
    for (let o = 0, cells = first; o < octaves; o++, cells *= 2, amp *= 0.5) {
      sum += amp;
      const lat = new Float32Array(cells * cells);
      let s = (seed * 7919 + o * 104729) >>> 0;
      for (let i = 0; i < lat.length; i++) lat[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * cells, fy = (y / N) * cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          let u = fx - x0, v = fy - y0;
          u = u * u * (3 - 2 * u);
          v = v * v * (3 - 2 * v);
          const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
          f[y * N + x] += amp * lerp(lerp(lat[y0 * cells + x0], lat[y0 * cells + x1], u), lerp(lat[y1 * cells + x0], lat[y1 * cells + x1], u), v);
        }
    }
    for (let i = 0; i < f.length; i++) f[i] /= sum;
    return (x, y) => {
      const fx = (((x % 1) + 1) % 1) * N, fy = (((y % 1) + 1) % 1) * N;
      const x0 = Math.floor(fx) % N, y0 = Math.floor(fy) % N, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N, u = fx - Math.floor(fx), v = fy - Math.floor(fy);
      return lerp(lerp(f[y0 * N + x0], f[y0 * N + x1], u), lerp(f[y1 * N + x0], f[y1 * N + x1], u), v);
    };
  };
  const cloud = field(3, 6, 2), stain = field(11, 5, 3), fine = field(29, 3, 64);
  const col = new Uint8ClampedArray(S * S * 4), data = new Uint8ClampedArray(S * S * 4);
  const TW = S / 8, TH = S / 16;
  const rnd = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / TH);
    const dy = Math.min(y - row * TH, (row + 1) * TH - y);
    for (let x = 0; x < S; x++) {
      const xs = x + (row % 2) * TW * 0.5;
      const cx = Math.floor(xs / TW);
      const dx = Math.min(xs - cx * TW, (cx + 1) * TW - xs);
      const joint = 1 - Math.min(1, Math.min(dx, dy) / (S / 1575)); // 1 on a joint
      const tile = rnd(cx % 8, row % 16);
      const u = x / S, v = y / S;
      const c = cloud(u, v), st = stain(u * 2 + tile, v * 2 + tile * 3), fi = fine(u * 4, v * 4);
      let g = tone + 0.26 * (c - 0.5) + 0.07 * (tile - 0.5) - 0.1 * Math.max(0, st - 0.55) + 0.05 * (fi - 0.5);
      g *= 1 - 0.55 * joint;
      const i = (y * S + x) * 4;
      col[i] = g * 255;
      col[i + 1] = g * 255;
      col[i + 2] = g * 258;
      col[i + 3] = 255;
      data[i] = (0.6 + 0.25 * (fi - 0.5) + 0.2 * (c - 0.5) - 0.6 * joint) * 255;
      data[i + 1] = Math.min(1, 0.64 + 0.26 * (st - 0.5) + 0.12 * (tile - 0.5) + 0.1 * (fi - 0.5) + 0.4 * joint) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = (px, srgb) => {
    const t = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 16;
    t.needsUpdate = true;
    return t;
  };
  return {map: tex(col, true), data: tex(data, false)};
}
