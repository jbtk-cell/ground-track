"""
Build THE MAGAZINE in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_magazine.py

Writes public/blender/magazine.glb and magazine-lightmap.png.

The room, per src/env/magazine: the stripped propellant magazine - 5 m
square, 5.15 m of headroom over a deck at 0.45, the restraint frame that held
the tanks, the tie-down grid, the receiver bracket, one strap left hanging.
Silent, and lit by the planet and by nothing else.

THE BEAM IS REAL HERE, and that is the whole point of rebuilding this room in
a path tracer. The legacy room projects the earthshine analytically and cuts
the far wall's facets at the exact heights the grating bars shade - hundreds
of lines of careful arithmetic to fake what light does. In Cycles the
aperture is genuinely open, a sun stands in for the planet at the same fifty
degrees, and the barred rectangle on the far wall, the dark step where the
crown ledge cuts the beam, and the soft wash the patch throws back into the
room are all just physics. The runtime closes the hole with its own dark
plenum panel above the bars - the same split as every doorway cap: the .glb
stays honest about light, the room stays airtight about space.

Every number is copied from src/env/magazine/index.ts.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, g2b, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF = 2.5
FLOOR_Y, CEILING_Y = 0.45, 5.6           # the upper level's deck, not zero
KICK_TOP, WORK_TOP = FLOOR_Y + 0.95, FLOOR_Y + 2.05
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.10
DOOR_WALL_X = HALF - 0.086               # deepest relief + seam inset

AP_X0, AP_X1 = -1.2, 0.64                # the ceiling grating
AP_Z0, AP_Z1 = -0.55, 0.55
BAR_PITCH, BAR_T, BAR_D = 0.2, 0.04, 0.06
BAR_COUNT = round((AP_X1 - AP_X0 - BAR_T) / BAR_PITCH) + 1
EARTHSHINE_SLOPE = 1.2                   # metres fallen per metre in -x

TIE_PITCH, TIE_HALF = 0.5, 0.045

FRAME_HX, FRAME_HZ, MEMBER = 1.2, 0.8, 0.09
FRAME_TOP = FLOOR_Y + 4.0
FRAME_MID = FLOOR_Y + 2.0

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
    "EARTH": (0.56000, 0.44800, 0.25500),  # EARTHSHINE_GROUND, linear
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
        # A restrained spill: the door leads to THE CROWN, but this room's
        # signature is an absence and the beam must stay the brightest thing.
        # 5.0, not the gantry's 2.5: the plate stands in for the spine's lit
        # run beyond the door, and against this room's dark it read as a dim
        # patch (luma 133) rather than a doorway to a lit corridor. The small
        # seam here has none of the wide door's flood risk.
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=5.0),
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
            gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1), (-HALF - THICK, HALF + THICK), M[key])
        else:
            gbox(f"w-{side}-{bname}", (-HALF - THICK, HALF + THICK), (y0, y1), (lo, hi), M[key])

    # Liner panels on the work band, two rows - held off the door span.
    work_face = plane + inward * (-0.08)
    p0, p1 = sorted((work_face, work_face + inward * 0.012))
    n = 5
    step = 2 * HALF / n
    rows = [(KICK_TOP + 0.03, FLOOR_Y + 1.50), (FLOOR_Y + 1.53, WORK_TOP - 0.03)]
    for i in range(n):
        a = -HALF + step * i + 0.007
        b = -HALF + step * (i + 1) - 0.007
        if any(d[0] < b and a < d[1] for d in doors):
            continue
        for ry0, ry1 in rows:
            nm = f"p-{side}-{i}-{ry0:.2f}"
            if axis == "x":
                gbox(nm, (p0, p1), (ry0, ry1), (a, b), M[work_mat])
            else:
                gbox(nm, (a, b), (ry0, ry1), (p0, p1), M[work_mat])


def build_room(M):
    # --- Four banded walls; the door wall is held 86 mm inboard so its work
    # groove stays out of THE CROWN. The far (-x) wall is the beam's screen.
    wall(M, "door", "x", DOOR_WALL_X, -1, "END", [(-SEAM_W / 2 - 0.06, SEAM_W / 2 + 0.06)])
    wall(M, "far", "x", -HALF, +1, "END", [])
    wall(M, "stbd", "z", HALF, -1, "LINER", [])
    wall(M, "port", "z", -HALF, +1, "LINER", [])

    backing = [o for o in bpy.data.objects if o.name.startswith("w-door")]
    door = gbox("c-door", (DOOR_WALL_X - 0.5, DOOR_WALL_X + 0.6), (FLOOR_Y, FLOOR_Y + SEAM_H),
                (-SEAM_W / 2, SEAM_W / 2), M["JAMB"])
    for w in backing:
        boolean_diff(w, [door])
    bpy.data.objects.remove(door, do_unlink=True)
    gbox("cap-fore", (DOOR_WALL_X + 0.10, DOOR_WALL_X + 0.18), (FLOOR_Y, FLOOR_Y + SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (DOOR_WALL_X + 0.085, DOOR_WALL_X + 0.090), (FLOOR_Y, FLOOR_Y + SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # --- The deck at 0.45, tiled on the tie-down pitch, a socket in each cell.
    gbox("deck-slab", (-HALF - THICK, HALF + THICK), (FLOOR_Y - THICK, FLOOR_Y - 0.014),
         (-HALF - THICK, HALF + THICK), M["TRIM"])
    cells = round(2 * HALF / TIE_PITCH)
    for i in range(cells):
        for j in range(cells):
            x0 = -HALF + i * TIE_PITCH + 0.004
            x1 = -HALF + (i + 1) * TIE_PITCH - 0.004
            z0 = -HALF + j * TIE_PITCH + 0.004
            z1 = -HALF + (j + 1) * TIE_PITCH - 0.004
            gbox(f"deck-{i}-{j}", (x0, x1), (FLOOR_Y - 0.014, FLOOR_Y), (z0, z1), M["DECK"])
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            gbox(f"tie-{i}-{j}", (cx - TIE_HALF, cx + TIE_HALF), (FLOOR_Y, FLOOR_Y + 0.004),
                 (cz - TIE_HALF, cz + TIE_HALF), M["TRIM"])

    # --- The ceiling, with the grating aperture GENUINELY OPEN for the bake:
    # the planet shines through it, and the runtime closes it with its own
    # plenum panel. Four slabs tile round the hole.
    for tag, x0, x1, z0, z1 in (
        ("fore", AP_X1, HALF + THICK, -HALF - THICK, HALF + THICK),
        ("aft", -HALF - THICK, AP_X0, -HALF - THICK, HALF + THICK),
        ("stbd", AP_X0, AP_X1, AP_Z1, HALF + THICK),
        ("port", AP_X0, AP_X1, -HALF - THICK, AP_Z0),
    ):
        gbox(f"ceiling-{tag}", (x0, x1), (CEILING_Y, CEILING_Y + THICK), (z0, z1), M["CROWN"])
    # The aperture's own reveal: a shallow duct rim so the opening has sides.
    for tag, x0, x1, z0, z1 in (
        ("n", AP_X0 - 0.05, AP_X0, AP_Z0 - 0.05, AP_Z1 + 0.05),
        ("s", AP_X1, AP_X1 + 0.05, AP_Z0 - 0.05, AP_Z1 + 0.05),
        ("e", AP_X0, AP_X1, AP_Z1, AP_Z1 + 0.05),
        ("w", AP_X0, AP_X1, AP_Z0 - 0.05, AP_Z0),
    ):
        gbox(f"rim-{tag}", (x0, x1), (CEILING_Y - 0.02, CEILING_Y + THICK), (z0, z1), M["JAMB"])

    # The grating bars, hanging in the opening.
    for k in range(BAR_COUNT):
        x0 = AP_X0 + k * BAR_PITCH
        gbox(f"grate-{k}", (x0, x0 + BAR_T), (CEILING_Y - BAR_D, CEILING_Y),
             (AP_Z0, AP_Z1), M["TRIM"])

    fit_out(M)
    planet()


def fit_out(M):
    # --- The restraint frame: four posts, three levels of rail spanning
    # BETWEEN them, abutting rather than overlapping.
    ix, iz = FRAME_HX - MEMBER, FRAME_HZ - MEMBER
    for sx in (-1, 1):
        for sz in (-1, 1):
            gbox(f"post-{sx}{sz}",
                 (-FRAME_HX if sx < 0 else ix, -ix if sx < 0 else FRAME_HX),
                 (FLOOR_Y, FRAME_TOP),
                 (-FRAME_HZ if sz < 0 else iz, -iz if sz < 0 else FRAME_HZ), M["FOIL"])
    for name, y0 in (("sill", FLOOR_Y), ("mid", FRAME_MID), ("head", FRAME_TOP - MEMBER)):
        for sz in (-1, 1):
            gbox(f"rail-{name}-{'p' if sz < 0 else 's'}", (-ix, ix), (y0, y0 + MEMBER),
                 (-FRAME_HZ if sz < 0 else iz, -iz if sz < 0 else FRAME_HZ), M["FOIL"])
        for sx in (-1, 1):
            gbox(f"rail-{name}-{'a' if sx < 0 else 'f'}x",
                 (-FRAME_HX if sx < 0 else ix, -ix if sx < 0 else FRAME_HX),
                 (y0, y0 + MEMBER), (-iz, iz), M["FOIL"])

    # --- The receiver bracket on the far wall: pad, collar, stub.
    gbox("mast-pad", (-HALF, -HALF + 0.06), (1.58, 2.32), (-1.72, -1.28), M["KICK"])
    gbox("mast-collar", (-HALF + 0.06, -HALF + 0.2), (1.86, 2.04), (-1.6, -1.4), M["TRIM"])
    gbox("mast-stub", (-HALF + 0.08, -HALF + 0.18), (2.04, 2.66), (-1.55, -1.45), M["FOIL"])

    # --- The perch, on the wall to the left as you come in.
    gbox("perch", (1.72, 2.34), (FLOOR_Y + 0.56, FLOOR_Y + 0.62), (2.1, 2.44), M["SOFTM"])
    gbox("perch-bracket", (1.96, 2.1), (FLOOR_Y, FLOOR_Y + 0.56), (2.3, 2.44), M["TRIM"])
    gbox("perch-loop", (1.82, 2.24), (FLOOR_Y + 1.34, FLOOR_Y + 1.4), (2.42, HALF), M["TRIM"])

    # --- S11: the strap, unhooked and hanging off the head rail.
    gbox("strap", (1.13, 1.18), (FRAME_MID + MEMBER, FRAME_TOP - MEMBER), (0.2, 0.23), M["SOFTM"])


def planet():
    """The planet, as a sun through the grating: down the same fifty-degree
    slope the legacy room projected analytically. Half a degree of angular
    size keeps the bar shadows crisp across five metres of throw."""
    bpy.ops.object.light_add(type="SUN", location=g2b((2.0, CEILING_Y + 3.0, 0.0)))
    sun = bpy.context.active_object
    sun.name = "planetlight"
    # 20.0, not 4.0: at 4.0 the beam's bars peaked at bake value ~1.0 against
    # write_lightmap's 2.2 range - the whole room topped out at luma 115 and
    # the flatness gate rightly called the frames dim. A sun clips hot at the
    # bar cores (irradiance x cos50/pi ~ 4.1) and its bounce is what lifts
    # the tall dark upper volume off the LIGHT_FLOOR into a real gradient.
    sun.data.energy = 20.0
    sun.data.angle = math.radians(0.5)
    sun.data.color = COLOURS["EARTH"]
    aim = Vector(g2b((-1.0, -EARTHSHINE_SLOPE, 0.0))).normalized()
    sun.rotation_euler = aim.to_track_quat("-Z", "Y").to_euler()


def inside_vessel(p):
    """p is a BLENDER point. A tall box over the upper-level deck."""
    gx, gy, gz = p.x, p.z, -p.y
    return (abs(gx) < HALF - 0.01 and abs(gz) < HALF - 0.01
            and FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    M["SOFTM"] = newmat("SOFT", (0.06050, 0.10220, 0.14830), 0.92)
    build_room(M)
    bevel_everything()
    produce("MAGAZINE", "magazine", inside_vessel, ATLAS, BAKE_SAMPLES, "build_magazine")


if __name__ == "__main__":
    main()
