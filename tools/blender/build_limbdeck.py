"""
Bake THE LIMB DECK's shell in Cycles - the hybrid room.

    npx vite-node scripts/export-limbdeck-shell.ts   (writes limbdeck/*.ply)
    blender --background --python tools/blender/build_limbdeck.py

Writes public/blender/limbdeck.glb and limbdeck-lightmap.png.

THIS ROOM IS NOT REBUILT - IT IS RE-LIT. Every other Blender room re-models
its plan from numbers, because a plan of boxes re-models faithfully. The limb
deck's shell is 1200 lines of snapped grids, split bulkhead fans and a canted
six-facet cupola, and the exterior pass depends on that geometry to the
millimetre - a re-derivation that drifted a centimetre would open a pinhole
into space. So scripts/export-limbdeck-shell.ts exports the EXACT meshes
buildShell() mounts, this script imports them, and the .glb that comes back
is the same geometry with lightmap UVs.

THE BAKE IS INDIRECT ONLY (produce(..., direct=False)). The room's subject is
light changing in t - the sun walks the deck once per revolution - and a bake
is constant in t, which is why this room stayed on the orbital rig when every
other room went to Cycles (docs/BLENDER.md). The hybrid keeps that: the sun,
the eclipse, the earthshine and the eight lamp points stay LIVE on the same
Lambert materials as always, and the map carries only the inter-reflection
Cycles can compute and the runtime cannot - the lamp troughs' bounce filling
the hull crown, the deck's return on the walls. Direct light is never in the
map, so nothing is counted twice and nothing in the map goes stale when the
orbit turns.

The only light in the scene is the lamp strips themselves (the sun is live,
so it is not here), and the doorway is capped by a bake-only plate standing
in for the shut door.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Matrix  # noqa: E402

from roomlib import (  # noqa: E402
    fresh_scene, g2b, gbox, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

RADIUS = 2.1
AXIS_Y = 1.15
HALF_LENGTH = 3.2
BULKHEAD_X = -3.2
AFT_DOORWAY = {"minY": -0.02, "maxY": 2.12, "minZ": -0.59, "maxZ": 0.59}

COLOURS = {
    # PALETTE.CLOUD / HULL_SHADOW / VOID_SLATE, linearised.
    "CLOUD": (0.71569, 0.68668, 0.61721),
    "HULL_SHADOW": (0.06124, 0.09842, 0.14444),
    "VOID": (0.00518, 0.01096, 0.01938),
}

ATLAS = 2048
BAKE_SAMPLES = 1024

# The strips' emission, driving the whole map. Tuned against deck-eclipse:
# the fill it produces stands in for what the legacy room approximated with
# an ambient backstop, so it should read as presence, not as a light source.
LAMP_STRENGTH = 30.0

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "limbdeck")

# GAME (x right, y up, z depth) -> BLENDER (z up), as a matrix, because the
# PLYs carry raw game coordinates.
G2B_MATRIX = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def import_ply(stem, name, mat):
    path = os.path.join(SRC, f"{stem}.ply")
    if not os.path.exists(path):
        raise RuntimeError(
            f"{path} missing - run: npx vite-node scripts/export-limbdeck-shell.ts"
        )
    bpy.ops.wm.ply_import(filepath=path)
    ob = bpy.context.active_object
    ob.name = name
    ob.matrix_world = G2B_MATRIX @ ob.matrix_world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


def structure_material():
    """Principled whose base colour is the imported vertex colour - the same
    per-facet albedo the runtime shades, so the bounce is the right hue."""
    m = newmat("STRUCTURE", (1.0, 1.0, 1.0), 0.85)
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    attr.location = (-500, 300)
    nt.links.new(attr.outputs["Color"], b.inputs["Base Color"])
    return m


def inside_vessel(p):
    """p is a BLENDER point. The vessel: the y >= deck part of the 2.1 m
    cylinder, plus the cupola's standoff pocket in the port hull."""
    gx, gy, gz = p.x, p.z, -p.y
    if gy < 0.01:
        return False
    if abs(gx) < HALF_LENGTH - 0.01 and math.hypot(gz, gy - AXIS_Y) < RADIUS - 0.01:
        return True
    # The cupola pocket: proud of the hull to port, around the bay cut.
    if (
        -1.9 < gx < 0.7
        and gz < -1.4
        and 0.3 < gy < 2.7
        and math.hypot(gz, gy - AXIS_Y) < RADIUS + 0.62
    ):
        return True
    return False


def main():
    fresh_scene()
    world(COLOURS["VOID"])

    structure = structure_material()
    lamps = newmat("LAMPS", (0.02, 0.02, 0.02), 0.40,
                   emit=COLOURS["CLOUD"], strength=LAMP_STRENGTH)
    import_ply("structure", "shell-structure", structure)
    import_ply("lamps", "shell-lamps", lamps)

    # The shut door, for the bake only: without it the doorway is a hole into
    # the void and the aft end of the room bakes darker than the room ever is.
    door = newmat("DOORCAP", COLOURS["HULL_SHADOW"], 0.60)
    gbox("cap-door", (BULKHEAD_X - 0.02, BULKHEAD_X),
         (AFT_DOORWAY["minY"], AFT_DOORWAY["maxY"]),
         (AFT_DOORWAY["minZ"], AFT_DOORWAY["maxZ"]), door)

    # No bevel: the shell's facets are the room's look, and the import is not
    # ours to soften.
    produce("LIMBDECK", "limbdeck", inside_vessel, ATLAS, BAKE_SAMPLES,
            "build_limbdeck", direct=False)


if __name__ == "__main__":
    main()
