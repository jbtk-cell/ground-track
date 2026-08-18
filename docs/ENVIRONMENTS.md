<!--
Environment system + the first room, specified 2026-08-01.
Design synthesized from 3 proposals and 2 judge lenses; winner THE LIMB DECK
(9/10 art fidelity, 8.5/10 buildability). This file is the build contract:
it records the design AND the corrections the judges forced on it.
-->

# Environments

An **environment** is a place the player stands in and walks around. Each one is
a self-contained module implementing `EnvironmentHandle` (`src/env/types.ts`).

**Environments are built separately from the game.** They are built, viewed and
approved one at a time through the standalone viewer at `rooms.html`, which
mounts exactly one environment and nothing else. No environment imports game
state. An approved environment is later mounted by the game unchanged - the
separation lives in the viewer, not in the room.

**But the station is where the game is played.** Owner decision, 2026-08-18,
recorded here because until now this file said "separate from the game" and
STRUCTURE.md described the whole game as a camera and a card with no station in
it - and a set of rooms built against those two sentences is a set of rooms with
nothing to do in them. That is exactly what an outside review found: "it is not
currently worth walking through."

So every compartment houses one thing the player does, and the room list is
derived from STRUCTURE.md's systems rather than from architecture alone. THE PLOT
is where the PAD prints and the number is typed. THE CROSSING posts the offer
queue. THE CROWN holds the regime map and the coverage quilt. THE RACKS hold
hardware and the manifest, THE GANTRY the propellant, THE SILL the salvage
register, THE BEND the frame album, THE MAGAZINE the deep-space probe's late
check-in, THE BERTH the resupply. THE CRAWL houses nothing, deliberately - it is
the compression that makes the room after it read as big.

The build-time separation above still holds and still matters: a room is
approved alone in the viewer, and no room imports game state. What changed is
where an approved room ends up, and therefore what a room is FOR.

## Non-negotiables

1. **Determinism.** `update(tSeconds)` takes an absolute time and every animator
   is a pure function of it. No `Date.now()`, no `performance.now()`, no
   accumulated state, no un-seeded `Math.random()` at any point after build.
   Seeded values use the same LCG idiom as `starfield.ts`. The screenshot
   harness pins the clock; one latched animator makes the pixel-diff gate flap
   forever.
2. **No shadow maps.** CI renders under software-rasterised Chromium, where a
   one-ULP depth difference flips a whole flat facet's shadow state - a huge
   pixel delta the diff gate cannot absorb. Cast light is drawn as **analytic
   geometry** instead: the shaft through an aperture is the aperture rectangle
   projected along the sun vector onto the receiving plane, which is exact,
   cheap, hard-edged, and truer to flat-shaded art than a soft PCF edge.
3. **Interior materials floor at `NIGHT_SIDE` with `emissiveIntensity` 1.0**,
   not the 0.62 used by `earth.ts` and `satellite.ts`. Outdoors the ambient,
   hemisphere and fill terms add on top everywhere; indoors an unlit facet has
   only its emissive, and 0.62 lands at luma 21.3 - under the palette gate's
   floor of 25.45. Do not share a material helper with the exterior modules,
   and say why in the comment, or someone will "normalise" it back.
4. **Every animation has a named physical cause.** Orbital motion, thermal
   contraction, cabin airflow, machinery. Nothing moves because movement is
   nice.
5. All geometry is authored in code. There is no asset pipeline.
6. `docs/DIRECTION.md` holds. No bloom, no black, no red, hairline weights, and
   `#D98A3C` only on a primary action or a live burn - which means **zero
   accent pixels in a room with neither**.

## Coordinates and units

Metres, right-handed, origin at the centre of the deck surface.
**+X ram (forward), +Y zenith (up, away from Earth), +Z starboard.**
The station holds LVLH nadir-hold attitude, so Earth is always at −Y.

## The orbital clock

`src/env/orbit.ts` is **pure** (no three.js, no DOM, no clock) and tested.

- Circular orbit, 400 km: `T = 5553 s`. Playback is **20x**, so one revolution
  is 277.7 s of wall time.
- Sun direction in station frame, beta angle `B`:
  `s(phi) = (-cos B sin phi, cos B cos phi, -sin B)`
- **The judges caught a frame error in the source design and it must not be
  reproduced.** With this formula `s_z` is constant, so the sun revolves about
  **+Z (cross-track)**, not about the module's long axis. Test accordingly:
  assert `|s| = 1`, `s . zhat` constant across a revolution, and exactly one
  revolution about +Z per orbit. The fore-to-aft shaft walk is correct; the
  axis prose in the original design was not.
- A consequence: at constant beta the sun stays permanently to port. **The
  starboard scuttle from the original design is cut** rather than built on
  geometry that cannot produce it.
- Eclipse fraction at `B = 38 deg`, 400 km: **0.359**. Beta cutoff (no eclipse
  above it): `asin(6378/6778) = 70.2 deg`. Horizon depression: 19.8 deg. Derive
  these in code and pin them with tests - a wrong beta silently rewrites the
  room's whole light story and nothing on screen announces it.
- Sub-satellite latitude/longitude is a function of orbital phase and comes out
  of this pure module. The renderer may look up a colour for it; it may not
  recompute orbital geometry at draw time (invariant 3).

## THE LIMB DECK - the first room

A 6.4 m pressurised module with a canted observation bay in the port hull.
Because the station keeps its belly to Earth, the sun walks the length of the
deck once per revolution: a shaft born low on the aft bulkhead at orbital
sunrise, dying on the forward bulkhead ninety-three minutes later. That is the
existing grazing-key rig - the one that fractures the low-poly Earth into
separable facet values - pointed at a ceiling.

### Shell

Half-cylinder, inner radius 2.10 m, axis along X at `y = +1.15, z = 0`, only
the `y >= 0` portion. Flat bulkheads at `x = -3.20` (aft) and `x = +3.20`
(fore). **32 circumferential x 16 axial = 384 quads, non-indexed, flat-shaded,
one colour per facet**, built the way `earth.ts` builds the planet. Those 384
facets stepping in value in a slow arc overhead are the point of the room.

Deck: flat plate at `y = 0`, `x` in [-3.10, +3.10], `z` in [-1.757, +1.757]
(the exact chord at that height) - 6.20 x 3.51 m walkable, 3.25 m headroom at
the centreline. A 16 x 8 panel grid with hairline seams and a +/-3 mm fbm warp
so it fractures faintly under raking light instead of reading as one dead
rectangle.

Surfaces: ceiling arc `HULL`; port and starboard below the standoffs
`HULL_SHADOW`; four longitudinal standoff channels at +/-45 and +/-135 degrees
in `HULL_SHADOW` carrying `ARRAY` cable trays and lamp troughs with `CLOUD`
diffusers (emissive `CLOUD` at 0.55 - bright because they are bright, not
glowing); deck `HULL_SHADOW` with `HULL` seams.

### The cupola

Hull cut 1.30 m along X by 0.90 m of circumference, centred at
`x = -0.60, y ~ 1.59, z = -2.047` (65.4 to 90.0 degrees from zenith, port).
A collar walks that rectangular cut out along the hull's own radials to the
base hexagon of a dome built as an **intersection of planes**, so facet aim and
dome footprint stay independent. Seven panes: a view pane cut across the top,
aimed at the limb, and six side facets around it. Each pane carries a 5 cm
mullion band and a 4 cm `HULL_SHADOW` reveal to the glass; that dark hairline is
what makes the window read as a hole rather than a picture.

**Why a dome and not a pane.** The first build was a single pane canted 15
degrees below horizontal, and it could not work: a window aimed at Earth admits
no sunlight, because the sun is never where Earth is. At beta 38 the sun sits
64-67 degrees off a limb-aimed normal for most of a revolution, and 0.52 m of
throat depth at that incidence walks the beam 1.03 m across an aperture 0.74 m
tall, so nothing got through between sunrise and sunset and noon rendered
identically to eclipse. The six side-facet normals **are the sun vector** at
six orbital phases - `sunDirection(phase, beta)` out of `orbit.ts`, at phases
`[260, 310, 0, 50, 100, 180]`. Because the sun rides a 52 degree cone about the
port axis, putting the normals on that same cone makes coverage a measurement
rather than a guess: worst best-facing facet is cos 0.942, and 5 or 6 of the 7
panes face the sun at once. This is the same reason the real Cupola is a dome
and not a porthole.

The view pane still buys the downward look the cant was for: a cylinder's normal
at eye height points nearly horizontally, and the limb sits 19.8 degrees below
horizontal at 400 km.

Verify the framing at the interior FOV actually shipped (62 degrees, fixed -
never changed at runtime): Earth's lit surface should hold **30-40% of the
aperture**, which is DIRECTION's compositional law executed inside a window.

### Fixtures

Handrails (`MINT`, 0.019 m tube, 0.36 m long, 0.06 m standoff) as one
InstancedMesh: 8 along the port hull below the bay, 8 starboard, 4 on the
ceiling. A fold-down perch and foot restraint at the bay, 0.42 m deep,
`HULL_SHADOW` - it is what physically stops the player 0.55 m short of the
glass, which is exactly the standoff that frames the limb correctly.
Composition guaranteed by hardware rather than by an invisible rail.

An IMV duct along the port standoff ending in a 9-vane grille and impeller on
the fore bulkhead, with a telltale ribbon on the nearest handrail. A ceiling
conduit bundle with clamps. A grease pencil on a 0.40 m lanyard.

**Aft bulkhead: a closed 0.85 m circular hatch at `y = 0.95`** with six dogging
handles, a gasket ring and a `CAUTION_RUST` placard. This is the future door,
modelled from day one so that opening it later is a hinge animation and a
portal pass rather than a remodel. Beside it a 5x7 dot-matrix placard reading
`STATION KEPLER / NODE 2 / LIMB DECK`, and a 0.16 m sun-bearing dial whose
needle turns once per orbit past a 129-degree shaded eclipse wedge - the room's
clock. Fore bulkhead is a blank closeout reserved for door 2.

### The aft door

A pressure door that **lifts** on a button press, holds, and comes back down. It
replaces the swinging dogged hatch, which had to be reached past, unlatched, and
then left hanging in whichever compartment it opened into - three things standing
between the player and the next room, every single time they cross. A door that
goes straight up leaves a clean rectangle of floor and puts its whole mechanism
overhead where nothing else lives.

**Three leaves, because the opening has to be walked through and a door has to
go somewhere.** Clear opening is 1.99 m high by 1.07 m wide, measured where the
player actually walks - threshold to parked leaf, and between the rails, not the
hole the bulkhead was cut to, which is bigger than all of those. An earlier
version cleared the 1.74 m eye by 70 mm and was reported as "too small to walk
through", correctly: on paper it was a doorway, in the room it was a duck-under.
`DOOR_CLEAR` is now the published number and a test holds it a quarter-metre over
the eye.

A one-piece slab needs its own height again above the lintel, which is 4 m of
headroom in a module that has 3.2 - the first version drew its housing straight
out through the roof, invisible from every interior pose because you cannot see
the ceiling from under it. Two leaves halve that and still do not fit at this
height. Three do. They are geared to arrive together: every leaf reaches the head
at the same moment, so the bottom one travels the whole opening while the top one
travels a third of it, and the lower a leaf sits the faster it visibly runs.
`hullClearance()` in `shell.ts` and the envelope test in `tests/door.test.ts` are
what stop the housing-through-the-roof class of mistake recurring.

**It parks with 50 mm still showing** under the head. The pocket is behind the
bulkhead, so a door that retracted flush would go nowhere the player can see - it
would simply cease to exist, and the one thing the room asks you to believe is
that this is a slab that went upward.

**The door is not operable; its BUTTON is.** Reaching for a two-metre pressure
slab and having it move is a different and much worse promise than pressing the
thing that opens it.

**Behind it is a capped sleeve, and the cap is load-bearing.** The interior must
stay airtight from every reachable eye position - the exterior pass clears depth
before the room is drawn, so any hole shows space through the hull. When there is
a second compartment it attaches at the cap and the cap comes out. That is also
the seam the game will stream sections across.

**No two faces in this door share a plane, and that is enforced by a test.**

Two surfaces in the same plane, facing the same way, covering the same ground:
the depth buffer cannot choose between them and picks differently per pixel and
per frame. It renders as a fine comb of alternating values, or as a seam that
flickers when the camera moves - reported from the room as "glitching, some
layers overlap and it isn't clear which is above". Faces pointing OPPOSITE ways
in one plane are fine and common; a box resting on a box shares a plane, but only
one of the two is front-facing from any eye.

This shipped three times. The pocket's side cheeks landed on the bulkhead plane.
Fixing that by running the frame aft THROUGH the plane so it overlapped the
sleeve in solid material then put _their_ faces flush, down both sides of the
reveal, full height. The rails landed on the jambs the same way.

Eye is the wrong instrument: this door has several hundred face pairs. So every
solid is a record in one list, `doorParts()`, and `tests/door.test.ts` checks all
of them - in the shut state and the open one. The few-millimetre offsets through
that file are not fussiness; each is a plane that would otherwise be shared, and
`SLEEVE_INSET` is the general form of it. Two boxes occupying the same space is
fine. Two boxes whose faces land in the same plane is not.

The overlap-in-solid rule still stands where it applies: it is what removes the
slot a simple nudge backwards would leave for a grazing ray.

**How the hole gets cut.** The bulkhead is a polar fan and a doorway is a
rectangle, so no whole cell follows the edge: cells that straddle the doorway are
SPLIT, four ways, up to `CUT_DEPTH` times, and only cells that end up wholly
inside are dropped. The rule this replaced dropped any cell whose bounding box
touched the doorway, which was not an approximation but a different shape - this
doorway spans the fan's own hub, so every innermost triangle met the test and
went, and with them a 140-degree cone of bulkhead reaching 1.28 m out. Four holes
to space around the door, well outside anything a frame could cover. **A cell
test cannot cut a hole smaller than a cell.** `cutMargin()` publishes what the
staircase can actually be and `tests/door.test.ts` holds the frame's lap to it,
because the previous version of that number was a comment and it was wrong by a
metre.

The fan now closes the full circle. It used to stop at the chord, leaving a
V-shaped notch that three triangles fanned from the hub filled in - and those
were never cut by the doorway, so a hole in the bulkhead showed the notch fill
through it as a dark chevron rising a metre out of the floor. Closing the circle
deletes the special case rather than teaching it about doorways: one shape, one
cut, one tolerance. The wedges below the deck are free; nothing can see them.

Travel is 1.55 s. Under a second a two-metre door reads as cardboard; much over
two and the player is standing waiting, which is every airlock in every game.
`AFT_DOORWAY` lives in `shell.ts` because the pressure vessel decides where it
may be opened; the door is what gets fitted to the result.

**Sound.** A release clunk as the lock lets go, a motor bed whose level follows
the slab's own rate of change, and a heavier seat clunk as it arrives - fired at
BOTH ends of the travel, because a door that clunks only when it shuts sounds
like it is falling rather than being driven. The motor is the second synthesised
sound in the game and for the same reason as the room tone: it has to rise and
fall with something the player is watching move. The room publishes
`mechanism: { travel, speed }` (`env/types.ts`) and the viewer polls it - one
struct is a great deal less machinery than an event channel for a room with
exactly one moving thing in it.

### Open: where the gravity comes from

The deck has a floor and the player walks on it, and the game has not yet said
why. The intended answer is that this module is part of a spinning section, but
nothing in the room states it and nothing should until the fiction does. Worth
knowing before anyone adds a shot of the station from outside: whatever that
shot shows has to be consistent with a deck that has a down.

### Outboard structure

Visible through the bay, at metre scale in the interior scene so it occludes
Earth correctly: an array wing on a truss boom high on the zenith side and a
`CLOUD`-faced radiator further aft.

**Nothing is mounted ON the cupola, and nothing should be.** There used to be a
sun shutter hinged there, and it failed for a reason no amount of modelling
could fix: the panes are HOLES, not glass. The second pass draws the exterior
through the aperture rectangle, so there is no surface at the window - and
hardware hinged onto nothing reads as an object stuck to the middle of the view
with the sky visible straight through the place it is supposed to be attached
to. Put outboard hardware where the hull actually is, and leave the window as a
window. Removing it also took the room's only `FOIL` with it, which the accent
gate will not miss: lit MLI closes to about 39 in RGB distance from the single
accent against a ceiling of 25, and the margin was the emissive floor plus its
small area rather than the pigment.

**Everything out there is mounted on the hull, never through it.** Say the rule
as arithmetic, because it was got wrong twice: a mount point is the hull radius
**plus the fitting's own radius**, not the hull radius. The array boom's root was
a typed `(0.35, 3.0, -0.99)` - 2.098 m from the module axis, 2 mm inside a
2.1 m hull - carrying an 85 mm tube, so half the boom's cross-section lay in the
wall. The radiator strut was seated at inset 0, its centreline exactly on the
skin, straddling it 70 mm each way. That is the whole reason the hardware read
as pushed through the module rather than bolted to it, and the handrails in the
same file already knew better (`RAIL_STANDOFF`). Both now go through
`hullFoot()`, which lands a plate on the skin and stands a boss off it -
structure does not emerge from a wall, it lands on a fitting that spreads load.

**Detail is not decoration out there; it is scale.** A 5.6 m panel drawn as one
flat box has nothing in it to tell the eye how big it is or how far away, so it
reads as unfinished whatever colour it is. What fixes that is a _repeat at a
known pitch_:

- The boom is a **three-chord truss** - longerons, battens, and diagonals that
  alternate hand bay to bay so it reads as braced rather than as a ladder. It
  was one 85 mm tube with two struts, which from inside the bay is a grey stick.
  About 1200 triangles, and the largest single legibility win available.
- The panels carry a **5 x 12 cell grid** on a substrate that shows through the
  gaps, plus a spine and end battens on the shaded side, so there is structure
  to see from behind as well. Cells are split across three values, chosen from
  their own coordinates so the pattern is fixed and the shot harness renders it
  identically - the wing breaks up under a raking sun the way the hull does.
- The radiator face carries **flow tubes and end headers**. A 1.7 m unbroken
  `CLOUD` rectangle against Earth is a hole in the frame, not a panel.

### Sunglint

The sea reflects the sun. It is one specular term and nothing else - no bloom,
no sprite, no post pass, all three of which DIRECTION bans - and it is the only
thing visible from a window in low orbit that a purely diffuse planet cannot
produce.

Two decisions in it are worth keeping:

- **Water only.** A highlight sliding across a continent is a plastic planet.
  A material is per draw call rather than per facet, so `buildEarth` sorts ocean
  facets to the front of the buffer and adds two draw groups on the same
  geometry: ocean gets Phong, land stays exactly the Lambert surface it was. One
  extra draw call, one mesh, nothing to keep in step.
- **A broad lobe, not a tight one** (`shininess: 7`). A tight lobe is the
  textbook mirror and it renders as nothing at all here: the specular point
  falls outside what the cupola can see, so at `shininess: 140` the sea was
  identical with the term on and off. It is also wrong physically - real
  sunglint is spread over hundreds of kilometres by wave slope, which is why it
  photographs as a soft silver region rather than a point. Broad is both what
  works and what is true.

Measured on the same frame with the term on and off: it moves about 7 per cent
of the frame's pixels by up to 36 levels at mid-pass, and exactly zero in
eclipse, because there is no sun. Verify a change to it that way - the effect is
subtle enough that a screenshot alone will not tell you whether it is working,
and an early cut of it was silently doing nothing.

Earth's icosahedron is at `detail: 42` (36 980 facets), up from 28. Through a
window the planet is seen far closer to full frame than it ever is on the
orbital map. It is still deliberately a _faceted_ Earth - every facet has to
stay big enough to read as one, or the low-poly language quietly becomes a
smooth sphere with noise on it.

**No asset pipeline, and no Blender.** Geometry is built in code
(`src/env/types.ts`, AGENTS.md). Importing a mesh would work technically and it
is the wrong trade here: every shape in this room is a function of the orbit or
of the hull's own arithmetic, and a baked mesh cannot be re-derived when the
radius or the beta angle changes. It would also mean a binary in the repo that
no gate can read.

### Dust, stowage, and the reason for clutter

**Motes in the beam** (`motes.ts`). The room's one real event is the shaft
walking the deck, and as a surface effect it was a bright patch with nothing
between it and the window. Dust is what makes light read as something crossing a
volume of air rather than a decal sliding along a wall. The motes live in the
throat hexagon swept along the sun's travel - the same throat the shaft is
projected through - so they cannot appear anywhere the light never reached, and
they fade with the beam's own strength, which takes them out in eclipse. Points,
normal blending, never additive: additive is how a particle system becomes a
glow. 9 mm across, because a point renders as a square and a square you can see
the corners of is a pixel, not dust.

**Clutter obeys a rule, or it is set dressing.** NASA's own explanation for why
the real ISS looks the way it does is worth copying exactly: crews run new cable
along the OUTSIDE of a wall rather than opening the rack behind it, because
opening a rack means safety and thermal recertification; they cannot cut a cable
short because it might be needed elsewhere later, so the slack is coiled and
left; and they are task-focused rather than tidy. So the starboard flank carries
closeout panels nobody wanted to reopen, a cable run that crosses them at an
angle no installer would have chosen, taped down at intervals, ending in a
service coil of the length nobody was allowed to remove. Port carries stowage
bags under bungees, because every loose item aboard lives in one - a loose item
in microgravity is a loose item in the fan.

**The robot's own corner.** A charging cradle with a `MINT` mating face the size
of the limb's own couplings, and a rack of spare segments. The player recognises
their own hand on the shelf, and the character is stated without a word of text.

Two placement bugs worth not repeating, both caught by rendering and looking:

- `setFromUnitVectors` fixes one axis and leaves the ROLL about it arbitrary, so
  boxes aimed at the inward normal came out spun differently at every station
  and a row of identical bags read as a row of different objects. Use
  `boxOnHull()`, which builds an explicit (module axis, hull tangent, inward)
  basis.
- The hull meets the deck at 123.2 degrees off zenith. Anything seated past that
  is under the floor - the first cut of the stowage sat at 128 and every bag was
  buried halfway through it.

### The limb's own two sounds

Edge-triggered off how far the couplings have opened, with hysteresis - release
on the way up past 0.10, seat on the way down past 0.04. A single threshold
chatters every time the player stands right at the edge of range. Only the frame
loop reads it: `setPose` snaps the arm outright and a screenshot must not click.

**The release run spreads out, and that is geometry rather than decoration.**
One tick per coupling, in the order they actually part, with the interval
between them widening - because the gaps grow toward the wrist (`GAP_WEIGHTS`),
so the shoulder end lets go almost together and the wrist goes last and
furthest. Measured: 17, 24, 34, 49, 69 ms. At even spacing it would be a buzz.
Pitch falls across the run while the spacing grows, running the two changes in
opposite directions, which is what stops six copies of one sample reading as six
copies of one sample.

Neither is `switch_002`. That one is the test button, the room's only real
event, and spending it on something the player's own body does constantly would
wear the button's meaning out inside a minute.

### The room tone

Forced ventilation, running continuously, pitched to the impeller the player can
watch turning behind the grille. It is the one **synthesised** sound in the game
and the exception is structural, not a preference: it has to be locked to that
fan, which a canned loop cannot be, and cabin ventilation physically IS broadband
air noise with blade-pass harmonics on top. Everything else stays third-party
CC0 (see `### Sound`).

The gearing matters and is the bug to know about. A real impeller runs near
4000 rpm; drawn honestly it is a grey disc, so the VISIBLE rate is geared down to
1.05 Hz where a blade can be followed by eye. Blade pass at the drawn rate is
7.35 Hz, which is **infrasonic** - the first cut was pitched there and was
completely inaudible. `IMPELLER_VISUAL_GEARING` holds the ratio in one place so
the fan cannot end up looking like one speed and sounding like another.

### Spawn

`x = -2.6` on the deck centreline, facing forward and to port, bay left of
centre, light shaft 1.1 m aft of the perch and moving toward it. Spawn phase is
pinned at `phi = 335 deg` - twenty-five seconds before local noon - so the
first frame is the strong one.

### The animation set

Ordered by what a player notices, with the cause that drives each:

1. **Terminator sweep** (the spine). One sun vector per frame re-values all 384
   facets and moves the analytic shaft. The room is turning, not animating.
2. **Orbital sunrise / sunset.** Sun colour and intensity graded
   `SUN_COLOUR -> DAWN_SAND -> FOIL -> out` by atmospheric extinction along the
   grazing line of sight, then a hard umbral step (astronauts describe orbital
   sunset as a light switch). ~4 s of grade at 20x, 0.2 s step;
   `prefers-reduced-motion` stretches the step to 1.5 s.
3. **Earthshine roll.** The fill light's colour is the colour of the ground
   actually below - sampled from the terrain function at the sub-satellite
   point, cached on a 0.25 s cadence, never per frame. Crossing a coastline
   changes the ceiling. It is the only light through the bay during eclipse, so
   it enters as a **directional from the bay's lower face**, not as a
   hemisphere - a hemisphere collapses the flat facets to one dead value and
   the hull reads as a grey tube.
4. **Cabin airflow.** A 0.22 m telltale ribbon streams and flutters at ~1.4 Hz
   off a handrail by the grille; the impeller turns. Forced ventilation runs
   continuously because without it exhaled CO2 pools around a sleeping crew
   member's head. This is the only fast motion in the room and it is what tells
   you in second three that time is running.
5. **The tethered stylus.** A grease pencil on a lanyard traces a ~19 s arc and
   tumbles on a ~7 s period, deliberately incommensurate so the pattern never
   repeats. Angular momentum is conserved, so once it turns it never stops.
   Exactly one such object: it is the proof there is no gravity.
6. **Sun-bearing dial.** One needle revolution per orbit past the eclipse
   wedge.
7. **Thermal tick.** Three sub-centimetre one-shot snaps per terminator
   crossing at fixed offsets, each a 0.35 s damped release. The shell swings
   ~150 K across the terminator and secondary structure lags it; the mismatch
   releases as discrete stick-slip events. You will not see this in ten
   seconds. After two minutes you will see it and never be sure you did.
8. **The limb through the glass.** The existing orbital renderer, unchanged,
   seen through a hole.

Motes in the shaft are **optional and the first thing cut** if the first
deck-noon frame reads anything like bloom.

### Rendering the window

Two passes into one canvas, and the order matters:

```
setClearColor(VOID_SLATE); clear();
setScissorTest(true); setScissor(apertureRect);
render(exteriorScene, exteriorCamera);   // existing orbital scene
setScissorTest(false);
clearDepth();                            // AFTER scissor is off, or it only
render(interiorScene, interiorCamera);   //   clears inside the rect
```

`renderer.autoClear` must be **false** - it defaults true and the interior pass
would wipe the exterior. Restore every renderer flag per pass, or the four
committed orbital baselines drift.

The aperture rect is the screen-space AABB of **all seven** pane corners
**clipped against the near plane in view space before projecting**.
`Vector3.project()` on a point behind the camera returns mirrored NDC, which
corrupts the AABB exactly when the player stands beside the cupola - the most
common pose.

The renderer must be built with **`stencil: true`**; three defaults it off since
r163. The light shaft blends additively and the framebuffer sums, so a per-patch
clamp is not a per-pixel bound: where two panes' patches met along a shared edge
the pair added twice and laid a cyan-white hairline down the seam, and where a
patch crossed a lamp strip it added to `CLOUD` and went pure white. The shaft
draws under an Equal-0 stencil test and increments, so the first patch to cover
a pixel takes it; the lamp diffusers claim their pixels first, because a lamp is
a source and not a receiver. It is exact integer state, so unlike a depth trick
it cannot flip on the software rasteriser CI renders with. Without a stencil
buffer the room still draws - the seams simply come back.

Check this the way it was found: sweep a whole revolution from several standing
poses and count pixels that clip a channel, rather than trusting the four pinned
presets. The presets were clean while 28 of 120 swept frames were not.

The interior must be **airtight from every reachable eye position**, or the
exterior shows through the hull after `clearDepth()`. Clamp the player so the
eye can never come within the near-plane distance of a hull facet.

The exterior camera shares the interior's rotation and the interior's 62-degree
FOV. The atmosphere shell is outside its tuned regime at 400 km (`buildAtmosphere`
is tuned for 2.25-4.1 Earth radii and will read as a fat haze band at 1.063),
so override `uPower`/`uIntensity` **on the interior's own atmosphere instance
only** - never on the defaults the committed baselines depend on.

## The viewer

`rooms.html` mounts one environment, chosen by URL fragment
(`rooms.html#limb-deck`), with a quiet chrome listing the available rooms.

Controls: WASD to walk, mouse to look, and nothing else on the keyboard. Pointer
lock is the good path; drag-look works without it, for the browsers that refuse
the lock silently. Touch gets a stick. Walk speed ~1.4 m/s, one speed, no run.
Movement is clamped to the union of the environment's `FloorRect`s - exact,
cheap, and free of collider jitter; a doorway between rooms is just an overlap
between two rectangles. `prefers-reduced-motion` is respected. A player who only
wants to look around must never get stuck, and there is no way to fall out of
the world.

DIRECTION's camera law - every reposition is a 2.5-4 s cubic ease - binds
anything the player can trigger (recentre, seat, later the map pull-back). It
does not bind the screenshot harness setting a pose headlessly.

## The player: walk, limb, sound

**The player is a station robot**, built to make things go smoothly. It has no
face and no voice and the game never says so out loud - it is stated entirely by
how its limb works, which is a stack of magnetic couplings that comes apart to
reach things. See `### The limb` below.

Note the tension, so nobody has to rediscover it: DIRECTION's premise is that
the flight computer stops one line short and **a human closes it**. The reading
held here is that the machine that computes and the machine you inhabit are not
the same machine. The robot does not solve anything. It is a pair of hands on
the station, and the authority closing the card is the child holding them.

Movement and the interaction grammar are modelled on Return of the Obra Dinn,
from Lucas Pope's TIGSource devlogs. Art direction is ours; the walk simulator
and "the hand is the interface" are his.

Nothing here is written from scratch where something proven exists. The noise is
the MIT `simplex-noise` package, the drift is Cinemachine's Basic Multi Channel
Perlin profile structure, and every sound is a third-party CC0 recording. What
is ours is the tuning and the parts specific to a spacecraft.

Nothing is extracted from another game, however good it sounds. That ships
somebody else's copyrighted assets in this repository; the freely-licensed
equivalent is always the answer.

### The walk (`src/env/player/gait.ts`)

Two layers, and it needs both.

**The step** is Pope's walk simulator: two discs, one per foot, each with a
circumference equal to the stride, rolled by **distance walked and never by a
clock**. Halve the speed and you get the same steps half as often rather than
the same rhythm over less ground, and walking into a wall stops the legs.

The body is an inverted pendulum over the planted foot, so the head is highest
when the supporting leg is vertical. `bobY` is therefore measured DOWN from the
apex and rest is exactly zero. That sign convention is the fix for the bug Pope
wrote up: he took the maximum of the two feet, which puts the head at its
lowest point when you stop, so stopping felt like sinking into marshmallow -
worse with people in the room, because pausing to look at a face sank the view
to their chest. Standing still is legs-vertical, which is the top of the arc.

**The drift** is Cinemachine's Basic Multi Channel Perlin: a profile is a set of
(frequency, amplitude) layers per channel, summed, with a gain on each. Six
channels here - three translation, three rotation - each with two octaves at
frequencies that share no common multiple with the stride.

The drift is why this does not read as a machine. A pendulum alone is exactly
periodic: every step is the previous step, and the eye locks onto it within a
couple of strides. Real walking never repeats, because the legs are not the same
length and the body is always correcting. On top of the noise, each step's depth
and lean are scaled by a value derived from the step index, so no two footfalls
are the same size either.

Amplitude is deliberately small - about 9 mm of step and as much again of drift.
A first-person camera that moves like a pelvis is the most common way head bob
is overdone, and Obra Dinn's is barely there. `tests/gait.test.ts` bounds the
peak-to-peak so it cannot quietly become a pogo stick, asserts that no two gait
cycles are identical, and asserts that the pendulum still dominates underneath
the noise.

Yaw and pitch drift are **added to** the player's aim rather than replacing it,
so the noise never fights the mouse.

`prefers-reduced-motion` walks with the eye level: head bob is the classic
motion-sickness trigger, and Obra Dinn ships a switch for it for that reason.

`setPose` zeroes the walk and the breath clock, so a pinned frame is always shot
standing at the apex and cannot depend on how the harness got there.

### Sound (`src/env/player/sound.ts`, `src/assets/audio/`)

Footsteps and one switch click, from Kenney's CC0 packs. **Not synthesised** - a
footstep built out of filtered noise sounds like a footstep built out of
filtered noise - and **not extracted from another game**, which would put
someone else's copyrighted assets in this repository however good they sounded.
Provenance and licences are in `src/assets/audio/ATTRIBUTION.md`.

Ten footstep samples, and the sample, the pitch and the level are all chosen
from the step index. One sample on a loop is the audible version of a perfect
sine bob: the ear finds the repeat in a few paces. Choosing by step index rather
than at random keeps the walk reproducible - a walk deterministic to the eye and
not to the ear is still not reproducible.

Footfalls are fired by `footfallBetween`, from the same distance that moved the
legs, so the sound cannot drift out of time with them.

**The walk sits at the edge of hearing** and the switch sits well above it. The
walk is not an event; it is the floor the room stands on, and a footstep loud
enough to notice as a sound is a footstep you notice instead of the place you
are walking through - it stops being furniture within a minute. The switch is
an event, and it is the only confirmation a press happened.

Browsers refuse an AudioContext until the user has gestured at the page, and
refuse it silently, so the context is created lazily on the first real input.
If audio never unlocks the room carries on in silence; it must never take the
room down with it.

### Controls

**Ground speed is 1.85 m/s and the stride is 0.82 m, and those are one number
in two files.** Their ratio is the cadence - 2.26 footfalls a second - and it is
held constant on purpose. Raising speed over a fixed stride is the same walk
played faster: the feet patter, the bob buzzes, and it reads as a small person
hurrying rather than as covering ground. Note that the pendulum's drop goes as
the SQUARE of the stride, so `BOB_SCALE` came down when the stride went up.

**WASD walks. The mouse looks, with no button held and no cursor on screen.** A
mouse press takes pointer lock on the first press and keeps it; drag-look
survives only as the fallback for browsers that refuse the lock, because having
it reachable taught the wrong habit - hold to turn.

There is no on-screen recentre control; `R` still recentres. A button that
cannot be clicked while the pointer is locked is a button that is only ever in
the way.

**Space is the action key.** There is no click-to-use, no cursor and nothing to
aim: whatever the hand is already reaching for is what it acts on. The arm is
the aim. `EnvironmentHandle.interact(id)` is optional and receives only a point
of interest the player was already touching; it returns whether anything
happened, so the caller knows whether to make a sound.

### The limb (`src/env/player/arm.ts`)

**Who is holding it.** The player is not a person in a suit. They are a station
robot built to make things go smoothly - it fetches, seats, latches and checks,
and it is the reason the deck is tidy. Its limbs are not jointed. They are
stacks of short couplings held nose to tail by magnets, and to reach something
the couplings simply let go: the hand comes off and travels, and the segments
behind it string out along the path like a dotted line back to the shoulder.
When the job is done the stack closes up again.

That identity started as a bug. The limb was a two-bone IK arm and at a 62
degree field of view an honest forearm is a featureless pole across a quarter of
the screen - Pope's "long pole", which he fought with taper and detail. Rather
than keep fighting it, the limb is now made of the thing the fight produced.
There is no pole because there is no continuous arm, no elbow to flip through
the torso because there is no elbow, and no reach limit set by bone length
because the chain simply opens further. A constraint became the character.

The limb is **deliberately shorter than anything it has to touch**: 0.43 m
closed, against the 0.7 m a body can get to a hull fitting. It cannot reach
without coming apart, so the separation is the mechanism rather than a flourish
laid over a working arm. A test holds that inequality.

**What it is made of.** `HULL` and `HULL_SHADOW` - the robot is built out of the
same plate as the module it lives in - with a `MINT` pole ring at the base of
every coupling. A ring and not a solid face: the chain always points away from
the eye, so what is on screen is a row of coupling bases head on, and solid mint
discs made the limb a line of bright blobs in a deliberately quiet room.

**When it appears.** Only ever for a point of interest marked `operable`, which
means only where `interact()` will honour it. There is no HUD, no highlight and
no prompt, so **the reach is a promise**. Feeding the limb every listed point
made it drift out and touch the window and the perch in passing, which spends
that promise on nothing and teaches that reaching means nothing. Out of range it
is not drawn at all. `tests/arm.test.ts` holds `operable` and `interact()` to
each other so they cannot drift.

It is **fully automatic**, never aimed by the player. That is what separates a
limb that reads as a body from Trespasser's noodle.

Rules learned the hard way, each one a frame that looked wrong first:

- The shoulder hangs off the **body, not the head**: yaw only. Hanging it off
  the full camera basis swung the whole limb forward and under every time the
  player looked down at something, which is exactly when they are reaching.
- **Gap weighting is the whole look.** The gaps must grow toward the wrist or
  the limb reads as having fallen apart rather than as having sent its hand
  somewhere. But give the wrist nearly all of it - the first cut gave it 47 per
  cent - and the other couplings stay bunched at the shoulder, which is below
  the frame, and all the player sees is a lone floating fist. There is a
  lead-out at the shoulder, a steady climb through the middle, and the largest
  single gap still at the wrist.
- **Count matters as much as weighting.** A first-person eye cannot see its own
  shoulder, so roughly the first half metre is behind the camera whatever the
  arithmetic says. Five long segments left one in frame and the limb read as a
  fist and a brick. Eight short ones put three or four in the visible stretch.
- **The reach is two beats and they must not overlap.** The limb comes up off
  the hip as one SHUT stack and aims - that is the beat that says "this is a
  limb, and it is made of parts" while the parts are still touching - and only
  then do the magnets release and the hand run out ahead of the rest. Play both
  at once and the player never sees it whole and never sees it come apart; it
  simply is apart, which reads as floating debris rather than as a machine
  taking itself to pieces. The separation has to be witnessed.
- **The raise beat has to be IN FRAME**, which is a geometry problem, not a
  timing one. The shut limb is 0.43 m long, so the raise happens about 0.3 m
  from the eye - and at that range a shoulder set 0.21 m to the side puts the
  whole stack 51 degrees off axis, outside a frame that only reaches 45. The
  beat played perfectly, off the right-hand edge of the screen. Lateral shoulder
  offset and how much of the limb the player ever sees are the same number.
  `READY_LIFT_M` carries it up for the same reason.
- The bow off the straight line is a **fraction of the span**, capped. As a
  fixed 0.15 m it was a gentle curve on a long reach and a right-angle detour on
  the shut stack.
- The reach **arcs** up and out and eases with a smoothstep, or the whole
  approach reads as a limb hanging at the hip until the hand suddenly arrives.
- The path **bows** out and down and flattens as the hand commits, so the
  segments visibly line up on the target. A dead straight line reads as a laser
  pointer.
- Fingertips stop `GRIP_STANDOFF_M` short, because a point of interest is the
  centre of a thing and aiming at it buries the gripper inside the cap.
- The gripper is sized to **what it operates**, not to a human hand. The first
  cut was hand-sized and covered the control it was pressing, hiding the only
  feedback the button has at the exact moment it fired.
- The limb carries the interior's `NIGHT_SIDE` emissive floor, like every other
  surface in the room. Without it the limb drops through `VOID_SLATE` in
  eclipse, and the player is looking straight at it when that happens.

The limb is parented into the **room's own root**, not the viewer's scene: a
self-rendering room draws its root and nothing else, and the limb should be lit
by the room it is standing in.

### The test button (`src/env/limbDeck/testButton.ts`)

A button wired to nothing, on the starboard hull. It exists so the interaction
loop can be felt end to end before there is any game behind it: walk up, the
limb comes apart and the hand goes, press space, the cap goes in, the ring steps
to a brighter value, a switch clicks, and it springs back.

**It is bolted to the hull by the hull's own arithmetic.** The skin is a curve -
a 2.1 m cylinder whose axis rides 1.15 m over the deck, standing at z = 1.757
where it meets the floor and bulging to 2.10 at axis height - so `hullMountAt()`
in `shell.ts` is the one place that knows where the wall is. An earlier build
typed the z in by hand and hung the button half a metre out in the middle of the
deck with nothing behind it. The plate is let 6 mm into the skin, because across
0.21 m of that radius the hull falls 2.6 mm away from the tangent plane and a
plate seated flush stands off it at the corners.

Its height is set by **where it lands in the frame**, not by where a control
panel sits on a wall. The eye is at 1.74 m and a body stops about 0.6 m off the
skin, so a plate at chest height is 40 degrees down from the horizon and the
player is staring at their own feet to press it. At 1.5 m the look-down is 22
degrees, which is a glance.

It "lights up" the only way this project allows. Glow is banned at any intensity
and there is no bloom anywhere, so the ring is not a lamp - it is a flat facet
that swaps material. The off state is a **recess**, materially below the plate
around it - the same trick the cupola's pane reveal uses - because a state light
whose off state is invisible has one state.

**The live ring takes no diffuse light at all**, which is the lamp diffuser's
rule for the same reason. Lit `MINT` plus a `MINT` emissive term rendered at
255,255,247 across eight thousand pixels the moment the button was pressed in
sunlight: blown white, in a game whose palette has no white. Held at black with
the whole value in emissive it renders as exactly `MINT` from every pose at
every point in the orbit - it does not get brighter because the sun came up.

The ring is wider than the gripper that presses the cap, deliberately: a state
light you cover with your own hand at the moment you change it is not feedback.

## Screenshots and gates

Interior presets join `scripts/shots.mjs` so the palette, accent and no-red
gates read the room. **Render `deck-eclipse` first, before polishing anything
else** - eclipse is where an interior fails, and it fails by going flat and
grey rather than by going black.

New presets make the pixel-diff gate report an unexpected extra preset until
baselines exist, and there is exactly one legal way to add them: land the
source with `shots/baseline` untouched, let CI's visual job render, download
that artifact, and commit those PNGs. Never run `npm run shots -- --baseline`
locally - local GPU antialiasing disagrees with CI's software rasteriser by
about 1% on every preset and committing it bakes the mismatch in permanently.

**A gate only covers the states it renders**, and that is not a small caveat.
The palette gate passed every run while the test button's live ring rendered at
255,255,247 across eight thousand pixels - blown white, in a game with no white

- because not one pinned shot had ever stood at a control and operated it. Four
  poses are four poses. When a room grows a state that looks different from every
  other state, pin it: `deck-reach` and `deck-press` exist for exactly that, and
  `deck-press` is set in eclipse so the step is measured with nothing else in the
  room to hide behind. A preset may drive the room as well as pose it - `press:
true` calls `interact()` and then nudges the pinned clock past the cap's spring
  time, since a spring needs an interval and the harness's clock does not run.

`deck-door` is the same lesson learned twice: the aft door's OPEN state had no
pinned shot, and that is how it shipped with a header standing out through the
roof and a bulkhead missing a 140-degree cone either side of it. Two mechanics
that preset needed and every future one will:

- `settle` steps the pinned clock rather than jumping it. A mechanism derives its
  own interval from this clock and clamps it to 0.1 s so a dropped frame cannot
  teleport it, so setting the time two seconds ahead in one call advances the
  door by a tenth of a second.
- `pressFrom` presses from one pose and shoots from another. The limb only takes
  hold inside 0.95 m of the shoulder, and at 0.95 m from a door you cannot see
  the door.

**An interior frame containing any exact VOID_SLATE is a hole to space**, except
through the cupola. That is a one-line check over the rendered pixels and it is
worth running by hand on anything that cuts the pressure vessel; the four holes
above measured 64,060 pixels.

Two known holes remain, both of them the same shape:

- The gate reads four (now six) pinned frames, not the orbit. An orbit sweep
  found beam patches clipping on 28 of 120 frames while the pinned four passed.
  Sweeping belongs in `scripts/gates/` and is not there yet.
- `vite preview` serves `dist/`, so **`npm run shots` renders the last build,
  not the working tree.** A shot session that silently disagrees with what the
  dev server shows is this, every time. Run `npm run build` first.
