"""
Build THE CROWN in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_crown.py

Writes public/blender/crown.glb and crown-lightmap.png.

The room, per src/env/crown: the 9.6 m shaft - 6.60 by 5.00 m on the upper
deck, three unreachable galleries at 3.20, 5.60 and 8.00, the plot table in
the middle, and the canted six-pane aperture at the top.

THE PANES ARE THE SOURCE NOW. The legacy room fakes its skylight with a
directional lamp and paints the upper wall light; here the six panes and the
cap are emissive glass and the shaft is lit by them alone. The inversion the
room exists for - the lightest wall in the station at the top, crossed by
three dark bands - comes out of the falloff and the galleries' own shadows,
and the height is countable because the light genuinely dims by the metre.

The regime rings on the table are NOT in this model: they derive from
src/sim's live regime definitions, so the runtime draws them - geometry that
tracks data belongs where the data is.

Every number is copied from src/env/crown/index.ts.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, g2b, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF_X, HALF_Z = 3.3, 2.5
FLOOR_Y = 0.45
HEIGHT = 9.6
CEILING_Y = FLOOR_Y + HEIGHT             # 10.05: underside of the aperture
KICK_TOP, WORK_TOP = FLOOR_Y + 0.95, FLOOR_Y + 2.05
SEAM_W, SEAM_H = 1.18, 2.06
GAL_W, GAL_H = 2.10, 2.30
THICK = 0.12
WALL_X = HALF_X - 0.086                  # ported walls, inboard of the seam

GALLERY_YS = (3.2, 5.6, 8.0)             # above this room's own deck
GALLERY_W, GALLERY_T = 0.85, 0.12

PANES = 6
AP_HX, AP_HZ = 1.5, 1.1
AP_RISE = 0.55
CAP_Y = CEILING_Y + AP_RISE

TABLE_TOP = FLOOR_Y + 0.92
FOOT_TOP = FLOOR_Y + 0.06

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
    "UPPER": (0.66000, 0.57000, 0.42000),  # the lightest wall in the station
    "PANE": (0.72310, 0.69380, 0.62620),
}

ATLAS = 2048
BAKE_SAMPLES = 1024


def materials():
    C = COLOURS
    return {
        "LINER": newmat("LINER", C["LINER"], 0.78, bump=0.14, bump_scale=18, bump_detail=2),
        "END": newmat("END", C["END"], 0.80, bump=0.14, bump_scale=18, bump_detail=2),
        "KICK": newmat("KICK", C["KICK"], 0.64, bump=0.10, bump_scale=26, bump_detail=2),
        "CROWN": newmat("CROWN", C["CROWN"], 0.88, bump=0.10, bump_scale=14, bump_detail=2),
        "DECK": newmat("DECK", C["DECK"], 0.54, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        # The two alternating courses of the upper wall.
        "UPPER": newmat("UPPER", C["UPPER"], 0.75, bump=0.12, bump_scale=16, bump_detail=2),
        "UPPER2": newmat("UPPER2", tuple(c * 0.84 for c in C["UPPER"]), 0.75,
                         bump=0.12, bump_scale=16, bump_detail=2),
        # The aperture: emissive glass, the room's key.
        "PANEGLOW": newmat("PANEGLOW", C["PANE"], 0.30, emit=C["CREAM"], strength=7.0),
        # Cove strips under each gallery's outer edge. The first bake told the
        # truth the legacy room's shadowless lights never had to: an 0.85 m
        # gallery ring SHADOWS the wall below it, so a top light alone gives
        # dark courses and bounce-lit gallery undersides - the inversion
        # inverted. The design's bright-wall-dark-band reading has to be
        # earned the way the station earns everything: each gallery carries
        # its own strip and lights the course beneath it.
        "GALCOVE": newmat("GALCOVE", C["CREAM"], 0.40, emit=C["CREAM"], strength=15.0),
        # The hub next door is bright; the magazine is nearly dark.
        "SPILLW": newmat("SPILLW", C["CREAM"], 0.50, emit=C["CREAM"], strength=2.5),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=1.0),
    }


def gquad(name, pts, mat):
    """A single quad from four GAME points, normals fixed toward the room by
    from_pydata order (callers wind them outward-facing)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([g2b(p) for p in pts], [], [(0, 1, 2, 3)])
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


def wall(M, side, axis, plane, inward, doors):
    """Banded to the work top, then the light courses divided at the gallery
    heights - the inversion the room exists for."""
    bands = [
        ("kick", FLOOR_Y, KICK_TOP, 0.06, "KICK"),
        ("work", KICK_TOP, WORK_TOP, -0.08, "LINER"),
    ]
    stops = [WORK_TOP] + [FLOOR_Y + g for g in GALLERY_YS] + [CEILING_Y]
    for i in range(len(stops) - 1):
        mat = "UPPER" if i % 2 == 0 else "UPPER2"
        bands.append((f"course{i}", stops[i], stops[i + 1], 0.0, mat))
    for bname, y0, y1, relief, mat in bands:
        face = plane + inward * relief
        outer = plane - inward * THICK
        lo, hi = min(face, outer), max(face, outer)
        if axis == "x":
            gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1), (-HALF_Z - THICK, HALF_Z + THICK), M[mat])
        else:
            gbox(f"w-{side}-{bname}", (-HALF_X - THICK, HALF_X + THICK), (y0, y1), (lo, hi), M[mat])


def build_room(M):
    # --- Four walls. Both ports are in the x walls, held inboard of their
    # seam planes; the z walls are blind.
    wall(M, "fore", "x", WALL_X, -1, [])
    wall(M, "aft", "x", -WALL_X, +1, [])
    wall(M, "stbd", "z", HALF_Z, -1, [])
    wall(M, "port", "z", -HALF_Z, +1, [])

    fore = [o for o in bpy.data.objects if o.name.startswith("w-fore-")]
    aft = [o for o in bpy.data.objects if o.name.startswith("w-aft-")]
    c1 = gbox("c-fore", (WALL_X - 0.5, WALL_X + 0.6), (FLOOR_Y, FLOOR_Y + GAL_H),
              (-GAL_W / 2, GAL_W / 2), M["JAMB"])
    c2 = gbox("c-aft", (-WALL_X - 0.6, -WALL_X + 0.5), (FLOOR_Y, FLOOR_Y + SEAM_H),
              (-SEAM_W / 2, SEAM_W / 2), M["JAMB"])
    for w in fore:
        boolean_diff(w, [c1])
    for w in aft:
        boolean_diff(w, [c2])
    bpy.data.objects.remove(c1, do_unlink=True)
    bpy.data.objects.remove(c2, do_unlink=True)

    gbox("cap-fore", (WALL_X + 0.10, WALL_X + 0.18), (FLOOR_Y, FLOOR_Y + GAL_H),
         (-GAL_W / 2 - 0.03, GAL_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (WALL_X + 0.085, WALL_X + 0.090), (FLOOR_Y, FLOOR_Y + GAL_H),
         (-GAL_W / 2, GAL_W / 2), M["SPILLW"])
    gbox("cap-aft", (-WALL_X - 0.18, -WALL_X - 0.10), (FLOOR_Y, FLOOR_Y + SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-WALL_X - 0.090, -WALL_X - 0.085), (FLOOR_Y, FLOOR_Y + SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # --- The deck at 0.45, tiled.
    gbox("deck-slab", (-HALF_X - THICK, HALF_X + THICK), (FLOOR_Y - THICK, FLOOR_Y - 0.014),
         (-HALF_Z - THICK, HALF_Z + THICK), M["TRIM"])
    for i in range(6):
        for j in range(5):
            a = -HALF_X + (2 * HALF_X / 6) * i + 0.004
            b = -HALF_X + (2 * HALF_X / 6) * (i + 1) - 0.004
            c = -HALF_Z + (2 * HALF_Z / 5) * j + 0.004
            d = -HALF_Z + (2 * HALF_Z / 5) * (j + 1) - 0.004
            gbox(f"deck-{i}-{j}", (a, b), (FLOOR_Y - 0.014, FLOOR_Y), (c, d), M["DECK"])

    # --- The ceiling round the aperture, dark, so the panes read as the
    # source - which here they are. Four slabs and the hexagon-to-rectangle
    # annulus, all at CEILING_Y.
    for tag, x0, x1, z0, z1 in (
        ("fore", AP_HX, HALF_X + THICK, -HALF_Z - THICK, HALF_Z + THICK),
        ("aft", -HALF_X - THICK, -AP_HX, -HALF_Z - THICK, HALF_Z + THICK),
        ("stbd", -AP_HX, AP_HX, AP_HZ, HALF_Z + THICK),
        ("port", -AP_HX, AP_HX, -HALF_Z - THICK, -AP_HZ),
    ):
        gbox(f"ceiling-{tag}", (x0, x1), (CEILING_Y, CEILING_Y + THICK), (z0, z1), M["CROWN"])
    # The annulus between the pane hexagon and its bounding rectangle, walked
    # edge by edge so the two outlines tile exactly.
    for i in range(PANES):
        a0 = i * 2 * math.pi / PANES
        a1 = (i + 1) * 2 * math.pi / PANES
        p0 = (AP_HX * math.cos(a0), AP_HZ * math.sin(a0))
        p1 = (AP_HX * math.cos(a1), AP_HZ * math.sin(a1))

        def onbox(p):
            k = max(abs(p[0]) / AP_HX, abs(p[1]) / AP_HZ)
            return (p[0] / k, p[1] / k)

        q0, q1 = onbox(p0), onbox(p1)
        gquad(f"annulus-{i}",
              [(p0[0], CEILING_Y, p0[1]), (p1[0], CEILING_Y, p1[1]),
               (q1[0], CEILING_Y, q1[1]), (q0[0], CEILING_Y, q0[1])], M["CROWN"])
        # A thin backing slab above each annulus quad seals it.
    # The slab is a RING, not a lid. The first build ran it solid across the
    # whole aperture rectangle, which blocked the pane cone from below - the
    # room's key read as a dark soffit with a glowing hexagonal outline - and
    # left a 2 cm slot between the quads and the slab that a shallow
    # sightline up the shaft could slip through into space (found by the
    # station seam scan, 2026-09-05). The elliptical hole is cut at 0.87 of
    # the aperture - inside the cone's radius at the slab's TOP, not just
    # its bottom - so the slab's inner edge lands ON the canted panes, which
    # pass through it: the slot dead-ends on emissive glass, and the cone
    # rises clear.
    back = gbox("annulus-back", (-AP_HX, AP_HX), (CEILING_Y + 0.02, CEILING_Y + THICK),
                (-AP_HZ, AP_HZ), M["CROWN"])
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64, radius=1.0, depth=0.4, location=g2b((0.0, CEILING_Y + 0.06, 0.0)))
    hole = bpy.context.active_object
    hole.name = "c-aperture"
    hole.scale = (AP_HX * 0.87, AP_HZ * 0.87, 1.0)
    hole.data.materials.append(M["CROWN"])
    boolean_diff(back, [hole])
    bpy.data.objects.remove(hole, do_unlink=True)

    # --- The aperture: six canted emissive panes rising to an emissive cap.
    cap_pts = []
    for i in range(PANES):
        a0 = i * 2 * math.pi / PANES
        a1 = (i + 1) * 2 * math.pi / PANES
        p0 = (AP_HX * math.cos(a0), AP_HZ * math.sin(a0))
        p1 = (AP_HX * math.cos(a1), AP_HZ * math.sin(a1))
        gquad(f"pane-{i}",
              [(p0[0], CEILING_Y, p0[1]), (p1[0], CEILING_Y, p1[1]),
               (p1[0] * 0.32, CAP_Y, p1[1] * 0.32), (p0[0] * 0.32, CAP_Y, p0[1] * 0.32)],
              M["PANEGLOW"])
        cap_pts.append((p0[0] * 0.32, CAP_Y, p0[1] * 0.32))
    me = bpy.data.meshes.new("pane-cap")
    # Wound so the face looks DOWN the shaft: the cap was invisible from the
    # deck (backface-culled, a hexagon of space at the top of the room) until
    # the annulus ring fix made the cone visible enough to notice.
    me.from_pydata([g2b(p) for p in cap_pts], [], [tuple(range(PANES))])
    me.validate()
    ob = bpy.data.objects.new("pane-cap", me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(M["PANEGLOW"])

    fit_out(M)


def fit_out(M):
    # --- The three galleries: four walks abutting at the corners, a floating
    # rail on the inner edge of each. Dark crossings on the light wall - the
    # things the eye counts the height in, and in Cycles the shadows they
    # throw are real.
    inset = 0.06
    for n, above in enumerate(GALLERY_YS):
        y0 = FLOOR_Y + above
        y1 = y0 + GALLERY_T
        xa, xb = -HALF_X + inset, HALF_X - inset
        za, zb = -HALF_Z + inset, HALF_Z - inset
        gbox(f"gal-{n}-p", (xa, xb), (y0, y1), (za, za + GALLERY_W), M["CROWN"])
        gbox(f"gal-{n}-s", (xa, xb), (y0, y1), (zb - GALLERY_W, zb), M["CROWN"])
        gbox(f"gal-{n}-a", (xa, xa + GALLERY_W), (y0, y1), (za + GALLERY_W, zb - GALLERY_W), M["CROWN"])
        gbox(f"gal-{n}-f", (xb - GALLERY_W, xb), (y0, y1), (za + GALLERY_W, zb - GALLERY_W), M["CROWN"])
        # The cove strips, tucked under each walk's outer edge against the
        # wall, washing the course below. See GALCOVE in materials().
        cs = 0.05
        gbox(f"cove-{n}-p", (xa + 0.02, xb - 0.02), (y0 - 0.012, y0), (za + 0.01, za + 0.01 + cs),
             M["GALCOVE"])
        gbox(f"cove-{n}-s", (xa + 0.02, xb - 0.02), (y0 - 0.012, y0), (zb - 0.01 - cs, zb - 0.01),
             M["GALCOVE"])
        gbox(f"cove-{n}-a", (xa + 0.01, xa + 0.01 + cs), (y0 - 0.012, y0), (za + 0.06, zb - 0.06),
             M["GALCOVE"])
        gbox(f"cove-{n}-f", (xb - 0.01 - cs, xb - 0.01), (y0 - 0.012, y0), (za + 0.06, zb - 0.06),
             M["GALCOVE"])
        ri = 0.07
        rx0, rx1 = xa + GALLERY_W, xb - GALLERY_W
        rz0, rz1 = za + GALLERY_W, zb - GALLERY_W
        rail = y1 + 0.42
        gbox(f"rail-{n}-p", (rx0, rx1), (rail, rail + 0.05), (rz0 - ri, rz0), M["TRIM"])
        gbox(f"rail-{n}-s", (rx0, rx1), (rail, rail + 0.05), (rz1, rz1 + ri), M["TRIM"])
        gbox(f"rail-{n}-a", (rx0 - ri, rx0), (rail, rail + 0.05), (rz0, rz1), M["TRIM"])
        gbox(f"rail-{n}-f", (rx1, rx1 + ri), (rail, rail + 0.05), (rz0, rz1), M["TRIM"])

    # --- The plot table. The regime rings are runtime geometry; the survey
    # plate stays, one thing out of its stowed position.
    gbox("table-foot", (-1.12, 1.12), (FLOOR_Y, FOOT_TOP), (-0.87, 0.87), M["TRIM"])
    gbox("table", (-1.05, 1.05), (FOOT_TOP, TABLE_TOP), (-0.8, 0.8), M["FOIL"])
    gbox("plate", (0.24, 0.78), (TABLE_TOP + 0.012, TABLE_TOP + 0.026), (-0.32, 0.1), M["TRIM"])

    # --- The perch, left of the wide door as you come in.
    gbox("perch", (1.5, 2.12), (FLOOR_Y + 0.5, FLOOR_Y + 0.58), (-2.44, -1.92), M["SOFTM"])
    gbox("perch-leg", (1.54, 1.62), (FLOOR_Y, FLOOR_Y + 0.5), (-2.08, -2.0), M["TRIM"])


def inside_vessel(p):
    """p is a BLENDER point. The shaft, up to the aperture cap."""
    gx, gy, gz = p.x, p.z, -p.y
    return (abs(gx) < HALF_X - 0.01 and abs(gz) < HALF_Z - 0.01
            and FLOOR_Y + 0.01 < gy < CAP_Y - 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    M["SOFTM"] = newmat("SOFT", (0.06050, 0.10220, 0.14830), 0.92)
    build_room(M)
    bevel_everything()
    produce("CROWN", "crown", inside_vessel, ATLAS, BAKE_SAMPLES, "build_crown")


if __name__ == "__main__":
    main()
