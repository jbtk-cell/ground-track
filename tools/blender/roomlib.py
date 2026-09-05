"""
The machinery every Blender-built room shares.

A room script (build_plot.py, build_crawl.py, build_bend.py, ...) owns its PLAN:
the numbers copied from its src/env twin, its materials, and the code that
places geometry. Everything downstream of the plan - coordinate mapping, box
and prism builders, booleans, bevels, the visibility cull, the two-UV unwrap,
the Cycles bake, the lightmap write and the glTF export - is identical from
room to room, and identical on purpose: a defect fixed here is fixed for every
room at once, which is how the five defects documented in docs/BLENDER.md stay
fixed.

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
   and a lamp's own emission is not light arriving at the lamp. Emissive
   surfaces are therefore drawn unlit at their emitted colour by the runtime
   (the SELF_LIT map in each room's loader module).

4. Faces nothing can see are found before unwrapping and given no atlas -
   but NEVER deleted. Deleting them puts the correctness of a heuristic
   between the player and open space; parking their UVs on one reserved
   texel reclaims the atlas either way, and a wrong guess costs a slightly
   dark surface instead of a hole to space.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "blender")

LIGHT_RANGE = 2.2   # must match each room's loader in src/env
LIGHT_FLOOR = 0.05  # nothing may reach zero; pure black is banned project-wide

# Sampling override for smoke tests: GT_BAKE_SAMPLES=32 blender --background
# --python tools/blender/build_x.py runs the whole pipeline in a couple of
# minutes to prove it still holds together, without pretending to be a bake.
SAMPLES_ENV = "GT_BAKE_SAMPLES"

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


def gprism(name, plan, gy, mat=None):
    """
    A vertical prism from a plan polygon: `plan` is a list of (x, z) GAME-plan
    points in order, extruded from gy[0] to gy[1].

    This is what a box cannot be: the crawl's walls taper 1.18 m to 1.02 m
    along their run, and the bend is fourteen flat facets of a quarter
    annulus - every one of those surfaces is a straight-sided polygon in plan
    with vertical sides, which is exactly a prism. Floors and ceilings are
    prisms too, just short ones.
    """
    y0, y1 = gy
    n = len(plan)
    verts = [(x, y0, z) for x, z in plan] + [(x, y1, z) for x, z in plan]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    me = bpy.data.meshes.new(name)
    me.from_pydata([g2b(v) for v in verts], [], faces)
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
    """
    Cut. EVERY CUTTER MUST CARRY A MATERIAL: a boolean gives the faces it
    creates the cutter's own material slot, so a bare cutter leaves the cut
    surfaces - door reveals, porthole bores, the things you look straight at -
    on a null slot with no bake target and no albedo. check_slots() refuses to
    bake such a room, but the material belongs on the cutter BEFORE the cut.
    """
    for c in cutters:
        md = target.modifiers.new("cut", "BOOLEAN")
        md.operation = "DIFFERENCE"
        md.solver = "EXACT"
        md.object = c
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.modifier_apply(modifier=md.name)


def bevel_everything(width=0.005, skip=("sky",)):
    for ob in bpy.data.objects:
        if ob.type != "MESH" or any(ob.name.startswith(s) for s in skip):
            continue
        md = ob.modifiers.new("bevel", "BEVEL")
        md.width = width
        md.segments = 2
        md.limit_method = "ANGLE"
        md.angle_limit = math.radians(40)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=md.name)


# --------------------------------------------------------------- visibility

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

    Judging a face by its centroid alone is what put holes to space in the
    first room: the ledge where the kick band steps out to the work band is one
    quad 0.36 m deep, of which only the first 0.14 m is in the room. Its
    centroid sits buried inside the wall with the work band directly above it,
    so every ray from that one point is blocked and a plainly visible ledge is
    called hidden. Sampling the face instead of the point fixes the whole class.
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


def find_hidden(room, inside, rays=48, reach=0.6):
    """
    Which faces can no point in the room see?

    `inside(p)` is the room's own open-volume test, taking a BLENDER point.
    A face is VISIBLE if some sample on it has some direction in its own
    hemisphere that travels `reach` metres without hitting anything and ends
    inside the vessel. That separates the three cases a normal-direction rule
    cannot tell apart: the room side of a wall (visible), the back of the same
    wall - rays escape but end outside the vessel - and a face sealed in a
    cavity between two boxes, where every ray hits something.

    Nothing is deleted on the strength of this. See unwrap().
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
                if tree.ray_cast(origin, w, reach)[0] is None and inside(origin + w * reach):
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

    # The parked texel must be RESERVED, which the packer does not do: it
    # fills the whole unit square, so "one texel in the corner" can land in
    # the middle of somebody's island and every hidden face then renders in
    # that island's light - the crawl's blind-end walls came out flat pale
    # because the corner belonged to a bright wall. Scale the packed islands
    # to leave the corner genuinely empty (the bake's margin dilation reaches
    # ~16 texels past an island edge, so the park point keeps clear of 0.97 +
    # margin), then park the hidden faces where nothing else can be. The
    # empty corner bakes as the image's initial value, which write_lightmap
    # floors at LIGHT_FLOOR: a parked face renders very dark, never bright.
    uv = me.uv_layers["Lightmap"].data
    for p in me.polygons:
        for li in range(p.loop_start, p.loop_start + p.loop_total):
            if p.index in hidden:
                uv[li].uv = (0.995, 0.995)
            else:
                u, v = uv[li].uv
                uv[li].uv = (u * 0.97, v * 0.97)


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


def bake(room, atlas, samples, direct=True):
    check_slots(room)
    samples = int(os.environ.get(SAMPLES_ENV, samples))
    img = bpy.data.images.new(f"{room.name}_lightmap", atlas, atlas,
                              float_buffer=True, alpha=False)
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
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.005
    sc.cycles.adaptive_min_samples = 64
    b = sc.render.bake
    # direct=False bakes BOUNCE ONLY - for a hybrid room whose direct light
    # stays live at runtime (the limb deck: the orbital rig's lamps and sun
    # keep shining on Lambert materials, and the map carries only the
    # inter-reflection Cycles can compute and the runtime cannot).
    b.use_pass_direct = direct
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


def write_lightmap(img, stem):
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
    img.filepath_raw = os.path.join(OUT, f"{stem}-lightmap.png")
    img.file_format = "PNG"
    img.save()
    return clipped


def export(room, stem):
    bpy.ops.object.select_all(action="DESELECT")
    room.select_set(True)
    bpy.context.view_layer.objects.active = room
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f"{stem}.glb"),
        export_format="GLB", use_selection=True,
        export_texcoords=True, export_normals=True,
        export_yup=True, export_apply=True, export_materials="EXPORT",
    )


def world(void_rgb, strength=0.35):
    w = bpy.data.worlds.new("space")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*void_rgb, 1.0)
    bg.inputs["Strength"].default_value = strength


def join_room(name, skip=("sky", "cap-")):
    """
    Join everything into one exportable room mesh - except two prefixes.

    "sky" objects are bake-only emitters (porthole fill, doorway spill) that
    the runtime replaces with the real thing. "cap-" objects seal doorways
    during the bake so no light leaks and the reveal surfaces receive honest
    bounce - but they are NOT exported: whether a doorway is a doorway or the
    end of the station is a fact about the STATION, decided after layout, so
    the runtime builds its own cap plates and toggles them via sealPort().
    A cap baked into the mesh could never be removed when a room is joined.
    """
    bpy.ops.object.select_all(action="DESELECT")
    anchor = None
    for ob in list(bpy.data.objects):
        if ob.type != "MESH" or any(ob.name.startswith(s) for s in skip):
            continue
        ob.select_set(True)
        if anchor is None or ob.name == "ceiling":
            anchor = ob
    bpy.context.view_layer.objects.active = anchor
    bpy.ops.object.join()
    room = bpy.context.view_layer.objects.active
    room.name = name
    return room


def fresh_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6


def produce(name, stem, inside, atlas, samples, tag, direct=True):
    """Cull, unwrap, bake, write, export - everything after the geometry."""
    room = join_room(name)
    total = len(room.data.polygons)
    hidden = find_hidden(room, inside)
    by_mat = {}
    for p in room.data.polygons:
        if p.index in hidden:
            slot = room.material_slots[p.material_index].material
            key = slot.name if slot else "(none)"
            by_mat[key] = by_mat.get(key, 0) + 1
    print(f"[{tag}] hidden by material: {sorted(by_mat.items(), key=lambda kv: -kv[1])}")
    unwrap(room, hidden)
    img = bake(room, atlas, samples, direct)
    clipped = write_lightmap(img, stem)
    export(room, stem)
    share = 100.0 * len(hidden) / max(1, total)
    print(f"[{tag}] {total} faces, {len(hidden)} hidden ({share:.1f}%) - kept, no atlas")
    print(f"[{tag}] clipped above LIGHT_RANGE: {clipped * 100:.2f}%")
    print(f"[{tag}] wrote {OUT}/{stem}.glb + {stem}-lightmap.png")
    return room
