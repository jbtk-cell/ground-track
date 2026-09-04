"""
Build THE BEND in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_bend.py

Writes public/blender/bend.glb and bend-lightmap.png.

The room, per src/env/bend: a 90 degree turn between the flight deck and the
material half of the station, a quarter annulus 1.9 m wide walked as fourteen
flat facets. On the outer wall hangs the frame album - nine returned stills,
each a pale plate in a dark frame; the inner wall is the tank belly, ribbed.
It is the brightest room on this side of the station on purpose - it follows
the plot's density with sparseness and light.

Every number is copied from src/env/bend/index.ts: R 3.6, half-width 0.95,
fourteen facets, ribs every third facet, three ceiling lamps at t 0.12 / 0.5 /
0.88, album frames on facets 3..11. Bands follow src/env/kit/bands as radial
reliefs: kick proud 0.06, work recessed 0.08, crown proud 0.14.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, gprism, newmat, produce,
    world,
)

# --------------------------------------------------------------------- plan

R = 3.6
HALF_W = 0.95
R_IN, R_OUT = R - HALF_W, R + HALF_W
CEILING_Y = 2.55
FACETS = 14
SWEEP = math.pi / 2
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.20
END_INSET = 0.006

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
    "DIFFUSER": (0.69824, 0.60520, 0.44724),
    "CREAM": (0.77505, 0.66693, 0.48515),
}

ATLAS = 2048        # the outer wall alone is 16 square metres of album
BAKE_SAMPLES = 1024


def at(theta, r):
    """The bend's own parametrisation: (x, z) plan point at angle and radius."""
    return (r * math.sin(theta), r * math.cos(theta))


def facet_angles(i):
    return (SWEEP * i / FACETS, SWEEP * (i + 1) / FACETS)


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
        "DIFF": newmat("DIFF", C["DIFFUSER"], 0.40, emit=C["DIFFUSER"], strength=13.0),
        # The album stills: returned frames, self-lit like a lightbox - the
        # room's own light aimed at its own subject.
        "STILL": newmat("STILL", C["CREAM"], 0.45, emit=C["CREAM"], strength=1.6),
    }


def wall_band(name, i, base_r, outward, y0, y1, relief, depth, mat):
    """One band of one facet's wall. `outward` is +1 for the outer wall
    (relief proud means a SMALLER radius) ... encoded below."""
    a0, a1 = facet_angles(i)
    face_r = base_r - outward * relief
    back_r = face_r + outward * depth
    plan = [at(a0, face_r), at(a1, face_r), at(a1, back_r), at(a0, back_r)]
    gprism(name, plan, (y0, y1), mat)


# The crown's backing is deeper than the others on purpose: a band's backing
# must reach past the face of the band it meets, or the joint is a slot to
# space (see build_crawl.py; the airtight gate caught the same 2 cm gap here
# as a navy hairline running the whole arc of the outer wall).
BANDS = [
    ("kick", 0.0, KICK_TOP, 0.06, THICK, "KICK"),
    ("work", KICK_TOP, WORK_TOP, -0.08, THICK, "LINER"),
    ("crown", WORK_TOP, CEILING_Y, 0.14, 0.34, "CROWN"),
]


def build_room(M):
    for i in range(FACETS):
        # Outer wall (the album wall): kick proud, work recessed, crown proud.
        for bname, y0, y1, relief, depth, mat in BANDS:
            wall_band(f"w-out{i}-{bname}", i, R_OUT, +1, y0, y1, relief, depth, M[mat])
        # Inner wall (the tank belly): same bands at the smaller radius.
        for bname, y0, y1, relief, depth, mat in BANDS:
            wall_band(f"w-in{i}-{bname}", i, R_IN, -1, y0, y1, relief, depth, M[mat])

        # Deck and ceiling, facet trapezoids sealed under the walls.
        a0, a1 = facet_angles(i)
        lo, hi = R_IN - THICK - 0.10, R_OUT + THICK + 0.10
        gprism(f"deck-{i}", [at(a0, lo), at(a1, lo), at(a1, hi), at(a0, hi)],
               (-0.12, 0.0), M["DECK"])
        gprism(f"ceil-{i}", [at(a0, lo), at(a1, lo), at(a1, hi), at(a0, hi)],
               (CEILING_Y, CEILING_Y + 0.12), M["CROWN"])

    # --- End walls, held just inboard of the port planes, each cut for its
    # seam. Fore looks down -x from the plot; aft looks down -z toward the
    # sill. Cutters carry JAMB so the reveals have a material.
    fore = gbox("end-fore", (END_INSET, END_INSET + 0.10), (0.0, CEILING_Y),
                (R_IN - THICK, R_OUT + THICK), M["END"])
    aft = gbox("end-aft", (R_IN - THICK, R_OUT + THICK), (0.0, CEILING_Y),
               (END_INSET, END_INSET + 0.10), M["END"])
    c_fore = gbox("c-fore", (-0.10, 0.30), (0.0, SEAM_H), (R - SEAM_W / 2, R + SEAM_W / 2),
                  M["JAMB"])
    c_aft = gbox("c-aft", (R - SEAM_W / 2, R + SEAM_W / 2), (0.0, SEAM_H), (-0.10, 0.30),
                 M["JAMB"])
    boolean_diff(fore, [c_fore])
    boolean_diff(aft, [c_aft])
    bpy.data.objects.remove(c_fore, do_unlink=True)
    bpy.data.objects.remove(c_aft, do_unlink=True)

    # Bake-only caps sealing the seams; the runtime owns the real ones.
    gbox("cap-fore", (-0.10, -0.02), (0.0, SEAM_H + 0.2),
         (R - SEAM_W / 2 - 0.1, R + SEAM_W / 2 + 0.1), M["END"])
    gbox("cap-aft", (R - SEAM_W / 2 - 0.1, R + SEAM_W / 2 + 0.1), (0.0, SEAM_H + 0.2),
         (-0.10, -0.02), M["END"])

    fit_out(M)


def fit_out(M):
    def tangent_quad(theta, r0, r1, half_u):
        """A plan rectangle aligned to the facet at theta: half_u along the
        chord, r0..r1 radially. This is how anything mounts FLUSH on a
        faceted wall - an axis-aligned box can only touch it at one angle."""
        s, c = math.sin(theta), math.cos(theta)
        def p(u, r):
            return (r * s + u * c, r * c - u * s)
        return [p(-half_u, r0), p(half_u, r0), p(half_u, r1), p(-half_u, r1)]

    # --- The tank ribs on the inner wall, every third facet: rooted in the
    # kick band, standing proud past the recessed work face.
    for i in (1, 4, 7, 10, 13):
        theta = SWEEP * (i + 0.5) / FACETS
        gprism(f"rib-{i}", tangent_quad(theta, R_IN + 0.02, R_IN + 0.30, 0.11),
               (0.32, 2.12), M["TRIM"])

    # --- The album: nine stills along the outer wall, each plate flush on
    # the work face, each still proud of its plate. What came back from
    # orbit, hung in the order it was flown.
    for i in range(3, 12):
        theta = SWEEP * (i + 0.5) / FACETS
        gprism(f"frame-{i}", tangent_quad(theta, R_OUT + 0.09, R_OUT + 0.028, 0.13),
               (1.18, 1.50), M["TRIM"])
        gprism(f"still-{i}", tangent_quad(theta, R_OUT + 0.032, R_OUT + 0.006, 0.091),
               (1.24, 1.44), M["STILL"])

    # --- The perch near the fore end, on the inner-wall side, and the one
    # frame taken down and left leaning against its leg.
    cx, cz = at(math.pi / 28, R_IN + 0.45)
    gbox("perch", (cx - 0.30, cx + 0.30), (0.50, 0.58), (cz - 0.24, cz + 0.24), M["TRIM"])
    gbox("perch-leg", (cx - 0.05, cx + 0.05), (0.0, 0.50), (cz - 0.05, cz + 0.05), M["TRIM"])
    gbox("leaning", (cx - 0.12, cx + 0.12), (0.58, 0.90), (cz - 0.03, cz + 0.03), M["TRIM"])

    # --- Three ceiling lamps riding the centreline, housings flush to the
    # crown, diffusers just below - the same fitting as the plot's.
    for t in (0.12, 0.5, 0.88):
        lx, lz = at(t * SWEEP, R)
        gbox(f"lh-{t}", (lx - 0.355, lx + 0.355), (2.48, CEILING_Y), (lz - 0.355, lz + 0.355),
             M["TRIM"])
        gbox(f"lamp-{t}", (lx - 0.30, lx + 0.30), (2.455, 2.48), (lz - 0.30, lz + 0.30),
             M["DIFF"])


def inside_vessel(p):
    """p is a BLENDER point. True if it is in the quarter-annulus volume."""
    gx, gy, gz = p.x, p.z, -p.y
    if gx < 0.02 or gz < 0.02:
        return False
    r = math.hypot(gx, gz)
    return R_IN + 0.01 < r < R_OUT - 0.01 and 0.01 < gy < CEILING_Y - 0.01


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("BEND", "bend", inside_vessel, ATLAS, BAKE_SAMPLES, "build_bend")


if __name__ == "__main__":
    main()
