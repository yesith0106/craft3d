// Clean, new-condition materials: a study model, a showroom machine, a product shot. Use wear.js for anything used.
// Values chosen to read under the studio stage: clearcoat on paint so it catches the soft boxes, metals with real
// metalness and roughness, glass that stays visible.
//
//   const M = cleanMaterials();            M.blackGloss, M.white, M.orange, M.steel, M.alu, M.brass, M.bronze, ...
//   const M = cleanMaterials({lo: true});  the same palette as flat-shaded Lambert: a cheap build of the same model
import * as THREE from 'three';

const PAINT = (color, extra = {}) => new THREE.MeshPhysicalMaterial({color, roughness: 0.34, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25, ...extra});

export function cleanMaterials({lo = false} = {}) {
  const M = {
    // paints and coatings
    blackGloss: new THREE.MeshPhysicalMaterial({color: '#141518', roughness: 0.3, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.18}),
    blackSatin: new THREE.MeshPhysicalMaterial({color: '#1b1c1f', roughness: 0.55, metalness: 0.15, clearcoat: 0.25}),
    white: PAINT('#f1efea', {roughness: 0.35, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35}),
    orange: PAINT('#e8572a', {roughness: 0.32}),
    red: PAINT('#c2271d'),
    yellow: PAINT('#e0a21b'),
    blue: PAINT('#1f4f8a'),
    // metals
    steel: new THREE.MeshStandardMaterial({color: '#cfd2d6', roughness: 0.22, metalness: 1}),
    chrome: new THREE.MeshStandardMaterial({color: '#e2e4e7', roughness: 0.08, metalness: 1}),
    alu: new THREE.MeshStandardMaterial({color: '#d9dbdf', roughness: 0.3, metalness: 0.85}),
    castAlu: new THREE.MeshStandardMaterial({color: '#b8bcc2', roughness: 0.5, metalness: 0.8}),
    brass: new THREE.MeshStandardMaterial({color: '#b28a3e', roughness: 0.3, metalness: 0.9}),
    bronze: new THREE.MeshStandardMaterial({color: '#b98a55', roughness: 0.3, metalness: 0.9}),
    copper: new THREE.MeshStandardMaterial({color: '#c07a52', roughness: 0.28, metalness: 1}),
    // non-metals
    ceramic: new THREE.MeshPhysicalMaterial({color: '#f3f0ea', roughness: 0.35, metalness: 0, clearcoat: 0.6}),
    rubber: new THREE.MeshStandardMaterial({color: '#1b1c1e', roughness: 0.82, metalness: 0}),
    plastic: new THREE.MeshStandardMaterial({color: '#2a2c30', roughness: 0.6, metalness: 0}),
    // clear glass that still reads: low opacity, strong environment, both faces, no depth write
    glass: new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6}),
    // an overlay that should never be lit or occlude (indicators, arrows)
    accent: new THREE.MeshBasicMaterial({color: '#e3172c', transparent: true, opacity: 0.9, depthWrite: false}),
  };
  if (lo) {
    // flat Lambert, no gloss: blacks lift to graphite so the facets still read without highlights; glass goes opaque
    const flat = (color) => new THREE.MeshLambertMaterial({color, flatShading: true});
    const LO = {blackGloss: '#66696f', blackSatin: '#717479', white: '#ece9e2', orange: '#d9603a', red: '#b8382f', yellow: '#d7a32e', blue: '#3d6596', steel: '#b9bdc3', chrome: '#c9ccd1', alu: '#cfd2d6', castAlu: '#b3b7bd', brass: '#a37b4d', bronze: '#a37b4d', copper: '#ad7655', ceramic: '#ece8e0', rubber: '#3a3b3e', plastic: '#4a4c50', glass: '#86898f'};
    for (const [k, c] of Object.entries(LO)) M[k] = flat(c);
  }
  return M;
}

/** a transparent twin of a material, for fading parts out while keeping their place (isolating a subassembly) */
export function ghostOf(m, opacity = 0.15) {
  const g = m.clone();
  g.transparent = true;
  g.depthWrite = false;
  g.opacity = opacity;
  return g;
}
