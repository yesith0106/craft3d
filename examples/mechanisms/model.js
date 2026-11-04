// Mechanisms: one crank drives everything, nothing is keyframed.
//   crank -> slider-crank -> piston in a glass cylinder -> piston rod -> rack -> pinion (with a pointer)
//   crank -> spur gear train 20 : 32 : 20 (module 5) -> output shaft -> a Jansen leg (his 1990 link lengths)
// Shows: gear() sized by module and meshed with meshAngle(), rack() phased to its pinion, sliderCrank(), the circles()
// linkage solver, instancedLinks(), clean materials, and a probe() that checks the motion against the equations.
import * as THREE from 'three';
import {cleanMaterials} from '../craft/materials.js';
import {box, cylX, cylZ, gear, kit, lathe, profile, rack, rb} from '../craft/shapes.js';
import {aim, centreDistance, circles, hiY, instancedLinks, loX, loY, meshAngle, sliderCrank} from '../craft/rig.js';

export const info = {name: 'Mechanisms', description: 'one crank: gears, piston, rack and pinion, Jansen leg', stage: 'studio'};

// ---- parameter block, mm
const O = [0, 800]; // crank axis (x, y); shafts run along z into the back plate at z = -200
const CR = {r: 60, L: 220}; // crank radius, connecting rod length
const MOD = 5; // gear module
const Z = {drive: 20, idler: 32, out: 20, pinion: 16};
const RACK = {h: 30, w: 30, teeth: 24, gap: 200}; // rack bar height/width, length in teeth, distance behind the crosshead
const JS = 6; // mm per Jansen unit
const HOLY = {a: 38, b: 41.5, c: 39.3, d: 40.1, e: 55.8, f: 39.4, g: 36.7, h: 65.7, i: 49, j: 50, k: 61.9, l: 7.8, m: 15};
const PLATE_Z = -200;
const SLIDE_Z = 40; // the piston, rod, rack and pinion lie in this plane
const GEAR_Z = -80;
const LEG_Z = -20;

// Jansen leg, crank axle at the origin, foot toward -x (exact: circle intersections)
const jansen = (th) => {
  const {a, b, c, d, e, f, g, h, i, j, k, l, m} = HOLY;
  const P = [-a, -l];
  const A = [m * Math.cos(th), m * Math.sin(th)];
  const B = circles(A, j, P, b, hiY);
  const C = circles(A, k, P, c, loY);
  const D = circles(B, e, P, d, loX);
  const E = circles(D, f, C, g, loX);
  const F = circles(E, h, C, i, loY);
  return {A, B, C, D, E, F, P};
};
const LINKS = [['A', 'B', 'j'], ['A', 'C', 'k'], ['P', 'B', 'b'], ['P', 'C', 'c'], ['P', 'D', 'd'], ['B', 'D', 'e'], ['D', 'E', 'f'], ['C', 'E', 'g'], ['E', 'F', 'h'], ['C', 'F', 'i']];

export function build() {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  const M = cleanMaterials();
  const k = kit({boltMat: M.steel});
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- frame: a base, a back plate with lightening holes, shafts into it
  k.add(root, rb(1500, 150, 520, 18), M.blackSatin).position.set(60, 75, -90);
  const holes = [[-430, 520, 70], [-430, 1000, 60], [330, 1010, 60], [560, 420, 70], [100, 300, 50]];
  const plate = k.add(root, profile([[-640, 150], [780, 150], [780, 1150], [-640, 1150]], 20, {holes, bevel: 3}), M.white);
  plate.position.z = PLATE_Z;
  const shaft = (x, y, z1, r = 16) => k.add(root, cylZ(r, z1 - PLATE_Z, 32).translate(x, y, (z1 + PLATE_Z) / 2), M.steel);

  // ---- crank: disc, pin, shaft
  const crank = k.group(root, O[0], O[1], 0);
  k.add(crank, cylZ(90, 24, 64), M.blackGloss).position.z = 10;
  k.add(crank, cylZ(16, 40, 24), M.steel).position.set(CR.r, 0, 30);
  shaft(O[0], O[1], 0);

  // ---- slider-crank: rod, crosshead, piston in a glass cylinder, piston rod
  const rod = k.add(root, new THREE.CylinderGeometry(12, 12, 1, 20), M.blackGloss);
  const crosshead = k.group(root, 0, O[1], SLIDE_Z);
  k.add(crosshead, lathe([[0, -30], [46, -30], [46, -24], [44, -22], [44, 22], [46, 24], [46, 30], [0, 30]], 48).rotateZ(-Math.PI / 2), M.alu);
  k.add(crosshead, cylX(10, RACK.gap, 20).translate(RACK.gap / 2, 0, 0), M.chrome);
  const cylLen = 2 * CR.r + 120;
  const cylX0 = CR.L - CR.r - 40;
  k.add(root, new THREE.CylinderGeometry(49, 49, cylLen, 48, 1, true).rotateZ(Math.PI / 2).translate(cylX0 + cylLen / 2, O[1], SLIDE_Z), M.glass, false);
  for (const x of [cylX0, cylX0 + cylLen]) k.add(root, new THREE.TorusGeometry(51, 5, 12, 48).rotateY(Math.PI / 2).translate(x, O[1], SLIDE_Z), M.blackGloss);
  k.add(root, cylX(51, 14, 48).translate(cylX0 + cylLen + 7, O[1], SLIDE_Z), M.blackGloss); // the gland end cap
  for (const x of [cylX0 + 30, cylX0 + cylLen - 30]) k.add(root, box(40, 50, SLIDE_Z - PLATE_Z - 10, x, O[1] - 60, (SLIDE_Z + PLATE_Z) / 2), M.blackSatin); // cylinder brackets

  // ---- rack and pinion: the rack rides on the piston rod; its teeth turn the pinion
  const pitch = Math.PI * MOD;
  const rackLen = RACK.teeth * pitch;
  const rackBar = k.add(root, rack(rackLen, MOD, RACK.w, RACK.h), M.brass);
  const pitchY = O[1] + RACK.h / 2 + 1.25 * MOD; // the rack's pitch line
  const rpPin = (MOD * Z.pinion) / 2;
  const rackLeftMid = CR.L + RACK.gap; // the rack's left end when the piston is mid-stroke
  const PIN = [rackLeftMid + 12 * pitch, pitchY + rpPin]; // a gap sits under the pinion at mid-stroke
  const pinion = k.group(root, PIN[0], PIN[1], SLIDE_Z);
  k.add(pinion, gear(Z.pinion, MOD, 28, {bore: 12}), M.brass);
  k.add(pinion, box(170, 16, 8, 85, 0, 22), M.accent, false); // pointer
  k.add(pinion, cylZ(22, 20, 32).translate(0, 0, 22), M.blackGloss);
  shaft(PIN[0], PIN[1], SLIDE_Z + 30, 12);
  k.add(root, box(rackLen + 140, 24, RACK.w + 20, rackLeftMid + rackLen / 2, O[1] - RACK.h / 2 - 12, SLIDE_Z), M.blackSatin); // the rack's guide
  k.add(root, box(60, 40, SLIDE_Z - PLATE_Z - 20, rackLeftMid + rackLen / 2, O[1] - RACK.h / 2 - 32, (SLIDE_Z + PLATE_Z) / 2), M.blackSatin);

  // ---- gear train behind the crank
  const cd1 = centreDistance(Z.drive, Z.idler, MOD);
  const cd2 = centreDistance(Z.idler, Z.out, MOD);
  const G = {
    drive: k.group(root, O[0], O[1], GEAR_Z),
    idler: k.group(root, O[0] - cd1, O[1], GEAR_Z),
    out: k.group(root, O[0] - cd1 - cd2, O[1], GEAR_Z),
  };
  k.add(G.drive, gear(Z.drive, MOD, 30, {bore: 16}), M.steel);
  k.add(G.idler, gear(Z.idler, MOD, 30, {bore: 16, helix: 0}), M.bronze);
  k.add(G.out, gear(Z.out, MOD, 30, {bore: 16}), M.steel);
  shaft(G.idler.position.x, O[1], GEAR_Z + 20);
  const OJ = [G.out.position.x, O[1]]; // the Jansen crank axle
  shaft(OJ[0], OJ[1], LEG_Z + 10);

  // ---- Jansen leg on the output shaft: instanced links, joint caps, a foot
  const links = instancedLinks(M.orange, LINKS.length + 1);
  root.add(links.mesh);
  const caps = {};
  for (const n of ['A', 'B', 'C', 'D', 'E', 'P']) caps[n] = k.add(root, cylZ(14, 30, 24), n === 'P' ? M.steel : M.blackGloss);
  const foot = k.add(root, new THREE.SphereGeometry(26, 24, 14), M.rubber);
  const pivot = [OJ[0] - HOLY.a * JS, OJ[1] - HOLY.l * JS];
  shaft(pivot[0], pivot[1], LEG_Z);

  const st = {th: 0, s: 0, legs: null, out: 0, pin: 0};
  const pose = (th) => {
    st.th = th;
    crank.rotation.z = th;
    // slider-crank
    const sc = sliderCrank(CR.r, CR.L, th);
    st.s = sc.s;
    const pinW = V(O[0] + sc.pin[0], O[1] + sc.pin[1], SLIDE_Z);
    crosshead.position.x = O[0] + sc.s;
    aim(rod, pinW, V(crosshead.position.x, O[1], SLIDE_Z), {stretch: true});
    // rack and pinion: rack x follows the crosshead; the pinion turns travel / rp from the mid-stroke phase
    const rackLeft = crosshead.position.x + RACK.gap;
    rackBar.position.set(rackLeft + rackLen / 2, O[1], SLIDE_Z);
    st.pin = -Math.PI / 2 + (rackLeft - rackLeftMid) / rpPin;
    pinion.rotation.z = st.pin;
    // gears
    G.drive.rotation.z = th;
    G.idler.rotation.z = meshAngle(th, Z.drive, Z.idler, Math.PI);
    st.out = meshAngle(G.idler.rotation.z, Z.idler, Z.out, Math.PI);
    G.out.rotation.z = st.out;
    // the leg: crank angle = the output gear's angle
    const J = jansen(st.out);
    st.legs = J;
    const W = (p, z = LEG_Z) => V(OJ[0] + p[0] * JS, OJ[1] + p[1] * JS, z);
    links.begin();
    for (const [a, b] of LINKS) links.link(W(J[a]), W(J[b]), 9);
    links.link(V(OJ[0], OJ[1], LEG_Z), W(J.A), 11); // the crank arm
    links.end();
    for (const n in caps) caps[n].position.copy(W(J[n], LEG_Z + 4));
    foot.position.copy(W(J.F));
    root.updateMatrixWorld(true);
  };
  pose(0);

  return {
    root,
    focus: [0.05, 0.72, -0.05],
    radius: 0.9,
    params: [
      {key: 'crank', label: 'crank angle', min: 0, max: 360, step: 1, value: 0, unit: '°'},
      {key: 'auto', label: 'auto (rpm)', min: 0, max: 40, step: 1, value: 12},
    ],
    update(dt, t, p) {
      pose(p.auto > 0 ? (t * p.auto * Math.PI * 2) / 60 : (p.crank * Math.PI) / 180);
    },
    // invariants: the rod keeps its length, the piston sits where the slider-crank says, the rack and pinion roll
    // without slip, every Jansen link keeps its holy number
    probe() {
      const m = new THREE.Matrix4();
      const sc = new THREE.Vector3();
      let linkErr = 0;
      for (let i = 0; i < LINKS.length; i++) {
        links.mesh.getMatrixAt(i, m);
        m.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
        linkErr = Math.max(linkErr, Math.abs(sc.y - HOLY[LINKS[i][2]] * JS));
      }
      const rodLen = rod.scale.y;
      return {
        rodErr: +Math.abs(rodLen - CR.L).toFixed(6),
        pistonErr: +Math.abs(crosshead.position.x - (O[0] + sliderCrank(CR.r, CR.L, st.th).s)).toFixed(6),
        rollErr: +Math.abs((st.pin + Math.PI / 2) * rpPin - (rackBar.position.x - rackLen / 2 - rackLeftMid)).toFixed(6),
        linkErr: +linkErr.toFixed(6),
        footY: +((OJ[1] + st.legs.F[1] * JS) / 1000).toFixed(4),
      };
    },
  };
}
