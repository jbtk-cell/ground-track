"""
Build THE SILL in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_sill.py

Writes public/blender/sill.glb and sill-lightmap.png.

The room, per src/env/sill: the salvage register - 6.00 by 4.00 m with a flat
3.00 m lid, over a 3.40 by 2.40 m sump 4.50 m deep, reached by nothing. The
deck has a 3.00 by 1.60 m opening in it, kerbed, barred with a walkable
grating, railed down both long edges. The collection sits on the old pump
foundations at the bottom; the register that names it hangs on the port rail.

THE VALUE STRUCTURE IS PLAN-WISE, NOT SECTION-WISE, and it is the one thing
about this room nobody may quietly undo: the two cream coves run over the two
walking lines and NOTHING crosses the middle of the ceiling, so the dark is a
rectangle in the middle of the floor and the light is round the edges - the
reverse of every other room. The only lamp below anybody's feet on the
station is down in the sump, tucked low on the port wall under a hood so the
light arrives without a visible source and the pit reads as somewhere rather
than as a shaft.

Every number is copied from src/env/sill/index.ts. The walls follow the
station's three bands exactly as build_plot.py does (shared backing plane at
THICK, which is what keeps every band joint sealed); the sump is coursed in
four alternating lifts so 4.5 m of drop is countable rather than deep.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF_X, HALF_Z = 3.0, 2.0
FLOOR_Y, CEILING_Y = 0.0, 3.0
KICK_TOP, WORK_TOP = 0.95, 2.05
SEAM_W, SEAM_H = 1.18, 2.06              # fore: the standard seam
GAL_W, GAL_H = 2.10, 2.30                # aft: the gallery seam into THE GANTRY
THICK = 0.10

OPEN_HX, OPEN_HZ = 1.5, 0.8              # the hole in the deck
KERB_W, KERB_H = 0.10, 0.14
KERB_X, KERB_Z = OPEN_HX + KERB_W, OPEN_HZ + KERB_W

SUMP_HX, SUMP_HZ = 1.7, 1.2              # wider than the opening, both ways
SUMP_FLOOR_Y = -4.5
SUMP_COURSES = 4
DECK_T = 0.12                            # deck slab; its underside is the soffit

BAR_PITCH, BAR_T, BAR_D = 0.10, 0.03, 0.09
BAR_COUNT = round(2 * OPEN_HZ / BAR_PITCH)

RAIL_Z = OPEN_HZ + KERB_W / 2            # 0.85, the rail line each side
COVE_Z, COVE_HW, COVE_HX = 1.7, 0.08, 2.6

DATUM_Y, DATUM_T = 1.10, 0.012

COLOURS = {
    "LINER": (0.58951, 0.45361, 0.25305),
    "END": (0.50802, 0.38007, 0.20004),
    "KICK": (0.29439, 0.22164, 0.13348),
    "CROWN": (0.08361, 0.07699, 0.06964),
    "DECK": (0.18894, 0.16033, 0.12654),
    "JAMB": (0.13189, 0.11568, 0.09683),
    "FOIL": (0.48515, 0.32314, 0.12477),
    "TRIM": (0.16495, 0.10987, 0.04242),
    "RUST": (0.39157, 0.12214, 0.07036),
    "VOID": (0.00518, 0.01096, 0.01938),
    "CREAM": (0.77505, 0.66693, 0.48515),
    "AMBER": (0.58310, 0.35130, 0.12520),
    "SOFT": (0.06050, 0.10220, 0.14830),   # HULL_SHADOW: the cold frames
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
        "DECK": newmat("DECK", C["DECK"], 0.54, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        "RUST": newmat("RUST", C["RUST"], 0.68),
        # The pump's own ironwork, above and below: grating bars, foundations,
        # cradles, pipes. One value because it is all one machine's leavings.
        "PLANT": newmat("PLANT", C["CROWN"], 0.50, metal=0.40),
        # The collection: cool hull-shadow frames in a warm-lit pit, so they
        # read as objects brought in from outside rather than parts of the room.
        "SALV": newmat("SALV", C["SOFT"], 0.60, metal=0.25),
        # One warm blanket, half off the stage - S12's warm element, four
        # metres under the player's feet at the end of the room's one long
        # sightline, which points straight down.
        "BLANKET": newmat("BLANKET", C["FOIL"], 0.42, metal=0.5,
                          bump=0.10, bump_scale=60, bump_detail=2),
        # The two coves, over the walking lines and over nothing else.
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=12.0),
        # The sump lamp: the only fitting on the station below anybody's feet,
        # low on the port wall behind a hood. A Cycles pit has no free ambient,
        # so a plate this small carries crawl-lamp strength to make three
        # frames and four foundations readable from 4.5 m above.
        "AMBER": newmat("AMBER", C["AMBER"], 0.40, emit=C["AMBER"], strength=60.0),
        # The register's light for the bake; the runtime draws the rows.
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        # Bake-only doorway spill, standing in for the rooms next door.
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
        # The perch pad is soft goods; everything else here is structural.
        "SOFT2": newmat("SOFT", C["SOFT"], 0.92),
    }


def wall(M, side, axis, plane, inward, work_mat, doors):
    """Banded backing and liner panels, exactly build_plot.py's scheme: every
    band shares the outer plane at -THICK, so each band's backing reaches past
    the face of the band it meets and no joint is a slot to space."""
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
            gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1), (-HALF_Z - THICK, HALF_Z + THICK), M[key])
        else:
            gbox(f"w-{side}-{bname}", (-HALF_X - THICK, HALF_X + THICK), (y0, y1), (lo, hi), M[key])

    work_face = plane + inward * (-0.08)
    p0, p1 = sorted((work_face, work_face + inward * 0.012))
    span = (-HALF_Z, HALF_Z) if axis == "x" else (-HALF_X, HALF_X)
    n = 4 if axis == "x" else 8
    step = (span[1] - span[0]) / n
    rows = [(KICK_TOP + 0.03, 1.50), (1.53, WORK_TOP - 0.03)]
    for i in range(n):
        a = span[0] + step * i + 0.007
        b = span[0] + step * (i + 1) - 0.007
        if any(d[0] < b and a < d[1] for d in doors):
            continue
        for ry0, ry1 in rows:
            nm = f"p-{side}-{i}-{ry0:.2f}"
            if axis == "x":
                gbox(nm, (p0, p1), (ry0, ry1), (a, b), M[work_mat])
            else:
                gbox(nm, (a, b), (ry0, ry1), (p0, p1), M[work_mat])


def build_room(M):
    # --- Walls. The long walls are the pressure boundary (vacuum behind
    # both); the ends are bulkheads with the doors in them. The starboard
    # wall's panels skip the pump bank's span.
    wall(M, "fore", "x", HALF_X, -1, "END", [(-SEAM_W / 2 - 0.06, SEAM_W / 2 + 0.06)])
    wall(M, "aft", "x", -HALF_X, +1, "END", [(-GAL_W / 2 - 0.06, GAL_W / 2 + 0.06)])
    wall(M, "stbd", "z", HALF_Z, -1, "LINER", [(-1.3, 1.3)])
    wall(M, "port", "z", -HALF_Z, +1, "LINER", [])

    # The rust datum: a 12 mm hairline at 1.10 m on both long walls - the two
    # walls with vacuum behind them - dead straight over a floor with a hole
    # in it, which makes it a ruler as well as a marker.
    for side, tag in ((+1, "s"), (-1, "p")):
        face = side * (HALF_Z + 0.08)     # the recessed work face
        # Prouder than the 12 mm liner panels it crosses, or they bury it.
        z0, z1 = sorted((face, face - side * 0.020))
        gbox(f"datum-{tag}", (-HALF_X + 0.1, HALF_X - 0.1),
             (DATUM_Y - DATUM_T / 2, DATUM_Y + DATUM_T / 2), (z0, z1), M["RUST"])

    # --- Doorways, cut from the backing. The aft cut is the gallery seam,
    # 2.10 by 2.30 - taller than the work band, so it bites the crown too.
    backing = [o for o in bpy.data.objects if o.name.startswith("w-")]
    reveal = M["JAMB"]
    cutters = [
        gbox("c-fore", (HALF_X - 0.5, HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), reveal),
        gbox("c-aft", (-HALF_X - 0.5, -HALF_X + 0.5), (FLOOR_Y, GAL_H),
             (-GAL_W / 2, GAL_W / 2), reveal),
    ]
    for w in backing:
        boolean_diff(w, cutters)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)

    # Bake-only: caps seal the bake, spill stands in for the rooms next door.
    gbox("cap-fore", (HALF_X + 0.04, HALF_X + 0.12), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (HALF_X + 0.015, HALF_X + 0.020), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])
    gbox("cap-aft", (-HALF_X - 0.12, -HALF_X - 0.04), (FLOOR_Y, GAL_H),
         (-GAL_W / 2 - 0.03, GAL_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-HALF_X - 0.020, -HALF_X - 0.015), (FLOOR_Y, GAL_H),
         (-GAL_W / 2, GAL_W / 2), M["SPILL"])

    # --- The deck: a slab ring round the opening (its underside is the sump's
    # soffit, which is why it spans past the sump walls), tiled on top with
    # real 4 mm gaps down to the slab.
    slabs = [
        ("fore", OPEN_HX, HALF_X, -HALF_Z - THICK, HALF_Z + THICK),
        ("aft", -HALF_X, -OPEN_HX, -HALF_Z - THICK, HALF_Z + THICK),
        ("stbd", -OPEN_HX, OPEN_HX, OPEN_HZ, HALF_Z + THICK),
        ("port", -OPEN_HX, OPEN_HX, -HALF_Z - THICK, -OPEN_HZ),
    ]
    for tag, x0, x1, z0, z1 in slabs:
        gbox(f"slab-{tag}", (x0, x1), (-DECK_T, FLOOR_Y - 0.014), (z0, z1), M["TRIM"])
        nx = max(1, round((x1 - x0) / 1.0))
        nz = max(1, round((z1 - z0) / 1.0))
        for i in range(nx):
            for j in range(nz):
                a = x0 + (x1 - x0) * i / nx + 0.004
                b = x0 + (x1 - x0) * (i + 1) / nx - 0.004
                c = z0 + (z1 - z0) * j / nz + 0.004
                d = z0 + (z1 - z0) * (j + 1) / nz - 0.004
                gbox(f"deck-{tag}-{i}-{j}", (a, b), (FLOOR_Y - 0.014, FLOOR_Y), (c, d), M["DECK"])

    gbox("ceiling", (-HALF_X, HALF_X), (CEILING_Y, CEILING_Y + THICK),
         (-HALF_Z - THICK, HALF_Z + THICK), M["CROWN"])

    # --- The sump: four walls in four alternating courses (flush, recessed
    # 0.03), so the drop is countable, all sharing one backing plane; then the
    # floor, lapped under all four. The courses stop inside the deck slab.
    course_top = -DECK_T + 0.06
    span = SUMP_FLOOR_Y - course_top
    for i in range(SUMP_COURSES):
        y0 = course_top + span * (i + 1) / SUMP_COURSES
        y1 = course_top + span * i / SUMP_COURSES
        rec = 0.03 if i % 2 else 0.0
        mat = M["JAMB"] if i % 2 else M["CROWN"]
        gbox(f"sump-fx-{i}", (SUMP_HX + rec, SUMP_HX + 0.33), (y0, y1),
             (-SUMP_HZ - 0.33, SUMP_HZ + 0.33), mat)
        gbox(f"sump-ax-{i}", (-SUMP_HX - 0.33, -SUMP_HX - rec), (y0, y1),
             (-SUMP_HZ - 0.33, SUMP_HZ + 0.33), mat)
        gbox(f"sump-sz-{i}", (-SUMP_HX - 0.33, SUMP_HX + 0.33), (y0, y1),
             (SUMP_HZ + rec, SUMP_HZ + 0.33), mat)
        gbox(f"sump-pz-{i}", (-SUMP_HX - 0.33, SUMP_HX + 0.33), (y0, y1),
             (-SUMP_HZ - 0.33, -SUMP_HZ - rec), mat)
    gbox("sump-floor", (-SUMP_HX - 0.33, SUMP_HX + 0.33),
         (SUMP_FLOOR_Y - 0.12, SUMP_FLOOR_Y), (-SUMP_HZ - 0.33, SUMP_HZ + 0.33), M["DECK"])

    fit_out(M)


def fit_out(M):
    # --- The kerb: four bars ABUTTING rather than overlapping at the corners,
    # so no two coplanar faces point one way. The long bars own the full run.
    gbox("kerb-port", (-KERB_X, KERB_X), (FLOOR_Y, KERB_H), (-KERB_Z, -OPEN_HZ), M["FOIL"])
    gbox("kerb-stbd", (-KERB_X, KERB_X), (FLOOR_Y, KERB_H), (OPEN_HZ, KERB_Z), M["FOIL"])
    gbox("kerb-fore", (OPEN_HX, KERB_X), (FLOOR_Y, KERB_H), (-OPEN_HZ, OPEN_HZ), M["FOIL"])
    gbox("kerb-aft", (-KERB_X, -OPEN_HX), (FLOOR_Y, KERB_H), (-OPEN_HZ, OPEN_HZ), M["FOIL"])

    # --- The grating: bars along x, hanging UNDER the deck line so their tops
    # and the deck are one surface. You walk on these; through them, the pit.
    for k in range(BAR_COUNT):
        z = -OPEN_HZ + BAR_PITCH * (k + 0.5)
        gbox(f"bar-{k}", (-OPEN_HX, OPEN_HX), (FLOOR_Y - BAR_D, FLOOR_Y),
             (z - BAR_T / 2, z + BAR_T / 2), M["PLANT"])

    # --- A rail down each long edge, ends open: the first view of the room is
    # straight down into the pit over a kerb.
    for side, tag in ((+1, "s"), (-1, "p")):
        zc = side * RAIL_Z
        for n, cx in enumerate((-1.4, 0.0, 1.4)):
            gbox(f"rail-{tag}-post-{n}", (cx - 0.035, cx + 0.035), (KERB_H, 1.02),
                 (zc - 0.035, zc + 0.035), M["TRIM"])
        gbox(f"rail-{tag}-bar", (-1.48, 1.48), (1.02, 1.08),
             (zc - 0.045, zc + 0.045), M["FOIL"])

    # --- The register, hung on the walkway face of the port rail: the plate
    # everyone reads the collection from, since the collection itself is 4.5 m
    # down and the room exists to say you cannot touch it. The .glb carries
    # the plate and the bake's glow; the runtime draws the rows.
    gbox("register", (-0.45, 0.45), (0.84, 1.28), (-0.94, -0.895), M["TRIM"])
    gbox("glow-register", (-0.41, 0.41), (0.88, 1.24), (-0.9415, -0.9400), M["SCREENGLOW"])

    # --- S11: the tray left on the starboard kerb, half of it over the drop.
    gbox("tray", (0.34, 0.78), (KERB_H, 0.20), (0.70, 0.92), M["TRIM"])

    # --- S9: the perch, left of the fore door, inside 2 m of the seam.
    gbox("perch", (2.10, 2.72), (0.50, 0.58), (1.42, 1.94), M["SOFT2"])
    gbox("perch-leg", (2.14, 2.22), (FLOOR_Y, 0.50), (1.62, 1.70), M["TRIM"])

    # --- The pump control bank filling the starboard work band: dead controls
    # for a machine that is not there. No glow anywhere on it, on purpose.
    # Butted against the recessed work face (2.08), so there is no open slot
    # behind it; the declared solid in sill.ts stays at the 2.00 hull line.
    gbox("bank", (-1.2, 1.2), (0.95, 2.05), (1.90, 2.08), M["LINER"])
    gbox("bank-lip", (-1.2, 1.2), (0.91, 0.95), (1.86, 1.90), M["TRIM"])
    for n, cx in enumerate((-0.92, -0.46, 0.0, 0.46, 0.92)):
        gbox(f"bank-panel-{n}", (cx - 0.2, cx + 0.2), (1.30, 1.72), (1.87, 1.90), M["TRIM"])

    # --- Three blanked suction flanges in the port kick band; the pipes they
    # belonged to are visible four metres below, capped, on the same wall.
    for n, cx in enumerate((-0.9, 0.0, 0.9)):
        gbox(f"flange-{n}", (cx - 0.15, cx + 0.15), (0.40, 0.70), (-1.94, -1.89), M["FOIL"])
        gbox(f"flange-boss-{n}", (cx - 0.09, cx + 0.09), (0.46, 0.64), (-1.89, -1.86), M["TRIM"])

    # --- The two coves. Housings hang from the ceiling; the diffuser is a
    # narrower strip under each, because a fitting whose whole body is
    # emissive is a light with no lamp in it.
    for side, tag in ((+1, "s"), (-1, "p")):
        zc = side * COVE_Z
        gbox(f"cove-{tag}", (-COVE_HX, COVE_HX), (2.86, CEILING_Y),
             (zc - COVE_HW, zc + COVE_HW), M["TRIM"])
        gbox(f"lamp-{tag}", (-COVE_HX + 0.04, COVE_HX - 0.04), (2.82, 2.86),
             (zc - COVE_HW + 0.02, zc + COVE_HW - 0.02), M["DIFF"])

    # --- Down in the sump: the pump's foundations, the cradle beams laid
    # across them, and the capped suction pipes down the port wall - the
    # vertical lines that make 4.5 m of drop felt rather than stated.
    for sx, xa, xb in ((-1, -1.5, -0.95), (+1, 0.95, 1.5)):
        for sz, za, zb in ((-1, -0.95, -0.4), (+1, 0.4, 0.95)):
            gbox(f"fdn-{sx}{sz}", (xa, xb), (SUMP_FLOOR_Y, -3.65), (za, zb), M["PLANT"])
        gbox(f"cradle-{sx}", (min(sx * 1.05, sx * 1.4), max(sx * 1.05, sx * 1.4)),
             (-3.65, -3.53), (-0.95, 0.95), M["PLANT"])
    for n, cx in enumerate((-0.9, 0.0, 0.9)):
        gbox(f"pipe-{n}", (cx - 0.11, cx + 0.11), (-3.56, FLOOR_Y - DECK_T - 0.04),
             (-SUMP_HZ, -1.0), M["PLANT"])
        gbox(f"pipe-cap-{n}", (cx - 0.14, cx + 0.14), (-3.62, -3.56),
             (-SUMP_HZ, -0.98), M["FOIL"])

    # --- The collection: one frame up on the cradles mid-refit, two on the
    # floor waiting, and the foil blanket half off the stage - the warm thing
    # in the cold frame at the bottom of the long sightline.
    gbox("frame-stage", (-1.3, 1.3), (-3.53, -3.09), (-0.3, 0.3), M["SALV"])
    gbox("frame-stage-skirt", (-1.48, -1.3), (-3.48, -3.14), (-0.2, 0.2), M["SALV"])
    gbox("frame-blanket", (-0.4, 0.6), (-3.09, -3.04), (-0.33, 0.33), M["BLANKET"])
    gbox("frame-bird", (-0.7, 0.1), (SUMP_FLOOR_Y, -4.1), (0.62, 1.06), M["SALV"])
    gbox("frame-bird-wing", (-0.6, 0.0), (-4.1, -4.06), (0.8, 1.18), M["SALV"])
    gbox("frame-cube", (0.55, 0.83), (SUMP_FLOOR_Y, -4.22), (-1.02, -0.74), M["SALV"])

    # --- The sump lamp, high on the port wall tucked under the soffit lip -
    # exactly where the room's own prose puts it: from every standable point
    # the light is visible and the fitting is not (the soffit hides it from
    # the grating, the kerb from the aisles). Mounted low it lit a puddle and
    # left 4.5 m of drop reading as a black shaft; up here it washes the whole
    # pit and the frames read from above.
    gbox("lamp-sump", (-0.6, -0.28), (-0.78, -0.62), (-SUMP_HZ, -1.16), M["AMBER"])
    gbox("hood-sump", (-0.66, -0.22), (-0.62, -0.56), (-SUMP_HZ, -1.06), M["PLANT"])


def inside_vessel(p):
    """p is a BLENDER point. The open volume is two boxes, one under the
    other: the room above the deck and the sump below it, joined through the
    grating's opening."""
    gx, gy, gz = p.x, p.z, -p.y
    above = (abs(gx) < HALF_X - 0.01 and abs(gz) < HALF_Z - 0.01
             and FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01)
    below = (abs(gx) < SUMP_HX - 0.01 and abs(gz) < SUMP_HZ - 0.01
             and SUMP_FLOOR_Y + 0.01 < gy < -DECK_T - 0.01)
    throat = (abs(gx) < OPEN_HX - 0.01 and abs(gz) < OPEN_HZ - 0.01
              and -DECK_T - 0.01 < gy < FLOOR_Y - 0.005)
    return above or below or throat


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("SILL", "sill", inside_vessel, ATLAS, BAKE_SAMPLES, "build_sill")


if __name__ == "__main__":
    main()
