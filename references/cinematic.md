# Cinematic: films and hero stills

A finished model can be filmed. `lib/cine.js` renders it offline on the GPU, `src/model/film.js` is the film (set, lights, shots), and `tools/film.mjs` steps it frame by frame and encodes it. The same rig makes a single hero still. Everything here was learnt on three jobs: a graphics card under one travelling soft box, a Formula 1 car in a dark showroom of fluorescent tubes, and a steel watch shot as a product photograph against a reference.

## Start

```
node "$ENGINE/tools/film.mjs" --project . --out film --still 0,48,96 --sub 8      # framing: a sheet of stills in seconds
node "$ENGINE/tools/film.mjs" --project . --out film --still 48                    # one frame at full quality
node "$ENGINE/tools/film.mjs" --project . --out film/clip.mp4                      # the film (cd "$ENGINE" && npm run setup:film once, for ffmpeg)
node "$ENGINE/tools/film.mjs" --project . --out film/hero.png --still 0 --size 1080x1350 --sub 512     # a hero still
```

Every scaffold has a starter `src/model/film.js` that works on any model (a dark studio, three soft boxes, a push in, two close-ups, an orbit). Three worked examples; copy the closest:

| Example | What it is |
|---|---|
| `examples/mercedes-w17/film.js` | A room film: a car in a dark showroom, tubes on the floor and overhead that strike and go out, haze, a wide, six fast close-ups with the car acting on cue, an orbit. 16:9 and 9:16 from one file. `demos/mercedes-w17-film.mp4` is its render |
| `examples/v8/film.js` | The same grammar in a small room, on a running mechanism: close-ups where the shutter blurs what moves |
| `examples/wooting80he/film.js` | A product still: a floating keyboard on a paper backdrop, soft boxes placed by reflection, occlusion layers |

## Plan before any code

"Cinematic" is not "dark with a spotlight". It is the grammar of the user's reference, so get one (ask, or pull frames from the film they name) and write five lines before touching the rig:

- **Staging.** Does the subject stand on a floor, hang in the air, sit on a set? What else is in the room?
- **Camera.** Lens (long and flat, or wide and close), height, roll, how it moves, how fast it cuts.
- **Background.** Black room, paper gradient, blurred environment. Measure it: read the reference's corner and centre levels in sRGB and match those numbers.
- **Light.** How many sources, how big, how close, where their reflections land on the subject. Which surfaces go to black.
- **Grade.** Contrast, lifted blacks, bloom, grain, tint.

Then a shot list with times. Show the user the plan and one still before rendering a film. Compare every still with the reference side by side and score it honestly; a self-score that the user rejects ("the metal feels matte, not chrome") means the comparison was not made at the level they look at it. Name what differs, one item at a time, and fix the largest.

## How a frame is made

Each output frame is the average of `sub` renders in linear HDR. Sub-frame *s* moves four things at once:

| Varies | Gives |
|---|---|
| Each lamp to a new point of its soft box or tube | Area lights: true penumbras, long highlights from line lights |
| The camera across the lens aperture, pivoting on the focus point | Depth of field |
| Time across the open shutter (`shutter` × the frame) | Motion blur of everything that moves, camera included |
| The pixel grid by a sub-pixel offset | Anti-aliasing |

Then, once per frame: haze (optional), bloom, tone mapping (Neutral), and the grade. 8 samples are enough to judge framing, 32 finish a film frame, 256 to 1024 finish a still. A 1080p frame at 32 samples takes from 0.2 s (the V8 example, on a desktop GPU) to a few seconds for a heavy model with haze and many lamps.

## The rig (`lib/cine.js`)

| Call | Does |
|---|---|
| `createCine({stage, model, params, clip, fill, specMin, setRadius, occlusion, haze, subject})` | The rig. `clip = {fps, seconds, sub, shutter}` |
| `cine.dark()` | Strips the viewer's stage: after it, only the film's lights light the scene |
| `cine.box({pos, at, w, h, L, feather, light, shadow, level, move, seen})` | A soft box. Always in reflections; `light` makes it a sampled lamp too |
| `cine.tubes(segs, {rho, lamps, shadow, aim, level, seen, env, glow})` | Fluorescent tubes: visible, reflected, sampled as line lights |
| `cine.dome({top, mid, bot, up})` | The tent round the set: what glossy parts mirror where no box is |
| `cine.floor({repeat, tone})` | Large concrete tiles (`slabTextures`), running out into the dark |
| `cine.room`, `cine.set` | Groups for your own set pieces: seen by the camera and reflected, or reflected only |
| `cine.shots = [{t0, t1, ease, cam: (u) => ({tgt, az, el, d, fov, roll, shift, focus, ap, ev, set})}]` | The edit. `set` writes the model's params |
| `cine.rest = {steer: 0}` | The params' values wherever a shot's `set` does not move them |
| `cine.pose = (t, cam, shot) => {}` | Anything the params do not cover, on every sub-frame |
| `cine.grade` | `exposure, bloom, sharp, warm, curve, vignette, lift, grain, backdrop` |
| `mirrorDir(normal, toCamera)`, `camFrame(cam)`, `strike(x)`, `additiveGlass(mesh)` | Helpers, below |

## Light: lamps and the capture

A light does two jobs and the rig splits them.

- **The capture** is the set photographed from the subject's place (the model hidden) and used as the reflection environment. In it a soft box is one continuous shape, so it is where every sharp reflection comes from.
- **The lamps** are spot or point lights, one per box or a few per run of tubes, moved over the light's face each sub-frame. They give diffuse light and shadows.

What follows from that:

- **A lamp's sample points show as dots in anything glossy.** So lamps may only make a broad highlight (`specMin: 0.4`, raise it per material with `userData.cineSpec`) or none at all (`specMin: null`, for product stills where every highlight should be a clean reflection of a box).
- **The capture's diffuse light is only bounce.** `fill` (0.15 to 0.3) scales it; the lights' own diffuse comes from the lamps. Without this everything is lit twice and goes flat.
- **The capture is taken at one point.** It is right for the subject and wrong for a floor far wider than the subject, which then glows grey to the horizon. `cine.floor()` opts out (`userData.cineNoEnv`).
- **`scene.environment` ignores a material's `envMapIntensity`**; do not try to dim one surface's reflections with it.
- **A visible light needs two brightnesses.** What reflections need (a tube at radiance 30+) blows a hole in the picture once bloom spreads it. `tubes({seen: 3, env: 34})`.
- **Lights lying next to a surface need many lamps.** Tubes on a floor are a hand's width from the tiles: with a few sample points they show as a row of pearls. Give floor runs 18 to 24 unshadowed lamps and the floor a wide `cineSpec` (0.72). A rig overhead needs one shadowed lamp.
- **Units.** `L` is radiance, the number a reflection shows. A box's physical lamp power is `L × w × h` candela (`light: 1`); a point `d` metres away receives `L·w·h / d²`. A matte surface of albedo `a` then shows about `a × that / π`: work it out before guessing, and remember sRGB #1a1a1a is an albedo of 0.01. `rho` is candela per metre of tube.
- **`light` is a free dial, and that is its use.** Metal's brightness is what it reflects (`L`); matte paint's is what the lamp gives. A black matte part next to polished metal needs `L` low and `light` well above 1 (the keyboard example uses 14); a chrome subject wants `light` under 1.
- **Never pure black around a glossy subject** unless that is the look: add `cine.dome()` at a few percent so edges turned away from every box still read.
- **Move the light.** A box with `move(t)` that travels from raking across the subject, round its shoulder to the front makes surfaces brighten, roll off and fall into shadow. That is what makes them read as material; under a fixed light a slow camera move can look like a pan over a print.
- **Lights that act.** `level(t)` on a box, `level(seg, t)` on tubes. `strike(t - on)` is a fluorescent tube catching (two false starts, then warm-up); stagger `on` round the room and `off` at the end and the film has an opening and a close for free.

## Materials under film light

- **Chrome needs something to reflect.** A polished surface in an evenly lit tent is an even grey: it reads as matte however low its roughness. For chrome, darken the tent (dome 0.07 to 0.4), keep boxes hard-edged (`feather` 0.15 to 0.3) and add narrow strips, so each face shows a bright band or a dark one. For satin, the opposite: big boxes with wide feather, so faces show gradients.
- **Place boxes by reflection, not by habit.** `mirrorDir(faceNormal, toCamera)` is where a flat face mirrors the lens. Put a box there and the face fills with light; offset it in the picture's frame (`camFrame(cam)` gives right and up) and the box's soft edge slides across the face, which is what a product photograph shows. One card per face family: dial, flank, bracelet links.
- **A close set needs `setRadius`.** With soft boxes an arm's length from a small product, an environment lookup by direction alone gives every flat face one even tone. `setRadius` (the distance to the boxes) looks the reflection up where the reflected ray meets the set, and flat faces get gradients.
- **Anisotropic materials reflect by grain, not by facing.** The engine's brushed-metal reflection bends the normal along the grain, so every link of a bracelet shows the same tone. Drop `anisotropy` to about 0.1 for the shot and leave the grain to the surface relief.
- **Rubber and plastic need relief, not just roughness.** A tyre that is a smooth dark solid reads as clay under a tube light. Give it what the real one has, in the shader, in millimetres: tread grain, mould ribs, sidewall lettering and ribs, with relief faded by `fwidth` where it would alias. Then roughness 0.6 looks like rubber.
- **Clear glass shows no reflection.** three.js scales a transparent surface's reflection by its opacity. `additiveGlass(mesh)` draws the reflection alone, added over what is behind (a watch crystal, a lens, a visor).
- **Finishes for the shot are fair game** (a satin retail part made matte so one soft light falls across it), but say so in the report: it is a styled finish, not the factory one.
- **Text must read.** A shot that sees printed or moulded lettering from behind or upside down looks like a mistake. Re-stage the shot or blank the print for it.

## Occlusion (product stills, floating subjects)

A reflection capture knows nothing about the model itself, so gaps glow: between bracelet links, under a bezel, between keys. `occlusion: true` renders three layers per sample and combines them as `D + E × ao`:

- **D** the lamps: diffuse light with shadows
- **E** the capture: reflections and bounce
- **AO** a shadowed light from a new direction over the whole sphere each sample, on a white model: how much of its surroundings each point can see

It costs three renders a sample, and it needs many samples (256 or more; fewer shows facets of hard shadow). `--view 1|2|3` writes one layer for debugging. Nothing may glow in both D and E: the rig switches emissive off for E and blacks out unlit materials, so glowing parts need no care.

`grade.backdrop = {corners: [tl, tr, bl, br], tint, glow: {at, r, k}}` lays a paper gradient and a lamp's glow behind the subject, in display values measured off the reference. It is composited after tone mapping, so the numbers you measured are the numbers you get.

## Haze

`haze: true` (or `{even, smoke, scatter, unit, box}`) adds a raymarched pass: an even haze, smoke that hangs low and drifts, lit by the film's lights as line lights in closed form. Give tubes a `glow` weight (a rig overhead about 1.7, floor tubes 0.4 to 0.8) and boxes one if they should show a beam. `unit` is metres per haze unit and sets the size of the smoke's banks and of the lit volume; it defaults to the subject's radius / 2.8 (a car comes out near 1), and the V8's small room uses 0.45. Keep it thin. Haze is for depth and for light you can see; if the subject greys out, halve `scatter`.

## Camera and shots

- **`cam(u)` returns a pose** for `u` from 0 to 1 across the shot: `az` from the model's front toward +X, `el`, `d` and `tgt` in metres, `fov`, `roll` (positive leans the top of the picture left), `shift` (the target off centre, in frames), `focus` (the point held sharp), `ap` (lens radius in metres; 0.002 to 0.004 × the subject's radius for a gentle falloff, more for macro).
- **A structure that works:** a wide that opens the room (4 to 5 s, a slow drift round and in), four to six close-ups cut fast (0.5 to 0.65 s each, each a small move of a few degrees, alternating roll of 2° to 5°), then an orbit that starts close and pulls back to the wide, and the lights go out.
- **A cut is clean** because the shot is chosen once per frame, at the frame's start. `ease: true` softens the ends of long moves; do not ease the fast cuts.
- **Close-ups overexpose.** The light that suits the wide is too much at 2 m. Give each shot its own `ev` (0.5 to 0.7 in close) instead of touching the lights.
- **The mechanism acts on cue** through `set` (steer the wheels in the wheel shot, open a wing in the rear shot, raise the engine speed for the valvetrain) or `cine.pose` for what has no slider (a rain light flashing).
- **Each frame shape is its own film.** 16:9 and 9:16 need separate shot lists (the wide sits lower and further round in 16:9; upright close-ups frame differently), and often a different rig height. Branch on `innerHeight > innerWidth`.

## Motion

- The model is posed on every sub-frame by `model.update(dt, t, params)`, so whatever moves is blurred by the shutter (`shutter: 0.5` is the film look, 0.3 is crisper).
- Pose from `t` where you can (`angle = f(t)`): then any frame can be rendered alone. A model that integrates (`angle += speed × dt`) still blurs correctly, but a still of frame 120 on its own shows a different phase than the film will. For a speed that changes, tabulate its integral once.
- Spinning parts strobe. Pick the speed for the look: about 1.25 blade pitches a frame with a short shutter reads as blades creeping forward; whole multiples of a pitch freeze.

## Review loop

1. Stills at 8 samples of every shot's start, middle and end (`--still`, or `--every 12`). Read the sheet for framing, cut order, text, anything cut by the frame edge.
2. Full-sample stills of one frame per shot. Read each at native size: a scaled-down view invents stripes and hides noise. Look for blown highlights, lamp dots in gloss, pearls on the floor, banding in the dark, crawling shadow edges.
3. Fix with a number, re-render the stills. Only then the film.
4. Read the encoded film's frames too (the tool leaves them in `frames/`), and say what you checked: stills, not the moving picture.

## Delivery

- Master: 1920×1080 (or 1080×1920), 24 fps, H.264 at CRF 15. The tool converts the PNGs' full-range RGB properly and tags the file bt709; without both, players show it washed out or crushed.
- Web: re-encode the frames at CRF 20 to 23 with `-preset veryslow -tune grain` and `+faststart`, no audio track, and a poster frame (WebP) from a strong moment. A 14 s film lands near 6 MB at 1080p.
- A still: PNG at twice the display size; 2160×2700 for a 4:5 post.

## Traps

| Symptom | Cause and fix |
|---|---|
| A pass reads black where a render target should be | `ShaderPass` clones its uniforms and drops render-target textures. Assign `pass.uniforms.x.value` after constructing it |
| The first run times out or reloads | Vite rebuilds its dependency cache when a new import appears and reloads the page; `film.mjs` waits through it. Run again if it still fails |
| "cine: shader text not found" | The rig edits three.js's lighting shaders by exact text; a three.js upgrade changed it. Fix the strings in `lib/cine.js`, do not delete the check |
| A cloned material shows every lamp as a dot | A clone drops `onBeforeCompile`. Clear its `userData` so the rig patches it again (`additiveGlass` does) |
| Shadows missing or acne on a small product | Bias scales with the scene. Pass `shadow: {bias, normalBias, near, far}` on the box; a watch wants about −0.0008 / 0.0002 |
| Far floor glows grey | It is reflecting the capture. `userData.cineNoEnv = true` |
| Fat halos round tubes | Bloom on HDR tube radiance: lower `seen`, not `env`; and lower their `glow` in the haze |
| Everything is flat and bright | `fill` too high, or the viewer's own lights are still on: call `cine.dark()` first |
| The single-file build grew | `film.js` must only be loaded behind `import.meta.env.DEV` (the template does), or the rig is bundled into `dist/model.html` |
