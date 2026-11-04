// Joints and actuators. The math half (twoLinkIK, onSeg, strideFor) has no three.js in it, so a kinematics module can
// import it and stay testable in plain node. The three.js half (makeStruts) aims hydraulic cylinders between two
// points on two moving parts every frame.
//
// Sign conventions used throughout:
//   - a segment hangs DOWN its pivot's -Y; "forward" is +Z; pitch angles are positive forward, in the walking plane;
//   - a pivot group's rotation.x = -pitch (three.js rotates +Y toward +Z for positive x, so the minus keeps "forward");
//   - a child's world pitch is the SUM of the chain's rotations. A foot meant to stay level needs
//     ankle = -(sum of the joints above it, as rotation.x values), i.e. with hip rot = -hip and knee rot = +knee,
//     ankle rot = hip - knee. Check this numerically (references/accuracy.md), never by eye.
import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** quintic smoothstep 0..1 (zero velocity AND acceleration at the ends: mechanical-looking ease) */
export const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
/** frame-rate-independent exponential approach of a toward b at rate k (1/s) */
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const mod = (a, m) => ((a % m) + m) % m;

/**
 * Two-link IK in a plane: the root pivot at (0, 0), the target end at (z, y) (y negative = below), links L1 and L2.
 * Returns the root pitch and the middle joint's flexion (deg, flexion >= 0 bends the second link back), plus the
 * middle and end points. The reach is clamped 1 mm short of straight so the solve never goes NaN.
 */
export function twoLinkIK(z, y, L1, L2) {
  const D = Math.min(Math.hypot(z, y), L1 + L2 - 1);
  const k = Math.acos(clamp((D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
  const a = Math.atan2(z, -y);
  const b = Math.atan2(L2 * Math.sin(k), L1 + L2 * Math.cos(k));
  const root = a + b;
  const mid = [L1 * Math.sin(root), -L1 * Math.cos(root)];
  const end = [mid[0] + L2 * Math.sin(root - k), mid[1] - L2 * Math.cos(root - k)];
  return {root: root * R2D, flex: k * R2D, mid, end, clamped: Math.hypot(z, y) > L1 + L2 - 1};
}

/** a point s along a segment hanging from O at pitch a (rad), and n ahead of it: [z, y] */
export const onSeg = (O, a, s, n) => [O[0] + s * Math.sin(a) + n * Math.cos(a), O[1] - s * Math.cos(a) + n * Math.sin(a)];

/** a cylinder between anchor points P and Q: its length and its lever arm about joint J (the force's moment arm) */
export function lineArm(P, Q, J) {
  const L = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  const u = [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L];
  return {L, arm: Math.abs((J[0] - P[0]) * u[1] - (J[1] - P[1]) * u[0])};
}

/**
 * The stride that keeps a planted foot planted. If the gait phase advances at `rate` cycles/s and a foot is down
 * for `duty` of each cycle, a stance foot must travel back S = v * duty / rate (v in mm/s) relative to the hip.
 * Change the speed and the rate together through this, or the feet skate.
 */
export const strideFor = (vMmPerS, duty, rate) => (rate > 1e-6 ? (vMmPerS * duty) / rate : 0);

/**
 * Hydraulic cylinders aimed between two moving anchors. Each anchor is {obj, off: [x, y, z]} (mm in obj's frame).
 *   const struts = makeStruts({body: M.mid, end: M.dark, rod: M.steel, eye: M.iron, hose: M.rubber});
 *   struts.add(pelvis, {obj: pelvis, off: [0, 150, 120]}, {obj: thigh, off: [0, -230, 125]}, {rb: 46, rr: 22, body: 230});
 *   ... each frame, after posing the joints and root.updateMatrixWorld(true):  struts.pose();
 * The rod slides out of the barrel; the barrel keeps its length. Size `body` so the rod never leaves the barrel at the
 * longest pose (check the max length in your kinematics).
 */
export function makeStruts(M) {
  const list = [];
  const V3 = THREE.Vector3;
  const Y = new V3(0, 1, 0);
  const tA = new V3();
  const tB = new V3();
  const d = new V3();
  const mesh = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cy = (r, l, s = 28) => new THREE.CylinderGeometry(r, r, l, s);
  const cx = (r, l, s = 20) => new THREE.CylinderGeometry(r, r, l, s).rotateZ(Math.PI / 2);
  const add = (parent, A, B, {rb, rr, body, hoses = true, mat}) => {
    const g = new THREE.Group();
    parent.add(g);
    mesh(g, cy(rb, body), mat ?? M.body).position.y = body / 2;
    mesh(g, cy(rb + 6, 30), M.end ?? M.body).position.y = body - 15;
    mesh(g, cy(rb + 4, 40), M.end ?? M.body).position.y = 20;
    const rod = mesh(g, cy(rr, 1, 20), M.rod);
    const eye = mesh(g, cx(rr + 14, 70), M.eye ?? M.rod);
    mesh(g, cx(rb + 10, 70), M.eye ?? M.rod);
    if (hoses && M.hose) {
      // one hose per port, run tight along the barrel to the base end, where the supply line would enter
      const r0 = rb + 14;
      const top = new THREE.CatmullRomCurve3([new V3(rb, body - 30, 0), new V3(r0, body - 45, 0), new V3(r0 + 4, body * 0.5, 6), new V3(r0, 70, 10), new V3(rb + 4, 30, 12)]);
      mesh(g, new THREE.TubeGeometry(top, 24, 8, 8, false), M.hose);
      mesh(g, cy(13, 24, 10).rotateZ(Math.PI / 2).translate(rb + 6, body - 30, 0), M.rod, false); // the port fitting
      mesh(g, cy(13, 24, 10).rotateZ(Math.PI / 2).translate(rb + 6, 40, -14), M.rod, false);
    }
    const s = {g, A, B, body, rod, eye, parent, offset: new V3(), length: 0};
    list.push(s);
    return s;
  };
  const poseOne = (s) => {
    s.A.obj.localToWorld(tA.set(...s.A.off));
    s.B.obj.localToWorld(tB.set(...s.B.off));
    s.parent.worldToLocal(tA);
    s.parent.worldToLocal(tB);
    d.copy(tB).sub(tA);
    const L = d.length();
    s.g.position.copy(tA).add(s.offset);
    s.g.quaternion.setFromUnitVectors(Y, d.normalize());
    const rodLen = Math.max(10, L - s.body + 60);
    s.rod.scale.y = rodLen;
    s.rod.position.y = L - rodLen / 2;
    s.eye.position.y = L;
    s.length = L;
    return L;
  };
  return {add, list, pose: () => list.forEach(poseOne)};
}

// ------------------------------------------------------------------ mechanisms
/**
 * Circle-circle intersection: the point at distance r0 from p0 and r1 from p1 ([x, y]), the branch chosen by pick.
 * This one function solves any planar linkage exactly: walk the joints outward from the driven one, each joint the
 * intersection of the two links that hold it. No IK, no iteration, no drift.
 *   const B = circles(A, j, PIVOT, b, hiY);
 */
export function circles(p0, r0, p1, r1, pick) {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const D = Math.hypot(dx, dy);
  const A = (r0 * r0 - r1 * r1 + D * D) / (2 * D);
  const H = Math.sqrt(Math.max(0, r0 * r0 - A * A)); // > 0 unless the links can't reach: check reachable()
  const mx = p0[0] + (A * dx) / D;
  const my = p0[1] + (A * dy) / D;
  return pick([mx + (H * dy) / D, my - (H * dx) / D], [mx - (H * dy) / D, my + (H * dx) / D]);
}
/** branch pickers for circles(): the higher / lower / left / right of the two solutions */
export const hiY = (s, t) => (s[1] > t[1] ? s : t);
export const loY = (s, t) => (s[1] < t[1] ? s : t);
export const loX = (s, t) => (s[0] < t[0] ? s : t);
export const hiX = (s, t) => (s[0] > t[0] ? s : t);
/** can links r0 from p0 and r1 from p1 meet at all? (test every joint over a full cycle when you design a linkage) */
export const reachable = (p0, r0, p1, r1) => {
  const D = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return D <= r0 + r1 && D >= Math.abs(r0 - r1);
};

/**
 * Slider-crank (pistons, pumps, shapers): crank radius r, rod length L, crank angle th (rad, 0 = crank toward the
 * slider), slider offset e from the crank axis. Returns the pin's distance along the slide and the crank pin point.
 */
export function sliderCrank(r, L, th, e = 0) {
  const px = r * Math.cos(th);
  const py = r * Math.sin(th);
  return {s: px + Math.sqrt(L * L - (py - e) ** 2), pin: [px, py]};
}

/**
 * The angle of a gear meshing with a driver. Driver: z1 teeth, at angle th1 (rad). Driven: z2 teeth, its centre in
 * direction phi from the driver's centre (rad, 0 = +X). Uses the tooth phase of shapes.gear() (a tooth on +X at 0),
 * so a tooth of one always sits in a gap of the other. Chain it for a train: each gear meshes with the previous one.
 */
export const meshAngle = (th1, z1, z2, phi = 0) => phi + Math.PI - Math.PI / z2 - (z1 / z2) * (th1 - phi);
/** centre distance of two meshing gears of module m */
export const centreDistance = (z1, z2, m) => ((z1 + z2) * m) / 2;
/** rack and pinion: rack travel for a pinion turn (rad), and the turn for a travel. Pitch radius rp = m * z / 2 */
export const rackTravel = (th, rp) => th * rp;
export const pinionTurn = (x, rp) => x / rp;

/** aim a part between two points: puts obj at their midpoint with its +Y along A->B; returns the length.
 *  For rods, links and tie bars whose geometry is a unit-length (or fixed-length) bar along Y. */
const _d = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
export function aim(obj, A, B, {stretch = false} = {}) {
  _d.subVectors(B, A);
  const L = _d.length();
  obj.position.addVectors(A, B).multiplyScalar(0.5);
  obj.quaternion.setFromUnitVectors(_Y, _d.multiplyScalar(1 / L));
  if (stretch) obj.scale.set(obj.scale.x, L, obj.scale.z);
  return L;
}

/**
 * Many links in one draw call: an InstancedMesh of unit tubes (radius 1, length 1 along Y), each placed between two
 * points every frame. Use it when a mechanism has dozens of identical links (a linkage per leg, truss members).
 *   const links = instancedLinks(material, 200);  scene.add(links.mesh);
 *   each frame: links.begin(); links.link(A, B, r); ...; links.end();
 */
export function instancedLinks(material, count, {radial = 16, open = true} = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, radial, 1, open), material, count);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const M4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const mid = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let i = 0;
  return {
    mesh,
    begin: () => (i = 0),
    link(A, B, r) {
      dir.subVectors(B, A);
      const L = dir.length();
      mid.addVectors(A, B).multiplyScalar(0.5);
      q.setFromUnitVectors(_Y, dir.multiplyScalar(1 / L));
      M4.compose(mid, q, sc.set(r, L, r));
      mesh.setMatrixAt(i++, M4);
    },
    end() {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Tabulate a quantity that has to be integrated over a cycle (the body travel of a many-legged walker from its feet's
 * stance velocities, a cam's accumulated lift) once at load, then read it at any phase by interpolation. Keeps the
 * per-frame pose a pure function of the input.
 *   const travel = tabulate((u, prev, du) => prev + speedAt(u) * du, 1440);   travel(u) for u in 0..1 (and beyond)
 */
export function tabulate(step, n = 1440) {
  const T = new Float64Array(n + 1);
  for (let k = 1; k <= n; k++) T[k] = step(k / n, T[k - 1], 1 / n);
  const per = T[n];
  return (u) => {
    const turns = Math.floor(u);
    const x = (u - turns) * n;
    const k = Math.floor(x);
    return turns * per + T[k] + (T[Math.min(n, k + 1)] - T[k]) * (x - k);
  };
}
