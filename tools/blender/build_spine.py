"""
Build THE SPINE in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_spine.py

Writes public/blender/spine.glb and spine-lightmap.png.

The room, per src/env/spine: the corridor - 11.2 m long, 1.62 m wide, 2.24 m
to the ceiling, eight identical frames, eight lamp segments with dark gaps
between them (the reason the corridor can be walked at all: light that
sweeps overhead is the cheapest motion cue there is), a cable run down the
port wall, a mint handrail down the starboard one, and pale transverse deck
joints that pass under the eye at walking pace.

In Cycles the segment rhythm does what the legacy rig laboured for: eight
pools with genuine dark between them, frames stepping out of the walls where
the light grazes them, and a ceiling lit by the floor's own bounce.

Every number is copied from src/env/spine/index.ts.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

LENGTH = 11.2
HALF_LENGTH = LENGTH / 2
HALF_Z = 0.81
FLOOR_Y, CEILING_Y = 0.0, 2.24
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.10

FRAMES = 8
FRAME_T, FRAME_STAND = 0.09, 0.055
LAMP_SEGMENTS, LAMP_GAP = 8, 0.42
LAMP_Y, LAMP_HALF_Z = CEILING_Y - 0.035, 0.062
JOINT_M, JOINTS_PER_BAY = 0.05, 2

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
    "MINT": (0.56471, 0.71569, 0.60383),
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
        # The transverse joints: a LIGHT line on a dark deck, the one detail a
        # walking eye cannot miss. The slab shows through the tile gaps.
        "JOINTPALE": newmat("JOINTPALE", C["NOSE"], 0.50, metal=0.25),
        # Mint marks what a hand closes round.
        "GRIP": newmat("GRIP", C["MINT"], 0.45, metal=0.30),
        # Eight segments, dark gaps between: the sweep is the walk.
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=10.0),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
    }


def wall(M, side, axis, plane, inward, work_mat, doors):
    bands = [
        ("kick", FLOOR_Y, KICK_TOP, 0.06, "KICK"),
        ("work", KICK_TOP, WORK_TOP, -0.08, None),
        ("crown", WORK_TOP, CEILING_Y, 0.14, "CROWN"),
    ]
    for bname, y0, y1, relief, mat in bands:
        face = plane + inward * relief
        outer = plane - inward * THICK
        lo, hi = min(face, outer), max(face, outer)
        key = mat or work_mat
        if axis == "x":
            gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1),
                 (-HALF_Z - THICK, HALF_Z + THICK), M[key])
        else:
            gbox(f"w-{side}-{bname}", (-HALF_LENGTH - THICK, HALF_LENGTH + THICK),
                 (y0, y1), (lo, hi), M[key])

    # Liner panels on the bay rhythm, 12 mm proud of the recessed work face -
    # held off any door span (Deck One cut side doors into this corridor).
    if axis != "z":
        return
    work_face = plane + inward * (-0.08)
    p0, p1 = sorted((work_face, work_face + inward * 0.012))
    n = FRAMES * 2
    step = LENGTH / n
    rows = [(KICK_TOP + 0.03, 1.50), (1.53, WORK_TOP - 0.03)]
    for i in range(n):
        a = -HALF_LENGTH + step * i + 0.007
        b = -HALF_LENGTH + step * (i + 1) - 0.007
        if any(d0 < b and a < d1 for d0, d1 in doors):
            continue
        for ry0, ry1 in rows:
            gbox(f"p-{side}-{i}-{ry0:.2f}", (a, b), (ry0, ry1), (p0, p1), M[work_mat])


# Deck One's side doors (owner direction 2026-09-05): the spine stops being
# a straw and starts being a street. World: north to THE TEE, south to THE
# CHASE. Port planes sit at the EXTENT edge (HALF_Z + 0.2); the walls end at
# HALF_Z + THICK, and the station's collar rings line the gap, exactly as at
# every other seam.
NORTH_X, SOUTH_X = 2.95, -2.65


def build_room(M):
    door_n = (NORTH_X - SEAM_W / 2 - 0.06, NORTH_X + SEAM_W / 2 + 0.06)
    door_s = (SOUTH_X - SEAM_W / 2 - 0.06, SOUTH_X + SEAM_W / 2 + 0.06)
    wall(M, "fore", "x", HALF_LENGTH, -1, "END", [])
    wall(M, "aft", "x", -HALF_LENGTH, +1, "END", [])
    wall(M, "stbd", "z", HALF_Z, -1, "LINER", [door_n])
    wall(M, "port", "z", -HALF_Z, +1, "LINER", [door_s])

    backing = [o for o in bpy.data.objects if o.name.startswith("w-fore") or o.name.startswith("w-aft")]
    cutters = [
        gbox("c-fore", (HALF_LENGTH - 0.5, HALF_LENGTH + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), M["JAMB"]),
        gbox("c-aft", (-HALF_LENGTH - 0.5, -HALF_LENGTH + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), M["JAMB"]),
    ]
    for w in backing:
        boolean_diff(w, cutters)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    gbox("cap-fore", (HALF_LENGTH + 0.04, HALF_LENGTH + 0.12), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (HALF_LENGTH + 0.015, HALF_LENGTH + 0.020), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])
    gbox("cap-aft", (-HALF_LENGTH - 0.12, -HALF_LENGTH - 0.04), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-HALF_LENGTH - 0.020, -HALF_LENGTH - 0.015), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # The side doors, cut through the z walls' bands.
    sides = [o for o in bpy.data.objects if o.name.startswith("w-stbd")]
    ports = [o for o in bpy.data.objects if o.name.startswith("w-port")]
    c_n = gbox("c-north", (NORTH_X - SEAM_W / 2, NORTH_X + SEAM_W / 2), (FLOOR_Y, SEAM_H),
               (HALF_Z - 0.5, HALF_Z + 0.6), M["JAMB"])
    c_s = gbox("c-south", (SOUTH_X - SEAM_W / 2, SOUTH_X + SEAM_W / 2), (FLOOR_Y, SEAM_H),
               (-HALF_Z - 0.6, -HALF_Z + 0.5), M["JAMB"])
    for w in sides:
        boolean_diff(w, [c_n])
    for w in ports:
        boolean_diff(w, [c_s])
    bpy.data.objects.remove(c_n, do_unlink=True)
    bpy.data.objects.remove(c_s, do_unlink=True)
    # The side caps sit 0.24 m proud (behind the bake spill plates), and depth
    # amplifies grazing sightlines: 0.03 m margins leaked 3612 px of space in
    # spineb-run. Oversize generously - the plate is free and invisible except
    # through the cut.
    gbox("cap-north", (NORTH_X - SEAM_W / 2 - 0.60, NORTH_X + SEAM_W / 2 + 0.60),
         (FLOOR_Y, SEAM_H + 0.40), (HALF_Z + 0.24, HALF_Z + 0.32), M["END"])
    gbox("sky-north", (NORTH_X - SEAM_W / 2, NORTH_X + SEAM_W / 2),
         (FLOOR_Y, SEAM_H), (HALF_Z + 0.215, HALF_Z + 0.220), M["SPILL"])
    gbox("cap-south", (SOUTH_X - SEAM_W / 2 - 0.60, SOUTH_X + SEAM_W / 2 + 0.60),
         (FLOOR_Y, SEAM_H + 0.40), (-HALF_Z - 0.32, -HALF_Z - 0.24), M["END"])
    gbox("sky-south", (SOUTH_X - SEAM_W / 2, SOUTH_X + SEAM_W / 2),
         (FLOOR_Y, SEAM_H), (-HALF_Z - 0.220, -HALF_Z - 0.215), M["SPILL"])

    # --- The deck: a PALE slab under dark plates, so every transverse gap is
    # a light joint sweeping under the eye.
    gbox("deck-slab", (-HALF_LENGTH, HALF_LENGTH), (-THICK, FLOOR_Y - 0.010),
         (-HALF_Z - THICK, HALF_Z + THICK), M["JOINTPALE"])
    plates = FRAMES * JOINTS_PER_BAY * 2
    step = LENGTH / plates
    for i in range(plates):
        a = -HALF_LENGTH + step * i
        b = a + step - JOINT_M
        gbox(f"deck-{i}", (a, b), (FLOOR_Y - 0.010, FLOOR_Y),
             (-HALF_Z - THICK, HALF_Z + THICK), M["DECK"])
    gbox("ceiling", (-HALF_LENGTH, HALF_LENGTH), (CEILING_Y, CEILING_Y + THICK),
         (-HALF_Z - THICK, HALF_Z + THICK), M["CROWN"])

    # --- Eight frames: two uprights, a header between them, a kick rail.
    inner = HALF_Z - FRAME_STAND
    for i in range(FRAMES):
        t = (i + 0.5) / FRAMES
        x0 = -HALF_LENGTH + 0.35 + t * (LENGTH - 0.7) - FRAME_T / 2
        x1 = x0 + FRAME_T
        gbox(f"fr-{i}-p", (x0, x1), (FLOOR_Y, CEILING_Y), (-HALF_Z, -inner), M["END"])
        gbox(f"fr-{i}-s", (x0, x1), (FLOOR_Y, CEILING_Y), (inner, HALF_Z), M["END"])
        gbox(f"fr-{i}-h", (x0, x1), (CEILING_Y - FRAME_STAND, CEILING_Y), (-inner, inner), M["END"])
        gbox(f"fr-{i}-k", (x0, x1), (FLOOR_Y + 0.02, FLOOR_Y + 0.11), (-inner, inner), M["TRIM"])

    # --- The eight lamp segments, dark gaps between.
    span = (LENGTH - 1.0) / LAMP_SEGMENTS
    for i in range(LAMP_SEGMENTS):
        x0 = -HALF_LENGTH + 0.5 + i * span
        gbox(f"lh-{i}", (x0 + LAMP_GAP / 2 - 0.03, x0 + span - LAMP_GAP / 2 + 0.03),
             (CEILING_Y - 0.004, CEILING_Y), (-LAMP_HALF_Z - 0.03, LAMP_HALF_Z + 0.03), M["TRIM"])
        gbox(f"lamp-{i}", (x0 + LAMP_GAP / 2, x0 + span - LAMP_GAP / 2),
             (LAMP_Y, CEILING_Y - 0.004), (-LAMP_HALF_Z, LAMP_HALF_Z), M["DIFF"])

    # --- The cable run (port) and the mint handrail (starboard), both proud
    # of the frame uprights so nothing shares a plane with them.
    gbox("cable-run", (-HALF_LENGTH + 0.4, HALF_LENGTH - 0.4), (1.52, 1.565),
         (-HALF_Z + 0.005, -HALF_Z + FRAME_STAND + 0.012), M["TRIM"])
    gbox("handrail", (-HALF_LENGTH + 0.4, HALF_LENGTH - 0.4), (0.98, 1.023),
         (HALF_Z - FRAME_STAND - 0.012, HALF_Z - 0.005), M["GRIP"])


def inside_vessel(p):
    gx, gy, gz = p.x, p.z, -p.y
    return (abs(gx) < HALF_LENGTH - 0.01 and abs(gz) < HALF_Z - 0.01
            and FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("SPINE", "spine", inside_vessel, ATLAS, BAKE_SAMPLES, "build_spine")


if __name__ == "__main__":
    main()
