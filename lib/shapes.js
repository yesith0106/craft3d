// Building blocks for hard-surface parts, all in millimetres. Every function returns a BufferGeometry centred the
// way its comment says, so a part is placed with one position and one rotation.
//
// Rule of thumb: real machines are boxes with chamfers, rounded boxes, tubes and turned (lathed) parts. Pick the block
// that matches how the part would be made: plate is cut and bent (slab, chamferBox), castings are rounded (rb),
// shafts and pins are turned (cyl*, lathe), structure is rolled section (ibeam, tube).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

/** a box w x h x d centred on the origin, optionally moved */
export const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** a rounded box (castings, padded armour). r is the corner radius; keep it under half the smallest side */
export const rb = (w, h, d, r, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 0.5));

/** cylinders along each axis, centred */
export const cylX = (r, len, seg = 40) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
export const cylY = (r, len, seg = 40) => new THREE.CylinderGeometry(r, r, len, seg);
export const cylZ = (r, len, seg = 40) => new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2);

/** a polygon in XY extruded along Z (depth d, centred), with its edges rounded by bevel. Plate parts. */
export function slab(pts, depth, bevel = 18) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const b = Math.min(bevel, depth / 2 - 0.5);
  const g = new THREE.ExtrudeGeometry(sh, {depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 6});
  g.translate(0, 0, -(depth - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

/** a w x h box with its four corners cut by c, extruded d along Z: armour plates, shin guards, brackets */
export const chamferBox = (w, h, d, c, bevel = 16) =>
  slab([[-w / 2 + c, -h / 2], [w / 2 - c, -h / 2], [w / 2, -h / 2 + c], [w / 2, h / 2 - c], [w / 2 - c, h / 2], [-w / 2 + c, h / 2], [-w / 2, h / 2 - c], [-w / 2, -h / 2 + c]], d, bevel);

/** a rounded-rectangle frame with a hole (a socket, a bezel, a hatch rim), extruded d along Z */
export function frameGeo(w, h, r, iw, ih, ir, d) {
  const rr = (s, W, H, Rr, hole) => {
    const x = -W / 2;
    const y = -H / 2;
    const p = hole ? new THREE.Path() : s;
    p.moveTo(x + Rr, y);
    p.lineTo(x + W - Rr, y);
    p.quadraticCurveTo(x + W, y, x + W, y + Rr);
    p.lineTo(x + W, y + H - Rr);
    p.quadraticCurveTo(x + W, y + H, x + W - Rr, y + H);
    p.lineTo(x + Rr, y + H);
    p.quadraticCurveTo(x, y + H, x, y + H - Rr);
    p.lineTo(x, y + Rr);
    p.quadraticCurveTo(x, y, x + Rr, y);
    return p;
  };
  const s = new THREE.Shape();
  rr(s, w, h, r, false);
  s.holes.push(rr(null, iw, ih, ir, true));
  const g = new THREE.ExtrudeGeometry(s, {depth: d - 20, bevelEnabled: true, bevelThickness: 10, bevelSize: 10, bevelSegments: 3, curveSegments: 10});
  g.translate(0, 0, -(d - 20) / 2);
  g.computeVertexNormals();
  return g;
}

/** a turned part from a profile of [radius, y] points, bottom to top (pistons, wheels, drums, nozzles) */
export const lathe = (profile, seg = 48) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** an I-beam (universal column), h tall standing on y = 0: flange width wf, depth d, flange tf, web tw */
export const ibeam = (h, wf = 300, d = 300, tf = 24, tw = 16) =>
  mergeGeometries([box(wf, h, tf, 0, h / 2, d / 2 - tf / 2), box(wf, h, tf, 0, h / 2, -d / 2 + tf / 2), box(tw, h, d - 2 * tf, 0, h / 2, 0)]);

/** a tube along a list of [x, y, z] points (hoses, cables, pipe runs) */
export const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 10, false);

/** a hex bolt head, its axis along Y (rotate it to the face it sits on) */
export const boltHead = (af = 22, h = 9) => new THREE.CylinderGeometry(af / 2, af / 2, h, 6);

/** a lumpy rock / concrete chunk of radius ~1 (scale it); flat-shade it */
export function rock(seed = 1) {
  let geo = new THREE.IcosahedronGeometry(1, 1);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  const r = rng(500 + seed);
  const k = [0.7 + r() * 0.6, 0.45 + r() * 0.4, 0.7 + r() * 0.6];
  for (let j = 0; j < p.count; j++) {
    const f = 0.75 + r() * 0.45;
    p.setXYZ(j, p.getX(j) * f * k[0], p.getY(j) * f * k[1], p.getZ(j) * f * k[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

/** a seeded random generator: never Math.random in geometry, so a model rebuilds the same every time */
export const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * A part builder bound to a materials set. Use it so every model is built the same way:
 *   const k = kit();
 *   const arm = k.group(torso, 830, 400, 0);       // a pivot, positioned in its parent (mm)
 *   k.add(arm, rb(280, 520, 320, 40), M.mid).position.y = -330;
 *   k.bolts(plate, [[-90, 165, 322], [90, 165, 322]]);   // only on FLAT faces
 */
export function kit({boltMat} = {}) {
  const bm = boltMat ?? new THREE.MeshStandardMaterial({color: '#4c5055', roughness: 0.4, metalness: 0.9});
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const bh = boltHead();
  const bolts = (parent, pts, axis = 'z') => {
    for (const p of pts) {
      const b = add(parent, bh, bm, false);
      b.position.set(...p);
      if (axis === 'z') b.rotation.x = Math.PI / 2;
      if (axis === 'x') b.rotation.z = Math.PI / 2;
    }
  };
  return {add, group, bolts};
}

// ------------------------------------------------------------------ mechanical parts
// Segment counts go through seg() so one switch builds a lighter version of the whole model (setDetail('lo')).
const DETAIL = {k: 1};
/** 'hi' (default) or 'lo' (a sixth of the segments on every round part: a cheap build of the same model) */
export const setDetail = (level) => (DETAIL.k = level === 'lo' ? 1 / 6 : 1);
export const seg = (n, min = 6) => Math.max(min, Math.round(n * DETAIL.k));

/** a flat profile with round holes, extruded d along Z: lightening holes in rails, webs, brackets.
 *  pts: outline [[x, y]...]; holes: [[x, y, r]...] */
export function profile(pts, depth, {holes = [], bevel = 2, curve = 18} = {}) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  for (const [x, y, r] of holes) {
    const h = new THREE.Path();
    h.absarc(x, y, r, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const b = Math.min(bevel, depth / 2 - 0.5);
  const g = new THREE.ExtrudeGeometry(sh, {depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: seg(curve)});
  g.translate(0, 0, -(depth - 2 * b) / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * A spur (or helical) gear sized by its real module m (mm) and tooth count z, axis along Z, a tooth centred on +X.
 * Pitch radius m*z/2, tip m above it, root 1.25 m below (ISO 53 proportions). Two gears mesh when they share m and sit
 * (z1 + z2) * m / 2 apart; turn them with meshAngle() in rig.js. helix: total twist across the face (rad).
 */
export function gear(z, m, width, {helix = 0, bore = 0, bevel = Math.min(1.2, m * 0.25)} = {}) {
  const rp = (m * z) / 2;
  const ra = rp + m;
  const rr = rp - 1.25 * m;
  const da = (Math.PI * 2) / z;
  const sh = new THREE.Shape();
  for (let i = 0; i < z; i++) {
    // root flat, flank up, tip land, flank down: the tooth spans 0.2..0.75 of the pitch, centred at 0.475
    const a0 = (i - 0.475) * da;
    const pts = [[rr, a0], [rr, a0 + da * 0.2], [ra, a0 + da * 0.33], [ra, a0 + da * 0.62], [rr, a0 + da * 0.75]];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(a), r * Math.sin(a)) : sh.lineTo(r * Math.cos(a), r * Math.sin(a))));
  }
  sh.closePath();
  if (bore) {
    const h = new THREE.Path();
    h.absarc(0, 0, bore, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 4});
  g.translate(0, 0, -width / 2);
  if (helix) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = (p.getZ(i) / width) * helix;
      const x = p.getX(i);
      const y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
  }
  g.computeVertexNormals();
  g.userData = {z, m, rp, ra, rr};
  return g;
}

/** a gear rack for module m: a bar along X, teeth on its top face (y = h/2), extruded w along Z. Pitch = pi * m */
export function rack(len, m, w, h) {
  const p = Math.PI * m;
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, -h / 2);
  sh.lineTo(len / 2, -h / 2);
  sh.lineTo(len / 2, h / 2);
  const n = Math.floor(len / p);
  for (let i = n - 1; i >= 0; i--) {
    const x0 = -len / 2 + i * p;
    sh.lineTo(x0 + p * 0.78, h / 2);
    sh.lineTo(x0 + p * 0.62, h / 2 + 2.25 * m);
    sh.lineTo(x0 + p * 0.38, h / 2 + 2.25 * m);
    sh.lineTo(x0 + p * 0.22, h / 2);
  }
  sh.lineTo(-len / 2, h / 2);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: w, bevelEnabled: true, bevelThickness: Math.min(1.5, m * 0.3), bevelSize: Math.min(1.5, m * 0.3), bevelSegments: 1});
  g.translate(0, 0, -w / 2);
  g.computeVertexNormals();
  return g;
}

/** a coil spring along +Y from 0 to len: coil radius r, wire radius, turns. Squash it with scale.y */
export function spring(r, wire, turns, len, segs = 220) {
  const pts = [];
  const n = seg(segs, 40);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = u * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, u * len, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, seg(8, 4), false);
}

/** a cross-section ([[x, y]...], closed) swept along a path of [x, y, z] points: spring legs, bent bars, frames */
export function sweep(section, path, steps = 60) {
  const sh = new THREE.Shape();
  section.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, {steps: seg(steps, 8), extrudePath: new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p))), bevelEnabled: false});
}

/** a tyre: outer radius R, width W, a rounded crown and sidewalls down to the rim (rimR), axle along X */
export function tyre(R, W, rimR = R * 0.55, segs = 64) {
  const pts = [new THREE.Vector2(rimR, (-W / 2) * 0.9)];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push(new THREE.Vector2(R - (W / 2) * 0.55 + (W / 2) * 0.55 * Math.cos(a), (W / 2) * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(rimR, (W / 2) * 0.9));
  return new THREE.LatheGeometry(pts, seg(segs)).rotateZ(Math.PI / 2);
}

/** sidewall lettering: a transparent canvas texture with text set round a circle (map it on a RingGeometry) */
export function ringText(lines = [['MAKER', -Math.PI / 2], ['6.00-6 6PLY', Math.PI / 2]], {color = '#f4f1ea', size = 74, radius = 395, span = 0.11} = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = `700 ${size}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [word, a0] of lines) {
    [...word].forEach((ch, i) => {
      const a = a0 + (i - (word.length - 1) / 2) * span;
      g.save();
      g.translate(512 + Math.cos(a) * radius, 512 + Math.sin(a) * radius);
      g.rotate(a + Math.PI / 2);
      g.fillText(ch, 0, 0);
      g.restore();
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
