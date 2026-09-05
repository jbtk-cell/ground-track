"""
Build THE BERTH in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_berth.py

Writes public/blender/berth.glb and berth-lightmap.png.

The room, per src/env/berth: where resupply arrives, and the only room kept
empty. A regular octagon 4.8 m across the flats under a 3.4 m lid, one
doorway in the +x facet, and in the -x facet the only round opening aboard -
a 1.15 m hatch, shut, with eight dogs round its rim. Sixty-three tie-down
sockets flush in the deck, eleven of them with worn haloes; two stanchions,
one strap left rigged; a rolled cargo net; the manifest board. Nothing in
the middle, at all, on purpose.

IT IS LIT LIKE A WORKPLACE: four cream fittings in a cornice ring and no key,
no accent, no pool. Even light on eight facets is not flat light - each wall
meets the ring at its own angle, and in Cycles the octagon does what it was
drawn to do: eight distinct values off one plain rig.

GEOMETRY NOTE. Each facet's bands are trapezoid prisms in plan - face edge at
the facet's own mitre width, backing edge overlapping the neighbour's - so
the eight walls meet on their mitre lines with sealed backing behind every
joint, and a proud band never pokes past its neighbour's face by more than a
bevelled hairline.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, g2b, gbox, gprism, newmat,
    produce, world,
)

# --------------------------------------------------------------------- plan

A = 2.4                                  # apothem: centre to a flat
FACETS = 8
T22 = math.tan(math.pi / FACETS)         # tan 22.5
FLOOR_Y, CEILING_Y = 0.0, 3.4
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.10

HATCH_R = 0.575
HATCH_Y = 1.28
SURROUND = HATCH_R + 0.15
DOGS = 8

SOCKET_PITCH, SOCKET_HALF = 0.6, 0.055
WORN = {(-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1),
        (1, -1), (0, -1), (-2, 0), (0, 2), (0, -2)}

COLOURS = {
    "LINER": (0.58951, 0.45361, 0.25305),
    "END": (0.50802, 0.38007, 0.20004),
    "KICK": (0.29439, 0.22164, 0.13348),
    "CROWN": (0.08361, 0.07699, 0.06964),
    "DECK": (0.18894, 0.16033, 0.12654),
    "JAMB": (0.13189, 0.11568, 0.09683),
    "FOIL": (0.48515, 0.32314, 0.12477),
    "TRIM": (0.16495, 0.10987, 0.04242),
    "VOID": (0.00518, 0.01096, 0.01938),
    "CREAM": (0.77505, 0.66693, 0.48515),
    "NOSE": (0.72310, 0.69380, 0.62620),
    "SOFT": (0.06050, 0.10220, 0.14830),
    "SCREENBG": (0.02400, 0.03600, 0.05400),
}

ATLAS = 2048
BAKE_SAMPLES = 1024


def materials():
    C = COLOURS
    return {
        "LINER": newmat("LINER", C["LINER"], 0.78, bump=0.14, bump_scale=18, bump_detail=2),
        "KICK": newmat("KICK", C["KICK"], 0.64, bump=0.10, bump_scale=26, bump_detail=2),
        "CROWN": newmat("CROWN", C["CROWN"], 0.88, bump=0.10, bump_scale=14, bump_detail=2),
        "DECK": newmat("DECK", C["DECK"], 0.54, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        # The hatch's mounting plate: the palest surface in the room, because
        # a shut door has to look shut, not like a hole.
        "PLATE": newmat("PLATE", C["NOSE"], 0.50, metal=0.30),
        "LEAF": newmat("LEAF", C["KICK"], 0.42, metal=0.55),
        # The worn haloes round the eleven used sockets: one step lighter than
        # the deck, and the whole reason the emptiness reads as cleared.
        "WEAR": newmat("WEAR", C["END"], 0.60),
        "SOFTM": newmat("SOFT", C["SOFT"], 0.92),
        # Four fittings in a cornice ring: the plainest, evenest light aboard.
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=11.0),
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
    }


def normal_of(k):
    th = k / FACETS * 2 * math.pi
    return math.cos(th), math.sin(th)


def on_facet(k, s, out):
    """Plan point on facet k, s metres along the tangent, at radius out."""
    nx, nz = normal_of(k)
    return (nx * out - nz * s, nz * out + nx * s)


def band_prism(name, k, r_face, r_out, y0, y1, mat):
    """One band of one facet: a trapezoid prism whose face edge sits at the
    facet's own mitre width (plus a bevelled hairline) and whose backing edge
    overlaps the neighbour's backing."""
    s_face = r_face * T22 + 0.004
    s_out = r_out * T22 + 0.02
    plan = [
        on_facet(k, -s_face, r_face),
        on_facet(k, s_face, r_face),
        on_facet(k, s_out, r_out),
        on_facet(k, -s_out, r_out),
    ]
    return gprism(name, plan, (y0, y1), mat)


def octagon(radius):
    """Plan polygon: the octagon whose apothem is `radius`."""
    pts = []
    for k in range(FACETS):
        th = (k + 0.5) / FACETS * 2 * math.pi
        r = radius / math.cos(math.pi / FACETS)
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def xcyl(name, r, x0, x1, gy, gz, mat, segs=24):
    """A cylinder whose axis runs along GAME x."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segs, radius=r, depth=(x1 - x0),
        location=g2b(((x0 + x1) / 2, gy, gz)), rotation=(0, math.radians(90), 0),
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def build_room(M):
    # --- Eight facets, three bands each. The ported facet (0) is held 6 mm
    # inboard; every facet's work band carries liner panels except where the
    # door, the hatch plate or the manifest board owns the wall.
    bands = [
        ("kick", FLOOR_Y, KICK_TOP, A - 0.06, "KICK"),
        ("work", KICK_TOP, WORK_TOP, A + 0.08, "LINER"),
        ("crown", WORK_TOP, CEILING_Y, A - 0.14, "CROWN"),
    ]
    for k in range(FACETS):
        inset = 0.006 if k == 0 else 0.0
        for bname, y0, y1, r_face, mat in bands:
            band_prism(f"w-{k}-{bname}", k, r_face - inset, A + 0.08 + THICK - inset,
                       y0, y1, M[mat])
        # Liner panels: two rows, two columns, 12 mm proud of the work face.
        if k in (0, 2, 4, 6):
            continue
        for col, (s0, s1) in enumerate(((-0.86, -0.06), (0.06, 0.86))):
            for row, (ry0, ry1) in enumerate(((KICK_TOP + 0.03, 1.50), (1.53, WORK_TOP - 0.03))):
                plan = [
                    on_facet(k, s0, A + 0.068),
                    on_facet(k, s1, A + 0.068),
                    on_facet(k, s1, A + 0.081),
                    on_facet(k, s0, A + 0.081),
                ]
                gprism(f"p-{k}-{col}-{row}", plan, (ry0, ry1), M["LINER"])

    # --- The doorway, cut from facet 0 (axis-aligned, so a box cuts it).
    backing = [o for o in bpy.data.objects if o.name.startswith("w-0-")]
    door = gbox("c-door", (A - 0.5, A + 0.5), (FLOOR_Y, SEAM_H),
                (-SEAM_W / 2, SEAM_W / 2), M["JAMB"])
    for w in backing:
        boolean_diff(w, [door])
    bpy.data.objects.remove(door, do_unlink=True)

    gbox("cap-fore", (A + 0.04, A + 0.12), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["LINER"])
    gbox("sky-fore", (A + 0.015, A + 0.020), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # Deck One (owner direction 2026-09-05): a berth is where things dock,
    # and now three things do. The east hatchway (facet 6, local -z) meets
    # the works loop, the west (facet 2, local +z) the science shortcut -
    # both axis-aligned, so the fore door's box-cut idiom serves.
    for tag, k, sign in (("east", 6, -1), ("west", 2, +1)):
        facet = [o for o in bpy.data.objects if o.name.startswith(f"w-{k}-")]
        z0, z1 = sorted((sign * (A - 0.5), sign * (A + 0.5)))
        c = gbox(f"c-{tag}", (-SEAM_W / 2, SEAM_W / 2), (FLOOR_Y, SEAM_H), (z0, z1), M["JAMB"])
        for w in facet:
            boolean_diff(w, [c])
        bpy.data.objects.remove(c, do_unlink=True)
        cz0, cz1 = sorted((sign * (A + 0.04), sign * (A + 0.12)))
        gbox(f"cap-{tag}", (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), (FLOOR_Y, SEAM_H),
             (cz0, cz1), M["LINER"])
        sz0, sz1 = sorted((sign * (A + 0.015), sign * (A + 0.020)))
        gbox(f"sky-{tag}", (-SEAM_W / 2, SEAM_W / 2), (FLOOR_Y, SEAM_H),
             (sz0, sz1), M["SPILL"])

    # --- The hatch, in facet 4 (axis-aligned at -x). A square mounting plate
    # proud of the bands, a circular bore cut through plate and backing
    # together - stopping 5 cm short of the outer face, so the tunnel behind
    # the leaf is sealed by construction - and the shut leaf set 0.14 into the
    # plate. The only curve in the station, and it earns its triangles.
    gbox("hatch-plate", (-A - 0.10, -A + 0.08),
         (HATCH_Y - SURROUND, HATCH_Y + SURROUND), (-SURROUND, SURROUND), M["PLATE"])
    bore = xcyl("c-bore", HATCH_R, -A - 0.13, -A + 0.2, HATCH_Y, 0.0, M["JAMB"])
    targets = [o for o in bpy.data.objects
               if o.name.startswith("w-4-") or o.name == "hatch-plate"]
    for t in targets:
        boolean_diff(t, [bore])
    bpy.data.objects.remove(bore, do_unlink=True)
    xcyl("hatch-leaf", HATCH_R + 0.025, -A - 0.11, -A - 0.06, HATCH_Y, 0.0, M["LEAF"])
    for d in range(DOGS):
        phi = d / DOGS * 2 * math.pi + math.pi / DOGS
        z = math.sin(phi) * (HATCH_R + 0.16)
        y = HATCH_Y + math.cos(phi) * (HATCH_R + 0.16)
        gbox(f"dog-{d}", (-A + 0.08, -A + 0.13), (y - 0.05, y + 0.05),
             (z - 0.07, z + 0.07), M["TRIM"])

    # --- Deck and lid: octagonal prisms lapped under every wall backing, the
    # deck tiled in eight pie slices with real gaps down to the sub-slab.
    gprism("deck-slab", octagon(A + 0.25), (-THICK, FLOOR_Y - 0.014), M["TRIM"])
    oct_pts = octagon(A + 0.25)
    for k in range(FACETS):
        p0 = oct_pts[k]
        p1 = oct_pts[(k + 1) % FACETS]
        cx = (p0[0] + p1[0]) / 3
        cz = (p0[1] + p1[1]) / 3
        tri = [(0.0, 0.0), p0, p1]
        shrunk = [(x + (cx - x) * 0.012, z + (cz - z) * 0.012) for x, z in tri]
        gprism(f"deck-{k}", shrunk, (FLOOR_Y - 0.014, FLOOR_Y), M["DECK"])
    gprism("ceiling", octagon(A + 0.25), (CEILING_Y, CEILING_Y + THICK), M["CROWN"])

    fit_out(M)


def inside_drum(x, z, margin):
    for k in range(FACETS):
        nx, nz = normal_of(k)
        if x * nx + z * nz > A - margin:
            return False
    return True


def fit_out(M):
    # --- The tie-down grid: sixty-three sockets flush in the deck, and worn
    # haloes round the eleven that get used. The room's whole floor.
    reach = int((A - 0.35) / SOCKET_PITCH)
    for i in range(-reach, reach + 1):
        for j in range(-reach, reach + 1):
            x, z = i * SOCKET_PITCH, j * SOCKET_PITCH
            if not inside_drum(x, z, 0.34):
                continue
            if (i, j) in WORN:
                h = SOCKET_HALF * 2.4
                gbox(f"halo-{i}-{j}", (x - h, x + h), (FLOOR_Y + 0.001, FLOOR_Y + 0.008),
                     (z - h, z + h), M["WEAR"])
            gbox(f"socket-{i}-{j}", (x - SOCKET_HALF, x + SOCKET_HALF),
                 (FLOOR_Y + 0.006, FLOOR_Y + 0.026),
                 (z - SOCKET_HALF, z + SOCKET_HALF), M["TRIM"])

    # --- The stanchions on facets 3 and 5, the cleats, and the one strap
    # left rigged - the loudest object in a cleared room.
    for n, k in ((0, 3), (1, 5)):
        fx, fz = on_facet(k, 0, A - 0.34)
        gbox(f"stanchion-{n}", (fx - 0.055, fx + 0.055), (FLOOR_Y, 1.06),
             (fz - 0.055, fz + 0.055), M["TRIM"])
        gbox(f"cleat-{n}", (fx - 0.11, fx + 0.11), (0.86, 0.94),
             (fz - 0.11, fz + 0.11), M["FOIL"])
        if n == 0:
            gbox("strap", (fx - 0.03, fx + 0.03), (0.31, 0.9),
                 (fz - 0.075, fz + 0.075), M["SOFTM"])

    # --- The cargo net, rolled and strapped to facet 6.
    nx, nz = on_facet(6, 0, A - 0.22)
    gbox("net-roll", (nx - 0.62, nx + 0.62), (0.42, 0.72), (nz - 0.16, nz + 0.16), M["SOFTM"])
    gbox("net-cradle", (nx - 0.68, nx + 0.68), (0.32, 0.42), (nz - 0.2, nz + 0.2), M["TRIM"])

    # --- The manifest board on facet 2 (+z, square to the world), butted back
    # against the recessed work face; the runtime draws the rows.
    # (Deck One moved it from facet 2, which is a doorway now, to facet 1 -
    # the diagonal between the door and the west hatch.)
    board_plan = [
        on_facet(1, -0.46, A - 0.2), on_facet(1, 0.46, A - 0.2),
        on_facet(1, 0.46, A + 0.081), on_facet(1, -0.46, A + 0.081),
    ]
    gprism("board", board_plan, (1.12, 1.72), M["FOIL"])
    glow_plan = [
        on_facet(1, -0.4, A - 0.2015), on_facet(1, 0.4, A - 0.2015),
        on_facet(1, 0.4, A - 0.2), on_facet(1, -0.4, A - 0.2),
    ]
    gprism("glow-board", glow_plan, (1.18, 1.66), M["SCREENGLOW"])

    # --- The cornice ring: four housings tucked into the wall-lid angle on
    # the four square facets, each with its diffuser strip underneath.
    ring = [
        ("fore", (A - 0.26, A - 0.10), (-0.9, 0.9), 0),
        ("aft", (-A + 0.10, -A + 0.26), (-0.9, 0.9), 4),
        ("port", (-0.9, 0.9), (A - 0.26, A - 0.10), 2),
        ("stbd", (-0.9, 0.9), (-A + 0.26, -A + 0.10), 6),
    ]
    for tag, xr, zr, _k in ring:
        gbox(f"cornice-{tag}", xr, (CEILING_Y - 0.14, CEILING_Y), zr, M["TRIM"])
        x0, x1 = xr
        z0, z1 = zr
        gbox(f"lamp-{tag}", (x0 + 0.02, x1 - 0.02), (CEILING_Y - 0.155, CEILING_Y - 0.14),
             (z0 + 0.02, z1 - 0.02), M["DIFF"])


def inside_vessel(p):
    """p is a BLENDER point. Eight half-planes, a deck and a lid."""
    gx, gy, gz = p.x, p.z, -p.y
    if not FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01:
        return False
    return inside_drum(gx, gz, 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("BERTH", "berth", inside_vessel, ATLAS, BAKE_SAMPLES, "build_berth")


if __name__ == "__main__":
    main()
