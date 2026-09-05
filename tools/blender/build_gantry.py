"""
Build THE GANTRY in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_gantry.py

Writes public/blender/gantry.glb and gantry-lightmap.png.

The room, per src/env/gantry: the propellant column standing up - twenty-four
tanks on a two-metre grid, 11.0 by 7.6 m of deck under a 2.15 m lid, with the
entry bay coffered to 2.50 so the 2.30 m gallery seam fits under the room it
opens into. One tank is off its saddle, standing in the cross-aisle beside
its own empty cradle, 0.14 m shorter than the twenty-three around it.

IT IS LIT FROM BELOW AND FROM NOWHERE ELSE, and that rule survives the
rebuild intact: twelve fittings at knee height in the two aisles, their heads
overhanging their pans so the underside rim pools straight onto the deck, and
not one emitter above 0.40 m. In Cycles the inversion stops being an authored
trick and becomes physics - the tanks come out bright-footed, the deck is the
lightest large surface, the lid is the darkest - and if the lid ever reads as
missing the answer is written in the legacy room and still binding: more
uplight, never a lamp.

Every number is copied from src/env/gantry/index.ts.
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

HALF_X, HALF_Z = 5.5, 3.8
FLOOR_Y, CEILING_Y = 0.0, 2.15
COFFER_Y, COFFER_X0, COFFER_HZ = 2.5, 4.4, 1.44
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06
GAL_W, GAL_H = 2.10, 2.30
THICK = 0.10

TANK_X = (-5, -3, -1, 1, 3, 5)
TANK_Z = (-3, -1, 1, 3)
TANK_FACETS = 10
TANK_PHASE = math.pi / 30            # misses every axis and every diagonal
TANK_R, TANK_H = 0.35, 1.55
SADDLE_H, CAP_R, CAP_H = 0.14, 0.2, 0.11
STRAY_FROM_X, STRAY_Z, STRAY_X = 3, 1, 2

LAMP_Y0, LAMP_Y1 = 0.22, 0.34        # the head; the pan is below it
LAMP_Z, LAMP_HALF = 2.0, 0.1
PIPE_Y0, PIPE_Y1, PIPE_HALF = 1.95, 2.1, 0.08
RUN_X = HALF_X - 0.006               # SEAM_INSET_M

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
    "SCREENBG": (0.02400, 0.03600, 0.05400),
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
        # The deck is the LIGHTEST large surface in this room - the one room in
        # the station where floor and wall swap values, because all the light
        # arrives at knee height and a dark floor would fight its own lighting.
        "DECKLIGHT": newmat("DECKLIGHT", C["END"], 0.60, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        # The tanks: the room's whole content, warm liner value, bright-footed
        # by the light rather than by paint.
        "TANK": newmat("TANK", C["LINER"], 0.55, metal=0.30,
                       bump=0.10, bump_scale=24, bump_detail=2),
        "CAP": newmat("CAP", C["NOSE"], 0.45, metal=0.35),
        # Twelve uplight heads: the room's only emitters, at knee height.
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=30.0),
        # The transfer board's light for the bake; the runtime draws the column.
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        # The wide door's spill is 4.8 square metres of plate - at the crawl's
        # strength 7 it flooded the entry bay and washed the nearest rank
        # white. The narrow aft door keeps the usual value.
        "SPILLW": newmat("SPILLW", C["CREAM"], 0.50, emit=C["CREAM"], strength=2.5),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
    }


def vtank(name, r, y0, y1, gx, gz, mat, segs=TANK_FACETS, phase=TANK_PHASE):
    """A vertical prism: Blender's cylinder axis is already the game's y."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segs, radius=r, depth=(y1 - y0),
        location=g2b((gx, (y0 + y1) / 2, gz)), rotation=(0, 0, phase),
    )
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    return ob


def wall(M, side, axis, plane, inward, work_mat, doors, top):
    """build_plot.py's banded wall: shared outer plane, sealed joints."""
    bands = [
        ("kick", FLOOR_Y, KICK_TOP, 0.06, "KICK"),
        ("work", KICK_TOP, WORK_TOP, -0.08, None),
        ("crown", WORK_TOP, top, 0.14, "CROWN"),
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
    # --- Walls. The long walls are plain banded liner - this room's identity
    # is in the volume, not on its walls - and the ports are in the short ends.
    # The fore wall's crown runs up into the coffer; the strip of it above the
    # 2.15 lid outside the coffer is culled and parked, never seen.
    wall(M, "fore", "x", HALF_X, -1, "END", [(-GAL_W / 2 - 0.06, GAL_W / 2 + 0.06)], COFFER_Y + 0.12)
    wall(M, "aft", "x", -HALF_X, +1, "END", [(-SEAM_W / 2 - 0.06, SEAM_W / 2 + 0.06)], CEILING_Y)
    wall(M, "stbd", "z", HALF_Z, -1, "LINER", [], CEILING_Y)
    wall(M, "port", "z", -HALF_Z, +1, "LINER", [], CEILING_Y)

    backing = [o for o in bpy.data.objects if o.name.startswith("w-")]
    reveal = M["JAMB"]
    cutters = [
        gbox("c-fore", (HALF_X - 0.5, HALF_X + 0.5), (FLOOR_Y, GAL_H),
             (-GAL_W / 2, GAL_W / 2), reveal),
        gbox("c-aft", (-HALF_X - 0.5, -HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), reveal),
    ]
    for w in backing:
        boolean_diff(w, cutters)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)

    gbox("cap-fore", (HALF_X + 0.04, HALF_X + 0.12), (FLOOR_Y, GAL_H),
         (-GAL_W / 2 - 0.03, GAL_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (HALF_X + 0.015, HALF_X + 0.020), (FLOOR_Y, GAL_H),
         (-GAL_W / 2, GAL_W / 2), M["SPILLW"])
    gbox("cap-aft", (-HALF_X - 0.12, -HALF_X - 0.04), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-HALF_X - 0.020, -HALF_X - 0.015), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # --- The deck: a slab, tiled on the two-metre grid's half-module with
    # real gaps, the lightest large surface in the room.
    gbox("deck-slab", (-HALF_X, HALF_X), (-THICK, FLOOR_Y - 0.014),
         (-HALF_Z - THICK, HALF_Z + THICK), M["TRIM"])
    nx, nz = 11, 8
    for i in range(nx):
        for j in range(nz):
            a = -HALF_X + (2 * HALF_X / nx) * i + 0.004
            b = -HALF_X + (2 * HALF_X / nx) * (i + 1) - 0.004
            c = -HALF_Z - THICK + ((2 * HALF_Z + 2 * THICK) / nz) * j + 0.004
            d = -HALF_Z - THICK + ((2 * HALF_Z + 2 * THICK) / nz) * (j + 1) - 0.004
            gbox(f"deck-{i}-{j}", (a, b), (FLOOR_Y - 0.014, FLOOR_Y), (c, d), M["DECKLIGHT"])

    # --- The lid at 2.15, in three slabs round the entry coffer, then the
    # coffer's own lid at 2.50 and the downstands that make the drop felt: the
    # header you walk under one pace past the threshold, and its two cheeks.
    gbox("lid-main", (-HALF_X, COFFER_X0 + 0.12), (CEILING_Y, CEILING_Y + THICK),
         (-HALF_Z - THICK, HALF_Z + THICK), M["CROWN"])
    gbox("lid-fore-p", (COFFER_X0, HALF_X), (CEILING_Y, CEILING_Y + THICK),
         (-HALF_Z - THICK, -COFFER_HZ), M["CROWN"])
    gbox("lid-fore-s", (COFFER_X0, HALF_X), (CEILING_Y, CEILING_Y + THICK),
         (COFFER_HZ, HALF_Z + THICK), M["CROWN"])
    gbox("lid-coffer", (COFFER_X0, HALF_X), (COFFER_Y, COFFER_Y + THICK),
         (-COFFER_HZ, COFFER_HZ), M["CROWN"])
    gbox("coffer-header", (COFFER_X0, COFFER_X0 + 0.12), (CEILING_Y - 0.02, COFFER_Y + 0.06),
         (-COFFER_HZ - 0.12, COFFER_HZ + 0.12), M["CROWN"])
    for side, tag in ((+1, "s"), (-1, "p")):
        z0, z1 = sorted((side * COFFER_HZ, side * (COFFER_HZ + 0.12)))
        gbox(f"coffer-cheek-{tag}", (COFFER_X0, HALF_X), (CEILING_Y - 0.02, COFFER_Y + 0.06),
             (z0, z1), M["CROWN"])

    fit_out(M)


def fit_out(M):
    # --- The farm: twenty-four tanks, one of them on the deck instead of its
    # saddle. Ten facets phased six degrees off the axes, so no two of the 240
    # planes in the room ever face one way in one plane.
    for x in TANK_X:
        for z in TANK_Z:
            stray = x == STRAY_FROM_X and z == STRAY_Z
            # The cradle rails are there either way - an empty cradle in a
            # grid of full ones is the room's one piece of disorder.
            for side, tag in ((-1, "a"), (+1, "b")):
                gbox(f"cradle-{x}-{z}-{tag}", (x - 0.26, x + 0.26), (FLOOR_Y, FLOOR_Y + SADDLE_H),
                     (z + side * 0.16, z + side * 0.28), M["TRIM"])
            if stray:
                continue
            base = FLOOR_Y + SADDLE_H
            vtank(f"tank-{x}-{z}", TANK_R, base, base + TANK_H, x, z, M["TANK"])
            vtank(f"strap-{x}-{z}-lo", TANK_R + 0.012, base + 0.55, base + 0.62, x, z, M["TRIM"])
            vtank(f"strap-{x}-{z}-hi", TANK_R + 0.012, base + 1.25, base + 1.32, x, z, M["TRIM"])
            vtank(f"cap-t-{x}-{z}", CAP_R, base + TANK_H, base + TANK_H + CAP_H, x, z, M["CAP"])
            gbox(f"drop-{x}-{z}", (x - 0.035, x + 0.035),
                 (base + TANK_H + CAP_H, PIPE_Y0 + 0.02), (z - 0.035, z + 0.035), M["TRIM"])
    # The stray, on the deck, 0.14 m shorter than everything around it. Its
    # drop hangs onto nothing over the empty cradle.
    vtank("tank-stray", TANK_R, FLOOR_Y, FLOOR_Y + TANK_H, STRAY_X, STRAY_Z, M["TANK"])
    vtank("strap-stray-lo", TANK_R + 0.012, 0.55, 0.62, STRAY_X, STRAY_Z, M["TRIM"])
    vtank("strap-stray-hi", TANK_R + 0.012, 1.25, 1.32, STRAY_X, STRAY_Z, M["TRIM"])
    vtank("cap-t-stray", CAP_R, TANK_H, TANK_H + CAP_H, STRAY_X, STRAY_Z, M["CAP"])
    gbox("drop-empty", (STRAY_FROM_X - 0.035, STRAY_FROM_X + 0.035),
         (PIPE_Y0 - 0.35, PIPE_Y0 + 0.02), (STRAY_Z - 0.035, STRAY_Z + 0.035), M["TRIM"])

    # --- The overhead runs, one over each rank, into both end walls.
    for n, z in enumerate(TANK_Z):
        gbox(f"run-{n}", (-RUN_X, RUN_X), (PIPE_Y0, PIPE_Y1),
             (z - PIPE_HALF, z + PIPE_HALF), M["CROWN"])

    # --- The twelve uplights: a narrow pan and a wider head overhanging it,
    # so the head's underside rim pools light straight down onto the deck.
    # The entire room's light. Nothing above 0.40 m emits.
    for x in TANK_X:
        for side in (-1, +1):
            z = side * LAMP_Z
            gbox(f"pan-{x}-{side}", (x - 0.06, x + 0.06), (FLOOR_Y, LAMP_Y0),
                 (z - 0.06, z + 0.06), M["TRIM"])
            gbox(f"uplight-{x}-{side}", (x - LAMP_HALF, x + LAMP_HALF), (LAMP_Y0, LAMP_Y1),
                 (z - LAMP_HALF, z + LAMP_HALF), M["DIFF"])

    # --- The perch, left of the wide door as you come in.
    gbox("perch", (4.976, 5.496), (0.5, 0.58), (1.55, 2.17), M["SOFT2"])
    gbox("perch-leg", (5.4, 5.48), (FLOOR_Y, 0.5), (1.82, 1.9), M["TRIM"])

    # --- The transfer board opposite it: the propellant column as a thing on
    # a wall. Butted back against the recessed work face so there is no slot
    # behind it; the runtime draws the column itself over the glow plate.
    gbox("board", (5.396, RUN_X + 0.08), (1.0, 1.52), (-2.17, -1.55), M["FOIL"])
    gbox("glow-board", (5.3945, 5.396), (1.04, 1.48), (-2.13, -1.59), M["SCREENGLOW"])
    gbox("board-shelf", (5.3, 5.4), (0.96, 1.0), (-2.13, -1.59), M["TRIM"])


def inside_vessel(p):
    """p is a BLENDER point. A flat box with one raised bay over the entry."""
    gx, gy, gz = p.x, p.z, -p.y
    top = COFFER_Y if (gx >= COFFER_X0 and abs(gz) <= COFFER_HZ) else CEILING_Y
    return (abs(gx) < HALF_X - 0.01 and abs(gz) < HALF_Z - 0.01
            and FLOOR_Y + 0.01 < gy < top - 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    M["SOFT2"] = newmat("SOFT", (0.06050, 0.10220, 0.14830), 0.92)
    build_room(M)
    bevel_everything()
    produce("GANTRY", "gantry", inside_vessel, ATLAS, BAKE_SAMPLES, "build_gantry")


if __name__ == "__main__":
    main()
