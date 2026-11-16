#!/usr/bin/env node
// Link the three commands into Claude Code: ~/.claude/skills/3d-model, wireframe and cinematic point at
// skills/<name> in this repo, so a `git pull` updates them. Run by `npm run setup`; safe to run again.
//   node tools/install.mjs [--dir ~/.claude/skills]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// installed as a plugin (/plugin install craft3d@craft3d): Claude Code already serves the commands from here
if (/[\\/]plugins[\\/](cache|marketplaces)[\\/]/.test(REPO)) {
  console.log('craft3d is installed as a plugin: its commands are already available, nothing to link.');
  process.exit(0);
}
const argv = process.argv.slice(2);
const dir = argv.includes('--dir') ? path.resolve(argv[argv.indexOf('--dir') + 1]) : path.join(os.homedir(), '.claude', 'skills');
fs.mkdirSync(dir, {recursive: true});
for (const name of ['3d-model', 'wireframe', 'cinematic']) {
  const src = path.join(REPO, 'skills', name);
  const dest = path.join(dir, name);
  let st = null;
  try {
    st = fs.lstatSync(dest);
  } catch {}
  if (st && !st.isSymbolicLink()) {
    console.error(`! ${dest} exists and is not a link; leaving it alone. Remove it and run again to install /${name}.`);
    continue;
  }
  if (st) fs.unlinkSync(dest);
  // a junction on Windows: a directory symlink there needs administrator rights or developer mode
  fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`/${name}  ${dest} -> ${src}`);
}
console.log('Restart Claude Code to pick up the commands.');
