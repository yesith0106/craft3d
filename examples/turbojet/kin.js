// A small single-spool axial turbojet: the gas path sized from its thermodynamics, not drawn by eye.
// No three.js here: run it in node.  node -e "import('./kin.js').then(k=>console.log(k.selfTest()))"
//
// The idea (from-idea, every number labelled): a 5-stage axial compressor at pressure ratio 4.5, an annular
// combustor to 1100 K, one turbine stage driving the compressor, a convergent nozzle. Sea-level static, design speed.
// The compressor's hub rises stage by stage because the air gets denser: at constant axial velocity, continuity
// (mass flow = density x area x velocity) fixes every annulus. The turbine's work equals the compressor's.
// Distances in mm along s, the flow path: s = 0 at the compressor face, increasing downstream.
export const AIR = {T0: 288.15, p0: 101.325, R: 287, cpA: 1005, gA: 1.4, cpG: 1148, gG: 1.333};
export const D = {
  PR: 4.5, // overall compressor pressure ratio (design choice)
  stages: 5,
  etaC: 0.86, // compressor polytropic-ish stage efficiency (est.)
  etaT: 0.88, // turbine efficiency (est.)
  etaM: 0.98, // shaft (bearings) efficiency
  TIT: 1100, // turbine inlet temperature, K (a modest uncooled turbine)
  burnLoss: 0.95, // combustor pressure ratio
  cAx: 150, // compressor axial velocity, m/s
  cAxT: [200, 255], // turbine inlet / exit axial velocity, m/s
  rTip: 90, // compressor tip radius, constant (constant-outer-diameter design), mm
  rHub0: 40, // first rotor hub radius, mm
  rHubT: 61, // turbine hub radius, mm
  clearC: 0.6, // tip clearance, compressor / turbine, mm
  clearT: 1.0,
  Ntip: 350, // first-rotor tip speed at design, m/s -> the design rpm
};
// station layout along s (mm): rotor and stator chords and gaps
export const ROW = {rotor: 22, stator: 20, gapRS: 6, gapSR: 8};
export const S = {
  nose: -70, // spinner tip
  igv: -26, // inlet guide vane centre
  c0: 0, // compressor face
  stage: ROW.rotor + ROW.gapRS + ROW.stator + ROW.gapSR, // 56 per stage
};
S.cEnd = S.c0 + D.stages * S.stage; // 280
S.diff = [S.cEnd, S.cEnd + 40]; // diffuser
S.comb = [S.cEnd + 40, S.cEnd + 160]; // combustor liner
S.ngv = S.comb[1] + 22; // nozzle guide vane centre
S.tr = S.ngv + 34; // turbine rotor centre
S.tailEnd = S.tr + 150; // tail cone tip
S.exit = S.tr + 130; // nozzle exit plane

const DESIGN_RPM = (D.Ntip / (D.rTip / 1000)) * (60 / (2 * Math.PI)); // 37,136 rpm
export const RPM = DESIGN_RPM;

// ------------------------------------------------------------------ the cycle at design
const kA = (AIR.gA - 1) / AIR.gA;
const kG = (AIR.gG - 1) / AIR.gG;
const piStage = Math.pow(D.PR, 1 / D.stages);
/** stage-by-stage compressor: T (K) and p (kPa) after each stage, index 0 = the face */
export const STAGES = (() => {
  const out = [{T: AIR.T0, p: AIR.p0}];
  for (let i = 0; i < D.stages; i++) {
    const a = out[i];
    out.push({T: a.T * (1 + (Math.pow(piStage, kA) - 1) / D.etaC), p: a.p * piStage});
  }
  return out;
})();
const T2 = STAGES[D.stages].T;
const p2 = STAGES[D.stages].p;
const p3 = p2 * D.burnLoss;
// turbine: its work drives the compressor (per kg, through the shaft efficiency)
const dTt = (AIR.cpA * (T2 - AIR.T0)) / (AIR.cpG * D.etaM);
const T4 = D.TIT - dTt;
const piT = Math.pow(1 - dTt / (D.etaT * D.TIT), -1 / kG); // turbine pressure ratio
const p4 = p3 / piT;
// convergent nozzle, choked if p4 / p0 > the critical ratio
const crit = Math.pow((AIR.gG + 1) / 2, AIR.gG / (AIR.gG - 1));
const choked = p4 / AIR.p0 > crit;
const T5 = choked ? (2 * T4) / (AIR.gG + 1) : T4 * Math.pow(AIR.p0 / p4, kG);
const p5 = choked ? p4 / crit : AIR.p0;
const V5 = Math.sqrt(2 * AIR.cpG * (T4 - T5));
export const CYCLE = {T2, p2, T3: D.TIT, p3, T4, p4, piT, T5, p5, V5, choked};

const rho = (pk, T) => (pk * 1000) / (AIR.R * T);
const A0 = Math.PI * ((D.rTip / 1000) ** 2 - (D.rHub0 / 1000) ** 2); // m²
export const MDOT = rho(AIR.p0, AIR.T0) * D.cAx * A0; // kg/s (static air at the face: a simplification)
/** hub radius that passes the design mass flow at (p, T, axial velocity) under a tip radius rt (mm) */
const hubFor = (pk, T, c, rt) => Math.sqrt(Math.max(0, (rt / 1000) ** 2 - MDOT / (rho(pk, T) * c) / Math.PI)) * 1000;
const tipFor = (pk, T, c, rh) => Math.sqrt((rh / 1000) ** 2 + MDOT / (rho(pk, T) * c) / Math.PI) * 1000;
export const HUB_C = STAGES.map((st) => hubFor(st.p, st.T, D.cAx, D.rTip)); // hub after each stage (0 = face)
export const TIP_T = [tipFor(p3, D.TIT, D.cAxT[0], D.rHubT), tipFor(p4, T4, D.cAxT[1], D.rHubT)]; // turbine in / out

// the nozzle exit area that passes the flow (choked: at sonic speed) -> its exit radius around the tail cone
const A5 = MDOT / (rho(p5, T5) * V5);
export const R_EXIT = Math.sqrt(A5 / Math.PI + 0.028 ** 2) * 1000; // around a 28 mm tail-cone tip radius
export const THRUST = MDOT * V5 + (p5 - AIR.p0) * 1000 * A5; // N, static

// ------------------------------------------------------------------ rows
/** the blade rows, in flow order, each with its centre s, hub, tip, count, stagger */
export const ROWS = (() => {
  const rows = [];
  rows.push({kind: 'igv', s: S.igv, rh: D.rHub0 - 4, rt: D.rTip + D.clearC, z: 19, chord: 18, stag: [0, 0], camber: 0, thick: 0.1});
  for (let i = 0; i < D.stages; i++) {
    const s0 = S.c0 + i * S.stage;
    const hIn = HUB_C[i];
    const hOut = HUB_C[i + 1];
    const sr = s0 + ROW.rotor / 2;
    const ss = s0 + ROW.rotor + ROW.gapRS + ROW.stator / 2;
    const hR = hIn + (hOut - hIn) * (sr - s0) / S.stage;
    const hS = hIn + (hOut - hIn) * (ss - s0) / S.stage;
    // rotors lean into the spin (+), stators turn the flow back; the tips are more staggered (more blade speed)
    rows.push({kind: 'rotor', stage: i, s: sr, rh: hR, rt: D.rTip, z: [21, 23, 25, 27, 29][i], chord: ROW.rotor, stag: [34, 56], camber: 0.07, thick: 0.08});
    rows.push({kind: 'stator', stage: i, s: ss, rh: hS, rt: D.rTip + D.clearC, z: [26, 28, 30, 32, 34][i], chord: ROW.stator, stag: [-30, -30], camber: 0.06, thick: 0.08});
  }
  rows.push({kind: 'ngv', s: S.ngv, rh: D.rHubT, rt: TIP_T[0] + D.clearT, z: 25, chord: 26, stag: [-52, -52], camber: 0.13, thick: 0.14});
  rows.push({kind: 'turbine', s: S.tr, rh: D.rHubT, rt: (TIP_T[0] + TIP_T[1]) / 2, z: 37, chord: 24, stag: [58, 62], camber: 0.15, thick: 0.12});
  return rows;
})();

// ------------------------------------------------------------------ the gas path, for drawing and flow lines
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (pts, s) => {
  if (s <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (s <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (s - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return pts[pts.length - 1][1];
};
// hub (inner wall) and casing (outer wall) radii along s
const HUB_PTS = [
  [S.c0 - 10, D.rHub0],
  ...HUB_C.map((h, i) => [S.c0 + i * S.stage, h]),
  [S.diff[1], HUB_C[D.stages] - 8],
  [S.comb[0] + 10, 52],
  [S.comb[1], 52],
  [S.ngv - 14, D.rHubT],
  [S.tr + 14, D.rHubT],
  [S.tr + 24, D.rHubT - 4],
  [S.tailEnd, 28],
];
const TIP_PTS = [
  [S.c0 - 50, D.rTip + D.clearC],
  [S.cEnd, D.rTip + D.clearC],
  [S.diff[1], 108],
  [S.comb[1] - 6, 108],
  [S.ngv - 14, TIP_T[0] + D.clearT],
  [S.tr - 12, TIP_T[0] + D.clearT],
  [S.tr + 12, TIP_T[1] + D.clearT],
  [S.tr + 24, TIP_T[1] + D.clearT],
  [S.exit, R_EXIT],
];
export const hubAt = (s) => seg(HUB_PTS, s);
export const casingAt = (s) => seg(TIP_PTS, s);
export const HUB_PROFILE = HUB_PTS;
export const CASING_PROFILE = TIP_PTS;

/** static temperature along the flow, K: stage by stage through the compressor, the burn, the turbine, the nozzle */
export function tempAt(s) {
  if (s < S.c0) return AIR.T0;
  if (s < S.cEnd) {
    const x = (s - S.c0) / S.stage;
    const i = Math.min(D.stages - 1, Math.floor(x));
    const f = x - i;
    // the rise happens across each rotor (the work goes in there), the stator only turns the flow
    const k = Math.min(1, f / ((ROW.rotor + ROW.gapRS) / S.stage));
    return lerp(STAGES[i].T, STAGES[i + 1].T, k * k * (3 - 2 * k));
  }
  if (s < S.comb[0] + 20) return T2;
  if (s < S.comb[1]) {
    const k = (s - S.comb[0] - 20) / (S.comb[1] - S.comb[0] - 20);
    return lerp(T2, D.TIT, Math.min(1, k * 1.6)); // most of the heat is released in the front of the liner
  }
  if (s < S.tr - 12) return D.TIT;
  if (s < S.tr + 12) return lerp(D.TIT, T4, (s - S.tr + 12) / 24);
  if (s < S.exit) return lerp(T4, T5, (s - S.tr - 12) / (S.exit - S.tr - 12));
  return T5;
}
/** the swirl a fluid particle picks up (radians of turn around the axis per mm along s): rotors add it, stators
 *  and nozzle guide vanes set it, the turbine takes it out. Illustrative, not a flow solution. */
export function swirlAt(s) {
  for (const r of ROWS) {
    const d = Math.abs(s - r.s);
    if (d < r.chord / 2) {
      const a = (r.chord / 2 - d) / (r.chord / 2);
      const sign = {igv: 0, rotor: 1, stator: -1, ngv: -1.6, turbine: 1.6}[r.kind];
      return sign * 0.012 * a;
    }
  }
  if (s > S.comb[0] && s < S.comb[1]) return 0.004; // the swirlers at the dome
  return 0;
}

// ------------------------------------------------------------------ off-design (simple scaling, labelled)
/** at a fraction n of design speed: pressure rise per stage ~ n², mass flow ~ n, thrust ~ n³ (fan-law scaling) */
export const atSpeed = (n) => {
  const k = Math.max(0, n);
  return {rpm: RPM * k, mdot: MDOT * k, pr: 1 + (D.PR - 1) * k * k, thrust: THRUST * k * k * k};
};

// ------------------------------------------------------------------ checks
export function selfTest() {
  // continuity: density x area x axial velocity must be the same at every compressor station
  const flows = STAGES.map((st, i) => rho(st.p, st.T) * Math.PI * ((D.rTip / 1000) ** 2 - (HUB_C[i] / 1000) ** 2) * D.cAx);
  const contErr = Math.max(...flows.map((f) => Math.abs(f / MDOT - 1)));
  // work balance: turbine work x shaft efficiency = compressor work
  const work = (AIR.cpG * (D.TIT - T4) * D.etaM) / (AIR.cpA * (T2 - AIR.T0)) - 1;
  return {
    designRpm: Math.round(RPM),
    mdotKgS: +MDOT.toFixed(2),
    compressorExitK: +T2.toFixed(1),
    compressorExitKPa: +p2.toFixed(1),
    turbineExitK: +T4.toFixed(1),
    turbinePR: +piT.toFixed(2),
    nozzleChoked: choked,
    jetMS: Math.round(V5),
    thrustN: Math.round(THRUST),
    specificThrust: Math.round(THRUST / MDOT),
    hubRadii: HUB_C.map((h) => +h.toFixed(1)),
    turbineTips: TIP_T.map((t) => +t.toFixed(1)),
    exitRadius: +R_EXIT.toFixed(1),
    continuityErr: +contErr.toExponential(1),
    workBalanceErr: +work.toExponential(1),
  };
}
