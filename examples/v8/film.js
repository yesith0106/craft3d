// The V8's film (?film=1; render with tools/film.mjs): the engine on its stand in a dark room. Fluorescent tubes lie
// on a tiled floor in a rectangle round it, a square of tubes hangs above, and a thin haze with drifting smoke fills
// the room. It opens wide as the tubes strike, cuts through close-ups of the running valvetrain, the front of the
// engine and the pistons behind the x-ray block, then orbits and pulls back as the lights go out.
// The engine runs in slow motion (the model's own `slowmo`), faster in the close-ups, so the shutter blurs what moves.
import * as THREE from 'three';
import {createCine, lerp, smooth, strike} from '../craft/cine.js';

export function setup({stage, model, params}) {
  const cine = createCine({
    stage, model, params,
    clip: {fps: 24, seconds: 10, sub: 32, shutter: 0.5},
    fill: 0.3,
    specMin: 0.4,
    haze: {unit: 0.45, smoke: 0.2, scatter: 0.03}, // metres per haze unit: the room is about a sixth the size of a car showroom
  });
  const [, cy] = cine.centre.toArray();
  cine.dark();
  cine.floor({repeat: 4.8, bump: 0.02}); // 0.6 m x 0.3 m tiles

  // ---- the tubes. Each strikes at its own moment (`on`) and goes out at `off`.
  const level = (seg, t) => strike(t - seg.on) * (1 - smooth(seg.off, seg.off + 0.07, t));
  const Y = 0.03, X = 1.25, Z = 1.6;
  const ring = [];
  for (const sx of [1, -1]) for (const z0 of [-1.3, 0.1]) ring.push({a: [sx * X, Y, z0], b: [sx * X, Y, z0 + 1.2]});
  for (const sz of [1, -1]) ring.push({a: [-0.6, Y, sz * Z], b: [0.6, Y, sz * Z]});
  // switch-on order: round the rectangle from the front
  ring.sort((p, q) => Math.atan2(p.a[0] + p.b[0], p.a[2] + p.b[2]) - Math.atan2(q.a[0] + q.b[0], q.a[2] + q.b[2]));
  ring.forEach((s, i) => Object.assign(s, {on: 0.9 + i * 0.11, off: 9.0 + i * 0.05}));
  // tubes on a floor: many unshadowed points, or the few show as pearls on the tiles beside them
  cine.tubes(ring, {rho: 0.8, lamps: 18, radius: 0.013, level, glow: 0.4});

  const RY = 2.2, S = 0.7;
  const rig = [
    [[-0.6, RY, S], [0.6, RY, S]],
    [[-0.6, RY, -S], [0.6, RY, -S]],
    [[S, RY, -0.6], [S, RY, 0.6]],
    [[-S, RY, -0.6], [-S, RY, 0.6]],
  ].map(([a, b], i) => ({a, b, on: 0.2 + ((i * 3) % 4) * 0.08, off: 9.45 + i * 0.03}));
  // tubes overhead: one shadowed spot, at a new point along them every sub-frame, so they cast a line light's shadows
  cine.tubes(rig, {rho: 2.9, lamps: 1, shadow: {size: 4096}, aim: [0, 0, 0], radius: 0.013, level, glow: 1.7});
  // the frame they hang from, and its cables
  const black = new THREE.MeshStandardMaterial({color: '#050505', roughness: 0.55, metalness: 0.2});
  for (const [w, d, x, z] of [[2 * S + 0.05, 0.05, 0, S], [2 * S + 0.05, 0.05, 0, -S], [0.05, 2 * S, S, 0], [0.05, 2 * S, -S, 0]]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), black);
    beam.position.set(x, RY + 0.045, z);
    cine.room.add(beam);
  }
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 10, 6), black);
    cable.position.set(sx * S, RY + 5.07, sz * S);
    cine.room.add(cable);
  }
  Object.assign(cine.grade, {vignette: 0.25, bloom: {strength: 0.16, radius: 0.3, threshold: 1}});

  // ---- the shots: az from the front of the engine (+Z) toward +X; `set` runs the model's own sliders
  const idle = {rpm: 900, slowmo: 0.05, xray: 0.35}, fast = {rpm: 1500, slowmo: 0.14, xray: 0.9};
  const ap = 0.0035;
  cine.rest = idle;
  cine.shots = [
    // the wide: the room and the engine as the lights strike, a slow drift round and in
    {t0: 0, t1: 3.6, ease: true, cam: (u) => ({tgt: [0, cy - 0.1, 0], az: lerp(46, 30, u), el: lerp(9, 7, u), d: lerp(3.7, 3.2, u), fov: 34, ap, set: idle})},
    // close-ups, cut fast: rockers and springs, the front of the engine, the pistons through the block
    {t0: 3.6, t1: 4.25, cam: (u) => ({tgt: [0.18, cy + 0.12, 0], az: lerp(64, 58, u), el: 32, d: 0.95, fov: 28, roll: 3, ap, ev: 0.5, set: fast})},
    {t0: 4.25, t1: 4.9, cam: (u) => ({tgt: [0, cy - 0.1, 0.3], az: lerp(-14, -8, u), el: 8, d: 1.05, fov: 28, roll: -3, ap, ev: 0.5, set: fast})},
    {t0: 4.9, t1: 5.55, cam: (u) => ({tgt: [0.2, cy - 0.12, 0], az: lerp(96, 90, u), el: 4, d: 1.0, fov: 28, roll: 2, ap, ev: 0.5, set: fast})},
    // the orbit: close round the back, then up and away as the lights go out
    {
      t0: 5.55, t1: 10, ease: true, cam: (u) => {
        const out = smooth(0.4, 1, u); // the pull-back
        return {tgt: [0, cy - 0.1 * out, 0], az: lerp(150, 32, u), el: lerp(10, 8, out), d: lerp(1.9, 3.6, out), fov: lerp(30, 34, out), ap, ev: lerp(0.5, 1, out), set: {rpm: 900, slowmo: lerp(0.14, 0.05, out), xray: lerp(0.9, 0.35, smooth(0, 0.5, u))}};
      },
    },
  ];
  return cine;
}
