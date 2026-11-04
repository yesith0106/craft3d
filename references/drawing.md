# The drawing look

How `lib/ink.js` draws a model, what a model must do so it draws well, and what goes wrong.

## How a frame is drawn

The drawing is computed from the model, not stored on it. Every frame:

1. **Solid pass.** Every opaque mesh is drawn with a small shader that writes its view-space normal, a part id (one per mesh, one per instance of an `InstancedMesh`) and depth into a float target. Back faces seen through the section plane are flagged: they are the cut faces.
2. **Ghost pass.** Every see-through mesh (material `transparent` with opacity below 0.6, or `userData.ink = 'ghost'`) is drawn the same way into a second target.
3. **Colour pass.** Lines, sprites, points, anything in `stage.fx` and anything tagged `userData.ink = 'color'` are drawn with their own materials, hidden behind the solids by a depth-only pre-pass.
4. **Composite.** One full-screen shader finds the lines:
   - a **silhouette** wherever the part id changes or the depth steps (a relative Laplacian of 1/depth, which is zero on any flat plane at any angle), drawn thick (`sil`)
   - a **crease** wherever the normal turns more than `creaseAngle` inside one part, drawn thin (`crease`)
   - **ghost lines** from the ghost target, light, hidden where a solid is in front
   - **cut faces** filled with the section tint and 45° hatching, outlined darker
   - paper behind everything, a whisper of shading on the solids (`shade` in the palette)

Hidden lines disappear on their own: only the front surface is in the buffers. Nothing depends on the triangle count, so a 1.6-million-triangle turbojet draws as cleanly as a box.

## What a model must do

- **Closed solids, faces outward.** The cut works by seeing back faces through the plane. An open shell or an inward-wound part shows hatching where there should be air, or no cut face at all. `turned()` and `blade()` close and orient their geometry; for anything hand-made, `outward(geometry)` fixes the winding (it measures the signed volume).
- **Sharp corners stay sharp.** Smoothed normals across a 90° corner hide the crease line. `turned()`, `blade()` and `creased(geometry, angle)` keep corners sharp and curves smooth. `rb()` (rounded boxes) and the cylinders are already right.
- **Real part boundaries.** A line is drawn where one mesh meets another. Modelling a casting as five overlapping boxes draws five boxes. Build it as one `profile` or `turned` solid.
- **Tag what isn't solid.** Gas, flames, sparks, glows: `userData.ink = 'color'`. Glass and x-ray casings: transparent (they become phantom lines) or `'ghost'`. Display stands and floors that only make sense in the realistic look: `userData.realOnly = true`.
- **Section.** `section: {normal, from, to, value}` on the model's return value, in world metres; the plane keeps `normal·p <= offset`, with offset running from `from` (beyond the model, no cut) to `to` as the slider goes 0 to 1. Mark moving and fastening parts `userData.noCut` (shafts, rotors, discs, pistons, rods, valves, springs, bolts). Section drawings leave them whole; it also reads better.
- **Lines the model draws itself.** `inkLine(points, {color | colors, width, dashed, dash, gap})` makes a fat line (`Line2`) in the parent's units, already tagged `'color'`. `centerline(A, B)` makes a dash-dot centre line, shown only in the drawing look. Give a line `material.clippingPlanes = ink.planes` to have the section cut it too.

## Palettes and line weights

`PALETTES` in `ink.js`: `paper` (warm paper, black ink, blue section), `blueprint` (white on blue), `print` (black on white, no shading). `info.palette`, `?palette=`, or `VIEW.palette()`. A custom one is an object with `paper, fill, ink, ghost, cut, cutInk, shade`.

`info.lines = {sil, crease, ghost, creaseAngle, depthK, hatch}`: silhouette, crease and ghost widths in CSS px (2.2, 1.2, 1.0 by default), the crease angle in degrees (32), the depth-step sensitivity (0.012, raise it if curved surfaces sprout lines), hatch spacing in px (7, 0 for a flat fill).

## Problems and fixes

| You see | Why | Fix |
|---|---|---|
| Lines across a smooth curved surface | too few segments, so facets meet at more than `creaseAngle` | more segments; or a larger `creaseAngle` |
| No line at a sharp corner | normals smoothed across it | `creased(geo, 30)` or build with `turned()` |
| Hatching inside a hollow part, or a cut part looks empty | open shell or inward faces | close the outline; `outward(geo)` |
| A rotor is cut in half by the section | not tagged | `userData.noCut = true` on its group |
| Gas, sparks or glows drawn as white solids or grey ghosts | not tagged | `userData.ink = 'color'` |
| Flow lines hidden behind blades | the colour pass is depth-tested | `material.depthTest = false` while the section is open |
| Fat lines the wrong width or invisible | `LineMaterial` needs the canvas size | the viewer sets it on resize; in your own app call `material.resolution.set(w, h)` |
| Blades of one row merged into one outline | not instanced, or one mesh for the whole row | one `InstancedMesh` per row: each instance gets its own id |
| Speckled lines on far-away parts | the part is a few pixels wide | thinner lines, or leave the detail out at that view |
