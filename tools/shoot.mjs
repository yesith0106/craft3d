#!/usr/bin/env node
// Look at a model the way a person would, headless, on the real GPU: start the project's dev server, run a plan of
// steps (camera views, key presses, waits, page code, frame-by-frame measurements), save every screenshot, tile them
// into one contact sheet, and print what was measured plus every console error.
//
//   node shoot.mjs --project ./my-model --plan plan.json [--out ./shots] [--size 1440x900]
//   node shoot.mjs --url http://localhost:5173 --plan '[{"views":["front","side","back","34"]}]'
//
// Plan steps (an array, run in order; any step may combine fields):
//   {"wait": 800}                                    ms
//   {"eval": "VIEW.set('speed', 1.2)"}               run code in the page
//   {"down": ["KeyW", "ShiftLeft"]} {"up": [...]}    hold / release keys (KeyboardEvent.code names)
//   {"shot": "walk-side"}                            screenshot
//   {"views": ["front", "side", "34", {"az": 40, "el": 10, "d": 4}]}   VIEW.setView each, settle, screenshot each
//   {"sample": {"expr": "VIEW.probe()", "frames": 120, "label": "feet"}}  evaluate expr once per frame, save JSON
//   {"damage": 0.92}                                 VIEW.damage(v)
// The page must expose window.VIEW (the template does); views and damage need it, plain key/eval plans don't.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '..', 'node_modules', 'x.js'));
const {chromium} = require('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const out = path.resolve(args.out ?? 'shots');
fs.mkdirSync(out, {recursive: true});
const [W, H] = String(args.size ?? '1440x900').split('x').map(Number);
const planSrc = args.plan ?? '[{"views":["34","front","side","back"]}]';
const plan = JSON.parse(fs.existsSync(planSrc) ? fs.readFileSync(planSrc, 'utf8') : planSrc);

let server;
let url = args.url;
if (!url && args.project) {
  const port = 5600 + Math.floor(Math.random() * 300);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {cwd: path.resolve(args.project), stdio: ['ignore', 'pipe', 'pipe']});
  url = `http://localhost:${port}/`;
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('dev server did not start')), 20000);
    server.stdout.on('data', (d) => String(d).includes('Local') && (clearTimeout(t), res()));
    server.stderr.on('data', (d) => process.stderr.write(d));
  });
}
if (!url) {
  console.error('give --project <dir> or --url <url>');
  process.exit(1);
}
if (args.query) url += (url.includes('?') ? '&' : '?') + args.query;

const GPU = [...(process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan']), '--ignore-gpu-blocklist', '--enable-gpu', '--force_high_performance_gpu'];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: GPU});
const page = await browser.newPage({viewport: {width: W, height: H}});
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.VIEW?.ready || document.readyState === 'complete', null, {timeout: 30000});
await page.waitForTimeout(Number(args.settle ?? 1500));
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

const shots = [];
const measured = {};
let n = 0;
const snap = async (name) => {
  const file = path.join(out, `${String(n++).padStart(2, '0')}-${String(name).replace(/[^\w.-]+/g, '_')}.png`);
  await page.screenshot({path: file});
  shots.push({file, name: String(name)});
};
for (const s of plan) {
  if (s.down) for (const k of s.down) await page.keyboard.down(k);
  if (s.up) for (const k of s.up) await page.keyboard.up(k);
  if (s.damage !== undefined) await page.evaluate((v) => window.VIEW.damage(v), s.damage);
  if (s.eval) await page.evaluate(s.eval);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.views) {
    for (const v of s.views) {
      await page.evaluate((v) => window.VIEW.setView(v), v);
      await page.waitForTimeout(s.settle ?? 500);
      await snap(typeof v === 'string' ? v : `az${v.az}-el${v.el}`);
    }
  }
  if (s.sample) {
    const {expr, frames = 60, label = `sample${Object.keys(measured).length}`} = s.sample;
    measured[label] = await page.evaluate(
      ({expr, frames}) =>
        new Promise((res) => {
          const rows = [];
          const f = new Function(`return (${expr});`);
          const tick = () => {
            rows.push(f());
            if (rows.length < frames) requestAnimationFrame(tick);
            else res(rows);
          };
          requestAnimationFrame(tick);
        }),
      {expr, frames},
    );
    fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(measured[label]));
  }
  if (s.shot) await snap(s.shot);
}
const stats = await page.evaluate(() => (window.VIEW?.stats ? window.VIEW.stats() : null));

// contact sheet: tile every screenshot with its name, in the browser (no ffmpeg needed)
if (shots.length > 1) {
  const cols = Number(args.cols ?? Math.min(3, shots.length));
  const tw = 720;
  const th = Math.round((tw * H) / W);
  const imgs = shots.map((s) => ({name: s.name, src: 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64')}));
  const sheet = await browser.newPage({viewport: {width: cols * tw, height: Math.ceil(imgs.length / cols) * th}});
  const data = await sheet.evaluate(
    async ({imgs, cols, tw, th}) => {
      const c = document.createElement('canvas');
      c.width = cols * tw;
      c.height = Math.ceil(imgs.length / cols) * th;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < imgs.length; i++) {
        const im = new Image();
        im.src = imgs[i].src;
        await im.decode();
        const x = (i % cols) * tw;
        const y = Math.floor(i / cols) * th;
        g.drawImage(im, x, y, tw, th);
        g.fillStyle = 'rgba(0,0,0,.6)';
        g.fillRect(x, y, g.measureText(imgs[i].name).width + 40, 26);
        g.fillStyle = '#fff';
        g.font = '600 15px monospace';
        g.fillText(imgs[i].name, x + 10, y + 18);
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    {imgs, cols, tw, th},
  );
  fs.writeFileSync(path.join(out, 'sheet.png'), Buffer.from(data, 'base64'));
}
await browser.close();
server?.kill();

console.log(JSON.stringify({gpu, shots: shots.map((s) => s.file), sheet: shots.length > 1 ? path.join(out, 'sheet.png') : null, stats, measured: Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, `${v.length} rows -> ${path.join(out, k + '.json')}`])), errors}, null, 2));
if (/swiftshader|llvmpipe|software/i.test(gpu)) console.error('WARNING: software renderer; frame rates and some shading are not representative.');
