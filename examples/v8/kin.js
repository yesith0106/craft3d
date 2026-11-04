// Small-block V8 (Chevrolet 350 / 5.7 L) kinematics and gas dynamics. No three.js here: run it in node.
// Engine space, millimetres: crank axis along z (front = +z), y up, the crank turns clockwise seen from the front.
// Sources: published SBC 350 dimensions (bore 4.000", stroke 3.480", rod 5.700" centre to centre, bore spacing 4.400",
// deck height 9.025", compression height 1.560", 90° V, firing order 1-8-4-3-6-5-7-2, 1.5:1 rockers).
// Estimated (labelled): cam centre height, valve events, lift, the burn model's constants.
const IN = 25.4;
export const E = {
  bore: 4.0 * IN, // 101.6
  r: (3.48 * IN) / 2, // crank throw 44.196
  rod: 5.7 * IN, // 144.78
  spacing: 4.4 * IN, // 111.76
  deck: 9.025 * IN, // 229.235, crank axis to deck
  comp: 1.56 * IN, // 39.624, wrist pin to crown
  bankOff: 0.47 * IN, // the left bank sits forward of the right by one rod width (0.94"); +/- half of it
  cr: 10.5, // compression ratio (est.)
  camY: 4.5 * IN, // cam centre above the crank (est. 4.5")
  rocker: 1.5,
};
export const STROKE = 2 * E.r;
export const AREA = (Math.PI * (E.bore / 2000) ** 2); // m², 8.107e-3
export const DISPLACEMENT = 8 * AREA * (STROKE / 1000); // m³, 5.73e-3 = 350 cubic inches
const S = Math.SQRT1_2;
// bank frames in the XY plane: b along the bore (away from the crank), p across it, outward
export const BANK = {
  L: {b: [S, S], p: [S, -S]}, // the left (driver's) bank: +x
  R: {b: [-S, S], p: [-S, -S]},
};
// crank pins front to back, their angle clockwise from +y seen from the front at crank angle 0. Derived, not copied:
// cylinder c reaches TDC when its pin points along its bank; requiring the TDCs to fall in firing order every 90°
// gives exactly these four (a cross-plane crank). checkFiringOrder() proves it.
export const PIN_PHASE = [45, 135, -45, 225];
export const ORDER = [1, 8, 4, 3, 6, 5, 7, 2];
export const FIRE = Object.fromEntries(ORDER.map((c, i) => [c, 90 * i])); // crank degrees of each cylinder's firing TDC
// cylinders 1..8: odd on the left bank (1 at the front), even on the right
export const CYL = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
  const odd = c % 2 === 1;
  const pin = Math.floor((c - 1) / 2);
  const z0 = (1.5 - pin) * E.spacing;
  return {c, bank: odd ? 'L' : 'R', pin, z: z0 + (odd ? E.bankOff : -E.bankOff), k: pin};
});
export const PIN_Z = [0, 1, 2, 3].map((p) => (1.5 - p) * E.spacing);
export const MAIN_Z = [2, 1, 0, -1, -2].map((k) => k * E.spacing);
const D2R = Math.PI / 180;
export const mod = (a, m) => ((a % m) + m) % m;

export const pinXY = (p, th) => {
  const a = (th + PIN_PHASE[p]) * D2R;
  return [E.r * Math.sin(a), E.r * Math.cos(a)];
};
/** cylinder index i (0-based) at crank angle th (deg): wrist pin distance s along the bore, the crank pin, the pin point */
export const piston = (i, th) => {
  const cy = CYL[i];
  const B = BANK[cy.bank];
  const P = pinXY(cy.pin, th);
  const pb = P[0] * B.b[0] + P[1] * B.b[1];
  const pp = P[0] * B.p[0] + P[1] * B.p[1];
  const s = pb + Math.sqrt(E.rod * E.rod - pp * pp);
  return {s, P, pin: [s * B.b[0], s * B.b[1]]};
};
export const S_TDC = E.r + E.rod;
export const S_BDC = E.rod - E.r;
export const DECK_CLEAR = E.deck - (S_TDC + E.comp); // crown below the deck at TDC: 0.025" on a real SBC

/** four-stroke phase of cylinder c, degrees after its firing TDC: 0 power, 180 exhaust, 360 intake, 540 compression */
export const psi = (c, th) => mod(th - FIRE[c], 720);
export const STROKES = ['POWER', 'EXHAUST', 'INTAKE', 'COMPRESSION'];
export const strokeOf = (ps) => STROKES[Math.floor(mod(ps, 720) / 180)];

// valve events, degrees after firing TDC (est., a mild street cam: 260° intake, 260° exhaust, 0.45" valve lift)
// exhaust opens 64° before BDC and closes 16° after TDC; intake opens 22° before TDC, closes 58° after BDC
export const VALVE = {ex: [180 - 64, 360 + 16], in: [360 - 22, 540 + 58], lift: 0.45 * IN, lifter: (0.45 * IN) / E.rocker};
const bump = (ps, [a, b]) => {
  const x = mod(ps - a, 720) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
export const liftEx = (ps) => bump(ps, VALVE.ex); // 0..1
export const liftIn = (ps) => bump(ps, VALVE.in);
export const peakOf = (kind) => (kind === 'in' ? (VALVE.in[0] + VALVE.in[1]) / 2 : (VALVE.ex[0] + VALVE.ex[1]) / 2);

// ------------------------------------------------------------------ gas
/** piston position from TDC as a fraction of the stroke, at phase ps (deg) */
export const pistonFrac = (ps) => {
  const a = ps * D2R;
  const sp = E.r * Math.cos(a) + Math.sqrt(E.rod * E.rod - (E.r * Math.sin(a)) ** 2);
  return (S_TDC - sp) / STROKE;
};
/** volume in clearance volumes: 1 at TDC, cr at BDC */
export const volume = (ps) => 1 + (E.cr - 1) * pistonFrac(ps);
const BURN = 3.8; // peak over motored pressure (est.): tuned to 11 bar IMEP and a 68 bar peak at 13° ATDC, full throttle
/** chamber pressure, bar absolute. throttle 0..1 sets the manifold pressure (0.3 bar closed, 1.0 bar open) */
export const pressure = (ps, throttle = 1) => {
  ps = mod(ps, 720);
  const pm = 0.3 + 0.7 * throttle;
  const V = volume(ps);
  if (ps >= 360 && ps < 540) return pm; // intake
  if (ps >= 180 && ps < 360) return 1.05 + 1.5 * Math.max(0, 1 - (ps - 180) / 35); // exhaust, with the blowdown
  const comp = pm * Math.pow(E.cr / V, 1.32);
  if (ps >= 540) return comp; // compression
  // power: the burn develops over the first ~15° after TDC, then the gas expands polytropically
  const peak = BURN * pm * Math.pow(E.cr, 1.32) * Math.pow(1 / V, 1.28);
  const k = Math.min(1, ps / 15);
  return Math.max(1.05, comp + (peak - comp) * (k * k * (3 - 2 * k)));
};
/** instantaneous gas torque on the crank, N·m: each piston's net gas force times its lever (-ds/dθ) */
export const gasTorque = (th, throttle = 1) => {
  let T = 0;
  for (let i = 0; i < 8; i++) {
    const c = CYL[i].c;
    const ds = (piston(i, th + 0.05).s - piston(i, th - 0.05).s) / 0.1 / 1000 / D2R; // m per rad
    T += -(pressure(psi(c, th), throttle) - 1.0) * 1e5 * AREA * ds;
  }
  return T;
};
/** cycle-mean torque at a throttle, tabulated at load (11 throttle points) */
const MEAN = Array.from({length: 11}, (_, k) => {
  let s = 0;
  const N = 1440;
  for (let n = 0; n < N; n++) s += gasTorque((n / N) * 720, k / 10);
  return s / N;
});
export const meanTorque = (throttle) => {
  const u = Math.min(1, Math.max(0, throttle)) * 10;
  const k = Math.min(9, Math.floor(u));
  return MEAN[k] + (MEAN[k + 1] - MEAN[k]) * (u - k);
};
/** indicated mean effective pressure, bar: the mean torque over the displacement, 4π per cycle */
export const imep = (throttle) => (meanTorque(throttle) * 4 * Math.PI) / DISPLACEMENT / 1e5;

// ------------------------------------------------------------------ checks (run in node: node -e "import('./kin.js').then(k=>console.log(k.selfTest()))")
export function selfTest() {
  // firing order from geometry: at each cylinder's FIRE angle its piston must be at TDC (s = S_TDC)
  const tdcErr = Math.max(...CYL.map((cy, i) => Math.abs(piston(i, FIRE[cy.c]).s - S_TDC)));
  // and the order of compression TDCs over a cycle
  const seen = [];
  for (let th = 0; th < 720; th += 0.5) for (const cy of CYL) if (Math.abs(mod(th - FIRE[cy.c], 720)) < 0.25) seen.push(cy.c);
  return {
    displacementCI: +(DISPLACEMENT * 61023.7).toFixed(1),
    deckClearanceIn: +(DECK_CLEAR / IN).toFixed(4),
    tdcErrMm: +tdcErr.toFixed(6),
    order: seen.join('-'),
    imepWOT: +imep(1).toFixed(2),
    torqueWOT: +meanTorque(1).toFixed(0),
    torquePart: +meanTorque(0.4).toFixed(0),
  };
}
