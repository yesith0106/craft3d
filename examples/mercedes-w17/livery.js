// The W17 livery. The body paint is three canvases projected in the car's own frame (plan view, left side, right
// side) and chosen per pixel by which way the surface faces, so the paint is crisp at any distance and needs no UVs.
// Black is bare carbon on this car: anything dark gets a 2x2 twill weave under the clearcoat. Wing, endplate and
// tyre markings are separate decals (decal()). Positions were measured off Mercedes' launch renders (top view
// 3.09 mm/px, side view 3.8 mm/px); wordmarks are set in system fonts, not the sponsors' own logotypes.
import * as THREE from 'three';
import {ZF} from './geo.js';

export const COL = {
  black: '#08090a',
  carbon: '#1c1d1e',
  silver: '#989ca1',
  teal: '#00a59c',
  white: '#f2f2ee',
};
export const MAP = {S0: -1200, S1: 3500, XH: 740, H0: 60, H1: 1080, W: 4096};
const K = MAP.W / (MAP.S1 - MAP.S0); // px per mm
const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const WIDE = '"Arial Black", "Segoe UI Black", Arial, sans-serif';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const poly = (g, pts, fill) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
};
/** the three-pointed star: three slim blades from the centre */
export function star3(g, cx, cy, r, fill, {ring = false, rot = -Math.PI / 2, lw = r * 0.09} = {}) {
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = rot + (k * Math.PI) / 3;
    const rr = k % 2 ? r * (ring ? 0.13 : 0.2) : r * (ring ? 0.93 : 1);
    k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (ring) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.lineWidth = lw;
    g.strokeStyle = fill;
    g.stroke();
  }
}
/** the PETRONAS oil-drop emblem, simplified: a drop with a ring and a tail (teal) */
export function drop(g, cx, cy, r, fill, bg) {
  g.save();
  const hole = () => (g.globalCompositeOperation = bg ? 'source-over' : 'destination-out');
  const ink = () => (g.globalCompositeOperation = 'source-over');
  bg = bg ?? null;
  g.translate(cx, cy);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(-r * 0.2, -r * 1.15);
  g.lineTo(r * 0.75, -r * 1.15);
  g.lineTo(r * 0.62, -r * 0.2);
  g.arc(0, r * 0.25, r * 0.74, -0.55, Math.PI * 1.22, false);
  g.closePath();
  g.fill();
  g.fillStyle = bg ?? '#000';
  hole();
  g.beginPath();
  g.arc(-r * 0.02, r * 0.27, r * 0.46, 0, Math.PI * 2);
  g.fill();
  ink();
  g.fillStyle = fill;
  g.beginPath();
  g.arc(-r * 0.02, r * 0.27, r * 0.27, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = bg ?? '#000';
  hole();
  g.beginPath();
  g.moveTo(r * 0.05, -r * 0.92);
  g.lineTo(r * 0.5, -r * 0.92);
  g.lineTo(r * 0.42, -r * 0.38);
  g.closePath();
  g.fill();
  ink();
  g.restore();
}
/** the four-square Microsoft mark */
export function msLogo(g, x, y, s) {
  const q = s * 0.47, o = s * 0.53;
  [['#f25022', 0, 0], ['#7fba00', o, 0], ['#00a4ef', 0, o], ['#ffb900', o, o]].forEach(([c, dx, dy]) => {
    g.fillStyle = c;
    g.fillRect(x + dx, y + dy, q, q);
  });
}
const text = (g, str, {size, font = SANS, weight = 700, fill = COL.white, italic = false, align = 'center', stroke = null, lw = 0, spacing = 0, base = 'middle'}) => {
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = base;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.strokeText(str, 0, 0);
  }
  if (fill) {
    g.fillStyle = fill;
    g.fillText(str, 0, 0);
  }
  if ('letterSpacing' in g) g.letterSpacing = '0px';
};
/** an outlined race number in the team's style: a silver outline round a dark digit */
const number = (g, str, size, {outline = COL.silver, inner = COL.black, lw = size * 0.09} = {}) => {
  text(g, str, {size, font: WIDE, weight: 900, fill: null, stroke: outline, lw: lw * 2.6});
  text(g, str, {size, font: WIDE, weight: 900, fill: inner, stroke: inner, lw: lw * 0.6});
  text(g, str, {size: size, font: WIDE, weight: 900, fill: null, stroke: outline, lw: lw * 0.001});
};

// ------------------------------------------------------------------ the plan-view canvas
// drawn in car mm: (s, x) with x = +left; the canvas's top edge is the car's right side (like the launch top view)
function drawTop(c, L) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = COL.black;
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(K, 0, 0, K, -MAP.S0 * K, MAP.XH * K);
  const S = COL.silver;
  // silver: the whole nose and chassis top, flowing out onto the sidepod tops
  g.fillStyle = S;
  g.fillRect(MAP.S0, -MAP.XH, 3000 - MAP.S0, 2 * MAP.XH);
  // the sidepod's leading lip stays carbon, with the teal band at the front of the silver
  for (const sg of [1, -1]) {
    poly(g, [[930, sg * 345], [930, sg * 740], [1190, sg * 740], [1190, sg * 400], [1150, sg * 345]], COL.black);
    poly(g, [[1150, sg * 400], [1150, sg * 740], [1200, sg * 740], [1200, sg * 420], [1420, sg * 372], [1420, sg * 345], [1190, sg * 352]], COL.teal);
    // the silver top ends on a raked line; four black bars cut it, swept back outboard. [photo] top view: each bar
    // measured at |x| = 372 and |x| = 650 (s from, s to), extended to the inner edge and past the shoulder
    const line = (a, b2, x) => a + ((b2 - a) * (x - 372)) / 278;
    const rake = (a, b2, c, d) => [[line(a, c, 300), sg * 300], [line(a, c, 740), sg * 740], [line(b2, d, 740), sg * 740], [line(b2, d, 300), sg * 300]];
    poly(g, rake(2377, 3600, 2591, 3600), COL.black);
    for (const [a0, a1, b0, b1] of [[1550, 1640, 1640, 1747], [1854, 1937, 1985, 2068], [2068, 2139, 2234, 2317], [2246, 2305, 2448, 2508]]) poly(g, rake(a0, a1, b0, b1), COL.black);
    // the black band between cockpit and sidepod (TeamViewer sits on it, on the side canvas)
    poly(g, [[1180, sg * 318], [1500, sg * 300], [2900, sg * 300], [2900, sg * 368], [1500, sg * 368], [1250, sg * 372]], COL.black);
  }
  for (const sg of [1, -1]) {
    g.fillStyle = COL.teal;
    g.beginPath();
    for (let s = 1150; s <= 2760; s += 30) g.lineTo(s, sg * (L.podEdge(s) + 30));
    for (let s = 2760; s >= 1150; s -= 30) g.lineTo(s, sg * (L.podEdge(s) - 26 - 44 * Math.min(1, Math.max(0, (2760 - s) / 1600))));
    g.fill();
  }
  // cockpit surround, halo base and everything behind it: carbon
  g.fillStyle = COL.black;
  g.beginPath();
  g.moveTo(905, 0);
  g.bezierCurveTo(960, 150, 1040, 250, 1200, 318);
  g.lineTo(3500, 318);
  g.lineTo(3500, -318);
  g.lineTo(1200, -318);
  g.bezierCurveTo(1040, -250, 960, -150, 905, 0);
  g.fill();
  // teal ring round the cockpit opening's front (the launch car's cockpit rim accent)
  g.strokeStyle = COL.teal;
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(1420, -252);
  g.bezierCurveTo(1180, -250, 1030, -160, 1012, 0);
  g.bezierCurveTo(1030, 160, 1180, 250, 1420, 252);
  g.stroke();
  // stars over the engine cover
  starField(g, (s, q) => [s, q], 2380, 3350, -300, 300, 11);

  // nose logos: read from the front, so the type runs across the car
  const at = (s, x, fn, rot = Math.PI / 2) => {
    g.save();
    g.translate(s, x);
    g.rotate(rot);
    fn();
    g.restore();
  };
  const D = '#101114';
  at(-1078, 0, () => star3(g, 0, 0, 40, D, {ring: true}));
  at(-962, 0, () => {
    poly(g, [[-42, -17], [42, -17], [26, 17], [-42, 17]], D);
    text(g, 'SAP', {size: 27, fill: S, weight: 900});
  });
  at(-890, 0, () => text(g, 'AKKODiS', {size: 24, fill: D, weight: 800, spacing: 1}));
  at(-828, 0, () => text(g, 'PIRELLI', {size: 22, fill: D, weight: 900, italic: true, spacing: 1}));
  at(-748, 0, () => text(g, 'INEOS', {size: 40, fill: D, weight: 300, spacing: 3}));
  at(-655, 0, () => {
    g.fillStyle = D; // the falcon, as a swept wing shape
    g.beginPath();
    g.moveTo(-46, -12);
    g.quadraticCurveTo(0, -34, 50, -30);
    g.quadraticCurveTo(20, -18, 8, -4);
    g.quadraticCurveTo(-10, -18, -46, -12);
    g.fill();
    g.translate(0, 14);
    text(g, 'CROWDSTRIKE', {size: 15, fill: D, weight: 800, spacing: 0.5});
  });
  at(-285, 0, () => drop(g, 0, 0, 58, COL.teal, S));
  at(70, 0, () => number(g, L.number, 150, {outline: D, inner: S, lw: 9}));
  // the driver-cooling NACA duct ahead of the cockpit [reg] RV-DRI-COOL XA 100..525
  g.fillStyle = '#0a0a0b';
  g.beginPath();
  g.moveTo(318, 0);
  g.bezierCurveTo(350, -34, 400, -52, 446, -50);
  g.lineTo(446, 50);
  g.bezierCurveTo(400, 52, 350, 34, 318, 0);
  g.fill();
  at(648, 0, () => text(g, 'PETRONAS', {size: 44, fill: D, weight: 900, spacing: 1}));
  at(575, 0, () => text(g, 'Syntium', {size: 78, fill: D, weight: 700, italic: true}));
  g.setTransform(1, 0, 0, 1, 0, 0);
}

function starField(g, map, s0, s1, q0, q1, seed, size = [26, 46], skip = null) {
  let sd = seed;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const rows = 7, pitch = 112;
  for (let i = 0; s0 + i * pitch * 0.87 < s1; i++)
    for (let j = 0; j < rows; j++) {
      const u = i / Math.max(1, (s1 - s0) / (pitch * 0.87));
      const s = s0 + i * pitch * 0.87 + (rnd() - 0.5) * 8;
      const q = q0 + ((j + (i % 2) * 0.5 + 0.25) / rows) * (q1 - q0) + (rnd() - 0.5) * 8;
      const keep = rnd();
      if (keep > 0.35 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.15))) continue; // sparse at the front edge, dense mid, thinning aft
      if (skip && skip(s, q)) continue;
      const [x, y] = map(s, q);
      const r = size[0] + (size[1] - size[0]) * (0.35 + 0.65 * rnd()) * (0.6 + 0.4 * Math.sin(Math.PI * u));
      star3(g, x, y, r * 0.72, rnd() > 0.3 ? '#b9bdc1' : '#7d8185', {rot: -Math.PI / 2});
    }
}

// ------------------------------------------------------------------ the side canvases
// drawn in car mm: (s, h). mir = the right-hand side: same geometry, type mirrored so it reads from that side
function drawSide(c, L, mir) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = COL.black;
  g.fillRect(0, 0, c.width, c.height);
  g.setTransform(K, 0, 0, -K, -MAP.S0 * K, MAP.H1 * K);
  const S = COL.silver;
  const at = (s, h, fn, rot = 0) => {
    g.save();
    g.translate(s, h);
    g.scale(mir ? -1 : 1, -1);
    g.rotate(mir ? rot : -rot);
    fn();
    g.restore();
  };
  const top = L.topH;
  // nose and chassis: silver above the teal line, carbon below
  const edge = (s) => top(s) - (s < 300 ? 26 + 30 * Math.max(0, (s + 1150) / 1450) : 56);
  const tw = (s) => 12 + 22 * Math.min(1, Math.max(0, (s + 1150) / 1450));
  g.fillStyle = S;
  g.beginPath();
  g.moveTo(-1200, 1080);
  for (let s = -1200; s <= 1000; s += 25) g.lineTo(s, edge(s));
  g.lineTo(1000, 1080);
  g.fill();
  g.fillStyle = COL.teal;
  g.beginPath();
  for (let s = -1200; s <= 960; s += 25) g.lineTo(s, edge(s));
  for (let s = 960; s >= -1200; s -= 25) g.lineTo(s, edge(s) - tw(s) * (s > 800 ? (960 - s) / 160 : 1));
  g.fill();
  // the silver AMG panel on the chassis side, pointed at the front, raked at the back
  poly(g, [[205, 566], [300, 598], [850, 598], [800, 506], [330, 506]], S);
  at(560, 552, () => {
    const D = '#101114';
    for (let i = 0; i < 4; i++) poly(g, [[-150 + i * 17, 19], [-139 + i * 17, 19], [-126 + i * 17, -19], [-137 + i * 17, -19]], D);
    g.translate(42, 1);
    text(g, 'AMG', {size: 50, fill: D, weight: 900, font: WIDE, italic: true, spacing: 5});
  });
  at(915, 700, () => text(g, 'nu', {size: 54, fill: COL.white, weight: 800}));
  at(-520, top(-520) - 104, () => text(g, 'Einhell', {size: 46, fill: COL.white, weight: 900, italic: true}));

  // sidepod: the teal sweep from the shoulder at the inlet down to the waist, thinning to a point
  const sw = [];
  const th = [];
  for (let s = 1000; s <= 2760; s += 40) {
    const k = Math.min(1, Math.max(0, (2760 - s) / 1600));
    th.push(8 + 58 * k);
    sw.push([s, L.shoulderH(s) + 14 - th[th.length - 1] / 2]);
  }
  const sweep = () => {
    g.fillStyle = COL.teal;
    g.beginPath();
    sw.forEach(([s, h], i) => (i ? g.lineTo(s, h + th[i] / 2) : g.moveTo(s, h + th[i] / 2)));
    for (let i = sw.length - 1; i >= 0; i--) g.lineTo(sw[i][0], sw[i][1] - th[i] / 2);
    g.fill();
  };
  // the silver bars of the sidepod top carry on down the flank, raked forward toward the bottom like italics, until
  // the teal sweep cuts them off. Their shoulder positions are the plan view's bars at the shoulder line.
  const sweepAt = (s) => {
    let i = 0;
    while (i < sw.length - 2 && s > sw[i + 1][0]) i++;
    return sw[i][1] + ((sw[i + 1][1] - sw[i][1]) * (s - sw[i][0])) / (sw[i + 1][0] - sw[i][0]);
  };
  void sweepAt;
  sweep();
  // sponsors, where the launch car carries them
  at(1905, 398, () => text(g, 'PETRONAS', {size: 122, fill: COL.white, weight: 900, font: SANS, spacing: 3}));
  at(2040, 700, () => {
    g.fillStyle = COL.white;
    g.beginPath();
    g.roundRect(-226, -23, 46, 46, 8);
    g.fill();
    g.fillStyle = COL.black;
    poly(g, [[-218, 0], [-207, -8], [-207, 8]], COL.black);
    poly(g, [[-188, 0], [-199, -8], [-199, 8]], COL.black);
    g.translate(28, 2);
    text(g, 'TeamViewer', {size: 57, fill: COL.white, weight: 700});
  });
  at(2265, 786, () => {
    text(g, 'SOLERA', {size: 50, fill: COL.white, weight: 900, italic: true, spacing: 3});
    for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) g.fillRect(sg * 150 - (sg < 0 ? 44 : 0), -15 + i * 11, 44, 6);
  });
  at(2090, 928, () => {
    msLogo(g, -235, -40, 80);
    g.translate(52, 0);
    text(g, 'Microsoft', {size: 78, fill: COL.white, weight: 600});
  });
  starField(g, (s, q) => [s, q], 2400, 3180, 500, 905, 23, [34, 62], (s, q) => s > 2900 && q > 690 && q < 850);
  at(3050, 770, () => number(g, L.number, 128, {outline: '#c9cdd0', inner: COL.black, lw: 8}));
  at(3075, 548, () => text(g, 'Mercedes-Benz', {size: 22, fill: '#c9cdd0', weight: 500, font: 'Georgia, "Times New Roman", serif'}));
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** the three projected canvases as textures; redraw() repaints them (driver number change) */
export function makeLivery(L) {
  const top = mk(MAP.W, Math.round(2 * MAP.XH * K));
  const sideL = mk(MAP.W, Math.round((MAP.H1 - MAP.H0) * K));
  const sideR = mk(MAP.W, sideL.height);
  const tex = [top, sideL, sideR].map((c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });
  const redraw = (opts = {}) => {
    Object.assign(L, opts);
    drawTop(top, L);
    drawSide(sideL, L, false);
    drawSide(sideR, L, true);
    tex.forEach((t) => (t.needsUpdate = true));
  };
  redraw();
  return {top: tex[0], sideL: tex[1], sideR: tex[2], redraw, canvases: {top, sideL, sideR}};
}

/**
 * The body material: clearcoated paint whose colour comes from the projected livery (livery != null), or plain
 * clearcoated carbon. Dark pixels get the twill weave; silver pixels turn metallic (flake paint).
 * The geometry may carry `shade` (0 = matt black: duct and cockpit interiors).
 */
export function bodyMaterial(livery, {gloss = 1, color = COL.carbon, weave = 1, shade = false, rough = 0.3} = {}) {
  const m = new THREE.MeshPhysicalMaterial({color: livery ? '#ffffff' : color, roughness: rough, metalness: 0, clearcoat: 0.85 * gloss, clearcoatRoughness: 0.12, envMapIntensity: 1});
  m.defines = {...(m.defines ?? {})};
  if (livery) m.defines.LIVERY = 1;
  if (shade) m.defines.HAS_SHADE = 1;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTop: {value: livery?.top ?? null}, uSideL: {value: livery?.sideL ?? null}, uSideR: {value: livery?.sideR ?? null},
      uMap: {value: new THREE.Vector4(MAP.S0, MAP.S1 - MAP.S0, MAP.XH, ZF)}, uMapH: {value: new THREE.Vector2(MAP.H0, MAP.H1 - MAP.H0)},
      uWeave: {value: weave},
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef HAS_SHADE\nattribute float shade;\n#endif\nvarying vec3 vOP;\nvarying vec3 vON;\nvarying float vShade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;\nvON = normal;\n#ifdef HAS_SHADE\nvShade = shade;\n#else\nvShade = 1.0;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOP;
varying vec3 vON;
varying float vShade;
uniform sampler2D uTop, uSideL, uSideR;
uniform vec4 uMap;
uniform vec2 uMapH;
uniform float uWeave;
// 2x2 twill: x = brightness of the tow, y = 1 on a warp tow
vec2 twill(vec2 p) {
  vec2 c = floor(p);
  float k = mod(c.x + c.y, 4.0);
  float warp = step(k, 1.5);
  vec2 f = fract(p);
  float a = mix(f.y, f.x, warp);
  float b = 0.55 + 0.45 * sin(a * 3.14159);
  return vec2(b, warp);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 oN = normalize(vON);
float wCarbon = uWeave, wSilver = 0.0;
vec3 baseCol = diffuseColor.rgb;
#ifdef LIVERY
{
  float s = uMap.w - vOP.z;
  float u = (s - uMap.x) / uMap.y;
  vec3 cT = texture2D(uTop, vec2(u, 1.0 - (vOP.x + uMap.z) / (2.0 * uMap.z))).rgb;
  float v = (vOP.y - uMapH.x) / uMapH.y;
  vec3 cL = texture2D(uSideL, vec2(u, v)).rgb;
  vec3 cR = texture2D(uSideR, vec2(u, v)).rgb;
  float ax = abs(oN.x);
  vec3 col = vec3(0.0025);
  // the engine cover and cockpit flanks always take the side view: their type is read from the side on the real car
  bool flank = s > 1560.0 && abs(vOP.x) < 345.0 && vOP.y > 655.0 && ax > 0.1;
  if ((flank || (ax > oN.y * 1.7 && ax > 0.2)) && oN.y > -0.82) col = oN.x > 0.0 ? cL : cR;
  else if (oN.y > -0.3) col = cT;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  wCarbon = 1.0 - smoothstep(0.004, 0.02, lum);
  wSilver = smoothstep(0.2, 0.34, lum) * (1.0 - smoothstep(0.06, 0.16, sat));
  baseCol = mix(col, vec3(0.011, 0.0115, 0.0125), wCarbon);
}
#endif
float tw = 1.0, twWarp = 0.5;
{
  vec3 an = abs(oN);
  vec2 q = an.y > an.x && an.y > an.z ? vOP.xz : (an.x > an.z ? vOP.zy : vOP.xy);
  q = (q + q.yx * vec2(1.0, -1.0)) * 0.7071 / 2.4; // tows at 45 degrees, 2.4 mm pitch
  vec2 t2 = twill(q);
  float fade = clamp(1.0 - max(fwidth(q.x), fwidth(q.y)) * 1.1, 0.0, 1.0) * wCarbon;
  tw = mix(1.0, 0.45 + 1.1 * t2.x * mix(0.75, 1.25, t2.y), fade);
  twWarp = mix(0.5, t2.y, fade);
  diffuseColor.rgb = baseCol * tw;
}
diffuseColor.rgb *= mix(0.25, 1.0, vShade);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, roughnessFactor + 0.04 + 0.16 * twWarp, wCarbon);
roughnessFactor = mix(roughnessFactor, 0.44, wSilver);
roughnessFactor = mix(0.9, roughnessFactor, vShade);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.62, wSilver);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= vShade * mix(1.0, 0.75, wCarbon);
#endif`);
  };
  m.customProgramCacheKey = () => 'w17-body-' + (livery ? 'L' : 'P') + (m.defines.HAS_SHADE ? 'S' : '');
  return m;
}

/** a decal: a transparent canvas texture for a patch laid just above a surface. draw(g, w, h) paints in px */
export function decalTexture(w, h, draw) {
  const c = mk(w, h);
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}
export const decalMaterial = (tex, {rough = 0.35} = {}) =>
  new THREE.MeshPhysicalMaterial({map: tex, transparent: true, alphaTest: 0.02, roughness: rough, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15, side: THREE.DoubleSide, depthWrite: false});

/** word decals used on wings, endplates and boards */
export const WORDS = {
  teamviewer: (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.fillStyle = COL.white;
    g.beginPath();
    g.roundRect(-w * 0.47, -h * 0.36, h * 0.72, h * 0.72, h * 0.12);
    g.fill();
    poly(g, [[-w * 0.47 + h * 0.1, 0], [-w * 0.47 + h * 0.3, -h * 0.14], [-w * 0.47 + h * 0.3, h * 0.14]], COL.black);
    poly(g, [[-w * 0.47 + h * 0.62, 0], [-w * 0.47 + h * 0.42, -h * 0.14], [-w * 0.47 + h * 0.42, h * 0.14]], COL.black);
    g.translate(h * 0.42, h * 0.03);
    text(g, 'TeamViewer', {size: h * 0.78, fill: COL.white, weight: 700});
  },
  syntium: (g, w, h) => {
    g.translate(w / 2, h * 0.24);
    text(g, 'PETRONAS', {size: h * 0.3, fill: COL.white, weight: 900, spacing: 2});
    g.translate(0, h * 0.42);
    text(g, 'Syntium', {size: h * 0.56, fill: COL.white, weight: 700, italic: true});
  },
  petronas: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'PETRONAS', {size: h * 0.92, fill: COL.white, weight: 900, spacing: h * 0.03});
  },
  crowdstrike: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'CROWDSTRIKE', {size: h * 0.8, fill: COL.white, weight: 900, italic: true, spacing: h * 0.04});
  },
  snapdragon: (g, w, h) => {
    g.fillStyle = COL.white;
    g.beginPath();
    g.arc(h * 0.5, h * 0.5, h * 0.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = COL.black;
    g.lineWidth = h * 0.1;
    g.beginPath();
    g.arc(h * 0.5, h * 0.4, h * 0.13, Math.PI * 0.1, Math.PI * 1.5);
    g.stroke();
    g.beginPath();
    g.arc(h * 0.5, h * 0.62, h * 0.13, Math.PI * 1.1, Math.PI * 2.5);
    g.stroke();
    g.translate(h * 1.05 + (w - h * 1.05) / 2, h * 0.52);
    text(g, 'Snapdragon', {size: h * 0.62, fill: COL.white, weight: 600});
  },
  primax: (g, w, h) => {
    g.translate(w / 2, h * 0.27);
    text(g, 'PETRONAS', {size: h * 0.36, fill: COL.white, weight: 900, spacing: 1});
    g.translate(0, h * 0.44);
    text(g, 'PRIMAX', {size: h * 0.5, fill: COL.white, weight: 900, italic: true, spacing: 2});
  },
  iwc: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'IWC', {size: h * 0.95, fill: COL.white, weight: 500, font: 'Georgia, "Times New Roman", serif', spacing: h * 0.04});
  },
  microsoft: (g, w, h) => {
    msLogo(g, h * 0.08, h * 0.12, h * 0.76);
    g.translate(h * 1.0 + (w - h * 1.0) / 2, h * 0.52);
    text(g, 'Microsoft', {size: h * 0.66, fill: COL.white, weight: 600});
  },
  signify: (g, w, h) => {
    g.strokeStyle = COL.white;
    g.lineWidth = h * 0.09;
    g.beginPath();
    g.arc(h * 0.5, h * 0.5, h * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.save();
    g.translate(h * 0.5, h * 0.53);
    text(g, 'S', {size: h * 0.5, fill: COL.white, weight: 900});
    g.restore();
    g.translate(h * 0.95 + (w - h * 0.95) / 2, h * 0.52);
    text(g, 'ignify', {size: h * 0.72, fill: COL.white, weight: 600});
  },
  drop: (g, w, h) => drop(g, w / 2, h / 2, h * 0.4, COL.teal, null),
  star: (g, w, h) => star3(g, w / 2, h / 2, h * 0.42, '#d5d8da', {ring: true}),
  halo: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'CROWDSTRIKE', {size: h * 0.7, fill: COL.white, weight: 900, italic: true, spacing: 1});
  },
  nu: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'nu', {size: h * 0.95, fill: COL.white, weight: 800});
  },
  amd: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'AMD', {size: h * 0.85, fill: COL.white, weight: 900, spacing: 2});
  },
  einhell: (g, w, h) => {
    g.translate(w / 2, h / 2);
    text(g, 'Einhell', {size: h * 0.85, fill: COL.white, weight: 900, italic: true});
  },
};
