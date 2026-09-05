"""
Build THE CROSSING in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_crossing.py

Writes public/blender/crossing.glb and crossing-lightmap.png.

The room, per src/env/crossing: the hub - 5.40 by 4.20 m with no two edges
alike. The ceiling climbs 2.60 to 4.40 in nine flat facets away from the door
you arrive by; a 45-degree pressure trunk crosses the far port corner and
every asymmetry in the room is that trunk's fault; four ports of four kinds -
centred, offset, raised-and-wide onto the platform, recessed. The offer board
hangs by the way in; its queue is drawn by the runtime.

Two fittings at two heights light the two ends of the slope, and in Cycles
the climbing ceiling is a genuine value gradient - the nine facets take nine
values off the same two lamps because they genuinely stand at nine angles
and nine distances.

Every number is copied from src/env/crossing/index.ts.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    BOX_FACES, bevel_everything, boolean_diff, fresh_scene, g2b, gbox, gprism,
    newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF_X, HALF_Z = 2.7, 2.1
FLOOR_Y = 0.0
CEIL_LOW, CEIL_HIGH = 2.6, 4.4
CEIL_FACETS = 9
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06
GAL_W, GAL_H = 2.10, 2.30
THICK = 0.12
WALL_Z = HALF_Z - 0.086

CHAMFER = 0.9
CHAMFER_D = -HALF_X - HALF_Z + CHAMFER   # inside is x + z >= CHAMFER_D

PLATFORM_Y, TREAD_Y = 0.45, 0.225
RISE_X1, TREAD_Z0, PLATFORM_Z0 = -0.2, 0.25, 0.55

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
    "SCREENBG": (0.02400, 0.03600, 0.05400),
}

ATLAS = 2048
BAKE_SAMPLES = 1024


def ceiling_at(x):
    t = (HALF_X - x) / (2 * HALF_X)
    return CEIL_LOW + (CEIL_HIGH - CEIL_LOW) * min(max(t, 0.0), 1.0)


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
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=9.0),
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
        "SPILLW": newmat("SPILLW", C["CREAM"], 0.50, emit=C["CREAM"], strength=2.5),
    }


def gslab(name, quad, rise, mat):
    """A slab extruded straight up from a (possibly slanted) GAME-space quad:
    what a sloping ceiling facet is."""
    verts = list(quad) + [(x, y + rise, z) for x, y, z in quad]
    me = bpy.data.meshes.new(name)
    me.from_pydata([g2b(v) for v in verts], [], list(BOX_FACES))
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return ob


def wall(M, side, axis, plane, inward, work_mat):
    """Banded backing; the crown band rises to the room's high ceiling and is
    buried by the sloping lid wherever the lid is lower."""
    bands = [
        ("kick", FLOOR_Y, KICK_TOP, 0.06, "KICK"),
        ("work", KICK_TOP, WORK_TOP, -0.08, None),
        ("crown", WORK_TOP, CEIL_HIGH + 0.1, 0.14, "CROWN"),
    ]
    for bname, y0, y1, relief, mat in bands:
        face = plane + inward * relief
        outer = plane - inward * THICK
        lo, hi = min(face, outer), max(face, outer)
        key = mat or work_mat
        if axis == "x":
            gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1), (-HALF_Z - THICK, HALF_Z + THICK), M[key])
        else:
            gbox(f"w-{side}-{bname}", (-HALF_X - THICK, HALF_X + THICK), (y0, y1), (lo, hi), M[key])


def build_room(M):
    wall(M, "fore", "x", HALF_X, -1, "END")
    wall(M, "aft", "x", -HALF_X, +1, "END")
    wall(M, "stbd", "z", WALL_Z, -1, "LINER")
    wall(M, "port", "z", -WALL_Z, +1, "LINER")

    # Liner panels on the starboard work band (the board wall), clear of the
    # high door; the port wall keeps its run clear of the low door.
    for side, tag, doors in ((+1, "s", [(-2.55, -0.25)]), (-1, "p", [(0.25, 1.55)])):
        face = side * (WALL_Z + 0.08)
        p0, p1 = sorted((face, face - side * 0.012))
        n = 5
        step = 2 * HALF_X / n
        for i in range(n):
            a = -HALF_X + step * i + 0.007
            b = -HALF_X + step * (i + 1) - 0.007
            if any(d[0] < b and a < d[1] for d in doors):
                continue
            for ry0, ry1 in ((KICK_TOP + 0.03, 1.50), (1.53, WORK_TOP - 0.03)):
                gprism(f"p-{tag}-{i}-{ry0:.2f}",
                       [(a, p0), (b, p0), (b, p1), (a, p1)], (ry0, ry1), M["LINER"])

    # --- The four doorways: two in the end walls, two in the long walls.
    fore = [o for o in bpy.data.objects if o.name.startswith("w-fore-")]
    aft = [o for o in bpy.data.objects if o.name.startswith("w-aft-")]
    stbd = [o for o in bpy.data.objects if o.name.startswith("w-stbd-")]
    port_w = [o for o in bpy.data.objects if o.name.startswith("w-port-")]
    cuts = [
        (fore, gbox("c-fore", (HALF_X - 0.5, HALF_X + 0.5), (FLOOR_Y, SEAM_H),
                    (-SEAM_W / 2, SEAM_W / 2), M["JAMB"])),
        (aft, gbox("c-aft", (-HALF_X - 0.5, -HALF_X + 0.5), (FLOOR_Y, SEAM_H),
                   (-0.45 - SEAM_W / 2, -0.45 + SEAM_W / 2), M["JAMB"])),
        (stbd, gbox("c-high", (-1.4 - GAL_W / 2, -1.4 + GAL_W / 2),
                    (PLATFORM_Y, PLATFORM_Y + GAL_H), (WALL_Z - 0.6, WALL_Z + 0.6), M["JAMB"])),
        (port_w, gbox("c-low", (0.9 - SEAM_W / 2, 0.9 + SEAM_W / 2), (FLOOR_Y, SEAM_H),
                      (-WALL_Z - 0.6, -WALL_Z + 0.6), M["JAMB"])),
    ]
    for targets, cutter in cuts:
        for t in targets:
            boolean_diff(t, [cutter])
        bpy.data.objects.remove(cutter, do_unlink=True)

    gbox("cap-fore", (HALF_X + 0.04, HALF_X + 0.12), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (HALF_X + 0.015, HALF_X + 0.020), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])
    gbox("cap-aft", (-HALF_X - 0.12, -HALF_X - 0.04), (FLOOR_Y, SEAM_H),
         (-0.45 - SEAM_W / 2 - 0.03, -0.45 + SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-HALF_X - 0.020, -HALF_X - 0.015), (FLOOR_Y, SEAM_H),
         (-0.45 - SEAM_W / 2, -0.45 + SEAM_W / 2), M["SPILL"])
    gbox("cap-high", (-1.4 - GAL_W / 2 - 0.03, -1.4 + GAL_W / 2 + 0.03),
         (PLATFORM_Y, PLATFORM_Y + GAL_H), (HALF_Z + 0.04, HALF_Z + 0.12), M["END"])
    gbox("sky-high", (-1.4 - GAL_W / 2, -1.4 + GAL_W / 2),
         (PLATFORM_Y, PLATFORM_Y + GAL_H), (HALF_Z + 0.015, HALF_Z + 0.020), M["SPILLW"])
    gbox("cap-low", (0.9 - SEAM_W / 2 - 0.03, 0.9 + SEAM_W / 2 + 0.03),
         (FLOOR_Y, SEAM_H), (-HALF_Z - 0.12, -HALF_Z - 0.04), M["END"])
    gbox("sky-low", (0.9 - SEAM_W / 2, 0.9 + SEAM_W / 2),
         (FLOOR_Y, SEAM_H), (-HALF_Z - 0.020, -HALF_Z - 0.015), M["SPILL"])

    # --- Deck, tiled; the trunk stands on it and hides the corner tiles.
    gbox("deck-slab", (-HALF_X - THICK, HALF_X + THICK), (-THICK, FLOOR_Y - 0.014),
         (-HALF_Z - THICK, HALF_Z + THICK), M["TRIM"])
    for i in range(5):
        for j in range(4):
            a = -HALF_X + (2 * HALF_X / 5) * i + 0.004
            b = -HALF_X + (2 * HALF_X / 5) * (i + 1) - 0.004
            c = -HALF_Z + (2 * HALF_Z / 4) * j + 0.004
            d = -HALF_Z + (2 * HALF_Z / 4) * (j + 1) - 0.004
            gbox(f"deck-{i}-{j}", (a, b), (FLOOR_Y - 0.014, FLOOR_Y), (c, d), M["DECK"])

    # --- The crown: nine slanted slabs climbing away from the door.
    for i in range(CEIL_FACETS):
        x0 = -HALF_X + (2 * HALF_X * i) / CEIL_FACETS
        x1 = -HALF_X + (2 * HALF_X * (i + 1)) / CEIL_FACETS
        y0, y1 = ceiling_at(x0), ceiling_at(x1)
        gslab(f"lid-{i}",
              [(x0, y0, -HALF_Z - THICK), (x1, y1, -HALF_Z - THICK),
               (x1, y1, HALF_Z + THICK), (x0, y0, HALF_Z + THICK)], 0.14, M["CROWN"])

    # --- The trunk: the one diagonal in the station, deck to crown, thick.
    gprism("trunk",
           [(-HALF_X - 0.05, CHAMFER_D + HALF_X + 0.05),
            (CHAMFER_D + HALF_Z + 0.05, -HALF_Z - 0.05),
            (CHAMFER_D + HALF_Z - 0.45, -HALF_Z - 0.55),
            (-HALF_X - 0.55, CHAMFER_D + HALF_X - 0.45)],
           (FLOOR_Y - 0.05, CEIL_HIGH + 0.12), M["END"])
    # Its two brackets: axis-aligned steel where the diagonal meets the
    # orthogonal station.
    for n, t in ((0, 0.28), (1, 0.62)):
        x = -HALF_X + CHAMFER * t + 0.12
        z = CHAMFER_D - x + 0.20
        gbox(f"bracket-{n}", (x - 0.08, x + 0.08), (0.62 + n * 1.15, 0.78 + n * 1.15),
             (z - 0.08, z + 0.08), M["TRIM"])

    fit_out(M)


def fit_out(M):
    # --- The platform and its tread, with nosings.
    gbox("platform", (-HALF_X + 0.02, RISE_X1), (FLOOR_Y, PLATFORM_Y),
         (PLATFORM_Z0, HALF_Z - 0.02), M["END"])
    gbox("tread", (-HALF_X + 0.02, RISE_X1), (FLOOR_Y, TREAD_Y),
         (TREAD_Z0, PLATFORM_Z0), M["END"])
    gbox("nose-low", (-HALF_X + 0.08, RISE_X1 - 0.06), (TREAD_Y, TREAD_Y + 0.02),
         (TREAD_Z0, TREAD_Z0 + 0.08), M["FOIL"])
    gbox("nose-high", (-HALF_X + 0.08, RISE_X1 - 0.06), (PLATFORM_Y, PLATFORM_Y + 0.02),
         (PLATFORM_Z0, PLATFORM_Z0 + 0.08), M["FOIL"])

    # --- The offer board by the way in; the runtime draws the queue.
    gbox("board", (1.32, 2.5), (0.95, 1.85), (2.0, 2.06), M["FOIL"])
    gbox("glow-board", (1.36, 2.46), (1.0, 1.8), (1.9985, 2.0), M["SCREENGLOW"])
    gbox("board-lip", (1.32, 2.5), (0.95, 0.99), (1.94, 2.0), M["TRIM"])

    # --- The perch, its leg, and the strap left hanging off it.
    gbox("perch", (1.28, 1.9), (0.5, 0.58), (-2.06, -1.54), M["SOFTM"])
    gbox("perch-leg", (1.32, 1.4), (FLOOR_Y, 0.5), (-1.7, -1.62), M["TRIM"])
    gbox("strap", (1.42, 1.5), (0.16, 0.5), (-1.86, -1.82), M["SOFTM"])

    # --- Two fittings at the two ceiling heights, so the slope is lit rather
    # than merely present.
    gbox("lh-near", (0.64, 2.16), (CEIL_LOW - 0.08, CEIL_LOW), (-0.4, 0.4), M["TRIM"])
    gbox("lamp-near", (0.7, 2.1), (CEIL_LOW - 0.16, CEIL_LOW - 0.08), (-0.34, 0.34), M["DIFF"])
    far_y = ceiling_at(-0.8)
    gbox("lh-far", (-2.26, -0.74), (far_y - 0.1, far_y), (-0.4, 0.4), M["TRIM"])
    gbox("lamp-far", (-2.2, -0.8), (far_y - 0.18, far_y - 0.1), (-0.34, 0.34), M["DIFF"])


def inside_vessel(p):
    """p is a BLENDER point. A box with a sloping lid and one corner cut off,
    exactly the room's contains()."""
    gx, gy, gz = p.x, p.z, -p.y
    if not FLOOR_Y + 0.01 < gy < ceiling_at(gx) - 0.01:
        return False
    if abs(gx) > HALF_X - 0.01 or abs(gz) > HALF_Z - 0.01:
        return False
    return gx + gz >= CHAMFER_D + 0.01


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    M["SOFTM"] = newmat("SOFT", (0.06050, 0.10220, 0.14830), 0.92)
    build_room(M)
    bevel_everything()
    produce("CROSSING", "crossing", inside_vessel, ATLAS, BAKE_SAMPLES, "build_crossing")


if __name__ == "__main__":
    main()
