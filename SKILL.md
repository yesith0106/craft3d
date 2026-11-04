---
name: craft3d
description: Build accurate, realistic 3D models in three.js entirely from code — machines, vehicles, mechs, robots, weapons, tools, industrial props and environments — at real dimensions, with joints that move by real kinematics, worn and damaged metal made in a shader (no textures), and a headless check loop that measures the model and photographs it before calling it done. Use when someone wants a 3D object or scene that looks and moves like the real thing, "realistic", "accurate", "to scale", "procedural", "hard-surface", "battle-damaged", a model for a game or website, or a three.js asset built from a reference image or a spec.
---

# craft3d

Models that look right because they are right: every part sized from evidence, hung on a pivot where the real joint is, moved by the same equations the real mechanism obeys, then measured. Looking real follows from that.

`SKILL_DIR` is the folder holding this file.

## Start

```
cd "$SKILL_DIR" && npm run setup                 # once: playwright + chromium for the check tool
node "$SKILL_DIR/tools/new.mjs" ./my-model        # viewer + library + a starter model (a loader crane)
cd my-model && npm run dev                        # open the printed URL
```

The project is plain Vite + three.js. `src/model/model.js` is the model; `src/craft/` is the library, copied in so the project stands alone. Drop `src/craft/` and your model into any three.js app (a game, a site) unchanged.

## Two ways in

- **Recreate something real:** a photo, a drawing, a product, a named machine. The evidence is the authority; measure it. Read `references/recreate.md`.
- **Create from an idea:** "a salvage mech for a scrapyard". Write a five-line brief (job, size, power, world, look), borrow proportions from real machines that do the same job, and block it out before any detail. Read `references/from-idea.md`.

Both then follow the same method and the same proof.

## The method

Follow these in order. Each one removes a way models come out generic or wrong.

1. **Evidence before geometry.** Collect references: photos from several sides, drawings, a spec sheet, a datasheet. If the user gave an image, it is the authority on shape and proportion. With only an idea, the evidence is the brief plus the real machines you borrow from. Write down what is known and what has to be estimated before writing any geometry.
2. **A dimension sheet in millimetres.** One parameter block at the top of the model: the overall envelope first (height, width, length, mass), then every part. Get the true numbers where they exist (an ISO container is 6058 × 2438 × 2591; a 200 l drum is ⌀584 × 880). Derive the rest by **measuring the reference**: pixels between two features ÷ pixels of a known dimension × that dimension. Write the derivation next to the number. See `references/accuracy.md`.
3. **The part tree is the joint tree.** Every moving part hangs from a `Group` placed exactly on its real axis of rotation; geometry is offset from that pivot. Build each part at its local origin, then place it. Build in mm under one group scaled 0.001, so the scene is in metres.
4. **Motion comes from equations, not keyframes.** Put the kinematics in a module with no three.js in it: the inputs (speed, reach, a crank angle) go in, joint angles and actuator lengths come out. IK where a part must reach a target, linkage solves where parts are coupled, and the contact rule wherever something touches the ground (`strideFor` in `lib/rig.js`). Then the pose, the numbers and the motion cannot disagree.
5. **Build it the way it would be made.** Plate is cut and folded, so use `slab` and `chamferBox`. Castings are rounded, so use `rb`. Shafts are turned, so use `lathe` and `cyl*`. Structure is rolled section, so use `ibeam`. Nothing real has a razor edge, so bevel everything. Every actuator end needs a lug or clevis to pin to. Bolts, seams and panel lines go only on flat faces. See `references/modeling.md`.
6. **Materials are measurements too.** Paint is dielectric (metalness 0) and bare steel is metal (1). Roughness comes from the finish. Wear goes where real wear goes: edges, corners, low parts, impact zones, rust under chips, streaks running down. `lib/wear.js` does this from one `uDamage` value. See `references/materials.md`.
7. **Prove it, then look at it.** Run the numeric checks first, then the screenshots. Numbers catch what pictures hide: a cylinder 70 mm off its mount, a foot that skates 27 cm per step, a bolt 4 mm in the air. Pictures catch what numbers can't: proportion, silhouette, a part that reads wrong. Stop only when both pass. See "Check loop" below.

## Library (`src/craft/`)

| File | What it gives |
|---|---|
| `shapes.js` | `box`, `rb`, `cylX/Y/Z`, `slab`, `chamferBox`, `frameGeo`, `lathe`, `ibeam`, `tube`, `boltHead`, `rock`, the seeded `rng`, and `kit()` (`add`, `group`, `bolts`) so every part is placed the same way. |
| `wear.js` | `makeWorn({color, rough, painted, bare, seed, dent})` worn paint or bare metal; `bakeRest(root)`; the shared `WEAR.uDamage` (0 factory, 0.45 worn, 0.92 battle). |
| `rig.js` | `twoLinkIK`, `onSeg`, `lineArm` (lever arms for actuator force), `strideFor` (no-slip contact), `smoother`, `damp`, and `makeStruts` (hydraulic cylinders aimed between moving anchors, with hoses and fittings). |
| `props.js` | Real-size industrial props in the worn shader: a 20 ft container, a drum, a jersey barrier, a crate, a light pole, a broken wall, a gantry crane, rubble. `place()` returns ground colliders; `collide()` pushes a moving circle out of them. |
| `stage.js` | `createStage({canvas, mode: 'studio' \| 'outdoor'})`: lights, shadows that follow a point, ground, AO, tone mapping, `fx` (a group the AO skips), quality tiers. |
| `textures.js` | Procedural canvas textures: worn concrete, large-scale ground variation. |
| `checks.js` | `floatingParts`, `anchorGaps`, `overlaps`. |

## The model contract

`src/model/model.js` exports `info` and `build()`. The viewer (`src/main.js`) does the rest:

```js
export const info = {name: 'Loader crane', description: '...', stage: 'studio'};
export function build({stage, THREE}) {
  return {
    root,                                        // Object3D in metres (mm parts under a 0.001 group)
    params: [{key: 'reach', min: 600, max: 2900, value: 1800, unit: 'mm'}],   // sliders
    update(dt, t, p) { /* pose everything from p.reach ... */ },
    focus: [x, y, z], radius,                    // camera framing, metres
    struts: struts.list,                         // optional, for the mount check
    probe() { return {/* numbers worth checking */}; },
  };
}
```

`window.VIEW` in the page: `setView('front'|'side'|'back'|'left'|'top'|'34'|'low'|'close'|{az, el, d, target})`, `set(key, v)`, `damage(v)`, `probe()`, `check()`, `stats()`. URL flags: `?stage=outdoor`, `?hud=0`, `?damage=0.9`.

## Check loop

```
node "$SKILL_DIR/tools/shoot.mjs" --project ./my-model --out ./shots --query hud=0 --plan '[
  {"sample": {"expr": "VIEW.check()", "frames": 1, "label": "check"}},
  {"views": ["front", "side", "back", "34", "close"]},
  {"damage": 0.92, "wait": 300, "shot": "battle"},
  {"eval": "VIEW.set(\"reach\", 2900)", "wait": 400, "shot": "full-reach"},
  {"sample": {"expr": "VIEW.probe()", "frames": 240, "label": "motion"}}
]'
```

It starts the dev server, drives the page on the real GPU, saves every shot plus `sheet.png` (all tiled and labelled), and writes each `sample` to JSON. It prints the GPU, fps, draw calls and every console error. Steps can also hold and release keys (`down`/`up`) for interactive builds.

Each round:

1. **`VIEW.check()` must return `{floating: [], anchors: []}`** in the rest pose and at the extremes of every input.
2. **`probe()` over a motion.** Pick the invariant the mechanism must keep and test it: a planted foot doesn't move (spread of x/z during stance < 2 cm), a rod never leaves its barrel, the IK never clamps inside the stated range, the end effector lands where the input says. Write the invariant first, then the probe.
3. **Read `sheet.png` against the reference.** Silhouette from front, side and back, then proportion (measure in the shot), then joints at their limits, then the close-up for detail and wear.
4. Fix it with a number in the parameter block, rebuild, and go back to 1. Never hide a fault with a camera angle.

Report what was measured, not "looks good": the check results, the probe numbers, fps on which GPU.

## Things that bit before

The full list with the fixes is in `references/pitfalls.md`. The ones that cost the most:

- **Chained rotations sum.** A foot (or any end piece) meant to stay level needs the negative sum of its parents' rotations. Get the sign wrong and it pitches 2× instead of 0. Check it with a probe, not by eye.
- **Moving the body without the legs knowing** makes planted feet skate: a crouch, a sway, a bob. Every body offset must go through the IK, or be cancelled in the leg (a hip roll against sway).
- **`smoothstep(a, b, x)` with a > b** is undefined and differs by GPU. Always pass the edges in order: write `1.0 - smoothstep(b, a, x)`.
- **AO draws sprites and particles as solid slabs.** Put them in `stage.fx`.
- **Details on a rounded surface float.** A bolt on a big-radius `rb` sits on the box, not the curve. Put details on flat faces or skip them.
- **`bakeRest` once,** at a rest pose where nothing overlaps, and only after placing everything. Baking per prop at the origin gives every copy the same wear.
- **Never `Math.random`** in geometry: use `rng(seed)`, so the model rebuilds identically and a screenshot from yesterday still matches.

## Look and performance

- Studio for judging a model (neutral backdrop, soft shadows); outdoor for scale and context. Check the outdoor look before shipping anything meant for a game.
- White paint blows out first. If it does, lower exposure or environment intensity before touching the material.
- Aim for 60 fps on a laptop's integrated GPU, not on a desktop card. The viewer drops tiers by itself (AO off, then pixel ratio 1); watch `draws` in `stats()`. Merge static geometry (`mergeGeometries`) when draws pass ~500.
- A built page uses ES modules and must be served (`npm run preview` or any static server), not opened as a `file://`.
