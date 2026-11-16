// Films and hero stills of a model, rendered offline on the GPU. Not real time: every output frame is the average of
// many renders in linear light. Each sub-frame puts the lights at a different point of their soft boxes or tubes, the
// camera at a different point of its lens and of the open shutter, and the pixel grid at a different offset. So area
// lights cast true soft shadows, and motion blur, depth of field and anti-aliasing are real, not post effects.
//
//   const cine = createCine({stage, model, params, clip: {fps: 24, seconds: 8, sub: 32, shutter: 0.5}});
//   cine.dark();                                    // strip the viewer's stage: nothing lights the scene but the film's lights
//   cine.box({pos, w, h, L, light: 1});             // a soft box: seen in reflections, and a sampled lamp if `light`
//   cine.tubes([{a, b}], {rho, lamps, shadow});     // fluorescent tubes: visible, reflected, sampled as line lights
//   cine.shots = [{t0, t1, ease, cam: (u) => ({tgt, az, el, d, fov, roll, focus, ap, ev, set: {param: value}})}];
//   cine.rest = {param: value};                     // what the params are when a shot's `set` does not move them
//   cine.frame(i) -> PNG data URL                   // tools/film.mjs steps it and encodes the film
//
// Reflections come from a capture of the set (cine.set: seen only in reflections) and the room (cine.room: seen by the
// camera too), taken from the subject's place with the model hidden. The sampled lamps give the diffuse light and the
// shadows; their highlights are widened (specMin) or dropped, because a lamp's sample points show as dots in anything
// glossy while the capture holds each light as one continuous shape. references/cinematic.md has the reasoning.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {slabTextures} from './textures.js';

const rad = THREE.MathUtils.degToRad;
const V = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(...a));
const frac = (x) => x - Math.floor(x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const halton = (i, b) => {
  let f = 1, r = 0;
  for (; i > 0; i = Math.floor(i / b)) r += (f /= b) * (i % b);
  return r;
};
/** a fluorescent tube striking at x = 0 s: two false starts, then it catches and warms up */
export const strike = (x) => (x < 0 ? 0 : x < 0.045 ? 0.75 : x < 0.1 ? 0.04 : x < 0.14 ? 0.9 : x < 0.2 ? 0.15 : 0.82 + 0.18 * smooth(0.2, 0.9, x));

/** Where a flat face with normal `n` mirrors the lens: the direction (from the subject) to stand a soft box in, given
 *  the direction to the camera. Put the box there and that face fills with light; offset it and the light's edge shows. */
export const mirrorDir = (n, toCamera) => {
  const N = V(n).normalize(), C = V(toCamera).normalize();
  return N.multiplyScalar(2 * N.dot(C)).sub(C).normalize();
};

/** the picture's frame for a camera spec {az, el, roll}: unit vectors to the right, up, and back toward the camera */
export function camFrame({az = 0, el = 0, roll = 0}) {
  const a = rad(az), e = rad(el);
  const back = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  const fwd = back.clone().negate();
  const ref = Math.abs(back.y) > 0.999 ? new THREE.Vector3(0, 0, -Math.sign(back.y)) : new THREE.Vector3(0, 1, 0);
  const up = ref.addScaledVector(fwd, -ref.dot(fwd)).normalize().applyAxisAngle(fwd, rad(roll));
  return {right: new THREE.Vector3().crossVectors(fwd, up).normalize(), up, back, fwd};
}

// ---------------------------------------------------------------- shader edits for every lit material
const need = (s, a, b) => {
  if (!s.includes(a)) throw new Error('cine: shader text not found (three.js changed?): ' + a.slice(0, 60));
  return s.replace(a, b);
};
// 1. What a sampled lamp may do to a glossy surface: nothing (specMin null) or only a broad highlight.
const DIRECT = new Map();
const direct = (specMin) => {
  if (!DIRECT.has(specMin)) {
    const s = need(THREE.ShaderChunk.lights_physical_pars_fragment, 'clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );', '');
    const from = 'vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );';
    DIRECT.set(specMin, need(s, from, specMin == null ? 'vec3 specularBRDF = vec3( 0.0 );' : `PhysicalMaterial wide = material;\n\twide.roughness = max( material.roughness, ${Number(specMin).toFixed(2)} );\n\tvec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, wide );`));
  }
  return DIRECT.get(specMin);
};
// 2. The capture's diffuse light is the bounce only (fill): the lights' own diffuse comes from the lamps.
let MAPS, ENV;
const chunks = () => {
  MAPS ??= need(THREE.ShaderChunk.lights_fragment_maps, 'iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += uCineFill * getIBLIrradiance( geometryNormal );');
  // 3. A set that stands close: look the reflection up where the reflected ray meets a sphere round the subject
  //    (uCineSet = centre, radius), so a flat face shows the light sliding across it instead of one even tone.
  ENV ??= need(
    THREE.ShaderChunk.envmap_physical_pars_fragment,
    'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
    `reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			if ( uCineSet.w > 0.0 ) {
				vec3 cP = cameraPosition + transformDirectionByInverseViewMatrix( - vViewPosition, viewMatrix ) * length( vViewPosition ) - uCineSet.xyz;
				float cB = dot( cP, reflectVec ), cC = dot( cP, cP ) - uCineSet.w * uCineSet.w;
				reflectVec = normalize( cP + reflectVec * ( - cB + sqrt( max( cB * cB - cC, 0.0 ) ) ) );
			}`,
  );
};

/** a soft box: an emissive plane with a feathered edge (feather = the share of each side that fades) */
export function softbox(w, h, feather = 0.3) {
  const N = 128, px = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const f = Math.max(feather, 1e-3);
      const v = Math.min(1, Math.min(x, N - 1 - x) / (N - 1) / f) * Math.min(1, Math.min(y, N - 1 - y) / (N - 1) / f);
      px.fill(v * v * (3 - 2 * v) * 255, (y * N + x) * 4, (y * N + x) * 4 + 3);
      px[(y * N + x) * 4 + 3] = 255;
    }
  const map = new THREE.DataTexture(px, N, N, THREE.RGBAFormat);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({map, side: THREE.DoubleSide}));
}

/** A clear crystal or lens that shows its reflection. three.js scales a transparent surface's reflection by its
 *  opacity, so clear glass reflects almost nothing; this draws the reflection alone, added over what is behind. */
export function additiveGlass(mesh, {strength = 1, roughness = 0.03, tint = '#ffffff'} = {}) {
  const m = (mesh.material = mesh.material.clone());
  Object.assign(m, {color: new THREE.Color(0, 0, 0), opacity: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, roughness, envMapIntensity: 1});
  if (m.isMeshPhysicalMaterial) {
    m.specularIntensity = strength;
    m.specularColor.set(tint);
    m.transmission = 0;
  }
  m.userData = {}; // a clone does not carry the shader edits; createCine makes them again
  return m;
}

export function createCine({stage, model, params = {}, clip: clipIn, subject, fill = 0.3, specMin = 0.4, setRadius = 0, occlusion = null, envSize = 512, envIntensity = 1, haze: hazeIn = null} = {}) {
  const {scene, renderer} = stage;
  const W = innerWidth, H = innerHeight;
  const clip = {fps: 24, seconds: 8, sub: 32, shutter: 0.5, ...clipIn};
  const centre = V(subject?.centre ?? model.focus ?? [0, 0, 0]);
  const R = subject?.radius ?? model.radius ?? 1;
  const occ = occlusion ? {strength: 0.9, gamma: 1.25, size: 4096, ...(occlusion === true ? {} : occlusion)} : null;
  // the grade: change it from the film file (Object.assign(cine.grade, {...}))
  const grade = {exposure: 1, bloom: {strength: 0.16, radius: 0.3, threshold: 1}, sharp: 0, warm: [1, 1, 1], curve: 0, vignette: 0.22, lift: 0.01, grain: 0.012, backdrop: null};
  chunks();
  const uFill = {value: fill}, uEmit = {value: 1};
  const uSet = {value: new THREE.Vector4(centre.x, centre.y, centre.z, setRadius)};

  const room = new THREE.Group(); // seen by the camera and in reflections: floor, walls, tubes
  const set = new THREE.Group(); // seen in reflections only: soft boxes, the tent
  room.name = 'cine room';
  set.name = 'cine set';
  set.visible = false;
  scene.add(room, set);

  /** strip the viewer's stage: no backdrop, fog, ambient, sun or floor. Call it before adding lights. */
  const dark = () => {
    scene.background = null;
    scene.fog = null;
    scene.environment = null;
    for (const o of scene.children) if (o !== model.root && o !== room && o !== set) o.visible = false;
  };

  // ---------------------------------------------------------------- lights
  const groups = []; // light groups: a box, or a run of tubes sharing some lamps
  const emitters = []; // every glowing surface: {mat, seen, env, tint, lv}
  const tintOf = (t) => new THREE.Color(...(t ?? [1, 1, 1]));
  const spot = (aim, cone, penumbra, shadow, dist) => {
    const l = new THREE.SpotLight('#ffffff', 0, 0, cone, penumbra, 2);
    if (shadow) {
      const o = shadow === true ? {} : shadow;
      l.castShadow = true;
      l.shadow.mapSize.setScalar(o.size ?? 2048);
      l.shadow.camera.near = o.near ?? Math.max(R * 0.05, dist - 4 * R);
      l.shadow.camera.far = o.far ?? dist + 6 * R;
      l.shadow.bias = o.bias ?? -0.0003;
      l.shadow.normalBias = o.normalBias ?? R * 0.002;
    }
    l.target.position.copy(aim);
    scene.add(l, l.target);
    l.target.updateMatrixWorld();
    return l;
  };

  /** A soft box at `pos` (metres, world) facing `at` (default: the subject). L = its radiance, as reflections see it.
   *  light: false = a card that only reflects; true or a number = it also lights matte surfaces through a sampled lamp
   *  (1 = the physical share for its size and radiance; lower holds matte surfaces back, higher lifts them without
   *  changing what polished ones mirror). level(t) dims it over time;
   *  move(t) -> [x, y, z] carries it. seen: true puts it in front of the camera too. glow: its weight in the haze. */
  const box = ({pos, at, w, h, L = 2, feather = 0.3, light = false, shadow = true, cone, seen = false, tint, level, move, spin = 0, glow = 0}) => {
    const mesh = softbox(w, h, feather);
    mesh.castShadow = false;
    (seen ? room : set).add(mesh);
    const G = {kind: 'box', mesh, w, h, pos: V(pos), at: at ? V(at) : centre.clone(), ax: new THREE.Vector3(), ay: new THREE.Vector3(), level, move, spin, lv: 1, glow, lamps: []};
    const settle = () => {
      mesh.position.copy(G.pos);
      mesh.lookAt(G.at);
      if (spin) mesh.rotateZ(rad(spin));
      mesh.updateMatrixWorld(true);
      mesh.matrixWorld.extractBasis(G.ax, G.ay, new THREE.Vector3());
    };
    G.settle = settle;
    settle();
    emitters.push((G.emit = {mat: mesh.material, seen: L, env: L, tint: tintOf(tint), lv: 1}));
    if (light) {
      const dist = G.pos.distanceTo(G.at);
      G.power = L * w * h * (light === true ? 1 : light);
      G.lamps.push(spot(G.at, cone ? rad(cone) : Math.min(rad(62), Math.atan((2.8 * R) / dist)), 0.6, shadow, dist));
      G.lamps[0].color.copy(G.emit.tint);
    }
    groups.push(G);
    return G;
  };

  /** Fluorescent tubes: segs = [{a, b}, ...] in metres. rho = intensity per metre of tube (cd/m). The run shares
   *  `lamps` sampled lights, moved along the tubes every sub-frame: one shadowed spot aimed at `aim` for a rig
   *  overhead, or a couple of dozen unshadowed points for tubes lying on a floor (few points next to a surface show
   *  as pearls). seen / env = radiance to the camera (bloom spreads it, keep it low) and in reflections.
   *  level(seg, t) dims each tube over time. */
  const tubes = (segs, {rho = 1, lamps = 1, shadow = false, aim, cone = 64, radius = 0.021, seen = 3, env = 34, tint = [1, 0.985, 0.96], level, caps = true, glow = 1} = {}) => {
    const G = {kind: 'tubes', segs: segs.map((s) => ({...s, a: V(s.a), b: V(s.b), lv: 1})), rho, level, glow, lamps: []};
    const black = new THREE.MeshStandardMaterial({color: '#050505', roughness: 0.55, metalness: 0.2});
    const UP = new THREE.Vector3(0, 1, 0);
    G.total = 0;
    for (const s of G.segs) {
      s.len = s.a.distanceTo(s.b);
      G.total += s.len;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, s.b.clone().sub(s.a).normalize());
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, s.len, 20, 1), new THREE.MeshBasicMaterial());
      glass.position.copy(s.a).add(s.b).multiplyScalar(0.5);
      glass.quaternion.copy(q);
      room.add(glass);
      emitters.push((s.emit = {mat: glass.material, seen, env, tint: tintOf(tint), lv: 1}));
      if (caps)
        for (const end of [s.a, s.b]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.4, radius * 1.4, radius * 3.3, 20), black);
          cap.position.copy(end);
          cap.quaternion.copy(q);
          room.add(cap);
        }
    }
    const mid = G.segs.reduce((p, s) => p.add(s.a).add(s.b), new THREE.Vector3()).multiplyScalar(0.5 / G.segs.length);
    const target = aim ? V(aim) : centre.clone();
    for (let j = 0; j < lamps; j++) {
      const l = shadow ? spot(target, rad(cone), 0.7, shadow, mid.distanceTo(target)) : new THREE.PointLight('#ffffff', 0, 0, 2);
      l.color.copy(tintOf(tint));
      if (!shadow) scene.add(l);
      G.lamps.push(l);
    }
    groups.push(G);
    return G;
  };

  /** A floor of large concrete tiles under the subject, running out into the dark. size and tile repeat in metres.
   *  It takes no reflections from the capture (taken at the subject's place, it is wrong for a floor this wide) and
   *  only broad highlights from the lamps, which lie a hand's width from it when tubes are on the floor. */
  const floor = ({y = 0, size = 40 * R, repeat = 9.6 * (R / 2.8), bump = 0.04 * (R / 2.8), tone = 0.43, spec = 0.72} = {}) => {
    const {map, data} = slabTextures({tone});
    for (const t of [map, data]) t.repeat.set(size / repeat, size / repeat);
    const mat = new THREE.MeshStandardMaterial({map, roughnessMap: data, bumpMap: data, bumpScale: bump, roughness: 1, metalness: 0});
    Object.assign(mat.userData, {cineSpec: spec, cineNoEnv: true});
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(centre.x, y, centre.z);
    room.add(m);
    return m;
  };

  /** the tent round the set, seen in every reflection: radiance at the top, the horizon and the bottom, along `up` */
  const dome = ({top = 0.4, mid = 0.2, bot = 0.07, up = [0, 1, 0]} = {}) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(20 * R, 4 * setRadius), 48, 32),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {uUp: {value: V(up).normalize()}, uL: {value: new THREE.Vector3(top, mid, bot)}},
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uUp, uL; varying vec3 vP; void main() { float h = dot(normalize(vP), uUp); float l = h > 0.0 ? mix(uL.y, uL.x, smoothstep(0.0, 1.0, h)) : mix(uL.y, uL.z, smoothstep(0.0, 0.7, -h)); gl_FragColor = vec4(vec3(l), 1.0); }',
      }),
    );
    m.position.copy(centre);
    set.add(m);
    return m;
  };

  const setLevels = (t) => {
    for (const G of groups) {
      if (G.kind === 'box') {
        G.lv = G.emit.lv = G.level ? G.level(t) : 1;
        if (G.move) {
          G.pos.set(...G.move(t));
          G.settle();
        }
      } else for (const s of G.segs) s.lv = s.emit.lv = G.level ? G.level(s, t) : 1;
    }
  };
  const emit = (mode) => {
    for (const e of emitters) e.mat.color.copy(e.tint).multiplyScalar(mode === 'off' ? 0 : e[mode] * e.lv);
  };
  const pick = (G, u, out) => {
    let x = frac(u) * G.total;
    for (const s of G.segs) {
      if (x <= s.len) return out.copy(s.a).lerp(s.b, x / s.len), s;
      x -= s.len;
    }
    return G.segs[G.segs.length - 1];
  };
  /** put every lamp at a new point of its light for sub-frame s */
  const placeLights = (s) => {
    groups.forEach((G, k) => {
      if (G.kind === 'box') {
        const l = G.lamps[0];
        if (!l) return;
        // the inner 80% of the box: its feathered edge gives little light
        const u = frac((s + 0.5) * 0.7548776662 + k * 0.37) - 0.5, v = frac((s + 0.5) * 0.569840291 + k * 0.71) - 0.5;
        l.position.copy(G.pos).addScaledVector(G.ax, u * G.w * 0.8).addScaledVector(G.ay, v * G.h * 0.8);
        l.intensity = G.power * G.lv;
      } else
        G.lamps.forEach((l, j) => {
          const seg = pick(G, (j + frac((s + 0.5) * 0.618034 + j * 0.37 + k * 0.19)) / G.lamps.length, l.position);
          l.intensity = (G.rho * G.total * seg.lv) / G.lamps.length;
        });
    });
  };
  const lampsOn = (on) => {
    for (const G of groups) for (const l of G.lamps) l.visible = on;
  };

  // ---------------------------------------------------------------- reflections: the capture
  const cubeRT = new THREE.WebGLCubeRenderTarget(envSize, {type: THREE.HalfFloatType});
  const cubeCam = new THREE.CubeCamera(Math.min(0.05, R * 0.2), Math.max(80 * R, 6 * setRadius), cubeRT);
  const pm = new THREE.PMREMGenerator(renderer);
  let envRT = null, envKey = null;
  const captured = {from: centre.clone(), hide: [model.root]};
  const capture = () => {
    const key = groups.map((G) => (G.kind === 'box' ? [Math.round(G.lv * 40), ...(G.move ? G.pos.toArray().map((x) => Math.round((x / R) * 400)) : [])] : G.segs.map((s) => Math.round(s.lv * 40))).join()).join('|');
    if (key === envKey) return;
    envKey = key;
    const was = captured.hide.map((o) => o.visible);
    for (const o of captured.hide) o.visible = false;
    set.visible = true;
    scene.environment = null;
    scene.overrideMaterial = null;
    uEmit.value = 1;
    emit('env');
    lampsOn(true);
    placeLights(0);
    cubeCam.position.copy(captured.from);
    cubeCam.update(renderer, scene);
    envRT = pm.fromCubemap(cubeRT.texture, envRT);
    scene.environment = envRT.texture;
    set.visible = false;
    captured.hide.forEach((o, i) => (o.visible = was[i]));
  };

  // ---------------------------------------------------------------- the camera and the shots
  const camera = new THREE.PerspectiveCamera(30, W / H, R * 0.02, Math.max(200 * R, 8 * setRadius));
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), pivot = new THREE.Vector3(), tmp = new THREE.Vector3();
  let fovNow = 0;
  /** c = {tgt, az, el, d, fov, roll, shift, focus, ap}: az from +Z (the model's front) toward +X, el up, d metres;
   *  positive roll leans the top of the picture to the left; shift = [x, y] moves the target off centre, in frames;
   *  ap = lens radius in metres (0 = everything sharp), focus = the point held sharp (default: tgt) */
  const poseCamera = (c, lens = [0, 0], jit = null) => {
    if (c.fov !== fovNow) {
      camera.fov = fovNow = c.fov ?? 30;
      camera.updateProjectionMatrix();
    }
    const {right, up, back, fwd} = camFrame(c);
    aim.copy(c.tgt ? tmp.set(...c.tgt) : centre);
    if (c.shift) {
      const fh = 2 * c.d * Math.tan(rad(camera.fov / 2));
      aim.addScaledVector(right, -c.shift[0] * fh * (W / H)).addScaledVector(up, -c.shift[1] * fh);
    }
    eye.copy(aim).addScaledVector(back, c.d);
    // thin lens: move across the aperture, pivoting about the point on the axis at the focus distance
    const fd = (c.focus ? tmp.set(...c.focus) : tmp.copy(c.tgt ? tmp.set(...c.tgt) : centre)).sub(eye).dot(fwd);
    pivot.copy(eye).addScaledVector(fwd, fd);
    const ap = c.ap ?? 0;
    camera.position.copy(eye).addScaledVector(right, lens[0] * ap).addScaledVector(up, lens[1] * ap);
    camera.up.copy(up);
    camera.lookAt(pivot);
    if (jit) camera.setViewOffset(W, H, jit[0], jit[1], W, H);
    else camera.clearViewOffset();
    camera.updateMatrixWorld();
  };
  const film = {shots: [], pose: null, rest: null};
  const shotOf = (t) => film.shots.find((s) => t < s.t1 - 1e-6) ?? film.shots[film.shots.length - 1];
  const camOf = (shot, t) => {
    let u = Math.min(1, Math.max(0, (t - shot.t0) / (shot.t1 - shot.t0)));
    if (shot.ease) u = 0.5 * u + 0.5 * u * u * (3 - 2 * u); // a steady move with soft ends
    return shot.cam(u, t);
  };
  let lastT = null;
  const poseModel = (t, c, shot) => {
    Object.assign(params, film.rest, c.set); // the resting values first, so a slider a shot moved does not stay moved
    const dt = lastT !== null && t > lastT && t - lastT < 0.25 ? t - lastT : 0;
    lastT = t;
    model.update?.(dt, t, params);
    film.pose?.(t, c, shot);
  };

  // ---------------------------------------------------------------- targets and passes
  const rt = new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, samples: 4});
  const accOf = () => new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType, depthBuffer: false});
  const accD = accOf(), accE = accOf(), accA = accOf();
  const addQuad = new FullScreenQuad(
    new THREE.ShaderMaterial({
      uniforms: {tDiffuse: {value: null}, w: {value: 1}},
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float w; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv) * w; }',
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false,
    }),
  );
  const pass = (target, w) => {
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    addQuad.material.uniforms.tDiffuse.value = rt.texture;
    addQuad.material.uniforms.w.value = w;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    addQuad.render(renderer);
    renderer.autoClear = auto;
  };

  // occlusion: a shadowed light from a new direction over the whole sphere every sub-frame, on a white model
  const white = new THREE.MeshLambertMaterial({color: '#ffffff'});
  const cover = new THREE.MeshBasicMaterial({color: '#ffffff'});
  const blackMat = new THREE.MeshBasicMaterial({color: '#000000'});
  let aoLamp = null;
  if (occ) {
    aoLamp = new THREE.DirectionalLight('#ffffff', 4 * Math.PI);
    aoLamp.castShadow = true;
    aoLamp.shadow.mapSize.setScalar(occ.size);
    Object.assign(aoLamp.shadow.camera, {left: -1.3 * R, right: 1.3 * R, top: 1.3 * R, bottom: -1.3 * R, near: R, far: 9 * R});
    aoLamp.shadow.bias = occ.bias ?? -0.001;
    aoLamp.shadow.normalBias = occ.normalBias ?? R * 0.006;
    aoLamp.visible = false;
    aoLamp.target.position.copy(centre);
    scene.add(aoLamp, aoLamp.target);
    aoLamp.target.updateMatrixWorld();
  }

  const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const combine = new ShaderPass({
    uniforms: {tDiffuse: {value: null}, tD: {value: null}, tE: {value: null}, tA: {value: null}, uAO: {value: new THREE.Vector2(0, 1)}, uView: {value: 0}},
    vertexShader: vs,
    fragmentShader: `uniform sampler2D tD, tE, tA; uniform vec2 uAO; uniform float uView; varying vec2 vUv;
      void main() {
        vec4 d = texture2D(tD, vUv), a = texture2D(tA, vUv);
        vec3 e = texture2D(tE, vUv).rgb;
        float ao = pow(clamp(a.r / max(a.a, 1e-4), 0.0, 1.0), uAO.y);
        vec3 col = d.rgb + e * mix(1.0, ao, uAO.x);
        if (uView > 0.5) col = uView < 1.5 ? d.rgb : uView < 2.5 ? e : uView < 3.5 ? vec3(ao) * a.a : vec3(a.a);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const finish = new ShaderPass({
    uniforms: {
      tDiffuse: {value: null}, tA: {value: null}, uPx: {value: new THREE.Vector2(1 / W, 1 / H)}, uAspect: {value: W / H}, uSeed: {value: 0},
      uSharp: {value: 0}, uCurve: {value: 0}, uVig: {value: 0}, uLift: {value: 0}, uGrain: {value: 0}, uBg: {value: 0},
      uWarm: {value: new THREE.Vector3(1, 1, 1)}, uTint: {value: new THREE.Vector3(1, 1, 1)}, uCorners: {value: new THREE.Vector4()}, uGlow: {value: new THREE.Vector4()},
    },
    vertexShader: vs,
    fragmentShader: `uniform sampler2D tDiffuse, tA; uniform vec2 uPx; uniform float uAspect, uSeed, uSharp, uCurve, uVig, uLift, uGrain, uBg;
      uniform vec3 uWarm, uTint; uniform vec4 uCorners, uGlow; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec3 blur = (texture2D(tDiffuse, vUv + vec2(uPx.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uPx.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, uPx.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uPx.y)).rgb) * 0.25;
        c = clamp(max(c + (c - blur) * uSharp, 0.0) * uWarm, 0.0, 1.0);
        c = mix(c, c * c * (3.0 - 2.0 * c), uCurve);                              // contrast: an S-curve
        if (uBg > 0.5) {
          // a paper backdrop in display values (uCorners: top left, top right, bottom left, bottom right) and the
          // glow of a lamp behind the subject, laid behind whatever the model covers
          float v = mix(mix(uCorners.x, uCorners.y, vUv.x), mix(uCorners.z, uCorners.w, vUv.x), 1.0 - vUv.y);
          float g = distance(vec2(vUv.x * uAspect, vUv.y), vec2(uGlow.x * uAspect, uGlow.y)) / max(uGlow.z, 1e-4);
          vec3 bg = v * uTint + (1.0 - v) * uGlow.w * exp(-g * g);
          c += bg * (1.0 - clamp(texture2D(tA, vUv).a, 0.0, 1.0));
        }
        c *= 1.0 - uVig * smoothstep(0.35, 0.95, length(vUv - 0.5));              // a light vignette
        c = c * (1.0 - uLift) + uLift;                                            // lifted blacks, as graded film
        c += (h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 7.3) - 1.0) * uGrain;      // fine grain, also dithers the darks
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  // ---------------------------------------------------------------- haze: a raymarched pass over the frame
  let haze = null, depthRT = null;
  const depthOnly = new THREE.MeshBasicMaterial({colorWrite: false});
  const hazeSegs = () => {
    const list = [];
    for (const G of groups) {
      if (!G.glow) continue;
      if (G.kind === 'tubes') for (const s of G.segs) list.push({a: s.a, b: s.b, k: () => G.glow * s.lv});
      else {
        // a box glows as the line down its longer middle
        const [ax, half] = G.w >= G.h ? [G.ax, G.w / 2] : [G.ay, G.h / 2];
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        list.push({a, b, k: () => (a.copy(G.pos).addScaledVector(ax, -half), b.copy(G.pos).addScaledVector(ax, half), G.glow * G.lv)});
      }
    }
    return list;
  };
  let segs = [];
  const makeHaze = () => {
    // defaults are the showroom film's, scaled from its 5.6 m car to this subject (unit = metres per haze unit)
    const o = {even: 0.008, smoke: 0.22, scatter: 0.045, steps: 72, tint: [1, 0.985, 0.96], floor: 0, unit: R / 2.8, ...(hazeIn === true ? {} : hazeIn)};
    const U = o.unit;
    const lo = V(o.box?.[0] ?? [centre.x - 9 * U, o.floor, centre.z - 9 * U]), hi = V(o.box?.[1] ?? [centre.x + 9 * U, o.floor + 6.5 * U, centre.z + 9 * U]);
    const f = (x) => Number(x).toFixed(5);
    segs = hazeSegs();
    if (!segs.length) return;
    depthRT = new THREE.WebGLRenderTarget(W, H, {depthTexture: new THREE.DepthTexture(W, H)});
    haze = new ShaderPass({
      uniforms: {
        tDiffuse: {value: null}, tDepth: {value: null}, uInvProj: {value: new THREE.Matrix4()}, uCamWorld: {value: new THREE.Matrix4()},
        uA: {value: segs.map((s) => s.a)}, uB: {value: segs.map((s) => s.b)}, uK: {value: segs.map(() => 0)}, uTime: {value: 0}, uSeed: {value: 0},
      },
      vertexShader: vs,
      fragmentShader: `
        #define NSEG ${segs.length}
        uniform sampler2D tDiffuse, tDepth; uniform mat4 uInvProj, uCamWorld;
        uniform vec3 uA[NSEG], uB[NSEG]; uniform float uK[NSEG]; uniform float uTime, uSeed;
        varying vec2 vUv;
        float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vn(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 3.1) + 0.125 * vn(p * 4.01 + 7.7) + 0.0625 * vn(p * 8.1 + 1.3); }
        // an even haze through the room, and smoke that hangs near the floor in slow drifting banks
        float density(vec3 w) {
          vec3 p = (w - vec3(0.0, ${f(o.floor)}, 0.0)) / ${f(U)};
          float low = exp(-max(p.y, 0.0) / 0.7);
          vec3 q = vec3(p.x, p.y * 2.2, p.z) * 0.75 + vec3(uTime * 0.085, -uTime * 0.02, uTime * 0.05);
          float n = fbm(q + 0.6 * fbm(q * 0.7 + 5.0));
          float drift = fbm(p * 0.21 + vec3(-uTime * 0.03, uTime * 0.01, 4.0));
          return (${f(o.even)} * (0.25 + 1.9 * smoothstep(0.25, 0.75, drift)) * exp(-max(p.y - 4.2, 0.0) / 2.0) + ${f(o.smoke)} * low * smoothstep(0.3, 0.8, n)) / ${f(U)};
        }
        // light reaching p from the lights: each is a line light, integrated in closed form
        float glow(vec3 p) {
          float s = 0.0;
          for (int i = 0; i < NSEG; i++) {
            vec3 ab = uB[i] - uA[i]; float len = length(ab); vec3 dir = ab / len;
            vec3 ap = uA[i] - p; float t1 = dot(ap, dir);
            float d = max(length(ap - dir * t1), ${f(0.32 * U)});
            s += uK[i] * (atan((t1 + len) / d) - atan(t1 / d)) / d;
          }
          return s * ${f(U)};
        }
        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float z = texture2D(tDepth, vUv).x;
          vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); v /= v.w;
          vec3 ro = uCamWorld[3].xyz;
          vec3 rd = (uCamWorld * vec4(v.xyz, 1.0)).xyz - ro;
          float dist = min(length(rd), ${f(45 * U)}); rd = normalize(rd);
          // march only through the lit part of the room, so the steps stay fine
          vec3 inv = 1.0 / rd, ta = (vec3(${f(lo.x)}, ${f(lo.y)}, ${f(lo.z)}) - ro) * inv, tb = (vec3(${f(hi.x)}, ${f(hi.y)}, ${f(hi.z)}) - ro) * inv;
          vec3 lo = min(ta, tb), hi = max(ta, tb);
          float tn = max(max(max(lo.x, lo.y), lo.z), 0.0), tf = min(min(min(hi.x, hi.y), hi.z), dist);
          const int N = ${o.steps};
          float ds = max(tf - tn, 0.0) / float(N);
          ro += rd * tn;
          float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uSeed, vec2(0.06711056, 0.00583715))));
          float T = 1.0, L = 0.0;
          for (int k = 0; k < N; k++) {
            vec3 p = ro + rd * (float(k) + j) * ds;
            float a = exp(-density(p) * ds);
            L += T * (1.0 - a) * glow(p);
            T *= a;
          }
          gl_FragColor = vec4(col * T + vec3(${o.tint.map(f).join(', ')}) * L * ${f(o.scatter)}, 1.0);
        }`,
    });
    haze.uniforms.tDepth.value = depthRT.depthTexture; // ShaderPass clones its uniforms and drops render-target textures
  };

  // ---------------------------------------------------------------- first frame: patch materials, build the chain
  const patchMaterial = (m) => {
    if (!m?.isMeshStandardMaterial || m.userData.cinePatched) return;
    m.userData.cinePatched = true;
    const prev = m.onBeforeCompile;
    const own = Object.hasOwn(m, 'customProgramCacheKey') ? m.customProgramCacheKey() : prev ? prev.toString() : '';
    const spec = 'cineSpec' in m.userData ? m.userData.cineSpec : specMin; // per material: userData.cineSpec, userData.cineNoEnv
    const noEnv = !!m.userData.cineNoEnv; // a surface the capture is wrong for (a floor far wider than the subject)
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, {uCineFill: uFill, uCineSet: uSet, uCineEmit: uEmit});
      // uCineEmit switches off everything the material emits (also what a model's own shader edits add), for the
      // reflections pass
      sh.fragmentShader = need(sh.fragmentShader, 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance * uCineEmit;')
        .replace('#include <common>', '#include <common>\nuniform float uCineFill, uCineEmit;\nuniform vec4 uCineSet;')
        .replace('#include <envmap_physical_pars_fragment>', ENV)
        .replace('#include <lights_physical_pars_fragment>', direct(spec))
        .replace('#include <lights_fragment_maps>', noEnv ? '' : MAPS);
    };
    m.customProgramCacheKey = () => `${own}|cine:${spec}:${noEnv}`;
    m.needsUpdate = true;
  };
  const clear = [], unlit = [], glows = []; // transparent meshes; opaque and see-through ones with unlit materials
  let B = null, bloom = null;
  const init = () => {
    if (B) return;
    const glowing = new Set(emitters.map((e) => e.mat));
    const each = (root, fn) => root.traverse((o) => o.isMesh && fn(o, Array.isArray(o.material) ? o.material : [o.material]));
    each(model.root, (o, mats) => {
      mats.forEach(patchMaterial);
      o.castShadow = !mats[0].transparent && o.userData.cineShadow !== false;
      o.receiveShadow = true;
      if (mats[0].transparent) clear.push(o);
      if (!mats[0].isMeshStandardMaterial) (mats[0].transparent ? glows : unlit).push(o);
    });
    each(room, (o, mats) => {
      mats.forEach(patchMaterial);
      if (glowing.has(mats[0])) return;
      o.receiveShadow = true;
      if (mats[0].transparent) clear.push(o);
    });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    if (hazeIn) makeHaze();
    B = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, {type: THREE.HalfFloatType}));
    B.setPixelRatio(1);
    B.setSize(W, H);
    B.addPass(combine);
    if (haze) B.addPass(haze);
    bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0, 0.3, 1);
    B.addPass(bloom);
    B.addPass(new OutputPass());
    B.addPass(finish);
    // ShaderPass clones its uniforms and drops render-target textures: give them after
    combine.uniforms.tD.value = accD.texture;
    combine.uniforms.tE.value = accE.texture;
    combine.uniforms.tA.value = accA.texture;
    finish.uniforms.tA.value = accA.texture;
  };
  const hide = (list, fn) => {
    const was = list.map((o) => o.visible);
    for (const o of list) o.visible = false;
    fn();
    list.forEach((o, i) => (o.visible = was[i]));
  };

  /** Render frame i as a PNG data URL. sub = samples (default clip.sub; a hero still wants 256 to 1024).
   *  view: 0 the picture; with occlusion on, 1 the lamps' light, 2 the reflections, 3 the occlusion, 4 coverage. */
  const frame = (i, sub = clip.sub, view = 0) => {
    init();
    if (!film.shots.length) throw new Error('cine: no shots');
    const t0 = i / clip.fps, tm = (i + 0.5 * clip.shutter) / clip.fps;
    const shot = shotOf(t0); // fixed for the frame, so a cut is clean
    setLevels(tm);
    capture();
    const cm = camOf(shot, tm);
    renderer.toneMappingExposure = grade.exposure * (cm.ev ?? 1);
    if (haze) {
      // scene depth for the haze, from the middle of the shutter and the centre of the lens
      poseCamera(cm);
      const U = haze.uniforms;
      U.uInvProj.value.copy(camera.projectionMatrixInverse);
      U.uCamWorld.value.copy(camera.matrixWorld);
      U.uK.value = segs.map((s) => s.k());
      U.uTime.value = tm;
      U.uSeed.value = (i * 7.31) % 64;
      lampsOn(false);
      scene.overrideMaterial = depthOnly;
      renderer.setRenderTarget(depthRT);
      renderer.clear();
      hide(clear, () => renderer.render(scene, camera));
      scene.overrideMaterial = null;
    }
    for (const t of [accD, accE, accA]) {
      renderer.setRenderTarget(t);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
    }
    const needCover = !occ && !!grade.backdrop;
    for (let s = 0; s < sub; s++) {
      const t = (i + ((s + 0.5) / sub) * clip.shutter) / clip.fps;
      const c = camOf(shot, t);
      poseModel(t, c, shot);
      setLevels(t);
      const rr = Math.sqrt((s + 0.5) / sub), th = s * 2.399963; // a golden-angle spiral over the lens
      poseCamera(c, [rr * Math.cos(th), rr * Math.sin(th)], [halton(s + 1, 2) - 0.5, halton(s + 1, 3) - 0.5]);
      placeLights(s);
      lampsOn(true);
      emit('seen');
      uEmit.value = 1;
      if (!occ) {
        scene.environmentIntensity = envIntensity;
        pass(accD, 1 / sub);
        if (needCover) {
          lampsOn(false);
          scene.overrideMaterial = cover;
          hide(clear, () => pass(accA, 1 / sub));
          scene.overrideMaterial = null;
        }
        continue;
      }
      // D: the lamps, with shadows
      scene.environmentIntensity = 0;
      pass(accD, 1 / sub);
      // E: the reflections and the bounce. Nothing may glow twice: emitters, emissive and unlit materials go dark
      // (opaque unlit meshes turn black so they still cover what is behind them; see-through ones are left out).
      lampsOn(false);
      emit('off');
      uEmit.value = 0;
      scene.environmentIntensity = envIntensity;
      const mats = unlit.map((o) => o.material);
      for (const o of unlit) o.material = blackMat;
      hide(glows, () => pass(accE, 1 / sub));
      unlit.forEach((o, k) => (o.material = mats[k]));
      // AO: how much of its surroundings each point sees
      const y = 1 - (2 * (((s * 97) % sub) + 0.5)) / sub, r = Math.sqrt(1 - y * y), ph = s * 2.399963 * 1.7;
      aoLamp.position.set(r * Math.cos(ph), y, r * Math.sin(ph)).multiplyScalar(5 * R).add(centre);
      aoLamp.visible = true;
      scene.environmentIntensity = 0;
      scene.overrideMaterial = white;
      hide(clear, () => pass(accA, 1 / sub));
      scene.overrideMaterial = null;
      aoLamp.visible = false;
    }
    combine.uniforms.uAO.value.set(occ ? occ.strength : 0, occ ? occ.gamma : 1);
    combine.uniforms.uView.value = view;
    const F = finish.uniforms, g = grade, plain = view > 0;
    Object.assign(bloom, {strength: plain ? 0 : g.bloom.strength, radius: g.bloom.radius, threshold: g.bloom.threshold});
    F.uSharp.value = plain ? 0 : g.sharp;
    F.uCurve.value = plain ? 0 : g.curve;
    F.uVig.value = plain ? 0 : g.vignette;
    F.uLift.value = plain ? 0 : g.lift;
    F.uGrain.value = plain ? 0 : g.grain;
    F.uWarm.value.set(...(plain ? [1, 1, 1] : g.warm));
    F.uSeed.value = i * 1.618;
    const bd = g.backdrop;
    F.uBg.value = bd && !plain ? 1 : 0;
    if (bd) {
      F.uCorners.value.set(...(bd.corners ?? [40, 40, 40, 40]).map((k) => k / 255));
      F.uTint.value.set(...(bd.tint ?? [1, 1, 1]));
      F.uGlow.value.set(bd.glow?.at[0] ?? 0.5, bd.glow?.at[1] ?? 0.5, bd.glow?.r ?? 0.1, bd.glow?.k ?? 0);
    }
    renderer.setRenderTarget(null);
    B.render();
    return renderer.domElement.toDataURL('image/png');
  };

  return {
    ready: true, clip, grade, room, set, camera, centre, radius: R, captured,
    dark, box, tubes, dome, floor, frame, poseCamera,
    get frames() {
      return Math.max(1, Math.round(clip.fps * clip.seconds));
    },
    get shots() {
      return film.shots;
    },
    set shots(list) {
      film.shots = list;
    },
    /** the params' values wherever a shot's `set` does not say otherwise: {steer: 0, aero: 0} */
    set rest(o) {
      film.rest = o;
    },
    /** pose(t, cam, shot): called after model.update on every sub-frame, for what the model's params do not cover */
    set pose(fn) {
      film.pose = fn;
    },
  };
}
