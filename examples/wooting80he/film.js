// The keyboard's hero still (?film=1): the shaded build floating at an angle on a warm grey paper backdrop, lit as a
// product photograph. One frame, many samples:
//   VITE_LOOK=real node <engine>/tools/film.mjs --project . --out film/hero.png --still 0 --size 1080x1350 --sub 512
// A product this small is lit by soft boxes an arm's length away, so three things differ from a room film:
//   setRadius   reflections are looked up where the reflected ray meets the set, so flat faces show gradients
//   specMin     null: the lamps give diffuse light and shadows only; every highlight is a reflection of a box
//   occlusion   reflections are darkened where a point cannot see its surroundings (between the keys, under the
//               caps), where a reflection capture alone would glow
import {createCine, camFrame, mirrorDir} from '../craft/cine.js';

export function setup({stage, model, params}) {
  Object.assign(params, {finish: 4, rgb: 0.85, feet: 0, travel: 0, typing: 0, explode: 0, dims: 0, cable: 0});
  const SET = 0.9; // metres from the keyboard to the soft boxes
  const cine = createCine({
    stage, model, params,
    clip: {fps: 24, seconds: 1 / 24, sub: 256, shutter: 0},
    subject: {centre: [0, 0.02, 0], radius: 0.2},
    fill: 0.15,
    specMin: null,
    setRadius: SET,
    occlusion: {strength: 0.9, gamma: 1.25, normalBias: 0.0005},
    envSize: 1024,
  });
  cine.dark();

  // The camera first: the set is built round what the lens sees. Looking down on the keys, rolled, the board low in
  // the frame.
  const cam = {tgt: [0, 0.02, 0], az: 24, el: 50, d: 1.72, fov: 18, roll: 32, shift: [0, 0.03], ap: 0.0016, focus: [0, 0.03, 0.02]};
  const {right, up, back} = camFrame(cam);
  const C = cine.centre;
  // a place on the set: a direction from the keyboard, then moved in the picture's frame (x to the right, y up)
  const at = (dir, [ox, oy] = [0, 0]) => dir.clone().normalize().multiplyScalar(SET).addScaledVector(right, ox).addScaledVector(up, oy).normalize().multiplyScalar(SET).add(C).toArray();
  const inFrame = (x, y, z) => right.clone().multiplyScalar(x).addScaledVector(up, y).addScaledVector(back, z);

  cine.dome({top: 0.38, mid: 0.2, bot: 0.07, up: up.toArray()}); // the tent: never pure black in a reflection
  // The key hangs where the tops of the keycaps mirror the lens, pushed up and left so its soft edge crosses them.
  // Its radiance is low, because the flat zinc case mirrors it whole; `light` far above 1 gives the matte black caps
  // (which take almost nothing from a reflection) the light they need without burning the metal out.
  cine.box({pos: at(mirrorDir([0, 1, 0], back), [-0.5, 0.55]), w: 1.3, h: 1.0, L: 1.3, feather: 0.45, light: 14, shadow: {size: 4096, bias: -0.0008, normalBias: 0.0004}});
  // A card for the front face of the case and the fronts of the caps, and one for the right-hand end.
  cine.box({pos: at(mirrorDir([0, 0, 1], back), [0, 0.3]), w: 1.5, h: 1.0, L: 1.1, feather: 0.3});
  cine.box({pos: at(mirrorDir([1, 0, 0], back), [0.2, 0.3]), w: 1.2, h: 1.0, L: 0.9, feather: 0.3, light: 1, shadow: false});
  // Two narrow strips behind draw the bright lines along the case's edges; a dim card fills from the front.
  cine.box({pos: at(inFrame(0.8, 0.3, -0.5)), w: 0.12, h: 1.2, L: 2.5, feather: 0.25});
  cine.box({pos: at(inFrame(-0.75, 0.35, -0.55)), w: 0.12, h: 1.2, L: 2.2, feather: 0.25});
  cine.box({pos: at(inFrame(-0.6, -0.2, 0.75)), w: 1.5, h: 1.5, L: 0.5, feather: 0.8, light: 0.3, shadow: false});

  Object.assign(cine.grade, {
    exposure: 1,
    bloom: {strength: 0.05, radius: 0.3, threshold: 1},
    sharp: 0.4,
    warm: [1, 0.985, 0.955],
    curve: 0.2,
    vignette: 0.18,
    lift: 0,
    // the paper, in display levels: top left, top right, bottom left, bottom right; and the glow of a lamp behind
    backdrop: {corners: [76, 150, 15, 27], tint: [1, 0.975, 0.92], glow: {at: [0.62, 0.7], r: 0.16, k: 0.7}},
  });
  cine.shots = [{t0: 0, t1: 1, cam: () => cam}];
  return cine;
}
