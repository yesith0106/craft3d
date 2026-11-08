// Manufacturer CAD inside a model: unpack what tools/step2mesh.py exported and tools/cadpack.mjs embedded.
//   import {HEAD, DATA} from './cad-data.js';
//   import {unpackCad} from '../craft/cad.js';
//   export const {PARTS, BOXES, part} = await unpackCad(HEAD, DATA);
//   for (const p of part('TOPCASE')) for (const t of p.t) k.add(group, p.geo, M.case).position.set(...t);
// Geometry stays in the CAD's own frame and units (mm). Normals are creased at 30 degrees, so fillets shade smooth
// and real edges stay sharp, which also gives the drawing look its crease lines.
import * as THREE from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

async function gunzip(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** -> {PARTS: [{name, geo, t: [[dx, dy, dz]...] offsets of its copies, bb}], BOXES: {name: [[min], [max]]...}, part(name)} */
export async function unpackCad(HEAD, DATA, {crease = 30} = {}) {
  const buf = await gunzip(DATA);
  const PARTS = HEAD.parts.map((h) => {
    const q = new Int16Array(buf, h.p, h.nv * 3);
    const pos = new Float32Array(h.nv * 3);
    for (let i = 0; i < h.nv; i++) for (let j = 0; j < 3; j++) pos[i * 3 + j] = q[i * 3 + j] * 0.01 + h.c[j];
    const idx = h.u32 ? new Uint32Array(buf.slice(h.ix, h.ix + h.nf * 12)) : new Uint16Array(buf.slice(h.ix, h.ix + h.nf * 6));
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g = toCreasedNormals(g, THREE.MathUtils.degToRad(crease));
    g.computeBoundingBox();
    return {name: h.name, geo: g, t: h.t, bb: h.bb};
  });
  return {PARTS, BOXES: HEAD.boxes ?? {}, part: (name) => PARTS.filter((p) => p.name === name)};
}
