# From an idea

When there is no reference ("a salvage mech for a desert scrapyard", "a sci-fi cargo lifter"), design it the way an engineer would: from a job, a size and real parts, so it comes out like a plausible machine and not a generic game asset.

## 1. Write the brief (5 lines, before anything else)

```
JOB:       what it does all day (lifts 2 t crates onto trucks)
SIZE:      overall envelope and mass (3.2 m tall, 5.5 t)
POWER:     how it moves (diesel-hydraulic: pump, reservoir, cylinders on every joint)
WORLD:     where it lives and how old it is (port yard, 15 years, repainted once, salt air)
LOOK:      2-3 words plus one accent (hunched, industrial white, red sensor)
```

Show the brief to the user in one short message if anything in it is a real choice (size, era, mood); otherwise state it and proceed.

## 2. Borrow proportions from real machines

Pick 1-3 real machines with the same job, mass or mechanism, and take their numbers:

| Idea | Borrow from |
|---|---|
| Walking mech, 2-6 t | Excavator booms and cylinders; forestry walkers; ISO 3320 bores 63-125 |
| Light combat robot | Industrial robot arms (KUKA/ABB reach 1-3 m, payload 10-300 kg) |
| Cargo lifter | Forklifts (mast, carriage, forks 1150 long), reach stackers |
| Sci-fi vehicle | Mining haul trucks, APCs: wheel ⌀, ground clearance, track widths |
| Weapon / tool | Real calibres, barrel lengths, receiver sizes; hand tools fit a 95 mm hand width |
| Building / set | Doors 2.1 m, stairs 175/280 mm, floor heights 3-4 m, ISO containers |

Write the borrowed numbers into the dimension sheet with their source ("knee cylinder: 63 bore like a 5 t excavator arm cylinder").

## 3. Sketch in blocks first

Build the envelope in plain `box`/`cylY` with no detail: every major mass at its real size, on its real pivots, posed through its range of motion. Screenshot front, side and 3/4. Fix proportion and reach now, while every change is one number. Only then replace blocks with real shapes.

## 4. Make it believable

- **Every motion has a cause.** A joint has an actuator (a cylinder, a motor housing, a cable run) and the actuator has a power path (hoses to a reservoir, cables to a pack).
- **Every part has a manufacturing method** (see modeling.md). Mixed methods read as real: a cast hub, a plate guard, a turned pin, a rolled frame.
- **Service story:** access panels, lifting eyes, grease nipples and labels where a mechanic would need them. A few, not everywhere.
- **History in the wear:** decide what happened to it (the left arm takes the hits, it wades through mud) and place wear and damage to match, through `seed`, `dent` and which parts use which material.
- **One accent colour** that means something (sensors, warnings, the active part).

## 5. Then the same proof as a recreation

The idea still has to obey physics: the checks, the probes (feet planted, rods in barrels, reach as commanded) and the screenshot review from SKILL.md, against the brief instead of a photo.
