// The film of this model: open ?film=1 on the dev server, or render it with the engine's tools/film.mjs.
// This starter works on any model, from its focus and radius: a dark studio with a tiled floor, one big soft box
// overhead as the key, a strip behind for the edges and a dim card for fill. A slow push in, two close-ups cut fast,
// then an orbit that pulls back. Change the set, the lights and the shots to the film you want; the reasoning for
// each choice is in the engine's references/cinematic.md.
import {createCine, lerp, smooth} from '../craft/cine.js';

export function setup({stage, model, params}) {
  const cine = createCine({
    stage, model, params,
    clip: {fps: 24, seconds: 8, sub: 32, shutter: 0.5}, // sub = renders averaged into each frame
    fill: 0.3, // share of the set's bounce light that reaches matte surfaces
    specMin: 0.4, // the widest highlight a sampled lamp may make; sharp reflections come from the capture
  });
  const [x, y, z] = cine.centre.toArray(), R = cine.radius;
  cine.dark();
  cine.floor();
  cine.dome({top: 0.06, mid: 0.025, bot: 0}); // the studio's own dim walls, so glossy parts never mirror pure black

  // Soft boxes: where they hang (metres), their size and their radiance L, which is what polished parts mirror.
  // `light` makes one a lamp too, and scales what it gives matte surfaces (1 = the physical share): raise `light` for
  // a dark matte model, raise L for more shine on metal.
  cine.box({pos: [x - 1.3 * R, y + 3.2 * R, z + 1.7 * R], w: 2.0 * R, h: 1.5 * R, L: 5, feather: 0.4, light: 2.4, shadow: {size: 4096}}); // the key
  cine.box({pos: [x + 2.8 * R, y + 1.4 * R, z - 3.2 * R], w: 0.5 * R, h: 3.2 * R, L: 7, feather: 0.2, light: 0.85}); // a strip behind: bright edges
  cine.box({pos: [x - 3.2 * R, y + 0.3 * R, z + 2.2 * R], w: 2.2 * R, h: 2.2 * R, L: 0.35, feather: 0.8}); // a fill card, in reflections only
  Object.assign(cine.grade, {exposure: 1, vignette: 0.22, grain: 0.012});

  // Shots. az from the model's front (+Z) toward +X, el up, d and tgt in metres, ap = lens radius (depth of field).
  // `set` writes the model's params for that moment of the shot, so the mechanism can act on cue.
  const ap = 0.004 * R;
  cine.shots = [
    {t0: 0, t1: 3.2, ease: true, cam: (u) => ({tgt: [x, y, z], az: lerp(44, 30, u), el: lerp(13, 10, u), d: lerp(4.6, 3.9, u) * R, fov: 30, ap})},
    {t0: 3.2, t1: 3.8, cam: (u) => ({tgt: [x, y + 0.25 * R, z], az: lerp(-18, -12, u), el: 16, d: 1.7 * R, fov: 30, roll: -4, ap, ev: 0.8})},
    {t0: 3.8, t1: 4.4, cam: (u) => ({tgt: [x, y - 0.2 * R, z], az: lerp(78, 70, u), el: 6, d: 1.6 * R, fov: 30, roll: 3, ap, ev: 0.8})},
    {
      t0: 4.4, t1: 8, ease: true, cam: (u) => {
        const out = smooth(0.4, 1, u); // the pull-back
        return {tgt: [x, y, z], az: lerp(150, 34, u), el: lerp(7, 12, out), d: lerp(2.6, 4.6, out) * R, fov: 30, ap, ev: lerp(0.8, 1, out)};
      },
    },
  ];
  return cine;
}
