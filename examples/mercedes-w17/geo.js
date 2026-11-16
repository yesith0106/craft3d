// Geometry helpers for the W17: monotone splines, lofted skins, aerofoil sections, swept tubes.
// Car frame used by every helper: s = mm behind the front axle, h = mm above the ground, x = mm to the left.
// Model frame (mm): X = x, Y = h, Z = ZF - s  (forward is +Z, the front axle sits at Z = +ZF).
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {creased, outward} from '../craft/shapes.js';

export const ZF = 1700; // half the wheelbase: the origin is mid-wheelbase on the ground
export const zOf = (s) => ZF - s;
export const V = (x, h, s) => new THREE.Vector3(x, h, ZF - s);

/** monotone cubic through [[x, y], ...] (no overshoot between the measured points) */
export function pchip(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  m.push(d[n - 2]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/** rows [s, a, b, ...] under keys ['a', 'b', ...] -> s => {a, b, ...} */
export const table = (keys, rows) => {
  const f = keys.map((_, j) => pchip(rows.map((r) => [r[0], r[j + 1]])));
  return (s) => Object.fromEntries(keys.map((k, j) => [k, f[j](s)]));
};
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;

/** a skin through rings of equal length (each a closed loop of [x, y, z, shade?]), optionally capped.
 *  shade (0..1) becomes a vertex attribute: 0 = matt black interior (ducts, the cockpit tub) */
export function loft(rings, {angle = 38, capA = true, capB = true, closed = true} = {}) {
  const n = rings[0].length;
  const pos = [];
  const shade = [];
  const idx = [];
  for (const r of rings) for (const p of r) {
    pos.push(p[0], p[1], p[2]);
    shade.push(p[3] ?? 1);
  }
  const lim = closed ? n : n - 1;
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < lim; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n), c = (j + 1) * n + i, e = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, e);
    }
  const cap = (ring, base, flip) => {
    const c = [0, 0, 0];
    let sh = 0;
    for (const p of ring) {
      for (let q = 0; q < 3; q++) c[q] += p[q] / n;
      sh += (p[3] ?? 1) / n;
    }
    pos.push(...c);
    shade.push(sh);
    const ci = pos.length / 3 - 1;
    for (let i = 0; i < n; i++) {
      const a = base + i, b = base + ((i + 1) % n);
      flip ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  };
  if (capA) cap(rings[0], 0, false);
  if (capB) cap(rings[rings.length - 1], (rings.length - 1) * n, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.setIndex(idx);
  return creased(outward(g), angle);
}

/** a superellipse ring in the plane s: centre x0, half-width w, top t, bottom b, widest at yc, exponents nT / nB.
 *  skew slides the outer (+x of centre... both) sides out toward the bottom: x += skew * (yc - y) / (yc - b) below yc */
export function ring(s, {w, t, b, yc = (t + b) / 2, nT = 2.5, nB = 2.5, N = 64, x0 = 0, shade = 1}) {
  const r = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const c = Math.cos(a), sn = Math.sin(a);
    const n = sn >= 0 ? nT : nB;
    const x = x0 + w * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = sn >= 0 ? yc + (t - yc) * Math.abs(sn) ** (2 / n) : yc - (yc - b) * Math.abs(sn) ** (2 / n);
    r.push([x, y, zOf(s), shade]);
  }
  return r;
}

/** scale a ring about its centroid (lips, nose caps) and move it to another station */
export function scaled(r, k, s, shade) {
  let cx = 0, cy = 0;
  for (const p of r) {
    cx += p[0] / r.length;
    cy += p[1] / r.length;
  }
  return r.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k, s === undefined ? p[2] : zOf(s), shade ?? p[3]]);
}

/** NACA 4-digit half thickness over chord at u = 0..1 (closed trailing edge) */
export const naca = (u, tc) => 5 * tc * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) + 0.0016 * u;

/** an aerofoil loop in its own frame: [a, n] with a along the chord (0 = leading edge) and n normal to it.
 *  camber > 0 bows the section DOWN (suction side below: a downforce wing). m points per side. */
export function foil2d(chord, {tc = 0.1, camber = 0.08, m = 14} = {}) {
  const up = [];
  const lo = [];
  for (let i = 0; i <= m; i++) {
    const u = (1 - Math.cos((Math.PI * i) / m)) / 2;
    const th = naca(u, tc) * chord;
    const cm = -camber * chord * 4 * u * (1 - u);
    up.push([u * chord, cm + th]);
    if (i > 0 && i < m) lo.push([u * chord, cm - th]);
  }
  return [...up, ...lo.reverse()]; // from the LE over the top to the TE, back along the bottom
}

/** one wing element lofted across span stations: [{x, s, h, chord, alpha (deg, trailing edge up), tc, camber}], capped */
export function wing(stations, {m = 14, origin = null, angle = 50} = {}) {
  const rings = stations.map((st) => {
    const al = THREE.MathUtils.degToRad(st.alpha ?? 0);
    const ca = Math.cos(al), sa = Math.sin(al);
    return foil2d(st.chord, {tc: st.tc ?? 0.1, camber: st.camber ?? 0.08, m}).map(([a, n]) => {
      const s = st.s + a * ca - n * sa;
      const h = st.h + a * sa + n * ca;
      const p = [st.x, h, zOf(s)];
      if (origin) {
        p[0] -= origin.x;
        p[1] -= origin.y;
        p[2] -= origin.z;
      }
      return p;
    });
  });
  return loft(rings, {angle});
}
/** a point on a wing station's upper surface: chord fraction u, lifted d mm along the surface normal */
export function onFoil(st, u, d = 0) {
  const al = THREE.MathUtils.degToRad(st.alpha ?? 0);
  const ca = Math.cos(al), sa = Math.sin(al);
  const th = naca(u, st.tc ?? 0.1) * st.chord;
  const cm = -(st.camber ?? 0.08) * st.chord * 4 * u * (1 - u);
  const a = u * st.chord, n = cm + th + d;
  return [st.x, st.h + a * sa + n * ca, zOf(st.s + a * ca - n * sa)];
}
export const mixStation = (A, B, t) => {
  const o = {};
  for (const k of Object.keys(A)) o[k] = lerp(A[k], B[k] ?? A[k], t);
  return o;
};

/** an elliptical tube (a wide, b tall when the path is level) swept along [x, y, z] model points; closed solid.
 *  The section's "up" stays as close to +Y as the tangent allows, so nothing twists. taper: [k0, k1] end scales */
export function sweepTube(path, a, b, {N = 20, steps = 48, taper = [1, 1], up = new THREE.Vector3(0, 1, 0), angle = 50} = {}) {
  const curve = new THREE.CatmullRomCurve3(path.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal');
  const rings = [];
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
  for (let j = 0; j <= steps; j++) {
    const u = j / steps;
    curve.getPoint(u, P);
    curve.getTangent(u, T);
    B.crossVectors(T, up);
    if (B.lengthSq() < 1e-6) B.set(1, 0, 0);
    B.normalize();
    Nn.crossVectors(B, T).normalize();
    const k = lerp(taper[0], taper[1], u);
    const r = [];
    for (let i = 0; i < N; i++) {
      const th = (2 * Math.PI * i) / N;
      const ca = Math.cos(th) * a * k, sb = Math.sin(th) * b * k;
      r.push([P.x + B.x * ca + Nn.x * sb, P.y + B.y * ca + Nn.y * sb, P.z + B.z * ca + Nn.z * sb]);
    }
    rings.push(r);
  }
  return loft(rings, {angle});
}

/** a flat plate from an outline in the (s, h) plane, t thick, centred on x = x0 (endplates, fins, boards).
 *  bend(s, h) -> lateral offset lets the plate curve in plan or lean */
export function sidePlate(outline, t, {x0 = 0, bend = null, bevel = 1.2} = {}) {
  const sh = new THREE.Shape();
  outline.forEach(([s, h], i) => (i ? sh.lineTo(-s, h) : sh.moveTo(-s, h)));
  sh.closePath();
  const b = Math.min(bevel, t / 2 - 0.2);
  const g = new THREE.ExtrudeGeometry(sh, {depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 10});
  // shape plane (u = -s, v = h) extruded along +w: map to model (X = w, Y = v, Z = ZF + u)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), w = p.getZ(i) - (t - 2 * b) / 2;
    const off = bend ? bend(-u, v) : 0;
    p.setXYZ(i, x0 + off + w, v, ZF + u);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return outward(g);
}

/** a flat plate from an outline in plan (s, x), t thick, its mid-plane at height h (floor, footplates).
 *  lift(s, x) -> extra height lets it ramp (diffuser) or curl (floor edge) */
export function planPlate(outline, t, h, {lift = null, bevel = 1.2, curve = 10} = {}) {
  const sh = new THREE.Shape();
  outline.forEach(([s, x], i) => (i ? sh.lineTo(x, -s) : sh.moveTo(x, -s)));
  sh.closePath();
  const b = Math.min(bevel, t / 2 - 0.2);
  const g = new THREE.ExtrudeGeometry(sh, {depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: curve});
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), u = p.getY(i), w = p.getZ(i) - (t - 2 * b) / 2;
    p.setXYZ(i, x, h + w + (lift ? lift(-u, x) : 0), ZF + u);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return outward(g);
}

/** subdivide the long edges of an outline so a bend / lift function has vertices to move */
export function dense(outline, step = 40) {
  const out = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  return out;
}

/** mirror a geometry across the centre plane (x -> -x) with the winding fixed */
export function mirrorX(g) {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  if (m.index) {
    const a = m.index.array;
    for (let i = 0; i < a.length; i += 3) [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
  } else {
    for (const name of Object.keys(m.attributes)) {
      const at = m.attributes[name];
      const s = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let q = 0; q < s; q++) [arr[(i + 1) * s + q], arr[(i + 2) * s + q]] = [arr[(i + 2) * s + q], arr[(i + 1) * s + q]];
    }
  }
  return m;
}
export const both = (g) => [g, mirrorX(g)];

/** merge geometries that may differ in attributes (index, uv, shade): everything becomes non-indexed position + normal + shade */
export function merge(list) {
  const out = list.filter(Boolean).map((g0) => {
    let g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', g.attributes.position);
    o.setAttribute('normal', g.attributes.normal);
    o.setAttribute('shade', g.attributes.shade ?? new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    return o;
  });
  return mergeGeometries(out, false);
}

/** a textured patch lying d mm above a surface: grid[j][i] = [x, y, z] model points, uv spans the grid (decals) */
export function patch(grid) {
  const rows = grid.length, cols = grid[0].length;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      pos.push(...grid[j][i]);
      uv.push(i / (cols - 1), 1 - j / (rows - 1));
    }
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
