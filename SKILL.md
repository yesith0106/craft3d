---
name: craft3d
description: Build accurate, realistic 3D models and working mechanisms in three.js entirely from code — engines, gearboxes, landing gear, linkages, machines, vehicles, mechs, robots, weapons, tools, industrial props and environments — at real dimensions, with every moving part driven by real kinematics (IK, slider-cranks, gear trains, linkages, cams), clean or worn and damaged materials made in shaders (no textures), and a headless check loop that measures the model and photographs it before calling it done. Exports a single offline HTML file. Use when someone wants a 3D object, scene or simulation that looks and moves like the real thing: "realistic", "accurate", "to scale", "procedural", "working", "functional simulation", "hard-surface", "battle-damaged", a model for a game or website, or a three.js asset built from a reference image, a spec or an idea.
---

# craft3d

Models that look right because they are right: every part sized from evidence, hung on a pivot where the real joint is, moved by the same equations the real mechanism obeys, then measured. Looking real follows from that.

`SKILL_DIR` is the folder holding this file.

## Start

```
cd "$SKILL_DIR" && npm run setup                          # once: playwright + chromium for the check tool
node "$SKILL_DIR/tools/new.mjs" ./my-model                 # viewer + library + starter (a hydraulic loader crane)
node "$SKILL_DIR/tools/new.mjs" ./my-engine --example v8   # or start from the closest example
cd my-model && npm run dev                                 # open the printed URL
npm run html                                               # -> dist/model.html, one offline file, opens from disk
```

The project is plain Vite + three.js. `src/model/` is the model; `src/craft/` is the library, copied in so the project stands alone. Drop both into any three.js app (a game, a site) unchanged.

## Examples: copy the closest one

Each is also built as one offline file in `$SKILL_DIR/demos/` (`crane.html`, `mechanisms.html`, `v8-engine.html`). Open one to show the user what the skill produces. After changing an example, rebuild its demo with `npm run html` in a scaffold of it and copy `dist/model.html` over.

| Example | What it is | Worth stealing |
|---|---|---|
| `crane` (default) | Truck-mounted loader crane: slewing base, 2-section boom, 2 hydraulic cylinders, a hook that hangs plumb | The whole pattern in 120 lines: parameter block, part tree, `twoLinkIK`, `makeStruts`, clevis lugs, `probe()` |
| `mechanisms` | One crank drives a gear train (m5, 20:32:20), a slider-crank in a glass cylinder, a rack and pinion, and a Jansen leg | `gear()` + `meshAngle()`, `rack()` phased to its pinion, `sliderCrank()`, the `circles()` linkage solver, `instancedLinks()`, probes that check each invariant |
| `v8` | A running Chevrolet 350 small-block from its published dimensions: cross-plane crank, 8 pistons and rods, timing chain, cam, 16 lobes, lifters, pushrods, 1.5:1 rockers, valves and springs, distributor, spark, gas pressure, torque and power | A pure `kin.js` with a `selfTest()`, firing order derived from geometry, a cam phased from the valve events, a moving chain on its tangent path, x-ray casings, `readout()`, timing and clearance checks |

## Two ways in

- **Recreate something real:** a photo, a drawing, a product, a named machine. The evidence is the authority; measure it. Read `references/recreate.md`.
- **Create from an idea:** "a salvage mech for a scrapyard". Write a five-line brief (job, size, power, world, look), borrow proportions from real machines that do the same job, and block it out before adding detail. Read `references/from-idea.md`.

Both follow the same method and pass the same proof.

## The method

1. **Evidence before geometry.** Photos from several sides, drawings, a spec sheet, a manual. A user's image is the authority on shape and proportion; with only an idea, the evidence is the brief plus the real machines you borrow from. Write down what is known and what must be estimated before any geometry.
2. **Real numbers, one source.** One parameter block in mm at the top: the envelope first, then every part, each number with its origin (spec, standard, measured off a reference, derived). Every pose, readout and label reads from the same functions, so nothing on screen can disagree with the motion. **Check one number by hand**, for example: 32 teeth × 4 mm module = 128 mm pitch diameter, and half its circumference is a 201 mm rack stroke for 180°. Or: 8 × bore area × stroke = 349.8 cubic inches. See `references/accuracy.md`.
3. **The part tree is the joint tree.** Every moving part hangs from a `Group` on its real axis; geometry is offset from that pivot. Build in mm under one group scaled 0.001, so the scene is in metres. Mirror a side with `scale.x = -1` on its frame rather than rebuilding it.
4. **One input drives everything.** Pose from a crank angle, a stroke, a speed, a reach. Nothing is keyframed. Derived quantities come from the equations: IK for reach, `circles()` for linkages, `sliderCrank` for pistons, `meshAngle` for gears, `strideFor` for ground contact. Anything integrated over time (a walker's body travel) is tabulated once with `tabulate()`. Put the math in a module with no three.js in it and give it a `selfTest()` you can run in node.
5. **Build it the way it would be made.** Cut and folded plate uses `slab`/`chamferBox`/`profile`, castings use `rb`, turned parts use `lathe`/`cyl*`, structure uses `ibeam`, gears use `gear(z, module)`, springs use `spring`, bent bar uses `sweep`. Bevel everything. Every actuator end gets a lug or clevis. Fasteners and seams go on flat faces only. See `references/modeling.md`.
6. **Materials are measurements too.** `materials.js` for new and showroom (clearcoat paint, polished metals, glass), `wear.js` for anything used (chips, rust, grime, soot, dents). Paint is dielectric and bare metal is metal. See `references/materials.md`.
7. **The part doing the work must be visible.** If the action is inside (pistons, valves, a gearbox), use glass liners or an x-ray slider on the casings (see the `v8` example), and frame a close-up on it. One shot inside teaches more than ten orbits.
8. **Prove it, then look at it.** Numbers first (`VIEW.check()`, the model's `probe()`, the kinematics `selfTest()`), then pictures (views, close-ups, filmstrips). Stop only when both pass. See "Review" below.

## Library (`src/craft/`)

| File | What it gives |
|---|---|
| `shapes.js` | `box`, `rb`, `cylX/Y/Z`, `slab`, `chamferBox`, `profile` (outline with holes), `frameGeo`, `lathe`, `ibeam`, `tube`, `sweep`, `gear` (module-sized, spur or helical), `rack`, `spring`, `tyre`, `ringText` (sidewall lettering), `boltHead`, `rock`, `rng`, `seg`/`setDetail('lo')` (a cheap build of the same model), and `kit()` (`add`, `group`, `bolts`) |
| `rig.js` | `twoLinkIK`, `circles` + `hiY/loY/loX/hiX` + `reachable`, `sliderCrank`, `meshAngle`, `centreDistance`, `rackTravel`/`pinionTurn`, `aim` (a rod between two points), `instancedLinks` (many links, one draw call), `tabulate`, `lineArm`, `strideFor`, `makeStruts` (hydraulic cylinders with hoses), `smoother`, `damp` |
| `materials.js` | `cleanMaterials({lo})`: gloss and satin black, white, orange, red, yellow, blue, steel, chrome, aluminium, cast aluminium, brass, bronze, copper, ceramic, rubber, plastic, glass, accent; `ghostOf(m)` |
| `wear.js` | `makeWorn({color, rough, painted, bare, seed, dent})`, `bakeRest(root)`, `WEAR.uDamage` |
| `props.js` | 20 ft container, 200 l drum, jersey barrier, crate, light pole, broken wall, gantry crane, rubble; `place()` with colliders; `collide()` |
| `stage.js` | `createStage({canvas, mode: 'studio' \| 'outdoor', env: 'softbox' \| 'room', floor: 'concrete' \| 'shadow'})`: lights, shadows that follow a point, AO with a skip list (`noAO`, `fx`), quality tiers |
| `textures.js` | Procedural concrete, ground variation |
| `checks.js` | `floatingParts`, `anchorGaps`, `overlaps` |

## The model contract

`src/model/model.js` exports `info` and `build({stage, THREE})`, which returns:

```js
{
  root,                                   // Object3D in metres
  params: [{key, label, min, max, step, value, unit}],   // sliders
  update(dt, t, p),                       // pose from p
  focus: [x, y, z], radius, view,         // framing; view = the opening view
  struts,                                 // optional: for the mount check
  probe(), readout(),                     // optional: numbers to verify; live text lines for the panel
}
```

`info = {name, description, stage, wear}`; set `wear: false` for clean models (hides the paint-wear slider). `window.VIEW` gives `setView('front'|'side'|'back'|'left'|'top'|'34'|'low'|'close'|{az, el, d, target})`, `set(key, v)`, `damage(v)`, `probe()`, `check()`, `stats()`, and `model` for model-specific checks (`VIEW.model.timingCheck()`). URL flags: `?stage=outdoor`, `?hud=0`, `?damage=0.9`.

## Review

You can't watch the model run; you can read frames and numbers. **Never report a model as done without reading sheets of the current build.**

```
node "$SKILL_DIR/tools/shoot.mjs" --project ./my-model --out ./shots --query hud=0 --plan '[
  {"sample": {"expr": "VIEW.check()", "frames": 1, "label": "check"}},
  {"sample": {"expr": "VIEW.probe()", "frames": 240, "label": "motion"}},
  {"views": ["34", "front", "side", "back", "top"]},
  {"views": [{"az": 62, "el": 22, "d": 0.75, "target": [0.1, 0.95, 0.05]}]},
  {"filmstrip": {"every": 250, "count": 8, "label": "cycle"}}
]'
```

The tool writes every shot, `sheet.png` (all tiled and labelled), one strip image per `filmstrip` (frames in time order with `t=`), and a JSON file per `sample`. It also prints the GPU, fps, draw calls and every console error.

The loop:

1. **Numbers.** `check()` must be `{floating: [], anchors: []}` at rest and at the extremes of every input. Every `probe()` invariant must hold across the motion. The kinematics `selfTest()` must match the real machine's published figures.
2. **Views.** Read the sheet against the reference: silhouette from front, side and back first, then proportion (measure in the shot), then joints at their limits.
3. **Close-ups.** Frame the part doing the work and read it at full size, using `--size` and the `close` view or an `{az, el, d, target}` aimed at it.
4. **Motion.** Read a filmstrip of a full cycle. Look for parts that pop, jitter, pass through each other or move backwards.
5. **Fix it with a number** in the parameter block, rebuild, and go back to 1. Stop when a full pass finds nothing.

Checklist for every sheet:

- **Mechanism.** Everything that should touch touches; nothing passes through anything; every moving part has a cause (an actuator, a gear, a link); readouts match the pose.
- **Proportion.** Major masses match the reference or the dimension sheet when measured in the frame.
- **Camera.** Pick the view for the mechanism. A planar linkage seen face-on collapses into a lattice; a 3/4 view along its spine keeps every link readable. The subject fills 60–70% of the frame, and nothing important sits within 60 px of an edge.
- **Surface.**
  - Near-white paint blows out first; keep it at or below #e0e0e0 and lower exposure before touching materials.
  - Big glossy metal under a low light streaks; use roughness 0.45 or more and envMapIntensity around 0.5 on large surfaces.
  - Keep emissive under 1.0 or bloom eats the detail around it.
  - Transparent casings need their meshes in `stage.noAO`.
- **Motion.** Continuous mechanisms move continuously. Anything that eases uses `smoother` (no velocity jumps).

Report what was measured, not "looks good": check results, probe numbers, fps on which GPU, and what was estimated rather than sourced.

## three.js traps

- `smoothstep(a, b, x)` with a > b is undefined and returns 0 on some GPUs (ANGLE/D3D on Windows). Write `1.0 - smoothstep(b, a, x)`.
- A `ShadowMaterial` floor or a decal a hair above a surface loses the depth test inside a post-processing target. Give it `polygonOffset` (the `floor: 'shadow'` stage does).
- A face built with a mirrored mapping or a negative scale gets culled as a back face. Use `DoubleSide`, or let three flip the winding: it does for `scale.x = -1` on a parent.
- One NaN pixel blacks out a bloom chain. Clamp every `pow()` base.
- Clipping planes on a model must also go on the AO pass's normal material, or the cut half comes back as a ghost.
- Chained rotations sum: an end piece that must stay level needs minus the sum of its parents' rotations. Check it with a probe.
- AO draws sprites and transparent casings as solid. Put them in `stage.fx` or `stage.noAO`.
- `bakeRest` only once, after placing everything. Never use `Math.random` in geometry; use `rng(seed)`.

The full list with fixes is in `references/pitfalls.md`.

## Performance and delivery

- Test at 60 fps on a laptop's integrated GPU, not only a desktop card. The viewer drops quality tiers by itself (AO off, then pixel ratio 1). `setDetail('lo')` before building cuts every round part to a sixth of its segments, and `cleanMaterials({lo: true})` swaps in flat Lambert. Keep both as a fallback build.
- Watch `draws` in `stats()`. Merge static geometry (`mergeGeometries`) and use `instancedLinks` for repeated links when draws pass about 1000.
- The viewer compiles every shader before the first frame (`compileAsync`), so nothing stalls when it first comes into view.
- `npm run html` folds the build into one self-contained file (`dist/model.html`) that opens from disk. Keep it under about 1 MB so link previews and mail attachments work; the V8 is 834 KB.
