# Accuracy: dimensions, kinematics, proof

## 1. The dimension sheet

Write it before any geometry. It is a comment block plus a `const P = {...}` in mm at the top of the model.

```
// envelope: 2.70 m tall, 2.10 m across the shoulders, 4.2 t   (user's drawing + class estimate)
// scale                = 2700 mm tall / 901 px tall on the side view = 3.0 mm/px
// hip height 1235      = 412 px x 3.0, sole to hip pin
// thigh 420, shin 560  = 140 px and 187 px x 3.0, pin to pin
// ankle 330            = sole to ankle pivot, front view
// knee cylinder bore 63 = standard ISO 3320 size that gives < 160 bar at the peak load (see section 3)
```

Every line says where its number came from: a spec, a standard, a measurement off a reference, or a derived value with its formula. An estimate is fine; an unlabelled one is not.

### Sources, best first

1. Manufacturer data: datasheets, brochures, manuals, patent drawings.
2. Standards: ISO 668 (containers), ISO 3320 (cylinder bores: 25, 32, 40, 50, 63, 80, 100, 125...), ISO 4762 (cap screws: an M12 head is ⌀18 × 12), EUR pallet 1200 × 800 × 144.
3. Measuring a reference image: pick the longest known dimension in the shot, get mm per pixel, and measure everything else in pixels. Use features in the same plane as the known one; perspective shrinks the far side, so prefer an orthographic-looking view (long lens, side-on).
4. Class reasoning: a 4 t walker needs legs like an excavator boom, not a person's. Scale from a real machine of the same mass.

### Proportion checks before building

- The sum of the stacked parts equals the envelope (sole + ankle + shin + thigh + pelvis + hull + head = height).
- Joint ranges come from the geometry: a knee can't flex past where the shin armour meets the thigh. Compute that limit and clamp to it.
- Mass sanity: steel is 7850 kg/m³. A solid 300 mm cube of steel is 212 kg. If the volume times the density is far off the stated mass, the parts are too big or should be hollow.

## 2. Kinematics in a pure module

`kin.js` (or similar) imports nothing from three.js. Then it runs in node:

```
node --input-type=module -e "import {poseAt} from './src/model/kin.js'; for (let p=0;p<1;p+=0.1) console.log(p.toFixed(1), JSON.stringify(poseAt(p, 1.2)))"
```

### Patterns

- **Two-link reach** (arms, legs, booms): `twoLinkIK(z, y, L1, L2)`. Pick the elbow-up or elbow-down branch to match the real machine (cranes: knuckle up; legs: knee forward).
- **Linkages** (four-bar, Jansen, scissor): solve each joint as the intersection of two circles, choosing the branch by the sign of a cross product, as one ordered pass from the driven joint outward.
- **Actuators:** the length between anchors gives the stroke, and `lineArm` gives the lever arm. Force = torque / arm and pressure = force / bore area; with twin cylinders, divide by 2A. If the pressure comes out over about 250 bar, the bore is too small or the anchors are badly placed; move the anchor (a horn or lever) rather than inflating the bore.
- **Ground contact:** a foot or track in contact moves back, relative to the body, at exactly the body's speed. With phase rate `r` (cycles/s) and duty `d`, the stride is `S = v·d/r` (`strideFor`). When speed changes, change rate and stride together through this. Never set them independently.
- **Anything that offsets the body** (bob, sway, crouch, lean) must be either fed into the IK target or cancelled at the joint below it. A crouch that only lowers the IK target and not the mesh leaves the feet floating; a sway the legs don't know about drags planted feet sideways.

## 3. Proof

Write the invariant first, then the probe that tests it, then the fix.

| Mechanism | Invariant | Probe |
|---|---|---|
| Legged walker | Stance foot fixed in floor coordinates | spread of foot x/z over each stance window < 0.02 m, foot y ≈ 0 |
| Wheels/tracks | No slip | wheel angle × radius = distance travelled |
| Hydraulic cylinder | Rod stays in barrel | `body ≤ length ≤ 2·body − 60` over the full input range |
| IK arm | Reaches where commanded | end effector world position = target ± 2 mm, `clamped` false inside the stated range |
| Folding gear / doors | No collision through the motion | `overlaps()` empty at 20 samples across the stroke |
| Anything | Nothing floats, every mount is metal | `VIEW.check()` → `{floating: [], anchors: []}` |

A worked probe, the walker's feet (model.probe returns floor-relative foot positions each frame):

```js
// inside shoot.mjs plan: {"sample": {"expr": "VIEW.probe()", "frames": 300, "label": "feet"}}
// then in node:
const rows = JSON.parse(fs.readFileSync('shots/feet.json'));
let worst = 0, run = [];
for (const r of rows) {
  if (r.L.down) run.push(r.L.z);
  else { if (run.length > 6) { const s = run.slice(2, -2); worst = Math.max(worst, Math.max(...s) - Math.min(...s)); } run = []; }
}
console.log('worst stance slip m', worst);   // target < 0.02
```

When a probe fails, print the raw numbers per frame (joint angles, the end point relative to its pivot, the body position) and compare them with the pure kinematics module. Where the module and the mesh disagree, the error is in the rig (a sign, an order of rotations, an offset); where they agree but the motion is still wrong, it's in the math.
