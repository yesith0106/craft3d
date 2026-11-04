# Pitfalls, with fixes

Every entry here cost real debugging time. Check the list when something looks or measures wrong.

## Rigging

- **End piece pitched instead of level.** The ankle was set to `-(hip − knee)` when the chain made it `hip − knee`, so the foot pitched by twice the leg angle and the sole swept 30 cm per step. Fix: sum the rotation.x values down the chain and set the end piece to minus that sum. Confirm with a probe (foot y and z over a stance), not by eye.
- **Crouch only in the IK.** The IK target dropped for a long stride but the body mesh didn't, so the feet floated about 60 mm. Fix: return the total body drop from the kinematics and apply that one number to the mesh.
- **Sway dragging planted feet sideways.** Fix: roll each hip by `−atan2(sway, hipHeight)` minus the body roll, and roll the foot back so the sole stays flat.
- **Actuator anchors both on one side of the joint.** The line of action passed almost through the pin, so the lever arm was about 0 and the computed force infinite. Fix: put one anchor on a horn or lever offset from the pin; check that `lineArm(...).arm` is at least about 80 mm.
- **Cylinder pinned to air.** The anchor sat 70 mm ahead of the post face with nothing there. `anchorGaps` finds it. Fix: a lug that overlaps both.
- **IK at full stretch goes NaN.** Clamp the reach 1 mm short (`twoLinkIK` does), and report `clamped` in `probe()`.
- **Changing speed without changing cadence and stride together** makes feet skate. Use `strideFor`.

## Shading

- **Reversed smoothstep edges** (`smoothstep(thr − 0.018, thr − aa, x)` with the first edge larger) produced speckle everywhere, at every damage level. GLSL leaves it undefined and GPUs differ. Fix: always ascending edges; `1.0 − smoothstep(b, a, x)` for the inverse.
- **Edge wear from `fwidth` of the normal** flickers and depends on resolution. Use exact box-edge distance in mm (what `wear.js` does).
- **`pow()` of a negative base gives NaN,** and one NaN pixel can black out a bloom chain. Clamp the base.
- **Wear identical on every prop.** It was baked at the origin before placement. Fix: place everything, then call `bakeRest` once on the shared root.

## Rendering

- **Dark rectangles behind moving things.** Dust sprites were drawn into the AO normal/depth pass as opaque quads. Fix: `stage.fx`.
- **`PCFSoftShadowMap` is gone** in recent three.js (it warns and falls back). Use `PCFShadowMap` or `VSMShadowMap`.
- **Shadows crawl as the subject moves.** Snap the shadow camera to texels (`stage.follow` does).
- **Washed-out, blue, flat look outdoors:** sky image light plus hemisphere plus exposure too high. Values that work are in `materials.md`.
- **Flat-white concrete walls:** a box's uvs run 0..1 per face, but an extrusion's uvs are in mm. Use two materials with different texture repeats (`props.js` keeps `concrete` and `concreteMm`).

## Detail

- **Bolts and seams floating off rounded boxes.** A big-radius `rb` is far inside its box at the corners. Put details on flat regions (inside `w/2 − r`) or skip them.
- **Hoses as loose loops** read as handles. Run them along the barrel into a fitting.
- **Tiny gaps on purchased parts** (container lock bars 4 mm off the door). `floatingParts` finds them at a 3 mm tolerance.

## Tooling

- **`file://` won't run a Vite build** (module scripts are blocked). Serve it.
- **Headless frame rate isn't the user's frame rate.** Report the GPU the check tool printed; test the tier drop by forcing `stage.setTier(0)`.
- **Reading matrices between frames:** `obj.localToWorld` uses the matrices from the last update. Call `root.updateMatrixWorld(true)` after posing and before measuring (the template's update path does).
