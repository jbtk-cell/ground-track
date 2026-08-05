# ROOM BRIEF — eight compartments, and the rules that make them different

Companion to `OUTSIDE-EYE.md`. That document says what is wrong. This one is the build
order. It is written to be executed without a conversation: where a number is missing,
somebody will invent one, so there are no missing numbers.

Conventions used throughout, matching the existing kit:

- Every room is authored in its own local frame. Origin on its own deck, **+X along its
  long axis, +Y up, +Z across**. `layout.ts` places it; the room never learns where it is.
- Dimensions are **clear internal**, metres, inside the liner.
- **Eye height is 1.74 m** above the local deck. Every "reads as" claim below is from
  a standing eye at 1.74 m, walked to, not teleported to.
- **Values are luminance out of 255** (`0.2126R + 0.7152G + 0.0722B`), which is the number
  `gl.readPixels` gives you and the number the review measured. Where a value is stated
  as "reads at 72", that is the *rendered* result required, not a material colour. Author
  the material and the light to hit it, then measure.
- `SEAM` stays 1.18 × 2.06; its collar lengthens from 1.24 m to 1.30 m per side (S4).
  A second port type, **`GALLERY_SEAM`** at 2.10 × 2.30, is added and used exactly twice
  (S6). Where a room says `SEAM` it means the standard one.
- Everything here is buildable with the kit that exists: axis-aligned `solid()` boxes,
  `pushQuad`/`pushFacet` for anything curved or non-orthogonal, `interiorMaterial` for the
  liner, `FloorRect.floorY` for level changes, and `HemisphereLight` + `DirectionalLight`
  + `PointLight`. **No shadow maps are required anywhere.** Where a room needs a shaped
  pool of light, it is an authored quad lying on the surface, which is the technique
  `limbDeck/light.ts` already uses.
- **Zero pixels of `ACCENT #D98A3C` in any of these rooms.** None of them contains a
  primary action or a live burn. `CAUTION_RUST #A8624B` appears exactly once per room, as
  specified in S3, and nowhere else.

---

# PART 0 — What is going wrong at the level of the whole station

The station is a **line of three rooms, 22.8 m long, crossed in 12.3 seconds**, in which
the ceiling and wall luminance of all three rooms lies between 43 and 47 out of 255. There
is one window, one long sightline, and nothing at all above 1.6 m in any room.

Every specific complaint in the review reduces to one of three quantities being too small:

| quantity | now | needs to be |
|---|---|---|
| walked distance before repetition | 22.8 m total | ≥ 120 m, no room seen twice on the way out |
| luminance spread within one frame | 3–5 values typical, 60.5 % of frame in one 8-value bucket | ≥ 90 values, no bucket over 40 % |
| occupied height band | 0 – 1.6 m | 0 – ceiling, with a mandated band at 2.05 m |

None of this is a taste problem. The look is good. There is not enough of it, and what
there is is all at one value.

## The ordering principle

**Compress, reveal, then vary — and never let the player meet two rooms of the same
proportion in a row.**

The player meets, in this order:

1. **THE CRAWL** — the smallest, lowest, darkest thing in the game, entered at its blind
   end. Eight seconds. Its only job is to calibrate the body: you learn how tall you are
   by nearly hitting your head.
2. **THE LIMB DECK** (existing, revised) — the first room you can stand up in, and the
   first exterior reference. The relief is the point; it only exists because of step 1.
3. **THE SPINE** (existing, revised) — the first long sightline, and the first room with
   nothing in it. Pacing. You are being made to wait.
4. **THE CROSSING** (replaces THE NODE) — a junction whose four exits are four different
   shapes. This is where the player starts holding a map in their head, and it is the
   room every future compartment attaches to.
5. **THE CROWN** — 9.6 m tall, entered through a 2.06 m door. Ratio 4.7 : 1. This is the
   reveal, and it is the reason the first four rooms were withholding.
6. Then the branches, in any order the player finds them: **THE BEND** (curved, glazed),
   **THE RACKS** (dense), **THE GANTRY** (wide, low, lit from below), **THE MAGAZINE**
   (empty, cold, values inverted), **THE SILL** (vertical, downward).

Why that sequence: a reveal is worth exactly as much as the compression preceding it. The
current build has no compression anywhere, which is why nothing in it reads as large — the
limb deck is 3.5 m wide and 3.25 m tall and feels like neither, because the room before it
is the same and the room after it is a corridor you never had to earn.

## What transfers from Hollow Knight — mechanisms, not vibes

The owner is right that it transfers; it just does not transfer as level design. It
transfers as four rules about *change*.

**HK-1. The three-axis rule.** Hollow Knight never changes one thing at an area boundary.
Greenpath is not "the green one": it is simultaneously a hue shift, an architectural
motif change (cut stone → organic curved masses), a light-direction change (side-lit →
dappled from above), a density increase, and an ambient audio change. Five axes at once.

  *Translation, enforced:* **every pair of rooms joined by a collar must differ on at
  least three of these seven axes,** and the table in Part 2 states which three for every
  pair:
  1. ceiling height (≥ 0.8 m difference)
  2. floor-plan aspect ratio (≥ 2 : 1 difference)
  3. dominant light direction (overhead / raking / from below / from one side / none)
  4. value structure — which of {ceiling, wall, floor} is lightest, and the spread
  5. fitting density (fittings per m² of wall, stated per room)
  6. whether there is an exterior view
  7. whether the deck is level

**HK-2. The transition is a low-information buffer.** HK's area boundaries are always a
short, plain, dark room. The change lands as a change because the eye was given nothing
for two seconds first.

  *Translation, enforced:* GROUND TRACK already has this and is wasting it. The 1.24 m
  collars become **2.6 m long, dead flat at value 30–34, with no fittings whatsoever and
  no lamp of their own** (S4). You cross one in 1.4 seconds and arrive with your eye
  adapted to nothing.

**HK-3. Depth layers — and the value rule is function-coded, not distance-coded.** This is
the most transferable finding in the whole document and it is more specific than "it has
parallax". Hollow Knight composites three depth bands and treats them differently *by
role*:

  - **Midground — the playable geometry — carries the highest local contrast and the
    hardest silhouette edge in the composite.** Thicker outlines than anything else in
    the frame.
  - **Background is low-contrast and desaturated, with exactly one saturated bright accent
    in it**, and that accent is a landmark (City of Tears' lit windows, Crystal Peak's
    glow).
  - **Foreground dressing is rendered DARKER and flatter than the midground**, not
    brighter — near-black, under-detailed silhouettes whose only job is to frame the shot.
    They never compete for attention.

  *Translation, enforced, in three rules:*
  1. **No room may present a blank wall directly opposite a doorway within 6 m** (S5).
     Every opening shows at least two further depth planes.
  2. **Near-camera dressing — pipes, rails, structural members within 1.5 m of the walking
     line — is under-lit relative to the surface behind it, always.** A foreground object
     is never the brightest thing in a frame. A builder will get this wrong by instinct,
     because the natural move is to light the nearest object.
  3. **At the far end of every sightline over 5 m, put exactly one small warm element in
     an otherwise cold frame** (S12). This is HK's single saturated background accent, and
     there is a real spacecraft photograph of it: `R14`, Destiny with the lights off, is a
     cold green frame with one warm amber hatch glowing at the vanishing point 8 m away.
     That one warm point is what makes the picture read as deep rather than as cluttered.

  And, specific to GROUND TRACK: **the near frame of every doorway is the darkest thing in
  the picture** — collar interior at 30 against a room beyond at 90+. That is what `R05`
  (Unity hatch) and `R01` (ISS Cupola) both do: **the frame is the silhouette, the space
  beyond is the value.**

**HK-4. Landmarks are visible before they are reachable.** You see the City of Tears
raining through a window before you get there.

  *Translation, enforced:* **THE CROWN's upper galleries are visible from its deck and
  permanently unreachable**, and **THE SILL's sub-volume is visible through the floor**.
  Neither is a puzzle. They are the station telling you it is bigger than the part you
  are standing in — which is the single thing the current build never says.

**HK-5. One object that looks identical everywhere, so the player has an anchor.** Hollow
Knight's benches are the only thing that looks the same in all eleven areas, and they are
what a player without a minimap navigates by. Toll gates do the same job for boundaries:
one shape that means "threshold", regardless of the art around it.

  *Translation, enforced:* **S9 (the perch)** and **S4 (the collar flange ring)**. One
  identical rest object in every room, one identical ring at every threshold. Together
  they are the entire wayfinding system and neither is a UI element.

## Two warnings from the other references

**Tacoma.** Fullbright built a station and the strongest criticism of it was that the
architecture read as *faceless* — the memorable spaces turned out to be the ones with a
specific incident marked in the props (a fallen shelf, a broken pod), not the ones with
the best massing. A texture-less game relying on geometry alone is more exposed to this,
not less. That is what **S11 (one disorder per room)** is for: not narrative, not
gameplay, one object per room that is visibly not where it should be.

**Prey's Talos I.** Arkane used **two architectural registers** — polished "Neo-Deco"
public space against brutalist utilitarian space — to mark what a deck was built *for*
versus what it is used for now. It is a second-order organising idea that makes a station
read as having a history, and it costs nothing but discipline. That is **S10**.

---

# PART 1 — Station-wide changes the new rooms depend on

Build these first. Rooms specified in Part 2 assume all of them.

## S1 — Fix the doorway walk-through. Nothing else is worth building until this is done.

Today only **0.70 m of the 1.18 m clear seam is walkable**, and the outer 0.24 m on each
side stops the player dead inside the door recess with no feedback (OUTSIDE-EYE B1).

The bug is in `standingPoint()` (`src/env/viewer/controller.ts:195`): the winning
rectangle is chosen by nearest-legal-point, so an off-centre approach loses to the
rectangle behind you, and the teleport guard at line 627 then refuses the sideways
resolution.

**Fix:** before any margin logic runs, test whether the requested point is already inside
the union. If it is, return it unchanged with the `floorY` of the containing rectangle.
The margin then only ever applies to a point that is genuinely outside the floor, which is
what it was for.

```
function standingPoint(floor, x, z): Standing {
  for (const rect of floor) {
    if (x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ) {
      return { x, z, floorY: rect.floorY };        // already legal: do not move it
    }
  }
  ... existing nearest-with-margin logic, unchanged ...
}
```

**Acceptance test, and it must be a walk, not a teleport:** for every seam in the station,
for z from −0.55 to +0.55 in 0.05 m steps, place the player 1.5 m short of the seam facing
it, hold `W` for 2 s, and assert the player ended up on the far side. All 23 must pass.
Add it to `tests/` and to the CI gates. The current shot harness cannot catch this class
of defect and never will, because it teleports.

**Also:** raise `WALK_HALF_Z` in the spine from 0.75 to 0.78 and set every new room's
walkable rectangle to overlap its collar's full 1.18 m width, so the walkable seam is
1.10 m of the 1.18 m clear opening.

## S2 — The three-band wall. Apply to every vertical wall in the station, old and new.

This is the single highest-value change in the document. It fixes "nothing above 1.6 m",
"every frame is one value", and "rooms are indistinguishable" at once, and it is a rule a
builder can apply mechanically.

Every wall is divided into three horizontal bands. Each band has a different value, a
different fitting type, and a different depth off the wall plane.

```
   ceiling ──────────────────────────────────────────────
            CROWN BAND      value 28–36 (darkest in the room)
            2.05 m → ceiling    services: ducts, conduit, lamp housings,
                                trunking. Stands 0.10–0.22 m proud.
                                Reads as a dark void overhead.
   2.05 m ──────────────────────────────────────────────  ← the horizon line
            WORK BAND       value 95–155 (lightest in the room)
            0.95 → 2.05 m       the room's IDENTITY lives here: rack faces,
                                panel grids, window frames, lockers, glazing.
                                Recessed 0.06–0.12 m into the wall.
   0.95 m ──────────────────────────────────────────────
            KICK BAND       value 52–72 (mid)
            0 → 0.95 m          stowage, kick rails, deck fixings, cable
                                trays. Stands 0.04–0.09 m proud.
   deck  ──────────────────────────────────────────────
```

**Why 2.05 m and not some other number.** An International Standard Payload Rack — the
unit every ISS lab wall is made of — is **2.00 m tall × 1.05 m wide × 0.86 m deep**. The
work band is one rack high plus a 0.05 m curb. That is why the number is 2.05 and not
2.00, and it means every rack, locker, panel bank and window frame in the station is a
division of a real dimension rather than an invented one. The 1.05 m bay width follows
from the same source and is the module for every repeating element in the station.

**The one place the rule inverts.** Above **3.20 m** a room is no longer a room with a
crown band; it is a volume. In a tall room lit from above the crown band rule reverses:
**the upper volume is the LIGHTEST surface in the room and is crossed by dark linear
elements** — galleries, ring frames, duct runs, rails. This is Skylab's Orbital Workshop
dome (`R11`), where a 6.7 m pale dished volume reads perfectly because a small number of
dark linear members cross it, and it is the opposite of what GROUND TRACK does everywhere
today. It applies to THE CROWN and nowhere else in this document. THE MAGAZINE is also
tall and does *not* invert, because its light enters at one side and lands on a wall
rather than filling the volume — which is exactly what makes the two tall rooms different
from each other.

Consequences, all of them intended:

- Every frame contains a ≥ 60-value spread whichever way the player looks.
- The 2.05 m line is a **horizon**: it is at a constant height, so a room's ceiling height
  is readable at a glance by how much crown sits above it. In THE CRAWL there is 0.30 m of
  it; in THE CROWN there is 7.55 m.
- The identity band is at eye level, which is where a standing player actually looks.
- Two different builders authoring two different rooms produce rooms that belong to the
  same station.

The band boundaries are hard lines, not gradients: a 0.03 m dark reveal at 0.95 m and at
2.05 m, running the full length of every wall. Those two lines are the station's only
continuous element and they are what makes it one building.

## S3 — The rust datum. One hairline, one meaning, everywhere.

`CAUTION_RUST #A8624B` appears as a **single 0.012 m hairline stripe at exactly 1.10 m
above the local deck**, and only on walls that are a **pressure boundary** — a wall with
vacuum on the other side. It is absent on internal partitions.

That is the entire wayfinding system, it costs one quad per wall, and it is
palette-legal. Standing anywhere, a player can tell which walls are the outside of the
station. In THE CROSSING, three walls carry it and one does not; that is how you know
which exit leads deeper in.

It also does a second job for free: because it is at a fixed height, it is a ruler. On a
level deck it is dead straight; where the deck steps, it steps with it, and the step is
visible from across the room.

## S4 — Collars become the buffer room

Lengthen the collar from 1.24 m to **1.30 m each side (2.60 m through)**. Inside a collar:

- No fittings of any kind. No handrails, no placards, no conduit, no stowage.
- One flat value throughout, **30–34**, achieved with `interiorMaterial` emissive only —
  the collar carries no lamp of its own.
- The two lamps that light it are at its mouths, in the rooms, aimed **back into the
  rooms**, so the collar interior is the darkest surface visible from either side.
- Section: 1.18 × 2.06 exactly, square, with a 0.055 m flange ring at each end standing
  proud, and nothing else.

Crossing one takes 1.4 s at 1.85 m/s. That is the pause that makes the next room read as
a different place.

## S5 — The depth rule

**No room may present a blank wall directly opposite a doorway within 6 m of it.** What
faces a doorway is either: another doorway, an opening onto a taller volume, a deep recess
(≥ 0.9 m), or a free-standing mass with visible space behind it.

Where a room is too short for 6 m, the wall opposite the door carries a **3-plane recess**
— a 0.9 m deep, 1.6 m wide alcove whose back face is 0.35 m deeper again — so the eye
still gets three depth planes.

## S6 — A second seam size, for reveals only

Add **`GALLERY_SEAM`: width 2.10 m, height 2.30 m, collar 1.30 m.** Used exactly twice in
the station: entering THE CROWN and entering THE GANTRY. A wide, low opening is what makes
the volume beyond it read as tall — a tall door into a tall room cancels itself out.

`disagreement()` must refuse a `GALLERY_SEAM` connected to a `SEAM`; they are different
port types and are not interchangeable.

## S7 — Give the player a body

Currently, looking down shows floor and nothing else, and the arm is drawn only near an
operable point — which is twice in the whole station. There is nothing to measure a room
against.

Add a **permanently visible lower-frame element**: the shut coupling stack riding at rest,
at the bottom-right of the frame, occupying **the lowest 9 % of frame height and the
right-hand 14 % of frame width** at rest, never more. It is already modelled
(`player/arm.ts`); it just needs `HIDE_BELOW` bypassed for the rest pose and
`SHOULDER_OFFSET` biased so the shut stack clips the frame corner. Nothing else changes.

This is a one-mesh change and it makes every dimension in this document legible.

## S8 — One machinery tone per compartment

`machineryHz` already exists on the handle and is already polled per frame. Assign every
room a distinct fundamental so that the axis "ambient sound" is available as a
differentiator. Suggested, low to high: CRAWL 41, MAGAZINE 0 (silent — the only silent
room), GANTRY 52, CROWN 58, LIMB DECK 63 (existing), SPINE 78, CROSSING 87, RACKS 104,
BEND 116, SILL 132.

The MAGAZINE being genuinely silent is the point of the MAGAZINE.

## S9 — The perch. One object, identical in every room.

The station's bench-equivalent, and its only wayfinding anchor besides the datum line. The
limb deck already has a `perch` point of interest; this generalises it.

**Exactly one perch per compartment, geometrically identical everywhere:** a folded shelf
0.62 × 0.34 m at 0.62 m above the local deck, on a single bracket, with a 0.42 m grab loop
above it at 1.36 m. Value **96** for the shelf face and **34** for the bracket, in every
room regardless of the room's palette — it is the one thing that does not take on its
room's identity.

Placement rule: **always within 2.0 m of a port, always on the wall to the left as you
enter through that port.** Consistently on the left, in every room, forever. That
handedness is free orientation: a player who has been in three rooms knows which way they
came in from where the perch is.

Where a room has several ports, the perch goes by the one the player is most likely to
arrive through first, listed per room in Part 2.

## S10 — Two registers: fitted-out and as-built

Every compartment is one of two kinds, and no compartment is a blend.

**FITTED-OUT** — the station as it was meant to be used. Lined walls, all three bands
present, hard band reveals, rails, placards, panel grids, warmer light (`SETTLEMENT`
points in the mix). Rooms: LIMB DECK, SPINE, CROSSING, RACKS, BEND, SILL.

**AS-BUILT** — the raw pressure vessel, never fitted out or since stripped. Ring frames
exposed and standing proud, no liner, no work band panelling, fixings and weld lines
visible, no warm light at all, kick band replaced by bare deck. Rooms: CRAWL, CROWN,
GANTRY, MAGAZINE.

This is a single binary and it is worth more than it costs: it means a player crossing a
collar can tell, in the first frame, whether they have moved into a part of the station
that was finished. And it gives the builder an unambiguous answer to "does this wall get
a panel grid?" for every wall in the station.

The register is also the ordering: the player's route goes as-built (CRAWL) → fitted-out
(LIMB DECK, SPINE, CROSSING) → as-built (CROWN) → and thereafter alternates. Nobody
crosses two collars in a row without the register changing.

## S11 — One disorder per room

Exactly one object per compartment is visibly not where it should be, and it is the same
kind of statement every time: **something that has a defined stowed position, not in it.**

Not a story. Not a note. No sequence, no meaning, nothing to find. One object out of
place, sized so a player notices it within about four seconds of standing still.

| room | the disorder |
|---|---|
| CRAWL | one stowage bag unclipped, resting against the step nosing |
| LIMB DECK | one locker door standing 40° open |
| SPINE | one deck plate lifted and leaning against the wall, its bay open |
| CROSSING | a coil of cable dropped on the raised platform, not on its reel |
| CROWN | a crate on gallery 1, up where nothing can reach it |
| BEND | one window shutter half-lowered, cutting one pane in half |
| GANTRY | one tank off its saddle, tipped 12° against its neighbour |
| RACKS | four drawers withdrawn (already specified) |
| MAGAZINE | one crate 3 m from the other eight, on its side |
| SILL | a tool tray balanced on the grating kerb, half over the void |

Each of these is one small mesh. Together they are the difference between ten rooms and
ten places, and they are the specific answer to the criticism Tacoma got.

## S12 — One warm point at the end of every long sightline

Any sightline longer than 5 m ends in **exactly one warm element** — `SETTLEMENT #C9A063`
or `FOIL #B99A63` — in an otherwise cold frame, subtending no more than **1.5 % of the
frame area** at the point where the sightline begins.

It is a landmark, not a light: a small warm-valued surface, a fitting, a lit panel edge.
Never a glow, never a halo, never larger than stated.

This is what makes `R14` (Destiny at night) read as an 8 m deep space rather than as
clutter, and it is what the current spine — a cold frame ending in a cold frame — has
nothing of. Applies to: the SPINE's far end, the CRAWL's exit, the RACKS' far door, the
GANTRY's long axis, THE BEND (its warm point is the only thing 4.5 m ahead), and THE
CROWN's deck seen from the doorway.

---

# PART 2 — The eight rooms

Differentiation table. Every adjacent pair differs on at least three axes; the axes are
listed per room and cross-checked at the end of this part.

| room | plan (m) | ceiling (m) | aspect | light direction | lightest → darkest | density | view | level |
|---|---|---|---|---|---|---|---|---|
| CRAWL | 7.20 × 1.18→1.02 | 2.35 | 6.6 : 1 | from both ends only | wall → floor → ceiling | very high, all within reach | none | steps up 0.40 |
| LIMB DECK* | 6.20 × 3.51 | 3.25 | 1.8 : 1 | orbital, from the cupola | floor → wall → ceiling | medium | cupola | level |
| SPINE* | 10.10 × 1.62 | 2.24 | 6.2 : 1 | overhead cove | wall → floor → ceiling | very low | none | level |
| CROSSING | 5.40 × 4.20 | 2.60 → 4.40 | 1.3 : 1 | raking from the high end | wall → ceiling → floor | medium | none | step up 0.45 |
| CROWN | 6.60 × 5.00 | 9.60 | 1.3 : 1 | from directly above | floor patch → wall → ceiling | low on deck, high overhead | crown port | level |
| BEND | 8.80 arc × 1.90 | 2.55 | 4.6 : 1 | from one side, moving | glazing → wall → ceiling | low | window band | level |
| GANTRY | 13.00 × 8.40 | 2.15 | 1.5 : 1 | **from below** | floor → ceiling → wall | medium, at knee height | none | level |
| RACKS | 8.40 × 3.05 | 2.42 | 2.8 : 1 | flat, from the aisle | rack face → floor → recess | **very high** | none | level |
| MAGAZINE | 5.00 × 5.00 | 5.60 | 1.0 : 1 | from a ceiling grating | ceiling → wall → floor | **almost none** | grating | level |
| SILL | 6.00 × 4.00 | 3.00 | 1.5 : 1 | from **below the floor** | wall → ceiling → floor void | low | none | grating over 4.5 m void |

\* existing rooms, revised — see Part 3.

Register (S10), perch placement (S9), machinery tone (S8) and the single disorder (S11),
per room:

| room | register | perch is left of… | tone (Hz) | disorder |
|---|---|---|---|---|
| CRAWL | as-built | the only port | 41 | unclipped stowage bag against the step nosing |
| LIMB DECK* | fitted-out | the collar to THE CRAWL | 63 | locker door standing 40° open |
| SPINE* | fitted-out | the `fore` port | 78 | lifted deck plate leaning on the wall |
| CROSSING | fitted-out | the `aft` port | 87 | dropped cable coil on the raised platform |
| CROWN | as-built | the `west` (GALLERY) port | 58 | a crate on gallery 1, where nothing can reach it |
| BEND | fitted-out | the `west` port | 116 | one shutter half-lowered across a pane |
| GANTRY | as-built | the `south` (GALLERY) port | 52 | one tank off its saddle, leaning 12° |
| RACKS | fitted-out | the `south` port | 104 | four drawers withdrawn |
| MAGAZINE | as-built | the only port | **0 (silent)** | one crate 3 m from the other eight, on its side |
| SILL | fitted-out | the `west` port | 132 | tool tray balanced half over the void |

No collar is crossed without the register changing, except SPINE → CROSSING and
CROSSING → RACKS, which are the two pairs that instead differ most on density.

---

## ROOM 1 — THE CRAWL

> *A duct somebody fitted out for people afterwards, and not very well.*

**Where the player starts.** The spawn moves here.

### Dimensions

- Footprint **7.20 m (x) × 1.18 m (z)** at the port end, narrowing to **1.02 m** from
  x = −2.6 to the blind end.
- Ceiling **flat at 2.35 m** for the whole length. It never moves; the floor does.
- Deck in three steps: **floorY 0.00** for x ∈ [−3.60, −1.40]; **+0.20** for
  x ∈ [−1.40, +0.60]; **+0.40** for x ∈ [+0.60, +3.60].
- Therefore headroom above the deck: **2.35 → 2.15 → 1.95 m**, and clearance above a
  1.74 m eye: **0.61 → 0.41 → 0.21 m**.

**Against a body:** at the blind end your eye is 21 cm below the ceiling and your
shoulders are 40 cm from both walls. You will duck even though you do not have to. That
is the whole room.

### Circulation

One way in and out. **Dead-end spur**, port at x = −3.60 on the −x face, standard `SEAM`,
floorY 0.

- **On spawn** (x = +3.10, z = 0, yaw = π/2, pitch = −0.06) you are looking down the
  length of the tunnel at the two steps descending away from you, with the far end
  brighter than anything near you. The exit is the brightest thing visible and it is
  7 m away and 0.40 m below you.
- **Hidden until you turn:** the blind end behind you — a bolted blank flange with the
  station's build plate on it — and the fact that the tunnel is 0.16 m narrower here than
  at the far end. Turning round in a 1.02 m tunnel is itself the first time the player
  learns how wide they are.

### Governing structural logic

**It is a pressure duct on a 1.20 m module pitch, and every single thing in it is fitted
between two ring frames.** That one sentence produces everything: ring frames every
1.20 m (six of them), all fittings sitting in the 1.08 m bays between them and never
crossing one, the steps landing exactly on a frame, and the narrowing happening at a
frame rather than anywhere else.

### Contents, positioned

Coordinates are (x, y, z), local, y measured from the local deck under that x.

| item | position | size (m) | notes |
|---|---|---|---|
| ring frames ×6 | x = −3.00, −1.80, −0.60, +0.60, +1.80, +3.00 | 0.10 wide, standing 0.075 proud all round | the whole rhythm of the room |
| cable trunk | z = −0.48, y 1.55 → 1.72, x −3.4 → +3.4 | 0.17 tall, 0.11 proud | continuous, crosses the frames in a notch |
| stowage soft bags ×11 | alternating bays, z = +0.44, y 0.10 → 0.62 | 0.42 × 0.52 × 0.30 | irregular sizes; the only soft silhouette |
| handrail ×6 | one per bay, z = −0.46, y = 1.02 | 0.62 long | at 1.02 m, i.e. *below* the datum line |
| step nosings ×2 | x = −1.40, +0.60 | 0.09 × 0.05 | pale, value 120, the only bright thing at floor level |
| blank flange | x = +3.60 | 1.02 × 1.95 | with an extruded build plate, 0.28 × 0.10, standing 0.008 proud |
| duct elbow | x = +2.4 → +3.4, z = +0.5, y 1.9 → 2.35 | 0.30 dia | dives into the crown band and is cut off by the blank |

**Density: crowded, uniformly.** There is something within arm's reach at every point.
This is the only room in the station where that is true, and it is why the LIMB DECK
afterwards reads as open.

### Light rig

- 1 × `HemisphereLight`, sky `HULL_SHADOW`, ground `NIGHT_SIDE`, intensity **0.35**.
  Deliberately low — this room is under-lit and should be.
- 1 × `DirectionalLight`, `CLOUD`, intensity **0.55**, at (−4.6, 1.9, 0) targeting
  (−1.0, 0.4, 0). This is light *leaking in from the collar mouth*. It rakes along the
  floor toward the player and dies out by mid-length.
- 1 × `PointLight`, `SETTLEMENT` (warm, `#C9A063`), intensity **0.45**, range 2.4 m, at
  (+2.85, 2.10, +0.30) — a single small fitting near the blind end, warm, so the two ends
  of the tunnel are **different colour temperatures** and you can always tell which way
  you are facing.
- **No lamp anywhere in the middle 4 m.** The middle of this room is the darkest walkable
  place in the station.

### Value structure

| surface | reads at |
|---|---|
| lightest: step nosings and the far collar mouth | **120** |
| work-band wall (bag faces, frames) | 88 |
| kick band | 58 |
| floor | 44 |
| ceiling / crown band | **30** |

Spread 30 → 120. The ceiling is the darkest surface, which is true in no other room.

### Differs from every other room on

1. **Headroom** — 1.95 m at the blind end is 1.65 m lower than THE CROWN's entry bay and
   0.29 m lower than the spine.
2. **Value order** — ceiling is the darkest surface here; in the GANTRY and MAGAZINE it is
   the lightest.
3. **Two colour temperatures in one room** — cool at one end, warm at the other. Nowhere
   else does this.
4. **Fitting density within arm's reach** — the only room where the player is touching
   distance from something at every position.
5. **It is the only dead end in the station.**

### The one thing that would ruin it

**Lighting the middle.** A builder who finds the mid-length too dark and adds a fixture
destroys the room completely: the entire point is that you walk 3 m through near-nothing
between two visible lit ends. If it measures below 30 in the middle, that is correct. The
acceptance criterion is that the frame taken at x = 0, yaw = π/2 has a **mean luminance
below 40 and a maximum above 110** — dark, with the exit visible in it.

### Plan and section

```
PLAN  (x horizontal, z vertical; 1 char ≈ 0.20 m)
                                                              blind end
   ┌───────────────────────────────────────────────────────────────┐
   │ ▓                                                             │  z = +0.59
 ← │ ▓  ░░░   ▐  ░░░   ▐  ░░░  ▐  ░░░   ▐  ░░░   ▐  ░░░   ▐        │      ↑ +z
port │ ▓                                                        ●   │
   │ ▓  ═══════════════════════════════════════════════════        │  z =  0.00
   │ ▓                                                             │
   │ ▓  ▬▬▬   ▐  ▬▬▬   ▐  ▬▬▬  ▐  ▬▬▬   ▐  ▬▬▬   ▐  ▬▬▬   ▐        │  z = −0.59
   └───────────────────────────────────────────────────────────────┘
   x=−3.60      −1.80      −0.60     +0.60      +1.80      +3.60
        |←──────────── 7.20 m ────────────────────────────────→|
        |← 1.18 m wide ─→|←────────── 1.02 m wide ────────────→|

   ▐ ring frame (0.10 wide, 6 off, 1.20 m pitch)
   ░ stowage bags, +z wall        ▬ handrail + cable trunk, −z wall
   ● warm point lamp (+2.85, 2.10, +0.30)      ▓ collar mouth


SECTION on the centreline (x horizontal, y vertical; 1 char ≈ 0.20 m)
                                                        2.35 m ceiling, FLAT
   ────────────────────────────────────────────────────────────────
        crown band (value 30) ......... 0.30 m .....│
   ═══════════════════════════════════════════════════════════════  y = 2.05 datum
                                                      ●
        work band (value 88)                                        │ 0.21 m
   ─────────────────────────────────────────────── ─ ─ ─ ─ ─ ─ ─ ─ ─┴─ eye 1.74
   ┈┈┈┈┈ rust datum 1.10 ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
        kick band (value 58)
                                              ┌─────────────────── +0.40
                          ┌───────────────────┘  step 0.20
   ───────────────────────┘  step 0.20                    deck
   x=−3.60             −1.40              +0.60          +3.60
   headroom  2.35 m       2.15 m            1.95 m
   clearance above eye  0.61 m   0.41 m     0.21 m
```

---

## ROOM 2 — THE CROSSING

> *A four-way junction where none of the four ways looks like any of the others.*

Replaces THE NODE. Do not try to fix THE NODE; its defect is that it is regular, and
regularity is not a decoration problem.

### Dimensions

- Footprint **5.40 m (x) × 4.20 m (z)**, rectangular, not octagonal.
- Ceiling **slopes**: 2.60 m at x = −2.70, rising linearly to **4.40 m** at x = +2.70.
  Slope 18.6°. Built as **9 flat facets** across the x span, each 0.60 m of run, so it
  steps in value.
- Deck level at 0 except a **raised platform at +0.45 m** occupying z ∈ [+1.05, +2.10],
  x ∈ [−0.80, +1.60], reached by three treads of 0.15 m at x ∈ [−1.25, −0.80].

**Against a body:** at the low end the ceiling is 0.86 m above your eye and you can see
its facets clearly; at the high end it is 2.66 m above your eye and reads as a void. You
walk 5.4 m and the room doubles in height around you without a step in the floor.

### Circulation

**Hub. Four ports, all different.**

| port | face | local `at` | type | character |
|---|---|---|---|---|
| `aft` | −x | (−2.70, 1.03, 0.00) | `SEAM` | to the SPINE. Centred, level, ordinary. The way you came in. |
| `fore` | +x | (+2.70, 1.03, **+1.15**) | `SEAM` | offset 1.15 m off centre, under the high ceiling. To THE BEND. |
| `high` | +z | (**+0.40**, 1.03 + 0.45, +2.10) | `SEAM` | on the raised platform, sill 0.45 m up. To THE CROWN. |
| `low` | −z | (−1.30, 1.03, −2.10) | `SEAM` | set at the back of a **1.00 m deep recess**, so it reads as a tunnel mouth, not a door. To THE RACKS. |

- **The instant you enter from the spine** (through `aft`, at eye level, looking +x): the
  ceiling climbing away from you to the right, the diagonal service trunk filling the
  near-left corner, and the three treads of the stair catching light at the far right.
  Three different shapes, immediately.
- **Hidden until you turn:** the `low` recess is behind and to your left as you enter and
  is invisible until you are 2 m into the room. It is the only exit you have to look for.

### Governing structural logic

**The station's main pressure trunk passes diagonally through this corner of the module
and everything else has been arranged around it.** That produces: the 45° trunk in the
−x/−z corner; the sloping ceiling (the trunk forces the crown up as it crosses); the
raised platform (it sits on top of the trunk's lower run); the off-centre `fore` port
(pushed aside by the trunk); and the recessed `low` port (tunnelled *under* the trunk).

Every asymmetry in the room has the same single cause, which is the difference between a
room that is irregular and a room that is authored.

### Contents, positioned

| item | position (x, y, z) | size (m) | notes |
|---|---|---|---|
| **service trunk** | from (−2.70, 0, −2.10) to (−0.30, 4.40, −0.20), 45° in plan | 1.30 across, full height | 8-sided prism, `HULL_SHADOW`. The room's spine. Value 34. |
| trunk flanges ×5 | every 0.85 m up the trunk | 1.46 across, 0.07 thick | the trunk's own rhythm |
| raised platform | x −0.80 → +1.60, z +1.05 → +2.10 | deck at +0.45 | `FloorRect` with `floorY: 0.45` |
| stair treads ×3 | x −1.25 → −0.80, z +1.05 → +2.10 | 0.15 rise, 0.15 going | nosings value 130 |
| stair rail | z = +1.05, y 0.45 → 1.30 | 0.05 tube | the only rail in the room |
| rack bank | +x wall, z −2.10 → +0.40, y 0.95 → 2.05 | 6 bays × 1.05 × 0.95 | work band, value 148 |
| low-port recess | z −2.10 → −1.10, x −1.89 → −0.71 | 1.18 wide, 2.06 tall, 1.00 deep | its interior at value 30 |
| overhead trunking | crown band, +z and +x walls | 0.22 proud | value 30 |
| deck plate change | on the raised platform only | — | platform deck reads 88; main deck reads 60 |

**Density: medium on the walls, empty in the middle 2.5 m.** You must be able to stand in
the centre and see all four exits without anything in the way. The room is a decision
point; its floor is clear on purpose.

### Light rig

- 1 × `HemisphereLight`, sky `HULL`, ground `HULL_SHADOW`, intensity **0.55**.
- 1 × `DirectionalLight`, `CLOUD`, intensity **0.95**, at (+3.4, 4.2, +0.6) targeting
  (−2.0, 0.0, −0.6). **This is the room's key and it rakes down the ceiling slope.**
  Because it comes from the high end, the sloped ceiling facets step in value from 96 at
  the high end to 42 at the low end — nine discrete steps — and the slope becomes
  readable rather than merely present.
- 1 × `DirectionalLight`, `HULL`, intensity **0.30**, at (−3.0, 2.2, −2.6) targeting
  (0, 1.0, 0). A cold fill from behind the trunk, so the trunk always has a bright edge on
  one side and a dark face on the other.
- 1 × `PointLight`, `MINT`, intensity **0.40**, range 3.0, at (−1.0, 1.10, +1.6) — at the
  stair, below eye level, so the treads and their nosings are lit from underneath and the
  stair reads as a stair from anywhere in the room.
- Two collar lamps aimed **back into this room** at each of the four mouths, per S4.

### Value structure

| surface | reads at |
|---|---|
| lightest: rack faces in the work band, +x wall | **148** |
| stair nosings | 130 |
| ceiling at the high end | 96 |
| raised platform deck | 88 |
| main deck | 60 |
| ceiling at the low end | 42 |
| service trunk faces | 34 |
| darkest: the four collar interiors and the low recess | **30** |

Spread 30 → 148. The ceiling spans 42 → 96 *within itself*, which no other room does.

### Differs from every other room on

1. **The ceiling is not parallel to the floor.** Unique in the station.
2. **Four exits of four different kinds** — centred/level, offset/level, raised, recessed.
3. **A level change inside a room** (the +0.45 platform); only THE CRAWL also has one, and
   the CRAWL's is a descent along a line while this is a plateau to one side.
4. **A single diagonal mass** in an otherwise orthogonal station.
5. **Light keyed from a corner at ceiling height**, raking down a slope — nowhere else.

### The one thing that would ruin it

**Centring anything.** If the builder centres the `fore` port, or squares off the trunk to
the grid, or makes the platform symmetric about the x axis, the room reverts to being a
node and the entire orientation problem comes back. Acceptance criterion: **take four
frames, one from the centre facing each port. No two of the four may have their
brightest 5 % of pixels in the same third of the frame.** If two do, something is still
symmetric.

### Plan and section

```
PLAN  (1 char ≈ 0.17 m x, ≈ 0.21 m z)
                          z = +2.10
   ┌──────────────────────█████────────────────┐
   │                      ▓high▓               │   █ = high port (sill +0.45)
   │            ┌─────────────────────┐        │
   │            │  RAISED  +0.45 m    │        │   z = +1.05
   │        ╔═╗ │                     │        │   ╔═╗ = 3 treads
   │        ╚═╝ └─────────────────────┘        │
 ██│                                           │██ z =  0.00
 ▓▓│                  ·                        │▓▓  ← fore port, OFFSET +1.15
 aft            (clear centre 2.5 m)           │▓▓
 ██│      ╲                                    │██
   │       ╲   TRUNK 1.30 across, 45°          │   ██ = aft port, centred
   │        ╲                                  │
   │         ╲      ┌──────────┐               │   z = −1.10
   │          ╲     │  recess  │               │
   └───────────╲────█████──────┴───────────────┘   z = −2.10
                     low port, 1.00 m deep recess
   x=−2.70                                    x=+2.70
        |←──────────────  5.40 m  ──────────────→|
   ceiling 2.60 m ────────────────────→ 4.40 m


SECTION on z = 0, looking −z (x horizontal, y vertical; 1 char ≈ 0.20 m)
                                                           ┌──── 4.40
                                                     ┌─────┘
                                          ┌──────────┘   ← 9 flat facets,
                               ┌──────────┘                 0.60 m of run each
                    ┌──────────┘                            value 42 → 96
         ┌──────────┘
   ┌─────┘  2.60
   │
   │  crown band (30)
   ══════════════════════════════════════════════════════════  y = 2.05 datum
   │  work band: racks 148 on the +x wall
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  eye 1.74
   ┈┈┈┈ rust datum 1.10 (−x, −z, +z walls only; NOT +x) ┈┈┈┈┈
   │  kick band (60)
   └──────────────────────────────────────────────────────────  deck 0.00
   x=−2.70                                              x=+2.70
   ▲ aft port                                    fore port ▲
```

---

## ROOM 3 — THE CROWN

> *A shaft with three decks of gallery above you, and no way up.*

The reveal. Everything before it is compression; this is the release. Build it fourth and
nothing before it matters until it exists.

### Dimensions

- Footprint **6.60 m (x) × 5.00 m (z)**.
- **Crown at 9.60 m.** The player's eye is at 1.74 m. The ratio of ceiling height to eye
  height is 5.5 : 1.
- Entry through **GALLERY SEAM, 2.10 wide × 2.30 tall** (S6), on the −x face at z = 0.
  Ratio of room height to door height: **4.2 : 1**.
- Three galleries at **+3.20 m, +5.60 m, +8.00 m**, each a **0.90 m wide** open grating
  running along the +z, −z and +x walls (three sides; the −x side above the door is open,
  so you can see the full 9.6 m from the doorway).
- Crown aperture: **2.20 × 1.40 m overall**, in the crown, canted **20° from horizontal**
  toward −x, its centre at (+1.10, 9.60, 0). **Divided into six panes** by a cross of
  0.10 m frame members — two rows of three, each pane 0.68 × 0.62 m. No real pressure hull
  carries a 2.2 m single pane; the ISS Cupola's largest window is 0.80 m across. Six panes
  is both believable and, more importantly, gives the frame the dark cross-silhouette that
  makes the aperture read (`R01`, `R02`).

**Against a body:** you enter through an opening 0.56 m taller than you into a room five
and a half times your height. There is nothing else in the station within a factor of two
of it. From the doorway you can see all three galleries and the sky.

### Circulation

**Through-route, two ports, both at deck level.**

- `west` (−x face, z = 0): `GALLERY_SEAM`, from THE CROSSING's `high` port.
- `east` (+x face, z = −1.40): standard `SEAM`, offset, to THE MAGAZINE.

- **The instant you enter:** everything. This is the one room in the station that does not
  withhold — you see the full height, all three galleries, the aperture and the light
  patch on the deck from the doorway. Withholding here would waste the only reveal in the
  game.
- **Hidden until you turn:** the `east` port, which is offset 1.40 m and sits behind the
  plant block, and the underside of the lowest gallery directly above the door, which you
  can only see by walking in and looking back.

### Governing structural logic

**It is a lift trunk with the lift removed, and the crew decks that used to serve it are
still there.** Everything follows: the galleries are at the old deck levels, they are open
gratings because the lift shaft needed the clear volume, the walls carry the guide rails
full height, and there is a plant block at the bottom because that is where the machinery
went when the lift came out.

### Contents, positioned

| item | position (x, y, z) | size (m) | notes |
|---|---|---|---|
| **guide rails ×4** | corners, (±3.10, 0→9.60, ±2.35) | 0.16 × 0.16 | continuous, unbroken, floor to crown. They are the room's vertical measure. |
| galleries ×3 | y = 3.20, 5.60, 8.00 | 0.90 wide, 0.10 thick, three sides | grating: 14 bars per metre, 0.02 × 0.05, so they read as a value break not a solid |
| gallery rails ×3 | inboard edge of each | 0.045 tube at 0.95 above each gallery | |
| plant block | x +1.90 → +3.10, z −2.35 → −0.30, y 0 → 2.05 | 1.20 × 2.05 × 2.05 | free-standing, 0.60 m clear behind it — S5 depth |
| crown aperture | centre (+1.10, 9.60, 0), canted 20° | 2.20 × 1.40 | 0.35 m deep reveal; frame reads at **20** |
| light patch (deck) | centre (−0.30, 0.002, +0.20) | 2.60 × 1.70 quad | value **136**. Translates +x 1.9 m over the orbit period, then resets by crossing the room over 40 s. |
| light patch (gallery 1) | on the +z gallery, y 3.202 | 1.40 × 0.60 | value 112, same motion |
| ladder stub | −z wall, y 0 → 2.60 | 0.42 wide | goes up 2.6 m and stops at a removed platform. Reads as "the way up used to be here". |
| stowage cluster | deck, x −2.6 → −1.4, z +1.2 → +2.2 | 9 crates, 0.45–0.70 | the only human-scale objects in the room, deliberately at the far corner so they read tiny |

**Density: sparse on the deck, dense overhead.** The floor is nearly empty; the crown band
above 2.05 m carries the galleries, their rails, the rails' shadows-in-value, the guide
rails and the aperture. That is the inversion — this is the only room where the
interesting half is above you.

### Light rig

- 1 × `HemisphereLight`, sky `HULL_SHADOW`, ground `NIGHT_SIDE`, intensity **0.28**.
  Low: this room is lit by one thing.
- 1 × `DirectionalLight`, `SUN_COLOUR #FFF0D6`, intensity **1.30**, positioned at
  (+6.0, 16.0, +2.0) targeting (−0.3, 0, +0.2) — i.e. **through the aperture, from above
  and slightly aft**. Its direction is driven by the orbit sample, so it swings across the
  room over the orbital period and the light patch moves with it.
- 1 × `PointLight`, `SETTLEMENT`, intensity **0.35**, range 4.5, at (−2.9, 1.30, 0) — a
  single warm fitting beside the door, at *below* eye height, so the entrance wall is warm
  and the rest of the room is cold. Standing on the deck you are in warm light and looking
  into cold; that is the temperature gradient the room runs on.
- **No lamps on the galleries.** They are lit only by the aperture.

**The value inversion above 3.20 m (S2).** This is the one room where up is bright. The
upper walls, from 3.20 m to the crown, are the **lightest large surface in the entire
station at value 118**, and the three galleries cross them as **dark bands at 34**. The
model is Skylab's Orbital Workshop dome (`R11`): a big pale dished volume made legible by
a small number of dark linear members crossing it, not by being dark itself. Getting this
backwards — a dark upper volume with pale galleries — produces a room that is merely tall,
and the whole point is that it is tall *and* the only bright thing in the station is
overhead where you cannot go.

Downward from the crown the walls step: 118 above 6.4 m, 84 between 3.2 and 6.4 m, then
the ordinary crown-band value of 34 below 3.2 m. Three flat steps, not a gradient — the
station has no gradients.

Cast shadows: **none, and none needed.** Both light patches are authored quads lying on
surfaces, the same technique `limbDeck/light.ts` already uses. Flag: if a future builder
wants the gallery gratings to cast a real pattern on the deck, that is one shadow map for
one directional light in one room, and it is affordable **once**, here, and nowhere else.
Author it as a striped quad first and only reach for the shadow map if the striped quad
fails.

### Value structure

| surface | reads at |
|---|---|
| lightest: sky through the aperture (day side) | **210** |
| upper walls, above 6.40 m | **118** |
| light patch on the deck | 136 |
| walls between 3.20 and 6.40 m | 84 |
| deck, away from the patch | 55 |
| walls, work band (below 2.05 m) | 48 |
| crown band below 3.20 m, and all three galleries | 34 |
| darkest: the aperture frame, its cross members and reveal | **20** |

Spread 20 → 210. **190 luminance values in one frame.** The current station's best is 90,
in the limb deck at noon.

Note the aperture frame at 20 against sky at 210 — that is the ISS Cupola relationship
from `R01`, and it is the opposite of what the limb deck currently does.

### Differs from every other room on

1. **Height.** 9.60 m, against a station maximum of 3.60 m.
2. **The interesting content is overhead.** Every other room puts its content at or below
   eye level.
3. **Value spread 190**, against a station best of 90.
4. **Light from directly above**, from one aperture, moving with the orbit.
5. **The only room entered through a `GALLERY_SEAM`** — a wide, low opening.
6. **The only room containing visible space the player cannot reach.**

### The one thing that would ruin it

**Making it reachable.** The instant there is a ladder that works, this stops being a
place and becomes a route, and the whole point — that the station is bigger than the part
you occupy — is gone. The ladder stub must visibly stop at nothing.

Second-worst mistake: **getting the inversion backwards.** If the upper walls come out
dark and the galleries pale, the room is merely tall and it looks like every other room
with the ceiling moved. Acceptance criterion: **from (−2.6, 1.74, 0) looking up at
pitch +1.0, the frame must measure mean luminance ≥ 90, with the three gallery bands
resolving at ≤ 40.** Bright field, dark bands. If the mean is under 70, the room is wrong
no matter how tall it is.

### Plan and section

```
PLAN at deck level  (1 char ≈ 0.15 m x, ≈ 0.19 m z)
                             z = +2.50
   ┌╫──────────────────────────────────────────╫┐
   │║          ╔══════════════════════╗        ║│  ╫ guide rail (corner)
   │║          ║  gallery over (+z)   ║        ║│  ║ gallery edge above
   │║          ╚══════════════════════╝        ║│
   │                                            │  z =  0.00
 ▓▓▓        ·  light patch  ▒▒▒▒▒▒              │
 ▓▓▓        (2.60 × 1.70, value 136,      ┌─────┤
 west       drifts +x over the orbit)     │PLANT│  z = −0.30
 ▓▓▓                                      │BLOCK│
   │        ○ ○ ○                         │     │
   │        ○ ○ ○  crates                 └─────┤  z = −1.40 → east port ▓▓
   │        ○ ○ ○                               │
   │║          ╔══════════════════════╗        ║│
   └╫──────────╚══════════════════════╝────────╫┘  z = −2.50
    x=−3.30                                x=+3.30
        |←────────────── 6.60 m ──────────────→|


SECTION on z = 0, looking +z  (1 char ≈ 0.22 m x, ≈ 0.30 m y)
                                        ╱▔┼┼▔╲   aperture 2.20 × 1.40, six panes,
   ─────────────────────────────────╱▔▔      ▔▔╲── canted 20°, frame value 20
   ║  · · · · UPPER WALLS 118 · · · · · · · · · · ║   9.60  crown
   ║ · · · ▓ SUN, through the aperture · · · · · ·║
   ║ · · · · ·╲· · · · · · · · · · · · · · · · · ║
   ║██████████╲███████████████████████████████████║   8.00  gallery 3 (dark 34)
   ║ · · · · · ╲ · · · · · · · · · · · · · · · · ║
   ║ · · · · · ·╲· · · · · · · · · · · · · · · · ║
   ║██████████████╲███████████████████████████████║   5.60  gallery 2 (dark 34)
   ║  walls 84     ╲                              ║
   ║                ╲                             ║
   ║█████████████████╲████████████████████████████║   3.20  gallery 1 (dark 34)
   ║                  ╲     ← below here the ordinary
   ║                   ╲      crown band applies (34)
   ║  ┌──── ladder    ╲          ┌──────────┐     ║   2.60  ladder stub ends
   ══╪══════stub══════════════════│  PLANT   │═════║   2.05  datum
  ┌──┴──┐  │           ╲         │  BLOCK   │     ║
  │ 2.30│  │  ● warm    ╲        │  2.05 t  │     ║
  │GALL-│  │  point      ╲       │          │     ║   1.74  eye
  │ ERY │  │  lamp        ╲      │          │     ║
  │SEAM │  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╲┈┈┈┈┈┈│┈┈┈┈┈┈┈┈┈┈│┈┈┈┈┈║   1.10  rust datum
  │2.10 │  │               ╲     │          │     ║
  └─────┴──┴────────────▒▒▒▒▒▒▒──┴──────────┴─────╨   0.00  deck
   x=−3.30    light patch (136)              x=+3.30
              on the deck

   entry opening 2.30 m tall : room 9.60 m tall  =  1 : 4.2
```

---

## ROOM 4 — THE BEND

> *A curved run with the outside along one shoulder, and you never see the far end.*

### Dimensions

- A **90° arc**. Centreline radius **5.60 m**, so the centreline run is **8.80 m**.
- Width **1.90 m** (inner radius 4.65, outer radius 6.55).
- Ceiling **flat at 2.55 m** throughout.
- Discretised into **14 segments of 6.43° each**, i.e. 0.63 m of centreline run per
  segment. That is fine enough that the curve reads as a curve and coarse enough that
  every segment is a flat facet that takes light differently — the value steps around the
  bend are the whole visual idea.

**Against a body:** the corridor is 0.28 m wider than the spine and 0.31 m taller. From
any point you can see about **4.5 m of run** before the outer wall cuts the sightline. You
never see both ports at once. It is the only place in the station where walking forward
reveals geometry rather than shrinking it.

### Circulation

**Through-route, two ports, at 90° to each other.**

- `west` (−x face at the arc's start): standard `SEAM`, from THE CROSSING's `fore` port.
- `north` (+z face at the arc's end): standard `SEAM`, to THE GANTRY.

Because the room turns 90°, `layout.ts` gets a real yaw to apply for the first time, and
the station stops being a straight line. This is the room that makes the map two
dimensional.

- **The instant you enter:** the glazing band on the outer wall, curving away to the
  right, and about 4.5 m of it. No far end.
- **Hidden until you walk:** everything past the fourth segment. And, three segments in,
  Earth crosses the glazing.

### Governing structural logic

**A pressurised run wrapped around the outside of a tankage bay, so the outer wall is hull
and the inner wall is the tank.** The outer wall therefore carries glazing, the rust datum
and hull ribs; the inner wall carries nothing but the tank's own belly bands and no datum
line at all. A player who has learned the datum rule (S3) knows which way is out from a
single glance at either wall.

### Contents, positioned

Positions given as (segment index 0–13, height, wall).

| item | where | size (m) | notes |
|---|---|---|---|
| **glazing band** | outer wall, segments 1–12, y 1.05 → 1.85 | 0.80 tall, 0.63 per pane | 12 flat panes. Frame members 0.09 between panes, reads at **22**. |
| glazing reveal | behind each pane | 0.28 deep | the panes sit 0.28 m back from the wall face — this is what makes it read as pressure hull |
| hull ribs ×14 | outer wall, one per segment joint | 0.12 wide, standing 0.09 proud, floor to ceiling | the rhythm |
| tank belly bands ×5 | inner wall, y 0.55 / 1.15 / 1.75 / 2.20 | 0.14 tall, 0.06 proud | continuous, curving; the inner wall's only feature |
| handrail | inner wall, y 1.02, continuous | 0.045 tube | follows the curve, unbroken all 8.80 m |
| deck | — | — | plain, value 50, with a 0.10 m pale kerb against the outer wall only |
| crown band | both walls above 2.05 | ducting 0.18 proud, outer wall only | value 30 |

**Density: low, and asymmetric.** The outer wall is busy and bright; the inner wall is
plain and dark. A frame taken facing along the run always has its bright half on the same
side, which is a compass.

### Light rig

- 1 × `HemisphereLight`, sky `HULL`, ground `HULL_SHADOW`, intensity **0.42**.
- 1 × `DirectionalLight`, `SUN_COLOUR`, intensity **1.10**, direction driven by the orbit,
  **entering through the glazing**. Because the wall is curved, at any instant it strikes
  three or four panes squarely and the rest at a grazing angle: the glazing band is bright
  for a stretch and dark for a stretch, and the bright stretch **travels around the bend**
  over the orbital period. Standing still in this room, the light walks past you.
- 4 × `PointLight`, `MINT`, intensity **0.22**, range 2.6, at segments 2, 5, 8, 11, at
  y = 2.42, tucked against the **inner** wall. Weak. They exist so the inner wall is not
  pure emissive floor; they must never be the brightest thing in a frame.
- A 1.30 × 0.36 m **authored light patch quad** on the deck under each lit pane, value 96,
  driven by the same orbit sample. Twelve of them; typically three are on at once.

### Value structure

| surface | reads at |
|---|---|
| lightest: Earth's lit limb through the glazing | **185** (orbit-dependent, 0 at night) |
| deck light patches | 96 |
| outer wall, work band between panes | 74 |
| deck | 50 |
| inner wall (tank) | 40 |
| crown band | 30 |
| darkest: glazing frame members | **22** |

The frame members at 22 against glazing at 185 is, again, the Cupola relationship: dark
frame, bright field.

### Differs from every other room on

1. **It is curved.** The only non-orthogonal room in the station.
2. **Sightline limited to ~4.5 m by geometry**, not by darkness.
3. **The light moves horizontally along the room** as the orbit turns; nowhere else does
   the *position* of the bright area change.
4. **Radical left/right asymmetry** — one wall glazed and busy, the other blank and dark.
5. **It turns the station's axis 90°.**

### The one thing that would ruin it

**Making the glazing continuous.** If the 0.09 m frame members are dropped or lightened,
the band becomes a bright stripe and the room becomes a corridor with a stripe in it. The
frames at value 22 are doing all the work: they are what makes 12 separate windows instead
of one, and 12 separate windows is what makes the curve legible. Acceptance criterion:
**with the sun on the glazing, a frame taken at segment 3 facing along the run must show
at least four distinct dark verticals crossing the bright band.**

### Plan and section

```
PLAN  (arc drawn schematically; radii true)
                                        north port ▓▓▓
                                             ║
                            ┌────────────────╨────┐
                       ╱▔▔▔▔                      │
                  ╱▔▔▔▔        seg 11,12,13       │
             ╱▔▔▔▔                                │
         ╱▔▔▔  seg 8,9,10          INNER WALL     │
      ╱▔▔                          (tank, plain,  │
    ╱▔  seg 5,6,7                   value 40,     │
   │                                NO datum)     │
   │  seg 3,4                                     │
   │                    R = 4.65 inner            │
   ▓  seg 0,1,2         R = 5.60 centreline       │
   ▓                    R = 6.55 outer            │
   ▓  west port         width 1.90                │
   └──────────────────────────────────────────────┘
   OUTER WALL: glazing band segs 1–12, ribs at every joint,
               rust datum at 1.10, kerb at deck

   centreline run 8.80 m,  14 segments × 0.63 m,  6.43° each
   visible run from any point ≈ 4.5 m


SECTION across the run (z horizontal, y vertical; 1 char ≈ 0.10 m)
        INNER (tank)                        OUTER (hull)
   │                                                    │  2.55 ceiling
   │  ═════ belly band 2.20                 ▓ duct      │
   ══╪═══════════════════════════════════════════════════  2.05 datum
   │                                    ┌──────────┐    │
   │  ═════ belly band 1.75             │ GLAZING  │←───┼─ 0.28 m reveal
   ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│ 1.05→1.85│─ ─ │  1.74 eye
   │  ═════ belly band 1.15             └──────────┘    │
   │  ── handrail 1.02                                  │
   │  ┈┈┈┈┈ (no datum on this wall) ┈┈┈ rust datum 1.10 ┈│  1.10
   │  ═════ belly band 0.55                             │
   │                                                kerb│
   └────────────────────────────────────────────────────┘  0.00 deck
   |←──────────────── 1.90 m ──────────────────────────→|
```

---

## ROOM 5 — THE GANTRY

> *A tank farm you walk between, lit from underneath.*

### Dimensions

- Footprint **13.00 m (x) × 8.40 m (z)**. The largest floor area in the station by a
  factor of 4.
- Ceiling **flat at 2.15 m**. The lowest ceiling of any room you can stand up straight in.
- Width-to-height ratio **3.9 : 1**. The far corner is 15.5 m away and 2.15 m up; the
  ceiling appears to converge with the floor.

**Against a body:** the ceiling is 0.41 m above your eye. You can touch it. And the room
is 8.4 m across. That combination — wide and pressing down — exists nowhere else and is
the exact opposite of THE CROWN, which is why THE CROWN should be met first.

### Circulation

**Through-route with a loop.** Three ports.

- `south` (−z face, x = −4.20): `GALLERY_SEAM` 2.10 × 2.30, from THE BEND. *The seam is
  0.15 m taller than the room's ceiling*, so entering it you step down into a lower
  volume — build the collar's last 0.6 m with a sloping soffit dropping 2.30 → 2.15.
- `east` (+x face, z = 0): standard `SEAM`, to THE SILL.
- `west` (−x face, z = +2.80): standard `SEAM`, back to THE RACKS — this is what closes
  the station's first loop.

- **The instant you enter:** a forest. Twenty-four cylinders, receding, with light coming
  up between them from below.
- **Hidden until you walk:** the `west` port, invisible from the `south` entrance because
  three ranks of tanks stand between them. This is the only room in the station where an
  exit is genuinely concealed by content rather than by a corner.

### Governing structural logic

**A consumables bay: twenty-four identical tanks on a 2.00 m grid, and the ceiling was
built down to the tanks' service height rather than up to a person's.** That explains the
2.15 m ceiling, the grid, the low lighting (the fittings light the *tanks*, not the
aisles), and the fact that the only headroom relief is directly over the aisles.

### Contents, positioned

Origin at room centre. Tanks on a **6 × 4 grid, 2.00 m centres**:
x = −5.00, −3.00, −1.00, +1.00, +3.00, +5.00; z = −3.00, −1.00, +1.00, +3.00.

| item | position | size (m) | notes |
|---|---|---|---|
| **tanks ×24** | grid above | Ø 1.05, height 1.55, standing on 0.14 saddles | 12-sided prisms. Top at 1.69 m — *just* below eye height, so you see over all of them. |
| tank caps ×24 | on each tank | Ø 0.62, 0.11 tall | value 96, the brightest tops in the room |
| tank strapping | around each, y 0.55 and 1.25 | 0.07 band | |
| **uplights ×12** | at (±5.0/±3.0/±1.0, 0.32, ±2.0) — between tank rows, in the aisles | Ø 0.20 fitting | see light rig |
| overhead pipe runs ×4 | y 1.95 → 2.10, along x, at z = ±1.00, ±3.00 | Ø 0.16 | so the ceiling has a rhythm and the low height is felt |
| aisle deck | between tanks, 0.95 m clear | — | value 78 — the deck is the *lightest* large surface in this room |
| walls | perimeter, 3-band per S2 | — | work band 66 only — the walls are deliberately dull; the room is about the middle |

**Density: medium, but distributed through the volume rather than onto the walls.** Every
other room in the station puts its content on the walls. This one puts it in the middle
and leaves the walls plain. That inversion is worth as much as the lighting inversion.

### Light rig

**This is the room defined by its light rig. It is lit from below and from nowhere else.**

- 1 × `HemisphereLight`, sky `NIGHT_SIDE`, ground `HULL`, intensity **0.30** —
  note sky and ground are *swapped* relative to every other room, so the ambient itself
  comes from underneath.
- **12 × `PointLight`**, `CLOUD`, intensity **0.42** each, range 3.2 m, at **y = 0.32 m**,
  in the aisles between tank rows. Twelve small point lights is inside budget for one
  room with no shadows and it is the entire look.
- 1 × `DirectionalLight`, `HULL_SHADOW`, intensity **0.18**, from (0, 6, 0) straight down.
  Almost nothing — just enough that the tank caps are not pure emissive.

Result, and this is the acceptance criterion: **the undersides and lower thirds of the
tanks read at 110–125; their upper thirds read at 44–52; the ceiling reads at 34.** The
tanks are bright at the bottom and dark at the top, which is the opposite of every other
object in the game, and it makes a still frame from this room unmistakable from three
rooms away.

### Value structure

| surface | reads at |
|---|---|
| lightest: tank lower thirds, lit from below | **122** |
| aisle deck near a fitting | 96 |
| tank caps | 96 |
| aisle deck between fittings | 78 |
| walls, work band | 66 |
| tank upper thirds | 48 |
| darkest: ceiling and overhead pipes | **34** |

Note the ordering: **floor lighter than wall lighter than ceiling**, and the objects
brighter at the bottom than the top. Every other room in the station is the reverse.

### Differs from every other room on

1. **Lit from below.** The only room in the game.
2. **The largest floor area** (109 m²) with the **lowest standing ceiling** (2.15 m).
3. **Content in the volume, not on the walls.**
4. **Objects that are brighter at their base than at their top.**
5. **It is the room where the station's first loop closes** — the only room with three
   ports at deck level.

### The one thing that would ruin it

**Adding a ceiling lamp.** One overhead fitting, anywhere, and the entire inversion
collapses and it becomes a warehouse. If the room seems too dark overhead, the correct
response is to raise the uplight intensity, never to add a fixture above 1.0 m.
Acceptance criterion: **no light source in this room may be above y = 0.40 m, except the
0.18-intensity down-fill.**

### Plan and section

```
PLAN  (1 char ≈ 0.26 m x, ≈ 0.30 m z)
   x=−6.50                                                x=+6.50
   ┌──────────────────────────────────────────────────────────┐ z=+4.20
   │                                                          │
 ▓▓┤   ◯     ◯     ◯     ◯     ◯     ◯                        │ z=+3.00
 west│      ·     ·     ·     ·     ·                          │
 z=+2.80  ·  uplights at y=0.32, between rows                 │
   │   ◯     ◯     ◯     ◯     ◯     ◯                        │ z=+1.00
   │      ·     ·     ·     ·     ·                           │
   │                                                          ├▓▓ east
   │   ◯     ◯     ◯     ◯     ◯     ◯                        │ z=−1.00  z=0
   │      ·     ·     ·     ·     ·                           │
   │                                                          │
   │   ◯     ◯     ◯     ◯     ◯     ◯                        │ z=−3.00
   │                                                          │
   └───────────────█████──────────────────────────────────────┘ z=−4.20
                   south (GALLERY SEAM 2.10 × 2.30), x=−4.20

   ◯ tank: Ø1.05, h1.55 on 0.14 saddle, top at 1.69 m
   grid 2.00 m centres → 0.95 m clear aisle between tank faces
   24 tanks, 12 uplights, 13.00 × 8.40 m, 109 m²


SECTION on z = 0, looking +z  (1 char ≈ 0.26 m x, ≈ 0.13 m y)
   ══════════════════════════════════════════════════════════  2.15 ceiling (34)
    ══◯══════◯══════◯══════◯══════◯══════◯══  pipe runs        2.05 datum
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   1.74 eye
     ▁▁▁    ▁▁▁    ▁▁▁    ▁▁▁    ▁▁▁    ▁▁▁                    1.69 tank tops (96)
    │dark│ │dark│ │dark│ │dark│ │dark│ │dark│   upper 1/3 = 48
   ┈│┈┈┈┈│┈│┈┈┈┈│┈│┈┈┈┈│┈│┈┈┈┈│┈│┈┈┈┈│┈│┈┈┈┈│┈┈ rust datum      1.10
    │    │ │    │ │    │ │    │ │    │ │    │
    │LIT │ │LIT │ │LIT │ │LIT │ │LIT │ │LIT │   lower 1/3 = 122
    └────┘ └────┘ └────┘ └────┘ └────┘ └────┘
   ────●──────●──────●──────●──────●──────●───────────────────  0.32 uplights
   ═══════════════════════════════════════════════════════════  0.00 deck (78–96)
   x=−6.50                                              x=+6.50
   NOTHING above y = 0.40 emits light except the 0.18 down-fill.
```

---

## ROOM 6 — THE RACKS

> *Everything the station owns, on shelves, with one aisle down the middle.*

The density counterweight. This room exists so that THE SPINE and THE MAGAZINE are
readable as empty.

### Dimensions

- Footprint **8.40 m (x) × 3.05 m (z)**.
- Ceiling **flat at 2.42 m**.
- Rack banks **1.05 m deep** on both long walls — that is a real ISPR at 0.86 m plus a
  0.19 m standoff, both taken from ISS practice — leaving an aisle clear width of
  **0.95 m**. (1.05 + 0.95 + 1.05 = 3.05.)
- Rack bays are **1.05 m wide × 2.00 m tall**, which is the ISPR envelope exactly, plus
  the 0.05 m curb that puts their top on the station's 2.05 m datum (S2).

A note on the deliberate deviation: Destiny's working corridor between its four rack banks
is about **2.1 m** square. This aisle is 0.95 m — less than half. That is intentional and
defensible: Destiny is a laboratory people work in, and this is a stores aisle people pass
through. But it means a builder should not "correct" the width toward the real number.

**Against a body:** the aisle is narrower than your outstretched arms. You can touch both
walls at once. The rack faces are at eye level for their full height and there are 84 of
them.

### Circulation

**Through-route, two ports, both on the short ends, both centred.** Deliberately the most
conventional circulation in the station — the room's information is in its surfaces, not
its plan, and a clever plan here would fight it.

- `north` (+x): standard `SEAM`, to THE CROSSING's `low` port (the recessed one).
- `south` (−x): standard `SEAM`, to THE GANTRY's `west` port.

- **The instant you enter:** an 8.4 m tunnel of drawer faces receding to a lit doorway.
  One-point perspective again, but where the spine's is empty this one is saturated.
- **Hidden until you look sideways:** four bays are **open**, their drawers withdrawn,
  showing 0.85 m of dark interior with contents in silhouette. They are at x = −3.15,
  −0.55, +1.35, +3.05, alternating walls. They are the only depth in the wall plane and
  they are what stops the room being wallpaper.

### Governing structural logic

**A standard 1.05 m rack bay, repeated 16 times, and nothing in the room is allowed to be
any other size.** Every drawer, every gap, every fixing, every label plate is a division
of 1.05. The four open bays are the same bay with the drawer pulled. The lights are on the
bay pitch. Even the deck plates are 1.05 m.

### Contents, positioned

| item | position | size (m) | notes |
|---|---|---|---|
| **rack bays 8 per wall** | z = ±1.525, x centres at −3.675 + n×1.05 | 1.05 wide × 2.00 tall × 1.05 deep | the ISPR envelope, verbatim |
| drawer faces | each bay, 5 drawers | 1.01 × 0.37, recessed 0.055 | 80 drawer faces at value **150** |
| drawer pulls | one per drawer | 0.32 × 0.03, standing 0.028 proud | catches the aisle light as a bright line |
| bay reveals | between bays | 0.04 dark gap, full height | value **28** — this is the contrast |
| label plates | one per drawer | 0.24 × 0.05, extruded 0.006 | geometry, not texture; reads at 3 m |
| **open bays ×4** | x = −3.15, −0.55 (z = −1.525); x = +1.35, +3.05 (z = +1.525) | drawer withdrawn 0.55, interior 0.85 deep | interiors at value **26**, contents in silhouette |
| withdrawn drawers ×4 | protruding into the aisle | 0.55 out | **narrows the aisle to 0.40 m at four points** — you must turn sideways |
| crown band | above 2.05, both walls | trunking 0.20 proud, value 30 | |
| deck | plates on the 1.05 pitch | value 62 | |

**Density: the highest in the station, and uniform.** 84 rack faces, 80 pulls, 80 label
plates. If it does not feel excessive it is not finished.

### Light rig

- 1 × `HemisphereLight`, sky `HULL`, ground `HULL_SHADOW`, intensity **0.62**.
- **8 × `PointLight`**, `MINT`, intensity **0.30**, range 2.2, on the bay pitch at
  (−3.675 + n×2.10, 2.28, 0) — down the aisle centreline at ceiling height. Flat, even,
  bureaucratic light. This room is the only one with no directional key at all, and that
  is its light signature: **shadowless and evenly lit**, which after THE GANTRY's uplights
  and THE CROWN's single shaft is itself a strong change.
- No directional lights. None.

### Value structure

| surface | reads at |
|---|---|
| lightest: drawer faces | **150** |
| drawer pulls | 168 (small area) |
| deck | 62 |
| crown band | 30 |
| bay reveals | 28 |
| darkest: open bay interiors | **26** |

Spread 26 → 168, and — critically — the **frequency** is high: the 0.04 m reveals every
1.05 m mean the value alternates 28 / 150 / 28 / 150 across the whole wall. The average
frame here has **no single 8-value bucket above 22 %**, against a station average today of
60.5 %.

### Differs from every other room on

1. **Fitting density** — 84 rack faces against a station-wide typical of about 12 objects
   per room.
2. **No directional light at all.** Even, flat, shadowless.
3. **High-frequency value alternation** rather than large fields of one value.
4. **The aisle narrows to 0.40 m at four points** — the only place a body has to turn
   sideways.
5. **Everything is a multiple of 1.05 m.** Rigid modularity, against the CROSSING's
   deliberate irregularity next door.

### The one thing that would ruin it

**Closing the four open bays.** An all-closed wall of drawer faces is a texture, and this
game has no textures for a reason — flat repetition with no depth is exactly the failure
mode being fixed. The four open bays, with their 0.85 m of dark interior and their
drawers sticking into the aisle, are what make it a room. Acceptance criterion: **from the
`south` port, at least two open bays must be visible in the frame.**

### Plan and section

```
PLAN  (1 char ≈ 0.155 m x, ≈ 0.19 m z)
   x=−4.20                                              x=+4.20
   ┌──────────────────────────────────────────────────────────┐ z=+1.525
   │ 1  │ 2  │ 3  │ 4  │ 5 OPEN │ 6  │ 7 OPEN │ 8  │          │  rack bank
   │████│████│████│████│███▒▒▒▒▒│████│███▒▒▒▒▒│████│          │  1.05 deep
   └────┴────┴────┴────┴────▒▒▒▒┴────┴────▒▒▒▒┴────┴──────────┘ z=+0.475
 ▓▓▓                                                        ▓▓▓
 south          ← 0.95 m aisle →   ▒ pinches to 0.40 m       north
 ▓▓▓                                                        ▓▓▓
   ┌────┬────▒▒▒▒┬────┬────▒▒▒▒┬────┬────┬────┬──────────────┐ z=−0.475
   │████│███▒▒▒▒▒│████│███▒▒▒▒▒│████│████│████│████│          │  rack bank
   │ 1  │ 2 OPEN │ 3  │ 4 OPEN │ 5  │ 6  │ 7  │ 8  │          │  1.05 deep
   └────┴────────┴────┴────────┴────┴────┴────┴──────────────┘ z=−1.525
        bay pitch 1.05 m (= ISPR width), 8 bays per wall, 16 total
        1.05 rack + 0.95 aisle + 1.05 rack = 3.05 m overall


SECTION across the aisle (z horizontal, y vertical; 1 char ≈ 0.085 m)
   ═══════════════════════════════════════════════════  2.42 ceiling
        ▓ trunking (30)          ●  aisle lamp 2.28    ▓
   ══════════════════════════════════════════════════   2.05 datum
   │ ▒▒▒▒▒▒▒▒▒ │           │ ▒▒▒▒▒▒▒▒▒ │               drawer 5 (150)
   │ ▒▒▒▒▒▒▒▒▒ │           │ ▒▒▒▒▒▒▒▒▒ │               drawer 4
   ─│─▒▒▒▒▒▒▒▒▒─│─ ─ ─ ─ ─ ─│─▒▒▒▒▒▒▒▒▒─│─ ─ ─ ─ ─ ─   1.74 eye  drawer 3
   │ ▒▒▒▒▒▒▒▒▒ │           │ ▒▒▒▒▒▒▒▒▒ │               drawer 2
   ┈│┈▒▒▒▒▒▒▒▒▒┈│┈┈┈┈┈┈┈┈┈┈┈│┈▒▒▒▒▒▒▒▒▒┈│┈┈┈┈┈┈┈┈┈┈┈   1.10 rust datum
   │ ▒▒▒▒▒▒▒▒▒ │           │ ▒▒▒▒▒▒▒▒▒ │               drawer 1
   └───────────┘           └───────────┘
   ═════════════════════════════════════════════════   0.00 deck (62)
   |← 1.05 rack →|←── 0.95 aisle ──→|← 1.05 rack →|
        │ = 0.04 m reveal at value 28, every 1.05 m
        rack top at 2.00 m + 0.05 curb = the 2.05 datum
```

---

## ROOM 7 — THE MAGAZINE

> *A cold cube with almost nothing in it, lit through a grating in the ceiling.*

The sparse counterweight, and the only silent room. Build it after THE RACKS so the
contrast is live.

### Dimensions

- Footprint **5.00 m × 5.00 m**, exactly square. The only square room.
- Ceiling **flat at 5.60 m**. Tall enough that the crown band is 3.55 m of dark.
- One port, on the −x face, centred: standard `SEAM`.

**Against a body:** a 5 m cube around one person. Nothing is within 1.8 m of you at any
point unless you go to it. This is the only room in the station where you are not near
anything.

### Circulation

**Dead end.** One way in, one way out, the same way. That is a deliberate choice and the
only other dead end besides THE CRAWL — and the two are opposites in every measurable
respect, which is the point of having exactly two.

- **The instant you enter:** a tall empty cube with a bar of cold light falling from a
  ceiling grating onto the far wall, and nine crates in a loose heap that read as tiny.
- **Hidden until you turn:** nothing. This is the only room with no secret. Standing in
  it and turning round shows you four near-identical walls, and after THE CROSSING taught
  you to read asymmetry, that sameness is unsettling rather than boring. It works only
  because THE CROSSING came first.

### Governing structural logic

**It was a propellant magazine, it has been emptied, and the only things left are the
restraint frame it used to hold and the grating that vented it.** So: a 4.00 m tall bare
steel rack frame standing empty in the middle, no fittings on the walls at all above the
kick band, a floor with the tie-down pattern still in it, and one ceiling grating.

### Contents, positioned

Origin at room centre.

| item | position (x, y, z) | size (m) | notes |
|---|---|---|---|
| **restraint frame** | centred, (0, 0 → 4.00, 0) | 2.40 × 4.00 × 1.60 open frame, members 0.09 | Empty. Its shadow-side members read at 24, its lit members at 92. It is the only vertical thing in the room. |
| ceiling grating | (+1.20, 5.60, 0) | 3.20 × 0.80, 24 bars 0.04 × 0.10 | the only opening |
| light bar on the −x wall | (−2.50, 1.20 → 3.80, −0.60 → +0.60) | 1.20 × 2.60 authored quad | value **118**, the shape the grating casts. Drifts down the wall and onto the deck over the orbit. |
| tie-down grid | deck, 0.50 m pitch | Ø 0.09 recessed sockets, 100 of them | recessed 0.03; reads at 32 against a deck of 40 |
| crates ×9 | loose heap, x −1.9 → −0.9, z +1.3 → +2.3 | 0.42 – 0.68 cubes | the only human-scale reference; deliberately in one corner |
| kick band | all four walls, 0 → 0.95 | plain plate, one 0.06 rail | nothing else |
| **work band** | 0.95 → 2.05 | **empty** | the only room where the work band carries nothing. It is a plain wall at value 44. |
| crown band | 2.05 → 5.60 | plain, value 26 | 3.55 m of nothing |

**Density: almost nothing. Nine crates and one frame in 25 m² and 140 m³.**

### Light rig

- 1 × `HemisphereLight`, sky `NIGHT_SIDE`, ground `NIGHT_SIDE`, intensity **0.20**. Almost
  no ambient at all.
- 1 × `DirectionalLight`, `EARTHSHINE_GROUND #C4B189`, intensity **0.85**, at
  (+3.0, 11.0, 0) targeting (−2.4, 2.4, 0) — **earthshine through the grating**, warm,
  from above and to one side, striking the far wall rather than the floor.
- **No artificial light of any kind.** This is the only unlit compartment in the station,
  and `machineryHz = 0`: no room tone. It is silent and it is lit only by the planet.

### Value structure

| surface | reads at |
|---|---|
| lightest: the light bar on the −x wall | **118** |
| restraint frame, lit members | 92 |
| walls, work band | 44 |
| deck | 40 |
| tie-down sockets | 32 |
| crown band | 26 |
| darkest: restraint frame, shadow-side members | **24** |

**Ceiling darkest, wall lighter, floor between** — and the only large light area is a
single moving bar. Compare THE GANTRY, whose ordering is exactly inverted.

### Differs from every other room on

1. **Silent.** `machineryHz = 0`. The only one.
2. **No artificial light.** Lit entirely by earthshine.
3. **Square plan**, 1 : 1, against a station of long rooms.
4. **The work band is empty** — deliberately breaking S2's fitting rule in exactly one
   room, which is what makes the rule visible everywhere else.
5. **Lowest object count in the station** (10 objects in 140 m³) against THE RACKS' 244.

### The one thing that would ruin it

**Filling it.** Somebody will look at 25 m² of empty floor and add stowage. The room's
entire function is to be the thing THE RACKS is measured against. Acceptance criterion:
**object count ≤ 12, and no object may be within 1.5 m of any wall except the crates.**

### Plan and section

```
PLAN  (1 char ≈ 0.15 m)
   ┌───────────────────────────────────┐  z = +2.50
   │                                   │
   │        ○○○                        │   ○ crates (9)
   │        ○○○                        │
   │        ○○○                        │
   │              ┌───────────┐        │
 ▓▓┤              │ RESTRAINT │        │  z = 0.00   ▓▓ port (−x, centred)
   │              │  FRAME    │        │
   │              │ 2.40×1.60 │        │
   │              │  h 4.00   │        │
   │              └───────────┘        │
   │                                   │
   │      ▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨▨             │   ▨ grating over (3.20 × 0.80)
   │                                   │      at (+1.20, 5.60, 0)
   └───────────────────────────────────┘  z = −2.50
   x=−2.50                          x=+2.50
   deck: 100 tie-down sockets on a 0.50 m grid, recessed 0.03


SECTION on z = 0, looking +z  (1 char ≈ 0.15 m x, ≈ 0.20 m y)
   ─────────────────────────▨▨▨▨▨▨▨▨▨▨▨▨────────────  5.60 ceiling
                          ╱  grating         ╲
                        ╱   EARTHSHINE        ╲
   ┌──┐               ╱      0.85              ╲
   │▒▒│             ╱                           ╲
   │▒▒│           ╱      ┌───────────┐
   │▒▒│ light   ╱        │           │              crown band 26
   │▒▒│ bar   ╱          │ RESTRAINT │              (3.55 m of it)
   │▒▒│118  ╱            │  FRAME    │
   │▒▒│   ╱              │  h 4.00   │
   ═══════════════════════════════════════════════   2.05 datum
   │▒▒│                  │           │              work band EMPTY (44)
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ┼─ ─ ─ ─ ─ ─   1.74 eye
   ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┼┈┈┈┈┈┈┈┈┈┈┈┼┈┈┈┈┈┈┈┈┈┈┈   1.10 rust datum
   ┌──┐                  │           │              kick band
   └──┴──────────────────┴───────────┴──────────────  0.00 deck (40)
   x=−2.50                                    x=+2.50
   the light bar drifts down this wall and onto the deck over the orbit
```

---

## ROOM 8 — THE SILL

> *A small room whose middle is a grating over a 4.5 m drop.*

The mirror of THE CROWN: THE CROWN gives the player unreachable space above; this gives
them unreachable space below, in a room a quarter the size, which is why it lands as a
different idea rather than a repeat.

### Dimensions

- Footprint **6.00 m (x) × 4.00 m (z)**, ceiling **flat at 3.00 m**.
- The central **3.00 × 2.00 m** of the deck is an open grating: bars 0.03 × 0.09 on a
  0.11 m pitch, running along x. 28 bars.
- Below it, a sub-volume **3.40 × 2.40 m in plan × 4.50 m deep**, its floor at −4.50 m.
  Not walkable. Geometry only.
- The walkable `FloorRect` **covers the grating** — you walk across it at floorY 0.

**Against a body:** the room is small and ordinary until you are standing on 4.5 m of
nothing, at which point the 3.00 m ceiling above you and 4.50 m of void below make you
the middle of a 7.5 m section. The room is 6 m long and reads taller than it is wide.

### Circulation

**Through-route, two ports on opposite short ends, both offset to the same side** so the
walking line runs along the +z edge of the grating rather than across its middle — you
have to step deliberately onto the void to look down.

- `west` (−x, z = +1.20): standard `SEAM`, from THE GANTRY's `east` port.
- `east` (+x, z = +1.20): standard `SEAM`, to wherever the station grows next. **Leave
  this port live and connected to a blank for now**; it is the station's stub for
  expansion and it should be visible as one.

- **The instant you enter:** a normal small room with a dark rectangle in the floor.
- **Hidden until you walk onto it:** the depth. From the door the grating reads as a dark
  panel. Two steps in it becomes a hole with a light at the bottom of it.

### Governing structural logic

**A pump room over its own sump, with the pump gone and only its foundations left.** The
grating is the working platform, the void is the sump, the single light down there is the
sump's own inspection lamp, and the four heavy brackets in the room's corners are what the
pump used to sit on.

### Contents, positioned

| item | position (x, y, z) | size (m) | notes |
|---|---|---|---|
| **grating** | x −1.50 → +1.50, z −1.00 → +1.00, y = 0 | 28 bars, 0.03 × 0.09, 0.11 pitch | value **56** for the bars, void between them |
| grating kerb | around the opening | 0.10 × 0.14 proud | value 100 — a bright frame around a dark hole |
| sub-volume walls | −4.50 → 0 | 3.40 × 2.40 | value **28**, converging in perspective |
| **sump lamp** | (0, −4.30, −0.90) | Ø 0.22 fitting | see light rig |
| sump floor | y = −4.50 | 3.40 × 2.40 | value 74 where the lamp reaches, 30 elsewhere |
| pump brackets ×4 | room corners, (±2.30, 0 → 0.85, ±1.55) | 0.55 × 0.85 × 0.55 | heavy, bolted, obviously load-bearing for something absent |
| pipe stubs ×3 | −z wall, y 1.15, capped | Ø 0.24, 0.40 proud | the pipes that used to go down; capped and blanked |
| work band | +z wall only | control panel bank, 2.40 × 1.10, recessed 0.09 | value 132 |
| crown band | all walls | plain, value 30 | |

**Density: low, and concentrated at the perimeter.** The middle of the room is a hole.

### Light rig

- 1 × `HemisphereLight`, sky `HULL_SHADOW`, ground `NIGHT_SIDE`, intensity **0.48**.
- 2 × `PointLight`, `MINT`, intensity **0.34**, range 3.4, at (±1.90, 2.80, +1.40) — over
  the walking line, *not* over the grating. The grating is deliberately unlit from above.
- 1 × `PointLight`, `SETTLEMENT` (warm), intensity **0.70**, range 3.0, at
  **(0, −4.30, −0.90)** — in the sump, warm, 4.3 m below the deck. **This is the only
  light source below the player's feet anywhere in the station.** It throws value up
  through the grating bars so that standing on the grating you are lit from below on the
  ankles and from above on the shoulders.
- 1 × `DirectionalLight`, `HULL`, intensity **0.24**, from (−4, 3, +3) toward (1, 0, −1) —
  a weak cross-key so the pump brackets have a light side.

### Value structure

| surface | reads at |
|---|---|
| lightest: control panel bank on the +z wall | **132** |
| grating kerb | 100 |
| sump floor under the lamp | 74 |
| walls, work band | 62 |
| grating bars | 56 |
| deck, either side of the grating | 52 |
| crown band | 30 |
| darkest: sub-volume walls | **28** |

Spread 28 → 132, arranged in **plan** rather than in section: the dark is a rectangle in
the middle of the floor and the light is around the edges, which is the reverse of every
other room.

### Differs from every other room on

1. **A light source below the player's feet.** Unique.
2. **Visible unreachable volume downward** — the only one.
3. **The darkest thing in the room is in the floor**, not the ceiling.
4. **Walkable surface you can see through**, which changes what your own footsteps mean.
5. **It carries the station's live expansion stub**, and is the only room that shows a
   port going somewhere that does not exist yet.

### The one thing that would ruin it

**Making the grating opaque, or lighting it from above.** Either one turns a 4.5 m drop
into a dark panel in the floor, and the entire room becomes a small ordinary room.
Acceptance criterion: **standing at (0, 1.74, 0) and looking straight down, the frame must
contain the sump floor at value ≥ 70 and the sub-volume walls at ≤ 32 — i.e. you must be
able to see the bottom.**

### Plan and section

```
PLAN  (1 char ≈ 0.135 m x, ≈ 0.16 m z)
   x=−3.00                                     x=+3.00
   ┌───────────────────────────────────────────────┐ z=+2.00
   │  ▪              CONTROL PANEL BANK        ▪   │   ▪ pump bracket
   │                                               │
 ▓▓┤ ← ← ← walking line, z = +1.20 → → → → → → →  ├▓▓ z=+1.20
   │  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓         │   ┏━┓ kerb (100)
   │  ┃│││││││││││││││││││││││││││││││││┃         │   │ grating bars
   │  ┃│││││││││││││││││││││││││││││││││┃         │   z=0.00
   │  ┃│││││ 3.00 × 2.00 grating │││││││┃         │
   │  ┃│││││ over a 4.50 m void  │││││││┃         │
   │  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛         │   z=−1.00
   │  ▪        ▬▬▬ capped pipe stubs ▬▬▬       ▪   │
   └───────────────────────────────────────────────┘ z=−2.00
        |←──────── 3.00 m grating ────────→|
   |←──────────────── 6.00 m ────────────────────→|


SECTION on z = 0, looking +z  (1 char ≈ 0.13 m x, ≈ 0.16 m y)
   ═══════════════════════════════════════════════   3.00 ceiling
        ●                                 ●          2.80 mint lamps
        (over the walking line, NOT over the hole)    crown band 30
   ═══════════════════════════════════════════════   2.05 datum
                 CONTROL PANEL 132 (+z wall)
   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    1.74 eye
   ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈    1.10 rust datum
   ▪▪▪                                       ▪▪▪     pump brackets
   ═════┏━━━┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃┃━━━┓══════════════   0.00 deck / grating
        ┃   │                   │   ┃
        │   │  sub-volume       │   │                walls at 28
        │   │  3.40 × 2.40      │   │
        │   │                   │   │
        │   │        ☀ sump lamp│   │              −4.30 warm point light
        └───┴───────────────────┴───┘              −4.50 sump floor (74/30)
             |←──── 3.40 m ────→|
```

---

## Cross-check: does every adjacent pair differ on three axes?

| pair | axes that differ |
|---|---|
| CRAWL → LIMB DECK | ceiling height (1.95 → 3.25), aspect (6.6:1 → 1.8:1), exterior view (none → cupola), density (very high → medium) — **4** |
| LIMB DECK → SPINE | width (3.51 → 1.62), density (medium → very low), light direction (orbital → overhead cove), view (yes → no) — **4** |
| SPINE → CROSSING | ceiling (2.24 flat → 2.60–4.40 sloped), aspect (6.2:1 → 1.3:1), light direction (overhead → raking from a corner), level (flat → step) — **4** |
| CROSSING → CROWN | ceiling (4.40 → 9.60), light direction (raking → from directly above), value spread (118 → 190), view (none → crown port), unreachable space (no → yes) — **5** |
| CROSSING → BEND | curvature (straight → 90° arc), view (none → window band), aspect (1.3:1 → 4.6:1), light motion (static → travelling) — **4** |
| CROSSING → RACKS | density (medium → very high), value frequency (large fields → 1.05 m alternation), light (directional key → none) — **3** |
| BEND → GANTRY | light direction (from one side → from below), floor area (16.7 → 109 m²), ceiling (2.55 → 2.15), value order (glazing-first → floor-first) — **4** |
| GANTRY → RACKS | ceiling (2.15 → 2.42), density (in the volume → on the walls), light height (0.32 m → 2.28 m), aisle (0.95 open → 0.40 pinch) — **4** |
| GANTRY → SILL | floor area (109 → 24 m²), floor opacity (solid → grating over a void), light below the feet (no → yes) — **3** |
| CROWN → MAGAZINE | ceiling (9.60 → 5.60), density (galleries overhead → nothing), artificial light (yes → none), sound (58 Hz → silent) — **4** |

No pair drops below three. No two rooms share a value ordering. No two rooms share a
dominant light direction except SPINE and RACKS, which are three rooms apart and differ on
density by a factor of seven.

---

# PART 3 — What to do with the existing rooms

## THE LIMB DECK — keep, revise. About a day's work.

1. **Apply S2.** The wall from 1.6 m to the 3.25 m crown is currently empty and measures
   84–89 across 40 % × 30 % of the frame. Put the crown band in: a continuous duct run at
   2.05–2.45 m all the way round, standing 0.20 m proud, at value 30, with six lamp
   housings hung off it.
2. **Invert the cupola relationship.** The window frame currently reads at 43–44 against
   a sky of 25 — the frame is *lighter* than the view. Take the frame, its mullions and
   its reveal to **value ≤ 22**, and deepen the reveal from its current value to
   **0.30 m**. That one change is the difference between `R01` (NASA Cupola: frame in
   silhouette, Earth at 200) and what is on screen now.
3. **Kill the flat-wall problem.** The starboard wall is a single field measuring 84–89.
   Break it with the three bands and add a **0.9 m deep, 1.6 m wide alcove** on it per S5,
   so there is depth opposite the cupola.
4. **Move the spawn out.** The spawn belongs in THE CRAWL. The limb deck's spawn becomes
   its collar mouth.
5. **Leave the orbital lighting exactly alone.** It is the best thing in the build.

## THE SPINE — keep, revise. Half a day.

1. **Get the lamp off the axis.** The 0.124 × 10.2 m ceiling strip is the brightest object
   in the game (133 against 43) and it sits on the vanishing point. Replace it with **two
   continuous coves** in the wall/ceiling junction at z = ±0.72, y = 2.10, each 0.09 m
   tall, aimed at the ceiling. The ceiling then becomes the lit surface at value 96 and
   there is **no visible lamp at all** — which is what the "a lamp is a lit surface"
   rule was reaching for.
2. **Give it three values.** Currently ceiling 44, walls 43, floor 45. Target: **ceiling
   96, walls 62, floor 38.** Achieved by the coves above plus dropping the deck material
   and adding a second grazing directional along the run at 0.35 intensity from the fore
   end.
3. **Apply S2.** Eight frames every 1.4 m is a good rhythm; hang the crown band off them.
4. **Keep the eight frames and the one-point perspective untouched.** They are correct.

## THE NODE — delete.

Replace with THE CROSSING. The node's problem is that it is a regular octagon with four
identical exits and mirrored contents; there is no decoration that fixes a room whose
defect is its symmetry group. Its geometry code is worth keeping as a reference for the
octagonal liner technique and nothing else.

Do not try to save it by adding a distinguishing object to each arm. Four objects in four
identical alcoves is still four identical alcoves, and a player two rooms away has no way
to know which object goes with which direction.

---

# PART 4 — Build order

Strictly in this order. Each step is shippable and each one is worth doing even if the
next never happens.

| # | what | why here |
|---|---|---|
| **1** | **S1 — the seam walk-through fix, plus the walked acceptance test** | The station is currently impassable at the edges of both its doorways. Nothing built after this is worth walking to until you can reach it. |
| **2** | **S2 + S3 applied to the three existing rooms** | Cheapest possible improvement to what exists. It also proves the three-band rule against real geometry before eight rooms are authored to it. Expect the average one-bucket frame fraction to drop from 60.5 % to under 35 % with no new rooms at all. |
| **3** | **S4, S5, S7, S8, S9, S11, S12** | The collar buffer, the depth rule, the body, the tones, the perch, one disorder per room, one warm point per long sightline. All small, all station-wide, all assumed by every room below. S10 (the two registers) is a labelling decision that costs nothing and should be made here too. |
| **4** | **THE CROSSING** | Everything else attaches to it. Building any new room before the junction means attaching it to a hub that will be demolished. |
| **5** | **S6 + THE CROWN** | The reveal. This is the step where the project stops being three rooms and starts being a station. If only one new room is ever built, build this one. |
| **6** | **THE CRAWL, and move the spawn** | Cheap (7 m of tunnel) and it retro-actively improves the limb deck and the crown by giving them something to be bigger than. Highest ratio of effect to work in the document. |
| **7** | **THE BEND** | The second exterior view, the first 90° turn, and the first time the station's map is two-dimensional. |
| **8** | **THE RACKS** | Density. Also the first room that will stress the facet budget; better to learn that on a room with a rigid module than on a curved one. |
| **9** | **THE GANTRY** | Light from below, and the first loop closes. |
| **10** | **THE MAGAZINE and THE SILL** | The sparse pair. Last because they are only legible once there is something dense and something tall to measure them against. |

After step 10 the station is **10 compartments plus 11 collars**. Summing the room lengths
(76.7 m) and the collars (28.6 m) gives **about 105 m of distinct route**; walking the two
dead ends out and back and completing the loop puts a full traverse at **roughly 125 m**.
Walkable floor comes to **about 270 m²** — the GANTRY alone is 88 m² net of its tanks,
which is twice the entire station today.

Against the current 22.8 m and 43 m²: **five and a half times the traverse and six times
the floor**, and — because the loop means the way back is not the way out — no room is
seen twice on a full circuit except THE CROSSING and THE GANTRY, which are the two hubs
and are supposed to be.

No room repeats another's proportion, value ordering or dominant light direction.

## Verification, per room, before it is called done

Not optional, and not the existing pinned-pose harness alone:

1. **Walked seam test** (S1) at every port of the new room. Held key, not `setPose`.
2. **Flatness test.** Sample 12 poses in the room — 3 standing positions × 4 headings — and
   assert **no frame has a single 8-value luminance bucket covering more than 40 % of the
   pixels**. The current station averages 60.5 % and the spine 83.6 %.
3. **Spread test.** Assert **max − min luminance ≥ 90** in every one of those 12 frames.
   The current worst is 4.
4. **Palette test.** Assert no pixel exceeds MINT's luminance of 213 by more than a
   500-pixel margin, and none reaches 250 in two channels. Currently violated
   (OUTSIDE-EYE D8).
5. **Neighbour test.** Take one frame from the new room and one from each neighbour at
   equivalent poses and assert that the three-value signature (ceiling, wall, floor) of the
   new room differs from each neighbour's by **≥ 25 on at least two of the three**.
6. **Foreground test** (HK-3 rule 2). For each of the 12 poses, assert that no object
   within 1.5 m of the camera contains the frame's brightest pixel. A builder's instinct
   is to light the nearest thing; this catches it.
7. **Furniture test.** Assert the room contains exactly one perch (S9), exactly one
   disorder (S11), one rust datum at 1.10 m on every pressure-boundary wall and none on
   internal partitions (S3), and — for any sightline over 5 m — exactly one warm element
   at its far end occupying ≤ 1.5 % of the frame (S12). These are countable; make them a
   unit test over the compartment's `solids` list rather than a visual check.
8. **The walk.** Somebody holds `W` from one end of the station to the other and back, and
   watches. This is the test that found everything in OUTSIDE-EYE that the harness did
   not, and no amount of the seven tests above replaces it.

---

# PART 5 — Reference table

All images are in `.gt-refs/` (gitignored, nothing copyrighted lands in the repo). Source
metadata in `.gt-refs/SOURCES.json`. Every one is a NASA work in the public domain, and I
opened and read every one of them before writing the sentence next to it.

| file | source | what to take from it — specifically |
|---|---|---|
| `R01-cupola-earth.jpg` | [Commons: Tracy Caldwell Dyson in Cupola ISS](https://commons.wikimedia.org/wiki/File:Tracy_Caldwell_Dyson_in_Cupola_ISS.jpg) | **The value inversion.** Every window frame and mullion is a near-silhouette at roughly value 20; Earth is 190–210. The aperture reads because the frame is the darkest thing in the picture. GROUND TRACK currently has a 43 frame around a 25 sky — exactly backwards. This one relationship is LIMB DECK revision item 2, THE BEND's glazing frames, and THE CROWN's aperture cross. |
| `R02-cupola-shutters.jpg` | [Commons: Cupola ISS open shutters](https://commons.wikimedia.org/wiki/File:Cupola_ISS_open_shutters.jpg) | **Reveal depth.** The glass sits far enough back from the inner face that each pane has a visible box of reveal around it, and the reveal's side faces are darker than both the frame and the view. Use 0.28–0.35 m of reveal on every aperture in the station: it is what makes an opening read as cut through pressure hull rather than painted on a wall. |
| `R03-destiny-lab-racks.jpg` | [Commons: ISS-56 Alexander Gerst works in the Destiny module (3)](https://commons.wikimedia.org/wiki/File:ISS-56_Alexander_Gerst_works_in_the_Destiny_module_(3).jpg) | **Density target for THE RACKS, and the depth rule made literal.** Look at the far end: you see through one hatch into another module and through *that* into a third. Three depth planes in one frame, which is what S5 mandates. Value structure: pale rack faces around 200, mid clutter, dark equipment boxes at 40 — one frame spanning roughly 20 to 230. |
| `R04-kibo-airlock.jpg` | [Commons: ISS-53 Open airlock inside the Kibo module](https://commons.wikimedia.org/wiki/File:ISS-53_Open_airlock_inside_the_Kibo_module.jpg) | **One large opening in a wall of small ones.** The airlock hatch is a different size and shape from every other fitting on that wall — which is what THE CROSSING's four differing ports are for. Take the ratio of collar depth to opening width. |
| `R05-unity-node-hatch.jpg` | [Commons: ISS-20 Roman Romanenko floats through a hatch into the Unity node](https://commons.wikimedia.org/wiki/File:ISS-20_Roman_Romanenko_floats_through_a_hatch_into_the_Unity_node.jpg) | **The collar as a value break, plus depth through an opening — S4 and S5 in one photograph.** The hatch frame is a distinctly different hue *and* value from the wall it sits in (olive against salmon); the flange ring is a hard rhythm all the way round the opening; and you can see through the hatch into a further module and through that to a small round window at the far end. Also the sanity check on `SEAM.width`: this CBM hatch is 1.27 m clear against GROUND TRACK's 1.18 m. |
| `R06-skylab-forward-compartment.jpg` | [Commons: Skylab Orbital Workshop Forward Compartment](https://commons.wikimedia.org/wiki/File:Skylab_Orbital_Workshop_Forward_Compartment_0101633.jpg) | **S2, the three-band wall, verbatim.** A near-black band of crown panels at the top; a warm middle band with a hard rhythm of five tan cylinders; a pale grid of square locker faces below with dark recessed edges. Three bands, three values, three fitting types, stacked. Note also the strip lamps mounted on the *underside* of the crown band, aimed down — that is the fitting S2's crown band takes. |
| `R07-skylab-experiment-area.jpg` | [Commons: Skylab Orbital Workshop Experiment Area](https://commons.wikimedia.org/wiki/File:Skylab_Orbital_Workshop_Experiment_Area_7031028.jpg) | **The open grid floor over a visible void.** Skylab's perforated deck with the volume below showing through it — direct reference for THE SILL's grating, including the fact that at a distance the bars read as a single mid value and the gaps read as near-black. Skylab's grid also doubled as a foot restraint (cleated shoes locked into it), which is the sort of second function a builder should give the grating's bar pitch. |
| `R08-zvezda-interior.jpg` | [Commons: ISS-10 Interior view of the Zvezda Service module](https://commons.wikimedia.org/wiki/File:ISS-10_Interior_view_of_the_Zvezda_Service_module.jpg) | **Long-axis one-point perspective in a real module.** Fittings crowd both walls; the centre is clear; nothing bright sits on the vanishing axis. Compare directly with `shots/current/spine-run.png`, where the brightest object in the game is parked on the vanishing point. This photograph is the fix for THE SPINE. |
| `R09-destiny-installed.jpg` | [Commons: Destiny as just installed](https://commons.wikimedia.org/wiki/File:Destiny_as_just_installed.jpg) | **The bare liner before fit-out.** The square rack-bay cross-section, the standoff geometry at the four corners, the ring frames. This is the structural logic that S2's three bands hang on, and it is what THE RACKS should be modelled as before a single drawer face is added. |
| `R11-skylab-dome-bean.jpg` | [Commons: Astronaut Alan Bean doing acrobatics in OWS dome area](https://commons.wikimedia.org/wiki/File:Astronaut_Alan_Bean_doing_acrobatics_in_OWS_dome_area.jpg) | **The inversion for THE CROWN, and the single most useful image here.** A 6.7 m pale dished volume at roughly value 200, made legible entirely by a small number of *dark linear members* crossing it — ring joints, blue handrails, a white duct, small cylindrical lamp fittings. Big volumes do not have to be dark. This is the argument for THE CROWN's upper walls at 118 with the galleries as dark bands at 34, and it is the opposite of what GROUND TRACK does everywhere today. Also: a human body in a volume, for scale calibration. |
| `R12-harmony-node-ports.jpg` | [Commons: Interior of Harmony Node](https://commons.wikimedia.org/wiki/File:Interior_of_Harmony_Node.jpg) | **A hub with openings in several directions, before fit-out.** Take the proportion of port opening to wall panel, and the way each port's collar is a distinct ring of structure rather than a hole. Note what is *not* here: the four radial ports are geometrically identical, and the module is only legible because the fit-out that came later broke the symmetry. THE CROSSING's whole design is the lesson of that. |
| `R13-destiny-lab-assembly.jpg` | [Commons: ISS Destiny Lab](https://commons.wikimedia.org/wiki/File:ISS_Destiny_Lab.jpg) | **The rack wall as pure geometry**, before it disappeared under cable and stowage: the bay pitch, the reveals between bays, the way the standoff corners run the length of the module. Author THE RACKS to this and *then* dress it. |
| `R14-destiny-lights-off.jpg` | [NASA: iss068e022293](https://images.nasa.gov/details/iss068e022293) | **S12, one warm point at the end of a long sightline, photographed.** The module is lit only by equipment indicators — a cold green frame, 8 m deep, dense with clutter — and at the vanishing point there is one warm amber hatch with a person in it. That single small warm element is what makes the picture read as deep rather than as noise. It is also proof that near-monochrome plus one accent is enough, which is the whole thesis of a game with a narrow palette. |

## Real dimensions, used as the scale sanity check

Every one of these was checked against the spec above. The station's existing dimensions
are all inside the believable band — the problem was never the scale of a room.

| thing | real | GROUND TRACK | verdict |
|---|---|---|---|
| ISPR (the unit every ISS lab wall is made of) | 2.00 × 1.05 × 0.86 m | now: nothing | **adopted** as the module for S2's work band and THE RACKS |
| Destiny / Columbus internal diameter | 4.3 m / 4.5 m | limb deck 3.51 m wide, 3.25 m crown | slightly small; fine |
| Destiny working corridor between rack banks | ~2.1 m | THE RACKS aisle 0.95 m | deliberately tighter — a stores aisle, not a lab |
| Kibō pressurised module | 11.2 m long × 4.4 m | spine 11.2 m long × 1.62 m | same length, a quarter the width — the spine is a tunnel, not a module |
| CBM hatch clear opening | **1.27 m square** | `SEAM` 1.18 × 2.06 m | good; the 2.06 m height is a game concession for a walking body |
| Soyuz/Progress docking hatch | 0.80 m circular | — | the reference for anything meant to feel *tight* |
| USN watertight door, clear opening | **1.715 m high × 0.699 m wide** | — | this is what a genuinely restrictive opening measures. THE CRAWL's 1.02 m width and 1.95 m headroom is *more* generous than a submarine door. |
| ISS Cupola, structure / largest window | 2.95 m dia × 1.5 m / **0.80 m pane** | limb deck cupola; THE CROWN aperture 2.20 × 1.40 overall | which is why THE CROWN's aperture is divided into six 0.68 × 0.62 m panes |
| Skylab Orbital Workshop | 14.7 m long × 6.7 m dia; dome ~6.7 m across × 5.8 m tall; two decks on a grid floor | THE CROWN 6.60 × 5.00 × 9.60 m | THE CROWN is narrower and taller — a shaft, not a dome — which is why it is a different idea rather than a copy |
| Orion crew module | 19.56 m³ pressurised, **only 9.34 m³ habitable** | — | **the most useful ratio in the table.** Less than half of a real pressure volume is usable; the rest disappears into structure and systems. Every new room must visibly lose volume the same way — that is what THE CROSSING's diagonal trunk and THE SILL's sub-volume are doing. |

### Open items I could not settle

State these rather than let a builder guess:

- **ISS handrail standard length and spacing.** I could not get a primary NASA figure
  (SSP 50005 / NASA-STD-3001 Vol 2). The current build's handrails look plausible; if the
  exact number matters, pull the standard directly rather than trusting anything here.
- **Cupola side-window aperture size.** Only the 0.80 m top pane is confirmed.
- **Submarine overhead height.** Commonly cited around 1.9–2.0 m, uncited.
- **Research-vessel bench height and corridor width.** Genuinely not found; the UNOLS
  Global Class spec almost certainly has it and could not be parsed.

None of these blocks anything in this document.

## Games referenced, and the specific thing taken

Not images — mechanisms, with the source that documents them.

| source | the mechanism taken | where it lands |
|---|---|---|
| Hollow Knight — area design | Change three of five identity axes simultaneously at every boundary | HK-1 / the differentiation table |
| Hollow Knight — [King's Pass analysis](https://nathanalysis.co.uk/2022/09/20/an-ode-to-hollow-knight/) | The transition is a short, dark, low-information corridor | HK-2 / S4 |
| Hollow Knight — [layer/value breakdown](https://medium.com/3d-environmental-art/the-art-of-hollow-knight-f4c05dda3882) | Value is **function-coded**: playable geometry gets the highest contrast; background gets one saturated accent; foreground is darker and under-detailed | HK-3 / S5 / S12 |
| Hollow Knight — benches and toll gates | One object identical in every area is the wayfinding system | HK-5 / S9 / S4 |
| Hollow Knight — [White Palace](https://hollowknight.wiki/w/White_Palace) | A single-hue area still reads perfectly if the only thing breaking the palette is functional geometry | the zero-accent rule at the top of this document |
| Hollow Knight — [Ari Gibson interview](https://sourcegaming.info/2025/04/09/straight-from-the-source-team-cherry/) | *"quite a tile based [system]… it works well for legibility, being able to judge distances"* — a strict grid is a readability tool, not a production shortcut | the 1.05 m station module (S2) |
| Prey (2017) — [Neo-Deco vs brutalist Talos I](https://www.cookandbecker.com/en/article/122/the-neo-deco-future-of-prey.html) | Two architectural registers marking what a space was built for versus what it is | S10 |
| Prey (2017) — [mega-dungeon design](https://www.gamedeveloper.com/design/designing-i-prey-i-s-sci-fi-space-station-to-be-like-a-mega-dungeon-) | Three routes between any two decks; interconnection over sequence | the loop that closes at THE GANTRY |
| Alien: Isolation — [GDC 2015, Alistair Hope](https://gdcvault.com/play/1021852/Building-Fear-in-Alien) | A hard production constraint (nothing referenced post-1979) is what produces a coherent world; and the Semiotic Standard — diegetic icon signage instead of UI | the extruded bulkhead glyphs; and this document's own numeric constraints |
| NaissanceE — [brutalism in games](https://www.gamedeveloper.com/art/brutalist-architecture-in-games) | Scale contrast as the organising mechanic, not an occasional beat; architecture that makes you feel "swallowed" | THE CRAWL → THE CROWN sequencing |
| The Witness — [Fletcher Studio on the landscape design](https://www.fletcher.studio/blog/2017/5/26/the-witness-designing-video-game-environments) | Compose the view at every threshold; place landmark objects to steer without instructing | S5, and the "what you see the instant you enter" clause on every room |
| Tacoma — [Radiator Blog critique](https://www.blog.radiator.debacle.us/2017/09/on-tacoma-by-fullbright-company.html) | A station can be well-massed and still read as faceless; the memorable rooms were the ones with a specific incident in the props | S11 |
| Return of the Obra Dinn | Orientation without colour: a small fixed volume revisited, distinguished only by function and value | why THE MAGAZINE's sameness works and THE NODE's does not — one is a dead end you visit once, the other is a hub you pass through eight times |

---

# One paragraph, if only one thing gets read

Fix the doorways so a walking player can get through them (S1). Put the three-band wall on
every wall in the station (S2). Then build THE CROSSING and THE CROWN, in that order,
because a junction you can navigate and one room that is nine metres tall will do more for
this project than any amount of further work on the three rooms that already exist.
