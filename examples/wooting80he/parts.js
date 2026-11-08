// Parts with a shape of their own: a sculpted keycap (a moulded shell with a cylindrical dish and a cross stem), a
// magnetic Hall-effect switch, a rounded-rectangle loft. All mm, built as closed solids so the section cut shows
// their real walls.
import * as THREE from 'three';
import {creased, outward} from '../craft/shapes.js';

/** points of a rounded rectangle w x d (corner r), n per corner, counter-clockwise seen from +y, in x/z */
export function rrect(w, d, r, n = 6) {
  r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  const pts = [];
  const C = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]];
  for (const [cx, cz, a0] of C)
    for (let i = 0; i <= n; i++) {
      const a = THREE.MathUtils.degToRad(a0 + (90 * i) / n);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  return pts;
}

/** loft closed rings [[x, y, z]...] (all the same count) into a mesh; capStart / capEnd close the ends with a fan */
export function loftRings(rings, {capStart = true, capEnd = true} = {}) {
  const n = rings[0].length;
  const pos = [];
  const idx = [];
  for (const r of rings) for (const p of r) pos.push(...p);
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      const c = a + n;
      const d = b + n;
      idx.push(a, c, b, b, c, d);
    }
  const cap = (k, flip) => {
    const r = rings[k];
    const c = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    const ci = pos.length / 3;
    pos.push(...c);
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      flip ? idx.push(ci, b, a) : idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return creased(outward(g), 35);
}

/**
 * A sculpted keycap, a moulded shell: outer skirt from the bottom (w x d) up to the top rim (w - 2*taper), a
 * cylindrical dish across x, the top tilted by `tilt` degrees (row sculpt, positive leans toward the typist), wall
 * thickness `wall`, open underneath. Origin at the centre of the skirt's bottom edge.
 * The cross stem socket is built separately (stem()).
 */
export function keycap(w, d, {h = 8, taper = 2.6, tilt = 0, dish = 0.6, r0 = 0.9, r1 = 1.8, wall = 1.3} = {}) {
  const tw = w - 2 * taper;
  const td = d - 2 * taper;
  const t = Math.tan(THREE.MathUtils.degToRad(tilt));
  // the top surface height at (x, z): rim height, the tilt, minus a cylindrical dish of radius R across x
  const R = (tw * tw) / 4 / (2 * dish) + dish / 2;
  const top = (x, z, s = 1) => h + t * z - (Math.sqrt(R * R - (tw * s * tw * s) / 4) - Math.sqrt(Math.max(0, R * R - x * x)));
  const W = []; // outer wall rings, bottom to the top rim
  const nW = 7;
  const base = rrect(w, d, r0, 4);
  const up = rrect(tw, td, r1, 4);
  for (let k = 0; k <= nW; k++) {
    const f = k / nW;
    const e = 1 - (1 - f) ** 1.6; // the skirt bulges a little near the top, as moulded caps do
    W.push(base.map(([x, z], i) => {
      const X = x + (up[i][0] - x) * e;
      const Z = z + (up[i][1] - z) * e;
      return [X, f * top(up[i][0], up[i][1]) + (1 - f) * 0, Z];
    }));
  }
  // a soft rounded top edge: two rings just inside the rim
  const T = [];
  const nT = 6;
  for (let k = 1; k <= nT; k++) {
    const s = 1 - (k / nT) ** 1.15;
    T.push(up.map(([x, z]) => [x * s, top(x * s, z * s) + (k === 1 ? 0.05 : 0), z * s]));
  }
  // inner surface: the same, offset by the wall, back down to the bottom
  const iw = w - 2 * wall;
  const id = d - 2 * wall;
  const ibase = rrect(iw, id, Math.max(0.3, r0 - 0.5), 4);
  const iup = rrect(tw - 2 * wall, td - 2 * wall, Math.max(0.4, r1 - 0.8), 4);
  const I = [];
  const topI = (x, z) => top(x, z) - wall;
  for (let k = nT; k >= 1; k--) {
    const s = 1 - (k / nT) ** 1.15;
    I.push(iup.map(([x, z]) => [x * s, topI(x * s, z * s), z * s]));
  }
  for (let k = nW; k >= 0; k--) {
    const f = k / nW;
    const e = 1 - (1 - f) ** 1.6;
    I.push(ibase.map(([x, z], i) => [x + (iup[i][0] - x) * e, f * topI(iup[i][0], iup[i][1]), z + (iup[i][1] - z) * e]));
  }
  // outer from the bottom up to the top centre, the inner from the top centre back down, then back to the outer
  // bottom ring: one closed shell (the top-centre band is a zero-area seam)
  const g = loftRings([...W, ...T, ...I, W[0]], {capStart: false, capEnd: false});
  g.userData.top = top; // the top surface, for legends
  return g;
}

/** the cross stem socket inside a cap: a 5.5 mm boss from the cap's underside down to `bottom` */
export function capStem(topY, bottom = 1.2) {
  const L = topY - bottom;
  const boss = new THREE.CylinderGeometry(2.75, 2.75, L, 24).translate(0, bottom + L / 2, 0);
  return boss;
}
