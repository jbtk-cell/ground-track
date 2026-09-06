"""
Build THE CRAWL in Blender, light it with Cycles, bake it, and export it.

    blender --background --python tools/blender/build_crawl.py

Writes public/blender/crawl.glb and crawl-lightmap.png.

The room, per src/env/crawl: a 7.2 m duct off the plot's spur, 1.18 m wide at
the mouth narrowing to 1.02 m at a bolted blank, its deck climbing 0.60 m in
three steps. Nothing in it is operable - the room IS the traverse, deliberate
compression between the flight deck and whatever you walk to next. It is the
dimmest room on the station: one small amber lamp at the blind end, and the
rest of its light is spill through the mouth.

Every number is copied from src/env/crawl/index.ts (the taper, the deck
steps, the six ring frames, the trunk, rails, stowage) so the Blender room
is the same place. The banded walls follow src/env/kit/bands: kick proud
0.06, work recessed 0.08, crown proud 0.14 - except on the top deck, where
deck + work-top reaches the ceiling and the crown band vanishes, which is
the room's central design move (the walls "sink" as the floor climbs).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from roomlib import (  # noqa: E402
    bevel_everything, boolean_diff, fresh_scene, gbox, gprism, newmat, produce, world,
)

# --------------------------------------------------------------------- plan

HALF_LENGTH = 3.6
CEILING_Y = 2.55
HALF_Z_MOUTH, HALF_Z_BLIND = 0.59, 0.51
KICK_H, WORK_H = 0.95, 2.05              # band heights above the LOCAL deck
SEAM_W, SEAM_H = 1.18, 2.06
THICK = 0.20

# (x0, x1, deck) - the four levels, mouth first.
LEVELS = [
    (1.8, HALF_LENGTH, 0.0),
    (0.6, 1.8, 0.2),
    (-0.6, 0.6, 0.4),
    (-HALF_LENGTH, -0.6, 0.6),
]

FRAMES = [3.0, 1.8, 0.6, -0.6, -1.8, -3.0]   # ring frame stations
RISERS = {1.8: 0.2, 0.6: 0.4, -0.6: 0.6}     # step x -> upper deck height

# Shared with build_plot: the rebuilt palette, linear RGB.
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
    "CREAM": (0.77505, 0.66693, 0.48515),    # DAWN_CREAM: the mouth's spill
    # The blind-end lamp, pulled golden (2026-09-06): at SETTLEMENT's own hue
    # (0.583, 0.351, 0.125) the pool it threw on the liner grazed the accent
    # gate's ball - 219 px of near-accent at the shelf rail. More green moves
    # every lit surface off that axis, same as the engine gallery's ember.
    "AMBER": (0.52000, 0.46000, 0.12000),
    "SOFT": (0.06050, 0.10220, 0.14830),     # HULL_SHADOW: stowage fabric
    "NOSE": (0.72310, 0.69380, 0.62620),     # CLOUD: the step nosings
}

ATLAS = 1024        # a quarter of the plot's area, and most of it is wall
BAKE_SAMPLES = 1024


def hw(x):
    """Half-width of the duct at x: the taper, 0.59 at the mouth to 0.51."""
    return HALF_Z_BLIND + (HALF_Z_MOUTH - HALF_Z_BLIND) * (x + HALF_LENGTH) / (2 * HALF_LENGTH)


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
        "SOFT": newmat("SOFT", C["SOFT"], 0.92),
        "NOSE": newmat("NOSE", C["NOSE"], 0.55),
        # The one lamp the room owns: small, amber, at the blind end - the
        # legacy room's SETTLEMENT pool. A Cycles room has no free ambient,
        # so what the legacy room got from a 0.32 hemisphere this lamp has to
        # earn: high strength on a small plate is a dim pool, not a blaze.
        "AMBER": newmat("AMBER", C["AMBER"], 0.40, emit=C["AMBER"], strength=48.0),
        # The mid-run diffuser: the plot's cream fitting at a fraction of its
        # strength, so the duct is legible without ever competing with it.
        "DIMDIFF": newmat("DIMDIFF", C["CREAM"], 0.40, emit=C["CREAM"], strength=9.0),
        # The trunk's inspection strip: a hairline, so its job is glow along
        # a line rather than illumination of a place.
        "STRIP": newmat("STRIP", C["CREAM"], 0.40, emit=C["CREAM"], strength=4.0),
        # Bake-only: the light standing in for the flight deck seen through
        # the mouth. Never exported; the runtime's doorway does this for real.
        "SPILL": newmat("SPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=7.0),
        # The aft hatch's stand-in is a fraction of the mouth's: a 1.02 m
        # crawlway lets a sliver of the spur's light through, not a doorway's
        # worth. At the mouth's 7.0 the blind end read bright amber and 8780
        # px of it landed inside the accent ball (gate run, 2026-09-06).
        "LOWSPILL": newmat("LOWSPILL", C["CREAM"], 0.50, emit=C["CREAM"], strength=1.5),
    }


def taper_quad(x0, x1, side, r0, r1):
    """A plan quad on one side wall between x0..x1, radial offsets r0 (near
    the room) to r1 (buried), following the taper. side is +1 (starboard,
    +z) or -1 (port, -z)."""
    return [
        (x0, side * (hw(x0) + r0)),
        (x1, side * (hw(x1) + r0)),
        (x1, side * (hw(x1) + r1)),
        (x0, side * (hw(x0) + r1)),
    ]


def build_room(M):
    # --- Side walls: three bands per level per side, struck from the LOCAL
    # deck. Reliefs are radial: kick 0.06 into the room, work 0.08 away,
    # crown 0.14 into the room - and the crown vanishes on the 0.6 deck.
    # Each band's backing must reach PAST the face of the band above or below
    # it, or the joint is a slot to space: the crown stands proud at -0.14 and
    # the work band is recessed to +0.08, so a crown backed only 0.20 deep
    # stops at +0.06 and leaves a 2 cm gap at the work-top line that a rising
    # sightline threads, out past the ceiling's edge into the void. The kick
    # never leaked for exactly this reason - its 0.20 reaches +0.14. Found by
    # the airtight gate as 4,082 pixels of space through a sealed pose.
    for (x0, x1, deck) in LEVELS:
        work_top = min(deck + WORK_H, CEILING_Y)
        bands = [("kick", deck, deck + KICK_H, -0.06, THICK, "KICK"),
                 ("work", deck + KICK_H, work_top, +0.08, THICK, "LINER")]
        if deck + WORK_H < CEILING_Y:
            bands.append(("crown", work_top, CEILING_Y, -0.14, 0.34, "CROWN"))
        for side, tag in ((+1, "s"), (-1, "p")):
            for bname, y0, y1, relief, depth, mat in bands:
                gprism(f"w-{tag}{deck:.1f}-{bname}",
                       taper_quad(x0, x1, side, relief, relief + depth),
                       (y0, y1), M[mat])

    # --- Deck platforms: one solid slab per level, sealed under the walls,
    # each step face arriving free with the slab's own thickness.
    for (x0, x1, deck) in LEVELS:
        gprism(f"deck-{deck:.1f}",
               [(x0, hw(x0) + 0.24), (x1, hw(x1) + 0.24),
                (x1, -(hw(x1) + 0.24)), (x0, -(hw(x0) + 0.24))],
               (-0.12, deck), M["DECK"])

    # --- Ceiling, flat the whole run.
    gprism("ceiling",
           [(-HALF_LENGTH, hw(-HALF_LENGTH) + 0.24), (HALF_LENGTH, hw(HALF_LENGTH) + 0.24),
            (HALF_LENGTH, -(hw(HALF_LENGTH) + 0.24)), (-HALF_LENGTH, -(hw(-HALF_LENGTH) + 0.24))],
           (CEILING_Y, CEILING_Y + 0.12), M["CROWN"])

    # --- The mouth: the doorway is the duct's whole cross-section up to seam
    # height, so the end wall is just the header above it.
    gbox("mouth-header", (HALF_LENGTH, HALF_LENGTH + 0.10), (SEAM_H, CEILING_Y),
         (-HALF_Z_MOUTH - 0.24, HALF_Z_MOUTH + 0.24), M["END"])
    # Bake-only spill and a bake-only cap behind it; see roomlib.join_room.
    gbox("sky-mouth", (HALF_LENGTH + 0.015, HALF_LENGTH + 0.020), (0.0, SEAM_H),
         (-SEAM_W / 2, SEAM_W / 2), M["SPILL"])
    gbox("cap-fore", (HALF_LENGTH + 0.04, HALF_LENGTH + 0.12), (0.0, SEAM_H),
         (-HALF_Z_MOUTH - 0.24, HALF_Z_MOUTH + 0.24), M["END"])

    # --- The blind end is blind no longer (Deck One, owner direction
    # 2026-09-05): the bolted blank finally unbolted, and a low hatch - 1.02
    # by 1.86 over the 0.6 deck, all this ceiling allows - lets onto the
    # science spur. The wall remains; the doorway is cut through it.
    blind = gbox("blind-wall", (-HALF_LENGTH - 0.10, -HALF_LENGTH + 0.005), (0.0, CEILING_Y),
                 (-HALF_Z_BLIND - 0.24, HALF_Z_BLIND + 0.24), M["END"])
    LOW_W, LOW_H = 1.02, 1.86
    c_aft = gbox("c-aft", (-HALF_LENGTH - 0.5, -HALF_LENGTH + 0.5), (0.6, 0.6 + LOW_H),
                 (-LOW_W / 2, LOW_W / 2), M["JAMB"])
    boolean_diff(blind, [c_aft])
    bpy.data.objects.remove(c_aft, do_unlink=True)
    gbox("cap-aft", (-HALF_LENGTH - 0.20, -HALF_LENGTH - 0.12), (0.6 - 0.15, 0.6 + LOW_H + 0.20),
         (-LOW_W / 2 - 0.30, LOW_W / 2 + 0.30), M["END"])
    gbox("sky-aft", (-HALF_LENGTH - 0.115, -HALF_LENGTH - 0.110), (0.6, 0.6 + LOW_H),
         (-LOW_W / 2, LOW_W / 2), M["LOWSPILL"])

    fit_out(M)


def fit_out(M):
    # --- Six ring frames. Uprights to the local band top, header at the
    # crown, and a deck rib at the stations that are not step edges.
    def deck_at(x):
        for (x0, x1, deck) in LEVELS:
            if x0 <= x <= x1:
                return deck
        return 0.6 if x < 0 else 0.0

    for s in FRAMES:
        deck = RISERS.get(s, deck_at(s))
        top = min(deck + WORK_H, CEILING_Y)
        z1 = hw(s) - 0.007
        z0 = z1 - 0.10
        for side, tag in ((+1, "s"), (-1, "p")):
            gbox(f"fr-{tag}{s:+.1f}", (s - 0.045, s + 0.045), (deck, top),
                 (min(side * z0, side * z1), max(side * z0, side * z1)), M["TRIM"])
        gbox(f"fr-h{s:+.1f}", (s - 0.045, s + 0.045), (2.475, CEILING_Y),
             (-z0, z0), M["TRIM"])
        if s not in RISERS:
            gbox(f"fr-r{s:+.1f}", (s - 0.04, s + 0.04), (deck, deck + 0.05),
                 (-(z1 - 0.105), z1 - 0.105), M["TRIM"])

    # --- Nosings: a pale lip on each step edge, the only bright thing at
    # floor level - what the foot finds before the eye does.
    for x, upper in RISERS.items():
        z = hw(x) - 0.14
        gbox(f"nose{upper:.1f}", (x - 0.095, x - 0.005), (upper, upper + 0.025),
             (-z, z), M["NOSE"])

    # --- The cable trunk, one run on the port wall, level while the deck
    # climbs - which is what makes the climb legible.
    for i, (x0, x1) in enumerate([(-3.53, -3.055), (-2.945, -1.855), (-1.745, -0.655),
                                  (-0.545, 0.545), (0.655, 1.745), (1.855, 2.945),
                                  (3.055, 3.40)]):
        mid = (x0 + x1) / 2
        # Rooted in the recessed work face, standing 0.13 proud of the datum.
        gbox(f"trunk-{i}", (x0, x1), (1.88, 2.05),
             (-(hw(mid) + 0.081), -(hw(mid) - 0.129)), M["TRIM"])
        # The inspection strip riding the trunk: a hairline of cream along the
        # whole run. It is most of what the ceiling ever receives - without it
        # the crown was one flat value for thirty percent of a frame, which
        # the flatness gate refuses - and it is why the cable run reads as a
        # RUN from every pose, the way the legacy room's level line intended.
        gbox(f"strip-{i}", (x0 + 0.02, x1 - 0.02), (2.05, 2.062),
             (-(hw(mid) - 0.105), -(hw(mid) - 0.125)), M["STRIP"])

    # --- Handrails on the same wall, one per reach, at hand height off the
    # LOCAL deck.
    for i, rx in enumerate([-2.4, -1.2, 0.0, 1.2, 2.4]):
        deck = deck_at(rx)
        # The bar floats a hand's depth off the datum; the arms root it in
        # the recessed work face behind.
        gbox(f"rail-{i}", (rx - 0.31, rx + 0.31), (deck + 1.02, deck + 1.065),
             (-(hw(rx) - 0.063), -(hw(rx) - 0.108)), M["FOIL"])
        for ax in (rx - 0.28, rx + 0.28):
            gbox(f"rail-{i}-arm{ax:+.2f}", (ax - 0.015, ax + 0.015),
                 (deck + 1.02, deck + 1.05), (-(hw(rx) + 0.081), -(hw(rx) - 0.09)), M["FOIL"])

    # --- Stowage on the starboard wall: soft bags under straps, sized and
    # placed as in the legacy room.
    STOWED = [(-2.870, -2.370, 0.6, 0.72, 1.24), (-2.310, -1.890, 0.6, 0.72, 1.18),
              (-1.650, -1.190, 0.6, 0.72, 1.22), (-0.530, -0.030, 0.4, 0.52, 0.96),
              (0.070, 0.490, 0.4, 0.52, 1.06), (0.940, 1.420, 0.2, 0.32, 0.80)]
    for i, (x0, x1, _deck, y0, y1) in enumerate(STOWED):
        mid = (x0 + x1) / 2
        zin = hw(mid) - 0.22
        gbox(f"stow-{i}", (x0, x1), (y0, y1), (zin, zin + 0.20), M["SOFT"])
        gbox(f"strap-{i}", ((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02),
             (y0 - 0.01, y1 + 0.01), (zin - 0.006, zin + 0.21), M["TRIM"])

    # --- The perch near the mouth, and the one loose bag - the room's only
    # two sentences of dressing.
    gbox("perch", (2.30, 2.92), (0.62, 0.655), (0.2156, 0.5556), M["SOFT"])
    gbox("perch-bracket", (2.55, 2.67), (0.28, 0.62), (0.3383, 0.5583), M["TRIM"])
    gbox("perch-loop", (2.40, 2.82), (1.36, 1.40), (0.4667, 0.5067), M["TRIM"])
    gbox("loose-bag", (0.085, 0.505), (0.40, 0.72), (-0.12, 0.22), M["SOFT"])

    # --- The overhead duct running into the blank, and the two lamps.
    #
    # The legacy room hangs one amber lamp on the port wall and lets a 0.32
    # hemisphere light do the rest. A path-traced room has no hemisphere: a
    # wall-mounted lamp grazes its own wall, and the first bake left the whole
    # port side clamped at the light floor - 32% of the blind pose in one
    # value bucket, refused by the flatness gate. So the amber pool hangs from
    # the crown where it can reach both walls, and one small cream diffuser -
    # the plot's own fitting, a third the size - sits over the middle step so
    # the climb reads. Still the dimmest room on the station, deliberately.
    gbox("duct", (-3.50, -2.62), (2.14, 2.42), (0.09, 0.37), M["TRIM"])
    gbox("duct-collar", (-3.53, -3.40), (2.10, 2.46), (0.05, 0.41), M["TRIM"])
    gbox("lh-blind", (-2.92, -2.60), (2.49, CEILING_Y), (-0.26, 0.02), M["TRIM"])
    gbox("lamp-blind", (-2.88, -2.64), (2.475, 2.49), (-0.22, -0.02), M["AMBER"])
    gbox("lh-mid", (0.76, 1.08), (2.49, CEILING_Y), (-0.20, 0.08), M["TRIM"])
    gbox("lamp-mid", (0.80, 1.04), (2.475, 2.49), (-0.16, 0.04), M["DIMDIFF"])


def inside_vessel(p):
    """p is a BLENDER point. True if it is in the duct's open volume."""
    gx, gy, gz = p.x, p.z, -p.y
    if abs(gx) > HALF_LENGTH - 0.01 or abs(gz) > hw(gx) - 0.01:
        return False
    deck = 0.0
    for (x0, x1, d) in LEVELS:
        if x0 <= gx <= x1:
            deck = d
            break
    else:
        deck = 0.6 if gx < 0 else 0.0
    return deck + 0.01 < gy < CEILING_Y - 0.01


def main():
    fresh_scene()
    world(COLOURS["VOID"])
    M = materials()
    build_room(M)
    bevel_everything()
    produce("CRAWL", "crawl", inside_vessel, ATLAS, BAKE_SAMPLES, "build_crawl")


if __name__ == "__main__":
    main()
