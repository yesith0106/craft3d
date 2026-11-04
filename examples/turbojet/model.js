// A small axial turbojet, drawn as a technical illustration by default (the drawing look) and switchable to metal.
// Everything comes from kin.js: the annulus from continuity, the blade rows from the stage layout, the flow lines'
// colour from the gas temperature, their speed from the axial velocity, the spool's speed from the tip speed.
//   spool (spinner, 5 compressor discs with rotor rows, shaft, turbine disc and blades) turns at N
//   casing, inlet guide vanes, 5 stator rows, the annular combustor and its 12 injectors, the nozzle guide vanes,
//   the tail cone and its struts stay still
// Sliders: speed (% of design), playback, flow lines, exploded view; the drawing look adds the section cut.
import * as THREE from 'three';
import {cleanMaterials} from '../craft/materials.js';
import {blade, box, cylZ, kit, turned} from '../craft/shapes.js';
import {exploder, mod} from '../craft/rig.js';
import {centerline, inkLine, ramp} from '../craft/ink.js';
import {AIR, atSpeed, casingAt, CYCLE, D, hubAt, MDOT, ROW, ROWS, RPM, S, swirlAt, tempAt} from './kin.js';

export const info = {name: 'Axial turbojet', description: '5-stage compressor · PR 4.5 · annular combustor · 1100 K · single-stage turbine', stage: 'studio', wear: false, look: 'drawing'};

const HEIGHT = 420; // axis above the floor, mm
const Z0 = 288; // z = Z0 - s: the engine centred on the origin, the inlet toward +z (the front)
const zOf = (s) => Z0 - s;
const WALL = 3; // casing wall

export function build({stage, ink}) {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  root.position.y = HEIGHT / 1000;
  const M = cleanMaterials();
  M.ti = new THREE.MeshStandardMaterial({color: '#b9bcc1', roughness: 0.32, metalness: 1}); // titanium compressor
  M.ni = new THREE.MeshStandardMaterial({color: '#8b847c', roughness: 0.42, metalness: 1}); // nickel turbine, heat tinted
  M.hot = new THREE.MeshStandardMaterial({color: '#9a8a78', roughness: 0.5, metalness: 0.9}); // combustor liner
  const k = kit({boltMat: M.steel});
  // a turned part from [[r, s], ...] (s along the flow), axis along z
  const lathe = (pts, segs = 128) => turned(pts.map(([r, s]) => [r, zOf(s)]), segs).rotateX(Math.PI / 2);

  const spool = k.group(root); // everything that turns
  spool.userData.noCut = true; // section drawings leave the rotor whole
  const still = k.group(root);
  const pieces = []; // [object, s] in flow order, for the exploded view

  // ------------------------------------------------------------------ blade rows
  const rotorRows = []; // [row, geometry] for the clearance probe
  const row = (r, parent, mat) => {
    const hub = r.kind === 'rotor' || r.kind === 'turbine' ? (z) => hubAt(r.s - z) - 1 : (z) => hubAt(r.s - z) + 0.8;
    const tip = r.kind === 'rotor' ? (z) => casingAt(r.s - z) - D.clearC : r.kind === 'turbine' ? (z) => casingAt(r.s - z) - D.clearT : (z) => casingAt(r.s - z) + 1.5;
    const geo = blade({hub, tip, chord: r.chord, stagger: r.stag, camber: r.camber, thick: r.thick});
    if (r.kind === 'rotor' || r.kind === 'turbine') rotorRows.push([r, geo]);
    const im = new THREE.InstancedMesh(geo, mat, r.z);
    const m = new THREE.Matrix4();
    for (let i = 0; i < r.z; i++) im.setMatrixAt(i, m.makeRotationZ((2 * Math.PI * i) / r.z));
    im.castShadow = true;
    const g = k.group(parent, 0, 0, zOf(r.s));
    g.add(im);
    return g;
  };

  // spinner and the front of the drum
  const spinner = k.group(spool);
  k.add(spinner, lathe([[0, S.nose], [14, S.nose + 6], [26, S.nose + 20], [35, S.nose + 38], [D.rHub0 - 4.5, S.igv - 6], [D.rHub0 - 4.5, S.igv + 9], [D.rHub0, -10], [D.rHub0, -3], [18, -3], [0, -3], [0, S.nose]]), M.chrome);
  pieces.push([spinner, S.nose]);
  const igv = row(ROWS[0], still, M.ti);
  pieces.push([igv, S.igv]);

  for (let i = 0; i < D.stages; i++) {
    const s0 = S.c0 + i * S.stage;
    const rR = ROWS[1 + 2 * i];
    const rS = ROWS[2 + 2 * i];
    // the stage's disc: rim under the rotor row, a thin web, a bore on the shaft; a spacer under the stator
    const st = k.group(spool);
    const rim = (s) => hubAt(s);
    const a = s0 - 3;
    const b = s0 + ROW.rotor + 3;
    const c2 = s0 + S.stage - 3;
    k.add(st, lathe([[rim(a), a], [rim(b), b], [rim(b) - 1.5, b], [rim(c2) - 1.5, c2], [rim(c2) - 6, c2], [rim(c2) - 6, b + 2], [rim(b) - 9, b], [rim(b) - 9, b - 4], [30, b - 8], [30, a + 8], [rim(a) - 9, a + 4], [rim(a) - 9, a], [rim(a), a]]), M.ti);
    k.add(st, lathe([[19, a + 6], [30, a + 6], [30, b - 6], [19, b - 6], [19, a + 6]], 64), M.steel); // the hub on the shaft
    row(rR, st, M.ti);
    pieces.push([st, rR.s]);
    const sg = row(rS, still, M.ti);
    pieces.push([sg, rS.s]);
  }

  // shaft
  k.add(spool, cylZ(18, S.tr - S.c0 + 40, 48).translate(0, 0, zOf((S.c0 + S.tr) / 2 - 10)), M.steel);
  // turbine: disc with a fir-tree rim, the blade row
  const turb = k.group(spool);
  const tr = ROWS[ROWS.length - 1];
  {
    const a = tr.s - 15;
    const b = tr.s + 15;
    k.add(turb, lathe([[D.rHubT - 1, a], [D.rHubT - 1, b], [D.rHubT - 12, b], [D.rHubT - 14, b - 9], [30, b - 6], [24, b - 6], [24, a + 6], [30, a + 6], [D.rHubT - 14, a + 9], [D.rHubT - 12, a], [D.rHubT - 1, a]]), M.ni);
    row(tr, turb, M.ni);
  }
  pieces.push([turb, tr.s]);

  // ------------------------------------------------------------------ the still parts
  // casing: the inner wall follows the gas path (tip clearance over every rotor), flanges at the joints
  const FL = [-44, 140, S.cEnd + 10, S.comb[1] - 4, S.tr + 30];
  const casingPts = [];
  const sIn = -62;
  for (let s = sIn; s <= S.exit; s += 4) casingPts.push([casingAt(s), s]);
  const outer = [];
  for (let s = S.exit; s >= sIn; s -= 2) {
    const f = FL.some((q) => Math.abs(s - q) <= 5) ? 7 : 0;
    outer.push([casingAt(s) + WALL + f, s]);
  }
  // a rounded inlet lip, outer wall to inner wall
  const lip = [];
  for (let i = 1; i < 8; i++) {
    const a = (Math.PI * i) / 8;
    lip.push([casingAt(sIn) + WALL / 2 + (WALL / 2) * Math.cos(a), sIn - (WALL / 2) * Math.sin(a) * 2]);
  }
  const casing = k.add(still, lathe([...casingPts, [casingAt(S.exit) + WALL, S.exit], ...outer, ...lip, casingPts[0]], 160), M.alu);
  // the static inner wall through the combustor, from the last disc to the nozzle guide vanes
  const inner = k.add(still, lathe([[hubAt(S.cEnd + 4) - 1, S.cEnd + 4], [hubAt(S.diff[1]), S.diff[1]], [hubAt(S.comb[0] + 10), S.comb[0] + 10], [hubAt(S.comb[1]), S.comb[1]], [hubAt(S.ngv - 12), S.ngv - 12], [hubAt(S.ngv - 12) - 3, S.ngv - 12], [hubAt(S.comb[1]) - 3, S.comb[1]], [hubAt(S.comb[0] + 10) - 3, S.comb[0] + 10], [24, S.cEnd + 30], [24, S.cEnd + 4], [hubAt(S.cEnd + 4) - 1, S.cEnd + 4]]), M.castAlu);
  pieces.push([inner, S.diff[1]]);

  // annular combustor: an inner and an outer liner joined by a domed head, open at the back
  const comb = k.group(still);
  {
    const r1 = 64;
    const r2 = 100;
    const f = S.comb[0] + 14;
    const e = S.comb[1] - 2;
    const t = 1.6;
    const dome = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (i / 12);
      dome.push([(r1 + r2) / 2 + ((r2 - r1) / 2) * Math.cos(a), f - 10 * Math.sin(a)]);
    }
    const domeIn = dome.map(([r, s]) => [(r1 + r2) / 2 + (r - (r1 + r2) / 2) * ((r2 - r1) / 2 - t) / ((r2 - r1) / 2), s + t]);
    k.add(comb, lathe([[r2, e], ...dome, [r1, e], [r1 + t, e], ...domeIn.reverse(), [r2 - t, e], [r2, e]], 160), M.hot);
    // fuel injectors through the dome, with a swirler ring each
    for (let i = 0; i < 12; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / 12;
      const g = k.group(comb, ((r1 + r2) / 2) * Math.cos(a), ((r1 + r2) / 2) * Math.sin(a), zOf(f - 6));
      k.add(g, cylZ(3, 34, 16).translate(0, 0, 14), M.steel);
      k.add(g, cylZ(7, 5, 24), M.steel);
    }
    // the feed stems out through the casing
    for (let i = 0; i < 12; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / 12;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 118 - ((r1 + r2) / 2), 12), M.steel);
      const rm = (118 + (r1 + r2) / 2) / 2;
      st.position.set(rm * Math.cos(a), rm * Math.sin(a), zOf(f - 26));
      st.rotation.z = a - Math.PI / 2;
      comb.add(st);
      const bend = new THREE.Mesh(cylZ(2.6, 20, 12), M.steel);
      bend.position.set(((r1 + r2) / 2) * Math.cos(a), ((r1 + r2) / 2) * Math.sin(a), zOf(f - 16));
      comb.add(bend);
    }
  }
  pieces.push([comb, S.comb[0]]);
  const ngv = row(ROWS[ROWS.length - 2], still, M.ni);
  pieces.push([ngv, S.ngv]);
  // tail cone on four struts
  const tail = k.group(still);
  {
    const a = S.tr + 18;
    const pts = [];
    for (let s = a; s <= S.tailEnd; s += 6) pts.push([hubAt(s) - 1, s]);
    k.add(tail, lathe([[0, a], ...pts, [hubAt(S.tailEnd) - 1, S.tailEnd], [0, S.tailEnd], [0, a]]), M.ni);
    const sS = S.tr + 80;
    const strut = blade({hub: (z) => hubAt(sS - z) - 2, tip: (z) => casingAt(sS - z) + 1.5, chord: 34, stagger: [0, 0], thick: 0.14, camber: 0});
    const im = new THREE.InstancedMesh(strut, M.ni, 4);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) im.setMatrixAt(i, m.makeRotationZ((Math.PI / 2) * i + Math.PI / 4));
    im.position.z = zOf(sS);
    tail.add(im);
  }
  pieces.push([tail, S.tailEnd]);

  // ------------------------------------------------------------------ stand (the metal look only)
  const standG = k.group(root);
  standG.userData.realOnly = true;
  for (const s of [60, S.tr - 30]) {
    const r = casingAt(s) + WALL;
    const z = zOf(s);
    k.add(standG, box(150, HEIGHT - r + 6, 34, 0, -HEIGHT + (HEIGHT - r + 6) / 2, z), M.blackSatin);
    k.add(standG, box(240, 12, 120, 0, -HEIGHT + 6, z), M.blackSatin);
  }

  // ------------------------------------------------------------------ centre line and flow lines
  root.add(centerline([0, 0, zOf(S.nose - 70)], [0, 0, zOf(S.tailEnd + 90)]));
  const flow = k.group(root);
  const lines = [];
  {
    const N = 18;
    const FR = [0.22, 0.5, 0.78];
    for (let j = 0; j < N; j++)
      for (const f of FR) {
        let th = (2 * Math.PI * j) / N + f * 0.9;
        const pts = [];
        const cols = [];
        for (let s = S.nose - 40; s <= S.tailEnd + 80; s += 2) {
          th += swirlAt(s) * 2 * 6;
          let rh = s < S.nose ? 0 : s < -10 ? Math.min(D.rHub0, hubAt(-10) * Math.sqrt(Math.max(0, (s - S.nose) / (-10 - S.nose)))) : s > S.tailEnd ? 0 : hubAt(s);
          let rt = s < -62 ? D.rTip + 4 + (-62 - s) * 0.12 : s > S.exit ? casingAt(S.exit) + (s - S.exit) * 0.15 : casingAt(s);
          if (s > S.tailEnd) rh = 0;
          if (s > S.comb[0] + 4 && s < S.comb[1]) {
            rh = 66; // through the liner
            rt = 98;
          }
          const r = rh + (rt - rh) * f;
          pts.push([r * Math.cos(th), r * Math.sin(th), zOf(s)]);
          cols.push(ramp((tempAt(s) - AIR.T0) / (D.TIT - AIR.T0)));
        }
        const l = inkLine(pts, {colors: cols, width: 1.5, dashed: true, dash: 22, gap: 7});
        l.material.clippingPlanes = ink?.planes ?? null; // the section cut opens the far half only
        l.material.clipping = true;
        flow.add(l);
        lines.push(l);
      }
  }

  // ------------------------------------------------------------------ exploded view
  // the casing lifts off first, then the rest slides apart along the axis like an accordion, front forward, back back
  const lift = exploder([{obj: casing, dir: [0, 1, 0], dist: 270}], {span: 1});
  pieces.sort((a, b) => a[1] - b[1]);
  const mid = (pieces.length - 1) / 2;
  const slide = exploder(pieces.map(([obj], q) => ({obj, dir: [0, 0, 1], dist: (mid - q) * 30, at: 0})), {span: 1});

  root.updateMatrixWorld(true);
  const st = {th: 0, n: 1, off: 0};
  return {
    root,
    focus: [0, HEIGHT / 1000, 0],
    radius: 0.42,
    view: {az: 52, el: 20, d: 2.6},
    // a cut along the axis: the plane x = 0, removing the near (+x) half
    section: {normal: [1, 0, 0], from: 0.16, to: 0, value: 1},
    params: [
      {key: 'speed', label: 'spool speed', min: 0, max: 105, step: 1, value: 100, unit: '%'},
      {key: 'playback', label: 'playback (x real time)', min: 0, max: 0.01, step: 0.0002, value: 0.0016},
      {key: 'flow', label: 'flow lines', min: 0, max: 1, step: 1, value: 1},
      {key: 'explode', label: 'exploded view', min: 0, max: 1, step: 0.01, value: 0},
    ],
    update(dt, t, p) {
      st.n = p.speed / 100;
      const w = ((RPM * st.n) / 60) * 2 * Math.PI; // rad/s
      st.th = mod(st.th + w * dt * p.playback, 2 * Math.PI);
      spool.rotation.z = st.th;
      // dashes move at the compressor's axial velocity, scaled like the spool
      st.off -= D.cAx * 1000 * st.n * dt * p.playback;
      for (const l of lines) l.material.dashOffset = st.off;
      lift.set(Math.min(1, p.explode / 0.45));
      slide.set(Math.max(0, (p.explode - 0.35) / 0.65));
      flow.visible = p.flow > 0.5 && p.explode < 0.02;
      // with the section open, the flow lines draw over the blades the way a cutaway illustration shows them
      const over = p.look === 'drawing' && p.section > 0.001;
      for (const l of lines) l.material.depthTest = !over;
    },
    readout() {
      const a = atSpeed(st.n);
      return [
        `N        ${Math.round(a.rpm).toLocaleString('en')} rpm  (${Math.round(st.n * 100)} % of ${Math.round(RPM).toLocaleString('en')})`,
        `air      ${a.mdot.toFixed(2)} kg/s   compressor PR ${a.pr.toFixed(2)}`,
        `design   T2 ${CYCLE.T2.toFixed(0)} K · T3 ${CYCLE.T3} K · T4 ${CYCLE.T4.toFixed(0)} K · jet ${Math.round(CYCLE.V5)} m/s`,
        `thrust   ${(a.thrust / 1000).toFixed(2)} kN static   (fan-law off design, est.)`,
      ];
    },
    /** measured off the built blades: every rotor vertex against the casing wall at its own axial station */
    probe() {
      let min = Infinity;
      let max = -Infinity;
      for (const [r, geo] of rotorRows) {
        const P = geo.attributes.position;
        for (let i = 0; i < P.count; i++) {
          const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
          const gap = casingAt(r.s - z) - Math.hypot(x, y);
          min = Math.min(min, gap);
          if (gap < 3) max = Math.max(max, gap);
        }
      }
      return {minTipClearMm: +min.toFixed(3), tipClearRangeMm: [+min.toFixed(2), +max.toFixed(2)], spoolDeg: +((st.th * 180) / Math.PI).toFixed(1), mdotDesign: +MDOT.toFixed(2)};
    },
  };
}
