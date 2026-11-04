// The craft3d viewer: loads src/model/model.js, lights it, orbits it, gives a slider to every input the model
// declares plus the paint-wear slider, and exposes window.VIEW so tools/shoot.mjs can drive and measure it.
//
// The model contract (src/model/model.js):
//   export const info = {name, description, stage: 'studio' | 'outdoor'};
//   export function build({stage, THREE}) {
//     return {
//       root,                      // an Object3D in METRES (build parts in mm under a group scaled 0.001)
//       params: [{key, label, min, max, step, value, unit}],   // the inputs that drive the pose
//       update(dt, t, p),          // pose everything from p (the current param values) and time
//       focus: [x, y, z], radius,  // what the camera frames, metres
//       probe() {},                // optional: numbers worth checking (contacts, lengths, clearances)
//       readout() {},              // optional: lines of live text for the panel (['RPM 3000', ...])
//       struts,                    // optional: makeStruts().list, so VIEW.check() can test their mounts
//     };
//   }
// URL options: ?stage=outdoor|studio  ?hud=0  ?damage=0.9
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createStage} from './craft/stage.js';
import {WEAR} from './craft/wear.js';
import {anchorGaps, floatingParts} from './craft/checks.js';
import * as MODEL from './model/model.js';

const q = new URLSearchParams(location.search);
const info = MODEL.info ?? {name: 'model'};
const stage = createStage({canvas: document.getElementById('c'), mode: q.get('stage') ?? info.stage ?? 'studio'});
stage.renderer.info.autoReset = false; // count every pass of a frame, not just the last
const model = MODEL.build({stage, THREE});
stage.scene.add(model.root);
const focus = new THREE.Vector3(...(model.focus ?? [0, 1, 0]));
const radius = model.radius ?? 1.5;
stage.follow(focus);

const {camera} = stage;
const controls = new OrbitControls(camera, stage.renderer.domElement);
controls.target.copy(focus);
controls.enableDamping = true;
controls.minDistance = radius * 0.4;
controls.maxDistance = radius * 12;
controls.maxPolarAngle = Math.PI * 0.495;

// views: azimuth from +Z (the model's front) toward +X, elevation, distance in radii
const VIEWS = {front: {az: 0, el: 6}, side: {az: 90, el: 4}, back: {az: 180, el: 8}, left: {az: -90, el: 4}, top: {az: 0.01, el: 85}, 34: {az: 38, el: 14}, low: {az: 28, el: -2, d: 2.3}, close: {az: 25, el: 10, d: 1.4}};
const setView = (v) => {
  const o = typeof v === 'string' ? VIEWS[v] : v;
  if (!o) throw new Error(`no view ${v}; have ${Object.keys(VIEWS)}`);
  const d = (o.d ?? 3.2) * radius;
  const az = THREE.MathUtils.degToRad(o.az);
  const el = THREE.MathUtils.degToRad(o.el);
  const t = o.target ? new THREE.Vector3(...o.target) : focus;
  controls.target.copy(t);
  camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
  camera.lookAt(t);
  controls.update();
};

// ------------------------------------------------------------------ panel
const p = {damage: Number(q.get('damage') ?? 0.45)};
// the paint-wear slider only for models that use worn materials (info.wear !== false)
const params = [...(info.wear === false ? [] : [{key: 'damage', label: 'paint wear', min: 0, max: 1, step: 0.01, value: p.damage}]), ...(model.params ?? [])];
const inputs = {};
document.getElementById('name').textContent = info.name;
document.getElementById('desc').textContent = info.description ?? '';
if (model.readout) document.getElementById('ui').classList.add('wide');
const box = document.getElementById('params');
for (const d of params) {
  p[d.key] = d.value;
  const l = document.createElement('label');
  const v = document.createElement('span');
  const i = document.createElement('input');
  Object.assign(i, {type: 'range', min: d.min, max: d.max, step: d.step ?? (d.max - d.min) / 200, value: d.value});
  const show = () => (v.textContent = `${(+p[d.key]).toFixed(2)}${d.unit ? ' ' + d.unit : ''}`);
  i.oninput = () => {
    p[d.key] = +i.value;
    show();
  };
  l.append(d.label ?? d.key, v, i);
  box.append(l);
  inputs[d.key] = {i, show};
  show();
}
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setView(name);
  document.getElementById('views').append(b);
}
if (q.get('hud') === '0') document.body.classList.add('nohud');
addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') document.body.classList.toggle('nohud');
  const k = {Digit1: 0.04, Digit2: 0.45, Digit3: 0.92}[e.code];
  if (k !== undefined) set('damage', k);
});
const set = (key, value) => {
  p[key] = value;
  if (inputs[key]) {
    inputs[key].i.value = value;
    inputs[key].show();
  }
};

// ------------------------------------------------------------------ loop
addEventListener('resize', () => stage.resize());
stage.resize();
setView(model.view ?? '34');
// compile every shader before the first frame so nothing stalls when it first comes into view
await stage.renderer.compileAsync(stage.scene, camera).catch(() => {});
let last = performance.now();
let t = 0;
let fps = 60;
let acc = 0;
let frames = 0;
let tier = 2;
const statsEl = document.getElementById('stats');
const readEl = document.getElementById('readout');
const loop = () => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  WEAR.uDamage.value = p.damage;
  model.update?.(dt, t, p);
  if (model.readout && readEl) readEl.textContent = model.readout().join('\n');

  controls.update();
  stage.renderer.info.reset();
  stage.render(dt);
  acc += dt;
  frames++;
  if (acc > 1) {
    fps = frames / acc;
    acc = 0;
    frames = 0;
    if (t > 3 && fps < 45 && tier > 0) stage.setTier(--tier);
    statsEl.textContent = `${fps.toFixed(0)} fps · tier ${tier} · ${stage.renderer.info.render.calls} draws · ${(stage.renderer.info.render.triangles / 1000).toFixed(0)}k tris`;
  }
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);

window.VIEW = {
  ready: true,
  THREE,
  stage,
  model,
  params: p,
  set,
  setView,
  damage: (v) => set('damage', v),
  probe: () => model.probe?.(),
  // geometry checks: parts touching nothing, actuator ends off their mounts
  check: () => ({floating: floatingParts(model.root), anchors: model.struts ? anchorGaps(model.struts) : []}),
  stats: () => ({fps, tier, draws: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles}),
};
