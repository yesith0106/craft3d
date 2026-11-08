#!/usr/bin/env python3
"""Read a manufacturer's STEP assembly: list its parts with sizes, cut sections through it, and export chosen parts
as compact meshes for a craft3d model (tools/cadpack.mjs turns the export into src/model/cad-data.js).

Needs OpenCascade's Python bindings, once:  npm run setup:cad   (a venv in .ocp/ with cadquery-ocp and numpy)
Run it with that interpreter:  PY=~/.claude/craft3d/.ocp/bin/python

  $PY tools/step2mesh.py list    part.stp                      every part: name, count, size, bounding box (mm)
  $PY tools/step2mesh.py section part.stp --axis x --at 60     a section outline per part, as an SVG (+ printed spans)
  $PY tools/step2mesh.py export  part.stp out/name [options]   -> out/name.json + out/name.bin.gz

export options:
  --only A,B          export only these part names (default: all)
  --skip A,B          leave these out of the mesh, but record their bounding boxes (threaded screws, inserts):
                      the model draws them as plain cylinders at their CAD positions
  --lin 0.06          tessellation chord error, mm (smaller = finer, bigger file)
  --ang 0.35          tessellation angle, radians
  --coarse A=0.15:0.9 a coarser tessellation for one part (repeatable)
Faces come out consistently wound (reversed B-rep faces flipped), welded at 0.001 mm, so the parts are closed solids
the drawing look can section. Translated copies of one part are stored once with a list of offsets. Positions are
quantised to 0.01 mm, indices 16-bit where they fit, then gzipped.
"""
import argparse, gzip, io, json, sys
import numpy as np
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TDocStd import TDocStd_Document
from OCP.TCollection import TCollection_ExtendedString
from OCP.XCAFDoc import XCAFDoc_DocumentTool
from OCP.TDF import TDF_Label
from OCP.OCP.collections import Sequence_TDF_Label as Seq
from OCP.TDataStd import TDataStd_Name
from OCP.TopLoc import TopLoc_Location
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.BRep import BRep_Tool
from OCP.TopoDS import TopoDS


def read(path):
    doc = TDocStd_Document(TCollection_ExtendedString('doc'))
    r = STEPCAFControl_Reader()
    r.SetNameMode(True)
    if r.ReadFile(path) != 1:
        sys.exit(f'cannot read {path}')
    r.Transfer(doc)
    st = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    out = []  # (name, shape) for every leaf part, placed in the assembly

    def name(l):
        a = TDataStd_Name()
        return a.Get().ToExtString() if l.FindAttribute(TDataStd_Name.GetID_s(), a) else '?'

    def walk(l, loc):
        ref = TDF_Label()
        if st.IsReference_s(l):
            st.GetReferredShape_s(l, ref)
            loc = loc.Multiplied(st.GetLocation_s(l))
            l = ref
        if st.IsAssembly_s(l):
            ch = Seq()
            st.GetComponents_s(l, ch)
            for i in range(1, ch.Length() + 1):
                walk(ch.Value(i), loc)
        else:
            out.append((name(l), st.GetShape_s(l).Moved(loc)))

    roots = Seq()
    st.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i), TopLoc_Location())
    return out


def mesh(shape, lin, ang):
    BRepMesh_IncrementalMesh(shape, lin, False, ang, True)
    V, F, off = [], [], 0
    e = TopExp_Explorer(shape, TopAbs_FACE)
    while e.More():
        f = TopoDS.Face(e.Current())
        L = TopLoc_Location()
        t = BRep_Tool.Triangulation_s(f, L)
        if t is not None:
            tr = L.Transformation()
            rev = f.Orientation() == TopAbs_REVERSED
            for i in range(1, t.NbNodes() + 1):
                p = t.Node(i).Transformed(tr)
                V.append((p.X(), p.Y(), p.Z()))
            for i in range(1, t.NbTriangles() + 1):
                a, b, c = t.Triangle(i).Get()
                F.append((a - 1 + off, c - 1 + off, b - 1 + off) if rev else (a - 1 + off, b - 1 + off, c - 1 + off))
            off += t.NbNodes()
        e.Next()
    V = np.array(V, dtype=np.float64).reshape(-1, 3)
    F = np.array(F, dtype=np.int64).reshape(-1, 3)
    if not len(F):
        return V, F
    q = np.round(V / 1e-3).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    V2, F2 = V[first], inv.reshape(-1)[F]
    F2 = F2[(F2[:, 0] != F2[:, 1]) & (F2[:, 1] != F2[:, 2]) & (F2[:, 0] != F2[:, 2])]
    return V2, F2


def bbox(V):
    return [V.min(0).round(2).tolist(), V.max(0).round(2).tolist()]


def cmd_list(a):
    parts = read(a.step)
    agg = {}
    for n, s in parts:
        V, F = mesh(s, 0.5, 1.0)
        if not len(V):
            continue
        g = agg.setdefault(n, {'n': 0, 'one': None, 'lo': V.min(0), 'hi': V.max(0)})
        g['n'] += 1
        g['one'] = g['one'] if g['one'] is not None else V.max(0) - V.min(0)
        g['lo'] = np.minimum(g['lo'], V.min(0))
        g['hi'] = np.maximum(g['hi'], V.max(0))
    for n, g in sorted(agg.items()):
        lo, hi, one = g['lo'], g['hi'], g['one']
        print(f"{n[:40]:40s} n={g['n']:3d}  one {one[0]:7.2f} x {one[1]:6.2f} x {one[2]:7.2f}   "
              f"X[{lo[0]:8.2f},{hi[0]:8.2f}] Y[{lo[1]:7.2f},{hi[1]:7.2f}] Z[{lo[2]:8.2f},{hi[2]:8.2f}]")


def cmd_section(a):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
    ax = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[a.axis]
    pt = [0, 0, 0]
    pt['xyz'.index(a.axis)] = a.at
    plane = gp_Pln(gp_Pnt(*pt), gp_Dir(*ax))
    keep = {'x': [2, 1], 'y': [0, 2], 'z': [0, 1]}[a.axis]  # (across, up) on the page: cut along x -> z across, y up
    segs = []
    for n, s in read(a.step):
        sec = BRepAlgoAPI_Section(s, plane)
        sec.Build()
        e = TopExp_Explorer(sec.Shape(), TopAbs_EDGE)
        from OCP.BRepAdaptor import BRepAdaptor_Curve
        from OCP.GCPnts import GCPnts_UniformDeflection
        pts = []
        while e.More():
            c = BRepAdaptor_Curve(TopoDS.Edge(e.Current()))
            d = GCPnts_UniformDeflection(c, 0.05)
            line = [(d.Value(i).Coord(keep[0] + 1), d.Value(i).Coord(keep[1] + 1)) for i in range(1, d.NbPoints() + 1)]
            if len(line) > 1:
                pts.append(line)
            e.Next()
        if pts:
            segs.append((n, pts))
            flat = np.array([p for l in pts for p in l])
            print(f"{n[:40]:40s} {'xyz'[keep[0]]}[{flat[:, 0].min():8.2f},{flat[:, 0].max():8.2f}] {'xyz'[keep[1]]}[{flat[:, 1].min():8.2f},{flat[:, 1].max():8.2f}]")
    allp = np.array([p for _, ls in segs for l in ls for p in l])
    lo, hi = allp.min(0) - 5, allp.max(0) + 5
    k = 1600 / (hi[0] - lo[0])
    W, H = 1600, int((hi[1] - lo[1]) * k)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="100%" height="100%" fill="#fff"/>']
    pal = ['#1d4e89', '#c0392b', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#2c3e50', '#b8860b']
    for i, (n, ls) in enumerate(segs):
        for l in ls:
            d = ' '.join(f'{(x - lo[0]) * k:.1f},{(hi[1] - y) * k:.1f}' for x, y in l)
            out.append(f'<polyline fill="none" stroke="{pal[i % len(pal)]}" stroke-width="1.2" points="{d}"><title>{n}</title></polyline>')
    out.append('</svg>')
    path = a.out or f'section-{a.axis}{a.at:g}.svg'
    open(path, 'w').write('\n'.join(out))
    print('->', path)


def cmd_export(a):
    only = set(a.only.split(',')) if a.only else None
    skip = set(a.skip.split(',')) if a.skip else set()
    coarse = {}
    for c in a.coarse or []:
        n, v = c.rsplit('=', 1)
        l, g = v.split(':')
        coarse[n] = (float(l), float(g))
    parts, boxes = {}, {}
    for n, s in read(a.step):
        if only and n not in only and n not in skip:
            continue
        if n in skip:
            V, _ = mesh(s, 0.5, 1.5)
            if len(V):
                boxes.setdefault(n, []).append(bbox(V))
            continue
        lin, ang = coarse.get(n, (a.lin, a.ang))
        V, F = mesh(s, lin, ang)
        if len(F):
            parts.setdefault(n, []).append((V, F))
    head, buf = [], io.BytesIO()

    def put(b):
        o = buf.tell()
        buf.write(b)
        if buf.tell() % 4:
            buf.write(b'\0' * (4 - buf.tell() % 4))
        return o

    for n, lst in parts.items():
        geos = []  # [V, F, [offsets]]: translated copies share one geometry
        for V, F in lst:
            for g in geos:
                if len(g[0]) == len(V):
                    t = V.mean(0) - g[0].mean(0)
                    if np.abs(V - (g[0] + t)).max() < 0.02:
                        g[2].append(t.round(3).tolist())
                        break
            else:
                geos.append([V, F, [[0, 0, 0]]])
        for V, F, ts in geos:
            c = ((V.min(0) + V.max(0)) / 2).round(2)
            q = (V - c) / 0.01
            if np.abs(q).max() >= 32767:
                sys.exit(f'{n} is over 655 mm across; split it or raise the quantum')
            ip = put(np.round(q).astype(np.int16).tobytes())
            big = len(V) > 65535
            ii = put(F.astype(np.uint32 if big else np.uint16).tobytes())
            head.append({'name': n, 'c': c.tolist(), 'nv': len(V), 'nf': len(F), 'u32': big, 'p': ip, 'ix': ii, 't': ts, 'bb': bbox(V)})
    raw = buf.getvalue()
    gz = gzip.compress(raw, 9)
    open(a.out + '.json', 'w').write(json.dumps({'parts': head, 'boxes': boxes}))
    open(a.out + '.bin.gz', 'wb').write(gz)
    print(f'{len(head)} geometries, {sum(h["nf"] for h in head)} triangles, {len(boxes)} parts as boxes; '
          f'{len(raw) / 1024:.0f} KB raw, {len(gz) / 1024:.0f} KB gzipped -> {a.out}.json / .bin.gz')
    for h in sorted(head, key=lambda h: -h['nf'])[:15]:
        print(f"  {h['name'][:38]:38s} {h['nf']:7d} tris  x{len(h['t'])}")


p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sp = p.add_subparsers(dest='cmd', required=True)
l = sp.add_parser('list'); l.add_argument('step')
s = sp.add_parser('section'); s.add_argument('step'); s.add_argument('--axis', default='x'); s.add_argument('--at', type=float, default=0); s.add_argument('--out')
e = sp.add_parser('export'); e.add_argument('step'); e.add_argument('out')
e.add_argument('--only'); e.add_argument('--skip'); e.add_argument('--lin', type=float, default=0.06); e.add_argument('--ang', type=float, default=0.35)
e.add_argument('--coarse', action='append')
a = p.parse_args()
{'list': cmd_list, 'section': cmd_section, 'export': cmd_export}[a.cmd](a)
