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
reviewer can check the model against the room it claims to be. It also means
the other twelve rooms are a copy of this file with a different plan block,
rather than twelve modelling sessions.

THE FOUR THINGS THIS FILE KNOWS THAT ARE NOT OBVIOUS:

1. Coordinates. The game is Y-up; Blender is Z-up. g2b() maps one to the
   other and the glTF exporter's export_yup undoes it exactly, so the .glb
   comes out in the game's own coordinates and nothing has to be rotated at
   load. Verified by reading the accessor bounds out of the .glb.

2. The lightmap carries LIGHT ONLY. The bake is a DIFFUSE pass with direct
   and indirect on and colour OFF, so albedo stays in the material and the
   map is irradiance. That is precisely what a three.js MeshBasicMaterial
   wants in its lightMap slot, which is why the runtime needed no change.

3. Emitters bake black. A DIFFUSE pass records light ARRIVING at a surface,
   and a lamp's own emission is not light arriving at the lamp. The diffuser
   panels and the readouts are therefore listed in SELF_LIT and drawn unlit
   at their emitted colour by the runtime.

4. Faces nothing can see are deleted before unwrapping. Half the first bake's
   atlas went on the outsides of the wall shells. The test is not "which way
   does this face point" - that cannot tell a door reveal from the back of the
   wall it is cut into - but "can a ray leaving this face reach open room".
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

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
LIGHT_RANGE = 2.2          # must match src/env/plotBlender/index.ts
LIGHT_FLOOR = 0.05         # nothing is allowed to reach zero; pure black is banned

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "blender")

# ------------------------------------------------------------------ helpers

BOX_FACES = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]


def g2b(p):
    """GAME (x right, y up, z depth) -> BLENDER (z up). export_yup undoes it."""
    gx, gy, gz = p
    return (gx, -gz, gy)


def _fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def gbox(name, gx, gy, gz, mat=None):
    """An axis-aligned box given as three (min, max) ranges in GAME space."""
    x0, x1 = gx
    y0, y1 = gy
    z0, z1 = gz
    vg = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    me = bpy.data.meshes.new(name)
    me.from_pydata([g2b(v) for v in vg], [], BOX_FACES)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        me.materials.append(mat)
    _fix_normals(ob)
    return ob


def cylinder(name, r, gz0, gz1, gx, gy, segs=16):
    """A cylinder whose axis runs along GAME z, spanning gz0..gz1."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segs, radius=r, depth=(gz1 - gz0),
        location=g2b((gx, gy, (gz0 + gz1) / 2)), rotation=(math.radians(90), 0, 0),
    )
    ob = bpy.context.active_object
    ob.name = name
    return ob


def newmat(name, rgb, rough=0.72, metal=0.0, emit=None, strength=0.0, bump=0.0,
           bump_scale=90.0, bump_detail=2.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        for key in ("Emission Color", "Emission"):
            if key in b.inputs:
                b.inputs[key].default_value = (*emit, 1.0)
                break
        b.inputs["Emission Strength"].default_value = strength
    if bump > 0.0:
        # Micro-relief. It costs nothing at runtime because it ends up as
        # gradient in the lightmap rather than as a normal map.
        #
        # KEEP THE DETAIL LOW. A lightmap texel here covers a centimetre or so
        # of wall, so noise finer than that cannot be resolved and lands as
        # speckle instead of surface - which reads as a dirty render rather
        # than as texture, and is indistinguishable at a glance from Cycles
        # sampling noise. Detail 6 produced exactly that.
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.location = (-700, -200)
        noise.inputs["Scale"].default_value = bump_scale
        noise.inputs["Detail"].default_value = bump_detail
        bump_node = nt.nodes.new("ShaderNodeBump")
        bump_node.location = (-420, -200)
        bump_node.inputs["Strength"].default_value = bump
        bump_node.inputs["Distance"].default_value = 0.004
        nt.links.new(noise.outputs["Fac"], bump_node.inputs["Height"])
        nt.links.new(bump_node.outputs["Normal"], b.inputs["Normal"])
    return m


def boolean_diff(target, cutters):
    for c in cutters:
        md = target.modifiers.new("cut", "BOOLEAN")
        md.operation = "DIFFERENCE"
        md.solver = "EXACT"
        md.object = c
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=md.name)


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
        # The readouts are dark faces carrying light rows, as in src/env/plot -
        # a blank mint rectangle is a lamp, not an instrument.
        "SCREENBG": newmat("SCREENBG", C["SCREENBG"], 0.24,
                           emit=C["SCREENBG"], strength=1.2),
        "SCREEN": newmat("SCREEN", C["MINT"], 0.30, emit=C["MINT"], strength=3.0),
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

    # Doorways and porthole bores, cut from the backing only.
    #
    # EVERY CUTTER CARRIES A MATERIAL. A boolean gives the faces it creates the
    # cutter's own material slot, so a cutter with none leaves the door reveals
    # and the bore walls - 408 faces, all of them things you look straight at -
    # on a null slot: no bake target, and an untextured surface at runtime.
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
    # A boolean hands the faces it creates the cutter's material slot, so a
    # bare cutter leaves the collar's inner wall and the throat - the two
    # surfaces a porthole close-up is mostly made of - on a null slot.
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
    for i in range(3):
        x_right = DESK_X1 - margin - (face_w + gap) * i
        gbox(f"bezel{i}", (x_right - face_w - 0.020, x_right + 0.020),
             (face_v - 0.020, face_v + face_h + 0.020), (1.524, 1.541), M["TRIM"])
        gbox(f"screen{i}", (x_right - face_w, x_right), (face_v, face_v + face_h),
             (1.516, 1.525), M["SCREENBG"])
        # Rows of figures, as geometry. Deterministic widths from a fixed
        # integer hash: the room must bake and render identically every run,
        # so nothing here may be random.
        rows = 9
        row_h = (face_h - 0.020) / rows
        for r in range(rows):
            seed = (i * 37 + r * 101) % 89
            width = (face_w - 0.030) * (0.28 + 0.62 * ((seed % 17) / 17.0))
            y0 = face_v + 0.010 + r * row_h
            gbox(f"row{i}-{r}", (x_right - face_w + 0.015, x_right - face_w + 0.015 + width),
                 (y0, y0 + row_h * 0.52), (1.512, 1.517), M["SCREEN"])
        for k in range(7):
            bx = x_right - face_w + 0.03 + k * ((face_w - 0.06) / 7)
            gbox(f"chip{i}-{k}", (bx, bx + 0.028), (face_v - 0.062, face_v - 0.038),
                 (1.524, 1.534), M["FOIL"])

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


def bevel_everything(width=0.005):
    for ob in bpy.data.objects:
        if ob.type != "MESH" or ob.name.startswith("sky"):
            continue
        md = ob.modifiers.new("bevel", "BEVEL")
        md.width = width
        md.segments = 2
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(40)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=md.name)


# --------------------------------------------------------------- visibility

def inside_vessel(p):
    """p is a BLENDER point. True if it is in the room's open volume."""
    gx, gy, gz = p.x, p.z, -p.y
    return (abs(gx) < HALF_X - 0.01 and abs(gz) < HALF_Z - 0.01
            and FLOOR_Y + 0.01 < gy < CEILING_Y - 0.01)


def _hemisphere(rays):
    """A fixed spread about +z. Deterministic, so two runs bake one room."""
    out = [Vector((0.0, 0.0, 1.0))]          # straight out first: the cheap hit
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(rays):
        z = 1.0 - (i + 0.5) / rays
        r = math.sqrt(max(0.0, 1.0 - z * z))
        a = golden * i
        out.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    return out


def _face_samples(f, spacing=0.05, cap=160):
    """
    Points spread over a face, not just its centre.

    Judging a face by its centroid alone is what put holes to space in this
    room: the ledge where the kick band steps out to the work band is one quad
    0.36 m deep, of which only the first 0.14 m is in the room. Its centroid
    sits buried inside the wall with the work band directly above it, so every
    ray from that one point is blocked and a plainly visible ledge is called
    hidden. Sampling the face instead of the point fixes the whole class.
    """
    verts = [v.co for v in f.verts]
    centre = f.calc_center_median()
    pts = [centre]
    # pulled in slightly so a sample never sits exactly on a shared edge
    pts.extend(centre + (v - centre) * 0.82 for v in verts)
    for i, v in enumerate(verts):
        w = verts[(i + 1) % len(verts)]
        mid = (v + w) * 0.5
        pts.append(centre + (mid - centre) * 0.82)
    area = f.calc_area()
    if area > spacing * spacing * 4 and len(verts) >= 3:
        n = min(cap, max(2, int(math.sqrt(area) / spacing)))
        v0 = verts[0]
        for tri in range(1, len(verts) - 1):
            e1, e2 = verts[tri] - v0, verts[tri + 1] - v0
            for a in range(n):
                for b in range(n - a):
                    u = (a + 0.33) / n
                    v = (b + 0.33) / n
                    if u + v < 1.0:
                        pts.append(v0 + e1 * u + e2 * v)
    return pts


def find_hidden(room, rays=48, reach=0.6):
    """
    Which faces can no point in the room see?

    A face is VISIBLE if some sample on it has some direction in its own
    hemisphere that travels `reach` metres without hitting anything and ends
    inside the vessel. That separates the three cases a normal-direction rule
    cannot tell apart: the room side of a wall (visible), the back of the same
    wall - rays escape but end outside the vessel - and a face sealed in a
    cavity between two boxes, where every ray hits something.

    Nothing is deleted on the strength of this. See collapse_hidden_uvs.
    """
    bm = bmesh.new()
    bm.from_mesh(room.data)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)
    dirs = _hemisphere(rays)

    hidden = set()
    for f in bm.faces:
        n = f.normal
        if n.length < 1e-9:
            continue
        up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
        t1 = n.cross(up).normalized()
        t2 = n.cross(t1)
        seen = False
        for p in _face_samples(f):
            origin = p + n * 0.0015
            for d in dirs:
                w = t1 * d.x + t2 * d.y + n * d.z
                if tree.ray_cast(origin, w, reach)[0] is None and inside_vessel(origin + w * reach):
                    seen = True
                    break
            if seen:
                break
        if not seen:
            hidden.add(f.index)

    bm.free()
    return hidden


# --------------------------------------------------------------------- bake

def unwrap(room, hidden):
    """
    Two UV sets: one for material tiling, one for the bake.

    THE HIDDEN FACES ARE KEPT AND GIVEN NO ATLAS. Deleting them is the obvious
    move and it is the wrong one: it puts the correctness of a heuristic
    between the player and open space, and when the heuristic is wrong the
    player sees through the wall. Parking their lightmap UVs on one reserved
    texel costs a little geometry and nothing else - the atlas is freed for
    the surfaces that are looked at, the room stays sealed, and a face this
    function wrongly calls hidden renders a shade too dark instead of
    becoming a hole to space. Half of the first bake's atlas went on the
    outsides of the wall shells, so the reclaim is most of the resolution.
    """
    me = room.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    me.uv_layers.new(name="Lightmap")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    me.uv_layers.active_index = 0
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    # unwrap the VISIBLE faces only, so the packer has only them to place
    for p in me.polygons:
        p.select = p.index not in hidden
    me.uv_layers.active_index = 1
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="FACE")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.010)
    bpy.ops.uv.pack_islands(margin=0.010, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    # and park the rest on one reserved texel in the corner
    uv = me.uv_layers["Lightmap"].data
    for p in me.polygons:
        if p.index in hidden:
            for li in range(p.loop_start, p.loop_start + p.loop_total):
                uv[li].uv = (0.997, 0.997)


def check_slots(room):
    """
    Refuse to bake a room with a slot that has no material.

    Blender says "No active image found in material slot (N)" and carries on,
    which is a warning in a wall of warnings; the result is a patch of the room
    with no bake and no albedo. Counting the faces on each slot turns that into
    a number and a stop.
    """
    used = set(p.material_index for p in room.data.polygons)
    empty = [i for i in used if room.material_slots[i].material is None]
    if empty:
        counts = {i: sum(1 for p in room.data.polygons if p.material_index == i) for i in empty}
        raise RuntimeError(f"material slots with no material carry faces: {counts}")


def bake(room):
    check_slots(room)
    img = bpy.data.images.new("PLOT_lightmap", ATLAS, ATLAS, float_buffer=True, alpha=False)
    img.colorspace_settings.name = "Non-Color"

    # EVERY slot needs the target as its active image node, including any that
    # came in without a node tree - a slot missed here bakes as a black patch.
    for slot in room.material_slots:
        m = slot.material
        if m is None:
            continue
        if not m.use_nodes:
            m.use_nodes = True
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        node.select = True
        node.location = (-900, 400)
        m.node_tree.nodes.active = node

    me = room.data
    me.uv_layers.active = me.uv_layers["Lightmap"]
    me.uv_layers["Lightmap"].active_render = True

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.bake_type = "DIFFUSE"
    sc.cycles.samples = BAKE_SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.005
    sc.cycles.adaptive_min_samples = 64
    b = sc.render.bake
    b.use_pass_direct = True
    b.use_pass_indirect = True
    b.use_pass_color = False
    b.use_selected_to_active = False
    b.margin = 16

    bpy.ops.object.select_all(action="DESELECT")
    room.select_set(True)
    bpy.context.view_layer.objects.active = room
    bpy.ops.object.bake(type="DIFFUSE")

    for slot in room.material_slots:
        m = slot.material
        if m is None or not m.use_nodes:
            continue
        for n in [n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"]:
            m.node_tree.nodes.remove(n)
    return img


def write_lightmap(img):
    import numpy as np
    buf = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(buf)
    rgba = buf.reshape(-1, 4)
    clipped = float((rgba[:, :3] > LIGHT_RANGE).mean())
    # A floor, then the range the 8 bits are spread over. The floor is not
    # cosmetic: pure black is banned project-wide, and an unlit throat that
    # reaches zero puts (0,0,0) on screen.
    lit = np.clip(rgba[:, :3] / LIGHT_RANGE, 0.0, 1.0)
    lit = np.maximum(lit, LIGHT_FLOOR / LIGHT_RANGE)
    rgba[:, :3] = lit
    rgba[:, 3] = 1.0
    img.pixels.foreach_set(rgba.reshape(-1))
    os.makedirs(OUT, exist_ok=True)
    img.filepath_raw = os.path.join(OUT, "plot-lightmap.png")
    img.file_format = "PNG"
    img.save()
    return clipped


def export(room):
    bpy.ops.object.select_all(action="DESELECT")
    room.select_set(True)
    bpy.context.view_layer.objects.active = room
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, "plot.glb"),
        export_format="GLB", use_selection=True,
        export_texcoords=True, export_normals=True,
        export_yup=True, export_apply=True, export_materials="EXPORT",
    )


def world():
    w = bpy.data.worlds.new("space")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*COLOURS["VOID"], 1.0)
    bg.inputs["Strength"].default_value = 0.35


def join_room():
    bpy.ops.object.select_all(action="DESELECT")
    anchor = None
    for ob in list(bpy.data.objects):
        if ob.type != "MESH" or ob.name.startswith("sky"):
            continue
        ob.select_set(True)
        if anchor is None or ob.name == "ceiling":
            anchor = ob
    bpy.context.view_layer.objects.active = anchor
    bpy.ops.object.join()
    room = bpy.context.view_layer.objects.active
    room.name = "PLOT"
    return room


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6
    world()

    M = materials()
    build_room(M)
    bevel_everything()
    room = join_room()

    total = len(room.data.polygons)
    hidden = find_hidden(room)
    unwrap(room, hidden)
    img = bake(room)
    clipped = write_lightmap(img)
    export(room)

    share = 100.0 * len(hidden) / max(1, total)
    print(f"[build_plot] {total} faces, {len(hidden)} hidden ({share:.1f}%) - kept, no atlas")
    print(f"[build_plot] clipped above LIGHT_RANGE: {clipped * 100:.2f}%")
    print(f"[build_plot] wrote {OUT}")


if __name__ == "__main__":
    main()
