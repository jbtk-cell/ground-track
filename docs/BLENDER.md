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

THE LIMB DECK is the deliberate exception, and the reason is architectural
rather than unfinished work. A baked lightmap is constant in `t`, and the
limb deck is the one room whose entire subject is light changing in `t`: the
sun walks the deck once per revolution, the eclipse guts it, the dial tracks
the bearing, the motes hang in the beam, and the pinned poses (deck-noon
against deck-eclipse) measure exactly that change. Its light already IS a
physical simulation - the game's own sun - which is what the Cycles rebuild
gives the other rooms. Freezing it into a texture would make the showpiece
worse. It stays on DIRECTION.md's orbital rig. If it is ever to join the
baked rooms it needs a designed hybrid (Lambert materials taking a baked
ambient term under the live orbital keys), which is an architecture decision
for the owner, not a gap.

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
