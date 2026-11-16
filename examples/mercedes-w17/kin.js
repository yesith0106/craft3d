// Kinematics of the W17, no three.js in here: run `node src/model/kin.js` for the self-test.
//   speed  -> each wheel's rotation by rolling without slip (front and rear radii differ, so the axles turn at
//             different speeds; in a corner each wheel follows its own radius about the turn centre)
//   steer  -> steering wheel -> pinion -> rack travel -> two fixed-length track rods -> each upright turns about its
//             own inclined kingpin (solved, not assumed: the Ackermann the linkage really gives is reported)
//   aero   -> 0 corner mode (flaps closed, full downforce) .. 1 straight mode (flaps open, low drag)
//   ride   -> sprung-mass heave: the body moves, the tyres stay on the ground
// Vectors here are in the model frame, mm: x to the left, y up, z forward; the front axle line is z = 0 for the
// steering geometry (the model adds its own offset).
export const D2R = Math.PI / 180;

export const K = {
  wheelbase: 3400, // [reg] C2.3.5 maximum, used in full by every 2026 car
  trackF: 1620, // [reg-derived] 1900 overall width - 280 front tyre
  trackR: 1525, // [reg-derived] 1900 - 375 rear tyre
  rF: 352.5, // [spec] Pirelli 2026 front 705 mm diameter
  rR: 355, // [spec] Pirelli 2026 rear 710 mm diameter
  lockSW: 180, // [est] steering wheel lock, each way
  rackPerDeg: 0.205, // [est] mm of rack per degree of steering wheel (a 23.5 mm pitch-diameter pinion: pi x 23.5 / 360)
  // left front corner [est from photos]: lower and upper ball joints (the kingpin), the track-rod's outer joint on the
  // upright's steering arm (ahead of the axle, level with the upper wishbone) and its inner joint on the rack end
  steerGeo: {lbj: [722, 178, 8], ubj: [700, 545, -14], arm: [730, 520, 112], rack: [132, 520, 70]},
  frontFlapOpen: 24, // [est] deg the front upper flap drops in straight mode (reg: about its own axis, <= 400 ms)
  rearFlapOpen: 30, // [est] deg the rear flap pair opens about its axis in straight mode
  aeroTime: 0.4, // [reg] C3.10.10(o) / C3.11.6(d): 400 ms maximum transition
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => a.map((v) => v / len(a));
/** p turned by angle a (rad) about the unit axis k through the origin (Rodrigues) */
export const rot = (p, k, a) => {
  const c = Math.cos(a), s = Math.sin(a), kxp = cross(k, p), kp = dot(k, p) * (1 - c);
  return [p[0] * c + kxp[0] * s + k[0] * kp, p[1] * c + kxp[1] * s + k[1] * kp, p[2] * c + kxp[2] * s + k[2] * kp];
};
export const kingpin = (g = K.steerGeo) => unit(sub(g.ubj, g.lbj));
export const rodLength = (g = K.steerGeo) => len(sub(g.arm, g.rack));

/** the left upright's steer angle (rad, + = toe to the left) for a rack moved d mm to the left: the angle that
 *  keeps the track rod its own length */
export function uprightAngle(d, g = K.steerGeo) {
  const k = kingpin(g), L = rodLength(g), arm = sub(g.arm, g.lbj), E = [g.rack[0] + d, g.rack[1], g.rack[2]];
  const f = (a) => len(sub(add(g.lbj, rot(arm, k, a)), E)) - L;
  let a0 = 0, a1 = d * 0.008 || 1e-4;
  let f0 = f(a0), f1 = f(a1);
  for (let i = 0; i < 40 && Math.abs(f1) > 1e-10; i++) {
    const a2 = a1 - (f1 * (a1 - a0)) / (f1 - f0 || 1e-12);
    a0 = a1;
    f0 = f1;
    a1 = a2;
    f1 = f(a1);
  }
  return a1;
}
/** how far the track rod is from its own length at that pose (mm): 0 when the linkage is solved */
export function rodError(d, a, g = K.steerGeo) {
  const arm = sub(g.arm, g.lbj);
  return len(sub(add(g.lbj, rot(arm, kingpin(g), a)), [g.rack[0] + d, g.rack[1], g.rack[2]])) - rodLength(g);
}

/** steering-wheel angle (deg, + = left) -> rack travel, the two front wheel angles (deg), the turn radius (mm) */
export function steer(swDeg, k = K) {
  const rack = swDeg * k.rackPerDeg;
  const left = uprightAngle(rack, k.steerGeo) / D2R;
  const right = -uprightAngle(-rack, k.steerGeo) / D2R; // the right-hand corner is the left one mirrored
  const mean = (left + right) / 2;
  const R = Math.abs(mean) < 1e-9 ? Infinity : k.wheelbase / Math.tan(mean * D2R); // signed: + = centre to the left
  return {left, right, R, mean, rack};
}
/** the angles a perfect Ackermann linkage would give for the same mean angle, and how much of it this one has */
export function ackermann(swDeg, k = K) {
  const s = steer(swDeg, k);
  if (!isFinite(s.R)) return {ideal: {left: 0, right: 0}, percent: 0};
  const t = 2 * (k.steerGeo.lbj[0] + ((k.steerGeo.ubj[0] - k.steerGeo.lbj[0]) * (k.rF - k.steerGeo.lbj[1])) / (k.steerGeo.ubj[1] - k.steerGeo.lbj[1])) / 2;
  const il = Math.atan(k.wheelbase / (s.R - t)) / D2R, ir = Math.atan(k.wheelbase / (s.R + t)) / D2R;
  return {ideal: {left: il, right: ir}, percent: (100 * (s.left - s.right)) / (il - ir)};
}

/** path radius (mm) of each wheel centre about the turn centre; Infinity when straight */
export function pathRadii(swDeg, k = K) {
  const {R} = steer(swDeg, k);
  if (!isFinite(R)) return {FL: Infinity, FR: Infinity, RL: Infinity, RR: Infinity, R};
  const L = k.wheelbase;
  return {
    FL: Math.hypot(L, R - k.trackF / 2),
    FR: Math.hypot(L, R + k.trackF / 2),
    RL: Math.abs(R - k.trackR / 2),
    RR: Math.abs(R + k.trackR / 2),
    R,
  };
}
/** the ground speed (mm/s) under each wheel centre when the rear-axle centre moves at v */
export function wheelGround(v, swDeg = 0, k = K) {
  const p = pathRadii(swDeg, k);
  const f = (r) => (isFinite(p.R) ? r / Math.abs(p.R) : 1);
  return {FL: v * f(p.FL), FR: v * f(p.FR), RL: v * f(p.RL), RR: v * f(p.RR)};
}
/** wheel angular speeds (rad/s): ground speed over rolling radius, no slip */
export function wheelOmega(v, swDeg = 0, k = K) {
  const g = wheelGround(v, swDeg, k);
  return {FL: g.FL / k.rF, FR: g.FR / k.rF, RL: g.RL / k.rR, RR: g.RR / k.rR};
}

/** the lowest point of a tyre below its hub when the axle is tilted: profile [[r, a]...] (a along the axle), ay = the
 *  axle direction's vertical component. A steered wheel on an inclined kingpin cambers, so its contact patch moves. */
export function tyreDrop(profile, ay) {
  const c = Math.sqrt(Math.max(0, 1 - ay * ay));
  let m = Infinity;
  for (const [r, a] of profile) m = Math.min(m, a * ay - r * c, -a * ay - r * c);
  return -m;
}

/** flap angles (deg of opening) for the active-aero state a = 0 (corner) .. 1 (straight) */
export const aero = (a, k = K) => ({front: k.frontFlapOpen * a, rear: k.rearFlapOpen * a});

export const kmh = (v) => (v * 1e6) / 3600; // km/h -> mm/s
export const rpm = (w) => (w * 60) / (2 * Math.PI);

export function selfTest() {
  const out = [];
  const ok = (name, got, want, tol) => out.push({name, got: +(+got).toFixed(4), want, pass: Math.abs(got - want) <= tol});
  // 1. rolling: at 300 km/h the front wheel (r 352.5) and the rear (r 355) turn at different speeds
  const w = wheelOmega(kmh(300));
  ok('front rpm @300 km/h', rpm(w.FL), 300e6 / 60 / (2 * Math.PI * 352.5), 0.01);
  ok('rear rpm @300 km/h', rpm(w.RL), 300e6 / 60 / (2 * Math.PI * 355), 0.01);
  ok('front/rear speed ratio = rR/rF', w.FL / w.RL, 355 / 352.5, 1e-9);
  // by hand: 300 km/h = 83 333 mm/s; / (2 pi 352.5 = 2214.8 mm) = 37.63 rev/s = 2257.5 rpm
  ok('front rpm by hand', rpm(w.FL), 2257.5, 0.5);
  // 2. the steering linkage: the track rod keeps its length at every lock, both sides
  for (const sw of [30, 90, 180]) {
    const s = steer(sw);
    ok(`rod length error @${sw} deg, left (mm)`, rodError(s.rack, s.left * D2R), 0, 1e-6);
    ok(`rod length error @${sw} deg, right (mm)`, rodError(-s.rack, -s.right * D2R), 0, 1e-6);
    ok(`inner wheel turns more @${sw} deg`, s.left > s.right ? 1 : 0, 1, 0);
  }
  const full = steer(K.lockSW);
  ok('mean road-wheel angle at full lock within 15..21 deg', full.mean > 15 && full.mean < 21 ? 1 : 0, 1, 0);
  ok('rack travel at full lock (mm)', full.rack, K.lockSW * K.rackPerDeg, 1e-9);
  ok('ackermann between 0 and 100 %', ackermann(90).percent > 0 && ackermann(90).percent <= 100 ? 1 : 0, 1, 0);
  // 3. symmetric: steering right mirrors steering left
  ok('mirror', steer(-90).right, -steer(90).left, 1e-9);
  ok('straight ahead', steer(0).left, 0, 1e-12);
  // 4. no slip in a corner: wheel angle x radius = distance along that wheel's own path
  const sw = 120, v = kmh(80), T = 2;
  const om = wheelOmega(v, sw), g = wheelGround(v, sw);
  ok('no-slip FL in a corner (mm)', om.FL * T * K.rF - g.FL * T, 0, 1e-6);
  ok('no-slip RR in a corner (mm)', om.RR * T * K.rR - g.RR * T, 0, 1e-6);
  ok('outer rear faster than inner rear', om.RR > om.RL ? 1 : 0, 1, 0);
  // 5. an upright wheel sits its radius above the ground; a cambered one a little lower at the hub
  ok('tyre drop upright', tyreDrop([[352.5, 0], [350, 100]], 0), 352.5, 1e-9);
  ok('tyre drop cambered is larger', tyreDrop([[352.5, 0], [350, 100]], 0.05) > 352.5 ? 1 : 0, 1, 0);
  // 6. active aero end stops
  ok('front flap straight mode', aero(1).front, K.frontFlapOpen, 0);
  ok('rear flap corner mode', aero(0).rear, 0, 0);
  return {pass: out.every((o) => o.pass), tests: out, fullLock: full, ackermannPct: ackermann(90).percent};
}

if (typeof process !== 'undefined' && process.argv?.[1]?.replace(/\\/g, '/').endsWith('model/kin.js')) {
  const r = selfTest();
  for (const t of r.tests) console.log(t.pass ? 'ok  ' : 'FAIL', t.name.padEnd(52), t.got, 'want', +(+t.want).toFixed(4));
  console.log('full lock', JSON.stringify(r.fullLock), 'ackermann % @90', r.ackermannPct.toFixed(1));
  console.log(r.pass ? 'selfTest PASS' : 'selfTest FAIL');
  process.exit(r.pass ? 0 : 1);
}
