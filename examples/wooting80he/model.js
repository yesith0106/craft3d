// Wooting 80HE (ANSI) built on the manufacturer's own CAD. Opens as a technical drawing (general arrangement with
// dimensions, section A-A through the key stack, exploded build, the three typing angles); VITE_LOOK=real opens it
// shaded, with the six case finishes, PBT and ABS grain, per-key RGB, the LED bar and the braided cable (look.js).
//   from Wooting's published CAD (cad.js): top case, bottom case, PC plate, silicone pad, PCBA, PET film, EPDM foam,
//     the screw-in stabilisers, the LED bar (light pipe, lens, 10 LEDs), the USB-C daughterboard and its cable,
//     every screw and insert (drawn as plain cylinders at their CAD positions), the silicone feet
//   built here, since the CAD has none: 84 Lekker L60 V2 switches (MX-format housings), OEM-profile caps with legends,
//     a Hall sensor and an RGB LED under every key
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {box, cylY, kit} from '../craft/shapes.js';
import {exploder} from '../craft/rig.js';
import {BOXES, part} from './cad.js';
import {CAP, GRID, KEYS, SPEC, STACK, U, keyXZ, selfTest, stabSpan, ux, vz} from './kin.js';
import {keycap, loftRings, rrect} from './parts.js';
import {annotColor, dim, label, leader} from './annot.js';
import {FINISHES, braidTexture, glowTexture, grain, materials, rainbow} from './look.js';
import {spring} from '../craft/shapes.js';

export const info = {
  name: 'Wooting 80HE',
  description: 'ANSI · 84 keys · Lekker L60 V2 Hall-effect · PC plate · silicone gasket · 346 × 142 mm',
  stage: 'studio',
  wear: false,
  look: import.meta.env?.VITE_LOOK ?? 'drawing', // VITE_LOOK=real builds the shaded model
  palette: 'blueprint',
  floor: 'shadow',
  shadowBox: 0.32, // a keyboard, not a machine: a tight shadow box and a short AO reach
  aoRadius: 0.012,
  lines: {sil: 1.5, crease: 0.8, ghost: 0.8, creaseAngle: 34, hatch: 5},
  // the drawing sheet: border, header and title block (the viewer draws it in the drawing look)
  sheet: {
    marks: 'WOOTING 80HE · ANSI · GENERAL ARRANGEMENT · ALL DIMENSIONS IN MM',
    title: 'WOOTING 80HE',
    dwg: 'W80HE-GA-01',
    rows: [
      ['title', 'ANSI 84-key Hall-effect keyboard · general arrangement, section A–A, exploded build'],
      ['case', 'PCR ABS · 346 × 142 · 2.8° / 6° / 10°', 'units', 'mm · 1u = 19.05'],
      ['source', "Wooting published CAD (WootingKb/wooting-design, CERN-OHL-S-2.0) · wooting.io specifications · switches + keycaps modelled to MX / OEM standard"],
      ['projection', 'third angle · 1:1 model', 'drawn', 'craft3d'],
    ],
  },
};

const FEET = [
  {deg: 2.8, part: 'SI-CASE-FEET-PLUG_V5_18', name: '2.8° plugs'},
  {deg: 6, part: 'SILICONE_C-FEET_V5-6_31', name: '6° feet'},
  {deg: 10, part: 'SILICONE_C-FEET_V4_10_2', name: '10° feet'},
];
const CUT_U = 6.4; // the section runs through T, 6, F5, G, B and the spacebar
const CUT_X = ux(CUT_U);
const SECTION = {normal: [1, 0, 0], from: 0.19, to: -0.19, value: 0};
/** the section plane's x (metres) while the cut is open in the drawing look, else beyond the model */
const drawingNow = (p) => p.look === 'drawing';
const drawingCut = (p) => (p.look === 'drawing' && p.section > 0.001 ? SECTION.from + (SECTION.to - SECTION.from) * p.section : 1);

export function build({stage, ink}) {
  void stage;
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  const mat = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal, ...extra});
  const M = materials();
  M.cap = M.capBlack;
  const k = kit({boltMat: M.steel});

  // the keyboard in the CAD frame; tilted onto its feet below
  const kb = k.group(root);
  const G = (name) => k.group(kb);
  const groups = {top: G(), bottom: G(), plate: G(), pad: G(), stabs: G(), pcb: G(), pet: G(), foam: G(), switches: G(), caps: G(), feet: G(), cable: G()};
  const add = (name, parent, material, filter = () => true) => {
    const out = [];
    for (const p of part(name)) {
      if (!filter(p)) continue;
      for (const t of p.t) {
        const m = k.add(parent, p.geo, material);
        m.position.set(...t);
        out.push(m);
      }
    }
    if (!out.length) throw new Error(`no CAD part ${name}`);
    return out;
  };
  const [topCase] = add('TOPCASE_169', groups.top, M.case);
  const [bottomCase] = add('SOLID', groups.bottom, M.case);
  add('80HE_PLATE_ANSI_US_76', groups.plate, M.plate);
  add('80HE_SILICONPAD_V2-US-EU', groups.pad, M.pad);
  add('80HE_PCB_ANSI_US_8', groups.pcb, M.pcb);
  add('80HE_PCB-PET_FILM-V3_240322_', groups.pet, M.pet);
  add('EPDM_FOAM_V4_42', groups.foam, M.foam);
  // stabilisers: the shared ANSI/ISO model also has the ISO-Enter one standing vertically; leave it out
  add('STABILIZER-2P_2', groups.stabs, M.stab, (p) => p.bb[1][0] - p.bb[0][0] > 25);
  add('STABILIZER-6P25_3', groups.stabs, M.stab);
  // LED bar: the light pipe in the top case slot, its rubber lens, ten LEDs on the PCB
  const [pipe] = add('LIGHT_BAR_108', groups.top, M.pipe);
  add('LENS_RUBBER_V4_11', groups.pad, M.pad);
  const leds = add('LED_6028_3', groups.pcb, M.led);
  // USB-C daughterboard, its receptacle, the cable to the PCBA and its connectors; the cable's plug (off by default)
  add('BOARD_TYPE-C_PCB_2', groups.bottom, M.pcb);
  add('USB-4105_2', groups.bottom, M.steel);
  add('YJ-ZH1_5T-1-5Y_3', groups.bottom, M.conn);
  add('0A8205024H0010-3D_2', groups.bottom, M.plug);
  add('TYPE-C-PLUG_2', groups.cable, M.plug);
  // feet: three front pads always; one rear pair per typing angle
  const front = add('SILICONE-CASE-FEET_V5_1', groups.feet, M.rubber);
  const rear = FEET.map((f) => add(f.part, groups.feet, M.rubber));

  // screws and inserts at their CAD positions (threads left out): head at the end they are driven from
  const fastener = (bb, {head = 'bottom', insert = false} = {}) => {
    const [a, b] = bb;
    const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2, h = b[1] - a[1];
    const d = Math.min(b[0] - a[0], b[2] - a[2]);
    if (insert) return cylY(d / 2, h, 20).translate(cx, a[1] + h / 2, cz).toNonIndexed();
    const hh = Math.min(1.3, h * 0.3);
    const shank = cylY(d > 5 ? 1.3 : 1.0, h - hh, 14).translate(cx, head === 'bottom' ? a[1] + hh + (h - hh) / 2 : a[1] + (h - hh) / 2, cz);
    const hd = cylY(d / 2, hh, 20).translate(cx, head === 'bottom' ? a[1] + hh / 2 : b[1] - hh / 2, cz);
    return mergeGeometries([shank.toNonIndexed(), hd.toNonIndexed()]);
  };
  const fasteners = (name, parent, material, o) => {
    const geos = BOXES[name].map((bb) => fastener(bb, o));
    for (const g of geos) g.deleteAttribute('uv');
    return k.add(parent, mergeGeometries(geos), material);
  };
  fasteners('SCREW_M2X5_CASE-0SMP200500A100_', groups.bottom, M.steel, {head: 'bottom'}); // 7 case screws, from below
  fasteners('INSERT_M2X3L_5', groups.top, M.brass, {insert: true}); // their inserts in the top case
  fasteners('SCREW-M2X4_3', groups.pcb, M.steel, {head: 'bottom'}); // 16 plate-assembly screws, from under the PCB
  fasteners('INSERT_M2X3MM_1', groups.pad, M.brass, {insert: true}); // their inserts, through the pad
  fasteners('SCREW_FLAT_T2_0X4_0L_2', groups.top, M.steel, {head: 'bottom'}); // the light pipe's two screws
  fasteners('SCREW_M2P6X5P5_SELF-TAPE__8', groups.bottom, M.steel, {head: 'top'}); // the daughterboard's two

  // ------------------------------------------------------------------ switches, built: Lekker L60 V2, MX format
  const centres = KEYS.map((key) => {
    const [x, z] = keyXZ(key);
    return {key, x, z, span: stabSpan(key.w)};
  });
  const inst = (geo, material, list, parent) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach(([x, y, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    im.castShadow = true;
    parent.add(im);
    return im;
  };
  const ring = (s, rr, y) => rrect(s, s, rr, 3).map(([x, z]) => [x, y, z]);
  const topHouse = loftRings([ring(15.6, 1.0, 0), ring(15.6, 1.0, 0.9), ring(15.1, 1.2, 1.5), ring(14.0, 1.9, STACK.housingTop)]);
  const botHouse = loftRings([ring(13.9, 0.8, -STACK.housingBelow), ring(13.9, 0.8, 0)]);
  const stemGeo = mergeGeometries([box(4.1, 4.0, 1.32, 0, 2.0, 0), box(1.17, 4.0, 4.1, 0, 2.0, 0), box(5.6, 1.2, 5.6, 0, -0.6, 0)].map((g) => g.toNonIndexed()));
  groups.switches.userData.noCut = true;
  const houses = [inst(topHouse, M.house, centres.map((c) => [c.x, 0, c.z]), groups.switches), inst(botHouse, M.houseB, centres.map((c) => [c.x, 0, c.z]), groups.switches)];
  const stemBase = STACK.stemTop - 4.0;
  const stems = inst(stemGeo, M.stem, centres.map((c) => [c.x, stemBase, c.z]), groups.switches);
  houses[0].userData.ink = 'solid'; // clear PC in the realistic look, a solid outline in the drawing
  stage?.noAO?.push(houses[0]);
  // the spring inside each switch, seen through the clear top housing (realistic look only) [std MX: 15 mm free,
  // about 5.3 mm across, 0.4 mm wire]; it squeezes as the key goes down
  const springGeo = spring(2.55, 0.2, 9, 6.4, 180);
  const springs = inst(springGeo, M.spring, centres.map((c) => [c.x, -3.4, c.z]), groups.switches);
  springs.userData.realOnly = true;
  // the light under each cap: per-key RGB, spilling into the gaps between caps like the real board
  const glowMat = new THREE.MeshBasicMaterial({map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false});
  const glow = inst(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), glowMat, centres.map((c) => [c.x, STACK.capSeat - 0.6, c.z]), groups.switches);
  glow.castShadow = false;
  glow.userData.realOnly = true;
  glow.userData.ink = 'hide';
  glow.renderOrder = 3;
  stage?.noAO?.push(glow);
  for (let i = 0; i < centres.length; i++) glow.setColorAt(i, new THREE.Color(0, 0, 0));
  // on the PCBA, under every key [std MX footprint]: the Hall sensor below the stem's magnet, the RGB LED to the north
  inst(box(2.9, 1.1, 1.6), M.ic, centres.map((c) => [c.x, STACK.pcbTop + 0.55, c.z]), groups.pcb);
  inst(box(3.4, 0.8, 2.8), M.led, centres.map((c) => [c.x, STACK.pcbTop + 0.4, c.z - 5.08]), groups.pcb);

  // ------------------------------------------------------------------ keycaps: OEM profile, scaled to the spec's 28.4
  // tilt onto the 2.8 degree plugs first: the cap heights are calibrated there
  const tilt = FEET.map((f, i) => solveTilt(front, rear[i]));
  const place = (i) => {
    kb.rotation.x = tilt[i].th;
    kb.position.y = tilt[i].lift;
    kb.updateMatrix();
    root.updateMatrixWorld(true);
  };
  place(0);
  const kbM = () => kb.matrix.clone();
  const capFor = (w, r, s) => keycap(w * U - (U - CAP.base), CAP.base, {h: CAP.rows[r].h * s, tilt: CAP.rows[r].tilt});
  const frontKey = centres.find((c) => c.key.l === 'Ctrl');
  const frontTop = (s) => {
    const g = capFor(frontKey.key.w, 4, s);
    const P = g.attributes.position;
    const v = new THREE.Vector3();
    const m = kbM();
    let max = -Infinity;
    for (let i = 0; i < P.count; i++) max = Math.max(max, v.fromBufferAttribute(P, i).add(new THREE.Vector3(frontKey.x, STACK.capSeat, frontKey.z)).applyMatrix4(m).y);
    return max;
  };
  const t1 = frontTop(1);
  const t2 = frontTop(1.2);
  const SCALE = 1 + (0.2 * (SPEC.hFrontCaps - t1)) / (t2 - t1);

  const capCache = new Map();
  const capGeo = (key) => {
    const id = `${key.w}-${key.r}`;
    if (!capCache.has(id)) {
      const g = capFor(key.w, key.r, SCALE);
      const top = g.userData.top;
      // the cross-stem boss, and on 2u and up the stabiliser stems, from the cap's inside down to the stems
      const span = stabSpan(key.w);
      const bosses = [0, ...(span ? [-span / 2, span / 2] : [])].map((x) => {
        const yTop = top(x, 0) - 1.3;
        const y0 = STACK.stemTop - STACK.capSeat - 3.8;
        return cylY(2.75, yTop - y0, 20).translate(x, y0 + (yTop - y0) / 2, 0).toNonIndexed();
      });
      for (const b of bosses) b.deleteAttribute('uv');
      const gg = mergeGeometries([g.index ? g.toNonIndexed() : g, ...bosses]);
      gg.userData.top = top;
      capCache.set(id, gg);
    }
    return capCache.get(id);
  };
  // the legends: one atlas, a cell per key, laid on each cap's dished top
  const CELL = 160;
  const NC = 10;
  const cv = document.createElement('canvas');
  cv.width = cv.height = CELL * NC;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  const SHIFTED = {'`': '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?'};
  const NAMES = {Backspace: '⟵', Enter: '↵', Shift: '⇧', Caps: '⇪', Tab: '⇥', Win: 'W'};
  KEYS.forEach((key, i) => {
    const x0 = (i % NC) * CELL;
    const y0 = Math.floor(i / NC) * CELL;
    const l = NAMES[key.l] ?? key.l;
    if (SHIFTED[l] !== undefined) {
      cx.font = '600 50px ui-sans-serif, Helvetica, Arial, sans-serif';
      cx.fillText(l, x0 + CELL * 0.34, y0 + CELL * 0.3);
      cx.fillText(SHIFTED[l], x0 + CELL * 0.66, y0 + CELL * 0.3);
    } else if (l) {
      cx.font = `600 ${l.length > 4 ? 30 : l.length > 2 ? 36 : 50}px ui-sans-serif, Helvetica, Arial, sans-serif`;
      cx.fillText(l, x0 + CELL / 2, y0 + CELL * 0.3);
    }
  });
  const atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  const legendMat = new THREE.MeshBasicMaterial({map: atlas, color: '#dfe6ee', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2});
  legendMat.clippingPlanes = ink?.planes ?? null; // the section cuts the legends with their caps
  const legendMats = [];
  const caps = [];
  centres.forEach((c, i) => {
    const g = k.group(groups.caps, c.x, STACK.capSeat, c.z);
    g.userData.base = g.position.y;
    const geo = capGeo(c.key);
    k.add(g, geo, M.cap);
    const lw = 12.0;
    const lg = new THREE.PlaneGeometry(lw, lw, 10, 10).rotateX(-Math.PI / 2);
    const P = lg.attributes.position;
    const UV = lg.attributes.uv;
    const col = i % NC;
    const rowI = Math.floor(i / NC);
    for (let j = 0; j < P.count; j++) {
      P.setY(j, geo.userData.top(P.getX(j), P.getZ(j)) + 0.06);
      UV.setXY(j, (col + UV.getX(j)) / NC, 1 - (rowI + 1 - UV.getY(j)) / NC);
    }
    const lmat = legendMat.clone();
    lmat.clippingPlanes = ink?.planes ?? null; // clone() copies the plane; share the live one
    legendMats.push(lmat);
    const lm = new THREE.Mesh(lg, lmat);
    lm.userData.ink = 'color';
    lm.renderOrder = 2;
    g.add(lm);
    caps.push(g);
  });

  // ------------------------------------------------------------------ annotations
  const notes = k.group(kb); // callouts for the section, in the CAD frame
  notes.userData.inkOnly = true;
  const C = (y, z) => [CUT_X, y, z];
  // the layer stack, read at the number row, labelled in a column behind the board (top to bottom, so no leader
  // crosses another); the case parts in a column in front
  const zS = vz(1.75);
  const back = [
    [C(STACK.capSeat + 6.5, zS), 'OEM-profile PBT keycap'],
    [C(5.0, zS - 8.2), 'Lekker L60 V2 Hall-effect switch · 4.0 travel'],
    [C(-0.75, zS - 5.5), 'switch plate · polycarbonate 1.5'],
    [C(-3.3, zS - 5.5), 'silicone gasket pad 3.5 · plate to PCBA'],
    [C(-5.8, zS - 4), 'PCBA 1.6 · Hall sensor + RGB LED per key'],
    [C(-7.82, zS - 2), 'PET film 0.35'],
    [C(-8.9, zS), 'EPDM foam 3.0'],
  ];
  back.forEach(([a, t], i) => notes.add(leader(a, C(40 - i * 7, -80), t, {size: 2.9, shoulder: 0, align: 'left'})));
  const frontC = [
    [C(2.5, vz(5.75) + 2), C(40, 80), 'spacebar · screw-in stabiliser, 100 c/c'],
    [C(7.5, 66.5), C(31, 80), 'top case · PCR ABS'],
    [C(-11.4, 58), C(22, 80), 'silicone foot · 3 across the front'],
    [C(-7, 68.4), C(13, 80), 'bottom case · PCR ABS, 2.8° floor'],
  ];
  for (const [a, b, t] of frontC) notes.add(leader(a, b, t, {size: 2.9, shoulder: 0, align: 'right'}));
  notes.add(label('SECTION  A–A', [CUT_X, 52, 0], {size: 5, bold: true}));
  // the section line on the plan: A-A across the deck
  const secLine = k.group(kb);
  secLine.userData.inkOnly = true;
  secLine.add(leader([CUT_X, 7.7, -71], [CUT_X, 7.7, -82], 'A', {size: 5, dot: false, shoulder: 0}));
  secLine.add(leader([CUT_X, 7.7, 66], [CUT_X, 7.7, 78], 'A', {size: 5, dot: false, shoulder: 0}));

  const dims = k.group(root);
  dims.userData.inkOnly = true;
  let dimFor = -1;
  const caseBox = () => {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const b = new THREE.Box3();
    for (const o of [topCase, bottomCase]) b.union(new THREE.Box3().setFromObject(o, true).applyMatrix4(inv));
    return b;
  };
  // height of the top face above the desk at the front and back edges, along the centre line
  const faceAt = (z) => new THREE.Vector3(0, STACK.topFace, z).applyMatrix4(kb.matrix).y;
  const capsTopFront = () => {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const g = caps[centres.indexOf(frontKey)];
    return new THREE.Box3().setFromObject(g.children[0], true).applyMatrix4(inv).max.y;
  };
  const buildDims = (i) => {
    dims.clear();
    const b = caseBox();
    const L = b.max.x - b.min.x;
    const D = b.max.z - b.min.z;
    const zF = b.max.z;
    const zB = b.min.z;
    const hF = faceAt(68.41);
    const hB = faceAt(-74.41);
    const hC = capsTopFront();
    dims.add(dim([b.min.x, 0, zF], [b.max.x, 0, zF], [0, 0, 1], 30, {text: `${L.toFixed(1)}`}));
    dims.add(dim([b.max.x, 0, zB], [b.max.x, 0, zF], [1, 0, 0], 36, {text: `${D.toFixed(1)}`}));
    dims.add(dim([b.max.x, 0, zF], [b.max.x, hF, zF], [1, 0, 0], 14, {text: `${hF.toFixed(1)}`, size: 5, arrowLen: 3}));
    dims.add(dim([b.max.x, 0, zB], [b.max.x, hB, zB], [1, 0, 0], 14, {text: `${hB.toFixed(1)}`, size: 5, arrowLen: 3}));
    const zc = new THREE.Vector3(frontKey.x, 0, frontKey.z).applyMatrix4(kb.matrix).z;
    dims.add(dim([b.min.x, 0, zc], [b.min.x, hC, zc], [-1, 0, 0], 16, {text: `${hC.toFixed(1)} with caps`, size: 5, arrowLen: 3}));
    dims.add(label(`${FEET[i].name} · ${(tilt[i].th * 180 / Math.PI).toFixed(2)}°`, [b.max.x + 48, 0, zB - 4], {size: 4.6, align: "left"}));
    const pc = (x, z) => new THREE.Vector3(x, STACK.topFace + 0.2, z).applyMatrix4(kb.matrix).toArray();
    dims.add(dim(pc(ux(0), vz(0)), pc(ux(GRID.w), vz(0)), [0, 0, -1], 26, {text: `${(GRID.w * U).toFixed(2)}  key field 17.25u`, size: 5}));
    dims.add(dim(pc(ux(1.25), vz(0)), pc(ux(2.25), vz(0)), [0, 0, -1], 8, {text: `${U}  1u`, size: 4, arrowLen: 2.6}));
    dims.add(dim(pc(ux(0), vz(0)), pc(ux(0), vz(GRID.h)), [-1, 0, 0], 22, {text: `${(GRID.h * U).toFixed(2)}  6.25u`, size: 4.6}));
    dims.traverse((o) => o.material?.isLineMaterial && o.material.resolution.set(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio));
    dimFor = i;
    palette = ''; // recolour the new labels
  };

  // ------------------------------------------------------------------ exploded view: up the plate normal, top first
  const ex = exploder([
    {obj: groups.caps, dir: [0, 1, 0], dist: 175, at: 0},
    {obj: groups.switches, dir: [0, 1, 0], dist: 132, at: 0.05},
    {obj: groups.top, dir: [0, 1, 0], dist: 102, at: 0.1},
    {obj: groups.plate, dir: [0, 1, 0], dist: 78, at: 0.16},
    {obj: groups.stabs, dir: [0, 1, 0], dist: 63, at: 0.2},
    {obj: groups.pad, dir: [0, 1, 0], dist: 50, at: 0.24},
    {obj: groups.pcb, dir: [0, 1, 0], dist: 32, at: 0.28},
    {obj: groups.pet, dir: [0, 1, 0], dist: 20, at: 0.32},
    {obj: groups.foam, dir: [0, 1, 0], dist: 11, at: 0.36},
  ], {span: 0.6});

  // ------------------------------------------------------------------ live state
  const st = {t: 0, travel: new Float32Array(centres.length), feet: 0, th: tilt[0].th, lift: tilt[0].lift};
  const m4 = new THREE.Matrix4();
  const typing = 'WOOTING80HE'.split('').map((ch) => centres.findIndex((c) => c.key.l === ch)).filter((i) => i >= 0);
  const cutKeys = centres.map((c, i) => (Math.abs(c.x - CUT_X) < (c.key.w * U) / 2 ? i : -1)).filter((i) => i >= 0);
  let palette = '';
  // the LED bar: ten LEDs on the PCB under a frosted light pipe; the pipe glows with the colour of the LED below
  const ledMats = leds.map(() => new THREE.MeshStandardMaterial({color: '#ffffff', emissive: '#000000', roughness: 0.3}));
  leds.forEach((m, i) => (m.material = ledMats[i]));
  M.pipe.onBeforeCompile = (sh) => {
    sh.uniforms.uT = {value: 0};
    sh.uniforms.uOn = {value: 1};
    M.pipe.userData.sh = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uT, uOn;
varying vec3 vP;
vec3 hsl2rgb(float h) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return 0.55 + (k - 0.5) * 0.9; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float h = (vP.x + 173.0) / 346.0 * 0.85 + uT * 0.05;
    float seg = smoothstep(0.0, 0.6, 0.5 - abs(fract((vP.x - 129.96) / 3.4 + 0.5) - 0.5) * 0.7);
    float top = smoothstep(4.0, 7.5, vP.y);
    totalEmissiveRadiance += hsl2rgb(fract(h)) * uOn * (0.25 + 0.6 * top) * (0.7 + 0.3 * seg);
  }`);
  };
  M.pipe.customProgramCacheKey = () => 'ledpipe';
  // the braided USB-C cable from the plug, back and down onto the desk, laid out again whenever the feet change
  const braid = braidTexture();
  braid.repeat.set(90, 2);
  const cableMat = grain(new THREE.MeshStandardMaterial({map: braid, roughness: 0.75}), {scale: 5, bump: 0.02, rough: 0.05, tint: 0});
  let cable = null;
  const layCable = () => {
    if (cable) {
      groups.cable.remove(cable);
      cable.geometry.dispose();
    }
    root.updateMatrixWorld(true);
    const inv = kb.matrix.clone().invert();
    const toKb = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(inv);
    const end = new THREE.Vector3(-142.7, -11.6, -140.4).applyMatrix4(kb.matrix); // the plug's tail, desk frame
    const r = 2.1;
    const pts = [toKb(end.x, end.y, end.z), toKb(end.x - 2, end.y - 2, end.z - 22), toKb(end.x - 14, r + 3, end.z - 52), toKb(end.x - 40, r, end.z - 80), toKb(end.x - 90, r, end.z - 104), toKb(end.x - 170, r, end.z - 118)];
    const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((v) => v), false, 'centripetal'), 220, r, 16, false);
    cable = k.add(groups.cable, tg, cableMat);
    cable.userData.realOnly = true;
  };
  layCable();
  let cableFor = 0;
  void pipe;
  let finishNow = -1;
  const cutColor = new THREE.Color();

  return {
    root,
    focus: [0, 0.02, 0],
    radius: 0.2,
    view: {az: 24, el: 32, d: 3.9, target: [0.07, 0.0, 0.04]},
    section: SECTION,
    params: [
      {key: 'finish', label: 'case: ABS black/ghost/frost · zinc black/raw/white', min: 0, max: 5, step: 1, value: 0, real: true},
      {key: 'rgb', label: 'RGB backlight', min: 0, max: 1, step: 0.01, value: 0.85, real: true},
      {key: 'feet', label: 'feet: 2.8° / 6° / 10°', min: 0, max: 2, step: 1, value: 0},
      {key: 'travel', label: 'key travel (section keys)', min: 0, max: SPEC.travel, step: 0.05, value: 0, unit: 'mm'},
      {key: 'typing', label: 'typing demo', min: 0, max: 1, step: 1, value: 0},
      {key: 'explode', label: 'exploded view', min: 0, max: 1, step: 0.01, value: 0},
      {key: 'dims', label: 'dimensions + callouts', min: 0, max: 1, step: 1, value: 1},
      {key: 'cable', label: 'USB-C cable', min: 0, max: 1, step: 1, value: import.meta.env?.VITE_LOOK === 'real' ? 1 : 0},
    ],
    update(dt, t, p) {
      st.t += dt;
      // typing angle: ease between the three foot settings
      const fi = Math.round(p.feet);
      st.th += (tilt[fi].th - st.th) * Math.min(1, dt * 6);
      st.lift += (tilt[fi].lift - st.lift) * Math.min(1, dt * 6);
      kb.rotation.x = st.th;
      kb.position.y = st.lift;
      kb.updateMatrix();
      FEET.forEach((f, i) => rear[i].forEach((m) => (m.visible = i === fi)));
      const settled = Math.abs(st.th - tilt[fi].th) < 1e-4;
      if (settled && dimFor !== fi) buildDims(fi);
      // key travel: the section column by the slider; the typing demo spells WOOTING80HE
      for (let i = 0; i < centres.length; i++) st.travel[i] = cutKeys.includes(i) ? p.travel : 0;
      if (p.typing > 0.5) {
        const ph = (st.t * 3) % (typing.length + 3);
        typing.forEach((ki, j) => {
          const d = ph - j;
          if (d > 0 && d < 1) st.travel[ki] = Math.max(st.travel[ki], SPEC.travel * Math.sin(Math.PI * d));
        });
      }
      caps.forEach((g, i) => (g.position.y = g.userData.base - st.travel[i]));
      // the section leaves switches whole: show the ones that reach the kept side (x <= cut), hide the rest
      const cut = drawingCut(p) * 1000;
      const keep = (c) => c.x - 7.8 <= cut;
      centres.forEach((c, i) => {
        const s = keep(c) ? 1 : 0;
        stems.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(c.x, stemBase - st.travel[i], c.z));
        for (const h of houses) h.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(c.x, 0, c.z));
      });
      stems.instanceMatrix.needsUpdate = true;
      for (const h of houses) h.instanceMatrix.needsUpdate = true;
      ex.set(p.explode);
      // springs squeeze with the stem: free length in the housing 6.4 mm at rest, 4 mm shorter at the bottom
      centres.forEach((c, i) => {
        const sOn = keep(c) ? 1 : 0;
        springs.setMatrixAt(i, m4.makeScale(sOn, ((6.4 - st.travel[i]) / 6.4) * sOn, sOn).setPosition(c.x, -3.4, c.z));
      });
      springs.instanceMatrix.needsUpdate = true;
      // finish: the case material, and the caps that ship with it (Just White on Frost and Zinc White)
      const fin = Math.round(p.finish ?? 0);
      if (fin !== finishNow) {
        finishNow = fin;
        FINISHES[fin].set(M.case);
        M.case.needsUpdate = true;
        const capM = FINISHES[fin].caps ? M.capWhite : M.capBlack;
        for (const g of caps) g.children[0].material = capM;
        palette = '';
      }
      // RGB: the rainbow drifts across the board; legends shine through, the gaps glow, the LED bar follows
      const on = p.rgb ?? 0;
      const white = FINISHES[fin].caps === 1;
      if (!drawingNow(p)) {
        centres.forEach((c, i) => {
          rainbow(c.x, st.t, cutColor);
          glow.setColorAt(i, cutColor.clone().multiplyScalar(on * 2.4));
          const lm = legendMats[i];
          if (white) lm.color.set('#7d8086').lerp(cutColor, on * 0.6);
          else lm.color.set('#9a9da2').lerp(cutColor.clone().multiplyScalar(1.6), on);
        });
        glow.instanceColor.needsUpdate = true;
        ledMats.forEach((m, i) => m.emissive.copy(rainbow(129.96 + i * 3.4, st.t, cutColor)).multiplyScalar(on * 1.5));
        const sh = M.pipe.userData.sh;
        if (sh) {
          sh.uniforms.uT.value = st.t;
          sh.uniforms.uOn.value = on;
        }
      }
      if (settled && cableFor !== fi) {
        layCable();
        cableFor = fi;
      }
      groups.cable.visible = p.cable > 0.5;
      const drawing = p.look === 'drawing';
      const quiet = p.explode < 0.02;
      dims.visible = drawing && p.dims > 0.5 && quiet && settled && !(p.section > 0.02);
      notes.visible = drawing && p.dims > 0.5 && quiet && p.section > 0.02;
      secLine.visible = drawing && p.dims > 0.5 && quiet && !(p.section > 0.02);
      const pal = (ink?.look?.palette ?? 'blueprint') + p.look;
      if (pal !== palette) {
        palette = pal;
        const dark = pal.startsWith('blueprint');
        annotColor(dark ? '#eef4fb' : '#1d2024', dark ? '#b9d3f0' : '#3b4148', root);
        if (drawing) for (const m of legendMats) m.color.set(dark ? '#dfe6ee' : '#1d2024');
      }
    },
    readout() {
      const fi = dimFor < 0 ? 0 : dimFor;
      return [
        `case     ${SPEC.length} x ${SPEC.depth} mm · PCR ABS ${SPEC.massAbs} g · zinc ${SPEC.massZinc} g`,
        `angle    ${FEET[fi].name}: ${(tilt[fi].th * 180 / Math.PI).toFixed(2)}° · front ${faceAt(68.41).toFixed(1)} · back ${faceAt(-74.41).toFixed(1)} mm`,
        `keys     84 · Lekker L60 V2 · 4.0 mm travel · 17.25u x 6.25u`,
        `stack    plate 1.5 PC · pad 3.5 · PCB 1.6 · PET 0.35 · foam 3.0`,
        `caps     OEM, x${SCALE.toFixed(3)} to the spec's ${SPEC.hFrontCaps} mm front height`,
      ];
    },
    probe() {
      place(dimFor < 0 ? 0 : dimFor);
      const b = caseBox();
      const out = {
        length: +(b.max.x - b.min.x).toFixed(2),
        depth: +(b.max.z - b.min.z).toFixed(2),
        frontFace: +faceAt(68.41).toFixed(2),
        backFace: +faceAt(-74.41).toFixed(2),
        capsFront: +capsTopFront().toFixed(2),
        capScale: +SCALE.toFixed(4),
        tilt: tilt.map((q) => +((q.th * 180) / Math.PI).toFixed(3)),
        lowest: +b.min.y.toFixed(3),
        layout: selfTest(),
      };
      return out;
    },
  };
}

/** the tilt that puts both the front pads and a rear foot pair on the desk, and the lift that sets them on y = 0 */
function solveTilt(front, rear) {
  const pts = (meshes) => {
    const out = [];
    for (const m of meshes) {
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) out.push([P.getY(i) + m.position.y, P.getZ(i) + m.position.z]);
    }
    return out;
  };
  const F = pts(front);
  const R = pts(rear);
  const low = (S, th) => {
    const c = Math.cos(th), s = Math.sin(th);
    let m = Infinity;
    for (const [y, z] of S) m = Math.min(m, y * c - z * s);
    return m;
  };
  let a = 0, b = 0.3;
  for (let i = 0; i < 60; i++) {
    const th = (a + b) / 2;
    if (low(F, th) - low(R, th) > 0) a = th;
    else b = th;
  }
  const th = (a + b) / 2;
  return {th, lift: -Math.min(low(F, th), low(R, th))};
}
