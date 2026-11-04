// Numeric checks that catch what screenshots hide. Run them from the page (VIEW.check()) after every change.
//   floatingParts(root)        meshes that touch nothing: a bracket in mid-air, a bolt off the surface, a detail
//                              left behind when its part moved. Box-based, so it errs toward "touching": a hit is real.
//   anchorGaps(struts.list)    actuator ends that are not on the part they claim to be mounted to: the cylinder that
//                              pushes on air. Each end must sit within tol of a mesh of its anchor object.
//   overlaps(root, pairs)      named parts that must NOT intersect (a boom folding into its own post).
// All distances in metres (the scene's units), whatever the model was built in.
import * as THREE from 'three';

const boxesOf = (root, skip = () => false) => {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || skip(o)) return;
    if (o.isInstancedMesh) {
      o.computeBoundingBox(); // the union of its instances
      out.push({o, b: o.boundingBox.clone().applyMatrix4(o.matrixWorld)});
      return;
    }
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    out.push({o, b: o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)});
  });
  return out;
};
const label = (o) => {
  const names = [];
  for (let p = o; p && names.length < 4; p = p.parent) if (p.name) names.push(p.name);
  return (names.join(' < ') || o.geometry.type) + ` @ ${o.getWorldPosition(new THREE.Vector3()).toArray().map((v) => v.toFixed(3)).join(',')}`;
};

/** meshes whose bounding box (grown by tol) meets no other mesh's box and doesn't reach the ground (groundY, null = no ground) */
export function floatingParts(root, {tol = 0.003, skip, groundY = 0} = {}) {
  const all = boxesOf(root, skip);
  const grown = all.map(({b}) => b.clone().expandByScalar(tol));
  const lonely = [];
  for (let i = 0; i < all.length; i++) {
    let hit = groundY !== null && all[i].b.min.y <= groundY + tol; // resting on the ground counts as supported
    for (let j = 0; j < all.length && !hit; j++) if (i !== j && grown[i].intersectsBox(all[j].b)) hit = true;
    if (!hit) lonely.push(label(all[i].o));
  }
  return lonely;
}

/** each strut end's distance to the nearest mesh box among its anchor object's direct mesh children */
export function anchorGaps(struts, {tol = 0.004} = {}) {
  const own = new Set();
  for (const s of struts) s.g.traverse((o) => own.add(o));
  const p = new THREE.Vector3();
  const bad = [];
  struts.forEach((s, i) => {
    for (const [end, A] of [['A', s.A], ['B', s.B]]) {
      A.obj.localToWorld(p.set(...A.off));
      let best = Infinity;
      // the anchor object's own meshes (direct children), not the joints further down the chain
      for (const m of A.obj.children) {
        if (!m.isMesh || own.has(m)) continue;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        // measured in the part's own frame, so a long part at an angle doesn't count its empty corners
        const lp = m.worldToLocal(p.clone());
        best = Math.min(best, m.geometry.boundingBox.distanceToPoint(lp) * m.matrixWorld.getMaxScaleOnAxis());
      }
      if (best > tol) bad.push({strut: i, end, gap: +best.toFixed(4)});
    }
  });
  return bad;
}

/** pairs of objects that must stay apart: [[a, b, minGap], ...]; returns the ones whose boxes come too close */
export function overlaps(pairs) {
  const box = (o) => new THREE.Box3().setFromObject(o);
  return pairs
    .map(([a, b, gap = 0]) => {
      const A = box(a);
      const B = box(b);
      return A.clone().expandByScalar(gap).intersectsBox(B) ? `${a.name || 'a'} x ${b.name || 'b'}` : null;
    })
    .filter(Boolean);
}
