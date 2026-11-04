// Lighting, ground and post-processing in one call.
//   createStage({canvas, mode: 'studio'})   neutral grey cyclorama, room-light reflections, key / fill / rim, a concrete
//                                          floor that dissolves into the backdrop. For inspecting a model.
//   createStage({canvas, mode: 'outdoor'})  physical sky with haze, sun shadows that follow a point, a 900 m concrete
//                                          ground broken up by large-scale dirt. For worlds and games.
// Both render through an MSAA HDR target with ambient occlusion (GTAO). Anything in `fx` (sprites, particles,
// transparent cards) or in `noAO` is skipped by the occlusion pass: AO treats every drawn surface as solid and would
// paint a dark slab where a soft sprite is.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {concreteTexture, macroTexture} from './textures.js';

/** GTAO that leaves a list of objects out of its depth/normal render */
class SelectiveGTAO extends GTAOPass {
  constructor(scene, camera, skip) {
    super(scene, camera, 4, 4);
    this.skip = skip;
  }
  render(...a) {
    const was = this.skip.map((o) => o.visible);
    for (const o of this.skip) o.visible = false;
    super.render(...a);
    this.skip.forEach((o, i) => (o.visible = was[i]));
  }
}

const PRESET = {
  studio: {tone: THREE.AgXToneMapping, exposure: 1.05, fov: 30, near: 0.05, far: 120, shadow: THREE.PCFShadowMap, box: 3.5, aoRadius: 0.2},
  outdoor: {tone: THREE.ACESFilmicToneMapping, exposure: 0.5, fov: 48, near: 0.1, far: 600, shadow: THREE.PCFShadowMap, box: 15, aoRadius: 0.35},
};

export function createStage({canvas, mode = 'studio', sunDir, fog = 0.0115, shadowBox} = {}) {
  const S = PRESET[mode] ?? PRESET.studio;
  const outdoor = mode === 'outdoor';
  const box = shadowBox ?? S.box;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = S.tone;
  renderer.toneMappingExposure = S.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = S.shadow;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(S.fov, 1, S.near, S.far);
  const fx = new THREE.Group();
  scene.add(fx);
  const noAO = [fx];

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new SelectiveGTAO(scene, camera, noAO);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.8;
  gtao.updateGtaoMaterial({radius: S.aoRadius, distanceExponent: 1.4, thickness: 0.7, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12});
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  const SUN = (sunDir ?? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(outdoor ? 56 : 42), THREE.MathUtils.degToRad(outdoor ? -130 : -38))).clone().normalize();
  const sun = new THREE.DirectionalLight(outdoor ? '#ffeed6' : '#fff6ec', outdoor ? 3.6 : 2.4);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -box, right: box, top: box, bottom: -box, near: 0.5, far: outdoor ? 90 : 30});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);
  let ground;
  const pm = new THREE.PMREMGenerator(renderer);

  if (outdoor) {
    const sky = new Sky();
    sky.scale.setScalar(1000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(SUN).multiplyScalar(400);
    const env = new THREE.Scene();
    env.add(sky);
    scene.environment = pm.fromScene(env, 0.04, 0.1, 2000).texture;
    scene.environmentIntensity = 0.28;
    scene.add(sky);
    scene.fog = new THREE.FogExp2('#c6cdd3', fog);
    scene.add(new THREE.HemisphereLight('#cfdcea', '#6d655a', 0.25));
    const concrete = concreteTexture();
    const macro = macroTexture();
    const G = 900;
    concrete.repeat.set(G / 4, G / 4);
    const mat = new THREE.MeshStandardMaterial({map: concrete, roughness: 0.92});
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMacro = {value: macro};
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWxz;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWxz = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uMacro;\nvarying vec2 vWxz;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nvec3 mac = texture2D(uMacro, vWxz / 170.0).rgb * texture2D(uMacro, vWxz / 37.0 + 0.31).rgb * 4.0;\ndiffuseColor.rgb *= mac;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.25 - 0.35 * mac.g), 0.55, 1.0);');
    };
    ground = new THREE.Mesh(new THREE.PlaneGeometry(G, G), mat);
  } else {
    // a seamless cyclorama colour; the floor fades into it by distance, so there is no visible edge
    const BACK = new THREE.Color('#d6d9dc');
    scene.background = BACK;
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.55;
    const fill = new THREE.DirectionalLight('#dfe8f2', 0.7);
    fill.position.set(5, 3, 4);
    const rim = new THREE.DirectionalLight('#ffffff', 1.4);
    rim.position.set(-2, 4, -6);
    scene.add(fill, rim, new THREE.HemisphereLight('#f4f6f8', '#8c8a86', 0.35));
    const concrete = concreteTexture(7, '#b5b2ac');
    const SIZE = 40;
    concrete.repeat.set(SIZE / 4, SIZE / 4);
    const mat = new THREE.MeshStandardMaterial({map: concrete, roughness: 0.9});
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBack = {value: BACK};
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBack;\nvarying vec3 vWp;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\nfloat fade = smoothstep(4.0, 11.0, length(vWp.xz));\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uBack, fade);');
    };
    ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
  }
  pm.dispose();
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // the shadow box follows a point, snapped to whole shadow texels so edges don't crawl as it moves
  const view = new THREE.Matrix4().lookAt(SUN, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const inv = view.clone().invert();
  const texel = (2 * box) / 4096;
  const ls = new THREE.Vector3();
  const follow = (p) => {
    ls.copy(p).applyMatrix4(inv);
    ls.x = Math.round(ls.x / texel) * texel;
    ls.y = Math.round(ls.y / texel) * texel;
    ls.applyMatrix4(view);
    sun.target.position.copy(ls);
    sun.position.copy(ls).addScaledVector(SUN, outdoor ? 45 : 14);
    sun.target.updateMatrixWorld();
  };
  follow(new THREE.Vector3());

  let pr = Math.min(devicePixelRatio, 2);
  const resize = (w = innerWidth, h = innerHeight) => {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  /** quality steps for slow GPUs: 2 full, 1 without AO, 0 without AO at pixel ratio 1 */
  const setTier = (t) => {
    gtao.enabled = t >= 2;
    pr = Math.min(devicePixelRatio, t >= 2 ? 2 : t === 1 ? 1.5 : 1);
    resize();
  };
  return {renderer, scene, camera, composer, gtao, sun, ground, fx, noAO, follow, resize, render: (dt) => composer.render(dt), setTier};
}
