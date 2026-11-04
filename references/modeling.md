# Modeling: part trees, blocks, detail

## Part tree

```
root (scale 0.001, mm inside)
└─ base                         fixed parts
   └─ slew      (pivot: Y axis at the ring centre)
      └─ boom   (pivot: X axis at the pin, the part hangs down -Y, forward is +Z)
         └─ knuckle (pivot at boom length)
            └─ tip
```

- One `Group` per real joint, positioned at the pin centre. The meshes are its children, offset so the pin sits at the group origin.
- Name the pivot groups (`g.name = 'kneeL'`); `checks.js` prints names.
- An "explode" or service layer is an extra group between a pivot and its meshes (`partEx`), so a part can be lifted out along a direction without breaking the joint math.
- Mirror sides by iterating `[['L', 1], ['R', -1]]` and multiplying x by the sign. Build once, never copy-paste a side.

## Choosing blocks

| Real part | Block | Notes |
|---|---|---|
| Armour, guards, brackets, cut plate | `chamferBox(w, h, d, c, bevel)` / `slab(pts, d)` | Chamfer about 10–15% of the short side; bevel 12–25 mm on large plates |
| Castings, padded covers, hoods | `rb(w, h, d, r)` | r up to 40% of the smallest side for "soft" industrial shapes |
| Pins, shafts, bushings | `cylX` (pins are usually across the joint, along X) | Pin ⌀ ≈ 0.25–0.35 × the lug width |
| Turned parts: drums, wheels, nozzles, pistons | `lathe([[r, y], ...])` | Profile bottom to top; add a 2–5 mm step for every machined shoulder |
| Frames, columns, gantries | `ibeam(h, wf, d)` | UC 305 is about 305 × 305; scale the flange and web thickness with depth |
| Hoses, cables | `tube(pts, r)` | Run them along a surface; each end goes into a fitting, never into the air |
| Sockets, hatches, bezels | `frameGeo(w, h, r, iw, ih, ir, d)` | |
| Repeated details | `mergeGeometries` | One draw call for 30 container ribs |

## Detail rules

- **Hierarchy of detail.** The silhouette first (squint at the screenshot), then the big masses, then joints and actuators, then panel lines and fasteners. Fasteners don't fix a wrong silhouette.
- **Every actuator end gets a mount:** a lug, clevis, or horn that overlaps both the part's surface and the anchor point. `anchorGaps` enforces this.
- **Fasteners on flat faces only,** on a pattern with a reason: a ring on a flange, pairs at a plate's corners 1.5–2 bolt diameters in from the edge.
- **Panel seams** are 3–4 mm dark inset boxes on flat faces, aligned with the part's construction.
- **Hydraulics read real** when they have the barrel, a larger end cap, a polished rod, a rod eye, a port fitting and a hose running back along the barrel. Rod ⌀ ≈ 0.55–0.65 × bore.
- **Scale cues:** a 9 m pole, a 20 ft container or a human-height door next to the model tells the eye how big it is. On a bare plane nothing reads at scale.
- **Collisions are fixed with numbers:** move or shrink the part in the parameter block until `overlaps()` and the screenshots agree. Never rely on a camera angle to hide them.

## Units and frames

- Build in mm and display in metres (root scale 0.001). Colliders, the camera and physics are in metres.
- Forward is +Z, up is +Y, and left (for a model facing +Z) is +X.
- `rotation.y = θ` maps local (x, z) to world (x cos θ + z sin θ, −x sin θ + z cos θ). `props.place` and `collide` use exactly this.
- Euler order is XYZ by default: a pivot with both pitch (x) and roll (z) applies roll first in the parent's frame. For small rolls this doesn't matter; for big ones, nest two groups.
