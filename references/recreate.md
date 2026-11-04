# Recreating something real

When the user gives a photo, drawing, product page or names a real object, the goal is a match someone could hold up next to the original.

## 1. Gather and read the evidence

- Use every image given. If only one, ask (once) for a side or back view only if the hidden side is a large part of the object; otherwise infer it from how such things are built and say so.
- Look up specs for named objects: overall dimensions, wheelbase, bore and stroke, link lengths, mass. A real number beats any measurement.
- List the features one by one, in the reference's own order (top to bottom, front to back), before writing code. The walk-through catches parts that would otherwise be dropped: "white hood over the hull, dark socket with a light-grey sensor cube, red eye, shoulder pads on two steel rods...".

## 2. Measure the image

1. Choose the scale: the largest known dimension visible (overall height, wheel diameter, a door, a person).
2. mm per px = known mm / its length in px.
3. Measure every major feature in px, in views where it lies square to the camera. Record it in the dimension sheet as `px × scale`.
4. Perspective: features closer to the camera look bigger. Measure from the most orthographic view, or average the near and far sides of a symmetric object.
5. Angles (a boom's rest angle, the slope of an armour face) measure directly in the image, again from a square view.

## 3. Build to match, view by view

- Set the viewer camera to match the reference's view: azimuth, elevation, and field of view (long-lens photos ≈ 20-30°, phone photos ≈ 60-70°). `VIEW.setView({az, el, d, target})`.
- Shoot that view and the reference side by side and compare: silhouette, then the major masses, then each feature on the list. Note each difference as a number to change.
- Then check the views the reference doesn't show, for plausibility: back, top, underside.

## 4. Colour and finish

- Sample the reference's colours, then correct for its lighting: a sunlit white is not #ffffff paint, so take the shaded side or a mid-tone and keep paint ≤ #e0e0e0.
- Match the finish: gloss (roughness 0.2-0.35), satin (0.45-0.55), flat (0.7+). Match the wear level with `uDamage` and where the wear sits.

## 5. Report the match honestly

Say what was matched from evidence, what was measured from the image (and from which view), and what was inferred because it couldn't be seen.
