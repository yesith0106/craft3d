// Drafting annotations that live in the model (mm, the model's own frame): dimension lines with extension lines,
// arrowheads and a value, leader callouts, and text labels. All drawn in the drawing look only, in the ink colour of
// the current palette, so they sit on the drawing the way a draughtsman's dimensions do.
import * as THREE from 'three';
import {inkLine} from '../craft/ink.js';

const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(...a));
export const ANNOT = {color: '#e9f1fb', dim: '#b9d3f0'};
const texts = [];

/** a text label: a sprite facing the camera, `size` = cap height in mm. align: 'center' | 'left' | 'right' */
export function label(text, at, {size = 6, color = ANNOT.color, align = 'center', bold = false, font = 'ui-monospace, SFMono-Regular, Menlo, monospace'} = {}) {
  const lines = String(text).split('\n');
  const px = 64;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  const f = `${bold ? '700 ' : '500 '}${px}px ${font}`;
  cx.font = f;
  const w = Math.ceil(Math.max(...lines.map((l) => cx.measureText(l).width))) + 16;
  const lh = px * 1.18;
  cv.width = w;
  cv.height = Math.ceil(lh * lines.length + 12);
  cx.font = f;
  cx.fillStyle = '#ffffff';
  cx.textBaseline = 'top';
  cx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  const x0 = align === 'left' ? 8 : align === 'right' ? w - 8 : w / 2;
  lines.forEach((l, i) => cx.fillText(l, x0, 6 + i * lh));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.SpriteMaterial({map: tex, color, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: true});
  const s = new THREE.Sprite(m);
  const k = size / (px * 0.72); // mm per canvas px
  s.scale.set(cv.width * k, cv.height * k, 1);
  s.center.set(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
  s.position.copy(v3(at));
  s.renderOrder = 10;
  s.userData.ink = 'color';
  s.userData.inkOnly = true;
  s.userData.annot = true;
  texts.push(m);
  return s;
}

const line = (pts, o) => {
  const l = inkLine(pts, {color: ANNOT.dim, width: 1, ...o});
  l.material.depthTest = false;
  l.renderOrder = 9;
  l.userData.inkOnly = true;
  l.userData.annot = true;
  return l;
};

/** an arrowhead at P pointing along d, lying in the plane with normal n */
function arrow(P, d, n, len, o) {
  const s = new THREE.Vector3().crossVectors(d, n).normalize();
  const a = P.clone().addScaledVector(d, -len).addScaledVector(s, len * 0.28);
  const b = P.clone().addScaledVector(d, -len).addScaledVector(s, -len * 0.28);
  return line([a.toArray(), P.toArray(), b.toArray()], o);
}

/**
 * A linear dimension between A and B, drawn `off` mm away along `side` (a unit direction square to AB),
 * with extension lines from the part, arrowheads, and the value (or `text`) at the middle.
 */
export function dim(A, B, side, off, {text, size = 6.5, gap = 3, over = 3, arrowLen = 5, color, decimals = 1, textOff = 5} = {}) {
  const g = new THREE.Group();
  g.userData.inkOnly = true;
  g.userData.ink = 'color';
  const a = v3(A);
  const b = v3(B);
  const sd = v3(side).normalize();
  const o = color ? {color} : {};
  const a2 = a.clone().addScaledVector(sd, off);
  const b2 = b.clone().addScaledVector(sd, off);
  g.add(line([a.clone().addScaledVector(sd, gap).toArray(), a.clone().addScaledVector(sd, off + over).toArray()], o));
  g.add(line([b.clone().addScaledVector(sd, gap).toArray(), b.clone().addScaledVector(sd, off + over).toArray()], o));
  g.add(line([a2.toArray(), b2.toArray()], {...o, width: 1.1}));
  const d = b2.clone().sub(a2).normalize();
  const n = new THREE.Vector3().crossVectors(d, sd).normalize();
  g.add(arrow(b2, d, n, arrowLen, o));
  g.add(arrow(a2, d.clone().negate(), n, arrowLen, o));
  const L = a.distanceTo(b);
  const val = text ?? `${L.toFixed(decimals).replace(/\.0$/, '')}`;
  g.add(label(val, a2.clone().add(b2).multiplyScalar(0.5).addScaledVector(sd, textOff), {size, color: color ?? ANNOT.color}));
  return g;
}

/** a leader: from the point on the part out to `to`, a short shoulder, then the note */
export function leader(at, to, text, {size = 5.2, dot = true, shoulder = 12, color, align} = {}) {
  const g = new THREE.Group();
  g.userData.inkOnly = true;
  g.userData.ink = 'color';
  const a = v3(at);
  const b = v3(to);
  const right = b.x >= a.x ? 1 : -1;
  const c = b.clone().add(new THREE.Vector3(shoulder * right, 0, 0));
  g.add(line([a.toArray(), b.toArray(), c.toArray()], color ? {color} : {}));
  if (dot) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({color: color ?? ANNOT.dim, depthTest: false}));
    m.position.copy(a);
    m.renderOrder = 9;
    m.userData.ink = 'color';
    g.add(m);
  }
  g.add(label(text, c.clone().add(new THREE.Vector3(2 * right, 0, 0)), {size, align: align ?? (right > 0 ? 'left' : 'right'), color}));
  return g;
}

/** recolour every label for a palette (white on blueprint, black on paper/print) */
export function annotColor(textColor, dimColor, root) {
  for (const m of texts) m.color.set(textColor);
  root.traverse((o) => {
    if (!o.userData.annot) return;
    if (o.material?.isLineMaterial) o.material.color.set(dimColor);
  });
  root.traverse((o) => o.parent?.userData.ink === 'color' && o.isMesh && o.material.isMeshBasicMaterial && o.material.color.set(dimColor));
}
