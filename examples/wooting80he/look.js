// The realistic look of the 80HE: materials for every part, the six case finishes Wooting sells, PBT and ABS surface
// grain (in the shader, no image textures), per-key RGB backlight and the LED bar.
//   colours read off Wooting's product renders (80he-prebuilt-ANSI-*, L60-V2-EXPLOSION) and corrected for their light
import * as THREE from 'three';

// ------------------------------------------------------------------ surface grain
// A fine noise in the part's own frame (mm) that roughens and bumps the surface: PBT keycap texture, the matte
// moulded ABS case, bead-blasted zinc. Fades out where a grain cell is smaller than a pixel, so it never shimmers.
const NOISE = /* glsl */ `
varying vec3 vObjP;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
export function grain(m, {scale = 2.5, bump = 0.35, rough = 0.12, tint = 0.04} = {}) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uGrain = {value: new THREE.Vector4(scale, bump, rough, tint)};
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uGrain;${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 gp = vObjP * uGrain.x;
  float gFade = 1.0 - smoothstep(0.35, 0.9, length(fwidth(gp)));
  float gN = (gNoise(gp) * 0.65 + gNoise(gp * 2.7 + 11.0) * 0.35);
  diffuseColor.rgb *= 1.0 + (gN - 0.5) * uGrain.w * gFade;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + (gN - 0.5) * uGrain.z * gFade, 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    float hx = dFdx(gN), hy = dFdy(gN);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 g = sign(det) * (hx * r1 + hy * r2);
    normal = normalize(abs(det) * normal - uGrain.y * gFade * g);
  }`);
  };
  m.customProgramCacheKey = () => 'grain';
  return m;
}

// ------------------------------------------------------------------ materials
const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
const phys = (o) => new THREE.MeshPhysicalMaterial(o);

/** every material the model uses, by part */
export function materials() {
  return {
    case: grain(phys({color: '#1f2023', roughness: 0.62, metalness: 0, clearcoat: 0.08, clearcoatRoughness: 0.6}), {scale: 5, bump: 0.006, rough: 0.05, tint: 0.012}),
    plate: std('#dfe2e4', 0.42), // white PC, lightly frosted
    pad: phys({color: '#d4d8db', roughness: 0.55, transmission: 0.35, thickness: 2, ior: 1.41}), // translucent silicone
    pcb: phys({color: '#111214', roughness: 0.32, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35}), // black solder mask
    pet: std('#151618', 0.28),
    foam: grain(std('#232427', 0.97), {scale: 2.5, bump: 0.05, rough: 0.02, tint: 0.1}), // EPDM: open, dull
    stab: std('#141517', 0.45), // black stabiliser housings
    rubber: grain(std('#141415', 0.82), {scale: 3, bump: 0.02, rough: 0.06, tint: 0.03}), // silicone feet
    steel: std('#b3b7bb', 0.3, 1), // zinc-plated screws, the USB-C shell
    brass: std('#b99354', 0.34, 1), // threaded inserts
    conn: std('#e6e0cf', 0.55), // nylon connectors
    plug: std('#151517', 0.55), // the cable's moulded plug
    pipe: phys({color: '#f2f4f6', roughness: 0.35, transmission: 0.5, thickness: 4, emissive: '#ffffff', emissiveIntensity: 0}), // the LED bar's light pipe
    // Lekker L60 V2 [wooting.io]: PC transparent top housing, nylon bottom housing, POM stem in "Lekker Turquoise",
    // non-magnetic steel spring
    house: phys({color: '#f4f7f9', roughness: 0.08, metalness: 0, transmission: 0.92, thickness: 1.2, ior: 1.58, transparent: true, opacity: 0.55}),
    houseB: std('#e7e3d8', 0.55), // nylon, warm off-white
    stem: std('#7fd3bd', 0.42), // turquoise POM
    spring: std('#c9ccd0', 0.22, 1),
    ic: std('#0c0c0d', 0.45),
    led: std('#f3f3f0', 0.3, 0, {emissive: '#ffffff', emissiveIntensity: 0}),
    // Just Black / Just White PBT, double-shot: the cap is grainy and dry, the legend shot is translucent
    capBlack: grain(std('#1a1b1d', 0.78), {scale: 7, bump: 0.005, rough: 0.06, tint: 0.012}),
    capWhite: grain(std('#d6d7d4', 0.74), {scale: 7, bump: 0.004, rough: 0.06, tint: 0.01}),
  };
}

// the six case finishes Wooting sells [wooting.io: PCR ABS Black, Ghost, Frost; Zinc Alloy Black, Raw, White]
export const FINISHES = [
  {name: 'PCR ABS · Black', caps: 0, set: (m) => Object.assign(m, {color: c('#1f2023'), roughness: 0.62, metalness: 0, transmission: 0, clearcoat: 0.08})},
  {name: 'PCR ABS · Ghost', caps: 0, set: (m) => Object.assign(m, {color: c('#5a5e64'), roughness: 0.22, metalness: 0, transmission: 0.82, thickness: 3, ior: 1.53, clearcoat: 0.3, attenuationColor: c('#3e4247'), attenuationDistance: 6})},
  {name: 'PCR ABS · Frost', caps: 1, set: (m) => Object.assign(m, {color: c('#eef0f2'), roughness: 0.48, metalness: 0, transmission: 0.7, thickness: 3, ior: 1.53, clearcoat: 0.1, attenuationColor: c('#dfe3e7'), attenuationDistance: 10})},
  {name: 'Zinc alloy · Black', caps: 0, set: (m) => Object.assign(m, {color: c('#1c1d20'), roughness: 0.4, metalness: 0.2, transmission: 0, clearcoat: 0.35, clearcoatRoughness: 0.45})},
  {name: 'Zinc alloy · Raw', caps: 0, set: (m) => Object.assign(m, {color: c('#bfc2c4'), roughness: 0.27, metalness: 1, transmission: 0, clearcoat: 0})},
  {name: 'Zinc alloy · White', caps: 1, set: (m) => Object.assign(m, {color: c('#dcdcd8'), roughness: 0.45, metalness: 0, transmission: 0, clearcoat: 0.25, clearcoatRoughness: 0.5})},
];
function c(h) {
  return new THREE.Color(h);
}

// ------------------------------------------------------------------ light
/** the RGB colour of a key at x (mm, -173..173) and time t: Wooting's default rainbow, drifting slowly */
export function rainbow(x, t, out = new THREE.Color()) {
  const h = ((x + 173) / 346) * 0.85 + t * 0.05;
  return out.setHSL(((h % 1) + 1) % 1, 1, 0.55);
}

/** a soft round glow sprite for the light under each key */
export function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** the braided USB-C cable's weave: black with Wooting's yellow tracer, as a repeating texture */
export function braidTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#121214';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    for (const d of [-1, 1]) {
      g.strokeStyle = i % 2 ? '#232326' : '#19191c';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(i * 8 - 32 * d, 0);
      g.lineTo(i * 8 + 32 * d, 64);
      g.stroke();
    }
  }
  g.strokeStyle = '#d8b21c'; // the yellow tracer
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(-32, 0);
  g.lineTo(32, 64);
  g.moveTo(32, 0);
  g.lineTo(96, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
