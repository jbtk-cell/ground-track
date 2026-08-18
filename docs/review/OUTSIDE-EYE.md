# OUTSIDE EYE — a walked review of STATION KEPLER

Outside consultant. I did not read `DIRECTION.md`, `STRUCTURE.md`, `ENVIRONMENTS.md`,
`AGENTS.md`, `CLAUDE.md`, or anything under `docs/review/`. I read source code, because
code is a fact about what exists, and I judged everything else off the screen.

Everything below was produced by holding `W` down and by reading pixels out of the
framebuffer with `gl.readPixels`, at 1285×723 CSS px (16:9, 2× DPR → 2570×1436 sampled).
Every number is reproducible from the pose given.

---

## The verdict, first

**It is not currently worth walking through, and the reason is not the rooms. It is the
quantity.**

The entire walkable station is **22.8 m end to end and about 43 m² of floor**. At the
shipped walk speed of 1.85 m/s you cross the whole world in **12.3 seconds**. There are
three rooms. From the spawn point you can already see everything the first room contains.
There is no second thing.

That is the finding the studio cannot write, because everyone inside has been looking at
each room in isolation, where each room is defensible. The limb deck is a competent
module. The corridor is a competent corridor. The node is a competent junction. Put end
to end they are a flat, a hallway, and a landing, and you have walked all three before you
have finished deciding how you feel about the first.

Three things follow from that and they are the whole review:

1. **Nothing is far away.** There is no sightline longer than 11 m and only one of them.
   Depth is the cheapest thing a no-texture engine has and the build spends it once.
2. **Nothing is different.** Ceiling and wall luminance across all three rooms sits
   between **43 and 47 out of 255**. Two rooms with the same value structure are the same
   room; here there are three.
3. **Nothing is above you.** Every fitting in the station is below 1.6 m except the lamps
   and one conduit. The upper half of every wall — the half a standing eye actually looks
   at — is empty in all three compartments.

Underneath that there are two hard defects, and one of them makes the station literally
impassable at the edges of its own doorways.

The good news: the failures are almost all *arithmetic* failures — value spread, sightline
length, seam width, object height — not taste failures. The look is fine. The taste is
fine. There simply is not enough of anything, and the little that is there is all at the
same value.

---

# BROKEN

## B1 — You cannot walk through the station's own doorways. Both of them. Silently.

**Severity: this is a hole in the floor. Confidence: certain, measured twice.**

`SEAM.width` is **1.18 m** (`src/env/station/ports.ts:31`). The walkable width through
every seam is **0.70 m**. The outer **0.24 m on each side** of the visible opening stops
you dead, *inside the door recess*, with the corridor plainly visible ahead of you and no
feedback of any kind.

Measured, limb deck → spine, standing at x = −2.4, facing yaw = π/2, holding `W` for 1.2 s:

| start z | end x | result |
|---|---|---|
| 0.00 | −4.61 | through |
| 0.20 | −4.47 | through |
| 0.30 | −4.60 | through |
| 0.35 | −4.60 | through |
| **0.40** | **−3.10** | **stopped in the recess** |
| 0.45 | −3.10 | stopped in the recess |
| 0.50 | −3.10 | stopped in the recess |
| −0.30 | −4.60 | through |
| **−0.40** | **−3.10** | **stopped in the recess** |

Identical threshold at the second seam (spine → node, from x = −14.8): through at
|z| ≤ 0.35, blocked at x = −15.83 at |z| = 0.40.

The floor union confirms it. Probing `setPose` over a grid and reading back the clamped
position, at z = ±0.5 the walkable runs are `[-19.9, -15.7]` and `[-15.5, -13.1]` — a
**0.2 m gap in the floor** where the two compartments are supposed to meet.

The cause is in `standingPoint()` (`src/env/viewer/controller.ts:195`). The doorway
exemption is applied per rectangle, but the winner is chosen by *nearest legal point*.
Approaching off-centre, the corridor rectangle's own margin pulls your nearest legal
point 0.16 m sideways, the limb deck's pulls it 0.03 m back, the limb deck wins on
distance, and the teleport guard at line 627 then refuses the sideways resolution as
"not a walk". You stop. Forever.

**Why it matters to somebody standing there:** they are inside the doorway, they can see
the room they want, and pressing forward does nothing. There is no wall in front of them.
The only recovery is to guess that they should step sideways.

**Why it survived internal review:** `setPose` to the same coordinates *succeeds* — the
nearest legal point is inside the corridor, so a pinned screenshot from x = −4, z = 0.45
renders perfectly normally. The harness teleports. It has never once tried to walk in.

Evidence: `.gt-refs/evidence/E01-stuck-in-door-recess.jpg` — station, x = −3.10,
z = 0.45, yaw = 1.5708, after holding `W` for 1.5 s. Five flat vertical bands. Nothing
else on the screen.

---

## B2 — The whole screen goes to four values, and it takes two seconds of walking to do it

**Severity: broken, because it is the default outcome of pressing a movement key.
Confidence: certain, measured.**

Station, x = −2.90, z = −1.31, yaw = 1.5708 (facing the port hull), eye at 1.74 m.
Reached by holding `W` for two seconds from a legal standing position.

**3,716,220 pixels. Luminance minimum 71, maximum 75.** The centre 60 % × 55 % of the
frame spans **72 to 74**. One histogram bucket holds 3,442,042 of the 3,716,220 pixels.

Evidence: `.gt-refs/evidence/E03-whole-screen-four-values.jpg`.

This is not a corner case. `WALL_MARGIN_M` is 0.2 m (twice the near plane), so a standing
eye can legally be 20 cm from a hull panel. At a 62° vertical FOV, 20 cm from a flat
untextured facet *is* a monitor full of one colour. There is no texture, no normal
variation, no falloff at that range, and no geometry within 20 cm to break it.

Two more of the same, from ordinary walked positions:

- x = 0.61, z = −1.56, yaw = −1.047 (2.0 s of `W` from spawn): the left 53 % × 85 % of the
  frame — 1,900,080 px — spans **51 to 56**. 99.995 % of it in one 8-value bucket.
  `.gt-refs/evidence/E02-limbdeck-after-2s-walk.jpg`.
- Same position, facing the cupola: the right 44 % × 90 % — 1,669,260 px — spans **43 to
  47**. One bucket, no exceptions.

Aggregate over the whole station: **44 (position, heading) samples** at eye level across
11 standing spots, four cardinal headings each. Mean fraction of the frame occupied by a
single 8-value luminance bucket:

| room | mean frame luminance | mean % of frame in one 8-value bucket | worst | brightest pixel |
|---|---|---|---|---|
| limb deck | 68.9 | 49.7 % | 85.7 % | 253 |
| spine | 44.8 | **83.6 %** | 97.8 % | 141 |
| node | 50.0 | 56.6 % | 96.5 % | 133 |
| **all** | **56.1** | **60.5 %** | 97.8 % | 253 |

**17 of 44 frames have a single 8-value tone covering more than 70 % of the screen.**

---

## B3 — The corridor is a two-value image, and the second value is a floating plank

**Severity: broken as composition, though nothing is malfunctioning. Confidence: certain.**

Standing mid-spine at x = −7, z = 0, and pointing the camera at each surface in turn
(centre 12 % × 12 % of frame sampled):

| surface | luminance | rgb |
|---|---|---|
| ceiling (off the lamp) | **44** | 30, 46, 61 |
| port wall | **43** | 31, 45, 59 |
| starboard wall | **43** | 31, 45, 59 |
| floor | **45** | 33, 47, 61 |
| frame uprights | **43** | 31, 45, 59 |
| lamp strip | **133** | 135, 133, 126 |

Five of the room's six structural surfaces span **three luminance values**. The sixth is
90 values away. There is no middle. The corridor is a black-and-white image with nothing
in between, and the white part is a 0.124 m × 10.2 m strip on the ceiling centreline.

Seen from a standing eye 0.48 m below it, that strip is a hard-edged pale trapezoid
occupying the top-centre of the frame, chopped by the eight frame headers into a
descending chain of wedges converging on the vanishing point. It is the brightest object
in the game, it is the shape of a plank, and it sits exactly on the axis the room's one
good idea — the one-point perspective — needs to be clean.

It is in the studio's own pinned baseline (`shots/current/spine-run.png`), so it has been
looked at and approved. From outside it reads as a rendering error.

The code comment at `src/env/spine/index.ts:305` argues that two wall washes at 0.5
intensity exist so the walls do not "fall to the emissive floor and disappear". The walls
measure 43 against a 44 ceiling. **They disappeared.** The fix was written, reasoned
about, and never measured. That is the specific way an internal review goes wrong: it
agreed with the comment instead of with the framebuffer.

---

# DULL

These are not bugs. They are the reason the thing is not worth walking through.

## D1 — There is no journey, because there is no distance

Measured walkable extents (grid-probed via `setPose` readback, 0.1 m resolution):

```
limb deck   x −2.90 …  2.90   (5.80 m)   z −1.50 … 1.50  (3.00 m)   17.4 m²
spine       x −13.0 … −2.90  (10.10 m)   z −0.75 … 0.75  (1.50 m)   15.2 m²
node        cruciform, 4.2 m × 4.0 m, arms 1.5 m wide            ≈ 10.1 m²
                                                          total  ≈ 42.7 m²
```

Twenty-two point eight metres. Twelve seconds. Two doors. One window.

Everything else in this review is downstream of that. You cannot pace a 23 m world, you
cannot withhold anything in it, you cannot make a room feel large by making the previous
one small, because there is no previous one. The owner's instinct — "many more rooms" —
is exactly right and it is the only fix.

## D2 — All three rooms have the same walls and the same ceiling

| | ceiling | wall | floor |
|---|---|---|---|
| limb deck | 44 | 44 | 76 |
| spine | 44 | 43 | 45 |
| node | 47 | 44 | 60 |

Ceiling and wall across the entire station span **four luminance values**. The only thing
that differs between rooms is the floor, and you are not looking at the floor.

Practically: hand somebody a still frame from the node at eye level facing an arm, and a
still frame from the node facing the corridor, and they are the same picture — two
symmetrical block masses flanking a dark rectangle. I took both. The only difference is
whether the rectangle recedes.

## D3 — The four-way junction cannot tell you which way you came from

The node is a regular octagon, 4.6 m across the flats, 3.6 m to the crown, with four
identical doorways on alternating faces and two mirrored corner stacks. Standing in the
middle and turning through 360°, the four approaches produce two compositions, each
appearing twice. There is no asymmetry anywhere in the room — no fitting on one wall
only, no light from one side, no floor mark, nothing.

A hub whose exits are indistinguishable is worse than a dead end. In a station that is
meant to grow to many rooms, this is the single most load-bearing thing to fix before
anything else is built, because every future room will attach to something like it.

## D4 — Nothing exists above 1.6 m

Every fitting in the limb deck — handrails, stowage, shelves, the dial, the grille, the
door button — is at or below chest height. The band from 1.6 m to the 3.25 m crown carries
strip lamps, one conduit run, and nothing else. Measured: standing at x = 0, z = 0, facing
yaw = π, the region from 10 % to 40 % of frame height (which is the wall from roughly
1.7 m to 2.6 m) has luminance **84 to 89 across 40 % × 30 % of the screen**.

A standing eye at 1.7 m spends most of its time looking at the band between 1.4 m and
2.4 m. That band is empty in every room.

## D5 — The one window is the darkest thing in the room, and it is empty half the time

Standing at the cupola at eye height (x = −0.6, z = −1.45, yaw 0, pitch −0.2), the sky
through the aperture is **exactly VOID_SLATE (16, 27, 38)**, luminance 25, and it covers
**32–41 % of the screen** depending on orbital phase. The hull immediately around the
aperture is 43–44. The window is 19 luminance values *darker* than the wall it is cut
into.

At the studio's own pinned window pose (x = −0.7, z = −1.5, yaw −0.04, pitch −0.22),
sweeping the clock across a full orbit in 200 s steps: Earth covers **0.0 % to 14.8 %** of
the frame. It is above 3 % in **10 of 29 samples** and below 1 % in **18 of 29**. The lit
limb sweeps through in bursts of roughly 150 s and is gone for roughly the same. Nearly
two thirds of the time the station's only view is a flat rectangle of the palette's
darkest value.

The claim in the code — "Earth's lit surface across 30–40 % of the aperture" — is
defensible if you measure the *aperture*. It is not what a body standing at the window
experiences, which is a mostly-black hexagon.

Compare `.gt-refs/R01-cupola-earth.jpg` (NASA, Tracy Caldwell Dyson in the ISS Cupola):
there, the window *frame* is the darkest thing in the picture — a near-silhouette at
around value 20 — and Earth is 190–210. The aperture reads because the frame is dark
against a bright field. GROUND TRACK has it exactly inverted: a mid-value frame around a
dark field. That single relationship, flipped, would fix this shot.

Evidence: `.gt-refs/evidence/E04-cupola-walked-eye-height.jpg`.

## D6 — Two of the three rooms cannot tell you that you are in orbit

The spine and the node have no window, no exterior reference, no light that moves, and —
per the spine's own code — deliberately nothing that changes with time. That is a
defensible choice *once*. In a station of three rooms it means 66 % of the world is
indistinguishable from a basement.

The limb deck's mean frame luminance does swing from **35.3 to 52.8** across an orbit,
which is real and is the best idea in the build. Nothing else in the station participates
in it.

## D7 — You have no body

Looking straight down at eye height 1.74 m shows floor and nothing else. No feet, no
torso, no shadow. The arm (`src/env/player/arm.ts`) is drawn only when an *operable*
point of interest is within 1.6 m and inside a 55° cone — which, in the current station,
is two buttons. For 95 % of the playtime the player is a floating camera with nothing to
measure the room against.

In a game whose entire subject is *scale against a human body*, this is the most expensive
omission on the list, and it is cheap to fix: a permanent lower-frame element (a chest
plate, a hip-mounted tool, the shut limb stack riding at the frame edge) costs one static
mesh and gives every room a ruler.

## D8 — Colour integrity

- The sunlit hull renders **rgb (118, 134, 116)** — green channel highest, blue lowest.
  A desaturated sage. `PALETTE.HULL` is `#7E93A2` = (126, 147, 162), blue-dominant. The
  combination of `SUN_COLOUR #FFF0D6` and the `EARTHSHINE_GROUND #C4B189` hemisphere term
  pulls blue down by 46 units. The largest surface in the game never shows the hull colour
  the palette specifies; it shows olive. Whether that is a bug or a happy accident is the
  studio's call, but it is not what is written down.
- **Pixels clip out of the palette.** At t = 0, x = 0, z = 0, yaw 0, two pixels reach
  **(255, 255, 228)**. At x = −2, z = −1, yaw π, **43,350 pixels (1.18 % of the frame)**
  exceed MINT's luminance of 213, peaking at (220, 235, 184) — a green-white that is in no
  palette entry. At x = 2.5, z = −1.2, yaw π/2, (216, 244, 251) — a blue-white with the
  blue channel at 251. Minor, but the diffusers are clipping.
- No pure black anywhere. Minimum sampled luminance across every probe was **25**, which
  is exactly VOID_SLATE. That rule is being kept perfectly.

## D9 — The floor is a technical drawing

Looking down in the limb deck: a uniform orthogonal grid of 1-pixel pale lines on a flat
field. No wear, no plate variation, no direction of travel, no difference between the
middle of the room and the edges. It aliases badly at grazing angles. The spine and node
floors are unmarked. In a station where the floor is the *only* surface whose value
differs between rooms, it is doing no work.

---

# What genuinely works — do not break these

Short, and last, on purpose.

1. **The one-point perspective down the spine.** Eight receding frames converging on a
   lit doorway is the best single image in the build and the only place the geometry
   itself is the subject. Keep the device; fix the lamp sitting on the vanishing axis.
2. **The framed doorway, as a device.** Standing in the limb deck with the door open
   (x = −1.06, z = −1.29, yaw 2.346), the opening reads as a genuine aperture. It is
   worth knowing that the contrast doing the work is smaller than it looks: the space
   through the door measures **107** and the wall beside it **92** — only 15 luminance
   apart. What sells it is the near-silhouette door jamb immediately around the opening.
   The device works; the value spread carrying it is thin, and D1/D2 in ROOM-BRIEF widen
   it deliberately.
3. **The orbit moving the light in the limb deck** (mean frame luminance 35 → 53). It is
   the one thing that makes the room feel like it is somewhere. Extend it, do not dilute
   it.
4. **The extruded bulkhead lettering** (`STATION KEPLER / NODE 2 / LIMB DECK`). Measured
   at the studio's `deck-aft` pose: the placard reads **63** against a **106** bulkhead —
   43 luminance of separation, the second-largest value break anywhere in the limb deck
   and the only one attached to information. Geometry as signage, in a game with no
   textures. This is the right technique and it should be on every bulkhead in the
   station.
5. **The no-black discipline.** Held perfectly. Minimum 25 everywhere.
6. **The limb / arm concept.** A chain of magnetic couplings that comes apart to reach is
   a genuinely original idea and it solves the first-person-arm problem properly. It is
   just almost never on screen.
7. **The seam contract** (`ports.ts`) and the streaming graph. The architecture for
   twenty rooms already exists. That is why the fix is buildable.

---

# What I am unsure about, and what I would check

- **The door button.** It is a plain grey square with no accent, no bevel that reads at
  distance, and no state change I could see. I could not tell it was a control until the
  debug API told me the hand was holding it. I did not test whether it has a pressed pose;
  I would check `limbDeck/door.ts` and watch it at 0.5 m.
- **Frame rate.** I could not measure it honestly — the tab was backgrounded and I drove
  the loop through a `MessageChannel` shim. Everything about *what* is drawn is
  trustworthy; nothing about *how fast* is.
- **Audio.** There is a room-tone and footstep system (`player/sound.ts`) I never heard.
  If the compartments already have distinct machinery pitches, that is one of the five
  differentiation axes already half-built, and it changes the priority of some of the
  recommendations in ROOM-BRIEF.md.
- **The dust motes.** The scattered white specks over interior walls in the limb deck
  read as stars punching through the hull. They are probably `limbDeck/motes.ts` behaving
  correctly. At the size and value they currently have, they read as a rendering fault.
  Worth two minutes with someone who has not seen them before.

---

The specification that follows from all of this is in `ROOM-BRIEF.md`.
