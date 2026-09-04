"""
Build THE PLOT in Blender, light it with Cycles, bake it, and export it.

Run inside Blender (headless is fine and is how it is driven):

    blender --background --python tools/blender/build_plot.py

or exec it into a live session. It writes public/blender/plot.glb and
public/blender/plot-lightmap.png, which src/env/plotBlender consumes.

WHY THIS IS A SCRIPT AND NOT A .BLEND. The room's plan - the vessel, the
console's numbers, the porthole bores, the band reliefs - is already stated
once in src/env/plot and in src/env/kit/bands. A .blend would restate all of
it in a place no test can read and no diff can review, and the two would
drift. Here the plan is at the top of the file in the same units, so a
reviewer can check the model against the room it claims to be. Everything
that is not this room's plan lives in roomlib.py and is shared with every
other Blender-built room.
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, cylinder, fresh_scene, g2b, gbox, newmat,
    produce, world,
)

# --------------------------------------------------------------------- plan
# Every number here is copied from src/env/plot/index.ts and src/env/kit/
# bands.ts. If one changes there, change it here; they describe one room.

HALF_X, HALF_Z = 2.3, 1.7
FLOOR_Y, CEILING_Y = 0.0, 2.85
KICK_TOP, WORK_TOP = 0.95, 2.05          # bands.ts KICK_TOP_M / WORK_TOP_M
SEAM_W, SEAM_H = 1.18, 2.06              # station/ports.ts SEAM
SETBACK = 0.086                          # deepestRelief 0.08 + SEAM_INSET_M 0.006
# Shell depth. Nothing ever sees the back of a wall, so this only has to be
# thick enough to seal - and it must be THIN, because the porthole bore is cut
# through it and every millimetre of bore is a millimetre of tube standing
# between the eye and Earth. At 0.30 the bore plus the throat sleeve came to
# 0.46 m and the limb was occluded from half a metre away, which the flatness
# gate caught as a frame whose brightest pixel was 96. The room's deep-frame
# look comes from the collar standing proud INTO the room, as in src/env/plot,
# not from the wall's thickness.
THICK = 0.10
PORT_PLANE = -HALF_Z + SETBACK

DESK_X0, DESK_X1 = -1.75, 0.35
DESK_BACK_Z, DESK_FRONT_Z = 1.68, 1.16
DESK_TOP_Y, BANK_TOP_Y = 1.03, 2.05
SLOT_Z, SLOT_Y0, SLOT_Y1 = 1.48, 1.15, 1.29

PORT_R, PORT_Y = 0.25, 1.55
COLLAR_DEPTH, COLLAR_RIM = 0.16, 0.035
PORTHOLE_X = (-1.62, 1.18)
WORK_FACE = PORT_PLANE - 0.08            # the recessed face the collars mount on

# The three strip diffusers, as rectangles, from plotLamps() in src/env/plot.
LAMPS = [
    ("station", -1.60, 0.20, 0.90, 1.24, 2.71),
    ("walk", 0.90, 2.00, -0.40, -0.10, 2.73),
    ("spur", -0.85, 0.05, -1.20, -1.00, 2.75),
]

# Linear RGB, computed from src/render/palette.ts through the same THREE.Color
# mixes src/env/plot uses, so the two rooms are the same colours exactly.
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
    "THROAT": (0.07200, 0.06600, 0.05900),
    "DIFFUSER": (0.69824, 0.60520, 0.44724),
    "MINT": (0.56471, 0.71569, 0.60383),
    "VOID": (0.00518, 0.01096, 0.01938),
    # The readout ground: VOID_SLATE lifted toward HULL_SHADOW, the value the
    # hand-built room's screens sit at behind their rows.
    "SCREENBG": (0.02400, 0.03600, 0.05400),
    "FILL": (0.18080, 0.26130, 0.33120),
}

ATLAS = 2048
# Baking does not use the render denoiser in this Blender, so the only lever
# on sampling noise is samples. Adaptive sampling spends them where the noise
# actually is, which in a room lit by three soft area sources is the crown and
# the corners rather than the lit walls.
BAKE_SAMPLES = 1024


# ----------------------------------------------------------------- the room

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
        "THROAT": newmat("THROAT", C["THROAT"], 0.82),
        "DIFF": newmat("DIFF", C["DIFFUSER"], 0.40, emit=C["DIFFUSER"], strength=13.0),
        # The readouts' light source for the bake. The runtime hides this plate
        # behind its own dark screen plate and draws the instrument content
        # itself, so the material's job is purely irradiance: mint, at about
        # what the old emissive rows and backing plate summed to.
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=C["MINT"], strength=0.9),
        "FILL": newmat("FILL", C["FILL"], 0.50, emit=C["FILL"], strength=3.0),
    }


def wall(M, side, axis, plane, inward, work_mat, doors):
    """Banded backing, then liner panels standing proud with real gaps."""
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
    n = 6 if axis == "x" else 8
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
    wall(M, "fore", "x", HALF_X, -1, "END", [(-SEAM_W / 2 - 0.06, SEAM_W / 2 + 0.06)])
    wall(M, "aft", "x", -HALF_X, +1, "END", [(0.55 - SEAM_W / 2 - 0.06, 0.55 + SEAM_W / 2 + 0.06)])
    wall(M, "stbd", "z", HALF_Z, -1, "LINER", [(-2.4, 0.6)])
    wall(M, "port", "z", PORT_PLANE, +1, "LINER",
         [(-0.4 - SEAM_W / 2 - 0.06, -0.4 + SEAM_W / 2 + 0.06), (-1.93, -1.31), (0.87, 1.49)])

    gbox("deck-slab", (-HALF_X, HALF_X), (-THICK, FLOOR_Y - 0.014), (-HALF_Z, HALF_Z), M["TRIM"])
    nx, nz = 6, 4
    for i in range(nx):
        for j in range(nz):
            a = -HALF_X + (2 * HALF_X / nx) * i + 0.004
            b = -HALF_X + (2 * HALF_X / nx) * (i + 1) - 0.004
            c = -HALF_Z + (2 * HALF_Z / nz) * j + 0.004
            d = -HALF_Z + (2 * HALF_Z / nz) * (j + 1) - 0.004
            gbox(f"deck-{i}-{j}", (a, b), (FLOOR_Y - 0.014, FLOOR_Y), (c, d), M["DECK"])
    gbox("ceiling", (-HALF_X, HALF_X), (CEILING_Y, CEILING_Y + THICK), (-HALF_Z, HALF_Z), M["CROWN"])

    # Doorways and porthole bores, cut from the backing only. Every cutter
    # carries a material; see roomlib.boolean_diff.
    backing = [o for o in bpy.data.objects if o.name.startswith("w-")]
    reveal = M["JAMB"]
    cutters = [
        gbox("c-fore", (HALF_X - 0.5, HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (-SEAM_W / 2, SEAM_W / 2), reveal),
        gbox("c-aft", (-HALF_X - 0.5, -HALF_X + 0.5), (FLOOR_Y, SEAM_H),
             (0.55 - SEAM_W / 2, 0.55 + SEAM_W / 2), reveal),
        gbox("c-port", (-0.4 - SEAM_W / 2, -0.4 + SEAM_W / 2), (FLOOR_Y, SEAM_H),
             (PORT_PLANE - 0.5, PORT_PLANE + 0.5), reveal),
    ]
    for i, px in enumerate(PORTHOLE_X):
        bore = cylinder(f"c-bore{i}", PORT_R, PORT_PLANE - THICK - 0.10, WORK_FACE + 0.05, px, PORT_Y)
        bore.data.materials.append(reveal)
        cutters.append(bore)
    for w in backing:
        boolean_diff(w, cutters)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)

    # a doorway that leads nowhere is closed, not a hole onto space
    gbox("cap-fore", (HALF_X - 0.02, HALF_X + 0.10), (FLOOR_Y, SEAM_H),
         (-SEAM_W / 2 - 0.03, SEAM_W / 2 + 0.03), M["END"])
    gbox("cap-aft", (-HALF_X - 0.10, -HALF_X + 0.02), (FLOOR_Y, SEAM_H),
         (0.55 - SEAM_W / 2 - 0.03, 0.55 + SEAM_W / 2 + 0.03), M["END"])
    gbox("cap-port", (-0.4 - SEAM_W / 2 - 0.03, -0.4 + SEAM_W / 2 + 0.03), (FLOOR_Y, SEAM_H),
         (PORT_PLANE - 0.10, PORT_PLANE + 0.02), M["END"])

    # Both the target AND the cutter get their material BEFORE the boolean.
    for i, px in enumerate(PORTHOLE_X):
        outer = cylinder(f"collar{i}", PORT_R + COLLAR_RIM, WORK_FACE, WORK_FACE + COLLAR_DEPTH, px, PORT_Y)
        outer.data.materials.append(M["FOIL"])
        inner = cylinder(f"collar{i}-in", PORT_R, WORK_FACE - 0.02, WORK_FACE + COLLAR_DEPTH + 0.02, px, PORT_Y)
        inner.data.materials.append(M["FOIL"])
        boolean_diff(outer, [inner])
        bpy.data.objects.remove(inner, do_unlink=True)

        # No sleeve behind the glass. The pane sits at the wall face, exactly
        # as in src/env/plot, and space is painted there; a tube behind it
        # would be drawn over the painted space and hide the limb.
        #
        # The pane's own glow, for the bake only: it is what the room's
        # porthole fill light comes from, and it is not exported - the runtime
        # paints the real Earth through this hole.
        bpy.ops.mesh.primitive_circle_add(
            vertices=24, radius=PORT_R * 0.98, fill_type="NGON",
            location=g2b((px, PORT_Y, PORT_PLANE - THICK - 0.005)),
            rotation=(math.radians(90), 0, 0),
        )
        disc = bpy.context.active_object
        disc.name = f"sky{i}"
        disc.data.materials.append(M["FILL"])

    fit_out(M)


def fit_out(M):
    gbox("desk-plinth", (DESK_X0 + 0.06, DESK_X1 - 0.06), (0.02, DESK_TOP_Y - 0.06),
         (DESK_FRONT_Z + 0.10, DESK_BACK_Z), M["TRIM"])
    gbox("desk-toe", (DESK_X0 + 0.06, DESK_X1 - 0.06), (0.0, 0.02),
         (DESK_FRONT_Z + 0.18, DESK_BACK_Z), M["JAMB"])
    gbox("desk-top", (DESK_X0, DESK_X1), (DESK_TOP_Y - 0.055, DESK_TOP_Y),
         (DESK_FRONT_Z, DESK_BACK_Z), M["FOIL"])
    gbox("desk-nose", (DESK_X0, DESK_X1), (DESK_TOP_Y - 0.075, DESK_TOP_Y - 0.055),
         (DESK_FRONT_Z + 0.01, DESK_FRONT_Z + 0.03), M["TRIM"])
    gbox("bank", (DESK_X0, DESK_X1), (DESK_TOP_Y, BANK_TOP_Y), (1.54, HALF_Z), M["LINER"])
    gbox("bank-brow", (DESK_X0 - 0.04, DESK_X1 + 0.04), (BANK_TOP_Y, BANK_TOP_Y + 0.075),
         (1.46, HALF_Z), M["TRIM"])
    gbox("bank-cheekL", (DESK_X0 - 0.04, DESK_X0), (DESK_TOP_Y, BANK_TOP_Y), (1.50, HALF_Z), M["TRIM"])
    gbox("bank-cheekR", (DESK_X1, DESK_X1 + 0.04), (DESK_TOP_Y, BANK_TOP_Y), (1.50, HALF_Z), M["TRIM"])

    bank_w = DESK_X1 - DESK_X0
    margin, gap = bank_w * 0.05, bank_w * 0.035
    head_y0 = SLOT_Y1
    head_h = BANK_TOP_Y - head_y0
    face_h = head_h * 0.58
    face_v = head_y0 + head_h * 0.14
    face_w = (bank_w - margin * 2 - gap * 2) / 3
    # The screens' CONTENT is not modelled here any more. The runtime lays the
    # same procedural instrument geometry the hand-built room uses (text rows,
    # trace, bar graph from src/env/kit/instruments) proud of the bank face, so
    # both rooms carry identical drawn content and neither can drift. What this
    # model still owes the bake is the screens' LIGHT: a thin plate per face,
    # emissive at roughly what the old rows and plate emitted together, tucked
    # 1.5 mm off the bank so the runtime plate (6 mm proud) hides it exactly.
    for i in range(3):
        x_right = DESK_X1 - margin - (face_w + gap) * i
        gbox(f"glowplate{i}", (x_right - face_w, x_right), (face_v, face_v + face_h),
             (1.5385, 1.5405), M["SCREENGLOW"])
        for k in range(7):
            bx = x_right - face_w + 0.03 + k * ((face_w - 0.06) / 7)
            gbox(f"chip{i}-{k}", (bx, bx + 0.028), (face_v - 0.062, face_v - 0.038),
                 (1.5295, 1.5405), M["FOIL"])

    gbox("slot-recess", (-0.99, -0.69), (SLOT_Y0, SLOT_Y1), (SLOT_Z, 1.55), M["JAMB"])
    gbox("slot-lip", (-1.03, -0.65), (SLOT_Y0 - 0.040, SLOT_Y0), (SLOT_Z - 0.06, 1.55), M["FOIL"])
    gbox("slot-hood", (-1.03, -0.65), (SLOT_Y1, SLOT_Y1 + 0.022), (SLOT_Z - 0.04, 1.55), M["TRIM"])
    gbox("keys", (-1.30, -0.42), (DESK_TOP_Y, DESK_TOP_Y + 0.022), (1.24, 1.44), M["TRIM"])

    gbox("perch", (-1.30, -0.40), (0.62, 0.70), (0.55, 0.85), M["TRIM"])
    gbox("perch-postL", (-1.26, -1.20), (0.0, 0.62), (0.66, 0.74), M["TRIM"])
    gbox("perch-postR", (-0.50, -0.44), (0.0, 0.62), (0.66, 0.74), M["TRIM"])
    gbox("drawer", (-0.55, -0.05), (0.55, 0.85), (0.95, 1.20), M["FOIL"])
    gbox("drawer-pull", (-0.44, -0.16), (0.72, 0.76), (0.92, 0.96), M["TRIM"])
    gbox("stand-plate", (-1.35, -0.35), (FLOOR_Y, FLOOR_Y + 0.006), (0.55, 1.05), M["FOIL"])
    gbox("datum", (-HALF_X + 0.1, HALF_X - 0.1), (KICK_TOP, KICK_TOP + 0.020),
         (HALF_Z - 0.081, HALF_Z - 0.074), M["RUST"])

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=0.022, depth=2.1,
        location=g2b((-0.70, 0.92, 1.09)), rotation=(0, math.radians(90), 0),
    )
    rail = bpy.context.active_object
    rail.name = "rail"
    rail.data.materials.append(M["FOIL"])

    for name, x0, x1, z0, z1, y in LAMPS:
        gbox(f"lh-{name}", (x0 - 0.055, x1 + 0.055), (y - 0.008, CEILING_Y),
             (z0 - 0.055, z1 + 0.055), M["TRIM"])
        gbox(f"lamp-{name}", (x0, x1), (y - 0.014, y), (z0, z1), M["DIFF"])


def inside_vessel(p):
    """p is a BLENDER point. True if it is in the room's open volume."""
    gx, gy, gz = p.x, p.z, -p.y
    return (abs(gx) < HALF_X - 0.01 and abs(gz) < HALF_Z - 0.01
            and FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01)


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("PLOT", "plot", inside_vessel, ATLAS, BAKE_SAMPLES, "build_plot")


if __name__ == "__main__":
    main()
