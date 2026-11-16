---
name: cinematic
description: "Film a three.js model built with craft3d, or shoot it as a product photograph, entirely from code and rendered offline on the GPU. Each frame is many renders averaged, so soft boxes and fluorescent tubes act as true area lights, and soft shadows, depth of field and motion blur are real. Dark showrooms with tubes that strike, haze and smoke; studio sets of soft boxes and strips; a floating product on a paper backdrop; fast-cut close-ups, slow orbits, a travelling light; the mechanism running on cue. Writes an MP4 (16:9 or 9:16) or a high-resolution still, matched to a reference image or film when one is given. Use for \"cinematic\", \"film\", \"video\", \"clip\", \"trailer\", \"commercial\", \"reel\", \"turntable\", \"product shot\", \"hero shot\", \"hero image\", \"studio shot\", \"render it like this photo\", \"make it look like this ad\", or \"a cinematic of the model\". The model must exist first: build it with /3d-model, then film it."
---

# /cinematic: films and hero stills

One engine, two looks, and this: a camera crew for a model that is already built. If there is no model yet, build it with `/3d-model` first (`METHOD.md`), pass its checks, then come back.

**First, find the engine and read the reference:**

```
ENGINE="$(cd -P "<this skill's base directory>/../.." && pwd)"   # the craft3d folder this skill sits in: the cloned repo, or the installed plugin
[ -f "$ENGINE/METHOD.md" ] || ENGINE="$HOME/.claude/craft3d"       # the skill was installed on its own, without the engine
[ -f "$ENGINE/METHOD.md" ] || git clone --depth 1 https://github.com/yesith0106/craft3d "$ENGINE"   # so fetch the engine, once
cat "$ENGINE/references/cinematic.md"
```

Read `references/cinematic.md` in full before writing a film: how a frame is made, the rig's calls, how lamps and the reflection capture split the work, how to light chrome, satin and matte black, the shot structure that works, and the traps. Everything below is the order of work.

## The order of work

1. **Get the reference and write the plan.** Ask for a reference frame or film if none was given. Write the five lines (staging, camera, background, light, grade) and a shot list with times, and show the user before building. For a still that must match a photo, measure the photo: backdrop levels at the corners, where the glow sits, the angle and roll of the subject.
2. **Open the film file.** Every project has `src/model/film.js` (the starter works on any model). Start from the closest example: `examples/mercedes-w17/film.js` for a showroom film (tubes that strike, haze, fast cuts, an orbit; its render is `demos/mercedes-w17-film.mp4`, show it to the user as what a film looks like); `examples/v8/film.js` for a running mechanism in close-up; `examples/wooting80he/film.js` for a floating product still. A project scaffolded before the film rig existed needs `lib/cine.js` and `lib/textures.js` copied into `src/craft/`, the starter `template/src/model/film.js`, and the two film lines from `template/src/main.js` (the `window.FILM` guard in the loop and the import at the end).
3. **Frame first, cheaply.** `node "$ENGINE/tools/film.mjs" --project . --out film --still 0,48,96 --sub 8` and read `film/sheet.png`. Fix framing, cut order and timing here, where a pass takes seconds.
4. **Then light and materials**, on full-sample stills of one frame per shot, read at native size. Fix one named difference from the reference at a time.
5. **Then the film**: `--out film/clip.mp4` (run `npm run setup:film` in the engine once for ffmpeg). Read frames of the result.
6. **Report what was checked.** Stills, not the moving picture; which frames; what differs from the reference; which finishes were styled for the shot; what was not matched.

## Rules that save a round with the user

- **The reference's grammar, not a default.** A dark floor and a spotlight is a packshot. Build what the reference shows: its staging, lens, background, light and grade.
- **Metal is lit by what it reflects.** If chrome reads matte, the set is too even: darken the tent, harden the boxes, add strips. If satin reads plastic, the boxes are too small or too hard.
- **Surfaces need relief to read.** Smooth dark rubber is clay. Put the tread, the lettering and the grain in the shader before lighting it.
- **Score against the reference at the user's level of looking**, side by side, and say what is still different. Do not call a still done from the rig's numbers.
- **Keep the model honest.** The film may style finishes and hide a stand; it does not change dimensions or mechanisms. The viewer build (`npm run html`) must come out the same size as before: the rig loads on the dev server only.
