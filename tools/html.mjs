#!/usr/bin/env node
// Fold a Vite build into ONE self-contained HTML file: every script and stylesheet inlined, so the page opens
// straight from disk (file://), mails as an attachment, and uploads anywhere. Run after `vite build`:
//   node scripts/html.mjs [dist] [--out name.html]
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dist = path.resolve(argv.find((a) => !a.startsWith('--')) ?? 'dist');
const outName = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'model.html';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const read = (src) => fs.readFileSync(path.join(dist, src.replace(/^\.?\//, '')), 'utf8');
// modulepreload hints point at files that won't exist next to the single page
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, src) => `<style>${read(src)}</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = read(src).replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
const out = path.join(dist, outName);
fs.writeFileSync(out, html);
console.log(`${out}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
