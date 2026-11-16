#!/usr/bin/env node
// Render a project's film (src/model/film.js) on the real GPU, frame by frame, and encode it. Not real time: each
// frame is many renders averaged (lib/cine.js), so a second of film takes a minute or so.
//
//   node film.mjs --project ./my-model --out ./film/clip.mp4                 the whole film, 1920x1080
//   node film.mjs --project ./my-model --out ./film --still 0,48,96          frames 0, 48 and 96 as PNGs + sheet.png
//   node film.mjs --project ./my-model --out ./film/hero.png --still 0 --sub 512 --size 2160x2700     a hero still
//
//   --size 1920x1080   the frame (1080x1920 for vertical, 1080x1350 for a 4:5 still)
//   --sub 8            samples per frame, overriding the film's own: 4 to 8 to check framing, the film's count to finish
//   --still 0,48       render only these frames; no encode. A sheet of them is tiled for review
//   --every 12         with no --still: review every 12th frame as stills instead of rendering the film
//   --view 2           a debug layer instead of the picture (films with occlusion: 1 lamps, 2 reflections, 3 occlusion, 4 coverage)
//   --resume           keep frames already on disk (a long render that was interrupted)
//   --ffmpeg <path>    the encoder; else $FFMPEG, then `npm run setup:film` in the engine, then ffmpeg on the PATH
//   --crf 15           quality of the encode (lower = better and bigger; 20 for the web)
//   --query a=1&b=2    extra URL flags for the page
// The page must expose window.FILM (the template does at ?film=1, on the dev server only).
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
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
if (!args.project || !args.out) {
  console.error('usage: node film.mjs --project <dir> --out <clip.mp4 | still.png | dir> [--size 1920x1080] [--sub n] [--still 0,48] [--every n] [--view n] [--resume] [--ffmpeg path] [--crf 15]');
  process.exit(1);
}
const project = path.resolve(args.project);
const out = path.resolve(args.out);
const isFile = /\.(mp4|png)$/i.test(out);
const dir = isFile ? path.dirname(out) : out;
const [W, H] = String(args.size ?? '1920x1080').split('x').map(Number);
const sub = Number(args.sub) || undefined;
const view = Number(args.view ?? 0);
let stills = typeof args.still === 'string' ? args.still.split(',').map(Number) : null;
const framesDir = stills || args.every ? dir : path.join(dir, 'frames');
fs.mkdirSync(framesDir, {recursive: true});

const findFfmpeg = () => {
  for (const c of [args.ffmpeg, process.env.FFMPEG]) if (c && c !== true) return c;
  try {
    return require('ffmpeg-static');
  } catch {}
  return spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : null;
};

const port = 5900 + Math.floor(Math.random() * 90);
// run vite's own entry with node: 'npx' is npx.cmd on Windows, which spawn() cannot start without a shell
const server = spawn(process.execPath, [path.join(project, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort'], {cwd: project, stdio: ['ignore', 'pipe', 'pipe']});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('dev server did not start')), 20000);
  server.stdout.on('data', (d) => String(d).includes('Local') && (clearTimeout(t), res()));
  server.stderr.on('data', (d) => process.stderr.write(d));
});
const GPU = [...(process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan']), '--ignore-gpu-blocklist', '--enable-gpu', '--force_high_performance_gpu'];
const browser = await chromium.launch({executablePath: process.env.CHROMIUM || undefined, args: GPU});
const errors = [];
let ok = true;
try {
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`http://localhost:${port}/?hud=0&look=real&film=1${typeof args.query === 'string' ? '&' + args.query : ''}`);
  // the first run after a new import makes vite rebuild its dependency cache and reload the page: wait through it
  await page.waitForFunction(() => window.FILM?.ready, null, {timeout: 120000});
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const {frames: total, clip} = await page.evaluate(() => ({frames: window.FILM.frames, clip: window.FILM.clip}));
  if (!stills && args.every) stills = [...Array(total).keys()].filter((i) => i % Number(args.every) === 0);
  const list = stills ?? [...Array(total).keys()];
  const nameOf = (i) => (stills && isFile && list.length === 1 ? out : path.join(framesDir, `f${String(i).padStart(4, '0')}${view ? `-view${view}` : ''}.png`));
  console.log(`${gpu}\n${W}x${H}, ${clip.fps} fps, ${total} frames, ${sub ?? clip.sub} samples a frame; rendering ${list.length}`);
  if (/swiftshader|llvmpipe|software/i.test(gpu)) console.error('WARNING: software renderer; this will be very slow and some shading is not representative.');
  const t0 = Date.now();
  const written = [];
  for (const [k, i] of list.entries()) {
    const file = nameOf(i);
    written.push({file, name: `f${i}  t=${(i / clip.fps).toFixed(2)}s`});
    if (args.resume && fs.existsSync(file)) continue;
    const url = await page.evaluate(([n, s, v]) => window.FILM.frame(n, s, v), [i, sub, view]);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    if (k % 24 === 23 || k === list.length - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frame ${k + 1}/${list.length}  ${el.toFixed(0)} s  (${(el / (k + 1)).toFixed(1)} s a frame)`);
    }
  }
  if (stills) {
    if (written.length > 1) {
      // tile the stills into one labelled sheet, in the browser
      const cols = Math.min(written.length, W >= H ? 3 : 4), tw = W >= H ? 640 : 360, th = Math.round((tw * H) / W);
      const imgs = written.map((s) => ({name: s.name, src: 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64')}));
      const sheet = await browser.newPage({viewport: {width: 400, height: 300}});
      const data = await sheet.evaluate(
        async ({imgs, cols, tw, th}) => {
          const c = document.createElement('canvas');
          c.width = cols * tw;
          c.height = Math.ceil(imgs.length / cols) * th;
          const g = c.getContext('2d');
          g.font = '600 14px monospace';
          for (let i = 0; i < imgs.length; i++) {
            const im = new Image();
            im.src = imgs[i].src;
            await im.decode();
            const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
            g.drawImage(im, x, y, tw, th);
            g.fillStyle = 'rgba(0,0,0,.6)';
            g.fillRect(x, y, g.measureText(imgs[i].name).width + 20, 24);
            g.fillStyle = '#fff';
            g.fillText(imgs[i].name, x + 10, y + 17);
          }
          return c.toDataURL('image/png').split(',')[1];
        },
        {imgs, cols, tw, th},
      );
      fs.writeFileSync(path.join(dir, 'sheet.png'), Buffer.from(data, 'base64'));
      console.log(`sheet ${path.join(dir, 'sheet.png')}`);
    }
    console.log(written.map((s) => s.file).join('\n'));
  } else {
    const ffmpeg = findFfmpeg();
    const mp4 = isFile ? out : path.join(dir, 'film.mp4');
    if (!ffmpeg) {
      console.error(`No ffmpeg found, so the frames were left in ${framesDir}. Run "npm run setup:film" in the engine, or pass --ffmpeg <path>, and run again with --resume.`);
      ok = false;
    } else {
      // PNGs are full-range RGB; say so, and tag the result bt709, or players show it washed out or too dark
      const r = spawnSync(
        ffmpeg,
        ['-y', '-v', 'error', '-framerate', String(clip.fps), '-i', path.join(framesDir, 'f%04d.png'), '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(args.crf ?? 15), '-preset', 'slow', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', mp4],
        {stdio: 'inherit'},
      );
      ok = r.status === 0;
      console.log(ok ? `wrote ${mp4}  ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB` : 'ffmpeg failed');
    }
  }
} catch (e) {
  ok = false;
  console.error(e.message);
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) console.error('page errors:\n' + [...new Set(errors)].join('\n'));
process.exit(ok ? 0 : 1);
