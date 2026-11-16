// Tyre rubber. The tyre is a lathe about the wheel's X axis, so the surface detail is written in the tyre's own
// coordinates (radius, distance across, angle round) and laid on as relief:
//   tread     a fine moulded grain, long circumferential scuff lines, rows of wear-indicator holes, mould lines
//   shoulder  a groove where the tread cap meets the sidewall
//   sidewall  a rim-protector rib above the bead, two knurled bands of fine concentric ribs, a smooth band between
//             them for the lettering
// The tread is a dry, slightly grey scrubbed rubber; the sidewall is deeper black with a satin sheen.
import * as THREE from 'three';

let grainTex = null;
/** tileable noise: R = fine fractal grain, G = broad fractal noise, B = per-texel noise */
function grain() {
  if (grainTex) return grainTex;
  const N = 256;
  const px = new Uint8Array(N * N * 4);
  const fbm = (seed, first, octaves) => {
    const f = new Float32Array(N * N);
    let amp = 0.5, sum = 0, s = seed >>> 0;
    for (let o = 0, cells = first; o < octaves; o++, cells *= 2, amp *= 0.55) {
      sum += amp;
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * cells, fy = (y / N) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy);
          let u = fx - x0, v = fy - y0;
          u = u * u * (3 - 2 * u);
          v = v * v * (3 - 2 * v);
          const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
          const a = lat[y0 * cells + x0] + (lat[y0 * cells + x1] - lat[y0 * cells + x0]) * u;
          const b = lat[y1 * cells + x0] + (lat[y1 * cells + x1] - lat[y1 * cells + x0]) * u;
          f[y * N + x] += amp * (a + (b - a) * v);
        }
    }
    for (let i = 0; i < f.length; i++) f[i] /= sum;
    return f;
  };
  const a = fbm(17, 8, 5), b = fbm(91, 4, 4);
  let s = 12345;
  for (let i = 0; i < N * N; i++) {
    px[i * 4] = a[i] * 255;
    px[i * 4 + 1] = b[i] * 255;
    px[i * 4 + 2] = ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 255;
    px[i * 4 + 3] = 255;
  }
  grainTex = new THREE.DataTexture(px, N, N, THREE.RGBAFormat);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.generateMipmaps = true;
  grainTex.minFilter = THREE.LinearMipmapLinearFilter;
  grainTex.magFilter = THREE.LinearFilter;
  grainTex.anisotropy = 16;
  grainTex.needsUpdate = true;
  return grainTex;
}

/** rubber for a tyre of outer radius R, width W, bead radius rB (mm) */
export function tyreMaterial(R, W, rB) {
  const m = new THREE.MeshPhysicalMaterial({color: '#131314', roughness: 0.6, metalness: 0, ior: 1.7}); // a dressed, satin rubber
  const uTy = {value: new THREE.Vector3(R, W / 2, rB)};
  const uTyN = {value: grain()};
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTy = uTy;
    sh.uniforms.uTyN = uTyN;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTP;
uniform vec3 uTy;
uniform sampler2D uTyN;
float tyTread, tyRough, tyTone;
// relief in mm at a point of the tyre, and the surface character there
float tyreRelief(vec3 p) {
  float R = uTy.x, hw = uTy.y, rB = uTy.z;
  float r = length(p.yz), th = atan(p.z, p.y) / 6.2831853 + 0.5;
  float h = 0.0;
  // ---- tread
  float tread = smoothstep(R - 13.0, R - 5.0, r);
  float arc = th * 6.2831853 * R; // mm round the circumference
  float fine = texture2D(uTyN, vec2(th * 96.0, p.x / 23.0)).r;
  float scuff = texture2D(uTyN, vec2(th * 5.0, p.x / 13.0)).g;
  float scuff2 = texture2D(uTyN, vec2(th * 9.0 + 0.37, p.x / 31.0 + 0.5)).g;
  float ht = 0.1 * fine + 0.14 * scuff + 0.07 * scuff2;
  // the fine circumferential ribs a new slick carries from its mould, 17 mm apart
  float ribT = (1.0 - smoothstep(0.0, 1.15, abs(fract(p.x / 17.0) - 0.5) * 17.0)) * (1.0 - smoothstep(0.5, 1.3, fwidth(p.x)));
  ht += 0.16 * ribT;
  // wear-indicator holes: four rows across, staggered round the tyre
  float hole = 0.0;
  for (int k = 0; k < 4; k++) {
    float xk = hw * (-0.63 + 0.42 * float(k));
    float pitch = 6.2831853 * R / 8.0;
    float a = mod(arc + pitch * 0.5 * mod(float(k), 2.0), pitch) - pitch * 0.5;
    float d = length(vec2(a, p.x - xk));
    hole = max(hole, 1.0 - smoothstep(2.2, 3.4, d));
  }
  ht -= 1.6 * hole;
  // mould lines left by the segments of the mould
  float lines = max(1.0 - smoothstep(0.0, 0.7, abs(abs(p.x) - hw * 0.5)), 1.0 - smoothstep(0.0, 0.7, abs(p.x)));
  ht += 0.16 * lines;
  // ---- shoulder: the groove where the tread cap ends
  float groove = exp(-pow((r - (R - 19.0)) / 1.7, 2.0)) * (1.0 - tread);
  // ---- sidewall
  float side = 1.0 - smoothstep(R - 30.0, R - 20.0, r);
  float rib = exp(-pow((r - (rB + 27.0)) / 3.2, 2.0)); // rim protector
  float lip = exp(-pow((r - (R - 44.0)) / 1.4, 2.0));  // a fine raised ring under the shoulder
  float knurl = smoothstep(rB + 4.0, rB + 7.0, r) * (1.0 - smoothstep(rB + 18.0, rB + 21.0, r)) + smoothstep(R - 41.0, R - 39.0, r) * (1.0 - smoothstep(R - 27.0, R - 24.0, r));
  float fadeR = 1.0 - smoothstep(0.22, 0.55, fwidth(r) / 3.2);
  float ribs = sin(r * 6.2831853 / 3.2) * knurl * fadeR;
  float sgrain = texture2D(uTyN, vec2(th * 140.0, r / 17.0)).r;
  float hs = 2.4 * rib + 0.8 * lip + 0.3 * ribs + 0.06 * sgrain;
  h = mix(hs * side, ht, tread) - 1.6 * groove;
  tyTread = tread;
  tyRough = mix(mix(0.4, 0.6, knurl) + 0.1 * (sgrain - 0.5), 0.64 + 0.22 * (scuff - 0.5) + 0.1 * (fine - 0.5) - 0.12 * ribT, tread);
  tyTone = mix(1.0 - 0.3 * knurl, 1.5 + 0.9 * (scuff - 0.5) + 0.5 * (scuff2 - 0.5), tread) * (1.0 - 0.75 * hole * tread) * (1.0 - 0.5 * groove);
  return h;
}
vec3 tyreBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float tyH = tyreRelief(vTP) * 0.001; // mm -> the scene's metres
diffuseColor.rgb *= tyTone;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.94), tyTread); // scrubbed rubber greys warm`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(tyRough, 0.3, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = tyreBump(-vViewPosition, normal, vec2(dFdx(tyH), dFdy(tyH)), faceDirection);');
  };
  m.customProgramCacheKey = () => 'w17-tyre';
  return m;
}
