// Mercedes-AMG F1 W17 E Performance (2026 regulations), to scale. The dimension sheet is params.js, the kinematics
// kin.js (node src/model/kin.js runs its self-test), the paint livery.js, the lofting helpers geo.js.
//
// Frames: car frame (s behind the front axle, h above the ground, x to the left) -> model mm (X = x, Y = h,
// Z = 1700 - s). root is scaled 0.001. The sprung mass hangs in `car` (it heaves with the ride slider); the four
// wheel assemblies stand on the ground in root; the suspension members are re-aimed between the two every frame.
import * as THREE from 'three';
import {box, rb, cylX, cylY, cylZ, ringText} from '../craft/shapes.js';
import {aim} from '../craft/rig.js';
import {P} from './params.js';
import * as kin from './kin.js';
import {ZF, zOf, V, pchip, table, sstep, lerp, loft, ring, scaled, wing, onFoil, mixStation, sweepTube, mirrorX, merge, patch} from './geo.js';
import {COL, makeLivery, bodyMaterial, decalTexture, decalMaterial, WORDS} from './livery.js';
import {tyreMaterial} from './tyre.js';

export const info = {
  name: 'Mercedes-AMG F1 W17 E Performance',
  description: '2026 F1 car · 3400 wheelbase · 1900 wide · active aero · push-rod front and rear',
  stage: 'studio',
  floor: 'shadow',
  wear: false,
};

const RH = P.RH;
const D2R = Math.PI / 180;
const RF = P.tyreF.D / 2, RR = P.tyreR.D / 2;

// ================================================================== shape tables (car frame, mm)
// chassis + nose: half-width w, top t, bottom b, lower exponent nB.  [photo] top view widths: 105 at s -927, 148 at
// the front axle, 220 at s 618; side view top line: 300 at the tip rising 0.234 mm/mm to 640 at s 300.
// [reg] app. C2 13: survival cell at least 268 wide x 300 tall at XC-2030, 490 x 415 at XC-875; nose tip Z 125..645
const CH = table(['w', 't', 'b', 'nB'], [
  [-1150, 10, 293, 281, 2.6], [-1143, 42, 300, 274, 2.6], [-1128, 68, 307, 266, 2.6], [-1095, 88, 318, 255, 2.6], [-1000, 100, 340, 258, 2.6],
  [-900, 106, 364, 266, 2.6], [-700, 114, 410, 283, 2.6], [-400, 124, 482, 292, 2.8], [-100, 142, 556, 280, 3], [150, 168, 612, 268, 3],
  [400, 196, 648, 250, 2.6], [650, 228, 664, 200, 2.1], [850, 270, 672, 135, 2.1], [1000, 300, 680, 100, 2.6], [1250, 322, 694, 91, 3.4],
  [1500, 330, 706, 91, 3.4], [1750, 325, 716, 91, 3.4], [1900, 310, 720, 91, 3.4], [2100, 270, 700, 91, 3.4],
]);
const CH_NT = 3;
const chRing = (s, N = 96) => {
  const c = CH(s);
  return ring(s, {w: c.w, t: c.t, b: c.b, yc: c.b + (c.t - c.b) * 0.56, nT: CH_NT, nB: c.nB, N});
};
/** the chassis skin's half-width at station s and height h (suspension pick-ups sit on it) */
const chassisX = (s, h) => {
  const c = CH(s);
  const yc = c.b + (c.t - c.b) * 0.56;
  const [n, e] = h >= yc ? [CH_NT, (h - yc) / (c.t - yc)] : [c.nB, (yc - h) / (yc - c.b)];
  return c.w * Math.max(0, 1 - Math.min(1, e) ** n) ** (1 / n);
};
// cockpit opening: [reg] the driver's opening template is about 850 long x 450..520 wide; [photo] halo inner 1211..1746
const CK = {s0: 1015, s1: 1795, w: 248, floor: 440};
const ckF = (s, x) => {
  const u = (s - CK.s0) / (CK.s1 - CK.s0);
  if (u <= 0 || u >= 1) return -1;
  return 1 - (Math.abs(2 * u - 1) ** 3 + (Math.abs(x) / CK.w) ** 2.4);
};

// engine cover: a bell section. wB = half-width below the shoulder, ys = shoulder height, wS = spine half-width,
// t = top. [photo] side view spine 952 at s 2322, 879 at 2727, 839 at 3132, fin ends s 3193; [reg] RV-EC: the spine
// volume is 25 wide each side up to Z 970 at XC+500 falling to Z 825 at XR-150
const EC = table(['wB', 'ys', 'wS', 't', 'p'], [
  [1840, 318, 664, 58, 860, 1], [1950, 316, 660, 64, 950, 1], [2100, 312, 654, 66, 984, 1], [2300, 300, 636, 58, 956, 1.1], [2500, 280, 590, 44, 922, 1.4],
  [2700, 252, 540, 30, 886, 1.9], [2900, 222, 492, 20, 860, 2.4], [3100, 190, 452, 12, 840, 2.6], [3195, 173, 436, 10, 830, 2.6], [3225, 168, 430, 10, 700, 1.6],
  [3300, 152, 416, 14, 604, 1.2], [3430, 124, 396, 20, 520, 1],
]);
function bellRing(s) {
  const c = EC(s);
  const b = 90;
  // a tent: full width up to ys, then an S-curve in to the spine, which is a thin fin toward the back (p > 1)
  const capH = c.wS * 1.5;
  const y1 = c.ys, y2 = Math.max(c.ys + 20, c.t - capH - 14);
  const y3 = c.t - capH;
  const right = [];
  const push = (x, y) => right.push([x, y]);
  for (let i = 0; i < 4; i++) push(c.wB, lerp(b, y1, i / 4));
  for (let i = 0; i < 20; i++) {
    const y = lerp(y1, y2, i / 20);
    push(c.wS + (c.wB - c.wS) * (1 - sstep(y1, y2, y)) ** c.p, y);
  }
  for (let i = 0; i < 2; i++) push(c.wS, lerp(y2, y3, i / 2));
  for (let i = 0; i <= 7; i++) {
    const a = ((i / 8) * Math.PI) / 2;
    push(c.wS * Math.cos(a), y3 + capH * Math.sin(a));
  }
  const out = right.map(([x, y]) => [x, y, zOf(s)]);
  out.push([0, c.t, zOf(s)]);
  for (let i = right.length - 1; i >= 0; i--) out.push([-right[i][0], right[i][1], zOf(s)]);
  return out;
}
// airbox / roll hoop intake. [photo] inlet front s 1804..1829, top 993 above ground, underside 810, about 205 wide
const AB = table(['w', 't', 'b'], [[1800, 100, 1006, 824], [1900, 108, 1010, 816], [2050, 104, 1002, 832], [2200, 86, 984, 862], [2400, 52, 940, 892]]);
const abRing = (s) => {
  const c = AB(s);
  return ring(s, {w: c.w, t: c.t, b: c.b, yc: c.b + (c.t - c.b) * 0.42, nT: 2.1, nB: 3.2, N: 48});
};
// sidepods: inner / outer-at-shoulder / outer-at-belly, top, bottom. [photo] top view shoulder line 695 at s 1449,
// 602 at 2117, 465 at 2472, 303 at 2781, 245 at 3065; side view inlet lip at s 973, top 627, undercut to h 509 at the
// inlet; [reg] RV-SIDEPOD XF 900..1300, Y <= 715, Z 125..600; RV-EC Y <= 715 to XR-1500 then 575 at XR-500
const SP = table(['in', 'oT', 'oB', 't', 'b'], [
  [960, 262, 690, 690, 636, 548], [1040, 256, 700, 700, 642, 518], [1150, 246, 705, 705, 646, 445], [1300, 236, 705, 705, 648, 335],
  [1450, 226, 698, 712, 646, 228], [1600, 205, 686, 715, 642, 150], [1800, 170, 660, 715, 638, 106], [2100, 150, 606, 700, 628, 92],
  [2400, 135, 500, 630, 596, 92], [2700, 115, 352, 520, 536, 92], [3000, 95, 258, 390, 440, 92], [3250, 75, 188, 262, 350, 92],
]);
// the shoulder edge: the top surface falls away outboard to this height (the teal line runs along it).
// [photo] side view: 598 at s 1185, 566 at 1377, 482 at 1781, 465 from 2300 to 2690; bars' inner edge at 631
const SHO = pchip([[960, 632], [1150, 634], [1300, 604], [1500, 556], [1800, 498], [2100, 478], [2400, 468], [2740, 458], [3000, 396], [3250, 340]]);
const spRing = (s, N = 56) => {
  const c = SP(s);
  const x0 = (c.in + c.oT) / 2, w = (c.oT - c.in) / 2, yc = c.b + (c.t - c.b) * 0.6;
  const hS = Math.min(c.t, Math.max(SHO(s), yc + 12));
  return ring(s, {w, t: c.t, b: c.b, yc, nT: 3.4, nB: 2.6, N, x0}).map((p) => {
    if (p[0] > x0 && p[1] < yc) p[0] += (c.oB - c.oT) * ((yc - p[1]) / (yc - c.b)) * ((p[0] - x0) / w);
    // the downwash top: it drops from the cockpit side to the shoulder edge
    if (p[1] > yc) p[1] -= (c.t - hS) * Math.min(1, Math.max(0, (p[0] - c.in) / (c.oT - c.in))) ** 1.35 * ((p[1] - yc) / (c.t - yc));
    return p;
  });
};
// gearbox case and rear impact structure. [reg] RV-TAIL: 145 half-wide, Z 175..500, to XDIF 760; final drive Z 260..280
const TL = table(['w', 't', 'b'], [[3100, 150, 430, 150], [3400, 138, 446, 190], [3650, 108, 432, 222], [3900, 78, 416, 262], [P.tailEnd, 52, 410, 300]]);
const tlRing = (s) => {
  const c = TL(s);
  return ring(s, {w: c.w, t: c.t, b: c.b, nT: 4, nB: 4, N: 40});
};
const tailX = (s, h) => TL(s).w * 0.96;
// floor: half-width by station. [reg] RV-FLOOR-BIB from XF 425, RV-FLOOR-BODY 770 at XF 1100 -> 700 at XR -335,
// 365 between the rear wheels to XR +300
const FLW = pchip([[430, 60], [520, 110], [800, 205], [1050, 290], [1090, 520], [1135, 758], [1300, 762], [3040, 700], [3100, 600], [3170, 420], [3260, 366], [3700, 366]]);
const DIFF = pchip([[2800, 0], [3050, 100], [3700, 175]]); // [reg] the diffuser roof: Z 75 -> 175 -> 250
const diffW = pchip([[2800, 700], [3065, 480], [3200, 520], [3700, 520]]);
const floorH = (s, x) => {
  const ax = Math.abs(x);
  const lip = 16 * sstep(FLW(s) - 70, FLW(s), ax) * sstep(1100, 1250, s) * (1 - sstep(2900, 3060, s));
  const up = s > 2800 ? DIFF(s) * (1 - sstep(diffW(s) - 110, diffW(s), ax)) : 0;
  return RH + 58 + lip + up;
};

// ================================================================== wings (car frame stations)
// front wing, left half; mirrored for the right. [reg] RV-FW-PROFILES: XF -1250..-475 behind the swept section plane,
// Z 60..200 on the centre line, up to 300 at Y 400, 115..275 at Y 675. [photo] top view: main plane leading edge
// -1190 at the centre, -1085 at 300, about -900 at the endplate; flap stack ends -575 at 300 and -545 at the tip
const FW = {
  main: [
    {x: 0, s: -1178, h: 142, chord: 250, alpha: 2, tc: 0.12, camber: 0.07},
    {x: 110, s: -1160, h: 145, chord: 250, alpha: 2, tc: 0.12, camber: 0.08},
    {x: 300, s: -1085, h: 150, chord: 215, alpha: 3, tc: 0.12, camber: 0.09},
    {x: 480, s: -975, h: 165, chord: 205, alpha: 4, tc: 0.12, camber: 0.09},
    {x: 648, s: -905, h: 160, chord: 190, alpha: 5, tc: 0.12, camber: 0.08},
  ],
  flap1: [
    {x: 96, s: -930, h: 168, chord: 110, alpha: 12, tc: 0.1, camber: 0.1},
    {x: 300, s: -893, h: 176, chord: 150, alpha: 16, tc: 0.1, camber: 0.11},
    {x: 480, s: -793, h: 193, chord: 150, alpha: 17, tc: 0.1, camber: 0.11},
    {x: 648, s: -738, h: 190, chord: 135, alpha: 16, tc: 0.1, camber: 0.1},
  ],
  flap2: [
    {x: 100, s: -842, h: 200, chord: 95, alpha: 20, tc: 0.09, camber: 0.1},
    {x: 300, s: -770, h: 228, chord: 205, alpha: 27, tc: 0.09, camber: 0.12},
    {x: 480, s: -671, h: 247, chord: 150, alpha: 26, tc: 0.09, camber: 0.12},
    {x: 590, s: -640, h: 240, chord: 118, alpha: 23, tc: 0.09, camber: 0.11},
    {x: 648, s: -628, h: 236, chord: 105, alpha: 22, tc: 0.09, camber: 0.1},
  ],
};
// rear wing: [reg] RV-RW-PROFILES XR 165..630, |Y| <= 575, Z 725..880 on the centre line, 785..880 at the tips
const XR = (v) => P.wheelbase + v;
const RW = {
  main: [
    {x: 0, s: XR(178), h: RH + 805, chord: 300, alpha: 6, tc: 0.13, camber: 0.1},
    {x: 300, s: XR(178), h: RH + 812, chord: 298, alpha: 5.5, tc: 0.13, camber: 0.095},
    {x: P.rw.half, s: XR(180), h: RH + 828, chord: 285, alpha: 3, tc: 0.12, camber: 0.07},
  ],
  flap1: [
    {x: 0, s: XR(462), h: RH + 826, chord: 105, alpha: 22, tc: 0.1, camber: 0.1},
    {x: 300, s: XR(460), h: RH + 830, chord: 104, alpha: 21, tc: 0.1, camber: 0.1},
    {x: P.rw.half - 22, s: XR(452), h: RH + 844, chord: 100, alpha: 16, tc: 0.1, camber: 0.08},
  ],
  flap2: [
    {x: 0, s: XR(548), h: RH + 848, chord: 78, alpha: 24, tc: 0.09, camber: 0.09},
    {x: 300, s: XR(548), h: RH + 850, chord: 77, alpha: 23, tc: 0.09, camber: 0.09},
    {x: P.rw.half - 22, s: XR(540), h: RH + 862, chord: 75, alpha: 14, tc: 0.09, camber: 0.07},
  ],
  pivot: {s: XR(590), h: RH + 860}, // [reg] C3.11.6(b): between the flap's mid-point and its rearmost point
};
const stAt = (list, x) => {
  const ax = Math.abs(x);
  let i = 0;
  while (i < list.length - 2 && ax > list[i + 1].x) i++;
  const A = list[i], B = list[i + 1];
  const o = mixStation(A, B, Math.min(1, Math.max(0, (ax - A.x) / (B.x - A.x))));
  o.x = x;
  return o;
};
/** stations for a full-span element: the left half mirrored, sampled every `step` for a smooth sweep */
const spanStations = (list, x0, x1, step = 40) => {
  const out = [];
  const n = Math.max(1, Math.round(Math.abs(x1 - x0) / step));
  for (let i = 0; i <= n; i++) out.push(stAt(list, lerp(x0, x1, i / n)));
  return out;
};

// front wing endplate outline, shared by the plate and the decals on it
const EP = {
  top: pchip([[-990, 236], [-770, 410], [-470, 412], [-400, 330]]),
  bot: pchip([[-990, 112], [-470, 112], [-400, 150]]),
  x: (s) => 652 + 16 * ((s + 990) / 590) ** 2,
};
// halo: centre pylon to the junction, then one arm per side back to the cockpit flank (model points)
const HALO = {
  jn: [0, 852, 1012],
  arm: (sg) => [V(0, 852, 1012), V(sg * 120, 870, 1085), V(sg * 232, 880, 1225), V(sg * 282, 874, 1400), V(sg * 292, 854, 1560), V(sg * 288, 812, 1690), V(sg * 280, 748, 1770)],
  a: 34, b: 25,
};

// ================================================================== suspension pick-ups (car frame: x, h, s)
// Push-rod at both ends [spec]. Wishbone layout [photo]: front upper wishbone high on the chassis flank, forward leg
// near square to the car, rear leg swept back with its inboard end lower (anti-dive); rear with anti-lift (inboard
// height differences noted by G. Anderson, the-race.com). Exact pick-up coordinates [est].
const SUS = {
  front: {
    hub: [P.trackF / 2, RF, 0],
    lbj: [kin.K.steerGeo.lbj[0], kin.K.steerGeo.lbj[1], -kin.K.steerGeo.lbj[2]], ubj: [kin.K.steerGeo.ubj[0], kin.K.steerGeo.ubj[1], -kin.K.steerGeo.ubj[2]],
    members: [
      {n: 'upper fwd', out: [700, 545, 14], in: [null, 592, -130], a: 30, b: 8},
      {n: 'upper rear', out: [700, 545, 14], in: [null, 536, 540], a: 30, b: 8},
      {n: 'lower fwd', out: [722, 178, -8], in: [null, 318, -170], a: 34, b: 9},
      {n: 'lower rear', out: [722, 178, -8], in: [null, 286, 480], a: 34, b: 9},
      {n: 'push rod', out: [668, 212, 0], in: [null, 574, 120], a: 15, b: 11, slide: true},
      // the track rod runs from the rack end to the steering arm: both points are the kinematics module's own
      {n: 'track rod', out: [kin.K.steerGeo.arm[0], kin.K.steerGeo.arm[1], -kin.K.steerGeo.arm[2]], in: [kin.K.steerGeo.rack[0], kin.K.steerGeo.rack[1], -kin.K.steerGeo.rack[2]], a: 24, b: 7, rack: true},
    ],
  },
  rear: {
    hub: [P.trackR / 2, RR, P.wheelbase],
    members: [
      {n: 'upper fwd', out: [620, 548, 3410], in: [null, 470, 2960], a: 32, b: 9},
      {n: 'upper rear', out: [620, 548, 3410], in: [null, 425, 3520], a: 32, b: 9},
      {n: 'lower fwd', out: [640, 182, 3400], in: [null, 215, 2990], a: 36, b: 9},
      {n: 'lower rear', out: [640, 182, 3400], in: [null, 240, 3540], a: 36, b: 9},
      {n: 'push rod', out: [610, 218, 3392], in: [null, 492, 3260], a: 15, b: 11, slide: true},
      {n: 'toe link', out: [632, 300, 3530], in: [null, 292, 3600], a: 24, b: 7},
      {n: 'driveshaft', out: [560, RR, 3400], in: [null, RH + 272, 3400], a: 34, b: 30},
    ],
  },
};

// ================================================================== the studio
// A black and silver car in the engine's pale studio reflects grey everywhere. This swaps in a dark studio: soft boxes
// overhead and along the sides in the reflections, a dark floor that dissolves into a dark backdrop.
function dressStage(stage, root) {
  if (!stage?.scene || !stage.renderer) return;
  const {scene, renderer} = stage;
  const HORIZON = '#22282b';
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#0d1113');
  gr.addColorStop(0.42, '#1a2326');
  gr.addColorStop(0.5, HORIZON);
  gr.addColorStop(1, HORIZON);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 512);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  const e = new THREE.Scene();
  e.background = new THREE.Color('#0b0d0e');
  const softbox = (w, h, pos, k, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
    m.position.copy(pos);
    m.lookAt(0, 0, 0);
    e.add(m);
  };
  softbox(9, 16, new THREE.Vector3(0, 12, 0), 1.9); // the big overhead box, long axis along the car
  softbox(2.5, 18, new THREE.Vector3(-11, 5, 2), 4.2); // strips down both sides
  softbox(2.5, 18, new THREE.Vector3(11, 5, -2), 3.0);
  softbox(14, 2.5, new THREE.Vector3(0, 3, 13), 1.4); // front and rear kickers
  softbox(14, 2.5, new THREE.Vector3(0, 4, -13), 1.6, [0.75, 1, 0.97]);
  const fl = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#26292b', side: THREE.DoubleSide}));
  fl.rotation.x = -Math.PI / 2;
  fl.position.y = -1.5;
  e.add(fl);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(e, 0.02).texture;
  scene.environmentIntensity = 1.25;
  pm.dispose();
  scene.traverse((o) => {
    if (o.isHemisphereLight) o.intensity = 0.5;
    if (o.isDirectionalLight) {
      o.intensity = 3.1;
      o.shadow.radius = 5; // one soft-edged sun shadow
      o.shadow.blurSamples = 16;
    }
  });
  if (stage.ground) stage.ground.visible = false; // the stage's own shadow catcher would double the shadow on our floor
  scene.fog = new THREE.Fog(HORIZON, 14, 46);
  renderer.toneMappingExposure = 1.18;
  // the floor: polished dark screed (root is in mm)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60000, 64), new THREE.MeshStandardMaterial({color: '#2a2d30', roughness: 0.42, metalness: 0}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  floor.receiveShadow = true;
  floor.userData.realOnly = true;
  floor.name = 'studio floor';
  root.add(floor);
  // the floor takes no screen-space AO (thin wing elements smear blotches on it); the contact shadow is a soft
  // plan-view blob under the car instead
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 1024;
  const cg = cv.getContext('2d');
  const X = (x) => 256 + x * (512 / 3000), Z = (s) => (s + 1500) * (1024 / 6000);
  cg.filter = 'blur(14px)';
  const blob = (s0, s1, hw, al) => {
    cg.fillStyle = `rgba(0,0,0,${al})`;
    cg.beginPath();
    cg.roundRect(X(-hw), Z(s0), X(hw) - X(-hw), Z(s1) - Z(s0), 18);
    cg.fill();
  };
  blob(-1100, -450, 820, 0.42);
  blob(-1050, 450, 150, 0.4);
  blob(450, 3650, 690, 0.62);
  blob(3500, 4100, 520, 0.3);
  for (const [s, x, w] of [[0, 810, 140], [3400, 762, 188]]) for (const sg of [1, -1]) {
    cg.fillStyle = 'rgba(0,0,0,0.85)';
    cg.beginPath();
    cg.ellipse(X(sg * x), Z(s), (w * 512) / 3000, (150 * 1024) / 6000, 0, 0, Math.PI * 2);
    cg.fill();
  }
  const ct = new THREE.CanvasTexture(cv);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(3000, 6000), new THREE.MeshBasicMaterial({map: ct, transparent: true, depthWrite: false, color: '#000000', opacity: 0.9}));
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, -0.6, ZF - 1500);
  contact.userData.realOnly = true;
  contact.name = 'contact shadow';
  contact.renderOrder = 1;
  root.add(contact);
  stage.noAO?.push(floor, contact);
}

// ================================================================== build
export function build({stage}) {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  dressStage(stage, root);
  const car = new THREE.Group();
  car.name = 'sprung';
  root.add(car);

  const L = {number: '63', topH: (s) => CH(s).t, shoulderH: (s) => SHO(s), podEdge: (s) => SP(s).oT};
  const livery = makeLivery(L);
  const M = {
    livery: bodyMaterial(livery, {shade: true}),
    carbon: bodyMaterial(null, {shade: true}),
    carbonP: bodyMaterial(null, {}),
    link: bodyMaterial(null, {weave: 0, gloss: 0.7, rough: 0.38}),
    teal: new THREE.MeshPhysicalMaterial({color: COL.teal, roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.12}),
    matt: new THREE.MeshStandardMaterial({color: '#0c0c0d', roughness: 0.92, metalness: 0}),
    rubber: new THREE.MeshStandardMaterial({color: '#141414', roughness: 0.86, metalness: 0}),
    rim: new THREE.MeshStandardMaterial({color: '#19191b', roughness: 0.44, metalness: 0.75, side: THREE.DoubleSide}),
    ti: new THREE.MeshStandardMaterial({color: '#8f8b85', roughness: 0.38, metalness: 1}),
    spoke: new THREE.MeshStandardMaterial({color: '#202022', roughness: 0.4, metalness: 0.8}),
    steel: new THREE.MeshStandardMaterial({color: '#b9bcc0', roughness: 0.3, metalness: 1}),
    plank: new THREE.MeshStandardMaterial({color: '#2b241d', roughness: 0.8, metalness: 0}),
    mirror: new THREE.MeshStandardMaterial({color: '#dfe3e6', roughness: 0.04, metalness: 1}),
    red: new THREE.MeshStandardMaterial({color: '#3a0605', emissive: '#ff1a10', emissiveIntensity: 0.85, roughness: 0.4}),
    nut: new THREE.MeshStandardMaterial({color: '#a5c400', roughness: 0.45, metalness: 0.6}),
    tcam: new THREE.MeshPhysicalMaterial({color: '#0b0b0c', roughness: 0.4, clearcoat: 0.6}),
    helmet: new THREE.MeshPhysicalMaterial({color: '#11141a', roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1}),
    helmetTop: new THREE.MeshPhysicalMaterial({color: '#d9dadb', roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1}),
    visor: new THREE.MeshPhysicalMaterial({color: '#060708', roughness: 0.08, metalness: 0.6, clearcoat: 1}),
    foam: new THREE.MeshStandardMaterial({color: '#151517', roughness: 0.7}),
  };
  const add = (parent, geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };
  const decals = new THREE.Group();
  decals.name = 'decals';
  car.add(decals);
  const addDecal = (parent, geo, tex) => {
    const m = new THREE.Mesh(geo, decalMaterial(tex));
    m.userData.realOnly = true;
    m.renderOrder = 2;
    parent.add(m);
    return m;
  };

  // thin plates as lofts, so they can curve: along s (endplates, boards, fences) or up h (the rear endplate's S-bend)
  const ribbon = (st, t) => loft(st.map((q) => [[q.x - t / 2, q.h0, zOf(q.s)], [q.x + t / 2, q.h0, zOf(q.s)], [(q.x1 ?? q.x) + t / 2, q.h1, zOf(q.s)], [(q.x1 ?? q.x) - t / 2, q.h1, zOf(q.s)]]), {angle: 30});
  const hPlate = (lv, t) => loft(lv.map((q) => [[q.x - t / 2, q.h, zOf(q.s0)], [q.x - t / 2, q.h, zOf(q.s1)], [q.x + t / 2, q.h, zOf(q.s1)], [q.x + t / 2, q.h, zOf(q.s0)]]), {angle: 30});
  /** a thin slab: at each station a loop across x (nx columns) with its top at hFn(s, x), t thick */
  const slab = (stations, wFn, hFn, t, nx = 40) =>
    loft(stations.map((s) => {
      const w = wFn(s);
      const topR = [], bot = [];
      for (let i = 0; i <= nx; i++) {
        const x = lerp(-w, w, i / nx);
        topR.push([x, hFn(s, x), zOf(s)]);
        bot.push([x, hFn(s, x) - t, zOf(s)]);
      }
      return [...topR, ...bot.reverse()];
    }), {angle: 35});
  const range = (a, b, step) => {
    const out = [];
    const n = Math.max(1, Math.round((b - a) / step));
    for (let i = 0; i <= n; i++) out.push(lerp(a, b, i / n));
    return out;
  };

  // ------------------------------------------------------------------ painted bodywork (one mesh, the projected livery)
  const painted = [];
  {
    // nose + survival cell, with the cockpit opening pressed into it
    const st = [...range(-1150, -1095, 6), ...range(-1060, 960, 40), ...range(980, 1820, 14), ...range(1860, 2100, 60)];
    const rings = st.map((s) =>
      chRing(s).map((p) => {
        const F = ckF(s, p[0]);
        if (F > 0 && p[1] > CK.floor) {
          const m = sstep(0, 0.1, F);
          p[1] = lerp(p[1], CK.floor, m);
          p[3] = 1 - sstep(0.02, 0.1, F);
        }
        return p;
      }));
    painted.push(loft(rings, {angle: 42}));
    // engine cover and spine fin
    painted.push(loft([...range(1840, 3180, 20), 3195, 3204, 3214, 3225, ...range(3250, 3430, 30)].map(bellRing), {angle: 55}));
    // airbox: the skin starts inside the duct, comes forward round the lip and runs back
    const lip = abRing(1800);
    painted.push(loft([scaled(lip, 0.74, 1980, 0), scaled(lip, 0.8, 1816, 0), scaled(lip, 0.88, 1802, 0.4), scaled(lip, 0.955, 1796), scaled(lip, 1, 1801), ...range(1830, 2400, 30).map(abRing)], {angle: 50}));
    // sidepods, the same way round their inlet lips
    const il = spRing(960, 72);
    const pod = loft([scaled(il, 0.66, 1200, 0), scaled(il, 0.76, 990, 0), scaled(il, 0.86, 964, 0.4), scaled(il, 0.95, 956), scaled(il, 1, 961), ...range(990, 3250, 20).map((s) => spRing(s, 72))], {angle: 55});
    painted.push(pod, mirrorX(pod));
  }
  add(car, merge(painted), M.livery, 'bodywork');

  // ------------------------------------------------------------------ carbon: floor, tail, wings, boards (merged)
  const carbon = [];
  const tealG = [];
  {
    // floor with the diffuser roof rising between the rear wheels; the stepped centre section and the plank under it
    carbon.push(slab([...range(430, 1080, 50), ...range(1090, 1140, 10), ...range(1180, 3030, 55), ...range(3045, 3270, 15), ...range(3300, 3700, 45)], FLW, floorH, 9, 44));
    const boatW = pchip([[430, 50], [1250, 270], [1400, 310], [2350, 310], [2700, 250], [2880, 130]]); // [reg] 4.1, at 0.8 scale
    carbon.push(slab(range(430, 2880, 60), boatW, () => RH + 56, 56, 8));
    // diffuser side walls and strakes (they also carry the rear wing endplates) [reg] RV-FLOOR-SIDEWALL Y 345..365
    for (const sg of [1, -1]) {
      carbon.push(ribbon(range(3100, 3700, 40).map((s) => ({s, x: sg * 366, h0: RH + 38, h1: floorH(s, 0) + 12})), 6));
      for (const [x0, splay] of [[118, 0.03], [242, 0.06]])
        carbon.push(ribbon(range(3130, 3700, 38).map((s) => ({s, x: sg * (x0 + (s - 3130) * splay), h0: RH + 40 + (s - 3130) * 0.09, h1: floorH(s, 0) - 5})), 5));
      // floor-edge fences at the leading edge [reg] RV-FLOOR-LED: XF 1075..1225, Y 310..600, Z 50..150
      [350, 465, 585].forEach((x0, i) => carbon.push(ribbon(range(1096 + i * 14, 1290, 16).map((s) => ({s, x: sg * (x0 + 70 * ((s - 1090) / 200) ** 1.6), h0: RH + 54, h1: RH + 54 + (70 - i * 10) * sstep(1096 + i * 14, 1150 + i * 14, s)})), 4)));
    }
    // gearbox and crash structure, tailpipe [reg] RV-TAILPIPE XR -55..400, Z 350..550
    carbon.push(loft(range(3100, P.tailEnd, 60).map(tlRing), {angle: 40}));
  }
  const plankW = pchip([[430, 60], [690, 125], [2100, 125], [3050, 50]]);
  add(car, slab(range(432, 3050, 80), plankW, () => RH, P.floor.plankT, 6), M.plank, 'plank');
  // titanium skid blocks let into the plank [reg] C3.6: metallic skid mandatory at the forward hole
  add(car, merge([[700, 150], [1900, 150], [2950, 80]].map(([s, w]) => box(w, 3, 130, 0, RH - P.floor.plankT + 1, zOf(s)))), M.ti, 'skids');
  add(car, sweepTube([V(0, 470, 3340), V(0, 482, 3560), V(0, 492, XR(395))], 52, 52, {N: 24, steps: 12}), M.ti, 'tailpipe');
  add(car, cylZ(47, 10, 24).translate(0, 492, zOf(XR(395)) + 1), M.matt);

  // in-washing floor boards behind the front wheels [reg] RV-FLOOR-BOARD; front outboard, rear inboard
  const boardX = (s) => 878 - ((s - 690) / 600) * 150;
  const boardTop = pchip([[690, 300], [740, 335], [1000, 335], [1290, 248]]);
  for (const sg of [1, -1]) {
    carbon.push(ribbon(range(690, 1290, 30).map((s) => ({s, x: sg * boardX(s), h0: RH + 62, h1: boardTop(s)})), 6));
    // the foot plate that ties the board to the floor [reg] RV-FLOOR-FOOT, and two slats under the board
    const foot = loft(range(700, 1300, 50).map((s) => {
      const xi = lerp(640, 700, (s - 700) / 600), xo = boardX(s) + 8;
      return [[sg * xi, RH + 66, zOf(s)], [sg * xo, RH + 66, zOf(s)], [sg * xo, RH + 59, zOf(s)], [sg * xi, RH + 59, zOf(s)]];
    }), {angle: 30});
    carbon.push(foot);
    for (const [hh, len] of [[112, 560], [142, 480]])
      carbon.push(loft(range(700, 700 + len, 40).map((s) => {
        const xo = boardX(s) + 46, xi = boardX(s) - 4;
        return [[sg * xi, hh + 3, zOf(s)], [sg * xo, hh + 8, zOf(s)], [sg * xo, hh + 3, zOf(s)], [sg * xi, hh - 2, zOf(s)]];
      }), {angle: 30}));
    // the board's stay back to the chassis flank
    carbon.push(sweepTube([V(sg * boardX(800), 300, 800), V(sg * 250, 318, 830)], 5, 5, {N: 8, steps: 2}));
  }

  // ---- front wing
  const fwPivot = {A: V(100, 200, -842), B: V(648, 236, -628)};
  const flapGroups = [];
  {
    // main plane right across, under the nose tip
    carbon.push(wing(spanStations(FW.main, -648, 648, 36), {m: 16}));
    const f1 = wing(spanStations(FW.flap1, 96, 648, 36), {m: 12});
    carbon.push(f1, mirrorX(f1));
    for (const sg of [1, -1]) {
      // endplate: [reg] RV-FWEP-BODY XF -1250..-300, Y 575..680, Z 75..375, top trimmed from Z 250 at XF -1050 to 375 at
      // XF -750, rear trimmed by the 925 mm cylinder about the axle; [photo] front top h 243, rear top h 406 at s -407
      const epTop = pchip([[-990, 236], [-770, 410], [-470, 412], [-400, 330]]);
      const epBot = pchip([[-990, 112], [-470, 112], [-400, 150]]);
      const epX = (s) => 652 + 16 * ((s + 990) / 590) ** 2;
      carbon.push(ribbon(range(-990, -400, 12).map((s) => ({s, x: sg * epX(s), h0: epBot(s), h1: epTop(s), x1: sg * (epX(s) + 6)})), 6));
      // footplate: an arched tunnel outboard of the endplate [reg] RV-FWEP-OFP Y 750..900, Z 75..170; IFP Y 560..750
      const arch = (s) => {
        const k = sstep(-985, -780, s) * (1 - 0.5 * sstep(-560, -420, s));
        const xo = lerp(760, P.fw.foot, sstep(-985, -780, s));
        const pts = [];
        for (let i = 0; i <= 22; i++) {
          const x = lerp(600, xo, i / 22);
          const u = Math.max(0, (x - 672) / (xo - 672));
          pts.push([x, 114 + 24 * k * Math.sin(Math.PI * u) ** 2]);
        }
        const top = pts.map(([x, h]) => [sg * x, h + 5, zOf(s)]);
        const bot = pts.map(([x, h]) => [sg * x, h, zOf(s)]).reverse();
        return [...top, ...bot];
      };
      carbon.push(loft(range(-980, -420, 20).map(arch), {angle: 60}));
      // diveplane on the endplate's outer face [reg] RV-FWEP-DIVEPLANE XF -950..-550, Y 575..900, Z 175..340
      const dv = [
        {x: 656, s: -700, h: 356, chord: 170, alpha: 8, tc: 0.07, camber: 0.08},
        {x: 730, s: -690, h: 360, chord: 150, alpha: 9, tc: 0.07, camber: 0.08},
        {x: 800, s: -670, h: 354, chord: 110, alpha: 7, tc: 0.07, camber: 0.07},
      ];
      const dg = wing(dv, {m: 8});
      carbon.push(sg > 0 ? dg : mirrorX(dg));
      // the two pylons that hang the wing from the nose [reg] RV-FW-PYLON; [photo] the nose stands clear of the main plane
      carbon.push(ribbon(range(-1010, -850, 40).map((s) => ({s, x: sg * 62, h0: stAt(FW.main, 62).h + 8, h1: CH(s).b + 6})), 7));
    }
    for (const sg of [1, -1]) for (const x of [190, 300, 410, 520]) {
      const a = stAt(FW.main, x), f = stAt(FW.flap1, x);
      const te = onFoil(a, 0.93, 0), le = onFoil(f, 0.2, 0);
      carbon.push(box(3, Math.abs(le[1] - te[1]) + 22, 36, sg * x, (le[1] + te[1]) / 2 + 2, (le[2] + te[2]) / 2));
    }
    // the upper flaps move: one group per side, hinged on the line through their leading edges
    const f2 = wing(spanStations(FW.flap2, 100, 590, 36), {m: 12});
    const tip = wing(spanStations(FW.flap2, 590, 648, 29), {m: 12});
    for (const sg of [1, -1]) {
      const A = fwPivot.A.clone(), B = fwPivot.B.clone();
      A.x *= sg;
      B.x *= sg;
      const g = new THREE.Group();
      g.name = sg > 0 ? 'frontFlapL' : 'frontFlapR';
      g.position.copy(A);
      car.add(g);
      const mv = (geo) => (sg > 0 ? geo.clone() : mirrorX(geo)).translate(-A.x, -A.y, -A.z);
      add(g, merge([mv(f2)]), M.carbon);
      add(g, merge([mv(tip)]), M.teal);
      flapGroups.push({g, axis: B.clone().sub(A).normalize(), sign: sg, A});
    }
  }

  // ---- rear wing
  const rwPivot = V(0, RW.pivot.h, RW.pivot.s);
  const rearFlap = new THREE.Group();
  rearFlap.name = 'rearFlap';
  rearFlap.position.copy(rwPivot);
  car.add(rearFlap);
  {
    carbon.push(wing(spanStations(RW.main, -P.rw.half, P.rw.half, 37), {m: 16}));
    const mv = (g) => g.translate(-rwPivot.x, -rwPivot.y, -rwPivot.z);
    const hx = P.rw.half - 22;
    add(rearFlap, merge([mv(wing(spanStations(RW.flap1, -hx, hx, 38), {m: 12})), mv(wing(spanStations(RW.flap2, -hx, hx, 38), {m: 12}))]), M.carbon);
    // end fences of the flap pair, so the slot gaps read from the side
    for (const sg of [1, -1]) {
      // endplate: up top at Y 535..575, stepping in to Y 345..375 by Z 425 [reg] RV-RWEP-BODY; front edge from XR 160 at
      // Z 700 raked back to XR 375 at Z 250, rear edge XR 750 above Z 625; [photo] top h 900, front s 3488, rear s 4028
      const lv = range(RH + 252, RH + 880, 22).map((h) => {
        const Z = h - RH;
        const s0 = XR(160 + (700 - Z) * 0.478);
        const s1 = XR(Z > 625 ? 640 : 640 - (625 - Z) * 0.2);
        const x = lerp(362, P.rw.half + 6, sstep(400, 690, Z));
        return {h, s0, s1, x: sg * x};
      });
      carbon.push(hPlate(lv, 6));
      // rear-facing lights on the endplates [reg] RV-LATERAL-SAFETY-LIGHT
      add(car, box(7, 120, 5, sg * (P.rw.half + 6), RH + 800, zOf(XR(642))), M.red, 'endplate light');
      tealG.push(box(8, 4, 170, sg * (P.rw.half + 6), RH + 881, zOf(XR(360))));
    }
    // centre pylon and the flap actuator pod on top of the main plane [reg] RV-RW-PYLON XR 0..450, Z 300..825
    const py = range(RH + 400, RH + 800, 40).map((h) => {
      const k = (h - RH - 400) / 400;
      return {h, s0: XR(120 + 150 * k), s1: XR(330 + 110 * k), x: 0};
    });
    carbon.push(hPlate(py, 24));
    carbon.push(sweepTube([V(0, RH + 856, XR(250)), V(0, RH + 872, XR(330)), V(0, RH + 880, XR(430)), V(0, RH + 872, XR(540))], 26, 20, {N: 14, steps: 14, taper: [0.5, 0.55]}));
  }

  // ---- halo: titanium hoop [spec], a centre pylon and two arms back to the cockpit sides
  {
    carbon.push(sweepTube([V(0, 640, 812), V(0, 742, 884), V(0, 820, 960), V(...HALO.jn)], 21, 40, {N: 16, steps: 12, taper: [1.15, 1]}));
    for (const sg of [1, -1]) carbon.push(sweepTube(HALO.arm(sg), HALO.a, HALO.b, {N: 20, steps: 40}));
  }
  // ---- mirrors [reg] RV-MIRROR-BODY XC -830..-650, Y 470..680, Z 640..720, on two stays
  for (const sg of [1, -1]) {
    const mz = zOf(P.XC - 760), mx = sg * 575, my = RH + 682;
    carbon.push(rb(190, 66, 70, 14).rotateY(sg * 0.18).translate(mx, my, mz));
    tealG.push(rb(186, 8, 66, 3).rotateY(sg * 0.18).translate(mx, my + 34, mz));
    add(car, box(168, 46, 2).rotateY(sg * 0.18).translate(mx + sg * 6.5, my, mz - 35.5), M.mirror, 'mirror glass');
    carbon.push(sweepTube([V(sg * 500, my - 6, P.XC - 765), V(sg * 400, my - 14, P.XC - 780), V(sg * 300, 676, P.XC - 800)], 16, 5, {N: 8, steps: 6}));
    carbon.push(sweepTube([V(sg * 560, my - 30, P.XC - 750), V(sg * 548, 648, P.XC - 720)], 5, 14, {N: 8, steps: 3}));
  }
  // ---- cameras, pitot, antennas
  for (const sg of [1, -1]) {
    carbon.push(rb(70, 30, 130, 11).translate(sg * 236, 436, zOf(-260)));
    carbon.push(sweepTube([V(sg * 205, 438, -260), V(sg * 112, 444, -260)], 4, 18, {N: 8, steps: 2}));
  }
  carbon.push(box(8, 60, 46, 0, 992 + RH - 4, zOf(1960)));
  add(car, merge([rb(232, 40, 150, 12).translate(0, RH + 1034, zOf(1962)), cylZ(15, 26, 16).translate(0, RH + 1034, zOf(1880))]), M.tcam, 'T-cam');
  add(car, merge([
    cylY(3, 96, 8).translate(0, CH(70).t + 46, zOf(70)), cylX(2.2, 46, 6).translate(0, CH(70).t + 84, zOf(70)), cylX(2.2, 34, 6).translate(0, CH(70).t + 62, zOf(70)),
    cylY(2.5, 64, 8).translate(60, CH(480).t + 26, zOf(480)), cylY(2.5, 50, 8).translate(-40, CH(900).t + 20, zOf(900)),
  ]), M.steel, 'pitot and antennas');
  // rear light on the crash structure [reg] C14.3
  add(car, box(46, 96, 8, 0, 356, zOf(P.tailEnd) - 3), M.red, 'rain light');

  add(car, merge(carbon), M.carbon, 'carbon');
  add(car, merge(tealG), M.teal, 'teal trim');

  // ------------------------------------------------------------------ cockpit: driver, headrest, steering wheel
  {
    const helmet = new THREE.SphereGeometry(1, 36, 24).scale(121, 128, 146).translate(0, 742, zOf(1520));
    add(car, helmet, M.helmet, 'helmet');
    const visor = new THREE.SphereGeometry(1, 28, 10, -Math.PI * 0.42 + Math.PI / 2, Math.PI * 0.84, Math.PI * 0.36, Math.PI * 0.2).scale(123, 130, 148).translate(0, 742, zOf(1520));
    add(car, visor, M.visor, 'visor');
    add(car, new THREE.SphereGeometry(1, 28, 6, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.045).scale(122.5, 129.5, 147.5).translate(0, 742, zOf(1520)), M.teal);
    add(car, new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, Math.PI * 0.2).scale(122.3, 129.3, 147.3).translate(0, 742, zOf(1520)), M.helmetTop, 'helmet crown');
    add(car, merge([
      rb(430, 210, 300, 60).translate(0, 520, zOf(1560)), // shoulders
      sweepTube([V(206, 688, 1400), V(212, 698, 1560), V(170, 704, 1730), V(0, 706, 1784), V(-170, 704, 1730), V(-212, 698, 1560), V(-206, 688, 1400)], 34, 44, {N: 12, steps: 30}), // headrest
      rb(380, 30, 500, 10).translate(0, 438, zOf(1240)),
    ]), M.foam, 'driver and headrest');
  }
  const wheelPos = V(0, 612, 1148);
  const column = new THREE.Group();
  column.position.copy(wheelPos);
  column.rotation.x = -0.3; // the column rises toward the driver
  car.add(column);
  const steerWheel = new THREE.Group();
  steerWheel.rotation.y = Math.PI; // local +Z toward the driver
  column.add(steerWheel);
  {
    const sh = new THREE.Shape();
    const o = [[-135, 62], [-104, 84], [104, 84], [135, 62], [140, -40], [112, -84], [70, -70], [48, -44], [-48, -44], [-70, -70], [-112, -84], [-140, -40]];
    o.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, {depth: 22, bevelEnabled: true, bevelSize: 5, bevelThickness: 5, bevelSegments: 2});
    add(steerWheel, g, M.matt, 'steering wheel');
    add(steerWheel, box(120, 70, 2, 0, 22, 28), new THREE.MeshStandardMaterial({color: '#0a1620', emissive: '#1b6f8a', emissiveIntensity: 0.5, roughness: 0.3}), 'dash');
    add(steerWheel, merge([cylZ(9, 6, 12).translate(-98, 44, 28), cylZ(9, 6, 12).translate(98, 44, 28), cylZ(9, 6, 12).translate(-96, 8, 28), cylZ(9, 6, 12).translate(96, 8, 28)]), M.teal);
    add(column, cylZ(16, 240, 12).translate(0, 0, 120), M.matt, 'column');
  }

  // ------------------------------------------------------------------ wheels
  const tex = {
    text: ringText([['PIRELLI', -Math.PI / 2], ['P ZERO', Math.PI / 2]], {color: '#f4f2ec', size: 66, radius: 420, span: 0.125}),
    band: decalTexture(1024, 1024, (g) => {
      g.strokeStyle = '#ffffff';
      g.lineCap = 'butt';
      for (const a0 of [0, Math.PI]) {
        g.lineWidth = 15;
        for (const r of [392, 450]) {
          g.beginPath();
          g.arc(512, 512, r, a0 - 0.62, a0 + 0.62);
          g.stroke();
        }
        // the chequered flag marks either side of the lettering
        for (const sgn of [-1, 1]) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          if ((i + j) % 2) continue;
          const a = a0 + sgn * (0.7 + i * 0.03), r = 398 + j * 16;
          g.beginPath();
          g.lineWidth = 15;
          g.arc(512, 512, r, a - 0.015, a + 0.015);
          g.stroke();
        }
      }
    }),
  };
  const bandMat = new THREE.MeshStandardMaterial({map: tex.band, transparent: true, side: THREE.DoubleSide, color: '#f4f2ec', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false});
  const textMat = new THREE.MeshStandardMaterial({map: tex.text, transparent: true, side: THREE.DoubleSide, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false});
  const rimR = P.rimD / 2;
  function wheelParts(R, W) {
    const hw = W / 2;
    const rB = rimR + 3;
    // sidewall and tread profile [r, a]: bead, the sidewall's bulge, a 40 mm shoulder, a nearly flat tread
    const half = [[rB, hw * 0.8], [rB + 14, hw * 0.91], [rB + (R - rB) * 0.34, hw * 0.985], [rB + (R - rB) * 0.56, hw], [R - 34, hw - 3], [R - 16, hw - 12], [R - 5, hw - 27], [R - 1, hw - 46], [R, hw * 0.45], [R, 0]];
    const c2 = new THREE.CatmullRomCurve3(half.map(([r, a]) => new THREE.Vector3(r, a, 0)), false, 'centripetal', 0.5).getPoints(40);
    const prof = [...c2.map((p) => new THREE.Vector2(p.x, -p.y)), ...c2.slice(0, -1).reverse().map((p) => new THREE.Vector2(p.x, p.y))];
    const tyre = new THREE.LatheGeometry(prof, 96).rotateZ(-Math.PI / 2);
    // the lettering band: the outer sidewall's own profile, 0.7 mm proud, mapped flat as seen from outside
    const sw = c2.filter((p) => p.x > rB + 10 && p.x < R - 20).map((p) => new THREE.Vector2(p.x, p.y + 0.7));
    const band = new THREE.LatheGeometry(sw, 96).rotateZ(-Math.PI / 2);
    const bp = band.attributes.position, uv = band.attributes.uv;
    const Rm = R * 1.0;
    for (let i = 0; i < bp.count; i++) uv.setXY(i, 0.5 - bp.getZ(i) / (2 * Rm), 0.5 + bp.getY(i) / (2 * Rm));
    // rim: barrel, a dished face, ten spokes [spec: forged magnesium, 18 inch]
    const f0 = hw * 0.8;
    const barrel = new THREE.LatheGeometry([[rimR + 9, -f0 - 4], [rimR - 4, -f0 + 6], [rimR - 12, 0], [rimR - 4, f0 - 6], [rimR + 9, f0 + 4]].map(([r, a]) => new THREE.Vector2(r, a)), 64).rotateZ(-Math.PI / 2);
    const face = new THREE.LatheGeometry([[rimR + 9, f0 + 4], [rimR - 10, f0 - 2], [rimR - 22, f0 - 26], [rimR - 30, f0 - 60], [150, f0 - 74], [80, f0 - 66], [56, f0 - 48], [0, f0 - 48]].map(([r, a]) => new THREE.Vector2(r, a)), 64).rotateZ(-Math.PI / 2);
    // ten Y-spokes standing proud of the dish, a machined lip
    const spokes = [];
    const r0 = 60, r1 = rimR - 20;
    for (let i = 0; i < 9; i++) {
      // a tapered blade: wide at the hub, slim at the rim, following the dish outward
      const rings = [];
      for (let q = 0; q <= 6; q++) {
        const r = lerp(r0, r1, q / 6), w = lerp(20, 10, q / 6), t = lerp(18, 11, q / 6);
        const ax = f0 - 62 + 44 * (q / 6) ** 1.5;
        rings.push([[ax + t, r, -w], [ax + t, r, w], [ax - 6, r, w * 1.25], [ax - 6, r, -w * 1.25]]);
      }
      spokes.push(loft(rings, {angle: 30}).rotateX((i / 9) * Math.PI * 2));
    }
    const lipRing = new THREE.TorusGeometry(rimR + 6, 3.2, 8, 72).rotateY(Math.PI / 2).translate(f0 + 3, 0, 0);
    const rim = merge([barrel, face]);
    const spokeG = merge(spokes);
    const nut = merge([cylX(34, 14, 24).translate(f0 - 42, 0, 0), new THREE.TorusGeometry(40, 5, 8, 32).rotateY(Math.PI / 2).translate(f0 - 44, 0, 0)]);
    return {tyre, band, rim, spokeG, nut, lipRing, f0, hw, profRA: c2.map((p) => [p.x, p.y])};
  }
  const wheels = {};
  const mkWheel = (key, R, W, sg) => {
    const parts = wheelParts(R, W);
    const spin = new THREE.Group();
    spin.name = 'wheel' + key;
    const flip = new THREE.Group(); // the wheel is built with its outer face on +X; the right-hand ones are turned round
    flip.rotation.y = sg > 0 ? 0 : Math.PI;
    spin.add(flip);
    add(flip, parts.tyre, tyreMaterial(R, W, rimR + 3), 'tyre');
    add(flip, parts.rim, M.rim, 'rim');
    add(flip, parts.spokeG, M.spoke, 'spokes');
    add(flip, parts.nut, M.nut, 'wheel nut');
    add(flip, parts.lipRing, M.ti, 'rim lip');
    const t1 = new THREE.Mesh(parts.band, textMat), t2 = new THREE.Mesh(parts.band, bandMat);
    t1.userData.realOnly = t2.userData.realOnly = true;
    flip.add(t1, t2);
    wheels[key] = {spin, sg, R, W, angle: 0, dist: 0, parts};
    return spin;
  };
  // the part of a corner that does not turn with the wheel: the carbon brake drum inside the rim and its duct scoop
  const corner = (R, W, sg, front) => {
    const hw = W / 2, f0 = hw * 0.8;
    const drum = new THREE.LatheGeometry([[0, -f0 - 6], [rimR - 20, -f0 - 6], [rimR - 20, f0 * 0.2], [0, f0 * 0.2]].map(([r, a]) => new THREE.Vector2(r, a)), 48).rotateZ(-Math.PI / 2);
    const scoop = rb(70, 150, 190, 22).translate(-f0 - 36, 30, front ? 150 : 140);
    const disc = cylX(165, 30, 40).translate(f0 * 0.2 + 10, 0, 0);
    const g = merge([drum, scoop, disc]);
    if (sg < 0) g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1)); // keep the scoop facing forward
    return sg < 0 ? mirrorFix(g) : g;
  };
  const mirrorFix = (g) => {
    // the Z flip above reversed the winding: swap it back
    for (const name of Object.keys(g.attributes)) {
      const at = g.attributes[name];
      const n = at.itemSize, arr = at.array;
      for (let i = 0; i < at.count; i += 3) for (let q = 0; q < n; q++) [arr[(i + 1) * n + q], arr[(i + 2) * n + q]] = [arr[(i + 2) * n + q], arr[(i + 1) * n + q]];
    }
    g.computeVertexNormals();
    return g;
  };

  const links = [];
  const linkGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  const corners = {};
  for (const [axle, front] of [['front', true], ['rear', false]]) {
    const S = SUS[axle];
    const R = front ? RF : RR, W = front ? P.tyreF.W : P.tyreR.W;
    for (const sg of [1, -1]) {
      const key = (front ? 'F' : 'R') + (sg > 0 ? 'L' : 'R');
      const hubP = V(sg * S.hub[0], S.hub[1], S.hub[2]);
      const pivot = front ? V(sg * S.lbj[0], S.lbj[1], S.lbj[2]) : hubP.clone();
      const up = new THREE.Group(); // the upright: turns about the kingpin at the front
      up.name = 'upright' + key;
      up.position.copy(pivot);
      root.add(up);
      const axis = front ? V(sg * S.ubj[0], S.ubj[1], S.ubj[2]).sub(pivot).normalize() : new THREE.Vector3(0, 1, 0);
      const spin = mkWheel(key, R, W, sg);
      spin.position.copy(hubP).sub(pivot);
      up.add(spin);
      const st = add(up, corner(R, W, sg, front), M.carbonP, 'brake drum');
      st.position.copy(spin.position);
      corners[key] = {up, axis, pivot, hubP, sg, front, prof: wheels[key].parts.profRA, R};
      for (const m of S.members) {
        const inS = m.in[2];
        // pick-ups sit on the skin: keep them inside the chassis section's height at that station
        const inH = front ? Math.min(CH(inS).t - 14, Math.max(CH(inS).b + 14, m.in[1])) : m.in[1];
        const inX = m.in[0] ?? (m.n === 'driveshaft' ? 100 : front ? chassisX(inS, inH) * 0.96 : tailX(inS, inH));
        const mesh = add(root, linkGeo, M.link, `${m.n} ${key}`);
        mesh.scale.set(m.b, 1, m.a);
        links.push({mesh, A: V(sg * inX, m.rack ? m.in[1] : inH, inS), B: V(sg * m.out[0], m.out[1], m.out[2]).sub(pivot), up, name: `${m.n} ${key}`, rest: 0, slide: !!m.slide, rack: !!m.rack});
      }
    }
  }

  // ------------------------------------------------------------------ decals (wings, endplates, boards)
  const T = {};
  for (const [k, w, h] of [['teamviewer', 1024, 160], ['syntium', 512, 256], ['petronas', 1024, 150], ['crowdstrike', 1024, 110], ['snapdragon', 768, 150], ['primax', 400, 220], ['iwc', 400, 180], ['microsoft', 768, 150], ['signify', 640, 170], ['drop', 256, 256], ['star', 256, 256], ['halo', 512, 60], ['amd', 256, 90], ['einhell', 512, 110], ['nu', 200, 130]])
    T[k] = decalTexture(w, h, WORDS[k]);
  /** a decal on a wing element's upper (or lower) surface: columns run across the span from xa to xb, rows from chord
   *  fraction u0 (the image's top) to u1 */
  const wingDecal = (list, xa, xb, u0, u1, {lower = false, origin = null, d = 1.2, nx = 14, nu = 5} = {}) => {
    const grid = [];
    for (let j = 0; j <= nu; j++) {
      const row = [];
      for (let i = 0; i <= nx; i++) {
        const st = stAt(list, lerp(xa, xb, i / nx));
        const u = lerp(u0, u1, j / nu);
        let p = onFoil(st, u, d);
        if (lower) {
          // the lower surface: mirror the thickness about the camber line
          const top = onFoil(st, u, 0), topD = onFoil(st, u, -1);
          const al = (st.alpha ?? 0) * D2R;
          const th = 2 * 5 * (st.tc ?? 0.1) * st.chord * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1015 * u ** 4) + 0.0032 * u * st.chord + d;
          p = [top[0], top[1] - th * Math.cos(al), top[2] - th * Math.sin(al)];
          void topD;
        }
        if (origin) p = [p[0] - origin.x, p[1] - origin.y, p[2] - origin.z];
        row.push(p);
      }
      grid.push(row);
    }
    return patch(grid);
  };
  /** a decal on a vertical plate: columns from s = sa to sb, rows from h1 (top) to h0, at x = xFn(s, h) */
  const plateDecal = (sa, sb, h0, h1, xFn, {n = 8} = {}) => {
    const grid = [];
    for (let j = 0; j <= 2; j++) {
      const row = [];
      for (let i = 0; i <= n; i++) {
        const s = lerp(sa, sb, i / n), h = lerp(h1, h0, j / 2);
        row.push([xFn(s, h), h, zOf(s)]);
      }
      grid.push(row);
    }
    return patch(grid);
  };
  // front wing: TeamViewer on the main plane, PETRONAS Syntium on the upper flap (read from the front)
  addDecal(decals, wingDecal(FW.main, -560, -170, 0.86, 0.3), T.teamviewer);
  addDecal(decals, wingDecal(FW.main, 170, 560, 0.86, 0.3), T.teamviewer);
  for (const fg of flapGroups) {
    const [xa, xb] = fg.sign > 0 ? [250, 500] : [-500, -250];
    addDecal(fg.g, wingDecal(FW.flap2, xa, xb, 0.95, 0.12, {origin: fg.A}), T.syntium);
  }
  // rear wing: PETRONAS along the top of the first flap, CROWDSTRIKE under the flaps (read from behind)
  addDecal(rearFlap, wingDecal(RW.flap1, -470, 470, 0.97, 0.06, {origin: rwPivot, nx: 20}), T.petronas);
  addDecal(rearFlap, wingDecal(RW.flap1, 430, -430, 0.92, 0.1, {origin: rwPivot, lower: true, nx: 20, d: 1.5}), T.crowdstrike);
  for (const sg of [1, -1]) {
    const o = sg * 4.4;
    const epX = (s) => sg * (652 + 16 * ((s + 990) / 590) ** 2 + 4.5) + (s > -700 ? sg * 2 : sg * 1);
    const fl = (a, b) => (sg > 0 ? [a, b] : [b, a]);
    // front endplate (outer face): IWC above Microsoft
    const epFace = (s, h) => sg * (EP.x(s) + 3 + 6 * Math.min(1, Math.max(0, (h - EP.bot(s)) / (EP.top(s) - EP.bot(s)))) + 1.4);
    addDecal(decals, plateDecal(...fl(-800, -600), 250, 340, epFace, {n: 12}), T.iwc);
    addDecal(decals, plateDecal(...fl(-950, -580), 150, 222, epFace, {n: 16}), T.microsoft);
    // floor board: Signify
    addDecal(decals, plateDecal(...fl(760, 1180), 185, 285, (s) => sg * (boardX(s) + 4.2)), T.signify);
    // rear endplate (outer face): Snapdragon, CROWDSTRIKE; PETRONAS PRIMAX low down; the emblem inside
    const xo = sg * (P.rw.half + 6) + o;
    addDecal(decals, plateDecal(...fl(XR(250), XR(610)), RH + 790, RH + 862, () => xo), T.snapdragon);
    addDecal(decals, plateDecal(...fl(XR(280), XR(620)), RH + 722, RH + 764, () => xo), T.crowdstrike);
    addDecal(decals, plateDecal(...fl(XR(400), XR(545)), RH + 275, RH + 372, () => sg * 362 + o), T.primax);
    addDecal(decals, plateDecal(...fl(XR(560), XR(380)), RH + 690, RH + 860, () => sg * (P.rw.half + 6) - o), T.drop);
  }
  // halo stickers [photo, side view]: CROWDSTRIKE along the front of each arm, AMD at the back, nu on the pylon
  for (const sg of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3(HALO.arm(sg), false, 'centripetal');
    const side = (u0, u1, hh, n = 10) => {
      const grid = [[], []];
      const Tn = new THREE.Vector3(), Bn = new THREE.Vector3(), Nn = new THREE.Vector3(), Pn = new THREE.Vector3();
      for (let i = 0; i <= n; i++) {
        const u = sg > 0 ? lerp(u0, u1, i / n) : lerp(u1, u0, i / n);
        curve.getPoint(u, Pn);
        curve.getTangent(u, Tn);
        Bn.crossVectors(Tn, new THREE.Vector3(0, 1, 0)).normalize();
        Nn.crossVectors(Bn, Tn).normalize();
        // the outer flank of the tube, a little above its equator so it faces the side camera
        const o = Bn.clone().multiplyScalar(sg * (HALO.a * 0.86 + 1.5)).addScaledVector(Nn, HALO.b * 0.5);
        const dn = Nn.clone().multiplyScalar(hh).addScaledVector(Bn, -sg * hh * 0.35);
        grid[0].push(Pn.clone().add(o).add(dn).toArray());
        grid[1].push(Pn.clone().add(o).sub(dn).toArray());
      }
      return patch(grid);
    };
    addDecal(decals, side(0.3, 0.52, 13), T.halo);
    addDecal(decals, side(0.74, 0.88, 14, 6), T.amd);
    const px = sg * 26.5;
    addDecal(decals, patch(sg > 0 ? [[[px, 752, zOf(842)], [px, 760, zOf(908)]], [[px, 706, zOf(842)], [px, 714, zOf(908)]]] : [[[px, 760, zOf(908)], [px, 752, zOf(842)]], [[px, 714, zOf(908)], [px, 706, zOf(842)]]]), T.nu);
  }
  // halo: the star on the front of the hoop
  addDecal(decals, patch([[[-36, 876.5, zOf(1070)], [36, 876.5, zOf(1070)]], [[-36, 866, zOf(1000)], [36, 866, zOf(1000)]]]), T.star);

  // ------------------------------------------------------------------ pose
  const state = {sw: 0, aero: 0, ride: 0, speed: 0, driver: -1, compound: -1, steer: {left: 0, right: 0, R: Infinity, rack: 0}, flaps: {front: 0, rear: 0}, aeroNow: 0};
  const COMPOUND = ['#f4f2ec', '#f3c300', '#e2231a']; // hard, medium, soft
  const q = new THREE.Quaternion();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function pose(p, dt) {
    state.sw = THREE.MathUtils.clamp(p.steer ?? 0, -kin.K.lockSW, kin.K.lockSW);
    state.ride = p.ride ?? 0;
    state.speed = p.speed ?? 0;
    // active aero moves between its two positions in the regulation 400 ms
    const target = p.aero ?? 0;
    state.aeroNow += THREE.MathUtils.clamp(target - state.aeroNow, -dt / kin.K.aeroTime, dt / kin.K.aeroTime);
    if (dt === 0) state.aeroNow = target;
    state.flaps = kin.aero(state.aeroNow);
    state.steer = kin.steer(state.sw);
    car.position.y = state.ride;
    // steering: each upright about its own kingpin, the wheel in the driver's hands by the rack ratio
    for (const key of ['FL', 'FR']) {
      const c = corners[key];
      c.up.quaternion.setFromAxisAngle(c.axis, (key === 'FL' ? state.steer.left : state.steer.right) * D2R);
      // the kingpin leans (caster and inclination), so a steered wheel cambers: keep its contact patch on the ground
      a.set(1, 0, 0).applyQuaternion(c.up.quaternion);
      b.copy(c.hubP).sub(c.pivot).applyQuaternion(c.up.quaternion);
      c.up.position.y = c.pivot.y - (c.pivot.y + b.y - kin.tyreDrop(c.prof, a.y));
    }
    steerWheel.rotation.z = state.sw * D2R;
    // wheels roll without slip, each along its own path
    const v = kin.kmh(state.speed);
    const om = kin.wheelOmega(v, state.sw), gr = kin.wheelGround(v, state.sw);
    for (const key of Object.keys(wheels)) {
      const w = wheels[key];
      w.angle += om[key] * dt;
      w.dist += gr[key] * dt;
      w.spin.rotation.x = w.angle;
    }
    // flaps
    for (const f of flapGroups) f.g.quaternion.setFromAxisAngle(f.axis, -f.sign * state.flaps.front * D2R);
    rearFlap.rotation.x = -state.flaps.rear * D2R;
    // suspension members between the body's pick-ups and the uprights'
    for (const c of Object.values(corners)) c.up.updateMatrix();
    for (const l of links) {
      a.copy(l.A).add(car.position);
      if (l.rack) a.x += state.steer.rack; // both rack ends move the same way
      b.copy(l.B).applyMatrix4(l.up.matrix);
      // a push rod keeps its length: its inboard end pushes the rocker inside the bodywork instead
      if (l.slide && l.rest) a.sub(b).setLength(l.rest).add(b);
      l.len = aim(l.mesh, a, b, {stretch: true});
      if (!l.rest) l.rest = l.len;
    }
    // options
    if (p.driver !== undefined && p.driver !== state.driver) {
      state.driver = p.driver;
      livery.redraw({number: p.driver >= 0.5 ? '12' : '63'});
      M.tcam.color.set(p.driver >= 0.5 ? '#f2d500' : '#0b0b0c'); // the second car carries the yellow camera
    }
    if (p.compound !== undefined && p.compound !== state.compound) {
      state.compound = p.compound;
      bandMat.color.set(COMPOUND[Math.round(p.compound)] ?? COMPOUND[0]);
    }
  }
  void q;
  pose({steer: 0, aero: 0, ride: 0, speed: 0, driver: 0, compound: 0}, 0);
  root.updateMatrixWorld(true);
  if (stage?.noAO) stage.noAO.push(decals);

  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  return {
    root,
    focus: [0, 0.42, 0.215],
    radius: 2.45,
    view: '34',
    params: [
      {key: 'speed', label: 'speed', min: 0, max: 350, step: 1, value: 0, unit: 'km/h'},
      {key: 'steer', label: 'steering wheel (+ left)', min: -180, max: 180, step: 1, value: 0, unit: '°'},
      {key: 'aero', label: 'active aero: corner 0 · straight 1', min: 0, max: 1, step: 1, value: 0},
      {key: 'ride', label: 'ride height offset', min: -20, max: 20, step: 1, value: 0, unit: 'mm'},
      {key: 'driver', label: 'car: 0 = #63 Russell · 1 = #12 Antonelli', min: 0, max: 1, step: 1, value: 0},
      {key: 'compound', label: 'tyre: 0 hard · 1 medium · 2 soft', min: 0, max: 2, step: 1, value: 0},
      {key: 'auto', label: 'demo lap', min: 0, max: 1, step: 1, value: 0},
    ],
    update(dt, t, p) {
      let pp = p;
      if (p.auto) {
        const ph = (t * 0.22) % 1; // a straight, then a corner
        const corner = sstep(0.5, 0.62, ph) * (1 - sstep(0.86, 0.98, ph));
        pp = {...p, speed: lerp(290, 110, corner), steer: 115 * corner, aero: corner > 0.02 ? 0 : 1};
      }
      pose(pp, dt);
      decals.visible = p.look !== 'drawing';
    },
    readout() {
      const s = state.steer;
      const v = kin.kmh(state.speed);
      const om = kin.wheelOmega(v, state.sw);
      return [
        `speed ${state.speed.toFixed(0).padStart(3)} km/h   front ${kin.rpm(om.FL).toFixed(0).padStart(4)} rpm  rear ${kin.rpm(om.RL).toFixed(0).padStart(4)} rpm`,
        `steer  wheel ${state.sw.toFixed(0).padStart(4)}°  rack ${s.rack.toFixed(1).padStart(5)} mm  FL ${s.left.toFixed(1).padStart(5)}°  FR ${s.right.toFixed(1).padStart(5)}°  R ${isFinite(s.R) ? (Math.abs(s.R) / 1000).toFixed(1) + ' m' : '∞'}`,
        `aero   ${state.aeroNow < 0.02 ? 'CORNER mode' : state.aeroNow > 0.98 ? 'STRAIGHT mode' : 'moving'}   front flap -${state.flaps.front.toFixed(0)}°  rear flap -${state.flaps.rear.toFixed(0)}°`,
      ];
    },
    // numbers to hold against the regulations and the published specification (mm unless noted)
    probe() {
      root.updateMatrixWorld(true);
      const mm = (v) => +(v * 1000).toFixed(1);
      const hub = Object.fromEntries(Object.entries(wheels).map(([k, w]) => [k, wp(w.spin)]));
      const bb = new THREE.Box3();
      const isLink = new Set(links.map((l) => l.mesh));
      root.traverse((o) => {
        if (!o.isMesh || o.userData.realOnly || isLink.has(o)) return;
        let wheel = false;
        for (let q = o.parent; q; q = q.parent) if (q.name?.startsWith('upright')) wheel = true;
        bb.expandByObject(o, wheel); // exact for the wheels (they turn), boxes for the rest
      });
      const tb = (k) => {
        const g = wheels[k].parts.tyre;
        g.computeBoundingBox();
        return +(g.boundingBox.max.y - g.boundingBox.min.y).toFixed(1);
      };
      const slip = Object.fromEntries(Object.entries(wheels).map(([k, w]) => [k, +(w.angle * w.R - w.dist).toFixed(4)]));
      const tyreBottom = Object.fromEntries(Object.keys(wheels).map((k) => [k, mm(new THREE.Box3().setFromObject(wheels[k].spin.children[0].children[0], true).min.y)]));
      const st = links.filter((l) => !l.slide && !l.rack).map((l) => Math.abs(l.len - l.rest));
      const rods = links.filter((l) => l.rack).map((l) => Math.abs(l.len - l.rest));
      const hoop = new THREE.Box3().setFromObject(car.getObjectByName('bodywork'));
      return {
        wheelbase: mm((hub.FL.z + hub.FR.z) / 2 - (hub.RL.z + hub.RR.z) / 2),
        trackFront: mm(hub.FL.x - hub.FR.x),
        trackRear: mm(hub.RL.x - hub.RR.x),
        length: mm(bb.max.z - bb.min.z),
        width: mm(bb.max.x - bb.min.x),
        height: mm(bb.max.y),
        rollHoopAboveRefPlane: +(mm(hoop.max.y) - RH - state.ride).toFixed(1),
        frontOverhang: mm(bb.max.z - hub.FL.z),
        rearOverhang: mm(hub.RL.z - bb.min.z),
        tyreDiaFront: tb('FL'),
        tyreDiaRear: tb('RL'),
        tyreWidthFront: P.tyreF.W,
        tyreWidthRear: P.tyreR.W,
        contactPatchY: tyreBottom,
        plankClearance: +(RH - P.floor.plankT + state.ride).toFixed(1),
        steer: {wheel: state.sw, rackMm: +state.steer.rack.toFixed(2), FL: +state.steer.left.toFixed(3), FR: +state.steer.right.toFixed(3), turnRadiusM: isFinite(state.steer.R) ? +(state.steer.R / 1000).toFixed(2) : null, ackermannPct: +kin.ackermann(state.sw).percent.toFixed(1), trackRodLengthErrMm: +Math.max(...rods).toFixed(4)},
        flaps: {front: +state.flaps.front.toFixed(2), rear: +state.flaps.rear.toFixed(2)},
        noSlipErrMm: slip,
        wishboneStretchMaxMm: +Math.max(...st).toFixed(2),
        selfTest: kin.selfTest().pass,
      };
    },
  };
}
