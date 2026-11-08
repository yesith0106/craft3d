// Panel lines and access doors, drawn in the paint shader from each vertex's rest position (mm, the aircraft's own
// frame), so they stay on their panels when a stabilator or flaperon moves. Estimated from F-16 three-views: the
// main fuselage frames, the spine edges, the avionics, gun and engine access doors, the refuelling door, the wing ribs.
import * as THREE from 'three';

const FRAMES = [2350, 3080, 5350, 6250, 7150, 8150, 9250, 10400, 11550, 12650, 13550, 14150];
// doors on the sides: [s0, s1, y0, y1]
const SIDE = [[2480, 3300, 1600, 2060], [4400, 5300, 1880, 2110], [6350, 7050, 1960, 2200], [10500, 12150, 1460, 1880], [5300, 6800, 1120, 1430], [8400, 9600, 1140, 1460]];
// doors on top: [s0, s1, x0, x1] (|x|; x0 = 0 spans the centre line)
const TOP = [[5750, 6550, 0, 165], [7400, 8600, 0, 200], [9200, 10300, 300, 560], [11000, 12100, 0, 200]];

const v4 = (a) => a.map(([p, q, r, s]) => new THREE.Vector4(p, q, r, s));

/** a paint material that draws panel lines: kind 'body' (fuselage, spine, intake, booms) or 'wing' */
export function panelled(base, kind, {Z0, leRoot, tanLE, teS}) {
  const m = base.clone();
  m.defines = {...(m.defines ?? {}), [kind === 'wing' ? 'PANEL_WING' : 'PANEL_BODY']: 1, NF: FRAMES.length, NS: SIDE.length, NT: TOP.length};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uZ0: {value: Z0}, uLE0: {value: leRoot}, uTan: {value: tanLE}, uTE: {value: teS},
      uFrames: {value: FRAMES}, uSide: {value: v4(SIDE)}, uTop: {value: v4(TOP)},
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uZ0, uLE0, uTan, uTE;
uniform float uFrames[NF];
uniform vec4 uSide[NS];
uniform vec4 uTop[NT];
varying vec3 vRest;
// a 1.5 mm line, anti-aliased in screen space
float ln(float v, float c) { float aa = max(fwidth(v), 0.4); return 1.0 - smoothstep(0.75, 0.75 + aa * 1.4, abs(v - c)); }
float inR(float v, float a, float b) { return step(a, v) * step(v, b); }
float rectL(float u, float w, vec4 q) {
  return max(max(ln(u, q.x), ln(u, q.y)) * inR(w, q.z, q.w), max(ln(w, q.z) * step(0.5, q.z), ln(w, q.w)) * inR(u, q.x, q.y));
}
float panels(vec3 r) {
  float s = uZ0 - r.z, ax = abs(r.x), y = r.y, L = 0.0;
#ifdef PANEL_BODY
  for (int i = 0; i < NF; i++) L = max(L, ln(s, uFrames[i]) * step(1000.0, y));
  L = max(L, ln(y, 1985.0) * inR(s, 5400.0, 12600.0) * step(500.0, ax));
  L = max(L, ln(ax, 232.0) * inR(s, 5600.0, 13700.0) * step(2300.0, y));
  for (int i = 0; i < NS; i++) L = max(L, rectL(s, y, uSide[i]) * step(300.0, ax));
  for (int i = 0; i < NT; i++) L = max(L, rectL(s, ax, uTop[i]) * step(2180.0, y));
#endif
#ifdef PANEL_WING
  float le = uLE0 + ax * uTan;
  L = max(L, ln(s, uTE - 780.0) * step(2950.0, ax));
  L = max(L, ln(s, le + 0.42 * (uTE - le)) * inR(ax, 1400.0, 4400.0));
  for (int i = 0; i < 3; i++) { float rib = 2150.0 + float(i) * 850.0; L = max(L, ln(ax, rib) * inR(s, le + 420.0, uTE - 690.0)); }
#endif
  return L;
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float L = panels(vRest);
  // panels repainted at different times differ a shade, as on any service jet
  float s = uZ0 - vRest.z;
  float tone = 0.985 + 0.03 * h21(floor(vec2(s / 1100.0, (abs(vRest.x) + vRest.y) / 850.0)));
  diffuseColor.rgb *= tone * (1.0 - 0.42 * L);
}`);
  };
  m.customProgramCacheKey = () => 'panel-' + kind;
  return m;
}

/** store every vertex's position in the root's frame (mm) as the attribute `rest`, once, with the controls neutral */
export function bakePanelRest(root, materials) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !materials.includes(o.material)) return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    const P = o.geometry.attributes.position;
    const a = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(rel);
      a.set([v.x, v.y, v.z], i * 3);
    }
    o.geometry.setAttribute('rest', new THREE.BufferAttribute(a, 3));
  });
}
