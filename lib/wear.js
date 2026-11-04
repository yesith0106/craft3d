// Worn metal with no textures: every effect is noise in the model's rest space (each vertex carries where it sat in the
// standing pose, so the wear stays on the metal as the parts move). One uniform, uDamage (0 factory, 1 battle-worn),
// drives all of it:
// - paint chipped back to bare steel, first on the edges (screen-space curvature) and the low parts;
// - a dark rim and a paint-thickness step at each chip;
// - scratches in two directions, rust in the bare patches with brown streaks running down below them;
// - grime rising from the feet, soot patches;
// - impact craters: a dented bowl with a raised rim, the paint blown off and burnt round it.
// The relief (dents, chips, scratches, pitting) goes into the normal as a real height in metres, so it reads the same
// near and far.
import * as THREE from 'three';

export const WEAR = {uDamage: {value: 0.6}};

const GLSL = /* glsl */ `
uniform float uDamage;
uniform vec3 uBare;
uniform float uPainted;
uniform float uSeed;
uniform float uDent;
varying vec3 vRest;
varying vec3 vLp;
varying vec3 vBbc;
varying vec3 vBbh;
float wH(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
vec3 wH3(vec3 p) {
  return vec3(wH(p), wH(p + 17.31), wH(p + 41.7));
}
float wN(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wF(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * wN(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / 0.9375;
}
// impact craters on a 260 mm lattice: x the bowl (0..1), y the burn round it
vec2 wImpact(vec3 p, float dmg) {
  vec3 c = p / 260.0;
  vec3 i = floor(c);
  vec3 f = fract(c);
  float bowl = 0.0;
  float burn = 0.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = wH3(i + o + 3.7);
        if (h.x > dmg * 0.42 - 0.08) continue;
        vec3 d3 = o + 0.15 + 0.7 * h - f;
        float r = 0.045 + 0.075 * h.y;
        float d = length(d3) / r;
        bowl = max(bowl, clamp(1.0 - d * d, 0.0, 1.0));
        burn = max(burn, 1.0 - smoothstep(0.9, 2.8, d));
      }
  return vec2(bowl, burn);
}
float gBare;
float gRust;
float gScratch;
float gH;
float gMetal;
float gRough;
vec3 wBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float fd) {
  vec3 sx = dFdx(surf_pos);
  vec3 sy = dFdy(surf_pos);
  vec3 r1 = cross(sy, surf_norm);
  vec3 r2 = cross(surf_norm, sx);
  float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surf_norm - grad);
}
`;

const COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vRest + uSeed;
  float dmg = uDamage;
  // edges, exactly: how close this point is to two faces of its part's box at once (mm, so the same near and far)
  vec3 dd = max(vBbh - abs(vLp - vBbc), 0.0);
  float band = clamp(0.18 * min(vBbh.x, min(vBbh.y, vBbh.z)), 22.0, 110.0) * (0.6 + 0.8 * wN(p * 0.015 + 4.0));
  vec3 ee = 1.0 - smoothstep(vec3(0.0), vec3(band), dd);
  float edge = clamp(ee.x * ee.y + ee.y * ee.z + ee.x * ee.z, 0.0, 1.0);
  float n1 = wF(p * 0.0042);
  float nB = wF(p * 0.0019 + 31.0);
  float n2 = wN(p * 0.021);
  float low = 1.0 - smoothstep(0.0, 900.0, vRest.y);
  // paint chips: jagged (a warped noise), clustered where the machine took its knocks, and drawn to the edges
  vec3 pw = p + 70.0 * (vec3(wN(p * 0.006), wN(p * 0.006 + 5.0), wN(p * 0.006 + 9.0)) - 0.5);
  float chip = wF(pw * 0.0085 + 13.0);
  float cluster = smoothstep(0.42, 0.72, nB);
  float wear = chip * 0.72 + edge * 0.42 + cluster * 0.24 + low * 0.08;
  float thr = 1.02 - dmg * 0.46;
  float aa = fwidth(wear) * 0.8 + 0.002;
  vec2 imp = dmg > 0.12 ? wImpact(p, dmg) : vec2(0.0);
  gBare = uPainted > 0.5 ? smoothstep(thr - aa, thr + aa, wear) : 1.0;
  gBare = max(gBare, smoothstep(0.0, 0.08, imp.x));
  float rim = uPainted > 0.5 ? clamp(smoothstep(thr - aa - 0.03, thr - aa, wear) - gBare, 0.0, 1.0) : 0.0;
  // scratches: long thin runs in two directions, in clusters
  vec3 q1 = vec3(dot(p, vec3(0.8, 0.55, 0.2)), dot(p, vec3(-0.5, 0.8, 0.3)), dot(p, vec3(0.2, -0.3, 0.93)));
  vec3 q2 = vec3(dot(p, vec3(0.3, -0.9, 0.3)), dot(p, vec3(0.9, 0.35, -0.2)), dot(p, vec3(-0.1, 0.25, 0.96)));
  float s1 = smoothstep(0.955, 0.99, wN(vec3(q1.x * 0.005, q1.y * 0.45, q1.z * 0.45)));
  float s2 = smoothstep(0.96, 0.99, wN(vec3(q2.x * 0.007, q2.y * 0.55, q2.z * 0.55) + 9.0));
  gScratch = clamp(s1 + s2, 0.0, 1.0) * smoothstep(0.5, 0.75, wN(p * 0.004 + 3.0)) * smoothstep(0.1, 0.6, dmg);
  // rust in the bare patches; brown streaks run down beneath the chips
  float rn = wN(p * 0.011 + 11.0) * 0.65 + wN(p * 0.033 + 2.0) * 0.35;
  gRust = gBare * smoothstep(0.56, 0.8, rn + dmg * 0.12) * smoothstep(0.35, 0.9, dmg) * (uPainted > 0.5 ? 0.85 : 0.35);
  float streak = smoothstep(0.66, 0.95, wN(vec3(p.x * 0.045, p.y * 0.002, p.z * 0.045) + 5.0)) * smoothstep(0.35, 1.0, dmg) * (1.0 - gBare);
  float grime = (low * (0.3 + 0.7 * nB) + 0.25 * n1) * dmg;
  float soot = max(smoothstep(0.64, 0.82, nB) * smoothstep(0.55, 1.0, dmg), imp.y * 0.85);
  vec3 paint = diffuseColor.rgb * (0.94 + 0.1 * n2) * (1.0 - 0.07 * n1);
  paint = mix(paint, paint * vec3(0.66, 0.5, 0.36), streak * 0.7);
  paint *= 1.0 - rim * 0.55;
  vec3 metal = uBare * (0.62 + 0.3 * wN(p * 0.05 + 2.0));
  vec3 rust = mix(vec3(0.16, 0.075, 0.035), vec3(0.34, 0.16, 0.07), rn);
  vec3 c = mix(paint, metal, gBare);
  c = mix(c, rust, gRust);
  c = mix(c, uBare * 1.15, gScratch * (1.0 - gRust));
  c = mix(c, c * vec3(0.45, 0.39, 0.32), grime * 0.7);
  c = mix(c, c * 0.18, soot * 0.8);
  diffuseColor.rgb = c;
  float bareRough = 0.34 + 0.22 * n2;
  gMetal = gBare * (1.0 - gRust) * (1.0 - grime * 0.6) * (1.0 - soot * 0.5);
  gMetal = max(gMetal, gScratch * (1.0 - gRust));
  gRough = mix(roughness * (0.9 + 0.2 * n2), bareRough, gBare);
  gRough = mix(gRough, 0.9, gRust);
  gRough = mix(gRough, 0.26, gScratch);
  gRough = clamp(gRough + grime * 0.3 + soot * 0.2, 0.05, 1.0);
  // relief, metres: broad dents, the paint's step at a chip, scratch grooves, crater bowls
  gH = (nB - 0.5) * 0.02 * uDent * smoothstep(0.1, 0.9, dmg);
  gH += (1.0 - gBare) * 0.0004 * uPainted;
  gH -= gScratch * 0.0002;
  gH -= imp.x * 0.01 * uDent;
}
`;

/** a worn material: color (paint, or the metal itself when painted is false), its roughness, the bare metal's tint */
export function makeWorn({color, rough = 0.55, painted = true, bare = '#9a9ea3', metal = painted ? 0 : 1, seed = 0, dent = 1, transparent = false}) {
  const m = new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal, transparent, side: THREE.FrontSide});
  const own = {uBare: {value: new THREE.Color(bare)}, uPainted: {value: painted ? 1 : 0}, uSeed: {value: seed}, uDent: {value: dent}};
  m.userData.worn = own;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, own, WEAR);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 rest;\nattribute vec3 bbc;\nattribute vec3 bbh;\nvarying vec3 vRest;\nvarying vec3 vLp;\nvarying vec3 vBbc;\nvarying vec3 vBbh;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;\nvLp = position;\nvBbc = bbc;\nvBbh = bbh;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = ${painted ? 'gMetal' : 'mix(metalness, 0.0, gRust)'};`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = wBump(-vViewPosition, normal, vec2(dFdx(gH), dFdy(gH)), faceDirection);');
  };
  m.customProgramCacheKey = () => `worn-${painted ? 1 : 0}`;
  return m;
}

/** give every worn mesh under root a 'rest' attribute: its vertices where they sit now, in root space (mm) */
export function bakeRest(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.material?.userData?.worn) return;
    const g = o.geometry.clone();
    const pos = g.attributes.position;
    const rest = new Float32Array(pos.count * 3);
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      rest[i * 3] = v.x;
      rest[i * 3 + 1] = v.y;
      rest[i * 3 + 2] = v.z;
    }
    g.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
    // the part's own box, for the edge wear: its centre and half size, the same at every vertex
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const h = g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const bc = new Float32Array(pos.count * 3);
    const bh = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      bc.set([c.x, c.y, c.z], i * 3);
      bh.set([h.x, h.y, h.z], i * 3);
    }
    g.setAttribute('bbc', new THREE.BufferAttribute(bc, 3));
    g.setAttribute('bbh', new THREE.BufferAttribute(bh, 3));
    o.geometry = g;
  });
}
