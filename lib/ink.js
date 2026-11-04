// The drawing look: a model rendered as a technical ink illustration instead of shaded metal. Same scene, same
// model, same motion; only the way it is drawn changes, so one toggle switches between the two.
//
//   const ink = createInk(stage, {palette: 'paper'});   ink.render() in place of stage.render()
//
// How it draws, every frame:
//   1. solid pass   every opaque mesh -> view normal, a part id and depth (its own float target). Back faces seen
//                   through the section plane are flagged: they are the cut faces.
//   2. ghost pass   every see-through mesh (x-ray casings, glass) the same way, on its own target: phantom lines.
//   3. colour pass  sprites, lines, flow lines and anything tagged userData.ink = 'color', drawn with their own
//                   materials, hidden behind the solids by a depth-only pre-pass.
//   4. composite    edges come from the buffers, not the triangles: a part-id change or a depth step is a silhouette
//                   (thick line), a normal change sharper than `crease` is a crease (thin line). Hidden lines vanish
//                   because only the front surface is in the buffers. Cut faces get a tint and hatching.
//
// Tags a model can set on any object (they apply to its whole subtree):
//   userData.ink = 'color'   draw with its own material on top of the drawing (gas, sparks, flow lines, labels)
//   userData.ink = 'ghost'   always draw as phantom lines;  'solid': always as solid ink, even if transparent
//   userData.ink = 'hide'    leave out of the drawing;  userData.inkOnly / realOnly: shown in one look only
//   userData.noCut = true    the section plane does not cut it (shafts, pistons, fasteners: drawings leave them whole)
import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

export const PALETTES = {
  // warm paper, black ink, blue section fill: an engineering illustration
  paper: {paper: '#f6f3ee', fill: '#fbfaf7', ink: '#1d2024', ghost: '#8d96a0', cut: '#c9d9e8', cutInk: '#5b7fa6', shade: 0.07},
  // white lines on blueprint blue
  blueprint: {paper: '#163e6e', fill: '#1a4679', ink: '#e9f1fb', ghost: '#7ea3cc', cut: '#2a5f99', cutInk: '#b9d3f0', shade: 0.05},
  // pure black on white, no shading: for print and line-art exports
  print: {paper: '#ffffff', fill: '#ffffff', ink: '#000000', ghost: '#9a9a9a', cut: '#e4e4e4', cutInk: '#555555', shade: 0},
};

const ID_VERT = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
uniform float uId;
varying vec3 vN;
flat varying float vPart;
void main() {
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  vN = normalize(transformedNormal);
  float id = uId;
  #ifdef USE_INSTANCING
    id += float(gl_InstanceID) * 7.31;
  #endif
  // a hash quantised to 1/512 so a half-float target holds it exactly
  vPart = (floor(fract(id * 0.6180339) * 440.0) + 50.0) / 512.0;
}`;
const ID_FRAG = /* glsl */ `
#include <clipping_planes_pars_fragment>
uniform float uCut;
varying vec3 vN;
flat varying float vPart;
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN);
  float a = vPart;
  if (!gl_FrontFacing) {
    if (uCut > 0.5) { n = vec3(0.0, 0.0, 1.0); a = -vPart; } // looking into a cut part: this pixel is cut face
    else n = -n;
  }
  gl_FragColor = vec4(n, a);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tS, tSD, tG, tGD, tC;
uniform vec2 px;
uniform float near, far, wSil, wCrease, wGhost, shade, depthK, creaseK, hatch, hasG, hasC;
uniform vec3 cPaper, cFill, cInk, cGhost, cCut, cCutInk;
varying vec2 vUv;
float inv(float d) { return d >= 1.0 ? 0.0 : (far - (far - near) * d) / (near * far); } // 1 / distance, affine on a plane
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
// silhouettes (part change, depth step) at radius rs, creases (normal change) at radius rc
float edge(sampler2D tn, sampler2D td, vec2 uv, float rs, float rc) {
  vec4 c = texture2D(tn, uv);
  float z = inv(texture2D(td, uv).x);
  float sil = 0.0, cre = 0.0;
  vec2 dirs[4];
  dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(0.0, 1.0); dirs[2] = vec2(0.7071, 0.7071); dirs[3] = vec2(0.7071, -0.7071);
  for (int i = 0; i < 4; i++) {
    vec2 o = dirs[i] * px;
    vec4 a = texture2D(tn, uv + o * rs), b = texture2D(tn, uv - o * rs);
    float za = inv(texture2D(td, uv + o * rs).x), zb = inv(texture2D(td, uv - o * rs).x);
    float idStep = max(step(0.0009, abs(a.a - c.a)), step(0.0009, abs(b.a - c.a)));
    float lap = abs(za + zb - 2.0 * z) / max(max(za, zb), max(z, 1e-6));
    sil = max(sil, max(idStep, smoothstep(depthK, depthK * 2.5, lap)));
    vec4 a2 = texture2D(tn, uv + o * rc), b2 = texture2D(tn, uv - o * rc);
    if (c.a != 0.0 && a2.a == c.a && b2.a == c.a) {
      float d = max(1.0 - dot(a2.xyz, c.xyz), 1.0 - dot(b2.xyz, c.xyz));
      cre = max(cre, smoothstep(creaseK, creaseK * 1.8, d));
    }
  }
  return max(sil, cre * 0.8);
}
void main() {
  vec4 s = texture2D(tS, vUv);
  float sd = texture2D(tSD, vUv).x;
  vec3 col = cPaper;
  if (s.a > 0.0) {
    float l = clamp(dot(s.xyz, normalize(vec3(-0.35, 0.55, 0.75))), 0.0, 1.0);
    col = cFill * (1.0 - shade + shade * l);
  } else if (s.a < 0.0) {
    col = cCut;
    if (hatch > 0.0 && mod(gl_FragCoord.x + gl_FragCoord.y, hatch) < 1.1) col = mix(col, cCutInk, 0.55);
  }
  if (hasC > 0.5) {
    vec4 c = texture2D(tC, vUv);
    if (c.a > 0.002) col = col * (1.0 - c.a) + toSRGB(c.rgb / c.a) * c.a;
  }
  if (hasG > 0.5) {
    float gd = texture2D(tGD, vUv).x;
    float front = step(gd, sd + 1e-5); // ghost lines behind a solid stay hidden
    float g = edge(tG, tGD, vUv, wGhost * 0.5, wGhost * 0.5) * front;
    col = mix(col, cGhost, g * 0.85);
  }
  float e = edge(tS, tSD, vUv, wSil * 0.5, wCrease * 0.5);
  col = mix(col, s.a < 0.0 ? cCutInk * 0.6 : cInk, e);
  gl_FragColor = vec4(col, 1.0);
}`;

const target = () => {
  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter});
  rt.depthTexture = new THREE.DepthTexture(4, 4, THREE.FloatType);
  return rt;
};

export function createInk(stage, {palette = 'paper', sil = 2.2, crease = 1.2, ghost = 1.0, creaseAngle = 32, depthK = 0.012, hatch = 7} = {}) {
  const {renderer, scene, camera} = stage;
  const rtS = target();
  const rtG = target();
  const rtC = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType});
  rtC.depthBuffer = true;

  // the section plane: keeps n·p <= offset (world metres). Kept in place when off (far away) so no shader recompiles.
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e6);
  const CUT = [plane];
  const NONE = [];
  const uCut = {value: 0};
  const NO_CUT = {value: 0}; // parts the plane does not cut never show cut faces
  const section = {on: false, normal: new THREE.Vector3(0, 0, 1), offset: 0};
  const setSection = (normal, offset) => {
    if (normal == null) {
      section.on = false;
      plane.constant = 1e6;
      uCut.value = 0;
      return;
    }
    section.on = true;
    section.normal.set(...normal).normalize();
    section.offset = offset;
    plane.normal.copy(section.normal).negate();
    plane.constant = offset;
    uCut.value = 1;
  };

  let nextId = 1;
  const idMats = new WeakMap(); // mesh -> its id material (one per mesh: the id is a uniform)
  const idMat = (mesh, cut) => {
    let m = idMats.get(mesh);
    if (!m || m.userData.cut !== cut) {
      m = new THREE.ShaderMaterial({vertexShader: ID_VERT, fragmentShader: ID_FRAG, uniforms: {uId: {value: nextId++}, uCut: cut ? uCut : NO_CUT}, side: THREE.DoubleSide, clipping: true});
      m.clippingPlanes = cut ? CUT : NONE;
      m.userData.cut = cut;
      idMats.set(mesh, m);
    }
    return m;
  };
  const depthCut = new THREE.MeshBasicMaterial({colorWrite: false, side: THREE.DoubleSide, clippingPlanes: CUT});
  const depthAll = new THREE.MeshBasicMaterial({colorWrite: false, side: THREE.DoubleSide});

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const comp = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMPOSITE,
    uniforms: {
      tS: {value: rtS.texture}, tSD: {value: rtS.depthTexture}, tG: {value: rtG.texture}, tGD: {value: rtG.depthTexture}, tC: {value: rtC.texture},
      px: {value: new THREE.Vector2()}, near: {value: 0.05}, far: {value: 100},
      wSil: {value: sil}, wCrease: {value: crease}, wGhost: {value: ghost}, shade: {value: 0}, depthK: {value: depthK}, creaseK: {value: 1 - Math.cos(THREE.MathUtils.degToRad(creaseAngle))},
      hatch: {value: hatch}, hasG: {value: 0}, hasC: {value: 0},
      cPaper: {value: new THREE.Color()}, cFill: {value: new THREE.Color()}, cInk: {value: new THREE.Color()}, cGhost: {value: new THREE.Color()}, cCut: {value: new THREE.Color()}, cCutInk: {value: new THREE.Color()},
    },
    depthTest: false,
    depthWrite: false,
  });
  quad.material = comp;
  quad.frustumCulled = false;

  const setPalette = (name) => {
    const P = typeof name === 'string' ? PALETTES[name] : {...PALETTES.paper, ...name};
    if (!P) throw new Error(`no palette ${name}; have ${Object.keys(PALETTES)}`);
    // colours go straight to the screen, so they stay in sRGB (no linear conversion)
    const u = comp.uniforms;
    for (const [k, key] of [['cPaper', 'paper'], ['cFill', 'fill'], ['cInk', 'ink'], ['cGhost', 'ghost'], ['cCut', 'cut'], ['cCutInk', 'cutInk']]) u[k].value.setStyle(P[key], THREE.SRGBColorSpace).convertLinearToSRGB();
    u.shade.value = P.shade ?? 0;
    look.palette = name;
  };
  const look = {palette};
  setPalette(palette);

  // classify every mesh for this frame. Tags inherit down the tree.
  const solid = [];
  const ghosts = [];
  const color = [];
  const lights = [];
  const classify = () => {
    solid.length = ghosts.length = color.length = lights.length = 0;
    const walk = (o, tag, cut, fx) => {
      if (!o.visible) return;
      const ud = o.userData;
      if (ud.realOnly) return;
      tag = ud.ink ?? tag;
      if (tag === 'hide') return;
      if (ud.noCut) cut = false;
      if (o === stage.fx) fx = true;
      if (o === stage.ground || o.isSky) return;
      if (o.isLight) lights.push(o);
      const m = o.material;
      if (m && (o.isMesh || o.isLine || o.isPoints || o.isSprite)) {
        const lineish = o.isLine || o.isPoints || o.isSprite || o.isLine2 || o.isLineSegments2 || m.isLineMaterial;
        if (fx || tag === 'color' || lineish) color.push(o);
        else if (tag === 'ghost') ghosts.push({o, cut});
        else if (tag === 'solid') solid.push({o, cut});
        else {
          const mm = Array.isArray(m) ? m[0] : m;
          if (!mm.visible) {
            /* skip */
          } else if (mm.transparent && mm.opacity < 0.6) ghosts.push({o, cut});
          else if (mm.transparent && mm.depthWrite === false && mm.blending === THREE.AdditiveBlending) color.push(o);
          else solid.push({o, cut});
        }
      }
      for (const c of o.children) walk(c, tag, cut, fx);
    };
    walk(scene, undefined, true, false);
  };

  const size = new THREE.Vector2();
  const saved = new Map();
  const mask = new THREE.Layers();
  const drawPass = (rt, list, matFor, extra) => {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    if (!list.length && !extra) return;
    for (const it of list) {
      const o = it.o ?? it;
      saved.set(o, [o.material, o.layers.mask]);
      o.material = matFor(it);
      o.layers.set(31);
    }
    if (extra) for (const o of extra) {
      if (!saved.has(o)) saved.set(o, [o.material, o.layers.mask]);
      o.layers.set(31);
    }
    camera.layers.set(31);
    renderer.render(scene, camera);
    for (const [o, [m, l]] of saved) {
      if (m !== undefined) o.material = m;
      o.layers.mask = l;
    }
    saved.clear();
  };

  const render = () => {
    renderer.getDrawingBufferSize(size);
    if (rtS.width !== size.x || rtS.height !== size.y) for (const rt of [rtS, rtG, rtC]) rt.setSize(size.x, size.y);
    const pr = renderer.getPixelRatio();
    const u = comp.uniforms;
    u.px.value.set(1 / size.x, 1 / size.y);
    u.near.value = camera.near;
    u.far.value = camera.far;
    u.wSil.value = sil * pr;
    u.wCrease.value = crease * pr;
    u.wGhost.value = ghost * pr;

    const bg = scene.background;
    const fog = scene.fog;
    const shadows = renderer.shadowMap.autoUpdate;
    const tone = renderer.toneMapping;
    scene.background = null;
    scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    mask.mask = camera.layers.mask;
    const clear = renderer.getClearColor(new THREE.Color());
    const clearA = renderer.getClearAlpha();

    classify();
    drawPass(rtS, solid, (it) => idMat(it.o, it.cut));
    u.hasG.value = ghosts.length ? 1 : 0;
    if (ghosts.length) drawPass(rtG, ghosts, (it) => idMat(it.o, it.cut));
    u.hasC.value = color.length ? 1 : 0;
    if (color.length) {
      for (const o of color) {
        const m = o.material;
        if (m?.isLineMaterial) m.resolution.set(size.x, size.y);
      }
      renderer.toneMapping = THREE.NoToneMapping;
      drawPass(rtC, solid, (it) => (it.cut ? depthCut : depthAll), [...color, ...lights]);
      renderer.toneMapping = tone;
    }
    camera.layers.mask = mask.mask;

    renderer.setRenderTarget(null);
    renderer.render(quad, quadCam);
    scene.background = bg;
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setClearColor(clear, clearA);
  };

  return {
    render,
    setSection,
    /** the section plane as a clipping list: give it to a model's own ShaderMaterials or LineMaterials (flow lines)
     *  so the cut opens them too. Always one plane, parked far away when the cut is off, so nothing recompiles. */
    planes: CUT,
    section,
    setPalette,
    look,
    /** line weights in CSS px and the crease angle in degrees */
    setLines({sil: s, crease: c, ghost: g, creaseAngle: a, hatch: h} = {}) {
      if (s != null) sil = s;
      if (c != null) crease = c;
      if (g != null) ghost = g;
      if (a != null) comp.uniforms.creaseK.value = 1 - Math.cos(THREE.MathUtils.degToRad(a));
      if (h != null) comp.uniforms.hatch.value = h;
    },
    /** what the last frame drew, for checks */
    counts: () => ({solid: solid.length, ghost: ghosts.length, color: color.length}),
  };
}

/** show inkOnly / realOnly objects for the current look */
export function applyLook(root, drawing) {
  root.traverse((o) => {
    if (o.userData.inkOnly) o.visible = drawing;
    if (o.userData.realOnly) o.visible = !drawing;
  });
}

// ------------------------------------------------------------------ lines that live in the model
/** a polyline in the parent's units. colors: one [r,g,b] (0..1, sRGB) per point for a gradient. width in CSS px. */
export function inkLine(points, {color = '#1d2024', colors, width = 1.4, dashed = false, dash = 6, gap = 4, opacity = 1} = {}) {
  const g = new LineGeometry();
  g.setPositions(points.flatMap((p) => [p[0], p[1], p[2]]));
  if (colors) g.setColors(colors.flatMap((c) => linear(c)));
  const m = new LineMaterial({color: colors ? '#ffffff' : color, vertexColors: !!colors, linewidth: width, dashed, dashSize: dash, gapSize: gap, transparent: opacity < 1, opacity, worldUnits: false});
  const l = new Line2(g, m);
  if (dashed) l.computeLineDistances();
  l.userData.ink = 'color';
  return l;
}
/** a dash-dot centre line from A to B (parent units), drawn only in the drawing look */
export function centerline(A, B, {color = '#5d6670', width = 0.9, long = 22, gap = 5, dot = 3, over = 0} = {}) {
  const a = new THREE.Vector3(...A);
  const b = new THREE.Vector3(...B);
  const dir = b.clone().sub(a);
  const L = dir.length();
  dir.normalize();
  a.addScaledVector(dir, -over);
  const total = L + 2 * over;
  const pos = [];
  for (let s = 0; s < total; s += long + dot + 2 * gap) {
    const seg = (s0, s1) => {
      const e = Math.min(s1, total);
      if (e > s0) pos.push(...a.clone().addScaledVector(dir, s0).toArray(), ...a.clone().addScaledVector(dir, e).toArray());
    };
    seg(s, s + long);
    seg(s + long + gap, s + long + gap + dot);
  }
  const g = new LineSegmentsGeometry();
  g.setPositions(pos);
  const l = new LineSegments2(g, new LineMaterial({color, linewidth: width, worldUnits: false}));
  l.userData.ink = 'color';
  l.userData.inkOnly = true;
  return l;
}
const linear = (c) => {
  const k = new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return [k.r, k.g, k.b];
};
/** a colour ramp for flow lines: t 0..1 -> [r,g,b] sRGB. Default cold blue to hot orange. */
export function ramp(t, stops = ['#3a78c2', '#7fb0dc', '#e9c39a', '#e2733a', '#c8402a']) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const a = new THREE.Color(stops[i]);
  const b = new THREE.Color(stops[i + 1]);
  const c = a.lerp(b, x - i);
  const s = c.getRGB({}, THREE.SRGBColorSpace);
  return [s.r, s.g, s.b];
}
