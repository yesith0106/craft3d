// Starter model: a hydraulic loader crane on a slewing base, the kind bolted behind a truck cab. It shows the whole
// craft3d pattern in one file: a parameter block in mm, a part tree of pivots, worn materials, a two-link IK that
// puts the hook where the sliders say, two hydraulic cylinders aimed between their anchors every frame, bakeRest
// once at the rest pose, and a probe() that reports the numbers to check.
//
// Replace this file with your model. Keep the contract (see src/main.js).
import * as THREE from 'three';
import {bakeRest, makeWorn} from '../craft/wear.js';
import {kit, rb, chamferBox, cylX, cylY, lathe, box} from '../craft/shapes.js';
import {D2R, makeStruts, twoLinkIK} from '../craft/rig.js';

export const info = {name: 'Loader crane', description: '2-section boom · slewing base · 2 cylinders', stage: 'studio'};

// ---- the parameter block: every dimension in one place, mm
const P = {
  baseR: 420, // slewing ring radius
  postH: 900, // pivot height above the ground
  boom: 1600, // inner boom, pivot to knuckle
  jib: 1400, // outer jib, knuckle to tip
  boomW: 180,
  jibW: 150,
};

export function build() {
  const root = new THREE.Group();
  root.scale.setScalar(0.001); // build in mm, show in metres
  const M = {
    paint: makeWorn({color: '#c79a2c', rough: 0.55, seed: 10}),
    dark: makeWorn({color: '#3a3d41', rough: 0.6, seed: 20}),
    steel: makeWorn({color: '#c6c9cd', painted: false, rough: 0.18, seed: 30, dent: 0.15, bare: '#c6c9cd'}),
    iron: makeWorn({color: '#585c61', painted: false, rough: 0.45, seed: 40, bare: '#6b7076'}),
    rubber: new THREE.MeshStandardMaterial({color: '#1d1e20', roughness: 0.88}),
  };
  const k = kit();

  // ---- part tree: base -> slew (turns about Y) -> boom pivot -> knuckle -> tip
  k.add(root, lathe([[0, 0], [P.baseR + 60, 0], [P.baseR + 60, 90], [P.baseR, 120], [0, 120]]), M.dark);
  const slew = k.group(root, 0, 120, 0);
  k.add(slew, lathe([[0, 0], [P.baseR, 0], [P.baseR - 20, 60], [0, 60]]), M.paint);
  k.add(slew, chamferBox(360, P.postH - 60, 300, 60, 14), M.paint).position.y = P.postH / 2;
  k.bolts(slew, [[-110, 200, 152], [110, 200, 152], [-110, 600, 152], [110, 600, 152]]); // bolts on flat faces only

  const boom = k.group(slew, 0, P.postH, 0); // pitch pivot; the boom hangs along -Y and we pitch it up
  k.add(boom, cylX(90, 420), M.iron);
  k.add(boom, rb(P.boomW, P.boom, P.boomW + 20, 24), M.paint).position.y = -P.boom / 2;
  const knuckle = k.group(boom, 0, -P.boom, 0);
  k.add(knuckle, cylX(75, 360), M.iron);
  k.add(knuckle, rb(P.jibW, P.jib, P.jibW + 10, 20), M.paint).position.y = -P.jib / 2;
  const tip = k.group(knuckle, 0, -P.jib, 0);
  k.add(tip, cylX(50, 220), M.iron);
  const hook = k.group(tip, 0, 0, 0); // stays vertical: counter-rotated each frame
  k.add(hook, cylY(10, 400, 8).translate(0, -200, 0), M.iron, false);
  k.add(hook, new THREE.TorusGeometry(60, 18, 10, 24, Math.PI * 1.5).translate(0, -460, 0), M.steel);

  // ---- hydraulics. Barrel length from the stroke: over the whole working range the pin-to-pin length must stay
  // between body (fully retracted) and 2*body - 60 (rod still 60 mm inside). Lift 749..1258 -> 700; fold 1202..1500 -> 900.
  // lift cylinder (front of the post -> the boom's underside, local -Z), fold cylinder (boom -> horn on the jib)
  const struts = makeStruts({body: M.dark, end: M.iron, rod: M.steel, eye: M.iron, hose: M.rubber});
  struts.add(slew, {obj: slew, off: [0, 260, 220]}, {obj: boom, off: [0, -700, -110]}, {rb: 60, rr: 30, body: 700});
  struts.add(boom, {obj: boom, off: [0, -300, 120]}, {obj: knuckle, off: [0, 160, 110]}, {rb: 48, rr: 24, body: 900});
  // every cylinder end needs metal to pin to: clevis lugs welded on at each anchor (VIEW.check() finds any missing)
  k.add(slew, box(140, 160, 100, 0, 260, 190), M.paint); // on the post's front face
  k.add(boom, box(120, 160, 40, 0, -700, -110), M.paint); // under the boom
  k.add(boom, box(120, 160, 50, 0, -300, 115), M.paint); // on top of the boom
  k.add(knuckle, box(80, 260, 60, 0, 110, 90), M.paint); // the horn the fold cylinder pushes

  // ---- rest pose, then bake the wear's rest space (ONCE, at a pose where nothing overlaps)
  let ik = null;
  const pose = (reach, height, slewDeg) => {
    slew.rotation.y = slewDeg * D2R;
    // the boom's local frame: down -Y, forward +Z. The target is up and ahead of the pivot.
    ik = twoLinkIK(reach, height - P.postH - 120, P.boom, P.jib);
    // our chain hangs down -Y, so "root pitch" from IK (0 = straight down, + = forward) maps to rotation.x = -root
    boom.rotation.x = -ik.root * D2R;
    knuckle.rotation.x = ik.flex * D2R;
    hook.rotation.x = -(boom.rotation.x + knuckle.rotation.x); // the hook hangs plumb
    root.updateMatrixWorld(true);
    struts.pose();
  };
  pose(1800, 1900, 0);
  bakeRest(root);

  return {
    root,
    focus: [0.8, 1.2, 0.6],
    radius: 1.6,
    struts: struts.list,
    params: [
      {key: 'reach', label: 'reach', min: 600, max: 2900, step: 10, value: 1800, unit: 'mm'},
      {key: 'height', label: 'hook height', min: 300, max: 3000, step: 10, value: 1900, unit: 'mm'},
      {key: 'slew', label: 'slew', min: -180, max: 180, step: 1, value: 0, unit: '°'},
      {key: 'auto', label: 'auto cycle', min: 0, max: 1, step: 1, value: 1},
    ],
    update(dt, t, p) {
      let {reach, height, slew: s} = p;
      if (p.auto) {
        reach = 1700 + 900 * Math.sin(t * 0.5);
        height = 1700 + 800 * Math.sin(t * 0.37 + 1);
        s = 50 * Math.sin(t * 0.21);
      }
      pose(reach, height, s);
    },
    // what to check: IK reach, cylinder lengths (rod must stay inside the barrel), hook tip height
    probe() {
      const tipW = tip.localToWorld(new THREE.Vector3());
      return {clamped: ik.clamped, cyl: struts.list.map((s) => Math.round(s.length)), rodInBarrel: struts.list.every((s) => s.length >= s.body && s.length <= 2 * s.body - 60), tip: tipW.toArray().map((v) => +v.toFixed(3))};
    },
  };
}
