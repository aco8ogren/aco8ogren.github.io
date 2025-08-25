#!/usr/bin/env python3
# ./build_art.py — ultra-simple SVG → JSON + OBJ + GLB
#
# Assumptions (tailored for your Inkscape export):
#   • Shapes are filled, hole-free polygons
#   • We support <polygon points="..."> and straight-line <path d="M/L/H/V/Z ... Z">
#   • No transforms; coordinates are final
#   • One submesh per shape (use @id when present)
#
# Outputs (all from the same parsed geometry):
#   1) <OUTPUT_PREFIX>_polylines.json  (per-shape vertices + triangle indices)
#   2) <OUTPUT_PREFIX>_mesh.obj        (grouped by shape name)
#   3) <OUTPUT_PREFIX>.glb             (GLB with one child mesh per shape)
#
# Deps: numpy, trimesh   (pip install numpy trimesh)

import os
import re
import json
import xml.etree.ElementTree as ET
from typing import List, Tuple, Dict

import numpy as np
import trimesh

# =========================
# 0) EDIT THESE PATHS/FLAGS
# =========================
INPUT_SVG = r"./graphics/svg/maple_leaf.svg"
OUTPUT_PREFIX = r"./graphics/build/maple_leaf"  # no extension
EXPORT_OBJ = True
EXPORT_JSON = True
EXPORT_GLB = True

# Fallback to uploaded asset (optional)
if not os.path.isfile(INPUT_SVG):
    alt = r"/mnt/data/maple_leaf.svg"
    if os.path.isfile(alt):
        INPUT_SVG = alt
        print(f"[info] Using fallback SVG: {INPUT_SVG}")

os.makedirs(os.path.dirname(OUTPUT_PREFIX), exist_ok=True)


# =========================
# 1) SVG parsing (polygons + simple paths)
# =========================
def parse_polygon_points(points_str: str) -> List[Tuple[float, float]]:
    toks = points_str.replace(',', ' ').split()
    vals = []
    for t in toks:
        if t:
            vals.append(float(t))
    if len(vals) < 6 or len(vals) % 2 != 0:
        raise ValueError(f"Bad polygon points (got {len(vals)} numbers)")
    pts = [(vals[i], vals[i+1]) for i in range(0, len(vals), 2)]
    # drop duplicate close if present
    if len(pts) > 2 and pts[0] == pts[-1]:
        pts.pop()
    return pts


_num = r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?'
_tok_re = re.compile(rf'[MmLlHhVvZz]|{_num}')


def parse_path_straight_lines(d: str) -> List[List[Tuple[float, float]]]:
    """
    Minimal path parser for M/m, L/l, H/h, V/v, Z/z only.
    Returns list of closed rings; each ring is a list of (x,y). No holes supported by design.
    """
    toks = _tok_re.findall(d)
    i = 0
    rings: List[List[Tuple[float, float]]] = []
    cur = (0.0, 0.0)
    start = None
    pts: List[Tuple[float, float]] = []

    def flush_ring():
        nonlocal pts
        if len(pts) >= 3:
            if len(pts) > 2 and pts[0] == pts[-1]:
                pts.pop()
            if len(pts) >= 3:
                rings.append(pts)
        pts = []

    while i < len(toks):
        t = toks[i]
        i += 1
        if t in 'Mm':
            rel = (t == 'm')
            if i + 1 >= len(toks):
                break
            x = float(toks[i])
            y = float(toks[i+1])
            i += 2
            cur = (cur[0] + x, cur[1] + y) if rel else (x, y)
            if pts:
                flush_ring()
            pts = [cur]
            start = cur
            # implicit L’s
            while i + 1 < len(toks) and re.fullmatch(_num, toks[i]) and re.fullmatch(_num, toks[i+1]):
                x = float(toks[i])
                y = float(toks[i+1])
                i += 2
                nxt = (cur[0] + x, cur[1] + y) if rel else (x, y)
                pts.append(nxt)
                cur = nxt

        elif t in 'Ll':
            rel = (t == 'l')
            while i + 1 < len(toks) and re.fullmatch(_num, toks[i]) and re.fullmatch(_num, toks[i+1]):
                x = float(toks[i])
                y = float(toks[i+1])
                i += 2
                nxt = (cur[0] + x, cur[1] + y) if rel else (x, y)
                pts.append(nxt)
                cur = nxt

        elif t in 'Hh':
            rel = (t == 'h')
            while i < len(toks) and re.fullmatch(_num, toks[i]):
                x = float(toks[i])
                i += 1
                nx = cur[0] + x if rel else x
                cur = (nx, cur[1])
                pts.append(cur)

        elif t in 'Vv':
            rel = (t == 'v')
            while i < len(toks) and re.fullmatch(_num, toks[i]):
                y = float(toks[i])
                i += 1
                ny = cur[1] + y if rel else y
                cur = (cur[0], ny)
                pts.append(cur)

        elif t in 'Zz':
            if start is not None and cur != start:
                pts.append(start)
                cur = start
            flush_ring()
            start = None

        else:
            raise ValueError(f"Unexpected path token: {t}")

    if pts:
        flush_ring()
    return rings


def read_shapes(svg_path: str) -> List[Dict]:
    """Return list of shapes: {name, vertices:[(x,y),...]} — hole-free only."""
    tree = ET.parse(svg_path)
    root = tree.getroot()

    def q(tag: str) -> str:
        if root.tag.startswith('{'):
            ns = root.tag.split('}')[0].strip('{')
            return f"{{{ns}}}{tag}"
        return tag

    out = []
    k = 0

    # polygons
    for el in root.findall(f'.//{q("polygon")}'):
        pts = (el.get('points') or '').strip()
        if not pts:
            continue
        name = el.get('id') or f'poly_{k}'
        k += 1
        verts = parse_polygon_points(pts)
        if len(verts) >= 3:
            out.append({'name': name, 'vertices': verts})

    # paths (straight lines only)
    for el in root.findall(f'.//{q("path")}'):
        d = (el.get('d') or '').strip()
        if not d:
            continue
        style = (el.get('style') or '')
        fill = (el.get('fill') or '')
        if 'fill:none' in style.replace(' ', '').lower() or fill.strip().lower() == 'none':
            continue
        rings = parse_path_straight_lines(d)
        base = el.get('id') or f'path_{k}'
        k += 1
        for j, verts in enumerate(rings):
            if len(verts) >= 3:
                nm = base if j == 0 else f"{base}_{j}"
                out.append({'name': nm, 'vertices': verts})

    if not out:
        raise RuntimeError("No filled, hole-free polygons found under our assumptions.")
    return out


# =========================
# 2) Tiny ear-clipping triangulation (no holes)
# =========================
def signed_area(poly: List[Tuple[float, float]]) -> float:
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i+1) % len(poly)]
        a += x0*y1 - y0*x1
    return 0.5 * a


def is_convex(a, b, c) -> bool:
    # z-component of cross (b-a)×(c-b)
    return (b[0]-a[0])*(c[1]-b[1]) - (b[1]-a[1])*(c[0]-b[0]) > 1e-12


def point_in_tri(p, a, b, c) -> bool:
    # barycentric sign method
    def s(p1, p2, p3):
        return (p1[0]-p3[0])*(p2[1]-p3[1]) - (p2[0]-p3[0])*(p1[1]-p3[1])
    b1 = s(p, a, b) < 0.0
    b2 = s(p, b, c) < 0.0
    b3 = s(p, c, a) < 0.0
    return (b1 == b2) and (b2 == b3)


def earclip_triangulate(vertices: List[Tuple[float, float]]) -> List[Tuple[int, int, int]]:
    """
    Simple O(n^2) ear clipping for one simple, hole-free polygon.
    Returns triangle indices into the input vertex list.
    """
    n = len(vertices)
    if n < 3:
        return []

    # Ensure CCW winding for convex test
    verts = vertices[:]
    reversed_indices = False
    if signed_area(verts) < 0:
        verts = verts[::-1]
        reversed_indices = True

    idxs = list(range(len(verts)))
    tris: List[Tuple[int, int, int]] = []

    guard = 0
    while len(idxs) > 3 and guard < 10000:
        guard += 1
        ear_found = False
        m = len(idxs)
        for ii in range(m):
            i_prev = idxs[(ii-1) % m]
            i_curr = idxs[ii]
            i_next = idxs[(ii+1) % m]
            a, b, c = verts[i_prev], verts[i_curr], verts[i_next]
            if not is_convex(a, b, c):
                continue
            # any other point inside this ear triangle?
            inside = False
            for jj in idxs:
                if jj in (i_prev, i_curr, i_next):
                    continue
                if point_in_tri(verts[jj], a, b, c):
                    inside = True
                    break
            if inside:
                continue
            # it's an ear
            tris.append((i_prev, i_curr, i_next))
            del idxs[ii]
            ear_found = True
            break
        if not ear_found:
            # fallback: drop a vertex to break colinear/degenerate loops
            if m <= 3:
                break
            del idxs[0]

    if len(idxs) == 3:
        tris.append((idxs[0], idxs[1], idxs[2]))

    if reversed_indices:
        n = len(vertices)
        # verts was reversed relative to input; map indices back to original
        tris = [(n-1-a, n-1-b, n-1-c) for (a, b, c) in tris]

    return tris


# =========================
# 3) Exporters (JSON / OBJ / GLB)
# =========================
def export_json(shapes: List[Dict], prefix: str):
    """
    Write prefix_polylines.json:
    {
      "shapes":[
        {"name":"id_1","vertices":[[x,y],...],"triangles":[[i,j,k],...]},
        ...
      ]
    }
    """
    out = {"shapes": []}
    for sh in shapes:
        verts = sh["vertices"]
        tris = earclip_triangulate(verts)
        out["shapes"].append({
            "name": sh["name"],
            "vertices": verts,
            "triangles": tris
        })
    path = f"{prefix}_polylines.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"✓ Wrote {path} (shapes: {len(out['shapes'])})")


def export_obj(shapes: List[Dict], prefix: str):
    """
    Single OBJ with per-shape 'o' groups. Z=0.
    """
    lines = []
    v_offset = 0
    total_v = 0
    total_f = 0
    for sh in shapes:
        name = sh["name"]
        verts2d = sh["vertices"]
        tris = earclip_triangulate(verts2d)
        if len(tris) == 0:
            continue
        lines.append(f"o {name}")
        # vertices
        for (x, y) in verts2d:
            lines.append(f"v {x:.6f} {y:.6f} 0.0")
        # faces (1-based indices)
        for (i, j, k) in tris:
            a = v_offset + i + 1
            b = v_offset + j + 1
            c = v_offset + k + 1
            lines.append(f"f {a} {b} {c}")
        v_offset += len(verts2d)
        total_v += len(verts2d)
        total_f += len(tris)
    path = f"{prefix}_mesh.obj"
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + ("\n" if lines else ""))
    print(f"✓ Wrote {path} (verts: {total_v}, faces: {total_f})")


def export_glb_from_shapes(shapes: List[Dict], prefix: str):
    """
    Build a trimesh.Scene from the already-triangulated shapes and write GLB.
    """
    geoms = {}
    for sh in shapes:
        name = sh["name"]
        verts2d = np.array(sh["vertices"], dtype=np.float32)
        tris = earclip_triangulate(sh["vertices"])
        if len(tris) == 0 or len(verts2d) < 3:
            continue
        V = np.column_stack([verts2d[:, 0], verts2d[:, 1], np.zeros(len(verts2d), dtype=np.float32)]).astype(np.float32)
        F = np.array(tris, dtype=np.int32)
        m = trimesh.Trimesh(vertices=V, faces=F, process=False)
        # ensure unique key
        base, n = name, 1
        while name in geoms:
            name = f"{base}_{n}"
            n += 1
        geoms[name] = m

    if not geoms:
        raise RuntimeError("No triangulated shapes to export to GLB.")
    scene = trimesh.Scene(geoms)
    out_path = f"{prefix}.glb"
    scene.export(out_path, file_type='glb')
    print(f"✓ Wrote {out_path} (submeshes: {len(geoms)})")


# =========================
# 4) Run (Spyder ▶)
# =========================
print(f"[build_art] Input SVG:     {INPUT_SVG}")
print(f"[build_art] Output prefix: {OUTPUT_PREFIX}")

shapes = read_shapes(INPUT_SVG)
for s in shapes:
    print(f"  • {s['name']}: {len(s['vertices'])} verts")

if EXPORT_JSON:
    export_json(shapes, OUTPUT_PREFIX)
if EXPORT_OBJ:
    export_obj(shapes, OUTPUT_PREFIX)
if EXPORT_GLB:
    export_glb_from_shapes(shapes, OUTPUT_PREFIX)

print("✓ Done.")
