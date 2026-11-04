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
