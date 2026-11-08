// F-16C Fighting Falcon (Block 50/52): the published geometry and control limits, and everything derived from them.
// No three.js here, so `node -e "import('./kin.js').then(m => console.log(m.selfTest()))"` checks it on its own.
// Units: mm and degrees. s = station, measured aft from the pitot tip; x = out along the left wing; y = up from the ground.
const IN = 25.4;
const FT = 12 * IN;
const T = (d) => Math.tan((d * Math.PI) / 180);

/** published figures (Lockheed Martin / USAF fact sheet, General Dynamics design data) */
export const SPEC = {
  length: 15060, // 49 ft 5 in, pitot tip to nozzle exit
  height: 4880, // 16 ft, ground to fin tip (USAF fact sheet)
  spanRails: 31 * FT, // 9.45 m over the wingtip launcher rails
  spanMissiles: 32 * FT + 8 * IN, // 9.96 m over the AIM-9 fins
  wingArea: 300 * FT * FT, // 27.87 m², reference area: the trapezoid carried to the centre line
  AR: 3.0,
  taper: 0.2275,
  sweepLE: 40,
  airfoil: 'NACA 64A204',
  hTailSpan: 18 * FT + 3.75 * IN, // 5.58 m, stabilator tip to tip
  hTailSweepLE: 40,
  hTailAnhedral: 10,
  vTailSweepLE: 47.5,
  wheelbase: 4000, // 13 ft 1.5 in
  track: 2360, // 7 ft 9 in
  tyreMain: 27.75 * IN, // 27.75 x 8.75-14.5
  tyreMainW: 8.75 * IN,
  tyreNose: 18 * IN, // 18 x 5.7-8
  tyreNoseW: 5.7 * IN,
  macPublished: 11.32 * FT, // 3.45 m
};

/** the reference wing, from area, aspect ratio and taper alone */
export const WING = (() => {
  const b = Math.sqrt(SPEC.AR * SPEC.wingArea); // span of the theoretical wing
  const cr = (2 * SPEC.wingArea) / (b * (1 + SPEC.taper)); // root chord at the centre line
  const ct = cr * SPEC.taper;
  const l = SPEC.taper;
  const mac = ((2 / 3) * cr * (1 + l + l * l)) / (1 + l);
  const semi = b / 2;
  const teS = 11800; // trailing edge station (measured off the side view; the TE is unswept, see below)
  const leRoot = teS - cr; // theoretical root LE at the centre line
  const leTip = leRoot + semi * T(SPEC.sweepLE);
  const sweepTE = (Math.atan((leTip + ct - teS) / semi) * 180) / Math.PI;
  return {b, semi, cr, ct, mac, teS, leRoot, leTip, sweepTE, y: 1760};
})();
/** leading edge station at span x: the strake (LEX, an ogee measured off the plan view) blends into the 40° edge */
const LEX = [[300, 2900], [500, 3650], [700, 4750], [900, 5850], [1100, 6930], [1300, WING.leRoot + 1300 * T(SPEC.sweepLE)]];
export const leAt = (x) => {
  if (x >= 1300) return WING.leRoot + x * T(SPEC.sweepLE);
  for (let i = 1; i < LEX.length; i++)
    if (x <= LEX[i][0]) {
      const [x0, s0] = LEX[i - 1], [x1, s1] = LEX[i];
      return s0 + ((s1 - s0) * (x - x0)) / (x1 - x0);
    }
  return LEX[0][1];
};
export const chordAt = (x) => WING.teS - leAt(x);

/** control surfaces: hinge lines and the published travel limits (F-16 flight manual, -1) */
export const SURF = {
  lef: {x: [1300, WING.semi], chord: [520, 300], range: [-2, 25]}, // leading-edge flaps, full span outboard of the LEX
  flaperon: {x: [820, 2950], hingeS: WING.teS - 680, range: [-23, 20]}, // up / down
  stab: {range: [-25, 25], roll: 5}, // all-moving stabilators, ±5° of it differential for roll
  rudder: {range: [-30, 30], chord: 600, h: [180, 1950]},
  speedbrake: {max: 60},
  rollFlaperon: 20,
};

/** horizontal tail (stabilators): exposed root at x 720 on the tail boom, projected span to ±hTailSpan/2 */
export const STAB = (() => {
  const xr = 880;
  const xt = SPEC.hTailSpan / 2;
  const leR = 12450;
  const cr = 2250;
  const ct = 800;
  const leT = leR + (xt - xr) * T(SPEC.hTailSweepLE);
  return {xr, xt, leR, cr, ct, leT, pivotS: 13300, y: 1770};
})();
/** fin: root on the spine, tip at the published height */
export const FIN = (() => {
  const yRoot = 2370;
  const h = SPEC.height - yRoot;
  const leR = 11000;
  const cr = 3300;
  const ct = 1050;
  const leT = leR + h * T(SPEC.vTailSweepLE);
  return {yRoot, h, leR, cr, ct, leT, teR: leR + cr, teT: leT + ct};
})();
/** landing gear, from the wheelbase and track */
export const GEAR = {noseS: 5200, mainS: 5200 + SPEC.wheelbase, track: SPEC.track, rMain: SPEC.tyreMain / 2, rNose: SPEC.tyreNose / 2};
/** F110 nozzle (estimated: hinge, petal length chosen so the dry nozzle ends at the published length) */
export const NOZ = {s: 14300, r0: 560, rDry: 455, rWet: 560, n: 16};
NOZ.len = (SPEC.length - NOZ.s) / Math.cos(Math.atan((NOZ.r0 - NOZ.rDry) / (SPEC.length - NOZ.s)));

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** stick and pedals (-1..1) to surface angles, the way the F-16's flight control computer mixes them (simplified):
 *  positive stab = trailing edge up (nose up), positive flaperon = trailing edge down, positive rudder = TE right (right pedal) */
export function mix({pitch = 0, roll = 0, yaw = 0, flaps = 0, lef = 0}) {
  const sp = pitch * SURF.stab.range[1];
  const sr = roll * SURF.stab.roll;
  const fr = roll * SURF.rollFlaperon;
  const [fu, fd] = SURF.flaperon.range;
  return {
    stabL: clamp(sp - sr, -25, 25), // roll right (+): left stab TE down, right TE up
    stabR: clamp(sp + sr, -25, 25),
    flapL: clamp(flaps + fr, fu, fd), // left flaperon down for a right roll
    flapR: clamp(flaps - fr, fu, fd),
    rudder: yaw * SURF.rudder.range[1],
    lef: clamp(lef, SURF.lef.range[0], SURF.lef.range[1]),
  };
}

export function selfTest() {
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const r = {
    spanTheoretical: +WING.b.toFixed(0),
    rootChord: +WING.cr.toFixed(0),
    tipChord: +WING.ct.toFixed(0),
    mac: +WING.mac.toFixed(0),
    macPublished: +SPEC.macPublished.toFixed(0),
    sweepTE: +WING.sweepTE.toFixed(3),
    stabTipTE: +(STAB.leT + STAB.ct).toFixed(0),
    finTipTE: +FIN.teT.toFixed(0),
    nozzlePetal: +NOZ.len.toFixed(1),
  };
  r.ok = near(WING.mac, SPEC.macPublished, 10) && near(WING.sweepTE, 0, 0.1) && STAB.leT + STAB.ct <= SPEC.length && near((WING.b * WING.b) / SPEC.wingArea, 3, 1e-9);
  return r;
}
