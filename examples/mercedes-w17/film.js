// The car's film (?film=1; render with tools/film.mjs): a dark showroom. Fluorescent tubes lie on a tiled concrete
// floor in a rectangle round the car, a square frame of tubes hangs above it, and a thin haze with drifting smoke
// fills the room. It opens on the wide shot as the tubes strike, cuts through six close-ups (nose, front wing
// endplate, a front wheel as it steers, the halo, the sidepod, the rear with the wing opening and the rain light
// flashing), then orbits the car and pulls back as the lights go out.
//   node <engine>/tools/film.mjs --project . --out film/showroom.mp4                       16:9, 14 s
//   node <engine>/tools/film.mjs --project . --out film/showroom-9x16.mp4 --size 1080x1920  the upright cut
import * as THREE from 'three';
import {createCine, lerp, smooth, strike} from '../craft/cine.js';

export function setup({stage, model, params}) {
  const TALL = innerHeight > innerWidth; // a 9:16 frame: the rig hangs higher and the shots are framed upright
  const CAR = [0, 0.4, 0.2]; // what the room is built round
  Object.assign(params, {speed: 0, steer: 0, aero: 0, ride: 0, auto: 0});
  const cine = createCine({
    stage, model, params,
    clip: {fps: 24, seconds: 14, sub: 32, shutter: 0.5},
    subject: {centre: CAR, radius: 2.8},
    fill: 0.3, // how much of the room's bounce light reaches matte surfaces
    specMin: 0.4, // the widest highlight a sampled lamp may make: keeps the samples from showing as dots
    haze: {unit: 1, even: 0.008, smoke: 0.22, scatter: 0.045, box: [[-9, 0, -9], [9, 6.5, 9.4]]},
  });
  cine.dark();
  cine.captured.from.set(CAR[0], 0.55, CAR[2]); // the reflections are captured from the car's middle
  // the model's own studio floor and painted contact shadow belong to the viewer, not to this room
  model.root.traverse((o) => {
    if (o.name === 'studio floor') o.visible = false;
    if (o.name === 'contact shadow') o.material.opacity = 0.8;
  });
  cine.floor({y: -0.0015, size: 120, repeat: 9.6, bump: 0.04}); // 1.2 m x 0.6 m tiles

  // ---- the tubes: each strikes at `on` and goes out at `off`
  const level = (seg, t) => strike(t - seg.on) * (1 - smooth(seg.off, seg.off + 0.07, t));
  const X = 1.95, Z0 = CAR[2] - 3.8, Z1 = CAR[2] + 3.8, Y = 0.036;
  // floor rectangle: three tubes down each long side, two across each end, gaps at the joints and corners
  const ring = [];
  for (const sx of [1, -1]) for (let i = 0; i < 3; i++) ring.push({a: [sx * X, Y, CAR[2] - 3.6 + i * 2.45], b: [sx * X, Y, CAR[2] - 3.6 + i * 2.45 + 2.3]});
  for (const z of [Z1, Z0]) for (let i = 0; i < 2; i++) ring.push({a: [-1.7 + i * 1.8, Y, z], b: [-1.7 + i * 1.8 + 1.6, Y, z]});
  // switch-on order: round the rectangle from the front
  const ang = (s) => Math.atan2((s.a[0] + s.b[0]) / 2, (s.a[2] + s.b[2]) / 2 - CAR[2]);
  ring.sort((p, q) => ang(p) - ang(q));
  ring.forEach((s, i) => Object.assign(s, {on: 1.0 + i * 0.085, off: 12.75 + i * 0.05}));
  // they lie on the floor, a hand's width from the tiles: 24 unshadowed lamps, or the few show as pearls
  cine.tubes(ring, {rho: 0.5, lamps: 24, level, glow: 0.8});

  // the overhead rig: a tube along each edge of the frame and two staggered across the middle
  const RY = TALL ? 3.7 : 3.1, S = 1.5;
  const rig = [
    [[-1.2, RY, CAR[2] + S], [1.2, RY, CAR[2] + S]],
    [[-1.2, RY, CAR[2] - S], [1.2, RY, CAR[2] - S]],
    [[S, RY, CAR[2] - 1.2], [S, RY, CAR[2] + 1.2]],
    [[-S, RY, CAR[2] - 1.2], [-S, RY, CAR[2] + 1.2]],
    [[-1.25, RY, CAR[2] + 0.5], [0.35, RY, CAR[2] + 0.5]],
    [[-0.35, RY, CAR[2] - 0.5], [1.25, RY, CAR[2] - 0.5]],
  ].map(([a, b], i) => ({a, b, on: 0.25 + ((i * 5) % 6) * 0.07, off: 13.45 + i * 0.03}));
  // one shadowed spot, at a new point along the tubes every sub-frame: a line light's soft shadows under the car
  cine.tubes(rig, {rho: TALL ? 6.5 : 4.6, lamps: 1, shadow: {size: 4096, near: 0.6, far: 14, bias: -0.0002, normalBias: 0.004}, aim: [CAR[0], 0, CAR[2]], cone: 64, level, glow: 1.7});
  // the hanging frame the overhead tubes are fixed under, and its cables
  const black = new THREE.MeshStandardMaterial({color: '#050505', roughness: 0.55, metalness: 0.2});
  {
    const y = RY + 0.056, F = 1.62;
    for (const [w, d, x, z] of [[2 * F + 0.07, 0.07, 0, F], [2 * F + 0.07, 0.07, 0, -F], [0.07, 2 * F, F, 0], [0.07, 2 * F, -F, 0], [2 * F, 0.05, 0, 0.5], [2 * F, 0.05, 0, -0.5]]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), black);
      beam.position.set(x, y, CAR[2] + z);
      cine.room.add(beam);
    }
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 14, 6), black);
      cable.position.set(sx * F, y + 7, CAR[2] + sz * F);
      cine.room.add(cable);
    }
  }
  Object.assign(cine.grade, {bloom: {strength: 0.16, radius: 0.3, threshold: 1}, vignette: 0.25, lift: 0.01, grain: 0.012});

  // ---- the shots. az is measured from the car's nose toward its left side; lengths in metres.
  // Close-ups run at ev 0.6: the light that suits the wide is too much at 2 m. `set` works the car's own sliders.
  const SHOTS_TALL = [
    // the wide: the room and the car as the lights strike, a slow drift round and in
    {t0: 0, t1: 5, ease: true, cam: (u) => ({tgt: [0, 1.4, 0.2], az: lerp(43, 27, u), el: lerp(10, 8.5, u), d: lerp(12.0, 10.4, u), fov: 50, focus: [0, 0.5, 0.2], ap: 0.006})},
    // close-ups, cut fast
    {t0: 5, t1: 5.54, cam: (u) => ({tgt: [0, 0.5, 2.25], az: lerp(-11, -6, u), el: 16, d: 2.1, fov: 30, roll: -5, ap: 0.006, ev: 0.6})},
    {t0: 5.54, t1: 6.08, cam: (u) => ({tgt: [0.72, 0.3, 2.3], az: lerp(70, 64, u), el: 7, d: 2.2, fov: 30, roll: 4, ap: 0.006, ev: 0.6})},
    {t0: 6.08, t1: 6.62, cam: (u) => ({tgt: [0.8, 0.36, 1.72], az: lerp(94, 90, u), el: 5, d: 2.0, fov: 30, focus: [0.95, 0.36, 1.72], ap: 0.006, ev: 0.6, set: {steer: lerp(0, 150, smooth(0.05, 0.9, u))}})},
    {t0: 6.62, t1: 7.16, cam: (u) => ({tgt: [0, 0.86, 0.45], az: lerp(30, 36, u), el: 20, d: 2.3, fov: 30, roll: -4, ap: 0.006, ev: 0.6})},
    {t0: 7.16, t1: 7.7, cam: (u) => ({tgt: [0.55, 0.5, -0.9], az: lerp(115, 109, u), el: 26, d: 2.3, fov: 30, roll: 5, ap: 0.006, ev: 0.6})},
    {t0: 7.7, t1: 8.3, cam: (u) => ({tgt: [0, 0.55, -2.3], az: lerp(170, 178, u), el: 6, d: 3.0, fov: 30, roll: -3, ap: 0.006, ev: 0.6, rain: 1, set: {aero: smooth(0.1, 0.75, u)}})},
    // the orbit: close and low round the rear and along the flank, then up and away to the wide
    {
      t0: 8.3, t1: 14, ease: true, cam: (u) => {
        const out = smooth(0.42, 1, u); // the pull-back
        return {tgt: [0, lerp(0.5, 1.4, out), lerp(-0.6, 0.2, smooth(0, 0.6, u))], az: lerp(152, 30, u), el: lerp(7, 9, out), d: lerp(5.2, 10.8, out), fov: lerp(34, 50, out), focus: [0, 0.5, 0.2], ap: lerp(0.009, 0.006, out), ev: lerp(0.6, 1, out), set: {aero: 1 - smooth(0.02, 0.2, u)}};
      },
    },
  ];
  // the same film framed 16:9: the wide sits lower and further round, the close-ups use the width of the frame
  const SHOTS_WIDE = [
    {t0: 0, t1: 5, ease: true, cam: (u) => ({tgt: [0, 1.2, 0.2], az: lerp(44, 27, u), el: lerp(7.5, 6.5, u), d: lerp(11.4, 10.0, u), fov: 34, focus: [0, 0.5, 0.2], ap: 0.006})},
    {t0: 5, t1: 5.54, cam: (u) => ({tgt: [0, 0.42, 2.2], az: lerp(-17, -11, u), el: 12, d: 2.3, fov: 28, roll: -3, ap: 0.006, ev: 0.6})},
    {t0: 5.54, t1: 6.08, cam: (u) => ({tgt: [0.75, 0.3, 2.1], az: lerp(68, 62, u), el: 6, d: 2.1, fov: 28, roll: 2, ap: 0.006, ev: 0.6})},
    {t0: 6.08, t1: 6.62, cam: (u) => ({tgt: [0.8, 0.34, 1.76], az: lerp(50, 44, u), el: 9, d: 1.55, fov: 28, roll: 2, focus: [0.9, 0.4, 1.95], ap: 0.005, ev: 1.0, set: {steer: lerp(10, 150, smooth(0.0, 0.9, u))}})},
    {t0: 6.62, t1: 7.16, cam: (u) => ({tgt: [0, 0.82, 0.4], az: lerp(32, 38, u), el: 18, d: 2.2, fov: 28, roll: -3, ap: 0.006, ev: 0.6})},
    {t0: 7.16, t1: 7.7, cam: (u) => ({tgt: [0.5, 0.5, -0.9], az: lerp(112, 106, u), el: 24, d: 2.2, fov: 28, roll: 3, ap: 0.006, ev: 0.6})},
    {t0: 7.7, t1: 8.3, cam: (u) => ({tgt: [0, 0.55, -2.3], az: lerp(170, 178, u), el: 6, d: 3.2, fov: 28, roll: -2, ap: 0.006, ev: 0.6, rain: 1, set: {aero: smooth(0.1, 0.75, u)}})},
    {
      t0: 8.3, t1: 14, ease: true, cam: (u) => {
        const out = smooth(0.45, 1, u);
        return {tgt: [0, lerp(0.5, 1.2, out), lerp(-0.6, 0.2, smooth(0, 0.6, u))], az: lerp(152, 30, u), el: lerp(6, 6.5, out), d: lerp(4.6, 10.4, out), fov: lerp(32, 34, out), focus: [0, 0.5, 0.2], ap: lerp(0.009, 0.006, out), ev: lerp(0.6, 1, out), set: {aero: 1 - smooth(0.02, 0.2, u)}};
      },
    },
  ];
  cine.shots = TALL ? SHOTS_TALL : SHOTS_WIDE;

  cine.rest = {steer: 0, aero: 0}; // wheels straight and the wing shut, unless a shot says otherwise
  // what the sliders do not cover: the rain light, which flashes in the rear shot
  const rainLights = new Set();
  model.root.traverse((o) => o.isMesh && o.material.emissive?.r > 0.9 && o.material.emissive.g < 0.3 && rainLights.add(o.material));
  cine.pose = (t, c) => {
    for (const m of rainLights) m.emissiveIntensity = c.rain ? (Math.floor(t * 8) % 2 ? 0.15 : 9) : 0.85;
  };
  return cine;
}
