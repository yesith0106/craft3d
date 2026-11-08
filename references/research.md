# Research: find the real numbers before any geometry

Every model of a real thing starts here, before a single vertex. The best model is the one built on the maker's own
data, so the research tries hardest for that and only falls back to measuring photos when nothing better exists.
The Wooting 80HE example shows what this buys: Wooting publishes the full assembly as a STEP file, so the case, plate,
gasket, PCB, foam, stabilisers, feet and every screw position come straight from their CAD, and the model matches
every published figure to 0.01 mm (`examples/wooting80he`).

## Run it in parallel, always

Start a research agent in the background the moment the object is named, and keep working while it runs
(scaffolding, reading the closest example, pulling photos). Give it this brief, filled in for the object:

> Research the physical design of <object> for a to-scale 3D model. Report every number in mm with its source,
> tagged [spec] published by the maker, [cad] measured from the maker's CAD, [rev] from a review, [est] estimated.
> 1. **The maker's own CAD first.** Search for STEP / STP / IGES / Parasolid / STL / 3MF / DWG / DXF / PDF drawings:
>    the maker's site (support, downloads, "developers", "open source", "design files", "3D models", "mechanical
>    drawing", "dimensional drawing", "datasheet", "spec sheet", "user manual"), their GitHub / GitLab org (search
>    `<maker> design`, `<maker> hardware`, `<product> cad`, `<product> step`), GrabCAD, Printables / Thingiverse /
>    Onshape public documents from the maker, component vendors (McMaster-Carr, Misumi, TraceParts, 3D ContentCentral,
>    SnapEDA / Ultra Librarian for electronics), open-hardware repositories. If found, download it, note its licence,
>    and measure it (tools/step2mesh.py `list` and `section`): every part's name, count and bounding box.
> 2. **The maker's spec table**, read from the page source too: product pages often carry the full table in embedded
>    JSON that the visible page hides behind tabs. Dimensions, heights, angles, weights, materials, finishes, colours
>    and variants, what is in the box.
> 3. **Drawings and patents:** patent figures, FCC / regulatory filings (external and internal photos), service
>    manuals with exploded views, parts lists.
> 4. **Measured reviews:** reviews that measure (RTINGS, TechPowerUp, AnandTech, car and aircraft data books,
>    Jane's, manufacturer type certificates), teardown sites (iFixit), enthusiast databases and wikis.
> 5. **Orthographic references:** the maker's own straight-on renders (top, front, side) at full resolution, for
>    measuring what no number covers. Name the files and the scale (known mm over px).
> 6. **Standards it follows** (key pitch 19.05 mm, MX switch 14 mm cut-out, ISO thread sizes, tyre codes, rail gauge,
>    container sizes): the numbers that come free once you know the standard.
> Say what you could not find, and which numbers are therefore estimates.

Do the same yourself for the quick wins while it runs: fetch the product page and pull its spec table out of the
HTML (`curl` it, strip the tags, search for "Dimensions", "mm", "Weight"), and download the maker's product renders
(`grep -oE 'https://[^"]+\.(png|jpg|webp)'`).

## What to do with what comes back, best first

1. **Manufacturer CAD (STEP and friends).** Use it as the geometry, not just as a reference.
   - `npm run setup:cad` once (a Python venv with OpenCascade), then `PY=$ENGINE/.ocp/bin/python`.
   - `$PY tools/step2mesh.py list part.stp`: every part with its count and bounding box. This alone settles the
     overall size, the stack-up, where every fastener is, which parts are the same part repeated.
   - `$PY tools/step2mesh.py section part.stp --axis x --at 60`: a true section as an SVG. Read it before building;
     it shows how the parts nest (which piece is the shell, where the parting line is, what is hollow).
   - `$PY tools/step2mesh.py export part.stp out/name --skip <threaded screws, inserts> --coarse <busy small parts>`:
     welded, outward-facing meshes, copies stored once, 0.01 mm quantised, gzipped. Then
     `node tools/cadpack.mjs out/name src/model/cad-data.js "source, licence"` and load it with
     `unpackCad()` from `lib/cad.js`. Keep the packed data near 1 MB: skip threads (draw them as cylinders from
     their boxes), coarsen connectors and fasteners, drop variants you don't show.
   - Put the CAD in its own frame under one group and place that group (tilt it onto its feet, solve the contact
     points with a small bisection), as `examples/wooting80he/model.js` does with `solveTilt`.
   - Build what the CAD leaves out (switches, keycaps, wiring, cables, labels) to the relevant standard, and make
     the self-test check your parts against CAD positions (the 80HE's layout is checked against the stabiliser
     positions in the STEP, to 0.03 mm).
   - Respect the licence. Open-hardware licences (CERN-OHL, CC BY-SA) allow it with attribution and share-alike:
     put a `LICENSE-CAD.md` next to the data saying what it is, who owns it, and what was changed. If the licence
     forbids redistribution, measure the CAD for numbers only and build the geometry yourself.
2. **A dimensioned drawing or a full spec table.** Every number into the parameter block with `[spec]`.
3. **Orthographic renders or photos.** Measure them (`references/recreate.md`, step 2): scale from the biggest known
   dimension, check the scale against a second known one (the 80HE's top render agreed with the 19.05 mm key pitch
   to 0.3%), then read layouts, gaps, radii and positions off it.
4. **Estimates last,** each one labelled `[est]` in the code and named in the final report.

## The check that research worked

- Every number in the parameter block has a tag, and most of them are not `[est]`.
- The model's `probe()` reproduces each published figure: overall size, heights, angles, wheelbase, mass where it
  can. Put them side by side in the report (model vs published).
- Where the maker publishes something you can't reproduce, find out why before moving on: it is usually a wrong
  assumption (the 80HE's "front height" is measured on its 2.8° feet, not on the case bottom).
- The final report says where the geometry came from (CAD, drawing, measured photo, estimate), part by part.
