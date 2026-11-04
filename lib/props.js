// Industrial props at real sizes, in millimetres, using the worn-metal shader: an ISO 20 ft container, a 200 l drum,
// a jersey barrier, a steel crate, a light pole, a broken concrete wall, a gantry crane, rubble.
//
//   const P = createProps();                 // shared materials and geometry
//   const root = new THREE.Group(); root.scale.setScalar(0.001); scene.add(root);   // mm -> metres
//   const c = P.container({color: 1});       // returns {g, col}; g is a Group at the origin, col a collider (m)
//   P.place(root, c, x, z, rotY);            // x, z in METRES; sets the collider's world position too
//   ... place everything, THEN bakeRest(root) once, so the wear differs prop to prop.
//
// Colliders are footprints on the ground: {kind: 'box', x, z, hx, hz, rot} or {kind: 'circle', x, z, r}, metres.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {box, ibeam, rock, rng} from './shapes.js';
import {makeWorn} from './wear.js';
import {concreteTexture} from './textures.js';

export const CONTAINER_20FT = {L: 6058, H: 2591, W: 2438}; // ISO 668
export const DRUM_200L = {r: 292, h: 880};
export const JERSEY = {base: 610, top: 160, h: 810, len: 3000};

export function createProps({seed = 2024} = {}) {
  const r = rng(seed);
  const concrete = new THREE.MeshStandardMaterial({map: concreteTexture(33, '#a9a69f', false), roughness: 0.95});
  const concreteMm = concrete.clone(); // for extrusions, whose uvs are in mm
  concreteMm.map = concrete.map.clone();
  concreteMm.map.repeat.set(1 / 2000, 1 / 2000);
  const M = {
    concrete,
    concreteMm,
    rubble: new THREE.MeshStandardMaterial({color: '#9d9992', roughness: 0.97, flatShading: true}),
    steel: makeWorn({color: '#b9bcc0', painted: false, rough: 0.3, seed: 7100, dent: 0.3, bare: '#b9bcc0'}),
    iron: makeWorn({color: '#55595e', painted: false, rough: 0.5, seed: 7200, bare: '#6b7076'}),
    yellow: makeWorn({color: '#c79a2c', rough: 0.55, seed: 7300, bare: '#7d8086'}),
    hazard: makeWorn({color: '#c23a26', rough: 0.55, seed: 7400}),
    lamp: new THREE.MeshStandardMaterial({color: '#fff6e0', emissive: '#ffe9c2', emissiveIntensity: 0.6, roughness: 0.3}),
  };
  // container liveries: weathered maritime colours
  const LIVERY = ['#8b3b2b', '#2f5873', '#4d6645', '#b4612b', '#6f7378', '#7a2f2a', '#c8c5bd', '#3c4e63'];
  const paints = LIVERY.map((c, i) => makeWorn({color: c, rough: 0.58, seed: 8000 + i * 137, bare: '#7d8288'}));
  const drumPaints = [makeWorn({color: '#2d4f7a', seed: 9100}), makeWorn({color: '#c6942b', seed: 9200}), makeWorn({color: '#6a2f22', seed: 9300}), M.iron];

  const mesh = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const pick = (arr, i) => (i === undefined ? arr[(r() * arr.length) | 0] : arr[i % arr.length]);

  // ---- ISO 20 ft container: corrugated walls (ribs), corner posts, top and bottom rails, doors with lock bars
  const CG = (() => {
    const {L, H, W} = CONTAINER_20FT;
    const ribs = [];
    for (let i = 0; i < 30; i++) {
      const x = -L / 2 + 220 + (i * (L - 440)) / 29;
      ribs.push(box(100, H - 260, 46, x, H / 2, W / 2 - 40), box(100, H - 260, 46, x, H / 2, -W / 2 + 40));
    }
    for (let i = 0; i < 9; i++) {
      const z = -W / 2 + 260 + (i * (W - 520)) / 8;
      ribs.push(box(46, H - 260, 100, -L / 2 + 40, H / 2, z), box(L - 300, 40, 90, 0, H - 10, z));
    }
    const frame = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(box(160, H, 160, (sx * (L - 160)) / 2, H / 2, (sz * (W - 160)) / 2));
    for (const y of [70, H - 70]) {
      for (const sz of [-1, 1]) frame.push(box(L - 160, 140, 120, 0, y, (sz * (W - 120)) / 2));
      for (const sx of [-1, 1]) frame.push(box(120, 140, W - 160, (sx * (L - 120)) / 2, y, 0));
    }
    const bars = [];
    for (const z of [-820, -420, 420, 820]) {
      bars.push(new THREE.CylinderGeometry(17, 17, H - 300, 10).translate(L / 2 + 20, H / 2, z));
      for (const y of [700, 1900]) bars.push(box(30, 60, 70, L / 2 + 20, y, z));
    }
    return {
      shell: box(L - 120, H - 120, W - 120, 0, H / 2, 0),
      ribs: mergeGeometries(ribs),
      frame: mergeGeometries(frame),
      door: mergeGeometries([box(30, H - 260, W / 2 - 140, L / 2 - 10, H / 2, W / 4 - 20), box(30, H - 260, W / 2 - 140, L / 2 - 10, H / 2, -W / 4 + 20)]),
      bars: mergeGeometries(bars),
    };
  })();
  const container = ({color, level = 0} = {}) => {
    const g = new THREE.Group();
    const mat = pick(paints, color);
    for (const k of ['shell', 'ribs', 'frame', 'door']) mesh(g, CG[k], mat);
    mesh(g, CG.bars, M.steel, false);
    g.position.y = level * CONTAINER_20FT.H;
    const {L, W} = CONTAINER_20FT;
    return {g, col: level === 0 ? {kind: 'box', hx: L / 2000 + 0.05, hz: W / 2000 + 0.05} : null};
  };

  // ---- jersey barrier
  const jerseyGeo = (() => {
    const s = new THREE.Shape();
    const p = [[-305, 0], [305, 0], [305, 75], [180, 330], [80, 810], [-80, 810], [-180, 330], [-305, 75]];
    s.moveTo(...p[0]);
    for (const q of p.slice(1)) s.lineTo(...q);
    return new THREE.ExtrudeGeometry(s, {depth: 3000, bevelEnabled: true, bevelThickness: 18, bevelSize: 14, bevelSegments: 2}).translate(0, 0, -1500);
  })();
  const jersey = () => {
    const g = new THREE.Group();
    mesh(g, jerseyGeo, M.concreteMm);
    return {g, col: {kind: 'box', hx: 0.33, hz: 1.52}};
  };

  // ---- 200 l drum, standing or on its side
  const drumGeo = (() => {
    const parts = [new THREE.CylinderGeometry(292, 292, 880, 40).translate(0, 440, 0)];
    for (const y of [12, 290, 590, 868]) parts.push(new THREE.TorusGeometry(293, 12, 6, 40).rotateX(Math.PI / 2).translate(0, y, 0));
    return mergeGeometries(parts.map((p) => p.toNonIndexed()));
  })();
  const drum = ({tipped = false, color} = {}) => {
    const g = new THREE.Group();
    const m = mesh(g, drumGeo, pick(drumPaints, color));
    if (tipped) {
      m.rotation.z = Math.PI / 2;
      m.position.set(440, 292, 0);
    }
    return {g, col: {kind: 'circle', r: tipped ? 0.55 : 0.36}};
  };

  // ---- steel crate on skids
  const crate = ({s = 1} = {}) => {
    const g = new THREE.Group();
    const w = 1400 * s;
    const h = 1100 * s;
    mesh(g, box(w, h, w * 0.8, 0, h / 2 + 90, 0), paints[6]);
    mesh(g, mergeGeometries([box(w + 60, 90, 120, 0, 45, w * 0.3), box(w + 60, 90, 120, 0, 45, -w * 0.3)]), M.iron);
    const bands = [];
    for (const z of [w * 0.4 + 15, -w * 0.4 - 15]) for (const y of [h * 0.75, h * 0.35]) bands.push(box(w + 20, 60, 30, 0, y, z));
    mesh(g, mergeGeometries(bands), M.iron);
    return {g, col: {kind: 'box', hx: w / 2000 + 0.05, hz: (w * 0.4) / 1000 + 0.05}};
  };

  // ---- 9 m light pole
  const pole = () => {
    const g = new THREE.Group();
    mesh(g, new THREE.CylinderGeometry(70, 130, 9000, 16).translate(0, 4500, 0), M.iron);
    mesh(g, new THREE.CylinderGeometry(260, 300, 300, 16).translate(0, 150, 0), M.concrete);
    mesh(g, box(1600, 80, 80, 800, 8900, 0), M.iron);
    mesh(g, box(700, 160, 340, 1500, 8820, 0), M.iron);
    mesh(g, box(620, 30, 280, 1500, 8730, 0), M.lamp, false);
    return {g, col: {kind: 'circle', r: 0.35}};
  };

  // ---- broken precast wall: n panels 2.4 m wide, some snapped short with rebar ends
  const wall = ({n = 4} = {}) => {
    const g = new THREE.Group();
    const pw = 2400;
    for (let i = 0; i < n; i++) {
      const h = r() < 0.35 ? 900 + r() * 1300 : 3200;
      const px = (i - (n - 1) / 2) * pw;
      mesh(g, box(pw - 20, h, 280, px, h / 2, 0), M.concrete);
      if (h < 3200) {
        mesh(g, box(pw * 0.45, 260 + r() * 400, 280, px - pw * 0.2, h + 150, 0), M.concrete);
        for (let k = 0; k < 5; k++) mesh(g, new THREE.CylinderGeometry(9, 9, 300 + r() * 500, 6).rotateZ((r() - 0.5) * 0.7).translate(px + (k - 2) * 380, h + 200, (r() - 0.5) * 120), M.iron, false);
      }
    }
    mesh(g, box(n * pw + 200, 300, 520, 0, 150, 0), M.concrete);
    return {g, col: {kind: 'box', hx: (n * pw) / 2000 + 0.1, hz: 0.32}};
  };

  // ---- rail-mounted gantry crane, 18 m span, 9.5 m clear height. Two colliders (its legs), so it returns cols[]
  const gantry = ({span = 18000, H = 9500} = {}) => {
    const g = new THREE.Group();
    const cols = [];
    for (const s of [-1, 1]) {
      for (const dz of [-2200, 2200]) {
        const leg = mesh(g, ibeam(H - 300, 420, 420), M.yellow);
        leg.position.set((s * span) / 2, 0, dz * 0.92);
        leg.rotation.x = (dz > 0 ? -1 : 1) * 0.12; // the A-frame: tops lean in
      }
      mesh(g, box(900, 700, 5600, (s * span) / 2, 350, 0), M.yellow);
      mesh(g, box(620, 380, 5000, (s * span) / 2, H - 200, 0), M.yellow);
      for (const dz of [-2600, 2600]) mesh(g, new THREE.CylinderGeometry(260, 260, 500, 24).rotateZ(Math.PI / 2).translate((s * span) / 2, 260, dz), M.iron);
      mesh(g, box(260, 220, 60000, (s * span) / 2, 40, 0), M.steel);
      cols.push({kind: 'box', lx: (s * span) / 2000, lz: 0, hx: 0.55, hz: 2.9});
    }
    mesh(g, box(span + 1400, 1300, 900, 0, H + 450, -650), M.yellow);
    mesh(g, box(span + 1400, 1300, 900, 0, H + 450, 650), M.yellow);
    mesh(g, box(span - 1500, 120, 1600, 0, H + 1160, 0), M.iron);
    const tx = 2600;
    mesh(g, box(2400, 1100, 2600, tx, H + 1700, 0), M.hazard);
    mesh(g, box(2500, 160, 2700, tx, H + 2300, 0), M.iron);
    for (const dz of [-260, 260]) mesh(g, new THREE.CylinderGeometry(22, 22, 5200, 8).translate(tx, H - 1500, dz), M.iron, false);
    mesh(g, box(700, 900, 700, tx, H - 4300, 0), M.hazard);
    mesh(g, new THREE.TorusGeometry(240, 70, 10, 24, Math.PI * 1.4).rotateZ(-Math.PI * 0.2).translate(tx, H - 5000, 0), M.steel);
    return {g, cols};
  };

  // ---- rubble chunk, s = radius in mm
  const rocks = [0, 1, 2, 3, 4, 5].map((i) => rock(i));
  const rubble = ({s = 200} = {}) => {
    const g = new THREE.Group();
    const m = mesh(g, rocks[(r() * 6) | 0], M.rubble, s > 250);
    m.scale.setScalar(s);
    m.position.y = s * 0.25;
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    return {g, col: s > 380 ? {kind: 'circle', r: (s / 1000) * 0.9} : null};
  };

  /**
   * put a prop into a mm-scaled root at (x, z) metres, turned rotY; returns its colliders in world metres.
   * three's rotation.y maps local (x, z) to world (x cos + z sin, -x sin + z cos).
   */
  const place = (root, prop, x, z, rotY = 0) => {
    prop.g.position.x = x * 1000;
    prop.g.position.z = z * 1000;
    prop.g.rotation.y = rotY;
    root.add(prop.g);
    const out = [];
    for (const c of prop.cols ?? (prop.col ? [prop.col] : [])) {
      const lx = c.lx ?? 0;
      const lz = c.lz ?? 0;
      out.push({...c, x: x + lx * Math.cos(rotY) + lz * Math.sin(rotY), z: z - lx * Math.sin(rotY) + lz * Math.cos(rotY), rot: rotY});
    }
    return out;
  };

  return {M, paints, container, jersey, drum, crate, pole, wall, gantry, rubble, place, rng: r};
}

/** push a circle (x, z, radius, metres) out of every collider; returns [x, z]. Pass bound to keep it in a disc. */
export function collide(colliders, x, z, rad, bound = Infinity) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const m = c.r + rad;
        if (d < m && d > 1e-6) {
          x = c.x + (dx / d) * m;
          z = c.z + (dz / d) * m;
        }
        continue;
      }
      const cs = Math.cos(c.rot ?? 0);
      const sn = Math.sin(c.rot ?? 0);
      const dx = x - c.x;
      const dz = z - c.z;
      const lx = dx * cs - dz * sn;
      const lz = dx * sn + dz * cs;
      const qx = clampN(lx, c.hx);
      const qz = clampN(lz, c.hz);
      const ox = lx - qx;
      const oz = lz - qz;
      const d = Math.hypot(ox, oz);
      let nx;
      let nz;
      if (d > 1e-6) {
        if (d >= rad) continue;
        nx = qx + (ox / d) * rad;
        nz = qz + (oz / d) * rad;
      } else if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) {
        nx = Math.sign(lx || 1) * (c.hx + rad);
        nz = lz;
      } else {
        nx = lx;
        nz = Math.sign(lz || 1) * (c.hz + rad);
      }
      x = c.x + nx * cs + nz * sn;
      z = c.z - nx * sn + nz * cs;
    }
  }
  const d = Math.hypot(x, z);
  if (d > bound) {
    x *= bound / d;
    z *= bound / d;
  }
  return [x, z];
}
const clampN = (v, h) => Math.max(-h, Math.min(h, v));
