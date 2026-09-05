# Rooms built in Blender

This document is a REPORT, not direction. docs/INTERIORS.md still governs how
rebuilt rooms look; docs/DIRECTION.md still governs the orbital frames. It
records three stages of work: the experiment of 2026-09-03 (build THE PLOT a
second time in Blender, mount both, compare), the adoption of 2026-09-04 (the
flight deck promoted to a real compartment, THE CRAWL and THE BEND rebuilt),
and the full rollout of 2026-09-04 at the owner's direction ("implement this
for all rooms, you can redesign them however you see fit"): every room whose
light is authored is now Blender-built and Cycles-lit.

## Where things stand

Eleven of Station Kepler's twelve compartments are Blender-built: `plot`,
`crawl`, `bend`, `sill`, `gantry`, `berth`, `racks`, `magazine`, `crown`,
`spine` and `crossing`. `rooms.html#station` walks the whole station with
those rooms in place; every room also mounts alone as `#<room>-blender`. The
hand-built twins remain in the catalogue for comparison.

THE LIMB DECK is the HYBRID (owner direction, 2026-09-05: "the first
original room is still of the old variation"). A baked lightmap is constant
in `t` and the limb deck's entire subject is light changing in `t`, so it
was never a candidate for the full treatment - instead it keeps its orbital
rig, its fixtures, its door and its window untouched, and takes from Cycles
only what the rig could never compute: an INDIRECT-ONLY bake of the lamp
troughs' bounce, added to the same Lambert materials as a lightmap. The
geometry is never re-modelled: scripts/export-limbdeck-shell.ts exports the
exact shell meshes buildShell() mounts, tools/blender/build_limbdeck.py
re-imports them, and the .glb that returns is the same shell with lightmap
UVs. Direct light is never in the map, so nothing is counted twice and
nothing goes stale when the orbit turns. The fetch is tolerant: missing
assets mount the legacy shell unchanged.

The pipeline is split in two:

- `tools/blender/roomlib.py` - everything every room shares: coordinate
  mapping, box/prism builders, booleans, bevels, the visibility cull, the
  two-UV unwrap, the Cycles bake, the lightmap write, the glTF export. A
  defect fixed here is fixed for every room at once.
- `tools/blender/build_<room>.py`, one per room, each owning only its PLAN:
  numbers copied from the room's src/env twin, its materials, its geometry,
  its lamps. Building a room is a plan file, not a pipeline.

Run any of them headless; nothing takes over the screen:

    blender --background --python tools/blender/build_crown.py

Each writes `public/blender/<room>.glb` and `<room>-lightmap.png`.
`GT_BAKE_SAMPLES=16` smoke-tests a whole build in about a minute. The shots
harness serves `dist/`, so `npm run build` after any rebake or nothing on
screen changes.

On the runtime side, `src/env/blender/loader.ts` fetches assets and swaps
materials for the unlit-plus-lightmap pair; each room's module under
`src/env/blender/` is a full `CompartmentDefinition` - ports, declared
solids, hull test, floors, caps toggled by `sealPort()` - so the station
places and tests them exactly as it did the hand-built rooms. build()
constructs the whole testable contract with no assets on hand (the room
tests run in Node); the registry awaits the fetches before any real mount.

## What the full rollout established

**Screens draw from the sim, models carry only their light.** Every readout
on the station - the plot's three instruments, the sill's salvage register,
the gantry's transfer board, the berth's and racks' manifests, the crossing's
offer queue - is runtime geometry from `src/env/kit/instruments`, laid proud
of a face whose .glb contributes one hidden emissive plate so the bake
receives the screen's light. The crown goes further: its regime rings derive
from `src/sim`'s live regime definitions, so they are runtime geometry too -
geometry that tracks data belongs where the data is.

**Cycles is an audit of the legacy lighting, and it fails the fakes.** Three
rooms' rigs turned out to be physically impossible and had to be redesigned
honestly:

- THE CROWN's "lightest upper wall" was a shadowless DirectionalLight's lie:
  an 0.85 m gallery ring SHADOWS the wall below it, so emissive panes alone
  gave dark courses and bounce-lit gallery undersides - the inversion
  inverted. Fixed in the station's own idiom: each gallery carries a cove
  strip under its outer edge and lights the course beneath it.
- THE MAGAZINE's earthshine beam was an analytic projection cut into the far
  wall's facets. Now the grating is genuinely open in the bake, a sun stands
  in for the planet at the same fifty degrees, and the barred rectangle, the
  crown-ledge step across it and the wash it throws back are physics. The
  runtime closes the hole with its own plenum panel - the doorway-cap split
  applied to a skylight. The sun also had to be SIZED like one: at the
  legacy-matched energy 4 the bars peaked at bake value ~1.0 against the
  2.2 write range - a whole room below luma 116, which the flatness gate
  caught. A sun that cannot clip at its own bar cores is not a sun; at 20
  the beam clips hot and its bounce is what grades the tall dark volume.
- THE SILL's sump lamp, mounted low as the legacy room had it, lit a puddle
  and left 4.5 m of drop reading as a black shaft; the room's own prose
  ("tucked under the lip") turned out to be the correct engineering, and the
  lamp now washes the pit from under the soffit.

**The gallery-seam caps needed wider margins.** A 2.10 m doorway plus an
oblique pose slips a grazing sightline past a 0.05 m cap margin at 0.03 m of
inset - found by the airtight gate as 548 pixels of space in gantryb-board.
All new rooms' cap plates carry 0.12 m side margins.

**A big flat emitter floods.** The gantry's wide-door spill at the crawl's
strength 7 was 4.8 m2 of plate and washed the nearest tank rank white; wide
doors carry their own spill material at a fraction of the strength.

## What the station scan of 2026-09-05 established

The owner reported layering glitches "where a new room meets another or on a
window", and a systematic scan (scripts/seam-poses.ts + seam-scan.mjs: both
sides of all eleven seams, axial and grazing, plus the window apertures)
found some at every seam. Three classes, three fixes:

- **A joint between two compartments is two wall cuts butted back to back,
  and neither room owns the joint.** Built separately, the cuts disagree by
  millimetres, and the disagreement renders as bright sliver leaks down the
  jambs at grazing angles, stitched z-fighting where planes coincide, and
  layered confusion over the headers. The fix is the blank's logic extended:
  the STATION owns what no room can know. Every joined port now carries a
  collar - a dark ring of boards straddling the cut edges, 0.2 m into its
  own room, butting the neighbour's ring at the seam plane (collarFor in
  station/index.ts). Ports with a real door keep their own joinery.
- **THE CROWN's aperture backing was a lid, not a ring.** The slab over the
  aperture rectangle blocked the pane cone from below - the room's key read
  as a dark soffit with a glowing outline - and left a 2 cm slot a shallow
  sightline could slip through into space; the pane-cap was also wound
  facing up, a hexagon of space at the top of the shaft. The slab now
  carries an elliptical hole cut INSIDE the cone's radius at the slab's top,
  so the slot dead-ends on emissive glass, and the cap faces down the shaft.
- **THE RACKS could not be walked by a body.** Legacy numbers left an 0.95 m
  aisle whose four open drawers rode out 0.51 m - past the centreline. The
  banks are now 0.90 m deep (the ISPR pitch along the wall is unchanged),
  the aisle is 1.25 m between faces, the open drawers ride out 0.30 m on
  staggered sides, and the worst pinch leaves 0.95 m of clear walk. The
  redesign also found the stray tote declared at a SHUT bay, floating in
  mid-air; it stands on bay p2's ridden-out drawer now.

## Things that cost time in earlier rounds, still binding

- **The parked texel must actually be reserved** (islands scaled to 0.97,
  park at 0.995) or hidden faces render in somebody else's light.
- **A Cycles room has no free ambient**: what a legacy hemisphere gave for
  free, authored emitters must earn.
- **A band's backing must reach past the face of the band it meets** or the
  joint is a slot to space. The shared-outer-plane wall scheme in the build
  scripts satisfies this by construction.
- **Two coplanar caps shimmer**: the runtime cap stands 30 mm in, in front
  of the station's 12 mm blank.
- **Gates measured under a running bake measure the bake**: playability
  verdicts only count from an idle machine.

## Deck One (2026-09-05)

The expansion quadrupled the station (see docs/DECKONE.md): forty-one
generated rooms build through tools/blender/build_generated.py from
deckplan.json - one builder, one record per room, the same banded-wall
grammar as the bespoke rooms. The limb deck's hybrid gained THE WARM PASS:
the exporter maps its slate palette onto the interiors ramp by luminance
(src/env/limbDeck/warm.ts), the fixtures follow at mount, and the room
finally sits in the same palette as everything it opens onto. The station
also grew collarFor's sibling for LOCKED doors: one blank per locked seam
(two fought for pixels), removed live when the key turns.

## What is not done

- The lightmaps are uncompressed PNG (tens of MB across eleven rooms).
  Compression and on-entry loading remain untouched.
- Collision, reach and floor rectangles are still declared in TypeScript and
  copied from the plan constants by hand.
- THE LIMB DECK's hybrid (baked ambient under live orbital keys) is designed
  nowhere and deferred deliberately; see above.
- The shots-diff baselines for the changed frames move by CI artifact; the
  branch carries the new `*b-*` frames with no baseline until CI blesses
  them.
