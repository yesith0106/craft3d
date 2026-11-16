#!/usr/bin/env node
// Scaffold a craft3d project: the viewer template, the library in src/craft/, and a model in src/model/.
//   node new.mjs <dir> [--example crane|mechanisms|v8|turbojet|wooting80he|mercedes-w17] [--no-install]
// crane (default): a hydraulic loader crane, the whole pattern in one file. mechanisms: gears, rack and pinion,
// slider-crank and a Jansen leg off one crank. v8: a running small-block V8. turbojet: an axial turbojet, drawn as
// a technical illustration (section cut, flow lines, exploded view). wooting80he: a keyboard built on the maker's
// published STEP, a blueprint with dimensions and a title block; VITE_LOOK=real npm run html builds it shaded.
// mercedes-w17: the 2026 Formula 1 car to scale, with its showroom film (src/model/film.js).
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, '..');
const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: node new.mjs <dir> [--example crane|mechanisms|v8|turbojet|wooting80he|mercedes-w17] [--no-install]');
  process.exit(1);
}
const dest = path.resolve(dir);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
  console.error(`${dest} is not empty`);
  process.exit(1);
}
fs.cpSync(path.join(SKILL, 'template'), dest, {recursive: true});
fs.cpSync(path.join(SKILL, 'lib'), path.join(dest, 'src', 'craft'), {recursive: true});
fs.cpSync(path.join(SKILL, 'tools', 'html.mjs'), path.join(dest, 'scripts', 'html.mjs'));
const ex = argv.includes('--example') ? argv[argv.indexOf('--example') + 1] : 'crane';
if (ex !== 'crane') {
  const src = path.join(SKILL, 'examples', ex);
  if (!fs.existsSync(src)) {
    console.error(`unknown example ${ex}`);
    process.exit(1);
  }
  // the starter film (src/model/film.js) works on any model: keep it unless the example brings its own
  const film = fs.readFileSync(path.join(dest, 'src', 'model', 'film.js'));
  fs.rmSync(path.join(dest, 'src', 'model'), {recursive: true, force: true});
  fs.cpSync(src, path.join(dest, 'src', 'model'), {recursive: true});
  if (!fs.existsSync(path.join(dest, 'src', 'model', 'film.js'))) fs.writeFileSync(path.join(dest, 'src', 'model', 'film.js'), film);
}
if (!argv.includes('--no-install')) execSync('npm install --no-audit --no-fund', {cwd: dest, stdio: 'inherit'});
console.log(`\n${dest}\n  npm run dev            open the viewer\n  npm run html           one self-contained HTML file in dist/ (opens from disk)\n  src/model/model.js     your model\n  src/craft/             the library (shapes, rig, ink, materials, wear, props, stage, textures, cine)\n  src/model/film.js      its film: node ${path.join(SKILL, 'tools', 'film.mjs')} --project . --out film/clip.mp4`);
