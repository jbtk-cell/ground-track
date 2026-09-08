"""
DECK PROSPECTS - structural prototypes for the station's redesign.

Owner direction, 2026-09-07: the generated deck was too cramped and too
uniform; rooms should be "actual star wars level big", and design should be
iterative - several models to review, not one shot. These are REVIEW MODELS:
plain Blender scenes rendered to stills, no bake, no export, no runtime.
Structure only - lighting is a neutral placeholder (cool key, warm
practicals), because the artstyle is a separate owner decision.

Five structural vocabularies, from the three named references:

  hexrun   SWTOR corridor: elongated-hex section, chamfered ribs, bay walls
  hall     the owner's reference image: canted piers, layered ceiling, dais
  hangar   monumental volume: gantry bridge, segmented end door, truss roof
  warren   STRAY: stacked dwellings, catwalks, cable trays, narrow alley
  service  ALIEN ISOLATION: low heavy beam grid, floor trench, bulkheads

Run one:    blender --background --python tools/blender/prospects.py -- hexrun
Or:         GT_PROTO=hall blender --background --python tools/blender/prospects.py
Writes prospects/<name>-{wide,eye,detail}.png (1280x720 Cycles stills).

The player's eye is 1.70 m; every dimension below is chosen against that.
"""
import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "prospects"))

EYE = 1.70

# ----------------------------------------------------------------- materials


def _mat(name, rgb, rough=0.7, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    else:
        # A whisper of self-emission on every clay surface: sealed interiors
        # get nothing from the world, and a surface at grazing angle to the
        # headlamp fill rendered pure black - unreadable for a structural
        # review. This is fake ambient, deliberately; the real lighting pass
        # comes after the structure is chosen.
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.05
    return m


def materials():
    return {
        # Clay values: bright enough that a headlamp fill makes every plane
        # legible, separated enough that floor, wall, ceiling and structure
        # never merge. This is a structural review, not a mood piece - the
        # concept frames carry the mood.
        "FLOOR": _mat("FLOOR", (0.330, 0.335, 0.350), 0.85),
        "WALK": _mat("WALK", (0.430, 0.435, 0.450), 0.75),
        "WALL": _mat("WALL", (0.500, 0.510, 0.530), 0.80),
        "PANEL": _mat("PANEL", (0.620, 0.630, 0.650), 0.70),
        "CEIL": _mat("CEIL", (0.240, 0.245, 0.260), 0.90),
        "STEEL": _mat("STEEL", (0.360, 0.375, 0.400), 0.45, metal=0.4),
        "DARKSTEEL": _mat("DARKSTEEL", (0.170, 0.180, 0.195), 0.55, metal=0.3),
        "GRATE": _mat("GRATE", (0.130, 0.135, 0.145), 0.80),
        "TRIM": _mat("TRIM", (0.680, 0.690, 0.710), 0.55),
        "WARM": _mat("WARM", (0.9, 0.82, 0.66), emit=(1.0, 0.88, 0.68), strength=14.0),
        "COOL": _mat("COOL", (0.75, 0.82, 0.92), emit=(0.78, 0.86, 1.0), strength=10.0),
    }


# ------------------------------------------------------------------ helpers


def tube(name, profile, y0, y1, mat):
    """An interior prism: `profile` is a closed 2D loop of (x, z) points,
    extruded from y0 to y1. One watertight shell instead of rotated slabs -
    the hexrun's first render leaked void at every shoulder joint."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    n = len(profile)
    verts = [(x, y0, z) for x, z in profile] + [(x, y1, z) for x, z in profile]
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    mesh.from_pydata(verts, [], faces)
    obj.data.materials.append(mat)
    return obj


def wedge(name, x, w, y_base, d, h, lean, mat):
    """A canted pier as a real prism: rectangular foot at the floor, the top
    face shifted `lean` metres inward (toward y=0). A rotated box detaches
    from both floor and header; a wedge meets both by construction."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    s = -1 if y_base > 0 else 1
    y0, y1 = y_base - d / 2, y_base + d / 2
    verts = [
        (x - w / 2, y0, 0), (x + w / 2, y0, 0), (x + w / 2, y1, 0), (x - w / 2, y1, 0),
        (x - w / 2, y0 + s * lean, h), (x + w / 2, y0 + s * lean, h),
        (x + w / 2, y1 + s * lean, h), (x - w / 2, y1 + s * lean, h),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh.from_pydata(verts, [], faces)
    obj.data.materials.append(mat)
    return obj


def box(name, xs, ys, zs, mat, bevel=0.0):
    x0, x1 = sorted(xs)
    y0, y1 = sorted(ys)
    z0, z1 = sorted(zs)
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    # size=1 cube spans one metre, so scale by the full extent - and set the
    # location only AFTER transform_apply: in this Blender, transform_apply
    # with scale=True also resets the object's location to the origin, which
    # once piled every box in the scene at (0,0,0).
    o.scale = ((x1 - x0), (y1 - y0), (z1 - z0))
    bpy.ops.object.transform_apply(scale=True)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.data.materials.append(mat)
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = 2
    return o


def hexport(name, y, width, height, depth, mat, cham=0.55):
    """A flat-top hexagonal doorway frame at wall plane y, opening along Y."""
    hw, hh = width / 2, height
    pts = [
        (-hw, 0.0),
        (-hw, hh - cham * hh * 0.35),
        (-hw + cham, hh),
        (hw - cham, hh),
        (hw, hh - cham * hh * 0.35),
        (hw, 0.0),
    ]
    for t, frame_mat in ((0.0, mat), (0.22, mat)):
        grown = 0.28 + t
        mesh = bpy.data.meshes.new(name + f"-f{t}")
        obj = bpy.data.objects.new(name + f"-f{t}", mesh)
        bpy.context.collection.objects.link(obj)
        verts, faces = [], []
        n = len(pts)
        for px, pz in pts:
            gx = px + (grown if px > 0 else -grown)
            gz = pz + (grown if pz > 0.1 else 0)
            for yy in (y - depth / 2 + t, y + depth / 2 - t):
                verts.append((px, yy, pz))
                verts.append((gx, yy, gz))
        for i in range(n - 1):
            a = i * 4
            b = (i + 1) * 4
            faces += [
                (a, a + 1, b + 1, b),
                (a + 2, b + 2, b + 3, a + 3),
                (a + 1, a + 3, b + 3, b + 1),
                (a, b, b + 2, a + 2),
            ]
        mesh.from_pydata(verts, [], faces)
        obj.data.materials.append(frame_mat)
    return None


def rib(name, y, half_w, height, depth, thick, mat, cant=0.0):
    """A chamfered structural rib across the section at Y=y (two posts + a
    header), optionally canted inward at the top."""
    box(f"{name}-l", (-half_w - thick, -half_w + cant), (y - depth / 2, y + depth / 2), (0, height), mat, bevel=0.05)
    box(f"{name}-r", (half_w - cant, half_w + thick), (y - depth / 2, y + depth / 2), (0, height), mat, bevel=0.05)
    box(f"{name}-t", (-half_w - thick, half_w + thick), (y - depth / 2, y + depth / 2), (height, height + thick * 1.6), mat, bevel=0.05)


def inset_panel(name, xs, y, zs, mat_outer, mat_inner, lift=0.03):
    """Wall bay decoration: an outer plate with a clipped-corner inner plate."""
    box(f"{name}-o", xs, (y, y + lift), zs, mat_outer, bevel=0.02)
    x0, x1 = sorted(xs)
    z0, z1 = sorted(zs)
    m = 0.14
    o = box(f"{name}-i", (x0 + m, x1 - m), (y, y + lift * 2), (z0 + m, z1 - m), mat_inner, bevel=0.04)
    return o


def catwalk(name, xs, ys, z, mats, rail_h=1.05):
    """A grated walkway with kick plates and twin rails on posts."""
    x0, x1 = sorted(xs)
    y0, y1 = sorted(ys)
    box(f"{name}-deck", xs, ys, (z - 0.06, z), mats["GRATE"])
    box(f"{name}-kickl", xs, (y0, y0 + 0.04), (z, z + 0.12), mats["STEEL"])
    box(f"{name}-kickr", xs, (y1 - 0.04, y1), (z, z + 0.12), mats["STEEL"])
    for yy, tag in ((y0 + 0.02, "l"), (y1 - 0.02, "r")):
        box(f"{name}-rail{tag}", xs, (yy - 0.02, yy + 0.02), (z + rail_h - 0.04, z + rail_h), mats["TRIM"])
        box(f"{name}-mid{tag}", xs, (yy - 0.015, yy + 0.015), (z + rail_h * 0.55, z + rail_h * 0.55 + 0.05), mats["TRIM"])
        n = max(2, int((x1 - x0) / 1.6))
        for i in range(n + 1):
            px = x0 + (x1 - x0) * i / n
            box(f"{name}-post{tag}{i}", (px - 0.025, px + 0.025), (yy - 0.02, yy + 0.02), (z, z + rail_h), mats["STEEL"])


def stair(name, x, y0, z0, z1, width, mats, along="y"):
    steps = max(3, int((z1 - z0) / 0.19))
    run = (z1 - z0) * 1.35
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        if along == "y":
            box(f"{name}-s{i}", (x - width / 2, x + width / 2), (y0 + run * t0, y0 + run * t1), (z0, z0 + (z1 - z0) * t1), mats["WALK"])
        else:
            box(f"{name}-s{i}", (x + run * t0, x + run * t1), (y0 - width / 2, y0 + width / 2), (z0, z0 + (z1 - z0) * t1), mats["WALK"])


def truss(name, xs, y, z, depth, mats, pitch=1.1):
    """A lattice truss run along X at height z."""
    x0, x1 = sorted(xs)
    box(f"{name}-top", xs, (y - 0.09, y + 0.09), (z + depth - 0.09, z + depth), mats["STEEL"])
    box(f"{name}-bot", xs, (y - 0.09, y + 0.09), (z, z + 0.09), mats["STEEL"])
    n = max(2, int((x1 - x0) / pitch))
    for i in range(n):
        px = x0 + (x1 - x0) * i / n
        qx = x0 + (x1 - x0) * (i + 1) / n
        # Oversized past both chords before the rotation, so the rotated
        # ends bury themselves instead of detaching in mid-air.
        d = box(f"{name}-d{i}", (px - 0.2, qx + 0.2), (y - 0.045, y + 0.045), (z - 0.15, z + depth + 0.15), mats["STEEL"])
        d.rotation_euler = (0, math.radians(32) * (1 if i % 2 == 0 else -1), 0)


def cable_tray(name, pts, z, mats, sag=0.35):
    """Hanging conduit bundles between points (list of (x, y))."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        length = math.hypot(x1 - x0, y1 - y0)
        for k, r in enumerate((0.035, 0.05, 0.028)):
            o = box(
                f"{name}-{i}-{k}",
                (mx - length / 2, mx + length / 2),
                (my - r + k * 0.09 - 0.09, my + r + k * 0.09 - 0.09),
                (z - sag - r, z - sag + r),
                mats["DARKSTEEL"],
                bevel=r * 0.8,
            )
            o.rotation_euler = (0, 0, math.atan2(y1 - y0, x1 - x0))


def lamp_strip(name, xs, ys, z, mats, warm=True, down=True):
    zt = (z - 0.03, z) if down else (z, z + 0.03)
    box(name, xs, ys, zt, mats["WARM" if warm else "COOL"])


def area_light(name, loc, size, power, cool=False):
    bpy.ops.object.light_add(type="AREA", location=loc)
    li = bpy.context.active_object
    li.name = name
    li.data.size = size
    li.data.energy = power
    li.data.color = (0.78, 0.85, 1.0) if cool else (1.0, 0.9, 0.74)
    return li


# --------------------------------------------------------------- prototypes


def build_hexrun(M):
    """SWTOR corridor: 30 m run, elongated-hex section 6.2 m wide, 5.6 m tall."""
    L, HW, H = 30.0, 3.1, 5.6
    cham = 1.35  # the 45-degree shoulder that makes the hex read
    # Floor with a raised centre walkway and grated gutters.
    box("floor", (-HW, HW), (0, L), (-0.3, 0.0), M["FLOOR"])
    box("walk", (-1.5, 1.5), (0, L), (0.0, 0.09), M["WALK"], bevel=0.02)
    box("gutl", (-HW + 0.55, -1.62), (0, L), (-0.02, 0.0), M["GRATE"])
    box("gutr", (1.62, HW - 0.55), (0, L), (-0.02, 0.0), M["GRATE"])
    # Hex shell: one watertight extruded profile - floor line, walls, canted
    # shoulders and ceiling in a single loop.
    tube(
        "shell",
        [
            (-HW, -0.1),
            (-HW, H - cham),
            (-HW + cham, H),
            (HW - cham, H),
            (HW, H - cham),
            (HW, -0.1),
        ],
        0,
        L,
        M["WALL"],
    )
    # The ceiling channel reads as two rails and a lit strip mounted under
    # the ceiling plane, so the shell stays sealed.
    box("chanraill", (-1.05, -0.9), (0, L), (H - 0.35, H - 0.02), M["CEIL"])
    box("chanrailr", (0.9, 1.05), (0, L), (H - 0.35, H - 0.02), M["CEIL"])
    for i in range(9):
        y = 1.8 + i * 3.2
        rib(f"rib{i}", y, HW, H - cham, 0.42, 0.34, M["STEEL"], cant=0.0)
        lamp_strip(f"riblampl{i}", (-HW + 0.1, -HW + 0.5), (y - 0.18, y + 0.18), H - cham - 0.05, M, warm=True)
        lamp_strip(f"riblampr{i}", (HW - 0.5, HW - 0.1), (y - 0.18, y + 0.18), H - cham - 0.05, M, warm=True)
    lamp_strip("chanstrip", (-0.35, 0.35), (0.5, L - 0.5), H - 0.04, M, warm=False)
    # Wall bays between ribs: nested inset panels, some recessed as niches.
    rng = random.Random(11)
    for i in range(9):
        y0 = 2.6 + i * 3.2
        for sgn, tag in ((-1, "l"), (1, "r")):
            if rng.random() < 0.28:
                box(f"niche{tag}{i}", (sgn * HW, sgn * (HW + 0.55)), (y0 - 0.9, y0 + 0.9), (0.25, 2.9), M["CEIL"])
                box(f"nichesill{tag}{i}", (sgn * HW, sgn * (HW + 0.2)), (y0 - 1.0, y0 + 1.0), (0.12, 0.28), M["TRIM"])
            else:
                p0, p1 = y0 - 1.05, y0 + 1.05
                inset_panel(f"bay{tag}{i}", (p0, p1), 0, (0.5, 3.1), M["WALL"], M["PANEL"])
                # inset_panel works in X/Z; rotate the bay onto the side wall.
                for ob in bpy.data.objects:
                    if ob.name.startswith(f"bay{tag}{i}"):
                        ob.rotation_euler = (0, 0, sgn * math.radians(90))
                        ob.location = (sgn * (HW - 0.01), y0, ob.location.z)
    # Hex doorways at both ends.
    for y, tag in ((0.15, "a"), (L - 0.15, "b")):
        f = hexport(f"door{tag}", y, 3.4, 4.6, 0.5, M["STEEL"])
        box(f"end{tag}", (-HW - 0.3, HW + 0.3), (y - 0.6 if tag == "a" else y, y if tag == "a" else y + 0.6), (0, H + 1.0), M["DARKSTEEL"])
    area_light("keya", (0, L * 0.3, H - 0.4), 5.0, 900, cool=True)
    area_light("keyb", (0, L * 0.72, H - 0.4), 5.0, 900, cool=True)
    return {
        "_fill": 150,
        "wide": ((-2.4, 2.2, EYE), (0.12, math.radians(-12), 0)),
        "eye": ((0.0, 2.8, EYE), (0.0, 0, 0)),
        "detail": ((-1.9, 7.4, 1.2), (0.28, math.radians(38), 0)),
    }


def build_hall(M):
    """The owner's reference: 22 x 16 m hall, 9 m layered ceiling, arcade of
    canted piers, central dais, three hex doors."""
    W, D, H = 11.0, 8.0, 9.0  # half-width, half-depth, height
    box("floor", (-W, W), (-D, D), (-0.3, 0), M["FLOOR"])
    # Big panel grid scored into the floor as thin proud plates.
    rng = random.Random(7)
    for gx in range(-4, 4):
        for gy in range(-3, 3):
            if rng.random() < 0.75:
                box(
                    f"fp{gx}{gy}",
                    (gx * 2.6 + 0.12, gx * 2.6 + 2.48),
                    (gy * 2.6 + 0.12, gy * 2.6 + 2.48),
                    (0, 0.025),
                    M["WALK"] if rng.random() < 0.8 else M["GRATE"],
                    bevel=0.02,
                )
    # Central dais: two steps, ring parapet, console blocks.
    box("dais1", (-3.6, 3.6), (-3.0, 3.0), (0, 0.18), M["WALK"], bevel=0.03)
    box("dais2", (-2.9, 2.9), (-2.3, 2.3), (0.18, 0.36), M["WALK"], bevel=0.03)
    for a in range(8):
        ang = a * math.tau / 8 + 0.2
        cx, cy = 2.35 * math.cos(ang), 1.85 * math.sin(ang)
        box(f"conring{a}", (cx - 0.55, cx + 0.55), (cy - 0.28, cy + 0.28), (0.36, 1.05), M["DARKSTEEL"], bevel=0.04)
        box(f"contop{a}", (cx - 0.5, cx + 0.5), (cy - 0.24, cy + 0.24), (1.02, 1.08), M["COOL"])
    # Perimeter raised walk behind an arcade of canted piers.
    box("perimf", (-W, W), (D - 2.6, D), (0, 0.35), M["WALK"])
    box("perimb", (-W, W), (-D, -D + 2.6), (0, 0.35), M["WALK"])
    stair("stf", 0, D - 2.75, 0, 0.35, 3.4, M, along="y")
    for sgn in (-1, 1):
        for i in range(5):
            x = -8.4 + i * 4.2
            wedge(f"pier{sgn}{i}", x, 0.84, sgn * (D - 2.6), 0.6, 7.6, 1.2, M["STEEL"])
            box(f"pierfoot{sgn}{i}", (x - 0.62, x + 0.62), (sgn * (D - 2.6) - 0.5, sgn * (D - 2.6) + 0.5), (0, 0.5), M["DARKSTEEL"], bevel=0.05)
    # Walls with nested bays behind the arcade.
    box("wallf", (-W, W), (D, D + 0.4), (0, H), M["WALL"])
    box("wallb", (-W, W), (-D - 0.4, -D), (0, H), M["WALL"])
    box("walll", (-W - 0.4, -W), (-D, D), (0, H), M["WALL"])
    box("wallr", (W, W + 0.4), (-D, D), (0, H), M["WALL"])
    for i in range(5):
        x = -8.4 + i * 4.2
        for sgn in (-1, 1):
            face = sgn * (D - 0.01)
            box(f"hbay{sgn}{i}-o", (x - 1.5, x + 1.5), (face - sgn * 0.04, face), (0.6, 5.0), M["WALL"], bevel=0.02)
            box(f"hbay{sgn}{i}-i", (x - 1.36, x + 1.36), (face - sgn * 0.08, face), (0.74, 4.86), M["PANEL"], bevel=0.04)
    # Layered ceiling: primary beams, cross beams, octagonal drop coffer.
    box("ceil", (-W, W), (-D, D), (H + 0.7, H + 1.0), M["CEIL"])
    for i in range(5):
        x = -8.4 + i * 4.2
        box(f"beam{i}", (x - 0.35, x + 0.35), (-D, D), (H - 0.5, H + 0.75), M["DARKSTEEL"], bevel=0.04)
    for j in range(3):
        y = -5.2 + j * 5.2
        box(f"xbeam{j}", (-W, W), (y - 0.22, y + 0.22), (H + 0.05, H + 0.75), M["DARKSTEEL"], bevel=0.04)
    # Drop coffer over the dais with an uplit rim.
    for k, r in enumerate((3.6, 3.0)):
        drop = 0.9 + k * 0.5
        o = bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=0.5, location=(0, 0, H + 0.7 - drop))
        c = bpy.context.active_object
        c.name = f"coffer{k}"
        c.data.materials.append(M["CEIL"])
        c.rotation_euler = (0, 0, math.tau / 16)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=2.4, depth=0.06, location=(0, 0, H - 0.75))
    cl = bpy.context.active_object
    cl.name = "cofferlight"
    cl.data.materials.append(M["WARM"])
    # Cove strips along the arcade heads and door lintels.
    for sgn in (-1, 1):
        lamp_strip(f"arcstrip{sgn}", (-W + 0.6, W - 0.6), (sgn * (D - 2.62), sgn * (D - 2.42)), 7.4, M, warm=True)
    # Three hex doorways: one big fore, two side.
    hexport("dfore", 0, 4.4, 5.6, 0.6, M["STEEL"])
    for ob in bpy.data.objects:
        if ob.name.startswith("dfore"):
            ob.rotation_euler = (0, 0, math.radians(90))
            ob.location = (-W + 0.05, 0, 0)
    hexport("dsl", D - 0.05, 3.2, 4.4, 0.5, M["STEEL"])
    hexport("dsr", -D + 0.05, 3.2, 4.4, 0.5, M["STEEL"])
    area_light("key", (0, 0, H - 1.6), 7.0, 2600, cool=True)
    area_light("fill", (-7, 4, 5.0), 4.0, 700, cool=False)
    return {
        # Blender's camera forward is (-sin yaw, +cos yaw): aim with
        # atan2(-dx, +dz), not the game engine's atan2(-dx, -dz).
        "_fill": 500,
        "wide": ((-2.1, -3.4, EYE), (0.10, math.atan2(-2.7, 4.3), 0)),
        "eye": ((2.1, -6.6, EYE), (0.06, math.atan2(2.1, 6.6), 0)),
        "detail": ((-4.9, 4.6, 1.35), (0.30, math.radians(-142), 0)),
    }


def build_hangar(M):
    """Monumental: 36 x 20 m, 14 m ceiling, segmented end door, gantry."""
    L, HW, H = 36.0, 10.0, 14.0
    box("floor", (0, L), (-HW, HW), (-0.3, 0), M["FLOOR"])
    for gx in range(18):
        for gy in range(10):
            box(f"fp{gx}-{gy}", (gx * 2 + 0.06, gx * 2 + 1.94), (-HW + gy * 2 + 0.06, -HW + gy * 2 + 1.94), (0, 0.02), M["WALK"])
    box("pad", (12, 24), (-4.5, 4.5), (-0.12, 0.005), M["GRATE"])
    box("padrim", (11.7, 24.3), (-4.8, -4.5), (0, 0.05), M["TRIM"])
    box("padrim2", (11.7, 24.3), (4.5, 4.8), (0, 0.05), M["TRIM"])
    # Walls with giant rib bays.
    box("walll", (0, L), (-HW - 0.5, -HW), (0, H), M["WALL"])
    box("wallr", (0, L), (HW, HW + 0.5), (0, H), M["WALL"])
    box("wallnear", (-0.5, 0), (-HW, HW), (0, H), M["WALL"])
    for i in range(7):
        x = 2.5 + i * 5
        for sgn in (-1, 1):
            box(f"hrib{sgn}{i}", (x - 0.5, x + 0.5), (sgn * HW - 0.6 * sgn, sgn * HW), (0, H - 1.2), M["STEEL"], bevel=0.07)
        lamp_strip(f"hwash{i}l", (x - 0.4, x + 0.4), (-HW + 0.05, -HW + 0.4), H - 2.5, M, warm=True)
        lamp_strip(f"hwash{i}r", (x - 0.4, x + 0.4), (HW - 0.4, HW - 0.05), H - 2.5, M, warm=True)
    # The segmented end door: six interlocking leaves, closed.
    for i in range(6):
        w = 16.0 / 6
        x0 = 10 + 0.0  # anchor not used; leaves span across Y
        y0 = -8 + i * (16 / 6)
        box(f"leaf{i}", (L, L + 0.8 + (0.25 if i % 2 else 0)), (y0 + 0.08, y0 + w - 0.08), (0, 11.0), M["DARKSTEEL"], bevel=0.06)
        box(f"leafrib{i}", (L - 0.15, L), (y0 + w / 2 - 0.35, y0 + w / 2 + 0.35), (0.5, 10.5), M["STEEL"])
    box("doorframe", (L - 0.4, L + 1.4), (-8.6, 8.6), (11.0, 12.4), M["STEEL"], bevel=0.08)
    box("doorsill", (L - 0.6, L), (-8.6, 8.6), (0, 0.25), M["TRIM"])
    box("doorhead", (L, L + 0.6), (-HW, HW), (12.3, H + 0.4), M["WALL"])
    box("doorsidel", (L, L + 0.6), (-HW, -8.6), (0, 12.4), M["WALL"])
    box("doorsider", (L, L + 0.6), (8.6, HW), (0, 12.4), M["WALL"])
    # Gantry bridge at 7 m with stairs, plus roof trusses at two scales.
    catwalk("gantry", (6, 30), (-1.1, 1.1), 7.0, M)
    for x in (8.5, 27.5):
        box(f"gcol{x}", (x - 0.3, x + 0.3), (-0.3, 0.3), (0, 6.94), M["STEEL"], bevel=0.05)
    stair("gstair", 6.0, -1.1, 0, 7.0, 1.6, M, along="x")
    for j in range(6):
        x = 3 + j * 6
        # Real trusses span across Y at each x.
        y0, y1 = -HW + 0.4, HW - 0.4
        box(f"rt{j}-top", (x - 0.09, x + 0.09), (y0, y1), (H - 0.1, H), M["STEEL"])
        box(f"rt{j}-bot", (x - 0.09, x + 0.09), (y0, y1), (H - 1.4, H - 1.31), M["STEEL"])
        n = 8
        for i in range(n):
            py = y0 + (y1 - y0) * i / n
            qy = y0 + (y1 - y0) * (i + 1) / n
            d = box(f"rt{j}-d{i}", (x - 0.05, x + 0.05), (py - 0.3, qy + 0.3), (H - 1.55, H + 0.1), M["STEEL"])
            d.rotation_euler = (math.radians(30) * (1 if i % 2 == 0 else -1), 0, 0)
    box("ceil", (0, L), (-HW, HW), (H, H + 0.4), M["CEIL"])
    for j in range(6):
        x = 3 + j * 6
        lamp_strip(f"bay{j}", (x - 1.6, x + 1.6), (-2.0, 2.0), H - 1.45, M, warm=False)
    # Stacked cargo frames along the near wall.
    rng = random.Random(23)
    cx = 1.6
    for i in range(9):
        w, d, h = rng.uniform(1.2, 2.6), rng.uniform(1.0, 1.8), rng.uniform(1.0, 2.4)
        x = rng.uniform(1.5, 8.5)
        y = -HW + 1.2 + (i % 3) * 2.1
        box(f"cargo{i}", (x, x + w), (y, y + d), (0, h), M["DARKSTEEL"] if i % 2 else M["STEEL"], bevel=0.05)
    area_light("hkey", (18, 0, H - 2.2), 10.0, 9000, cool=True)
    area_light("hfill", (6, 5, 6.0), 5.0, 1500, cool=False)
    return {
        "_fill": 1400,
        "wide": ((3.0, 6.5, EYE + 0.5), (0.12, math.atan2(-27.0, -8.5), 0)),
        "eye": ((4.0, 0.0, EYE), (0.10, math.radians(-90), 0)),
        "detail": ((26.0, -3.4, 1.4), (0.34, math.radians(-70), 0)),
    }


def build_warren(M):
    """STRAY: a 14 x 10 m vertical warren, alley between stacked dwellings."""
    W, D, H = 7.0, 5.0, 9.0
    box("floor", (-W, W), (-D, D), (-0.3, 0), M["FLOOR"])
    box("walll", (-W - 0.4, -W), (-D, D), (0, H), M["WALL"])
    box("wallr", (W, W + 0.4), (-D, D), (0, H), M["WALL"])
    box("wallf", (-W, W), (D, D + 0.4), (0, H), M["WALL"])
    box("wallb", (-W, W), (-D - 0.4, -D), (0, H), M["WALL"])
    box("ceil", (-W, W), (-D, D), (H, H + 0.4), M["CEIL"])
    rng = random.Random(5)
    # Stacked dwelling boxes on both sides, alley snaking between.
    def stack(x0, x1, side):
        z = 0.0
        while z < H - 2.2:
            d0 = rng.uniform(1.4, 2.4)
            h = rng.uniform(1.9, 2.7)
            y0 = side * D - side * d0
            o = box(
                f"unit{side}{z:.0f}{x0:.0f}",
                (x0, x1),
                (min(y0, side * D), max(y0, side * D)),
                (z, z + h),
                M["PANEL"] if rng.random() < 0.5 else M["WALL"],
                bevel=0.04,
            )
            # A shuttered window or vent on the alley face.
            wy = side * (D - d0)
            box(
                f"win{side}{z:.0f}{x0:.0f}",
                (x0 + 0.4, x0 + 1.1),
                (wy - side * 0.03, wy),
                (z + 0.7, z + 1.5),
                M["COOL"] if rng.random() < 0.35 else M["DARKSTEEL"],
            )
            # AC unit / greeble hung under some windows.
            if rng.random() < 0.6:
                box(
                    f"ac{side}{z:.0f}{x0:.0f}",
                    (x0 + 1.3, x0 + 1.85),
                    (wy - side * 0.5, wy),
                    (z + 0.5, z + 1.0),
                    M["STEEL"],
                    bevel=0.03,
                )
            z += h

    for i in range(4):
        x0 = -W + 0.4 + i * 3.4
        stack(x0, x0 + 2.8, +1)
        stack(x0 + rng.uniform(-0.5, 0.5), x0 + 2.6, -1)
    # Catwalks at two levels with ladders and bridges.
    catwalk("cw1", (-W + 0.6, W - 0.6), (1.35, 2.15), 3.2, M)
    catwalk("cw2", (-W + 0.6, 2.0), (-2.5, -1.3), 6.0, M)
    box("bridge", (-0.8, 0.8), (-1.3, 1.3), (5.94, 6.0), M["GRATE"])
    for x, z0, z1 in ((-W + 1.2, 0, 3.2), (1.4, 3.2, 6.0)):
        for r in range(int((z1 - z0) / 0.32)):
            box(f"lad{x:.0f}{r}", (x - 0.25, x + 0.25), (1.28, 1.31), (z0 + 0.25 + r * 0.32, z0 + 0.29 + r * 0.32), M["TRIM"])
        box(f"ladr{x:.0f}a", (x - 0.28, x - 0.24), (1.27, 1.32), (z0, z1 + 0.9), M["STEEL"])
        box(f"ladr{x:.0f}b", (x + 0.24, x + 0.28), (1.27, 1.32), (z0, z1 + 0.9), M["STEEL"])
    # Cable spaghetti and hung canopies across the alley.
    cable_tray("cab1", [(-W + 0.5, 0.8), (-2, 0.2), (2, 0.9), (W - 0.5, 0.1)], 8.2, M, sag=0.5)
    cable_tray("cab2", [(-W + 0.5, -0.6), (0, -1.1), (W - 0.5, -0.4)], 7.4, M, sag=0.9)
    for i in range(3):
        x = -4 + i * 3.4
        o = box(f"canopy{i}", (x, x + 1.8), (-0.9, 0.9), (2.5 + i * 1.4, 2.56 + i * 1.4), M["TRIM"])
        o.rotation_euler = (math.radians(rng.uniform(-14, 14)), math.radians(rng.uniform(-6, 6)), 0)
    # Practicals: hung bulbs down the alley, sign blocks on units.
    for i in range(4):
        x = -5 + i * 3.2
        box(f"bulb{i}", (x - 0.09, x + 0.09), (-0.09, 0.09), (2.6, 2.78), M["WARM"])
        box(f"bulbwire{i}", (x - 0.015, x + 0.015), (-0.015, 0.015), (2.78, H), M["DARKSTEEL"])
    for i in range(5):
        x = rng.uniform(-W + 1, W - 2)
        side = 1 if rng.random() < 0.5 else -1
        box(f"sign{i}", (x, x + rng.uniform(0.4, 1.2)), (side * (D - 1.9), side * (D - 1.84)), (rng.uniform(1.8, 6.5), rng.uniform(2.3, 7.0)), M["COOL"])
    area_light("wkey", (0, 0, H - 0.8), 4.0, 500, cool=True)
    return {
        "_fill": 200,
        "wide": ((-6.2, 0.3, EYE + 0.3), (0.18, math.atan2(-11.2, -0.8), 0)),
        "eye": ((-4.6, 0.0, EYE), (0.10, math.radians(-90 + 14), 0)),
        "detail": ((0.6, -0.6, 1.1), (0.55, math.radians(30), 0)),
    }


def build_service(M):
    """ALIEN ISOLATION: 16 x 12 m service deck, deliberately LOW - the
    reference's ceilings run 2.3-2.8 m; 2.9 here with beams dropping to 2.4
    keeps the compression while the player still clears the beam grid."""
    W, D, H = 8.0, 6.0, 2.9
    box("floor", (-W, W), (-D, D), (-0.3, 0), M["FLOOR"])
    # A grated trench crossing the room, with pipe runs inside it.
    box("trench", (-W, W), (-0.8, 0.8), (-0.5, -0.02), M["CEIL"])
    box("trencg", (-W, W), (-0.8, 0.8), (-0.04, 0.0), M["GRATE"])
    for k in range(3):
        box(f"tp{k}", (-W, W), (-0.5 + k * 0.35, -0.3 + k * 0.35), (-0.42 + 0.06 * k, -0.28 + 0.06 * k), M["STEEL"], bevel=0.05)
    box("trim1", (-W, W), (-0.9, -0.8), (0, 0.06), M["TRIM"])
    box("trim2", (-W, W), (0.8, 0.9), (0, 0.06), M["TRIM"])
    # Bulkhead frames divide the run into 4 m sections.
    for i, x in enumerate((-4.0, 0.0, 4.0)):
        box(f"bhl{i}", (x - 0.25, x + 0.25), (-D, -D + 0.6), (0, H), M["STEEL"], bevel=0.05)
        box(f"bhr{i}", (x - 0.25, x + 0.25), (D - 0.6, D), (0, H), M["STEEL"], bevel=0.05)
        box(f"bht{i}", (x - 0.25, x + 0.25), (-D, D), (H - 0.35, H), M["STEEL"], bevel=0.05)
        lamp_strip(f"bhlamp{i}", (x - 0.18, x + 0.18), (-1.4, 1.4), H - 0.36, M, warm=True)
    # The heavy ceiling beam grid.
    box("ceil", (-W, W), (-D, D), (H + 0.45, H + 0.7), M["CEIL"])
    for i in range(8):
        x = -7 + i * 2
        box(f"cbx{i}", (x - 0.16, x + 0.16), (-D, D), (H, H + 0.5), M["DARKSTEEL"])
    for j in range(6):
        y = -5 + j * 2
        box(f"cby{j}", (-W, W), (y - 0.16, y + 0.16), (H + 0.1, H + 0.5), M["DARKSTEEL"])
    # Walls: chunky 70s modules - alternating blank plates and equipment bays.
    rng = random.Random(31)
    box("wallf", (-W, W), (D, D + 0.4), (0, H + 0.6), M["WALL"])
    box("wallb", (-W, W), (-D - 0.4, -D), (0, H + 0.6), M["WALL"])
    box("walll", (-W - 0.4, -W), (-D, D), (0, H + 0.6), M["WALL"])
    box("wallr", (W, W + 0.4), (-D, D), (0, H + 0.6), M["WALL"])
    for i in range(7):
        x = -6.6 + i * 2.2
        for sgn in (-1, 1):
            r = rng.random()
            if r < 0.4:
                box(f"eq{sgn}{i}", (x, x + 1.7), (sgn * D - sgn * 0.55, sgn * D), (0.15, 2.3), M["DARKSTEEL"], bevel=0.04)
                box(f"eqg{sgn}{i}", (x + 0.15, x + 1.55), (sgn * D - sgn * 0.58, sgn * D - sgn * 0.55), (0.5, 2.1), M["GRATE"])
                if rng.random() < 0.5:
                    box(f"eqs{sgn}{i}", (x + 0.5, x + 1.2), (sgn * D - sgn * 0.6, sgn * D - sgn * 0.58), (1.4, 1.9), M["COOL"])
            elif r < 0.7:
                box(f"pl{sgn}{i}", (x, x + 1.7), (sgn * D - sgn * 0.12, sgn * D), (0.15, H - 0.4), M["PANEL"], bevel=0.05)
            else:
                for k in range(3):
                    box(f"pipe{sgn}{i}{k}", (x + 0.3 + k * 0.45, x + 0.55 + k * 0.45), (sgn * D - sgn * 0.35, sgn * D), (0, H), M["STEEL"], bevel=0.1)
                    box(f"pj{sgn}{i}{k}", (x + 0.22 + k * 0.45, x + 0.63 + k * 0.45), (sgn * D - sgn * 0.42, sgn * D - sgn * 0.1), (1.1 + k * 0.5, 1.35 + k * 0.5), M["DARKSTEEL"])
    # A big-framed end door with warning chevrons implied by trim geometry.
    hexport("sdoor", 0, 2.4, 2.4, 0.5, M["STEEL"], cham=0.4)
    for ob in bpy.data.objects:
        if ob.name.startswith("sdoor"):
            ob.rotation_euler = (0, 0, math.radians(90))
            ob.location = (-W + 0.05, 0, 0)
    box("sdoorplate", (-W - 0.2, -W + 0.1), (-1.5, 1.5), (0, H), M["DARKSTEEL"])
    area_light("skey", (0, 0, H - 0.2), 3.0, 320, cool=False)
    area_light("sfill", (5, -3, H - 0.5), 2.0, 160, cool=True)
    return {
        "_fill": 110,
        "wide": ((-6.8, -4.6, EYE), (0.06, math.radians(-42), 0)),
        "eye": ((6.6, 0.0, EYE), (0.03, math.radians(96), 0)),
        "detail": ((-2.2, 4.6, 1.1), (0.30, math.radians(-158), 0)),
    }


PROTOS = {
    "hexrun": build_hexrun,
    "hall": build_hall,
    "hangar": build_hangar,
    "warren": build_warren,
    "service": build_service,
}

# ------------------------------------------------------------------- render


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = 192
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720
    sc.view_settings.look = "AgX - Base Contrast"
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.005, 0.007, 1)
    sc.world = world


def render_views(name, views):
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    fill = views.pop("_fill", 800)
    for tag, (loc, rot) in views.items():
        cam = bpy.data.cameras.new(f"cam-{tag}")
        cam.lens = 21 if tag == "wide" else (26 if tag == "eye" else 30)
        ob = bpy.data.objects.new(f"cam-{tag}", cam)
        bpy.context.collection.objects.link(ob)
        pitch, yaw, _ = rot
        ob.location = loc
        # Blender camera looks down -Z; stand it up (90deg X) then yaw and pitch.
        ob.rotation_euler = (math.pi / 2 + pitch, 0, yaw)
        # A soft headlamp riding just behind the camera: a sealed interior
        # gets nothing from the world, and the authored practicals are
        # accents, not coverage. This guarantees the geometry itself is
        # legible from exactly the views being judged.
        lamp = area_light(f"fill-{tag}", loc, 4.0, fill, cool=False)
        lamp.data.color = (1.0, 1.0, 1.0)
        lamp.rotation_euler = (math.pi / 2 + pitch, 0, yaw)
        sc.camera = ob
        sc.render.filepath = os.path.join(OUT, f"{name}-{tag}.png")
        bpy.ops.render.render(write_still=True)
        lamp.hide_render = True
        print(f"[prospects] wrote {sc.render.filepath}")


def main():
    which = os.environ.get("GT_PROTO")
    if which is None and "--" in sys.argv:
        which = sys.argv[sys.argv.index("--") + 1]
    if which not in PROTOS:
        raise RuntimeError(f"name a prototype: {', '.join(PROTOS)}")
    fresh()
    M = materials()
    views = PROTOS[which](M)
    if os.environ.get("GT_DEBUG"):
        for o in sorted(bpy.data.objects, key=lambda o: o.name):
            if o.type == "MESH":
                d = o.dimensions
                print(f"[dbg] {o.name}  dim=({d.x:.2f},{d.y:.2f},{d.z:.2f})  at=({o.location.x:.2f},{o.location.y:.2f},{o.location.z:.2f})  hide={o.hide_render}")
        print(f"[dbg] total meshes: {sum(1 for o in bpy.data.objects if o.type == 'MESH')}")
        return
    render_views(which, views)


main()
