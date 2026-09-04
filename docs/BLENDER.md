# Rooms built in Blender

This document is a REPORT, not direction. docs/INTERIORS.md still governs how
rebuilt rooms look; nothing here has been adopted. It records an experiment run
on 2026-09-03 at the owner's request: build THE PLOT a second time in Blender,
light it with Cycles, load it into the real runtime, and put the two side by
side at identical poses so the question "should rooms be authored in a DCC
tool" can be answered by looking rather than by arguing.

Both rooms are mounted in the viewer. `rooms.html#plot` is the hand-built one,
`rooms.html#plot-blender` is this one, same controls, same spawn, same poses.

## What the experiment found

**The runtime needed no change at all.** That is the headline and it was not
expected. src/env/kit/baked already established the contract "unlit material,
lightmap on uv1, 8 bits over a declared range" - and a Cycles DIFFUSE bake
with colour switched off produces exactly that. No shader, no material path,
no renderer change was required to accept a path-traced bake. The one number
that had to agree, LIGHT_RANGE, was already 2.2 in bake.ts and Cycles'
irradiance in this room measured a 99th percentile of 1.95.

**Blender's light is better; the hand-built room's content is better.** The
Cycles room has softer and more plausible falloff, real contact shadows in
every corner, and colour bleed off the warm liner that the CPU solver only
approximates with one bounce. The hand-built room has better instruments: the
readouts carry real drawn content, the console has dressing that took minutes
to write and would take longer to model. Neither is a knockout on this one
room. The argument for Blender is not that it wins today - it is that
modelling time buys much more there than in TypeScript, so the gap grows with
every hour spent.

**Determinism survives.** The concern was that a binary asset would make
frames irreproducible. The opposite is true: a .glb and a .png are fixed
files, so the frames are steadier than geometry generated at runtime. The
gates run against the Blender room unchanged - it is on the flatness gate's
rebuilt tier, and `plotb-console` is on the airtight gate's SEALED list.

**Download size is the real cost.** The hand-built room is a few kilobytes of
code. This one is a 1.2 MB .glb plus a 3.7 MB lightmap. Thirteen rooms at that
weight is a different kind of product for a child on a school laptop. Mesh
compression, compressed textures, and loading a room only when it is entered
all exist and none of them is free work.

## The pipeline

`tools/blender/build_plot.py` builds, lights, bakes and exports the room. It
runs headless, so nothing takes over the screen:

    blender --background --python tools/blender/build_plot.py

It writes `public/blender/plot.glb` and `public/blender/plot-lightmap.png`.
`src/env/plotBlender/index.ts` loads them and swaps every PBR material for the
unlit-plus-lightmap pair the runtime wants.

The room's plan lives at the top of the script in the same units as
src/env/plot, so a reviewer can check the model against the room it claims to
be. Building the other twelve is a copy of that file with a different plan
block, not twelve modelling sessions.

## Five things that cost time, so the next room does not pay again

**A boolean gives its cut faces the CUTTER's material slot.** A cutter with no
material leaves the door reveals and the porthole bores - the surfaces you
look straight at - on a null slot: no bake target and no albedo. Blender says
so in one line in a wall of warnings and carries on. `check_slots()` now
counts the faces on every empty slot and refuses to bake.

**Do not delete faces you think are hidden.** Deleting them puts a heuristic
between the player and open space, and when the heuristic is wrong they see
through the wall. Two rounds of holes to space came from this. Hidden faces
are now KEPT and simply given no atlas - their lightmap UVs are parked on one
reserved texel - so the resolution is reclaimed either way and a wrong guess
costs a slightly dark surface instead of a hole.

**Judge a face by samples across it, not by its centroid.** The ledge where
the kick band steps out to the work band is one quad 0.36 m deep of which only
the first 0.14 m is in the room. Its centroid is buried in the wall with the
band above it, so every ray from that one point is blocked and a plainly
visible ledge is called hidden.

**Keep the wall shell thin.** The porthole bore is cut through it, and every
millimetre of bore is tube between the eye and Earth. At 0.30 m the bore plus
a throat sleeve came to 0.46 m and the limb was occluded from half a metre
away. The deep-frame look comes from the collar standing proud INTO the room,
as in src/env/plot, not from wall thickness.

**A room with windows must expose `render()`, not `paint()`.** `paint()` is
the STATION's interface, called by the station on whichever room the player is
in. Mounted alone there is no station, so the exterior pass never ran and the
portholes showed the canvas clear colour: a flat navy disc that looks so much
like deep space the frame reads as correct. The flatness gate caught it - the
brightest pixel in a porthole close-up was 96 of 255, which no frame
containing a sunlit Earth can be.

## What is not done

- The lightmap is 3.7 MB uncompressed. Nothing has been done about size.
- The bake carries visible sampling noise in the crown; Blender does not run
  the render denoiser on bakes, so the only lever used was more samples.
- The readouts carry rows of figures as geometry, not drawn content. The
  hand-built room's instruments are better and it is not close.
- Collision, reach and the floor rectangles are still declared in TypeScript
  and copied by hand. Reading them out of named objects in the .blend is the
  obvious next step and would make the model the single source of truth.
- Only one room exists. The other twelve are untouched.
