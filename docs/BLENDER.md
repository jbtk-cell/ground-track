# Rooms built in Blender

This document is a REPORT, not direction. docs/INTERIORS.md still governs how
rebuilt rooms look. It records two stages of work: the experiment of
2026-09-03 (build THE PLOT a second time in Blender, mount both, compare), and
the adoption of 2026-09-04 at the owner's request - the Blender flight deck
promoted to a real station compartment, THE CRAWL and THE BEND rebuilt the
same way, and all three walked as one continuous station.

## Where things stand

Three of Station Kepler's twelve compartments are Blender-built: `plot`,
`crawl` and `bend`, exactly the three that touch (the crawl hangs off the
plot's spur, the bend off its aft door). `rooms.html#station` walks the whole
station with those rooms in place; `rooms.html#plot-blender`, `#crawl-blender`
and `#bend-blender` mount each alone. The hand-built twins remain in the
catalogue (`#plot`, `#crawl`, `#bend`) for comparison.

The pipeline is split in two:

- `tools/blender/roomlib.py` - everything every room shares: coordinate
  mapping, box/prism builders, booleans, bevels, the visibility cull, the
  two-UV unwrap, the Cycles bake, the lightmap write, the glTF export. A
  defect fixed here is fixed for every room at once.
- `tools/blender/build_plot.py`, `build_crawl.py`, `build_bend.py` - one per
  room, each owning only its PLAN: numbers copied from the room's src/env
  twin, its materials, its geometry, its lamps. Building a fourth room is a
  new plan file, not a new pipeline.

Run any of them headless; nothing takes over the screen:

    blender --background --python tools/blender/build_crawl.py

Each writes `public/blender/<room>.glb` and `<room>-lightmap.png`.
`GT_BAKE_SAMPLES=16` in the environment smoke-tests a whole build in about a
minute without pretending to be a bake.

On the runtime side, `src/env/blender/loader.ts` fetches assets and swaps
materials for the unlit-plus-lightmap pair; `plot.ts`, `crawl.ts` and
`bend.ts` are full `CompartmentDefinition`s - ports, declared solids, hull
test, floors, caps toggled by `sealPort()` - so the station places and tests
them exactly as it does hand-built rooms. Their build() constructs the whole
testable contract with no assets on hand (the room tests run in Node); the
registry awaits the fetch before any real mount.

## What the adoption established, beyond the experiment

**A Blender room can be a first-class compartment.** All 80 room tests hold:
ports match their declarations, solids clash with nothing, everything stays
inside `contains()`, no room but the anchor paints, the seams are continuous
floor. The station neither knows nor cares that three of its rooms are files.

**The screens are shared, not duplicated.** The .glb no longer models screen
content. The runtime lays the same procedural instrument geometry the
hand-built console uses (`src/env/kit/instruments`: text rows, trace, bar
graph, chip runs) proud of the Blender bank face, and the model contributes
one hidden emissive plate per face so the Cycles bake still receives the
screens' light. One source of truth for what the screens say; two rooms that
say it. Canvas textures were never an option - docs/INTERIORS.md bans Canvas
2D outright because Skia rasterisation drifts across Chromium versions,
straight into the CI pixel baselines.

**Doorway caps belong to the runtime, not the model.** Whether a seam is a
doorway or the end of the station is decided after layout, so a cap baked
into the mesh could never be removed when rooms join. The build scripts keep
bake-only cap objects (they seal the bake so light cannot leak and reveals
receive honest bounce) but exclude them from the export; the runtime builds
its own plates and shows them only while a port leads nowhere.

## Things that cost time this round, so the next room does not pay

**The parked texel must actually be reserved.** Hidden faces are kept and
parked on one lightmap texel - but the packer fills the whole unit square,
so "a texel in the corner" landed inside a bright island and the crawl's
blind-end walls rendered flat pale. The islands are now scaled to leave the
corner genuinely empty; the empty corner bakes at the light floor, so a
parked face renders very dark, never bright.

**A Cycles room has no free ambient.** The legacy crawl is lit by a 0.32
hemisphere light that reaches everywhere by fiat. In a path-traced room every
photon comes from an authored emitter, and the first bake's blind end sat
entirely at the light floor - uniform, flat, readable as a defect. What a
legacy room gets for free, a rebuilt room's lamps must earn: the amber lamp
runs at emission strength 48 where 6 read as plausible on paper, and the mouth
carries a bake-only spill plate standing in for the flight deck next door.

**A band's backing must reach past the face of the band it meets.** The crown
stands proud at -0.14 with a 0.20 backing, the work band is recessed to
+0.08, and the 2 cm shortfall between them was a slot to space running the
whole length of both new rooms - the airtight gate saw thousands of void
pixels along a joint that looked like a shadow line. The kick band never
leaked for exactly this reason (its backing reaches +0.14), so the rule was
already in the geometry; now it is written down: crown backings are 0.34.

**Two coplanar caps shimmer.** The station adds its own generic blank to any
sealed port whether or not the room brought one, and its inner face laps
12 mm into the room - exactly where the first cut of the runtime cap plate
sat. The room's plate now stands 30 mm in, in front of the blank, and reads
as the room's own closure.

**The shot harness serves dist/, not public/.** A rebaked lightmap changes
nothing on screen until `npm run build` copies it in - which reads as "my fix
did nothing" and burns a diagnosis cycle on a file that was never loaded.

**Gates measured under a running bake measure the bake.** The playable gate
walks on real keys against wall-clock timers; with a 1024-sample bake holding
the GPU, every walk comes up short and every check fails differently per
run. Playability verdicts only count from an idle machine.

## What is not done

- The lightmaps are uncompressed PNG (about 8 MB across three rooms). Mesh
  and texture compression, and loading rooms on entry, all remain untouched.
- Collision, reach and the floor rectangles are still declared in TypeScript
  and copied by hand from the plan constants. Reading them out of named
  objects in the .glb would make the model the single source of truth.
- Nine legacy rooms remain hand-built. The crawl and bend were chosen because
  they adjoin the plot; the run beyond the bend (sill, gantry) is the natural
  next pair.
- The shots-diff baselines for the changed frames move by CI artifact, not
  locally; the branch carries new frames (`crawlb-*`, `bendb-*`) with no
  baseline until CI blesses them.
