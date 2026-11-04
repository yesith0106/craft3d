---
name: wireframe
description: Build accurate 3D models in three.js drawn as technical illustrations: clean ink outlines with hidden lines removed, crease lines, section cuts with hatched cut faces, phantom lines for casings, dash-dot centre lines, flow lines coloured by temperature or pressure, and exploded views, on paper, blueprint or print palettes. Engines, turbines, gearboxes, pumps, mechanisms, machines and products at real dimensions, moving by real kinematics when they move, measured and photographed by a headless check loop; exports one offline HTML file. Use for "wireframe", "line drawing", "line art", "technical drawing", "technical illustration", "cutaway", "cross-section", "section view", "exploded view", "blueprint", "patent drawing", "how it works diagram", or recreating an object from a photo, spec or idea in that style. For shaded, realistic or worn metal use /3d-model instead.
---

# /wireframe: the drawing look

One engine with two looks; this command is the drawn one. The method, the library, the model contract and the proof are shared with `/3d-model` and live in the engine's `METHOD.md`. The drawing renderer is `lib/ink.js`.

**First, find the engine and read the method:**

```
ENGINE="$(cd -P "<this skill's base directory>/../.." && pwd)"   # the craft3d repo this skill links into
cat "$ENGINE/METHOD.md" "$ENGINE/references/drawing.md"
```

Read both in full before building, then `references/recreate.md` or `references/from-idea.md`. The closest example is usually `turbojet` (`node "$ENGINE/tools/new.mjs" ./my-model --example turbojet`): it opens in the drawing look and shows every feature below. Everything below is what is specific to drawings.

## Why the drawing is the harder test

A drawing shows every edge. A blade with too few sections, a casing that is a stack of overlapping boxes, a part that pokes through another: shading hides these, ink does not. So the accuracy rules in `METHOD.md` matter more here, not less. Build closed solids the way the part is made (`turned` for anything round, `profile`/`slab` for plate, `blade` for airfoils), never a shell of planes.

## Set the look

- `info.look: 'drawing'` opens the model drawn; `info.palette`: `'paper'` (warm paper, black ink, blue section, the default), `'blueprint'`, `'print'`. `info.wear: false`.
- The viewer's `realistic` button (or `L`) still switches to shaded metal, so give parts sensible materials anyway.

## The drawing toolkit (lib/ink.js and friends)

| Want | Do |
|---|---|
| See inside | `section: {normal, from, to, value}` on the model: the plane keeps `normal·p <= offset`; the slider runs from `from` (no cut) to `to`. Cut faces are tinted and hatched automatically. |
| Keep parts whole through the cut | `obj.userData.noCut = true` (shafts, rotors, pistons, rods, valves, fasteners: drawings do not section them) |
| Phantom casing | transparent materials (opacity < 0.6) draw as thin grey lines behind and in front; or `userData.ink = 'ghost'` |
| Colour on the drawing | `userData.ink = 'color'`: drawn with its own material (gas, sparks, heat). `inkLine(points, {colors})` for flow lines, `ramp(t)` for cold-to-hot colour |
| Flow lines through the cut | give their `LineMaterial` `clippingPlanes = ink.planes` and set `depthTest = false` while the cut is open, so they run over the blades the way a cutaway illustration draws them |
| Centre lines | `centerline(A, B)` on every axis of rotation (drawn in the drawing look only) |
| Exploded view | `exploder([{obj, dir, dist, at}])`, a slider 0..1; outermost parts first, along the direction they really come off |
| Only in one look | `userData.inkOnly` / `userData.realOnly` (a display stand is `realOnly`) |
| Line weight | `info.lines = {sil: 2.2, crease: 1.2, ghost: 1, creaseAngle: 32, hatch: 7}` (CSS px, degrees) |

## Drawing checklist (with the shared one in METHOD.md)

- **No line noise.** Stray lines across a smooth surface mean too few segments or smoothed corners. Use `turned`/`creased` so corners are sharp and curves are smooth; raise segment counts on large round parts.
- **Cut faces where the material is.** A cut casing shows its wall as a thin hatched band; a solid block shows a filled section. A hatched face where there should be air means a shell that is not closed or faces that point inward (`outward()` fixes the winding).
- **Lines read at the size it will be seen.** Read a close-up and the full view. Tiny parts that turn into scribble at full view are too detailed for it or need thinner lines.
- **Every axis has its centre line.** Every moving part reads as whole in the section (`noCut`).
- **The cut and the explode tell the story.** One frame of the section through the working part, one of the exploded view, one close-up.

Review with the same `shoot.mjs` loop. Add `look=drawing` to `--query`, and shoot the section at a few slider values (`{"eval": "VIEW.set('section', 0.4)"}`) and the exploded view.
