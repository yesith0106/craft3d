---
name: 3d-model
description: "Build accurate, realistic 3D models in three.js entirely from code: machines, engines, vehicles, mechs, robots, weapons, tools, props and environments, at real dimensions, with shaded metal, paint, glass and rubber, clean or worn and battle-damaged (shader wear, no textures), lit in a studio or outdoors. Moving parts move by real kinematics (IK, linkages, gears, cams, slider-cranks) when the thing moves. Measured and photographed by a headless check loop before it is called done; exports one offline HTML file. Researches the real object first, hunting for the maker's own CAD (STEP), spec tables and drawings, and builds on the maker's geometry when it is published. Use for \"realistic\", \"photoreal\", \"accurate\", \"to scale\", \"hard-surface\", \"worn\", \"damaged\", \"a working simulation\", a game or website asset, or recreating an object from a photo, spec or idea. For line drawings, cutaways, section views, blueprints or technical illustrations use /wireframe instead."
---

# /3d-model: the realistic look

One engine with two looks; this command is the shaded one. The method, the library, the model contract and the proof are shared with `/wireframe` and live in the engine's `METHOD.md`.

**First, find the engine and read the method:**

```
ENGINE="$(cd -P "<this skill's base directory>/../.." && pwd)"   # the craft3d folder this skill sits in: the cloned repo, or the installed plugin
cat "$ENGINE/METHOD.md"
```

Read `METHOD.md` in full before building: start commands, examples, the 8-step method, the library, the model contract, the review loop, the three.js traps. Then read `references/recreate.md` or `references/from-idea.md` depending on what the user gave you.

**For anything real, research comes first** (`references/research.md`): launch a background research agent with the brief in that file the moment the object is named, and look hardest for the maker's own CAD. A published STEP becomes the geometry (`tools/step2mesh.py` → `tools/cadpack.mjs` → `lib/cad.js`); then spec tables (read from the page source too), drawings, measured reviews and orthographic renders. `examples/wooting80he` is the worked example: Wooting's STEP assembly plus switches and keycaps built to standard, every published figure reproduced, `VITE_LOOK=real` for the shaded build with six case finishes, PBT grain and per-key RGB (`look.js`). Everything below is what is specific to the realistic look.

## Materials

- `cleanMaterials()` for new and showroom: clearcoat paint (dielectric), polished and brushed metals (metalness 1), glass, rubber, ceramic. `wear.js` for anything used: `makeWorn({color, rough, painted, bare, seed, dent})`, then `bakeRest(root)` once after everything is placed. The paint-wear slider drives `WEAR.uDamage`; set `info.wear: false` for clean models.
- Wear goes where it really happens: chips on edges and corners, rust under the chips, streaks below bolts and seams, grime low down, soot at exhausts, dents on what gets hit.
- Read `references/materials.md` for the values that read under the studio stage.

## Stage

`info.stage`: `'studio'` (soft-box reflections, a concrete floor fading into the backdrop, or `floor: 'shadow'`) for inspecting a model, `'outdoor'` (sky, haze, sun shadows that follow a point) for worlds and games. AO skips anything in `stage.fx` and `stage.noAO`.

## Surface checklist (with the shared one in METHOD.md)

- Near-white paint blows out first; keep it at or below #e0e0e0 and lower exposure before touching materials.
- Big glossy metal under a low light streaks; use roughness 0.45 or more and envMapIntensity around 0.5 on large surfaces.
- Keep emissive under 1.0 or bloom eats the detail around it.
- Transparent casings need their meshes in `stage.noAO`.
- Paint is dielectric (metalness 0 to 0.1); bare metal is metal (0.8 to 1). Nothing is a perfect mirror.

## Filming it

A finished model can be filmed or shot as a product photograph: offline frames with real soft shadows, depth of field and motion blur, a dark showroom or a studio set, an MP4 or a high-resolution still. That is `/cinematic` (`references/cinematic.md`, `lib/cine.js`, `tools/film.mjs`); every scaffold already has a starter `src/model/film.js`. Build and prove the model first.

## The other look comes free

Every model also opens as a technical drawing (the viewer's `drawing` button, `L`, or `?look=drawing`). Keep it working: closed solids with outward faces (`turned`, `outward`), see-through parts tagged or transparent, gas and sparks tagged `userData.ink = 'color'`. If the user wants a cutaway or a line drawing, switch to `/wireframe`.
