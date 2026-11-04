#!/usr/bin/env node
// Scaffold a craft3d project: the viewer template, the library in src/craft/, and a model in src/model/.
//   node new.mjs <dir> [--no-install]
// The starter model is a hydraulic loader crane; replace src/model/model.js with yours.
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.join(HERE, '..');
const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: node new.mjs <dir> [--no-install]');
  process.exit(1);
}
const dest = path.resolve(dir);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
  console.error(`${dest} is not empty`);
  process.exit(1);
}
fs.cpSync(path.join(SKILL, 'template'), dest, {recursive: true});
fs.cpSync(path.join(SKILL, 'lib'), path.join(dest, 'src', 'craft'), {recursive: true});
if (!argv.includes('--no-install')) execSync('npm install --no-audit --no-fund', {cwd: dest, stdio: 'inherit'});
console.log(`\n${dest}\n  npm run dev            open the viewer\n  src/model/model.js     your model\n  src/craft/             the library (wear, shapes, rig, props, stage, textures)`);
