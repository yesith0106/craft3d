// F-16C Fighting Falcon (Block 50/52) from its published dimensions: 15.06 m long, 9.45 m over the wingtip rails,
// 4.88 m tall, a 27.87 m² wing of aspect ratio 3.0, taper 0.2275 and 40° leading-edge sweep, 40° stabilators with 10°
// anhedral over 5.58 m, a 47.5° fin, a 4.00 m wheelbase and a 2.36 m track. Every number is in kin.js.
// The fuselage, intake, canopy and spine are lofted from cross-sections measured off the three-view (estimated, see
// kin.js and the README); the flying surfaces are NACA 64A204-section solids lofted from their planforms.
// Moving parts, from the stick and pedals through the flight-control mixing in kin.js:
//   stabilators (all-moving, ±25°, ±5° differential), flaperons (+20 / -23°), rudder (±30°), leading-edge flaps
//   (-2..25°), split speedbrakes (60°), the canopy, and the F110 nozzle (dry to afterburner, with the flame).
import * as THREE from 'three';
import {cleanMaterials} from '../craft/materials.js';
import {box, creased, cylX, cylY, cylZ, kit, outward, turned, tyre} from '../craft/shapes.js';
import {D2R, smoother} from '../craft/rig.js';
import {centerline} from '../craft/ink.js';
import {chordAt, FIN, GEAR, leAt, mix, NOZ, SPEC, STAB, SURF, WING} from './kin.js';
import {bakePanelRest, panelled} from './panels.js';

export const info = {
  name: 'F-16C Fighting Falcon',
  description: '15.06 m · 9.45 m span · 27.87 m² wing, AR 3.0, 40° sweep · F110 · flight controls from the stick',
  stage: 'studio',
  wear: false,
  look: import.meta.env?.VITE_LOOK ?? 'real',
  palette: import.meta.env?.VITE_PALETTE ?? 'paper',
  floor: 'shadow',
  extent: 8.5, // half-size in metres: the stage grows its shadow box and floor to fit
};

const Z0 = SPEC.length / 2;
const BOOMX = 700; // tail boom centre, beside the nozzle // z = Z0 - s: the aircraft centred on the origin, nose toward +z (the front view)
const zOf = (s) => Z0 - s;

// ------------------------------------------------------------------ geometry helpers
/** monotone cubic through [[x, y], ...] (no overshoot between the measured points) */
function pchip(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]));
  m.push(d[n - 2]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/** rows [s, a, b, ...] under keys ['a', 'b', ...] -> s => {a, b, ...} */
const table = (keys, rows) => {
  const f = keys.map((_, j) => pchip(rows.map((r) => [r[0], r[j + 1]])));
  return (s) => Object.fromEntries(keys.map((k, j) => [k, f[j](s)]));
};
/** a closed solid through rings of equal length (each a closed loop of [x, y, z]), capped at both ends */
function loft(rings, angle = 34) {
  const n = rings[0].length;
  const pos = [];
  const idx = [];
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n), c = (j + 1) * n + i, e = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, e);
    }
  const cap = (ring, base, flip) => {
    const c = [0, 0, 0];
    for (const p of ring) for (let q = 0; q < 3; q++) c[q] += p[q] / n;
    pos.push(...c);
    const ci = pos.length / 3 - 1;
    for (let i = 0; i < n; i++) {
      const a = base + i, b = base + ((i + 1) % n);
      flip ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  };
  cap(rings[0], 0, false);
  cap(rings[rings.length - 1], (rings.length - 1) * n, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return creased(outward(g), angle);
}
/** a superellipse ring: half-width w, centre height yc, top t, bottom b, exponents above and below the chine */
function ring(z, w, yc, t, b, nT = 2.4, nB = 2.4, N = 72, x0 = 0, fil = 0, yw = yc) {
  const r = [];
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / N;
    const c = Math.cos(a), sn = Math.sin(a);
    const n = sn >= 0 ? nT : nB;
    let x = x0 + w * Math.sign(c) * Math.abs(c) ** (2 / n);
    let y = sn >= 0 ? yc + (t - yc) * Math.abs(sn) ** (2 / n) : yc - (yc - b) * Math.abs(sn) ** (2 / n);
    if (fil > 0) {
      // the wing-root blend: the sides flare out into the wing plane, a concave fillet above and below the chine
      const d = Math.min(Math.abs(a), Math.abs(a - Math.PI), Math.abs(a - 2 * Math.PI));
      const g = Math.exp(-((d / 0.42) ** 2));
      x += Math.sign(c) * fil * g;
      y = yw + (y - yw) * (1 - 0.9 * g * g);
    }
    r.push([x, y, z]);
  }
  return r;
}
/** NACA 4-digit thickness (64A-series is within a percent of it at 4 %), half thickness over chord */
const naca = (u, tc) => 5 * tc * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
/** an airfoil ring at span x: the chord from s=le to s=te, the piece between chord fractions f0..f1 (a control
 *  surface or the box between them), at height y, with a light camber (64A204: design lift 0.2) */
function foil(x, le, te, {y = 0, tc = 0.04, f0 = 0, f1 = 1, m = 20, camber = 0.009} = {}) {
  const c = te - le;
  const up = [];
  const lo = [];
  for (let i = 0; i <= m; i++) {
    const u = f0 + ((f1 - f0) * (1 - Math.cos((Math.PI * i) / m))) / 2;
    const h = naca(u, tc) * c;
    const cm = camber * c * 4 * u * (1 - u);
    up.push([x, y + cm + h, zOf(le + c * u)]);
    lo.push([x, y + cm - h, zOf(le + c * u)]);
  }
  return [...up.reverse(), ...lo];
}

// ------------------------------------------------------------------ paint: the two-tone grey, by which way a face looks
// FS 36118 gunship grey on top, FS 36270 medium grey on the sides and FS 36375 light ghost grey under (estimated sRGB)
const C = {top: new THREE.Color('#5d6367'), side: new THREE.Color('#878d91'), under: new THREE.Color('#a9adb0'), radome: new THREE.Color('#9a9d9c')};
function paint(g, fn) {
  const P = g.attributes.position;
  const Nn = g.attributes.normal;
  const col = new Float32Array(P.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    fn(c, P.getX(i), P.getY(i), P.getZ(i), Nn.getY(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const twoTone = (c, x, y, z, ny) => {
  c.copy(C.side).lerp(C.top, sstep(0.3, 0.6, ny)).lerp(C.under, sstep(-0.25, -0.55, ny));
};

export function build({stage}) {
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  const M = cleanMaterials();
  const k = kit({boltMat: M.steel});
  M.paint = new THREE.MeshPhysicalMaterial({color: '#ffffff', vertexColors: true, roughness: 0.66, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6});
  M.dark = new THREE.MeshStandardMaterial({color: '#2a2c2f', roughness: 0.7});
  M.hole = new THREE.MeshBasicMaterial({color: '#0b0c0d'});
  M.duct = new THREE.MeshStandardMaterial({color: '#c8cacb', roughness: 0.7}); // intake duct, white inside
  M.burnt = new THREE.MeshStandardMaterial({color: '#727068', roughness: 0.42, metalness: 0.88}); // nozzle flaps
  M.liner = new THREE.MeshStandardMaterial({color: '#3a3733', roughness: 0.6, metalness: 0.8});
  M.gear = new THREE.MeshStandardMaterial({color: '#d9d9d6', roughness: 0.5}); // gloss white gear legs and wells
  M.oleo = M.chrome;
  M.canopy = new THREE.MeshPhysicalMaterial({color: '#e9dcb0', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6});
  M.missile = new THREE.MeshPhysicalMaterial({color: '#c4c6c3', roughness: 0.5, clearcoat: 0.2});
  const add = (parent, geo, mat) => k.add(parent, geo, mat);
  const paintAdd = (parent, geo, fn = twoTone) => add(parent, paint(geo, fn), M.paint);

  // ------------------------------------------------------------------ fuselage
  // stations measured off the side and plan views; the radome is a tangent ogive
  const FUS = table(['w', 'yc', 't', 'b', 'nT', 'nB'], [
    [2400, 470, 1820, 2250, 1390, 2.2, 2.3],
    [3000, 520, 1830, 2215, 1430, 2.3, 2.5],
    [3700, 565, 1830, 2170, 1570, 2.4, 2.7],
    [4600, 620, 1800, 2175, 1560, 2.6, 2.8],
    [5500, 690, 1780, 2250, 1420, 2.8, 2.8],
    [6600, 740, 1770, 2285, 1150, 3.0, 3.2],
    [7600, 770, 1770, 2295, 1065, 3.0, 3.6],
    [9000, 790, 1770, 2300, 1075, 3.0, 3.6],
    [10600, 770, 1770, 2290, 1140, 2.9, 3.2],
    [12500, 720, 1775, 2280, 1235, 2.6, 2.6],
    [13600, 640, 1780, 2300, 1240, 2.3, 2.2],
    [14250, 575, 1780, 2355, 1205, 2.0, 2.0],
  ]);
  // the wing-root blend: how far the fuselage sides flare into the wing and strake (measured off the plan view)
  const FIL = pchip([[4200, 0], [5200, 70], [6500, 210], [8000, 330], [10000, 360], [11700, 330], [12500, 210], [13400, 70], [14000, 0]]);
  const NOSE = 550; // radome tip (the pitot boom is ahead of it)
  const fusRings = [];
  {
    const L = 2400 - NOSE;
    const R = 1;
    const rho = (R * R + (L / 450) ** 2) / (2 * R); // tangent ogive in units of the base radius
    for (let i = 0; i <= 24; i++) {
      const s = NOSE + (L * i) / 24;
      const xL = (s - NOSE) / 450; // distance from the tip in base radii
      const og = i === 0 ? 0.004 : Math.max(0.004, Math.sqrt(Math.max(0, rho * rho - (L / 450 - xL) ** 2)) + R - rho);
      const yc = 1760 + 60 * ((s - NOSE) / L);
      fusRings.push(ring(zOf(s), 470 * og, yc, yc + 430 * og, yc - 430 * og, 2.2, 2.3));
    }
    for (let s = 2600; s <= 14250; s += 200) {
      const f = FUS(s);
      fusRings.push(ring(zOf(s), f.w, f.yc, f.t, f.b, f.nT, f.nB, 72, 0, FIL(s), WING.y));
    }
  }
  const radomeTone = (c, x, y, z, ny) => {
    twoTone(c, x, y, z, ny);
    c.lerp(C.radome, sstep(zOf(2350), zOf(2250), z));
  };
  const fuselage = paintAdd(root, loft(fusRings, 40), radomeTone);
  fuselage.name = 'fuselage';

  // spine: the dorsal fairing from the canopy to the fin
  const SPINE = table(['w', 't'], [
    [4900, 280, 2450], [5300, 300, 2580], [6000, 320, 2565], [7500, 330, 2490], [9500, 320, 2450], [11500, 300, 2425], [13000, 270, 2400], [14000, 200, 2360], [14150, 70, 2345],
  ]);
  {
    const rs = [];
    for (let s = 4900; s <= 14150; s += 150) {
      const f = SPINE(s);
      rs.push(ring(zOf(s), f.w, 2150, f.t, 2150, 2.4, 2.4, 48));
    }
    paintAdd(root, loft(rs, 40)).name = 'spine';
  }

  // intake: a "smile" under the cockpit with its lip, the diverter gap above it, and the duct running back into the belly
  const INT = table(['w', 't', 'b', 'nT'], [
    [3700, 470, 1520, 1000, 4.5], [4200, 500, 1540, 1005, 4.2], [5000, 560, 1600, 1015, 3.8], [6000, 620, 1660, 1030, 3.4], [7000, 650, 1690, 1045, 3.0],
    [7600, 560, 1650, 1110, 3.0],
  ]);
  const LIP = 3700;
  {
    const f = INT(LIP);
    const yc = (f.t + f.b) / 2;
    const lip = (s, kk) => ring(zOf(s), f.w * kk, yc + (f.t - yc) * (1 - kk) * 0.2, yc + (f.t - yc) * kk, yc - (yc - f.b) * kk, f.nT, 2.6, 72);
    const rs = [lip(4300, 0.86), lip(3780, 0.915), lip(3712, 0.95), lip(3694, 0.975), lip(3712, 1.0)];
    for (let s = 3800; s <= 7600; s += 200) {
      const g = INT(s);
      const c = (g.t + g.b) / 2;
      rs.push(ring(zOf(s), g.w, c, g.t, g.b, g.nT, 2.6, 72));
    }
    const intake = add(root, loft(rs, 40), M.paint);
    paint(intake.geometry, (c, x, y, z, ny) => {
      twoTone(c, x, y, z, ny);
      if (z < zOf(3740) && z > zOf(4310) && Math.abs(y - yc) < (f.t - yc) * 0.97 && Math.abs(x) < f.w * 0.97 && y > 1010) c.set('#c8cacb'); // inside the lip
    });
    intake.name = 'intake';
    // the duct darkens into the bend (the engine face is out of sight, as on the aircraft)
    const back = add(root, new THREE.ShapeGeometry(new THREE.Shape(lip(4290, 0.86).map((p) => new THREE.Vector2(p[0], p[1])))), M.hole);
    back.position.z = zOf(4290);
    // the diverter: a splitter web between the intake and the fuselage
    add(root, box(36, 90, 1100, 0, 1555, zOf(4300)), M.paint).geometry = paint(box(36, 90, 1100, 0, 1555, zOf(4300)).toNonIndexed(), (c) => c.copy(C.under));
  }

  // canopy: one-piece bubble with the gold-tinted coating, hinged at the rear
  const CAN = table(['w', 't'], [
    [2650, 70, 2235], [2800, 235, 2400], [3100, 360, 2620], [3600, 425, 2815], [4100, 430, 2895], [4600, 405, 2862], [5000, 352, 2752], [5320, 285, 2600],
  ]);
  const SILL = 2150;
  const canopyHinge = k.group(root, 0, 2560, zOf(5320));
  {
    const rs = [];
    for (let s = 2650; s <= 5320; s += 70) {
      const f = CAN(s);
      // the bubble above the sill and a flat floor below: 64 points over the top, 8 across the bottom
      const r = [];
      for (let i = 0; i <= 64; i++) {
        const a = (Math.PI * i) / 64;
        const c = Math.cos(a), sn = Math.sin(a);
        r.push([f.w * Math.sign(c) * Math.abs(c) ** (2 / 2.25), SILL + (f.t - SILL) * sn ** (2 / 2.25), zOf(s)]);
      }
      for (let i = 1; i < 8; i++) r.push([-f.w + (2 * f.w * i) / 8, SILL, zOf(s)]);
      rs.push(r);
    }
    const g = loft(rs, 60);
    g.translate(0, -2560, -zOf(5320));
    const glass = add(canopyHinge, g, M.canopy);
    glass.castShadow = false;
    stage.noAO.push(glass);
    // the canopy frame at the rear, the bow behind the pilot's head
    const bowS = 4880;
    const f = CAN(bowS);
    const bow = [];
    for (let i = 0; i <= 40; i++) {
      const a = (Math.PI * i) / 40;
      const c = Math.cos(a), sn = Math.sin(a);
      bow.push(new THREE.Vector3((f.w + 6) * Math.sign(c) * Math.abs(c) ** (2 / 2.25), SILL + (f.t + 6 - SILL) * sn ** (2 / 2.25) - 2560, zOf(bowS) - zOf(5320)));
    }
    add(canopyHinge, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 48, 16, 8, false), M.dark);
    // sill rails, both sides
    for (const sx of [1, -1]) {
      const pts = [];
      for (let s = 2700; s <= 5300; s += 100) pts.push(new THREE.Vector3(sx * CAN(s).w, SILL + 8 - 2560, zOf(s) - zOf(5320)));
      add(canopyHinge, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 14, 6, false), M.dark);
    }
  }

  // cockpit: coaming, HUD, ejection seat (ACES II), side consoles
  {
    const ck = k.group(root);
    add(ck, box(640, 120, 360, 0, 2300, zOf(3330)), M.dark); // glare shield over the panel
    add(ck, box(700, 40, 1900, 0, 2165, zOf(4250)), M.dark); // the cockpit floor line / consoles
    for (const sx of [1, -1]) add(ck, box(150, 110, 1100, sx * 300, 2210, zOf(4300)), M.dark);
    const hud = k.group(ck, 0, 2365, zOf(3260));
    add(hud, box(200, 40, 140, 0, 0, 0), M.dark);
    for (const sx of [1, -1]) add(hud, box(14, 190, 20, sx * 95, 95, -40), M.dark);
    const comb = add(hud, box(176, 170, 6, 0, 110, -40), M.glass);
    comb.rotation.x = -0.35;
    stage.noAO.push(comb);
    // seat: 30° back (the F-16's seat is reclined, a known figure)
    const seat = k.group(ck, 0, 1960, zOf(4560));
    add(seat, box(500, 90, 520, 0, 140, 160), M.dark);
    const back = k.group(seat, 0, 160, -40);
    back.rotation.x = -30 * D2R;
    add(back, box(480, 640, 150, 0, 330, 0), M.dark);
    add(back, box(300, 200, 160, 0, 720, 20), M.dark); // headrest / drogue container
    add(back, box(170, 22, 50, 0, 560, 110), new THREE.MeshStandardMaterial({color: '#d4a21c', roughness: 0.6})); // the yellow-black handle
    add(ck, cylY(30, 300), M.dark).position.set(330, 2330, zOf(4050)); // side stick
  }

  // pitot boom, the IFF antennas ("bird slicers") ahead of the windscreen, the gun port and the refuelling door
  {
    add(root, turned([[0, 0], [12, 30], [18, 260], [34, 470], [56, 580], [0, 580]], 32), M.burnt).rotation.x = -Math.PI / 2;
    root.children.at(-1).position.set(0, 1760, zOf(0));
    for (const x of [-170, -60, 60, 170]) {
      const g = loft([foil(0, 2280, 2360, {tc: 0.08, camber: 0, m: 6}), foil(80, 2300, 2350, {tc: 0.08, camber: 0, m: 6})]);
      g.rotateZ(Math.PI / 2);
      add(root, g, M.dark).position.set(x, 2200 + Math.abs(x) * -0.18, 0);
    }
    const gun = add(root, cylZ(48, 140, 24), M.hole);
    gun.position.set(668, 1832, zOf(4390));
  }

  // ------------------------------------------------------------------ one side of the aircraft (built twice, mirrored)
  const sides = [];
  const hinged = (parent, geo, mat, A, B) => {
    // a part that turns about the line A-B (mm, in the parent's frame)
    const g = k.group(parent, ...A);
    geo.translate(-A[0], -A[1], -A[2]);
    const m = mat === M.paint ? paintAdd(g, geo) : add(g, geo, mat);
    const axis = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize();
    return {g, m, set: (deg) => g.quaternion.setFromAxisAngle(axis, deg * D2R)};
  };
  const buildSide = (sx) => {
    const side = k.group(root);
    side.scale.x = sx; // +1 left wing (+x), -1 the right, mirrored
    const S = {};
    const y = WING.y;
    // wing box: the LEX and the wing between the leading-edge flap and the flaperon, one solid with steps where the
    // flaps start and stop
    const tcAt = (c) => 0.04 * Math.min(1, WING.cr / c); // 4 % of the reference chord, thinner through the strake
    const lefS = (x) => {
      const u = (x - SURF.lef.x[0]) / (SURF.lef.x[1] - SURF.lef.x[0]);
      return leAt(x) + SURF.lef.chord[0] + (SURF.lef.chord[1] - SURF.lef.chord[0]) * u;
    };
    const fr = (x, s) => (s - leAt(x)) / chordAt(x);
    const hingeF = (x) => fr(x, SURF.flaperon.hingeS);
    const sec = (x, f0, f1) => foil(x, leAt(x), WING.teS, {y, tc: tcAt(chordAt(x)), f0, f1});
    const [fx0, fx1] = SURF.flaperon.x;
    const [lx0, lx1] = SURF.lef.x;
    const boxRings = [
      sec(300, 0, 1), sec(500, 0, 1), sec(700, 0, 1), sec(fx0, 0, 1), sec(fx0, 0, hingeF(fx0)), sec(1100, 0, hingeF(1100)),
      sec(lx0, 0, hingeF(lx0)), sec(lx0, fr(lx0, lefS(lx0)), hingeF(lx0)), sec(fx1, fr(fx1, lefS(fx1)), hingeF(fx1)),
      sec(fx1, fr(fx1, lefS(fx1)), 1), sec(lx1, fr(lx1, lefS(lx1)), 1),
    ];
    S.wing = paintAdd(side, loft(boxRings, 30));
    // leading-edge flap, hinged on its rear edge (lower surface)
    {
      const g = loft([sec(lx0, 0, fr(lx0, lefS(lx0))), sec(lx1, 0, fr(lx1, lefS(lx1)))], 30);
      const A = [lx0, y - 10, zOf(lefS(lx0))];
      const B = [lx1, y - 4, zOf(lefS(lx1))];
      S.lef = hinged(side, g, M.paint, A, B);
    }
    // flaperon, hinged on its front edge
    {
      const g = loft([sec(fx0, hingeF(fx0), 1), sec(fx1, hingeF(fx1), 1)], 30);
      S.flap = hinged(side, g, M.paint, [fx0, y, zOf(SURF.flaperon.hingeS)], [fx1, y, zOf(SURF.flaperon.hingeS)]);
    }
    // wingtip launcher rail (LAU-129) and an AIM-9 on it
    {
      const xr = WING.semi;
      const rs = [];
      for (const [s, kk] of [[9900, 0.1], [10100, 0.7], [10300, 1], [11900, 1], [12000, 0.6]]) {
        const r = [];
        for (const [px, py] of [[0, -65], [170, -65], [170, 65], [0, 65]]) r.push([xr - 20 + px * (0.4 + 0.6 * kk), y + py * kk, zOf(s)]);
        rs.push(r);
      }
      paintAdd(side, loft(rs, 30));
      const mis = k.group(side, xr + 150 + 60, y, zOf(9150)); // AIM-9: 3.02 m, 127 mm body
      add(mis, turned([[0, 0], [40, 40], [63.5, 150], [63.5, 3020], [0, 3020]], 40, 30).rotateX(-Math.PI / 2).translate(0, 0, 0), M.missile);
      add(mis, cylZ(64.5, 40, 40).translate(0, 0, -260), M.dark);
      const finG = (span, cr, ct, at) => {
        const g = loft([foil(0, at, at + cr, {tc: 0.05, camber: 0, m: 6}), foil(span, at + cr - ct, at + cr, {tc: 0.05, camber: 0, m: 6})]);
        return g.translate(0, 0, -zOf(0));
      };
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const f = add(mis, finG(255, 320, 140, 2700).translate(60, 0, 0), M.missile);
        f.rotation.z = a;
        const cn = add(mis, finG(140, 170, 70, 420).translate(60, 0, 0), M.missile);
        cn.rotation.z = a;
      }
      add(mis, box(40, 50, 2400, -62, 0, -1500), M.missile); // hanger lugs to the rail
      S.missile = mis;
    }
    // tail boom: the shelf beside the nozzle that carries the stabilator and ends in the split speedbrake
    {
      const BOOM = table(['w', 'h'], [[11400, 60, 60], [12000, 165, 150], [13000, 175, 155], [13950, 170, 150]]);
      const rs = [];
      for (let s = 11400; s <= 13950; s += 150) {
        const f = BOOM(s);
        rs.push(ring(zOf(s), f.w, STAB.y, STAB.y + f.h, STAB.y - f.h, 3, 3, 48, BOOMX));
      }
      S.boom = paintAdd(side, loft(rs, 40));
      // speedbrakes: upper and lower halves, hinged at the aft end, opening forward edges out
      const half = (up) => {
        const r = [];
        const rs2 = [];
        for (let s = 13950; s <= 14760; s += 90) {
          const u = (s - 13950) / 810;
          const h = 150 * (1 - 0.82 * u * u);
          const w = 170 * (1 - 0.3 * u);
          const pts = [];
          for (let i = 0; i <= 24; i++) {
            const a = (Math.PI * i) / 24;
            const c = Math.cos(a), sn = Math.sin(a);
            pts.push([BOOMX + w * Math.sign(c) * Math.abs(c) ** (2 / 3), STAB.y + (up ? 1 : -1) * (4 + h * sn ** (2 / 3)), zOf(s)]);
          }
          for (let i = 1; i < 6; i++) pts.push([BOOMX - w + (2 * w * i) / 6, STAB.y + (up ? 4 : -4), zOf(s)]);
          rs2.push(up ? pts : pts.reverse());
        }
        void r;
        const g = loft(rs2, 40);
        return hinged(side, g, M.paint, [BOOMX - 170, STAB.y, zOf(14760)], [BOOMX + 170, STAB.y, zOf(14760)]);
      };
      S.sbUp = half(true);
      S.sbDn = half(false);
    }
    // stabilator: all-moving, its pivot on the boom, 10° anhedral
    {
      const anh = k.group(side, STAB.xr, STAB.y, zOf(STAB.pivotS));
      anh.rotation.z = -SPEC.hTailAnhedral * D2R;
      const piv = k.group(anh);
      const L = (STAB.xt - STAB.xr) / Math.cos(SPEC.hTailAnhedral * D2R); // along the anhedral line
      const st = (u) => {
        const le = STAB.leR + u * (STAB.leT - STAB.leR);
        const c = STAB.cr + u * (STAB.ct - STAB.cr);
        return foil(u * L, le, le + c, {tc: 0.045, camber: 0});
      };
      const g = loft([foil(-60, STAB.leR, STAB.leR + STAB.cr, {tc: 0.045, camber: 0}), st(0), st(1)], 30);
      g.translate(0, 0, -zOf(STAB.pivotS));
      paintAdd(piv, g);
      add(piv, cylX(55, 200, 24).translate(-80, 0, 0), M.dark); // the pivot spindle into the boom
      S.stab = piv;
      S.stabTip = L;
      S.stabAnh = anh;
    }
    // ventral fin under the aft fuselage, canted out 15°
    {
      const g = loft([foil(-40, 11500, 12900, {tc: 0.06, camber: 0}), foil(0, 11500, 12900, {tc: 0.06, camber: 0}), foil(560, 12150, 12850, {tc: 0.06, camber: 0})], 30);
      const v = paintAdd(side, g, (c) => c.copy(C.under));
      v.position.set(400, 1295, 0);
      v.rotation.z = -75 * D2R;
    }
    // main gear: oleo leg from the fuselage to the axle, outboard wheel, drag brace, door
    {
      const axle = [GEAR.track / 2 - 70, GEAR.rMain, zOf(GEAR.mainS)];
      const top = [620, 1240, zOf(GEAR.mainS - 260)];
      const leg = new THREE.Vector3(axle[0] - top[0], axle[1] - top[1] + 120, axle[2] - top[2]);
      const len = leg.length();
      const lg = k.group(side, ...top);
      lg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), leg.clone().normalize());
      add(lg, cylY(70, len * 0.55).translate(0, -len * 0.275, 0), M.gear);
      add(lg, cylY(48, len * 0.5).translate(0, -len * 0.72, 0), M.oleo);
      add(lg, cylY(80, 120).translate(0, -len + 20, 0), M.gear);
      add(side, cylX(40, 260), M.gear).position.set(axle[0] - 20, axle[1], axle[2]);
      const wheel = k.group(side, axle[0] + 70, axle[1], axle[2]);
      add(wheel, tyre(GEAR.rMain, SPEC.tyreMainW, GEAR.rMain * 0.62), M.rubber);
      add(wheel, cylX(GEAR.rMain * 0.62, SPEC.tyreMainW * 0.82, 40), M.gear);
      add(wheel, cylX(90, SPEC.tyreMainW * 0.95, 24), M.steel);
      // drag brace forward to the wheel well
      const a = new THREE.Vector3(...top).add(new THREE.Vector3(0, 0, 900));
      const b = new THREE.Vector3(axle[0] - 60, axle[1] + 460, axle[2]);
      const br = add(side, cylY(30, a.distanceTo(b)), M.gear);
      br.position.copy(a).add(b).multiplyScalar(0.5);
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      // the gear door, hung on the leg's outboard side
      const door = add(side, box(16, 620, 760), M.gear);
      door.position.set(axle[0] - 210, 840, axle[2] + 120);
      door.rotation.z = 0.28;
      S.wheel = wheel;
    }
    S.group = side;
    sides.push(S);
    return S;
  };
  const L = buildSide(1);
  const R = buildSide(-1);

  // ------------------------------------------------------------------ fin and rudder
  const fin = k.group(root, 0, FIN.yRoot, 0);
  fin.rotation.z = Math.PI / 2; // build span along x, then stand it up: x -> y
  {
    const sec = (h, f0 = 0, f1 = 1) => {
      const u = h / FIN.h;
      return foil(h, FIN.leR + u * (FIN.leT - FIN.leR), FIN.teR + u * (FIN.teT - FIN.teR), {tc: 0.05, camber: 0, f0, f1});
    };
    const teAt = (h) => FIN.teR + (h / FIN.h) * (FIN.teT - FIN.teR);
    const leAtF = (h) => FIN.leR + (h / FIN.h) * (FIN.leT - FIN.leR);
    const rf = (h) => (teAt(h) - SURF.rudder.chord - leAtF(h)) / (teAt(h) - leAtF(h));
    const [h0, h1] = SURF.rudder.h;
    const finTone = (c) => c.copy(C.side);
    paintAdd(fin, loft([sec(-60), sec(h0), sec(h0, 0, rf(h0)), sec(h1, 0, rf(h1)), sec(h1), sec(FIN.h)], 30), finTone);
    // the antenna cap on the tip
    const cap = loft([sec(FIN.h - 60, 0, 1), foil(FIN.h, leAtF(FIN.h) + 100, teAt(FIN.h) - 60, {tc: 0.04, camber: 0})], 30);
    add(fin, cap, M.dark);
    const A = [h0, 0, zOf(teAt(h0) - SURF.rudder.chord)];
    const B = [h1, 0, zOf(teAt(h1) - SURF.rudder.chord)];
    var rudder = hinged(fin, loft([sec(h0, rf(h0), 1), sec(h1, rf(h1), 1)], 30), M.dark, A, B);
    paint(rudder.m.geometry, finTone);
    rudder.m.material = M.paint;
  }

  // ------------------------------------------------------------------ nozzle (F110): 16 flaps on hinges, liner, flame
  const NZ = k.group(root, 0, 1780, zOf(NOZ.s));
  const petals = [];
  {
    add(NZ, turned([[NOZ.r0 + 12, 60], [NOZ.r0 - 20, 60], [NOZ.r0 - 20, -60], [NOZ.r0 + 18, -60], [NOZ.r0 + 12, 60]], 96).rotateX(Math.PI / 2), M.burnt); // the hinge ring
    const w = (2 * Math.PI * NOZ.r0) / NOZ.n;
    for (let i = 0; i < NOZ.n; i++) {
      const g = k.group(NZ);
      g.rotation.z = (2 * Math.PI * i) / NOZ.n;
      const h = k.group(g, 0, NOZ.r0, 0);
      // each flap is a curved strip of the cone, overlapping its neighbours a little (the seals on the real nozzle)
      const rs = [];
      for (const [d, rr, t] of [[0, NOZ.r0, 26], [NOZ.len * 0.5, (NOZ.r0 + NOZ.rDry) / 2, 20], [NOZ.len, NOZ.rDry, 14]]) {
        const half = (Math.PI / NOZ.n) * 1.06;
        const arc = (r) => Array.from({length: 9}, (_, q) => -half + (2 * half * q) / 8).map((ph) => [r * Math.sin(ph), r * Math.cos(ph) - rr, -d]);
        rs.push([...arc(rr), ...arc(rr - t).reverse()]); // arcs about the nozzle axis, which is rr below the hinge line
      }
      add(h, loft(rs, 30), M.burnt);
      petals.push(h);
    }
    // liner and the afterburner inside, dark and hot-tinted
    add(NZ, turned([[NOZ.r0 - 30, 40], [NOZ.r0 - 60, 40], [NOZ.r0 - 60, -900], [NOZ.r0 - 30, -900], [NOZ.r0 - 30, 40]].map(([r, z]) => [r, z]), 96).rotateX(-Math.PI / 2), M.liner);
    const face = add(NZ, new THREE.CircleGeometry(NOZ.r0 - 50, 64), M.hole);
    face.position.z = 880;
    for (const r of [180, 330]) add(NZ, new THREE.TorusGeometry(r, 16, 8, 64), M.liner).position.z = 700;
  }
  // the flame: additive cones with shock diamonds, drawn in colour in the drawing look
  const flame = new THREE.Group();
  flame.position.set(0, 1780, zOf(SPEC.length));
  flame.userData.ink = 'color';
  {
    const mk = (color, op) => new THREE.MeshBasicMaterial({color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    const outer = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), mk('#ff6a1f', 0.5));
    const core = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), mk('#ffd27a', 0.55));
    flame.add(outer, core);
    const diamonds = [];
    for (let i = 0; i < 4; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mk('#ffd9a0', 0.5));
      flame.add(d);
      diamonds.push(d);
    }
    flame.userData.parts = {outer, core, diamonds};
  }
  root.add(flame);
  stage.noAO.push(flame);

  // ------------------------------------------------------------------ nose gear: oleo, torque links, wheel, taxi light
  {
    const s = GEAR.noseS;
    const ng = k.group(root, 0, 0, zOf(s));
    const top = INT(s).b + 20;
    add(ng, cylY(62, top - 650).translate(0, (top + 650) / 2, 120), M.gear);
    add(ng, cylY(44, 420).translate(0, 520, 120), M.oleo);
    add(ng, box(46, 440, 60, 0, 420, 40), M.gear); // the fork / torque link side
    add(ng, cylX(28, 210), M.gear).position.set(0, GEAR.rNose, 0);
    for (const sx of [1, -1]) add(ng, box(26, 360, 70, sx * 92, GEAR.rNose + 160, 30), M.gear);
    const w = k.group(ng, 0, GEAR.rNose, 0);
    add(w, tyre(GEAR.rNose, SPEC.tyreNoseW, GEAR.rNose * 0.6), M.rubber);
    add(w, cylX(GEAR.rNose * 0.6, SPEC.tyreNoseW * 0.8, 32), M.gear);
    add(ng, cylZ(55, 60, 24), M.chrome).position.set(0, 760, 210); // taxi light
    add(ng, box(12, 420, 640, 120, top - 230, 220), M.gear); // door
    var noseWheel = w;
  }

  // ------------------------------------------------------------------ the drawing look's centre line
  root.add(centerline([0, 1780, zOf(-300)], [0, 1780, zOf(SPEC.length + 400)]));

  // ------------------------------------------------------------------ details
  // where the fuselage skin is: the outermost x of the station's section at height y (sampled from the same loft)
  const bodyX = (s, yy) => {
    const f = FUS(s);
    let best = 0, dy = Infinity;
    for (const [x, y] of ring(0, f.w, f.yc, f.t, f.b, f.nT, f.nB, 360, 0, FIL(s), WING.y)) if (x > 0 && Math.abs(y - yy) < dy) [best, dy] = [x, Math.abs(y - yy)];
    return best;
  };
  // a blade or fairing standing on a surface: chord le..te, height h, standing up (dir 1) or hanging down (-1)
  const blade = (parent, x, y0, le, te, h, dir = 1, tc = 0.1, rake = 0.35, mat = M.dark) => {
    const g = loft([foil(0, le, te, {tc, camber: 0, m: 8}), foil(h, le + h * rake, te, {tc, camber: 0, m: 8})], 30);
    g.rotateZ(Math.PI / 2); // x (height) -> y
    if (dir < 0) g.scale(1, -1, 1);
    const m = add(parent, outward(g), mat);
    m.position.set(x, y0, 0);
    return m;
  };
  M.form = new THREE.MeshStandardMaterial({color: '#9db58f', emissive: '#6fa856', emissiveIntensity: 0.07, roughness: 0.5});
  M.navR = new THREE.MeshStandardMaterial({color: '#d0312d', emissive: '#d0312d', emissiveIntensity: 0.5, roughness: 0.2});
  M.navG = new THREE.MeshStandardMaterial({color: '#2fa84f', emissive: '#2fa84f', emissiveIntensity: 0.5, roughness: 0.2});
  M.navW = new THREE.MeshStandardMaterial({color: '#f4f2ea', emissive: '#f4f2ea', emissiveIntensity: 0.3, roughness: 0.2});
  M.yellow = new THREE.MeshStandardMaterial({color: '#d9a51e', roughness: 0.5});
  M.brown = new THREE.MeshStandardMaterial({color: '#6b4a2b', roughness: 0.55});
  M.seeker = new THREE.MeshPhysicalMaterial({color: '#3c4a52', roughness: 0.1, metalness: 0.4, clearcoat: 1});
  const det = k.group(root);
  for (const sx of [1, -1]) {
    // formation light strips: forward fuselage under the canopy, aft fuselage ahead of the fin
    for (const [s, y, len, tilt] of [[2950, 1960, 520, -0.12], [12350, 2060, 520, -0.5]]) {
      const x = bodyX(s, y);
      const fl = add(det, box(8, 70, len), M.form);
      fl.position.set(sx * (x + 1), y, zOf(s));
      fl.rotation.z = sx * tilt;
    }
    // angle-of-attack probes either side of the nose, behind the radome
    const xa = bodyX(2600, 1900);
    const aoa = k.group(det, sx * xa, 1900, zOf(2600));
    add(aoa, cylX(14, 70).translate(sx * 30, 0, 0), M.burnt);
    add(aoa, box(8, 52, 120, sx * 64, 0, -20), M.burnt);
    // the upper and lower formation strips on the fin, one each side
    const fs = k.group(fin);
    const h = 1350;
    const u = h / FIN.h;
    const le = FIN.leR + u * (FIN.leT - FIN.leR), c = FIN.cr + u * (FIN.ct - FIN.cr);
    const t = naca(0.32, 0.05) * c;
    add(fs, box(560, 8, 70), M.form).position.set(h, sx * (t + 2), zOf(le + 0.32 * c));
  }
  // position lights: red on the left (+x) intake side, green on the right, white on the fin tip
  for (const [sx, mat] of [[1, M.navR], [-1, M.navG]]) {
    const f = INT(4300);
    const nl = add(det, new THREE.SphereGeometry(32, 16, 8, 0, Math.PI), mat);
    nl.position.set(sx * (f.w - 6), (f.t + f.b) / 2 - 40, zOf(4300));
    nl.rotation.y = sx * Math.PI / 2;
  }
  add(fin, new THREE.SphereGeometry(30, 16, 8), M.navW).position.set(FIN.h - 34, 0, zOf(FIN.teT - 120));
  // antennas: UHF and TACAN blades under the belly, a UHF blade on the spine, the GPS patch
  blade(det, 0, INT(6800).b + 12, 6750, 6950, 150, -1);
  blade(det, 0, FUS(10200).b + 18, 10150, 10330, 140, -1);
  blade(det, 0, SPINE(9800).t - 8, 9750, 9930, 160, 1);
  add(det, cylY(70, 14, 24), M.dark).position.set(0, SPINE(7200).t - 4, zOf(7200));
  // gun: the M61's port and a row of vents behind it on the left strake
  for (let i = 0; i < 6; i++) {
    const s = 4650 + i * 95;
    const vt = add(det, box(70, 16, 34), M.hole);
    vt.position.set(bodyX(s, 1905) - 4, 1905, zOf(s));
  }
  // refuelling receptacle: the slipway recess behind the canopy, inside its door outline
  add(det, box(210, 18, 720), M.dark).position.set(0, SPINE(6150).t - 6, zOf(6150));
  // ram-air scoop for the environmental control system, at the root of the fin
  {
    const sc = k.group(det, 0, SPINE(10750).t - 20, zOf(10750));
    add(sc, paint(box(170, 95, 420, 0, 45, -150).toNonIndexed(), (c) => c.copy(C.top)), M.paint);
    add(sc, box(140, 70, 6, 0, 50, 62), M.hole);
  }
  // fin-root fairing over the rudder actuator, at the trailing edge
  {
    const rs = [];
    for (let s = 14000; s <= 14700; s += 70) {
      const u = (s - 14000) / 700;
      const kk = Math.sin(Math.PI * Math.min(1, 0.15 + u)) ** 0.5;
      rs.push(ring(zOf(s), 105 * kk + 4, 2390, 2390 + 230 * kk + 4, 2300, 2.3, 2.3, 32));
    }
    paintAdd(det, loft(rs, 40), (c) => c.copy(C.side));
  }
  // arresting hook under the tail, stowed between the ventral fins
  {
    const hk = k.group(det, 0, FUS(13050).b + 14, zOf(13050));
    hk.rotation.x = 4 * D2R;
    add(hk, cylZ(32, 1150, 16).translate(0, 0, -575), M.yellow);
    add(hk, box(70, 90, 160, 0, -30, -1160), M.dark);
  }

  // ------------------------------------------------------------------ stores: pylons, 370-gal tanks, AIM-120s
  // station positions estimated off the plan view: 4/6 inboard (tanks), 2/8 outboard (missile rails)
  const wingLow = (x, s) => {
    const le = leAt(x), c = chordAt(x);
    const u = Math.min(1, Math.max(0, (s - le) / c));
    return WING.y + 0.009 * c * 4 * u * (1 - u) - naca(u, 0.04 * Math.min(1, WING.cr / c)) * c;
  };
  const stores = [];
  for (const S of [L, R]) {
    const g = k.group(S.group);
    stores.push(g);
    const pylon = (x, le, te, depth) => {
      const top = Math.min(wingLow(x, le), wingLow(x, te)) + 25;
      const m = blade(g, x, top - depth, le, te, depth, 1, 0.075, -0.12, M.paint);
      m.material = M.paint;
      paint(m.geometry, (c) => c.copy(C.under));
      return top - depth;
    };
    // station 4: pylon and a 370-gallon tank (about 0.67 m across and 4.6 m long, 1.4 m³)
    {
      const x = 2100;
      const bot = pylon(x, 9000, 10650, 230);
      const tk = k.group(g, x, bot - 335 + 12, zOf(7400));
      const pr = [[0, 0]];
      for (let i = 1; i <= 12; i++) {
        const u = i / 12;
        pr.push([335 * Math.sqrt(1 - (1 - u) ** 2), 1450 * u]);
      }
      pr.push([335, 3250]);
      for (let i = 1; i <= 10; i++) {
        const u = i / 10;
        pr.push([335 * (1 - 0.92 * u ** 1.6), 3250 + 1350 * u]);
      }
      pr.push([0, 4600]);
      const tg = paint(turned(pr, 64, 30).rotateX(-Math.PI / 2), (c) => c.copy(C.under));
      add(tk, tg, M.paint);
      for (const sz of [-1, 1]) add(tk, cylY(18, 120), M.dark).position.set(sz * 120, 330, -(9000 - 7400) - 400);
    }
    // station 2: pylon, launcher rail, AIM-120 (3.66 m, 178 mm body)
    {
      const x = 3700;
      const bot = pylon(x, 10150, 11350, 150);
      add(g, box(120, 110, 2700, x, bot - 45, zOf(10950)), M.paint).material = M.dark;
      const ms = k.group(g, x, bot - 100 - 89, zOf(8900));
      add(ms, turned([[0, 0], [40, 60], [75, 230], [89, 420], [89, 3650], [0, 3650]], 40, 30).rotateX(-Math.PI / 2), M.missile);
      add(ms, cylZ(90, 40, 40).translate(0, 0, -900), M.yellow);
      add(ms, cylZ(90, 40, 40).translate(0, 0, -1500), M.brown);
      const finG = (span, cr, ct, at) => loft([foil(0, at, at + cr, {tc: 0.05, camber: 0, m: 6}), foil(span, at + cr - ct, at + cr, {tc: 0.05, camber: 0, m: 6})]).translate(0, 0, -zOf(0));
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        add(ms, finG(140, 420, 200, 1450).translate(85, 0, 0), M.missile).rotation.z = a;
        add(ms, finG(150, 300, 150, 3330).translate(85, 0, 0), M.missile).rotation.z = a;
      }
      add(ms, box(40, 50, 2300, 0, 100, -1800), M.missile);
    }
  }
  // the AIM-9s on the tips: glass seeker dome, yellow warhead band, brown motor band
  for (const S of [L, R]) {
    add(S.missile, new THREE.SphereGeometry(38, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, -22), M.seeker);
    add(S.missile, cylZ(64.5, 40, 40).translate(0, 0, -1020), M.yellow);
    add(S.missile, cylZ(64.5, 40, 40).translate(0, 0, -1500), M.brown);
  }

  // ------------------------------------------------------------------ panel lines (shader, from rest positions)
  const PZ = {Z0, leRoot: WING.leRoot, tanLE: Math.tan(SPEC.sweepLE * D2R), teS: WING.teS};
  M.body = panelled(M.paint, 'body', PZ);
  M.wingP = panelled(M.paint, 'wing', PZ);
  for (const n of ['fuselage', 'spine', 'intake']) root.getObjectByName(n).material = M.body;
  for (const S of [L, R]) {
    S.wing.material = M.wingP;
    S.boom.material = M.body;
  }
  bakePanelRest(root, [M.body, M.wingP]);

  root.updateMatrixWorld(true);
  const st = {mix: mix({}), sb: 0, ab: 0, canopy: 0};
  const anim = (t) => {
    // a ground control check: stick and pedals sweep on incommensurate periods, so every combination comes round
    const w = (T) => Math.sin((2 * Math.PI * t) / T);
    return {pitch: 0.9 * w(9), roll: 0.9 * w(6.1 + 0.0) * smoother(Math.abs(w(23))), yaw: 0.8 * w(7.3)};
  };

  return {
    root,
    focus: [0, 2.0, 0],
    radius: 7.6,
    view: {az: 38, el: 15, d: 2.55},
    // a station cut across the fuselage, travelling nose to tail
    section: {normal: [0, 0, 1], from: 7.7, to: -7.7, value: 0},
    params: [
      {key: 'auto', label: 'control check (auto)', min: 0, max: 1, step: 1, value: 1},
      {key: 'pitch', label: 'stick pitch (+ back)', min: -1, max: 1, step: 0.01, value: 0},
      {key: 'roll', label: 'stick roll (+ right)', min: -1, max: 1, step: 0.01, value: 0},
      {key: 'yaw', label: 'pedals (+ right)', min: -1, max: 1, step: 0.01, value: 0},
      {key: 'flaps', label: 'flaperons down', min: 0, max: 20, step: 0.5, value: 0, unit: '°'},
      {key: 'lef', label: 'leading-edge flaps', min: -2, max: 25, step: 0.5, value: 2, unit: '°'},
      {key: 'speedbrake', label: 'speedbrakes', min: 0, max: 60, step: 1, value: 0, unit: '°'},
      {key: 'canopy', label: 'canopy', min: 0, max: 1, step: 0.01, value: 0},
      {key: 'stores', label: 'stores: tanks, AIM-120s', min: 0, max: 1, step: 1, value: 1},
      {key: 'ab', label: 'throttle: dry → afterburner', min: 0, max: 1, step: 0.01, value: 0},
    ],
    update(dt, t, p) {
      const c = p.auto > 0.5 ? anim(t) : {pitch: p.pitch, roll: p.roll, yaw: p.yaw};
      st.mix = mix({...c, flaps: p.flaps, lef: p.lef});
      const m = st.mix;
      // left side is +x: rotations about +x put a trailing edge up for +deg (stab TE up = +), flaperon down = -
      L.stab.rotation.x = m.stabL * D2R;
      R.stab.rotation.x = m.stabR * D2R;
      L.flap.set(-m.flapL);
      R.flap.set(-m.flapR);
      L.lef.set(m.lef);
      R.lef.set(m.lef);
      rudder.set(m.rudder);
      st.sb = p.speedbrake;
      for (const S of [L, R]) {
        S.sbUp.set(-p.speedbrake);
        S.sbDn.set(p.speedbrake);
      }
      st.canopy = p.canopy;
      canopyHinge.rotation.x = -p.canopy * 30 * D2R;
      // nozzle: the flaps open from the dry exit to the afterburner exit; the flame grows with the throttle
      for (const g of stores) g.visible = p.stores > 0.5;
      st.ab = p.ab;
      const rExit = NOZ.rDry + (NOZ.rWet - NOZ.rDry) * smoother(p.ab);
      const tilt = Math.asin((NOZ.r0 - rExit) / NOZ.len);
      for (const h of petals) h.rotation.x = -tilt;
      const {outer, core, diamonds} = flame.userData.parts;
      const a = smoother(Math.min(1, p.ab * 1.4));
      flame.visible = a > 0.01;
      const flick = 1 + 0.04 * Math.sin(t * 61) + 0.03 * Math.sin(t * 37);
      outer.scale.set(rExit * 0.92, rExit * 0.92, 3400 * a * flick);
      core.scale.set(rExit * 0.6, rExit * 0.6, 1900 * a * flick);
      outer.material.opacity = 0.42 * a;
      core.material.opacity = 0.5 * a;
      diamonds.forEach((d, i) => {
        d.position.z = -(380 + i * 520) * a;
        const r = rExit * (0.42 - i * 0.07);
        d.scale.set(r, r, r * 0.55);
        d.material.opacity = 0.55 * a * (1 - i * 0.2);
      });
      void noseWheel;
    },
    readout() {
      const m = st.mix;
      const f = (v) => (v >= 0 ? '+' : '') + v.toFixed(1).padStart(4);
      const rExit = NOZ.rDry + (NOZ.rWet - NOZ.rDry) * smoother(st.ab);
      return [
        `stabilators  L ${f(m.stabL)}°  R ${f(m.stabR)}°   (TE up +, limit ±25)`,
        `flaperons    L ${f(m.flapL)}°  R ${f(m.flapR)}°   (TE down +, +20 / -23)`,
        `rudder       ${f(m.rudder)}°   LE flaps ${f(m.lef)}°   speedbrakes ${st.sb.toFixed(0)}° (43 max gear down)`,
        `nozzle exit  ${(2 * rExit).toFixed(0)} mm   ${st.ab > 0.05 ? 'afterburner' : 'dry'}`,
        `wing  ${(SPEC.wingArea / 1e6).toFixed(2)} m² · AR ${SPEC.AR} · MAC ${(WING.mac / 1000).toFixed(2)} m · span ${(SPEC.spanRails / 1000).toFixed(2)} m`,
      ];
    },
    /** measured off the built geometry, in mm, against the published figures */
    probe() {
      root.updateMatrixWorld(true);
      const fv = flame.visible;
      flame.visible = false;
      const bb = new THREE.Box3();
      root.traverseVisible((o) => {
        if (o.isMesh && !o.userData.inkOnly) bb.expandByObject(o, true);
      });
      flame.visible = fv;
      const mm = (v) => +(v * 1000).toFixed(0);
      // stabilator tip span: the tip section's outermost point
      const tip = new THREE.Vector3(sides[0].stabTip, 0, 0).applyMatrix4(sides[0].stab.matrixWorld);
      const wl = new THREE.Vector3();
      L.wheel.getWorldPosition(wl);
      const nw = new THREE.Vector3();
      noseWheel.getWorldPosition(nw);
      const lowest = mm(bb.min.y);
      return {
        length: mm(bb.max.z - bb.min.z), lengthSpec: SPEC.length,
        span: mm(bb.max.x - bb.min.x), spanSpec: Math.round(SPEC.spanMissiles),
        height: mm(bb.max.y), heightSpec: SPEC.height,
        stabSpan: mm(2 * Math.abs(tip.x)), stabSpanSpec: Math.round(SPEC.hTailSpan),
        wheelbase: mm(nw.z - wl.z), wheelbaseSpec: SPEC.wheelbase,
        track: mm(2 * Math.abs(wl.x)), trackSpec: SPEC.track,
        lowest,
        mix: st.mix,
      };
    },
  };
}
