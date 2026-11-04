// A running Chevrolet small-block V8 (350 cu in), built from its published dimensions (kin.js), every moving part
// posed from one input, the crank angle:
//   crankshaft (cross-plane, counterweights) -> 8 rods and pistons by the exact slider-crank
//   -> timing chain (21 : 42, 3/8" pitch, links moving) -> camshaft at half speed -> 16 lobes -> lifters -> pushrods
//   -> 1.5:1 rockers -> valves and springs;  cam -> distributor rotor pointing at the firing cylinder's tower
//   -> spark at 30° BTDC -> the charge in each glass bore coloured by its stroke; balancer belt -> water pump.
// The block, heads, covers, intake and pan go see-through with the x-ray slider. Readouts come from the gas model.
import * as THREE from 'three';
import {cleanMaterials} from '../craft/materials.js';
import {box, cylX, cylY, cylZ, gear, ibeam, kit, lathe, profile, rb, spring, tube} from '../craft/shapes.js';
import {aim, instancedLinks} from '../craft/rig.js';
import {BANK, CYL, DISPLACEMENT, E, FIRE, imep, liftEx, liftIn, MAIN_Z, meanTorque, mod, ORDER, peakOf, pinXY, piston, PIN_PHASE, PIN_Z, pressure, psi, S_TDC, strokeOf, VALVE, gasTorque} from './kin.js';

export const info = {name: 'Small-block V8 · 350', description: '5.7 L · 90° V · cross-plane · OHV 16 valves · 1-8-4-3-6-5-7-2', stage: 'studio', wear: false};

const D2R = Math.PI / 180;
const DECK = E.deck;
const HEIGHT = 700; // crank axis above the floor (on the stand)
const W_CAM = -Math.SQRT1_2 * E.camY; // the lifter axis, across the bank (valley side)
const D_CAM = Math.SQRT1_2 * E.camY; // the cam centre along the bank
const BASE_R = 17; // cam base circle radius
const LOBE_LIFT = VALVE.lifter; // 7.62 mm at the lifter
const ROCK = {x: -22, y: DECK + 138, a: 18.7, b: 28}; // rocker pivot (bank frame), pushrod arm, valve arm: 28/18.7 = 1.5
const VALVE_X = 6; // valves sit just outboard of the bore axis
const VALVE_DZ = 23; // each valve's offset along the engine from its cylinder's centre
const VALVE_R = {in: (1.94 * 25.4) / 2, ex: (1.5 * 25.4) / 2};
const SEAT = DECK + 8; // the valve face's seat, up in the chamber
const CHAIN = {p: 9.525, z1: 21, z2: 42, z: 252};
const SPARK_ADV = 30; // degrees before TDC
const MECH_EFF = 0.85; // brake / indicated (est.)

// a point in a bank's plane: w across (outward +), d along the bore; returns [x, y]
const bankPt = (bank, w, d) => {
  const B = BANK[bank];
  return [d * B.b[0] + w * B.p[0], d * B.b[1] + w * B.p[1]];
};
// a group whose local x = w (outward, both banks) and y = d (along the bore)
const bankFrame = (parent, bank, z = 0) => {
  const g = new THREE.Group();
  const B = BANK[bank];
  g.position.z = z;
  g.rotation.z = Math.atan2(B.b[1], B.b[0]) - Math.PI / 2;
  if (bank === 'R') g.scale.x = -1; // mirror so +x is outward on both banks
  parent.add(g);
  return g;
};

export function build({stage}) {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  root.position.y = HEIGHT / 1000;
  const M = cleanMaterials();
  M.orange = new THREE.MeshPhysicalMaterial({color: '#c4502a', roughness: 0.4, metalness: 0.05, clearcoat: 0.45, clearcoatRoughness: 0.3}); // Chevy orange
  M.iron = new THREE.MeshStandardMaterial({color: '#4b4e53', roughness: 0.55, metalness: 0.8});
  M.header = new THREE.MeshStandardMaterial({color: '#8d8f93', roughness: 0.38, metalness: 0.95});
  M.wire = new THREE.MeshStandardMaterial({color: '#b3201b', roughness: 0.6});
  M.spark = new THREE.MeshBasicMaterial({color: '#9fd4ff'});
  const k = kit({boltMat: M.steel});
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // x-ray: the casings get their own materials so one slider fades them
  const XR = {block: M.orange.clone(), head: M.orange.clone(), cover: M.chrome.clone(), intake: M.castAlu.clone(), pan: M.blackGloss.clone(), cap: new THREE.MeshPhysicalMaterial({color: '#1d1e21', roughness: 0.3, clearcoat: 0.6})};
  const xrMeshes = [];
  const xadd = (parent, geo, mat) => {
    const m = k.add(parent, geo, mat);
    xrMeshes.push(m);
    return m;
  };

  // ------------------------------------------------------------------ crankcase, banks, heads, covers, pan
  const cBot = -70;
  const bb = 95; // where each bank's cylinder block starts, along the bore
  const L = bankPt('L', 68, bb);
  const Li = bankPt('L', -68, bb);
  xadd(root, profile([[-112, cBot], [112, cBot], [L[0], L[1]], [Li[0], Li[1]], [-Li[0], Li[1]], [-L[0], L[1]]], 520, {bevel: 6}), XR.block);
  const banks = {};
  for (const bank of ['L', 'R']) {
    const zc = bank === 'L' ? E.bankOff : -E.bankOff;
    const g = bankFrame(root, bank, zc);
    banks[bank] = g;
    xadd(g, rb(136, DECK - bb, 500, 10).translate(0, (DECK + bb) / 2, 0), XR.block); // the cylinder bank
    xadd(g, rb(168, 96, 498, 12).translate(4, DECK + 48, 0), XR.head); // cylinder head
    xadd(g, rb(150, 52, 472, 18).translate(-6, DECK + 96 + 26, 0), XR.cover); // valve cover
    k.add(g, cylY(18, 22, 24).translate(-6, DECK + 160, 150), M.blackGloss); // oil filler / breather
    for (const z of [-190, -63, 63, 190]) k.bolts(g, [[60, DECK + 97, z]], 'y');
  }
  xadd(root, rb(236, 120, 556, 22).translate(0, cBot - 58, -10), XR.pan); // oil pan
  k.add(root, box(250, 10, 566, 0, cBot + 2, -10), M.blackSatin); // pan rail
  for (const z of MAIN_Z) k.add(root, box(150, 34, 24, 0, -40, z), M.iron); // main bearing caps

  // ------------------------------------------------------------------ crankshaft
  const crank = k.group(root);
  const web = (() => {
    const sh = new THREE.Shape();
    const R = 76;
    sh.moveTo(-R * Math.sin(1.05), -R * Math.cos(1.05));
    sh.absarc(0, 0, R, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05, false);
    sh.lineTo(30, 10);
    sh.absarc(0, E.r, 32, 0, Math.PI, false);
    sh.lineTo(-30, 10);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, {depth: 16, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: 28}).translate(0, 0, -8);
  })();
  PIN_Z.forEach((z, p) => {
    for (const dz of [-34, 34]) {
      const w = k.add(crank, web, M.iron);
      w.position.z = z + dz;
      w.rotation.z = -PIN_PHASE[p] * D2R; // web's pin boss points along the pin
    }
    const [x, y] = pinXY(p, 0);
    k.add(crank, cylZ(26.7, 50, 32).translate(x, y, z), M.steel); // rod journal, 2.1"
  });
  for (const z of MAIN_Z) k.add(crank, cylZ(31.1, 28, 32).translate(0, 0, z), M.steel); // main journal, 2.45"
  k.add(crank, cylZ(24, 80, 32).translate(0, 0, 260), M.steel); // snout
  const crankSprocket = k.add(crank, gear(CHAIN.z1, CHAIN.p / Math.PI, 14, {bore: 10}), M.steel);
  crankSprocket.position.z = CHAIN.z;
  // harmonic balancer + belt pulley, flywheel with its 153-tooth ring gear
  k.add(crank, cylZ(101.6, 44, 64).translate(0, 0, 300), M.blackGloss);
  k.add(crank, box(4, 14, 3, 0, 96, 323), M.white); // timing mark
  k.add(crank, cylZ(86, 18, 64).translate(0, 0, 334), M.steel);
  k.add(crank, cylZ(80, 8, 64).translate(0, 0, 334), M.blackSatin); // the V-groove
  k.add(crank, cylZ(24, 70, 24).translate(0, 0, -255), M.steel);
  k.add(crank, cylZ(160, 24, 72).translate(0, 0, -296), M.iron);
  k.add(crank, gear(153, 2.32, 20, {bore: 120}).translate(0, 0, -296), M.steel);
  k.add(root, box(80, 50, 30, 0, 125, 318), M.steel); // timing tab on the cover line (fixed)

  // ------------------------------------------------------------------ camshaft, sprocket, chain
  const cam = k.group(root, 0, E.camY, 0);
  k.add(cam, cylZ(12, 520, 24), M.steel);
  for (const z of [-220, -110, 0, 110, 220]) k.add(cam, cylZ(23.8, 20, 32).translate(0, 0, z), M.steel); // journals, 1.87"
  const camSprocket = k.add(cam, gear(CHAIN.z2, CHAIN.p / Math.PI, 12, {bore: 14}), M.steel);
  camSprocket.position.z = CHAIN.z;
  k.add(cam, cylZ(18, 30, 24).translate(0, 0, CHAIN.z - 16), M.steel); // nose that carries the sprocket
  const lobeGeo = (() => {
    const sh = new THREE.Shape();
    const n = 96;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const deg = ((a * 180) / Math.PI + 540) % 360 - 180; // -180..180 from the nose
      const r = BASE_R + (Math.abs(deg) < 65 ? LOBE_LIFT * Math.cos((Math.PI * deg) / 130) ** 2 : 0);
      const x = -r * Math.sin(a);
      const y = r * Math.cos(a);
      i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    return new THREE.ExtrudeGeometry(sh, {depth: 14, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 1}).translate(0, 0, -7);
  })();
  // chain path: two pitch circles joined by their outer tangents
  const R1 = CHAIN.p / (2 * Math.sin(Math.PI / CHAIN.z1));
  const R2 = CHAIN.p / (2 * Math.sin(Math.PI / CHAIN.z2));
  const DCH = E.camY;
  const gam = Math.asin((R2 - R1) / DCH);
  const tanLen = Math.sqrt(DCH * DCH - (R2 - R1) ** 2);
  const aR = -gam; // right tangent normal angle (from +x)
  const aL = Math.PI + gam;
  const arc2 = aL - aR; // over the top of the cam sprocket
  const arc1 = Math.PI * 2 - arc2;
  const LOOP = 2 * tanLen + R2 * arc2 + R1 * arc1;
  const NLINK = Math.round(LOOP / CHAIN.p);
  const chainAt = (u) => {
    u = mod(u, LOOP);
    const T1R = [R1 * Math.cos(aR), R1 * Math.sin(aR)];
    const T2R = [R2 * Math.cos(aR), DCH + R2 * Math.sin(aR)];
    if (u < tanLen) return [T1R[0] + ((T2R[0] - T1R[0]) * u) / tanLen, T1R[1] + ((T2R[1] - T1R[1]) * u) / tanLen];
    u -= tanLen;
    if (u < R2 * arc2) {
      const a = aR + u / R2;
      return [R2 * Math.cos(a), DCH + R2 * Math.sin(a)];
    }
    u -= R2 * arc2;
    const T2L = [R2 * Math.cos(aL), DCH + R2 * Math.sin(aL)];
    const T1L = [R1 * Math.cos(aL), R1 * Math.sin(aL)];
    if (u < tanLen) return [T2L[0] + ((T1L[0] - T2L[0]) * u) / tanLen, T2L[1] + ((T1L[1] - T2L[1]) * u) / tanLen];
    u -= tanLen;
    const a = aL + u / R1;
    return [R1 * Math.cos(a), R1 * Math.sin(a)];
  };
  const plates = instancedLinks(M.blackSatin, NLINK * 2, {radial: 8, open: false});
  const rollers = instancedLinks(M.steel, NLINK, {radial: 10, open: false});
  root.add(plates.mesh, rollers.mesh);

  // ------------------------------------------------------------------ cylinders: liner, charge, piston, rod, valvetrain, plug
  const CHARGE_COL = {INTAKE: new THREE.Color('#3f8de0'), COMPRESSION: new THREE.Color('#6a7686'), POWER: new THREE.Color('#ff6a1f'), EXHAUST: new THREE.Color('#8b8f95')};
  const pistonGeo = lathe([[0, -32], [50.3, -32], [50.5, 10], [50.5, 14], [49.2, 14], [49.2, 17], [50.5, 17], [50.5, 21], [49.2, 21], [49.2, 24], [50.5, 24], [50.5, 28], [49.2, 28], [49.2, 31], [50.5, 31], [50.5, 37.6], [48.5, 39.6], [0, 39.6]], 48);
  const rodGeo = (() => {
    const Lr = E.rod;
    const parts = [cylZ(34, 22, 32).translate(0, -Lr / 2, 0), cylZ(15, 22, 24).translate(0, Lr / 2, 0), box(20, Lr - 60, 8, 0, 0, 0), box(8, Lr - 60, 20, 0, 0, 0), box(70, 14, 22, 0, -Lr / 2 - 22, 0)];
    return parts;
  })();
  const valveGeo = {};
  for (const kind of ['in', 'ex']) {
    valveGeo[kind] = [new THREE.CylinderGeometry(4.5, VALVE_R[kind], 5, 32).translate(0, SEAT - 2.5, 0), cylY(4, 124, 12).translate(0, SEAT + 62, 0), cylY(14, 4, 24).translate(0, DECK + 122, 0)];
  }
  const cyl = CYL.map((cy, i) => {
    const g = bankFrame(root, cy.bank, cy.z);
    const liner = k.add(g, new THREE.CylinderGeometry(E.bore / 2 + 2, E.bore / 2 + 2, 130, 48, 1, true).translate(0, DECK - 65, 0), M.glass, false);
    liner.renderOrder = 3;
    const charge = new THREE.Mesh(cylY(E.bore / 2 - 1, 1, 40), new THREE.MeshBasicMaterial({color: '#4a90e2', transparent: true, opacity: 0.35, depthWrite: false}));
    charge.renderOrder = 2;
    g.add(charge);
    stage.noAO.push(charge, liner);
    const pist = k.group(g);
    k.add(pist, pistonGeo, M.alu);
    k.add(pist, cylZ(11, 62, 20), M.steel); // wrist pin, along the crank
    const rod = new THREE.Group();
    root.add(rod);
    for (const p of rodGeo) k.add(rod, p, M.steel);
    // two valves: E I I E E I I E along each head
    const order = cy.k % 2 === 0 ? ['ex', 'in'] : ['in', 'ex'];
    const valves = order.map((kind, j) => {
      const vz = j === 0 ? VALVE_DZ : -VALVE_DZ;
      const vg = k.group(g, VALVE_X, 0, vz);
      for (const p of valveGeo[kind]) k.add(vg, p, kind === 'in' ? M.steel : M.chrome);
      const spr = k.group(g, VALVE_X, DECK + 76, vz);
      k.add(spr, spring(15, 2.4, 6, 45), M.blue);
      // lifter on the cam, pushrod, rocker on its stud
      const lifter = k.add(g, cylY(10.7, 50, 24), M.iron);
      lifter.position.set(W_CAM, 0, vz);
      const pushrod = k.add(g, cylY(4, 1, 10), M.chrome);
      const rocker = k.group(g, ROCK.x, ROCK.y, vz);
      k.add(rocker, rb(56, 12, 16, 4).translate(5, 0, 0), M.steel);
      k.add(rocker, cylZ(5, 16, 12).translate(ROCK.b, -6, 0), M.steel); // the roller tip on the stem
      k.add(g, cylY(5, 50, 12).translate(ROCK.x, DECK + 113, vz), M.steel); // stud
      k.add(g, cylY(8, 8, 6).translate(ROCK.x, DECK + 146, vz), M.steel); // nut
      // the lobe for this valve: its nose meets the lifter when the valve is fully open
      const lobe = k.group(cam, 0, 0, cy.z + vz);
      k.add(lobe, lobeGeo, M.steel);
      const bankRot = cy.bank === 'L' ? -45 : 45; // the lifter's direction from the cam centre, as a rotation
      lobe.rotation.z = (bankRot + (FIRE[cy.c] + peakOf(kind)) / 2) * D2R;
      return {kind, vz, vg, spr, lifter, pushrod, rocker, lobe, lift: 0};
    });
    // spark plug on the outboard side, leaning out
    const plug = k.group(g, 54, DECK + 30, 0);
    plug.rotation.z = -0.6;
    k.add(plug, cylY(6.5, 38, 16).translate(0, 30, 0), M.ceramic);
    k.add(plug, cylY(9, 10, 6).translate(0, 6, 0), M.steel);
    k.add(plug, cylY(3, 12, 8).translate(0, 54, 0), M.steel);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), M.spark.clone());
    spark.position.set(0, -18, 0); // the electrode, down the plug's axis in the chamber
    spark.material.transparent = true;
    plug.add(spark);
    stage.noAO.push(spark);
    return {cy, i, g, liner, charge, pist, rod, valves, plug, spark};
  });

  // ------------------------------------------------------------------ intake, carburettor, air cleaner, distributor, wires
  xadd(root, rb(170, 64, 400, 16).translate(0, 330, 0), XR.intake);
  for (const c of cyl) {
    const v = c.valves.find((x) => x.kind === 'in');
    const port = bankPt(c.cy.bank, -80, DECK + 52);
    const z = c.cy.z + v.vz;
    const sx = Math.sign(port[0]);
    xadd(root, tube([[sx * 40, 330, z * 0.85], [sx * 95, 320, z * 0.95], [port[0], port[1], z]], 19, 16), XR.intake);
  }
  xadd(root, rb(150, 70, 140, 10).translate(0, 397, 0), XR.intake); // carb body
  const throttles = [];
  for (const [x, z] of [[-33, 35], [33, 35], [-33, -35], [33, -35]]) {
    k.add(root, new THREE.CylinderGeometry(22, 22, 72, 24, 1, true).translate(x, 397, z), M.blackSatin);
    const t = k.add(root, cylY(21, 2, 24), M.brass);
    t.position.set(x, 400, z);
    throttles.push(t);
  }
  xadd(root, new THREE.CylinderGeometry(178, 178, 66, 64).translate(0, 470, 0), XR.cover); // 14" air cleaner
  k.add(root, cylY(10, 14, 6).translate(0, 510, 0), M.chrome); // wing nut
  const DIST = {x: 0, z: -262, y: 405};
  k.add(root, cylY(30, 190, 24).translate(DIST.x, DIST.y - 120, DIST.z), M.iron); // body, down into the block
  xadd(root, cylY(50, 44, 32).translate(DIST.x, DIST.y + 4, DIST.z), XR.cap);
  const rotor = k.group(root, DIST.x, DIST.y - 4, DIST.z);
  k.add(rotor, box(10, 8, 40, 0, 0, 16), M.red);
  const towerTop = {};
  for (const c of ORDER) {
    const a = (-FIRE[c] / 2) * D2R; // the rotor's heading when cylinder c fires
    const p = [DIST.x + Math.sin(a) * 36, DIST.y + 40, DIST.z + Math.cos(a) * 36];
    k.add(root, cylY(7, 22, 12).translate(p[0], p[1] - 6, p[2]), M.blackGloss);
    towerTop[c] = p;
  }
  for (const c of cyl) {
    const b = c.cy.bank;
    const tip = bankPt(b, 54 + 62 * Math.sin(0.6), DECK + 30 + 62 * Math.cos(0.6));
    const over = bankPt(b, 40, DECK + 175);
    const t = towerTop[c.cy.c];
    k.add(root, tube([[tip[0], tip[1], c.cy.z], [tip[0] * 1.08, tip[1] + 30, c.cy.z], [over[0], over[1], c.cy.z * 0.8], [t[0] + Math.sign(over[0]) * 60, t[1] + 40, t[2] + 40], [t[0], t[1] + 16, t[2]]], 3.5, 40), M.wire);
  }

  // ------------------------------------------------------------------ exhaust headers
  for (const bank of ['L', 'R']) {
    const sx = bank === 'L' ? 1 : -1;
    const col = [sx * 285, -40, -150];
    for (const c of cyl.filter((x) => x.cy.bank === bank)) {
      const v = c.valves.find((x) => x.kind === 'ex');
      const port = bankPt(bank, 86, DECK + 44);
      const z = c.cy.z + v.vz;
      k.add(root, tube([[port[0], port[1], z], [port[0] + sx * 60, port[1] - 15, z], [sx * 290, 90, z * 0.7 - 40], [col[0], col[1] + 40, col[2] + 20], [col[0], col[1], col[2]]], 20, 48), M.header);
    }
    k.add(root, cylY(40, 120, 32).translate(col[0], col[1] - 50, col[2]), M.header); // collector
  }

  // ------------------------------------------------------------------ water pump, belt
  k.add(root, rb(150, 120, 46, 14).translate(0, 190, 292), M.orange);
  const pumpPulley = k.group(root, 0, 190, 334);
  k.add(pumpPulley, cylZ(72, 18, 48), M.steel);
  for (let n = 0; n < 4; n++) k.bolts(pumpPulley, [[Math.cos((n * Math.PI) / 2) * 28, Math.sin((n * Math.PI) / 2) * 28, 10]]);
  {
    // the belt round the balancer pulley (r 86 at y 0) and the pump pulley (r 72 at y 190): outer tangents
    const r1 = 86;
    const r2 = 72;
    const D = 190;
    const g2 = Math.asin((r2 - r1) / D);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = -g2 + ((Math.PI + 2 * g2) * i) / 40;
      pts.push([r2 * Math.cos(a), D + r2 * Math.sin(a), 334]);
    }
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + g2 + ((Math.PI - 2 * g2) * i) / 40;
      pts.push([r1 * Math.cos(a), r1 * Math.sin(a), 334]);
    }
    pts.push(pts[0]);
    k.add(root, tube(pts, 5, 160), M.rubber);
  }

  // ------------------------------------------------------------------ engine stand: motor mounts on the block sides
  for (const sx of [-1, 1]) {
    k.add(root, rb(50, 70, 120, 8).translate(sx * 137, 10, 60), M.rubber);
    k.add(root, box(60, 10, 140, sx * 137, -30, 60), M.blackSatin);
    const leg = k.add(root, ibeam(HEIGHT - 35, 120, 120, 10, 8), M.blackSatin);
    leg.position.set(sx * 137, -HEIGHT, 60);
    k.add(root, box(300, 12, 300, sx * 137, -HEIGHT + 6, 60), M.blackSatin);
  }

  // ------------------------------------------------------------------ pose
  const st = {th: 0, rpm: 900, throttle: 0.3};
  const tA = V(0, 0, 0);
  const tB = V(0, 0, 0);
  const rot2 = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const pose = (th) => {
    st.th = th;
    crank.rotation.z = -th * D2R; // clockwise from the front
    cam.rotation.z = (-th / 2) * D2R;
    rotor.rotation.y = (-th / 2) * D2R;
    pumpPulley.rotation.z = (-th * (86 / 72)) * D2R;
    for (const t of throttles) t.rotation.x = (Math.PI / 2) * (1 - st.throttle) * 0.95;
    for (const c of cyl) {
      const {s, P, pin} = piston(c.i, th);
      c.pist.position.y = s;
      aim(c.rod, tA.set(P[0], P[1], c.cy.z), tB.set(pin[0], pin[1], c.cy.z));
      const ps = psi(c.cy.c, th);
      // the charge between the crown and the chamber roof
      const crown = s + E.comp;
      c.charge.position.y = (crown + SEAT) / 2;
      c.charge.scale.y = Math.max(1, SEAT - crown);
      const stroke = strokeOf(ps);
      c.charge.material.color.copy(CHARGE_COL[stroke]);
      const p = pressure(ps, st.throttle);
      c.charge.material.opacity = stroke === 'POWER' ? 0.25 + 0.55 * Math.min(1, p / 50) : stroke === 'INTAKE' ? 0.3 : 0.2;
      // spark: a flash at SPARK_ADV before TDC that dies off as the flame takes over
      const since = mod(ps - (720 - SPARK_ADV), 720);
      c.spark.material.opacity = since < 25 ? 1 - since / 25 : 0;
      c.spark.scale.setScalar(since < 25 ? 1.6 - since / 25 : 0.001);
      for (const v of c.valves) {
        const lift = (v.kind === 'in' ? liftIn(ps) : liftEx(ps)) * VALVE.lift;
        v.lift = lift;
        v.vg.position.y = -lift;
        v.spr.scale.y = (45 - lift) / 45;
        const ll = lift / E.rocker; // at the lifter
        v.lifter.position.y = D_CAM + BASE_R + ll + 25;
        const alpha = ll / ROCK.a;
        v.rocker.rotation.z = -alpha;
        const cup = rot2(-ROCK.a, -6, -alpha);
        aim(v.pushrod, tA.set(W_CAM, D_CAM + BASE_R + ll + 50, v.vz), tB.set(ROCK.x + cup[0], ROCK.y + cup[1], v.vz), {stretch: true});
      }
    }
    // chain: links ride the loop at the crank sprocket's pitch-line speed
    const off = -th * D2R * R1;
    const step = LOOP / NLINK;
    plates.begin();
    rollers.begin();
    for (let n = 0; n < NLINK; n++) {
      const a = chainAt(off + n * step);
      const b = chainAt(off + (n + 1) * step);
      for (const dz of [-5.5, 5.5]) plates.link(V(a[0], a[1], CHAIN.z + dz), V(b[0], b[1], CHAIN.z + dz), 4.2);
      rollers.link(V(a[0], a[1], CHAIN.z - 7), V(a[0], a[1], CHAIN.z + 7), 3.2);
    }
    plates.end();
    rollers.end();
    root.updateMatrixWorld(true);
  };
  const setXray = (x) => {
    for (const m of Object.values(XR)) {
      const tr = x > 0.01;
      if (m.transparent !== tr) m.needsUpdate = true;
      m.transparent = tr;
      m.opacity = 1 - 0.85 * x;
      m.depthWrite = x < 0.5;
    }
    // see-through casings must not cast AO onto what's inside them
    for (const mesh of xrMeshes) {
      const i = stage.noAO.indexOf(mesh);
      if (x > 0.3 && i < 0) stage.noAO.push(mesh);
      if (x <= 0.3 && i >= 0) stage.noAO.splice(i, 1);
    }
  };
  pose(0);

  let cycle = 0;
  return {
    root,
    focus: [0, HEIGHT / 1000 + 0.15, 0],
    radius: 0.85,
    view: {az: 38, el: 16},
    params: [
      {key: 'rpm', label: 'engine speed', min: 600, max: 6000, step: 50, value: 1200, unit: 'rpm'},
      {key: 'throttle', label: 'throttle', min: 0, max: 1, step: 0.01, value: 0.35},
      {key: 'slowmo', label: 'playback (x real time)', min: 0, max: 0.25, step: 0.005, value: 0.04},
      {key: 'crank', label: 'crank angle (playback 0)', min: 0, max: 720, step: 1, value: 0, unit: '°'},
      {key: 'xray', label: 'x-ray', min: 0, max: 1, step: 0.01, value: 0.82},
    ],
    update(dt, t, p) {
      st.rpm = p.rpm;
      st.throttle = p.throttle;
      setXray(p.xray);
      if (p.slowmo > 0) cycle = mod(cycle + p.rpm * 6 * dt * p.slowmo, 720); // deg/s = rpm * 6
      else cycle = p.crank;
      pose(cycle);
    },
    readout() {
      const th = st.th;
      const firing = ORDER.reduce((a, c) => (psi(c, th) < psi(a, th) ? c : a)); // the most recent to fire
      const Ti = gasTorque(th, st.throttle);
      const Tm = meanTorque(st.throttle);
      const w = (st.rpm * 2 * Math.PI) / 60;
      const kW = (Tm * MECH_EFF * w) / 1000;
      const strokes = CYL.map((c) => `${c.c}${strokeOf(psi(c.c, th))[0]}`).join(' ');
      return [
        `${st.rpm.toFixed(0)} rpm · throttle ${(st.throttle * 100).toFixed(0)}% · crank ${mod(th, 360).toFixed(0)}° (cycle ${th.toFixed(0)}°)`,
        `last fired: cyl ${firing}   order 1-8-4-3-6-5-7-2   (two cylinders are always on power)`,
        `strokes  ${strokes}   (P/E/I/C)`,
        `cyl 1 pressure ${pressure(psi(1, th), st.throttle).toFixed(1)} bar`,
        `gas torque now ${Ti.toFixed(0)} N·m · mean ${Tm.toFixed(0)} N·m · IMEP ${imep(st.throttle).toFixed(1)} bar`,
        `brake (est. ${MECH_EFF * 100}%): ${(Tm * MECH_EFF).toFixed(0)} N·m · ${kW.toFixed(0)} kW (${(kW * 1.341).toFixed(0)} hp)`,
        `mean piston speed ${((2 * (E.r * 2) * st.rpm) / 60000).toFixed(1)} m/s · ${(DISPLACEMENT * 1000).toFixed(2)} L`,
      ];
    },
    // invariants, all measured on the rendered parts
    probe() {
      const out = {rodErr: 0, pinOffAxis: 0, pushrod: []};
      const wp = new THREE.Vector3();
      const jp = new THREE.Vector3();
      for (const c of cyl) {
        // the rod: crank journal (on the rendered crank) to wrist pin (on the rendered piston) must be the rod length
        const [x, y] = pinXY(c.cy.pin, 0);
        jp.set(x, y, c.cy.z).applyMatrix4(crank.matrix);
        c.pist.localToWorld(wp.set(0, 0, 0));
        root.worldToLocal(wp);
        out.rodErr = Math.max(out.rodErr, Math.abs(jp.distanceTo(wp) - E.rod));
        // the wrist pin must stay on its bore axis
        c.g.worldToLocal(c.pist.localToWorld(wp.set(0, 0, 0)));
        out.pinOffAxis = Math.max(out.pinOffAxis, Math.abs(wp.x));
        for (const v of c.valves) out.pushrod.push(+v.pushrod.scale.y.toFixed(2));
      }
      return {
        rodErr: +out.rodErr.toFixed(4),
        pinOffAxis: +out.pinOffAxis.toFixed(4),
        pushrodMin: Math.min(...out.pushrod),
        pushrodMax: Math.max(...out.pushrod),
        chainLinks: NLINK,
        chainSlack: +(LOOP - NLINK * CHAIN.p).toFixed(2),
        th: +st.th.toFixed(1),
      };
    },
    // timing, measured on the rendered parts: pose each cylinder's firing moment and check the rotor points at its
    // tower; pose each valve's peak and check its lobe's nose points along its lifter. Restores the pose after.
    timingCheck() {
      const keep = st.th;
      let rotorErr = 0;
      let lobeErr = 0;
      const d = new THREE.Vector3();
      for (const c of cyl) {
        pose(FIRE[c.cy.c]);
        rotor.getWorldDirection(d);
        const t = towerTop[c.cy.c];
        const want = Math.atan2(t[0] - DIST.x, t[2] - DIST.z);
        rotorErr = Math.max(rotorErr, Math.abs(mod(Math.atan2(d.x, d.z) - want + Math.PI, 2 * Math.PI) - Math.PI) / D2R);
        for (const v of c.valves) {
          pose(FIRE[c.cy.c] + peakOf(v.kind));
          const nose = new THREE.Vector3(0, 1, 0).applyQuaternion(v.lobe.getWorldQuaternion(new THREE.Quaternion()));
          const B = BANK[c.cy.bank].b;
          lobeErr = Math.max(lobeErr, Math.abs(mod(Math.atan2(nose.x, nose.y) - Math.atan2(B[0], B[1]) + Math.PI, 2 * Math.PI) - Math.PI) / D2R);
        }
      }
      pose(keep);
      return {rotorErrDeg: +rotorErr.toFixed(3), lobeErrDeg: +lobeErr.toFixed(3)};
    },
    // the valve-to-piston clearance over a whole cycle, from the same functions that pose the parts
    clearance() {
      let min = Infinity;
      let at = 0;
      for (let th = 0; th < 720; th += 0.5) {
        for (let i = 0; i < 8; i++) {
          const ps = psi(CYL[i].c, th);
          const crown = piston(i, th).s + E.comp;
          const lift = Math.max(liftIn(ps), liftEx(ps)) * VALVE.lift;
          const gap = SEAT - 5 - lift - crown;
          if (gap < min) {
            min = gap;
            at = th;
          }
        }
      }
      return {minGapMm: +min.toFixed(2), atCycleDeg: at, tdcCrownBelowDeck: +(E.deck - S_TDC - E.comp).toFixed(3)};
    },
  };
}
