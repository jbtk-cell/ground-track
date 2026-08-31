# INTERIORS - the interior direction

This document governs how the inside of the station looks. It exists because
the original art direction was designed for looking at Earth from orbit and
was then applied to rooms, where its rules are actively hostile - the full
diagnosis is docs/HANDOFF.md section 6. The orbital direction in
docs/DIRECTION.md is untouched and still binding for every exterior frame.
This file is binding for every interior frame of a REBUILT room, and rooms are
rebuilt one at a time (`scripts/lib/regimes.mjs` lists which).

## The owner decisions this rests on

Made by Johnny on 2026-08-31, by name, when asked which of the old bans he
still wanted indoors:

- **Textures and normal relief: allowed indoors.** The reference's density
  comes from surface detail everywhere at once; a two-metre panel that is one
  flat colour was the root cause of the diagram look.
- **Emissive glow: allowed indoors.** Lamps and screens may read as emitting,
  and may be the brightest thing in frame.
- **Near-black: allowed indoors.** The value floor drops from VOID_SLATE
  (luma ~25) to luma 5. Pure black (0,0,0) remains banned everywhere - the
  no-black identity survives as "black is an absence, near-black is a value".
- **Real shadows and ambient occlusion: required.** Not optional, any
  implementation.
- **First room: the flight deck (`plot`), rebuilt clean.**
- **Colour: warm cabin from the palette's warm end** - FOIL `#B99A63`,
  DAWN_SAND `#D9C9A6`, CAUTION_RUST `#A8624B` - with MINT `#C6DCCC` screens
  as the cool counterpoint. No new named colours.

What did NOT change indoors: no red; ACCENT `#D98A3C` on exactly two things
game-wide; no HUD; the typography rules; the camera never cuts; the arm's
promise; no score or percent anywhere; pure `src/sim`; no emoji.

## The architecture: light is baked

All interior light is computed offline on the CPU - direct light from area
sources with soft shadows, ambient occlusion, one bounce of colour bleed, and
a filmic shoulder - into a per-room lightmap atlas, then rendered with unlit
materials that multiply albedo by baked irradiance. Chosen over a runtime rig
by a three-judge panel, unanimously, for two reasons:

1. **It is the reference's look.** Soft area shadows, corner occlusion, warm
   bounce and filmic rolloff are the output of a global-illumination solve.
   No runtime rig this project is allowed to run produces them.
2. **Determinism by construction.** The bake is seeded CPU arithmetic; the
   runtime consumes a static texture through unlit materials. CI's software
   rasteriser is left drawing textured quads - its best case. The shadow-map
   ban (ENVIRONMENTS.md non-negotiable 2) stays in force and is simply not
   needed.

Consequences, stated so nobody trips on them:

- Room surfaces use `MeshBasicMaterial` (vertexColors x albedo map x
  lightMap). **Nothing else in a rebuilt room's static geometry is lit.**
  The arm alone keeps a Lambert rig, fitted per frame from baked light probes
  so it sits in the same light as the room.
- Textures are **seeded DataTextures generated from pure math** - never
  Canvas 2D (Skia rasterisation differs across Chromium versions), never
  committed image assets. Same seeded-generation law for halo sprites and
  height fields.
- Room irradiance is constant in `t`; `update(t)` animates screens, chips,
  motes and the exterior only. Dynamic room light, when gameplay needs it,
  is the HINGE PATTERN: shadowless PointLights that affect only lit props and
  the arm (unlit room surfaces cannot receive them, so they cannot leak), and
  additive overlay quads for events - a card printing, a live burn. The room
  stays baked; events glow over it.
- Glow is authored, not postprocessed: bright diffuser cores in the albedo,
  baked halo gradients on adjacent surfaces, and a few additive halo quads
  with depth-test on and depth-write off. The eslint postprocessing import
  ban stays exactly as it is.

## Value structure - the numbers a rebuilt room must hit

Measured on rendered bare frames (no DOM rail; shots presets set `bare`),
luma out of 255:

- Near-black (5-16) lives in joints and voids only: recesses, collar
  interiors, porthole throats, under furniture, crown pockets. **8-15% of the
  hero frame**, never a large open field.
- Warm mid-field (kick and work bands, lit liner): **50-65% of frame**,
  90-150 lit, falling to 45-70 in occluded corners, with at least ~35 values
  of gradient across any single large face - a flat face is the old failure.
- Emissives: screens 190-215 (their content, 5-10% of frame), lamp diffuser
  cores 235-245. **No pixel above 253** - glow saturating to white is the bug.
- Every lamp must measurably raise its 1 m surround by >= 25 luma versus the
  same surface 2 m away - "lamps illuminate nothing" was the measured failure.
- Histogram: no single 8-value bucket over 25% of the frame; spread >= 150.
  These are enforced by the flatness gate's rebuilt tier.
- Through any window, Earth's lit limb holds 30-40% of the aperture (the
  compositional law, applied per window).

## Gates, scoped

- `palette` - two regimes: exteriors keep the VOID_SLATE floor; interiors
  floor at luma 5, pure black banned everywhere.
- `airtight` - the exact-VOID_SLATE sentinel stays, but a breach is now a
  4-connected blob >= 30 pixels, because near-black interiors can land on the
  sentinel by 8-bit accident one pixel at a time and a hole is a shape, not a
  speck. No interior material may be AUTHORED at VOID_SLATE, ever - that gap
  is what keeps accidents rare.
- `flatness` - two tiers: rebuilt rooms FAIL at flatness > 0.25 or
  spread < 150; legacy rooms warn at the old numbers until their rebuild.
- `accent`, `seams`, `playable`, `shots-diff`, the eslint bloom-import ban:
  unchanged.
- Every rebuilt room's shot set includes, by name: one coplanar z-fighting
  stress pose and off-centre poses near each door - the two checks the owner
  made permanent - plus its bare metric poses.

## Replication - the recipe for the next twelve rooms

The kit owns the machinery (atlas allocation, baker, seeded textures, glow
helpers, probe grid). A new room supplies what it already supplies today -
solids, floor rects, ports, POIs - plus a lamp list and per-surface texel
density tags, then iterates against the value targets above using the
measurement loop. The one per-room judgment that does not automate is lamp
placement and the hero frame's light structure - which is exactly the judgment
a lighting pass should spend. Graduating a room is one line in
`scripts/lib/regimes.mjs` plus its poses.

Windowed rooms: in solo mount every room is its own station anchor, so real
space through portholes uses the cupola's proven two-pass scissored recipe.
In full-station mount only the anchor room may run its exterior pass today;
non-anchor windowed rooms need either a painted-pane fallback or a
placement-aware painter - an architecture decision deferred, flagged, and not
blocking solo delivery.
