# GROUND TRACK — full context handoff

You are picking up a game project that has been built once and is being
restarted for its visuals. Read this whole file before writing code. It is the
complete brief: what the game is, who it is for, exactly what the owner asked
for in his own words, what exists, what works, what looks bad, and — most
importantly — **why it looks bad**, which is the thing a rewrite has to get
right.

The existing repository is `ground-track` (github `jbtk-cell/ground-track`).
The visual work described here lives on branch `station`. You may reuse
anything in it or start clean; the analysis below is the actual deliverable.

---

## 1. What the game is

**GROUND TRACK** is a math game for children, disguised as a job on a space
station — and the disguise is total. It is not a quiz with a spaceship theme.

The core idea, in one line: **the machine finds the shape, you give it the
size.**

The station's flight computer solves an orbital maneuver completely, prints a
maneuver card with twelve fields, fills eleven of them, and stops one line
short. A human closes it. The player types one whole number. That number is
**executed, never graded** — it becomes real thrust for real seconds against a
real Keplerian orbit simulation. There is no correct/incorrect branch anywhere
in the game.

Type 8 when 8 was right and the orbit settles onto the target ring. Type 6 and
the engine burns for six seconds and the apogee comes up visibly short, with a
gap you can see. **Nothing says wrong.** The computer prints a smaller
correction card at the next node forty seconds later, and the fuel column drops
one notch. Guessing costs fuel and time, legibly, with no punishment.

This framing is close to historically true — Houston computed burns and read a
PAD up to the crew — and it is the most important design decision in the
project, because it makes the child the final authority over a machine rather
than a student being tested by one.

The player is not a person in a suit. **The player is a station robot** built to
make things go smoothly: it fetches, seats, latches and checks. More on its arm
below, because the arm is the entire interaction model.

### Grade scaling

A grade-2 and a grade-7 player fly the same mission, see the same screen, and
arrive at the same answer. **Only the numeral form changes.**

- Grades 1–2: countable discrete thruster pulses. `Δv 24 m/s · per pulse 6 m/s · pulses __` → 4.
- Grades 3–4: times tables and division. Burn duration in seconds.
- Grades 5–6: fractions, decimals, signed Δv. Decimals arrive because a satellite failed and seven survivors must respace at 360 ÷ 7 = 51.4°, not because you leveled up.
- Grades 7–8: ratio, percent, scientific notation — because the readout physically cannot display the value another way.

Precision is the reward for being older: readouts stop rounding, `214 KM`
becomes `214.3 KM`. The word "grade" appears exactly once, on a certification
card, and never again.

### Structure of play

Modelled on Prodigy's shape (the owner asked for this explicitly — "not in art
style, in gameplay; areas and enemies you can beat over and over"), but with no
story:

- Orbital regimes are the zones, each with its own dominant perturbation, orbital period, and light.
- The "roaming monsters" are physical situations: a decaying perigee, debris on a crossing track, a slot sliding off station. **They respawn forever because the respawn mechanism is the physics** — drag never stops, the Earth's lumpy gravity never stops, phasing drift never stops.
- Every encounter is the same one mechanic: a card with one blank.
- Salvage replaces pet collection. Derelicts are caught, refit, named by the child, and flown.
- "Rare" hardware means _different arithmetic_ — a crude 25 m/s-per-second thruster means two-second burns.
- **No score, no XP, no percentage, no star rating, no daily streaks, ever.** Progress is expressed as geometry: your coverage footprints slowly quilt the Earth in your chosen livery colour.

---

## 2. The owner, and his standing instructions

The owner is **Johnny** (github `jbtk-cell`). Below are his actual words across
the project, kept verbatim because the phrasing matters.

On the current state, which is why you are reading this:

> "Ok so it looks terrible honestly at this point I just want you to make a
> total prompt, give full context of what is going on and all progress exactly
> my instructions and that we are trying to make a game and then I will give it
> to a new thing because at this point starting over will be better."

On the goal for the visuals:

> "I am giving you fable 5 and I have the goal to make the game as good as
> possible, don't include real gameplay yet (of course still keep it open since
> we will add gameplay eventually) but I want it to be very visually
> appealing"

> "do you see how good it looks shaders and everything"

The reference he supplied was a TikTok comparing two AI-built space games; the
panel he pointed at was labelled "Fable 5". What it showed: a warm tan/rust ship
interior with cyan instrument screens, three lit readouts on a console bank, a
row of indicator chips along a bulkhead, ribbed vents, round portholes with a
ringed planet against a starfield, and a first-person hand reaching. Soft
realistic shading, real shadows, bloom on the light strips, deep blacks. He said:

> "look at the amazing visuals and the capsule and the good view of all the
> planets. Let's recreate that."

Two checks he made **permanent** and asked to be run before any claim of
completion:

> "Also for every place where the door meets the hallways it keeps glitching as
> in it doesn't know which layer is on top. Add this to permanent memory: check
> for these two things the glitching because of different layers being on top
> and the holes in walls stuff, of course be more specific but I want this chat
> to always check those things before saying its done."

So: **(1) z-fighting between coplanar surfaces, (2) holes in walls that show
open space.** Both must be checked before saying anything is done.

Bugs he reported by hand, which tell you what he notices:

> "I can walk through the wall of the door sometimes. There is some weird visual
> thing which is not good where standing in the hallway and facing the original
> door I can see through holes on either side of the door which should of course
> be walls. Also the doors should close automatically, idk why there are multiple
> buttons, clicking the buttons doesn't seem to work idk if it does it
> automatically or what. The weirdest one is the way it fixes my walking. In the
> corridor when I press D I just move back, something is weird about entering the
> corridor and always moving around inside it."

> "My arm is gone and it doesn't do anything, the door open automatically. Also
> it doesn't close. Bring that whole mechanic back and also I want the door to
> automatically close after some time maybe 5 seconds."

A third standing rule, learned the hard way and worth keeping: **verify by
playing.** Setting a camera pose and screenshotting it hides every input, reach
and motion bug. Drive real keys in a real browser and look at the frames.

### His working preferences

- **No emoji anywhere** — responses, commit messages, code, documentation.
- Plain text over decoration.
- Set things up end to end; don't hand back a list of manual steps.
- Verify by executing (run the thing, show the output), not by reading code.
- For multi-file or core changes: explore and plan first. For small edits: just do it.

---

## 3. Art direction

This section is the existing direction. **Read section 6 before adopting it
wholesale** — parts of it are what caused the failure.

### Palette

The whole game is drawn from this list. Sky/limb gradient, top of frame down to
the surface:

```
VOID_SLATE     #101B26   darkest value in the game
DEEP_FIELD     #38495A
HIGH_FIELD     #6E8496
DAWN_SAND      #D9C9A6
DAWN_CREAM     #E4D6BB
IGNITION_CORE  #F1E7D4   thin, only at the terminator
```

Earth:

```
FOREST      #4E6B3C
SAGE        #6E8A4E
ARID        #B9A87E
OCEAN       #46707E
OCEAN_DEEP  #35525E
CLOUD       #DCD8CE
NIGHT_SIDE  #101C28
SETTLEMENT  #C9A063   sparse warm pinpricks on the night side
```

Spacecraft and interiors:

```
HULL         #7E93A2
HULL_SHADOW  #46586A
FOIL         #B99A63   matte MLI blanket
ARRAY        #2E3C55
```

Instruments and the single accent:

```
MINT          #C6DCCC   instruments; also marks anything a hand closes round
CAUTION_RUST  #A8624B   hairline only
ACCENT        #D98A3C   permitted on EXACTLY TWO things: the primary action, and a live burn
```

Hard rules attached to the palette: **no pure black anywhere** (VOID_SLATE is
the floor), **no red** (rust hairlines only), and the accent is mechanically
gated — a script scans both source files and rendered frames for it.

### Typography

- Wordmark: neo-grotesque, weight 500–600, ALL CAPS, tracking 0.14em, `#F0EEE9`.
- Instrument values: same grotesque, semibold, **tabular lining figures, slashed zero**, mint.
- Everything small: IBM Plex Mono — eyebrow line, unit labels at 9px/45% opacity, keybind legend, card fields.
- Digit grouping uses a thin space: `7 726 m/s`. Aerospace convention, and it teaches place value for free.
- Any sentence a child must actually parse is set in **Atkinson Hyperlegible at 20px minimum**.
- The face change carries meaning: **mono means the machine is talking, Atkinson means you are being talked to.**

### The compositional law

**Earth's limb occupies 30–40% of frame at all times.** No shot is ever an
object against black — Earth is the fog.

- Orbits are 1px hairlines. Solid ahead; passing behind the planet a trace converts mid-stroke to a 6px/5px dash at 28% alpha and returns solid on emergence. ISO hidden-line convention against a real depth test, with the dash phase crawling 4px/s so a still frame is never frozen.
- Ground tracks paint the real sinusoid onto the continents in your livery colour at 25%, fading after one revolution.
- Footprints are 1px circles at 6% fill, doubling to 12% on overlap, so a dense constellation quilts into a lattice.
- Satellites carry crumpled MLI modelled as a shallow-displaced plane, so flat shading fractures one gold blanket into forty facets.
- Stencil decals (`AE-4`, `+Z`, `NO STEP`) are baked into geometry.
- **The camera never cuts.** Every reposition is a 2.5–4s cubic ease.

### The lighting idea that works

For the planet, one grazing key placed nearly tangent to the surface. This is
the whole trick: at low sun angle a 400-triangle Earth shatters into separable
facet values, where a high sun turns it to mush. Plus an earthshine hemisphere
whose ground term puts bounced daylight on undersides, and one very dim
anti-sun fill so the night limb is never a flat silhouette.

Atmosphere is a crisp rim on a slightly larger inverted shell, never
screen-space. Fog becomes altitude haze — a cream wash existing only within
~200 km of the surface, so you read altitude off how soft the world looks
before you read a numeral. Stars are 1–2px squares from a five-stop spectral
ramp, and **they never twinkle**, because twinkle is an atmospheric artifact and
there is no atmosphere.

### The UI, such as it is

**There is no HUD.** The maneuver card ("the PAD") docks lower-left as a
hairline card. The world does not pause, dim, or blur behind it.

The card lists twelve fields the simulation is genuinely running, on dotted
leaders. Eleven are filled. One is blank — not an input box, a 1px underscore
sized to exactly the digits that will land on it. **Typed digits render in the
identical face, weight, size, colour and baseline as the computer's values.**
Nothing marks which number is the kid's. That single decision is the whole
"a nine-year-old should feel trusted" brief, solved.

Wrong answers get no red, no X, no shake. The entered value drops to 40% and
slides left into an `ENTERED` column; a fresh blank opens beside it.

---

## 4. Sound design

Small, specific, and mostly working. Worth keeping as-is.

**Everything is CC0 third-party samples, not synthesis** — except the room
tone. A footstep built out of filtered noise always sounds like a footstep built
out of filtered noise. Sources are Kenney's RPG Audio and Interface Sounds packs,
credited in `src/assets/audio/ATTRIBUTION.md`. Never rip audio from a commercial
game.

Implementation is bare Web Audio: buffers decoded once, fired from a pool of
one-shot source nodes. No library — the job is "play this buffer at this rate
and gain", which is four lines.

**Autoplay handling matters.** Browsers refuse an AudioContext until the user
gestures at the page, and refuse it _silently_. The context is created lazily on
first real input and resumed on every gesture until it sticks. If audio never
unlocks, everything degrades to doing nothing — it must never take the room down
with it.

The sounds:

- **Ten footstep samples**, chosen per step and slightly pitched. One sample on a loop is the audible version of a perfect sine head bob: the ear locks onto the repeat within a few steps and the walk stops reading as a body.
- **One switch click**, for the door control. It is the room's only real event, and it deliberately does not share a sample with anything the player's own body does constantly — that would wear the button's meaning out inside a minute.
- **The limb release**: one tick per magnetic coupling, in the order they actually open, and **the interval between them widens**. That is not a flourish, it is the geometry made audible — the gaps grow toward the wrist, so couplings near the shoulder part almost together and the wrist parts last and furthest. Even spacing would be a buzz; the widening is the whole character of the sound.
- **The limb seating**: one soft close, no fanfare.
- **Door motor**: a low rumble bed whose gain follows the door's actual travel, plus two pitched clunks — a lighter, faster one when the lock lets go, a heavy one when two metres of slab arrives on its sill. Same sample, pitched apart.
- **Room tone**: the one synthesised sound, and the only one that has to be. Each compartment has a machinery blade-pass frequency, and the tone is locked to an impeller the player can watch turning — which a recording cannot do. Walking between compartments crossfades it; a room with no machinery fades it out entirely and stops the oscillators rather than leaving them running at zero gain.

Per-room frequencies currently in use (Hz): crown 27, crawl 33, berth 41,
crossing 46, bend 52, plot 58, sill 64, racks 71, gantry 88, and one room —
the magazine — deliberately **silent**, because it is where a deep-space probe
checks in and a late signal is only legible if there is somewhere late-feeling
to receive it in.

---

## 5. The interaction model — the arm

This is the best idea in the project and should survive any rewrite.

The player is a station robot. **Its limbs are not jointed.** They are stacks of
short couplings held nose to tail by magnets. To reach something, the couplings
simply let go: the hand comes off and travels, and the segments behind it string
out along the path like a dotted line back to the shoulder. When the job is
done the stack closes up again.

That identity started as a bug. The arm was originally a two-bone IK limb, and
at a 62° field of view an honest forearm is a featureless pole across a quarter
of the screen. Rather than fight that, the limb became the thing the fight
produced: no pole because there is no continuous arm, no elbow to flip through
the torso because there is no elbow, no reach limit set by bone length because
the chain simply opens further. **A constraint became the character.**

Rules that make it work:

- The couplings are hull-coloured — the robot is built from the same plate as the module. The mating face at the base of every segment is MINT, hidden while the stack is closed and visible the instant a coupling opens. **The limb tells you it released without anything lighting up.**
- It appears **only** for something the game will actually honour. There is no HUD, no highlight, no prompt, so the reach is the only signal that a thing is operable — which makes it a promise. A hand that drifts out to touch a window on the way past spends that promise on nothing.
- It is **fully automatic**; the player never aims it. That is the difference between an arm that reads as a body and a floppy physics arm, and it also makes it authorable — the code decides where the hand goes, so the hand is always somewhere defensible.
- Two distances matter and have caused bugs twice: it **deploys** at 1.6 m but only **grips** at 0.95 m. In between, the limb visibly reaches for a control it will never take hold of and the action key does nothing. That is exactly what "clicking the buttons doesn't seem to work" turned out to be.
- The limb lives in the room's own scene graph and is lit by the room's own lights. It touches the same geometry the player sees rather than floating in a view-model layer with its own field of view.

Controls: WASD walks, mouse or arrow keys look, Space uses whatever the arm is
reaching for, R recentres, Esc releases the pointer.

---

## 6. Why it currently looks bad — read this before anything else

This is the most important section. The interiors are structurally correct,
airtight, walkable, and **visually dead**. They read as a diagram of a space
station, not the inside of one. Here is the honest diagnosis.

### 6.1 There are no shadows and no ambient occlusion

Nothing in any room casts a shadow. Nothing darkens where it meets something
else. Every surface is lit purely by `N·L` against a few directional and
hemisphere lights, which means **nothing sits in the room — everything floats.**

This is the single biggest gap between the current build and the reference
footage. In the reference, every panel has a soft dark line where it meets its
neighbour, every fitting has contact shading under it, and light falls off
inside recesses. That is what makes it read as a physical place.

three.js supports shadow maps and there are cheap AO options. Neither was used.
**If you fix one thing, fix this.**

### 6.2 The value range is compressed into mud

Measured across rendered frames, 30–45% of pixels routinely sit inside a single
8-value luminance bucket out of 255. A project was built to detect this (a
"flatness" gate) and **it has never passed since the day it was written** —
currently 9 of 31 frames fail it, and that is after improvement from 13.

Everything is mid-grey-blue. There is no deep shadow, because black is banned.
There is no bright highlight, because bloom is banned and the brightest surface
is a matte diffuser. The result is a narrow band of similar values across the
whole frame.

### 6.3 The art direction was designed for a planet, then applied to rooms

This is the root cause and it needs saying plainly.

The rules — flat-shaded low-poly, no textures, no PBR, no bloom at any
intensity, no black, one grazing key — were chosen for **looking at Earth from
orbit**, and for that they work. The orbital views are genuinely good: the
faceted planet, the dawn terminator, the hairline orbit traces. That part of the
game does not need rescuing.

Those same rules are actively hostile to interiors:

- **No textures** means a two-metre wall panel is one flat colour. Attempts to break that up with per-facet noise failed measurably — the noise function used clusters around its midpoint, so neighbouring panels differed by one to three values out of 255, which nobody can see.
- **No bloom** means a lamp is just a light-grey rectangle. It never reads as emitting anything.
- **No black** means every shadow bottoms out at #101B26 and recesses have no depth.
- **One grazing key** works on a sphere with 37,000 facets. On a flat wall it produces one value.

The rules are enforced by automated gates, so they cannot be quietly bent — a
change here is a deliberate direction decision the owner has to make.

**Recommendation for the rewrite:** split the direction in two. Keep the orbital
rules exactly as they are — they earn their keep. For interiors, adopt a
different, honest set: real shadow maps, contact/ambient occlusion, a genuine
key/fill/bounce rig, materials with roughness variation, emissive surfaces that
are allowed to be the brightest thing in frame, and a value range that actually
reaches from near-black to near-white. If the owner wants to keep "no bloom" as
an identity choice, that is survivable — but shadows, AO and value range are not
optional.

### 6.4 Detail was added as flat geometry, which does not read

Instrument readouts were built as small quads — bar graphs as rows of boxes,
waveforms as chains of quads, text blocks as short bars. Up close on the flight
deck console this genuinely works and that frame is the best interior in the
build. Everywhere else it does not scale: you cannot cover a station in hand-
placed quads, and at any distance they vanish.

The reference gets its density from textures and normal maps doing the work
across every surface at once. That is a fundamentally cheaper and better
approach for interiors.

### 6.5 What IS worth keeping visually

Be honest about this too — not everything failed:

- The **orbital renderer**. The faceted Earth, the atmosphere rim, the starfield, the terminator. It looks good.
- The **Moon**, added late: true scale (0.5°, about 11 pixels), correctly phased from the scene's own sun, occluding stars.
- The **cupola window**: a real second render pass scissored to the pane outlines, so the window is a hole, not a picture. Standing in the observation deck and looking at Earth through the mullions is the best frame in the game.
- The **arm**, entirely.
- The **sound design**, entirely.
- The **flight deck console bank** — three lit readouts, a channel row, bolts — as a proof that the vocabulary can work when the density is high enough.

---

## 7. What exists now

Stack: **TypeScript, three.js, Vite, Vitest, Playwright.** No game engine, no
React, no physics library, no postprocessing.

Layout:

```
src/sim/      pure orbital mechanics — Kepler solver, elements, burns,
              card planning, mission state machine.
              PURE: no three.js, no DOM, no clock, no randomness.
src/render/   three.js — palette, noise, earth, atmosphere, starfield, scene,
              orbit traces, satellite, the Moon and planets
src/env/      the walkable interiors: a shared kit, one module per room,
              the player rig (arm, gait, sound), and the room viewer
src/ui/       the PAD card and the app loop
scripts/      screenshot harness, and one file per mechanically-checked rule
tests/        mirrors src/, headless
docs/         DIRECTION.md (look and voice), STRUCTURE.md (shape of play),
              ENVIRONMENTS.md (interior spec), LOOP.md, PLATFORM.md
```

**Thirteen interior compartments** exist and interconnect into one walkable
station: an observation deck with a faceted cupola, a corridor, a hub, a tall
shaft, a flight deck, rack bays, a duct, a silent bay, a turn, a sump, an empty
octagon with a round hatch, and a tank gallery. Exact layout is not worth
carrying over — treat it as disposable.

Quality is enforced by scripts, not by eye:

- `verify` — typecheck, lint, format, 289 tests across 19 files. Green.
- `palette` — no pure black, nothing below the floor value. Passing.
- `accent` — the one-accent rule, scanned in source and in pixels. Passing.
- `airtight` — 20 sealed camera poses, counting pixels of exact void colour. Zero. Passing.
- `playable` — drives a real browser with real keys: click-look, arrow-look, that a shut door stops you, that pressing its control opens it and you can walk through, that the keyboard still works after clicking a link, and that all 13 compartments can be entered and walked. Passing.
- `seams` — no two surfaces in one plane facing one way. Passing.
- `flatness` — the visual-interest check. **Failing, 9 of 31, and never once green.**

The two checks the owner made permanent — z-fighting and holes to space — are
covered by `seams` and `airtight` and both pass.

---

## 8. Hard-won technical traps

These cost real time. They are engine-level and will bite again.

1. **A back-facing triangle in a pressure hull is a hole with space behind it.** The interior renders after the exterior clears depth, so any culled or missing facet shows open space. Derive winding from a point the facet should face; never trust vertex order across hundreds of call sites.
2. **A recessed wall band is a groove, and a groove that runs off the end of a wall is a slot through the hull.** This shipped twice. Once it measured 886 pixels of exact void colour at eye height down an entire corridor — reported by the owner as "I can see through holes on either side of the door."
3. **Sealed-pose gates hide off-centre bugs.** That slot survived every airtight check because all its poses stood on the centreline, where a slot in a side wall is edge-on and covers no pixels. Put off-centre poses in the gate.
4. **`flatShading: true` on a non-indexed geometry can render pure black.** It makes the shader derive a normal from screen-space derivatives, which go degenerate when you stand close to a big flat wall and look along it — `normalize` of a near-zero cross product is NaN, and a NaN fragment clamps to black. It measured 30% of the frame from a spot the player can stand in. If normals are already per-face, the flag is redundant and harmful.
5. **Indoors, an unlit facet has only its emissive term.** The usual value floor of 0.62 renders below the palette floor. Interior materials need 1.0.
6. **Point sprites with size attenuation become tiles.** A 9 mm dust mote at arm's length rendered as a 35-pixel hard-edged grey square hanging in the window. `PointsMaterial` cannot cap screen size; either turn attenuation off or cull by range.
7. **A directional light with a zero component gives `N·L = 0` to every surface facing that axis.** One room had two dead walls for exactly this reason. Also: a planet from low orbit subtends about 140°; modelling it as one collimated beam is wrong, and three samples across the arc is a cheap honest fix.
8. **A grazing rake fixes the view down a corridor and ruins the view along it.** Two jobs need two terms: a weak square-on fill sets where a bare wall sits, and the rake decides what separates from it.
9. **`setPose` teleports and therefore proves nothing.** It hides every input, reach, collision and motion bug. Ten of the thirteen rooms had never been walked by anything but a camera teleport, and a room that spawns you inside its own furniture passes every other check.
10. **Allow-list gates fail silently as a project grows.** Two separate gates were quietly covering only the first two rooms ever built. Read the live registry instead of a literal list.
11. **A pointerdown handler that throws is a click that half-ran.** `setPointerCapture` raises once pointer lock is held, so every click threw and nothing was listening. Also: pointer lock is a permission, and Safari returns `undefined` rather than a rejecting promise — a drag fallback gated on that rejection is dead code.
12. **Gating keydown on "is the user typing" can eat the whole game.** A nav link keeps DOM focus after a click, so if `<a>` counts as a typing target, every W and arrow is dropped from that moment. The symptom was "the mouse half works and I physically cannot walk", with no error anywhere.
13. **Local GPU antialiasing disagrees with CI's software rasteriser** by about 1% on every frame. Never write screenshot baselines locally.

---

## 9. What to do

The owner's instruction is: **make it visually excellent, no real gameplay yet,
but leave the gameplay path open.** Concretely, that means:

1. **Keep** `src/sim` untouched and pure. The orbital mechanics are correct and the game depends on them. Keep the PAD card contract so gameplay can land later.
2. **Keep** the orbital renderer, the arm, and the sound design.
3. **Rebuild the interior look from scratch**, with real shadows, ambient or contact occlusion, a proper key/fill/bounce rig per room, materials with actual surface variation, and a value range that reaches genuine dark and genuine bright. Get **one room** looking like the reference before building a second — the previous attempt built thirteen rooms at a uniform mediocre quality, which is much harder to fix than one good room is to copy.
4. **Renegotiate the constraints explicitly with Johnny** rather than inheriting them. Ask him directly which of these he still wants for interiors: no textures, no bloom, no black, one accent colour. Tell him what each costs. The palette itself is good and worth keeping either way.
5. **Verify by playing.** Drive real keys in a real browser, capture frames, and look at them. Before saying anything is done, check the two permanent items: z-fighting between coplanar surfaces, and holes in walls that show space.
6. **No emoji anywhere**, including commit messages.

The bar to clear is a still frame from inside the station that Johnny would be
happy to have compared, side by side, with the reference footage. Nothing in
this project's history has cleared it yet.
