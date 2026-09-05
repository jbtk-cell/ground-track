"""
Build one of Deck One's generated rooms in Blender, light it, bake it.

    blender --background --python tools/blender/build_generated.py -- gen-mess
    GT_ROOM=gen-mess blender --background --python tools/blender/build_generated.py

Reads tools/blender/deckplan.json (written by scripts/export-deckplan.ts from
src/env/station/deckplan.ts, the single source of truth) and renders ONE
room's record: banded walls with the doors cut, a stepped deck where the
floors step, ceiling, lamp fittings, the family's furniture, bake, export.
Forty-one rooms, one builder - a room is data here, exactly as it is at
runtime, so the .glb can never disagree with the compartment contract.

The visual language is the established one (docs/INTERIORS.md, the bespoke
build_*.py rooms): kick / work / crown bands sharing an outer backing plane,
liner panels' warmth, DIFF ceiling fittings, doorway caps and spill plates
for the bake only. Families vary the dressing and the light, not the
grammar - except the secret rooms, which drop the bands for bare JAMB
frames and one dim fitting, because a hollow between frames was never
finished by anybody.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, newmat, produce, world,
)

HERE = os.path.dirname(os.path.abspath(__file__))
WALL = 0.1

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
    "SCREENBG": (0.02400, 0.03600, 0.05400),
    "GROWM": (0.09000, 0.14000, 0.06000),
    "GROWL": (0.42000, 0.58000, 0.26000),
    "FROSTC": (0.62000, 0.70000, 0.76000),
    "EMBERC": (0.65000, 0.28000, 0.06000),
}

# The whole rig per family: how bright its fittings run, and its spill.
DIFF_STRENGTH = {
    "corridor": 10.0, "hab": 11.0, "works": 12.0, "stores": 12.0,
    "science": 12.0, "setpiece": 26.0, "secret": 4.5,
}
SPILL_STRENGTH = {"corridor": 2.2, "hab": 2.2, "works": 2.2, "stores": 2.2,
                  "science": 2.2, "setpiece": 2.2, "secret": 1.2}


def materials(family):
    C = COLOURS
    M = {
        "LINER": newmat("LINER", C["LINER"], 0.78, bump=0.14, bump_scale=18, bump_detail=2),
        "END": newmat("END", C["END"], 0.80, bump=0.14, bump_scale=18, bump_detail=2),
        "KICK": newmat("KICK", C["KICK"], 0.64, bump=0.10, bump_scale=26, bump_detail=2),
        "CROWN": newmat("CROWN", C["CROWN"], 0.88, bump=0.10, bump_scale=14, bump_detail=2),
        "DECK": newmat("DECK", C["DECK"], 0.54, bump=0.16, bump_scale=34, bump_detail=2),
        "JAMB": newmat("JAMB", C["JAMB"], 0.62),
        "FOIL": newmat("FOIL", C["FOIL"], 0.36, metal=0.55, bump=0.06, bump_scale=48, bump_detail=2),
        "TRIM": newmat("TRIM", C["TRIM"], 0.48, metal=0.35),
        "GROWMASS": newmat("GROWMASS", C["GROWM"], 0.85, bump=0.3, bump_scale=40, bump_detail=2),
        "DIFF": newmat("DIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=DIFF_STRENGTH[family]),
        "SCREENGLOW": newmat("SCREENGLOW", C["SCREENBG"], 0.24,
                             emit=(0.56471, 0.71569, 0.60383), strength=0.9),
        "GROW": newmat("GROW", C["GROWL"], 0.40, emit=C["GROWL"], strength=9.0),
        "FROST": newmat("FROST", C["FROSTC"], 0.40, emit=C["FROSTC"], strength=11.0),
        "EMBER": newmat("EMBER", C["EMBERC"], 0.45, emit=(0.72, 0.36, 0.10), strength=7.0),
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"],
                        strength=SPILL_STRENGTH[family]),
    }
    return M


def build_walls(M, room):
    """Four banded walls (or bare JAMB frames for a secret), doors cut."""
    ohw, ohd, h = room["ohw"], room["ohd"], room["h"]
    ihw, ihd = ohw - WALL, ohd - WALL
    secret = room["family"] == "secret"
    kick_top = min(0.95, h * 0.38)
    work_top = min(h - 0.4, 2.05)

    def wall(side, axis, plane, inward):
        if secret:
            lo, hi = sorted((plane, plane - inward * WALL))
            if axis == "x":
                gbox(f"w-{side}", (lo, hi), (0.0, h), (-ohd, ohd), M["JAMB"])
            else:
                gbox(f"w-{side}", (-ohw, ohw), (0.0, h), (lo, hi), M["JAMB"])
            return
        bands = [
            ("kick", 0.0, kick_top, 0.0, "KICK"),
            ("work", kick_top, work_top, -0.035, "LINER"),
            ("crown", work_top, h, 0.02, "CROWN"),
        ]
        for bname, y0, y1, relief, mat in bands:
            face = plane + inward * (WALL * 0 + relief)
            outer = plane - inward * WALL
            lo, hi = sorted((face, outer))
            if axis == "x":
                gbox(f"w-{side}-{bname}", (lo, hi), (y0, y1), (-ohd, ohd), M[mat])
            else:
                gbox(f"w-{side}-{bname}", (-ohw, ohw), (y0, y1), (lo, hi), M[mat])

    wall("e", "x", ihw, -1)
    wall("w", "x", -ihw, +1)
    wall("n", "z", ihd, -1)
    wall("s", "z", -ihd, +1)

    walls = [o for o in bpy.data.objects if o.name.startswith("w-")]
    for p in room["ports"]:
        wp, at, w2, hs = p["wall"], p["at"], p["w"] / 2, p["hSeam"]
        y0 = p["floorY"]
        if wp == "e":
            cut = gbox(f"c-{p['id']}", (ihw - 0.5, ohw + 0.5), (y0, y0 + hs), (at - w2, at + w2), M["JAMB"])
            cap = ((ohw + 0.03, ohw + 0.11), (y0, y0 + hs), (at - w2 - 0.03, at + w2 + 0.03))
            sky = ((ohw + 0.012, ohw + 0.017), (y0, y0 + hs), (at - w2, at + w2))
        elif wp == "w":
            cut = gbox(f"c-{p['id']}", (-ohw - 0.5, -ihw + 0.5), (y0, y0 + hs), (at - w2, at + w2), M["JAMB"])
            cap = ((-ohw - 0.11, -ohw - 0.03), (y0, y0 + hs), (at - w2 - 0.03, at + w2 + 0.03))
            sky = ((-ohw - 0.017, -ohw - 0.012), (y0, y0 + hs), (at - w2, at + w2))
        elif wp == "n":
            cut = gbox(f"c-{p['id']}", (at - w2, at + w2), (y0, y0 + hs), (ihd - 0.5, ohd + 0.5), M["JAMB"])
            cap = ((at - w2 - 0.03, at + w2 + 0.03), (y0, y0 + hs), (ohd + 0.03, ohd + 0.11))
            sky = ((at - w2, at + w2), (y0, y0 + hs), (ohd + 0.012, ohd + 0.017))
        else:
            cut = gbox(f"c-{p['id']}", (at - w2, at + w2), (y0, y0 + hs), (-ohd - 0.5, -ihd + 0.5), M["JAMB"])
            cap = ((at - w2 - 0.03, at + w2 + 0.03), (y0, y0 + hs), (-ohd - 0.11, -ohd - 0.03))
            sky = ((at - w2, at + w2), (y0, y0 + hs), (-ohd - 0.017, -ohd - 0.012))
        for wl in walls:
            boolean_diff(wl, [cut])
        bpy.data.objects.remove(cut, do_unlink=True)
        gbox(f"cap-{p['id']}", *cap, M["END"])
        gbox(f"sky-{p['id']}", *sky, M["SPILL"])


def build_deck_and_ceiling(M, room):
    ohw, ohd, h = room["ohw"], room["ohd"], room["h"]
    gbox("deck-slab", (-ohw, ohw), (-WALL, -0.014), (-ohd, ohd), M["TRIM"])
    # Plates on a metre-ish pitch.
    nx = max(1, round(ohw))
    nz = max(1, round(ohd))
    for i in range(nx * 2):
        for k in range(nz * 2):
            x0 = -ohw + (2 * ohw * i) / (nx * 2) + 0.004
            x1 = -ohw + (2 * ohw * (i + 1)) / (nx * 2) - 0.004
            z0 = -ohd + (2 * ohd * k) / (nz * 2) + 0.004
            z1 = -ohd + (2 * ohd * (k + 1)) / (nz * 2) - 0.004
            gbox(f"deck-{i}-{k}", (x0, x1), (-0.014, 0.0), (z0, z1), M["DECK"])
    # Raised floor levels (the return's ramp) as platforms over the slab.
    seen = set()
    for f in room["floors"]:
        y = f["floorY"]
        if y <= 0.0 or (round(y, 3),) in seen:
            pass
        if y > 0.0:
            gbox(
                f"plat-{len(seen)}",
                (f["minX"], f["maxX"]), (0.0, y), (f["minZ"], f["maxZ"]),
                M["KICK"],
            )
            seen.add((round(y, 3),))
    gbox("ceiling", (-ohw, ohw), (h, h + WALL), (-ohd, ohd), M["CROWN"])


def build_lamps(M, room):
    h = room["h"]
    for i, (x0, x1, z0, z1) in enumerate(room["lamps"]):
        gbox(f"lh-{i}", (x0 - 0.04, x1 + 0.04), (h - 0.055, h), (z0 - 0.04, z1 + 0.04), M["TRIM"])
        gbox(f"lamp-{i}", (x0, x1), (h - 0.09, h - 0.055), (z0, z1), M["DIFF"])


def build_furniture(M, room):
    for f in room["furniture"]:
        x0, x1, y0, y1, z0, z1 = f["box"]
        mat = M.get(f["mat"], M["TRIM"])
        gbox(f"f-{f['name']}", (x0, x1), (y0, y1), (z0, z1), mat)


def main():
    stem = os.environ.get("GT_ROOM")
    if stem is None and "--" in sys.argv:
        stem = sys.argv[sys.argv.index("--") + 1]
    if stem is None:
        raise RuntimeError("name a room: GT_ROOM=gen-mess or -- gen-mess")

    with open(os.path.join(HERE, "deckplan.json")) as fh:
        rooms = json.load(fh)
    room = next((r for r in rooms if r["stem"] == stem), None)
    if room is None:
        raise RuntimeError(f"no such room in deckplan.json: {stem}")

    fresh_scene()
    world(COLOURS["VOID"])
    M = materials(room["family"])
    build_walls(M, room)
    build_deck_and_ceiling(M, room)
    build_lamps(M, room)
    build_furniture(M, room)
    bevel_everything()

    ohw, ohd, h = room["ohw"] - WALL, room["ohd"] - WALL, room["h"]

    def inside(p):
        gx, gy, gz = p.x, p.z, -p.y
        return (
            0.02 < gy < h - 0.02
            and abs(gx) < ohw - 0.02
            and abs(gz) < ohd - 0.02
        )

    samples = int(os.environ.get("GT_BAKE_SAMPLES", "1024"))
    produce(room["name"], stem, inside, room["atlas"], samples, f"build_{stem}")


if __name__ == "__main__":
    main()
