"""
Build THE RACKS in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_racks.py

Writes public/blender/racks.glb and racks-lightmap.png.

The room, per src/env/racks with one owner-directed change of 2026-09-05:
the stores - 8.40 by 3.05 m flat at 2.42, a bank of rack bays down both long
walls. The banks are 0.90 m deep (the legacy 1.05 left an 0.95 m aisle whose
open drawers rode out past the centreline - a corridor no body could pass;
"impossible for a person in real life to walk through", and the owner is
right). The aisle is 1.25 m between faces, the four open drawers ride out
0.30 m on staggered sides, and the worst pinch leaves 0.95 m of clear walk.
Sixteen bays on the ISPR pitch, drawer faces with pulls and labels, stock in
silhouette, the manifest board, the blank perch bay, and the foil tote
standing on a ridden-out drawer where it does not belong.

NO DIRECTIONAL LIGHT, and the rebuild keeps the rule by construction: eight
identical fittings on the bay pitch down the middle of the ceiling and
nothing else. Bureaucratic light, the light of a stockroom - in Cycles the
even-ness has to be earned by the overlap of eight small sources, and the
open bays go genuinely dark inside, which is what makes the stock read as
silhouettes rather than marks on a surface.

Every number is copied from src/env/racks/index.ts.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF_X, HALF_Z = 4.2, 1.525
FLOOR_Y, CEILING_Y = 0.0, 2.42
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.10

BAY_M = 1.05                             # pitch along the wall (ISPR)
BANK_D = 0.90                            # bank depth - NOT the pitch
BAYS = 8
BAY_GAP = 0.04
BAY_W = BAY_M - BAY_GAP
AISLE_HALF = HALF_Z - BANK_D             # 0.625: a 1.25 m aisle
RACK_TOP = 2.05
PLINTH_H = 0.05

FACE_RELIEF = 0.055
FACE_Z = AISLE_HALF
CARCASS_Z = AISLE_HALF + FACE_RELIEF
CAVITY_BACK_Z = CARCASS_Z + 0.81
BANK_BACK_Z = HALF_Z - 0.005

DRAWERS = 5
DRAWER_H, DRAWER_GAP = 0.37, 0.025
DRAWER_W = BAY_W - 0.04
PULL_W, LABEL_W = 0.32, 0.24
DRAWER_OUT = 0.30
OPEN_DRAWER_W = 0.94
DRAWER_FRONT_Z = AISLE_HALF - DRAWER_OUT

PORT_OPEN = {2, 4}
STARBOARD_OPEN = {3, 5}
MANIFEST_BAY = 4
PERCH_BAY = 7

DATUM_Y, DATUM_T = 1.10, 0.012
CROWN_RELIEF = 0.14

BAY_CENTRES = [-HALF_X + BAY_M / 2 + n * BAY_M for n in range(BAYS)]

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
    "NOSE": (0.72310, 0.69380, 0.62620),
    "CAVITY": (0.03000, 0.02700, 0.02400),
    "SCREENBG": (0.02400, 0.03600, 0.05400),
}

ATLAS = 2048
BAKE_SAMPLES = 1024


def materials():
    C = COLOURS
    return {
        # The drawer faces: the lightest large surface in the room and the
        # thing it is mostly made of.
        "FACE": newmat("FACE", C["END"], 0.70, bump=0.10, bump_scale=30, bump_detail=2),
        "END": newmat("END", C["END"], 0.80, bump=0.14, bump_scale=18, bump_detail=2),
        "LINER": newmat("LINER", C["LINER"], 0.78, bump=0.14, bump_scale=18, bump_detail=2),
        "KICK": newmat("KICK", C["KICK"], 0.64, bump=0.10, bump_scale=26, bump_detail=2),
        "CROWN": newmat("CROWN", C["CROWN"], 0.88, bump=0.10, bump_scale=14, bump_detail=2),
        "DECK": newmat("DECK", C["DECK"], 0.54, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        "RUST": newmat("RUST", C["RUST"], 0.68),
        "PULL": newmat("PULL", C["NOSE"], 0.45, metal=0.40),
        # The insides of the four open bays: near-black, never pure black, and
        # the darkest authored value in the room - the stock stands against it
        # in silhouette.
        "CAVITY": newmat("CAVITY", C["CAVITY"], 0.85),
        "STOCK": newmat("STOCK", C["KICK"], 0.75),
        # Eight fittings on the bay pitch, and nothing else. The whole rig.
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=13.0),
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
    }


def drawer_y(k):
    y0 = PLINTH_H + DRAWER_GAP + k * (DRAWER_H + DRAWER_GAP)
    return y0, y0 + DRAWER_H


def dbox(name, cx, side, x, y, d, mat):
    """A bay-local box: x about the bay centre, depth from the centreline
    outward - one description for both banks, exactly as in the room's TS."""
    a, b = side * d[0], side * d[1]
    gbox(name, (cx + x[0], cx + x[1]), (y[0], y[1]), (min(a, b), max(a, b)), mat)


def shut_drawer(M, tag, cx, side, k):
    y0, y1 = drawer_y(k)
    mid = (y0 + y1) / 2
    dbox(f"{tag}-d{k}", cx, side, (-DRAWER_W / 2, DRAWER_W / 2), (y0, y1),
         (FACE_Z, CARCASS_Z), M["FACE"])
    dbox(f"{tag}-d{k}-pull", cx, side, (-0.34, -0.34 + PULL_W), (mid - 0.015, mid + 0.015),
         (FACE_Z - 0.028, FACE_Z), M["PULL"])
    dbox(f"{tag}-d{k}-label", cx, side, (0.1, 0.1 + LABEL_W), (mid - 0.025, mid + 0.025),
         (FACE_Z - 0.006, FACE_Z), M["TRIM"])


def open_bay(M, tag, cx, side):
    half = BAY_W / 2
    inner = half - 0.03
    dbox(f"{tag}-back", cx, side, (-half, half), (PLINTH_H, RACK_TOP),
         (CAVITY_BACK_Z, BANK_BACK_Z), M["CAVITY"])
    dbox(f"{tag}-side-a", cx, side, (-half, -inner), (PLINTH_H, RACK_TOP),
         (CARCASS_Z, CAVITY_BACK_Z), M["CAVITY"])
    dbox(f"{tag}-side-b", cx, side, (inner, half), (PLINTH_H, RACK_TOP),
         (CARCASS_Z, CAVITY_BACK_Z), M["CAVITY"])
    dbox(f"{tag}-head", cx, side, (-inner, inner), (RACK_TOP - 0.06, RACK_TOP),
         (CARCASS_Z, CAVITY_BACK_Z), M["CAVITY"])
    dbox(f"{tag}-shelf-lo", cx, side, (-inner, inner), (0.7, 0.73),
         (CARCASS_Z, CAVITY_BACK_Z), M["KICK"])
    dbox(f"{tag}-shelf-hi", cx, side, (-inner, inner), (1.42, 1.45),
         (CARCASS_Z, CAVITY_BACK_Z), M["KICK"])
    # Stock in silhouette: three sizes, no two at one depth.
    dbox(f"{tag}-stock-a", cx, side, (-0.44, -0.14), (0.73, 0.85),
         (CARCASS_Z + 0.09, CARCASS_Z + 0.47), M["STOCK"])
    dbox(f"{tag}-stock-b", cx, side, (0.02, 0.34), (0.73, 0.79),
         (CARCASS_Z + 0.17, CARCASS_Z + 0.75), M["STOCK"])
    dbox(f"{tag}-stock-c", cx, side, (-0.3, 0.18), (1.45, 1.72),
         (CARCASS_Z + 0.07, CARCASS_Z + 0.57), M["STOCK"])
    # The drawer, out on its slides into the aisle.
    y0, y1 = drawer_y(2)
    mid = (y0 + y1) / 2
    out = OPEN_DRAWER_W / 2
    dbox(f"{tag}-drawer", cx, side, (-out, out), (y0, y1),
         (DRAWER_FRONT_Z, CARCASS_Z + 0.2), M["FACE"])
    dbox(f"{tag}-drawer-pull", cx, side, (-0.16, 0.16), (mid - 0.015, mid + 0.015),
         (DRAWER_FRONT_Z - 0.028, DRAWER_FRONT_Z), M["PULL"])


def build_room(M):
    half = BAY_W / 2

    # --- The banks, bay by bay, one description for both sides.
    for n, cx in enumerate(BAY_CENTRES):
        for side, stag in ((-1, "p"), (1, "s")):
            tag = f"bay-{stag}{n}"
            dbox(f"{tag}-plinth", cx, side, (-half, half), (FLOOR_Y, PLINTH_H),
                 (FACE_Z, BANK_BACK_Z), M["KICK"])
            is_open = n in (PORT_OPEN if side < 0 else STARBOARD_OPEN)
            if is_open:
                open_bay(M, tag, cx, side)
                continue
            dbox(f"{tag}-carcass", cx, side, (-half, half), (PLINTH_H, RACK_TOP),
                 (CARCASS_Z, BANK_BACK_Z), M["CROWN"])
            if side > 0 and n == PERCH_BAY:
                face = DRAWER_W / 2
                dbox(f"{tag}-blank", cx, side, (-face, face), (PLINTH_H, RACK_TOP),
                     (CARCASS_Z - 0.025, CARCASS_Z), M["KICK"])
                dbox(f"{tag}-perch", cx, side, (-0.31, 0.31), (0.58, 0.62),
                     (FACE_Z - 0.34, FACE_Z), M["SOFTM"])
                dbox(f"{tag}-perch-bracket", cx, side, (-0.03, 0.03), (PLINTH_H, 0.58),
                     (FACE_Z - 0.175, FACE_Z), M["TRIM"])
                dbox(f"{tag}-perch-loop", cx, side, (-0.21, 0.21), (1.36, 1.4),
                     (FACE_Z - 0.06, FACE_Z), M["TRIM"])
                continue
            if side > 0 and n == MANIFEST_BAY:
                for k in range(2):
                    shut_drawer(M, tag, cx, side, k)
                dbox(f"{tag}-board", cx, side, (-0.44, 0.44), (0.95, 1.9),
                     (FACE_Z - 0.01, CARCASS_Z), M["FOIL"])
                dbox(f"{tag}-glow", cx, side, (-0.4, 0.4), (1.0, 1.85),
                     (FACE_Z - 0.0115, FACE_Z - 0.01), M["SCREENGLOW"])
                dbox(f"{tag}-board-lip", cx, side, (-0.44, 0.44), (0.925, 0.95),
                     (FACE_Z - 0.035, FACE_Z), M["TRIM"])
                continue
            for k in range(DRAWERS):
                shut_drawer(M, tag, cx, side, k)

    # --- The tote: warm, out of place, standing on bay p2's ridden-out
    # drawer. (It was declared at bay 1 - a SHUT bay - and floated in
    # mid-air over the aisle; found during the walkability redesign.)
    top = drawer_y(2)[1]
    dbox("tote", BAY_CENTRES[2], -1, (-0.24, 0.12), (top, top + 0.24), (0.44, 0.80), M["FOIL"])

    # --- Eight fittings on the bay pitch. The entire rig.
    for n, cx in enumerate(BAY_CENTRES):
        gbox(f"lh-{n}", (cx - 0.34, cx + 0.34), (2.395, CEILING_Y), (-0.15, 0.15), M["TRIM"])
        gbox(f"lamp-{n}", (cx - 0.3, cx + 0.3), (2.36, 2.395), (-0.11, 0.11), M["DIFF"])

    # --- The pressure walls behind the banks, with the rust datum crossing
    # them at 1.10 - seen only through the 40 mm gaps between bays. Above the
    # rack tops, the crown band with its backing.
    for side, stag in ((-1, "p"), (1, "s")):
        z_wall = side * HALF_Z
        z_out = side * (HALF_Z + THICK)
        lo, hi = min(z_wall, z_out), max(z_wall, z_out)
        gbox(f"back-{stag}-lo", (-HALF_X - THICK, HALF_X + THICK),
             (FLOOR_Y, DATUM_Y - DATUM_T / 2), (lo, hi), M["JAMB"])
        gbox(f"back-{stag}-datum", (-HALF_X - THICK, HALF_X + THICK),
             (DATUM_Y - DATUM_T / 2, DATUM_Y + DATUM_T / 2), (lo, hi), M["RUST"])
        gbox(f"back-{stag}-hi", (-HALF_X - THICK, HALF_X + THICK),
             (DATUM_Y + DATUM_T / 2, RACK_TOP), (lo, hi), M["JAMB"])
        # The crown, proud with its shared backing plane.
        zc = side * (HALF_Z - CROWN_RELIEF)
        clo, chi = min(zc, z_out), max(zc, z_out)
        gbox(f"crown-{stag}", (-HALF_X - THICK, HALF_X + THICK),
             (RACK_TOP, CEILING_Y), (clo, chi), M["CROWN"])

    # --- End walls with their doorways, deck and ceiling.
    for side, stag in ((1, "fore"), (-1, "aft")):
        plane = side * HALF_X
        outer = side * (HALF_X + THICK)
        lo, hi = min(plane - side * 0.006, outer), max(plane - side * 0.006, outer)
        gbox(f"w-{stag}", (lo, hi), (FLOOR_Y, CEILING_Y),
             (-HALF_Z - THICK, HALF_Z + THICK), M["END"])
    backing = [o for o in bpy.data.objects if o.name.startswith("w-")]
    cutters = [
        gbox("c-fore", (HALF_X - 0.5, HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), M["JAMB"]),
        gbox("c-aft", (-HALF_X - 0.5, -HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), M["JAMB"]),
    ]
    for w in backing:
        boolean_diff(w, cutters)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    gbox("cap-fore", (HALF_X + 0.04, HALF_X + 0.12), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-fore", (HALF_X + 0.015, HALF_X + 0.020), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])
    gbox("cap-aft", (-HALF_X - 0.12, -HALF_X - 0.04), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("sky-aft", (-HALF_X - 0.020, -HALF_X - 0.015), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])

    # The deck in plates on the bay pitch over a darker slab, and the ceiling
    # held between the two crown trunkings.
    gbox("deck-slab", (-HALF_X, HALF_X), (-THICK, FLOOR_Y - 0.014),
         (-HALF_Z - THICK, HALF_Z + THICK), M["TRIM"])
    for i in range(BAYS):
        x0 = -HALF_X + i * BAY_M + 0.004
        x1 = -HALF_X + (i + 1) * BAY_M - 0.004
        for j, (z0, z1) in enumerate(((-HALF_Z - THICK, -0.004), (0.004, HALF_Z + THICK))):
            gbox(f"deck-{i}-{j}", (x0, x1), (FLOOR_Y - 0.014, FLOOR_Y), (z0, z1), M["DECK"])
    gbox("ceiling", (-HALF_X, HALF_X), (CEILING_Y, CEILING_Y + THICK),
         (-HALF_Z - THICK, HALF_Z + THICK), M["CROWN"])


def inside_vessel(p):
    """p is a BLENDER point. The open volume is the aisle plus the mouths of
    the four open bays - the shut banks are solid."""
    gx, gy, gz = p.x, p.z, -p.y
    if not FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01:
        return False
    if abs(gx) > HALF_X - 0.01:
        return False
    if abs(gz) < AISLE_HALF - 0.01:
        return True
    # Inside an open bay's cavity, up to its back.
    for n, cx in enumerate(BAY_CENTRES):
        for side, opens in ((-1, PORT_OPEN), (1, STARBOARD_OPEN)):
            if n not in opens:
                continue
            if abs(gx - cx) < BAY_W / 2 - 0.04 and PLINTH_H + 0.01 < gy < RACK_TOP - 0.01:
                d = gz * side
                if CARCASS_Z + 0.01 < d < CAVITY_BACK_Z - 0.01:
                    return True
    return False


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    M["SOFTM"] = newmat("SOFT", (0.06050, 0.10220, 0.14830), 0.92)
    build_room(M)
    bevel_everything()
    produce("RACKS", "racks", inside_vessel, ATLAS, BAKE_SAMPLES, "build_racks")


if __name__ == "__main__":
    main()
