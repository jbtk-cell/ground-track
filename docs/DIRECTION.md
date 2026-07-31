<!--
Creative direction for a space/satellite math game, generated 2026-07-31.
Synthesized from 4 game concepts and 4 art directions, scored by 3 judge lenses
(player appeal, art distinctiveness, design integrity).

Concepts considered: GROUND TRACK, SLOW LIGHT, STATION KEEPING (x2)
Art directions considered: SUNRISE PASS, EPHEMERIS, LONG EXPOSURE, WARM METAL COLD SKY

Reference project: Quiet Vector (github.com/jbtk-cell/quiet-vector)
-->

# GROUND TRACK

You own a small satellite network. The only control input in the entire game is one small whole number you type into a flight computer — and real Keplerian orbits, real transfer burns and real Walker constellation geometry are what obey it. The shape your coverage draws across a hazy, low-poly Earth is the score. The single idea underneath everything: **the machine finds the shape, you give it the size.** The hard orbital mechanics is spectacle the world visibly runs on; the child's contribution is the last line of a computation the machine already did, and that line is arithmetic.

## The premise that makes it work

The station's flight computer solves the transfer, prints the whole maneuver card, and stops one line short. A human closes it. This is close to historically true — Houston computed the burns and read a PAD up to the crew — and it is the most important framing choice in the design, because it makes the child the final authority over a machine rather than a student being tested by one.

**Grade 3.** HERON-1 coasts toward a node. The card prints:

```
MANEUVER · APOGEE RAISE · HERON-1
r periapsis ............ 6 718 km
r apoapsis ............. 7 158 km
semi-major (transfer) .. 6 938 km
node ................... T-00:41
Δv required ............ 48 m/s
thruster ................ 6 m/s per s
BURN DURATION .......... __ s
```

They type **8**. The engine burns for eight seconds — not eight seconds of animation, eight seconds of integrated thrust. The velocity readout climbs 6 at a time while the ellipse deforms in real time, apogee climbing away from the limb until it settles onto the target ring and the ring goes dashed to solid. Type 6 and the engine burns six seconds and the apogee comes up **short**, visibly, with a gap you can see. Nothing says wrong. The computer reprints a smaller correction card at the _next_ node, forty seconds later, and the propellant column drops one notch.

**Grade 7.** Same mission, same card, same eight seconds: `Δv 0.48 km/s · thruster 0.06 km/s per s`. Same answer. Only the numeral form changed. Later that session the constellation card asks for 360 ÷ 8 = 45°, then the second plane offsets by half that — 22.5°, which is real Walker delta phasing, not an invented problem.

## Visual direction

Quiet Vector's dawn horizon, bent into an arc. That is the whole move, and it is why this survives leaving the atmosphere: the reference's beauty is not "dark and calm," it is a large luminous field with legible geometry in it. Three of the five hero frames are bright images.

**Palette.** Sky/limb gradient, top to surface: `#101B26` void slate (the darkest value in the game — there is no black anywhere) → `#38495A` → `#6E8496` high field → `#D9C9A6` → `#E4D6BB` dawn cream, with a thin `#F1E7D4` ignition core only at the terminator. Earth: forest `#4E6B3C`, sage `#6E8A4E`, arid sand `#B9A87E`, ocean slate-teal `#46707E`, cloud decks as Quiet Vector's soft blurred `#DCD8CE` blobs laid flat on the sphere. Night side `#101C28` with sparse warm `#C9A063` settlement pinpricks. Spacecraft: hull `#7E93A2` lit over `#46586A` shadow, matte MLI foil `#B99A63`, arrays `#2E3C55`. Instruments: pale mint `#C6DCCC`. Caution is a desaturated rust `#A8624B`, hairline only. **One accent, `#D98A3C`,** permitted on exactly two things: the primary action and the live burn. Coverage gaps are rendered as _unlit cells_ — absence, not alarm — which gives us the win state for free: a finished sky has no orange in it.

**Typography.** I'm overruling most of the pitch documents here, because I looked at the screenshots: Quiet Vector's wordmark is a **grotesque at moderate weight**, not a hairline monospace at 0.44em. So — wordmark in a neo-grotesque, weight 500–600, ALL CAPS, tracking 0.14em, `#F0EEE9`. Instrument values in the same grotesque, semibold, tabular lining figures, slashed zero, mint. Everything small is IBM Plex Mono: the eyebrow (`NETWORK OPERATIONS · STATION KEPLER · ORBIT 0`, 10px, 0.28em, `#8FA0AC`), unit labels beneath numerals at 9px/45%, keybind legend, card fields. Digit grouping uses a thin space — `7 726 m/s` — aerospace convention, and it teaches place value for free. The rare sentence a child must actually parse ("Which is larger — 3/4 or 2/3?") is set in Atkinson Hyperlegible at 20px minimum. The face change carries the meaning: mono means the machine is talking, Atkinson means you are being talked to.

**Render and light.** Flat-shaded low-poly, no textures, no PBR, **no bloom at any intensity anywhere.** Three lights: one grazing key at `#FFF0D6` placed nearly tangent to the surface at the camera's position — this is the whole trick, because at low sun angle a 400-triangle Earth shatters into separable facet values, where a high sun turns it to mush; one earthshine hemisphere (sky `#6E8496`, ground `#C4B189`, 0.55) whose ground term puts bounced daylight on the underside of your satellite; one very dim anti-sun fill so the night limb is never a flat silhouette. Atmosphere is a crisp rim on a slightly larger inverted shell, never screen-space. Quiet Vector's fog becomes **altitude haze**: a cream wash existing only within ~200 km of the surface, so you read your altitude off how soft the world looks before you read a numeral. Stars are 1–2px squares sampled from a five-stop spectral ramp, and they never twinkle, because twinkle is an atmospheric artifact and there is no atmosphere.

## The world you look at

A hard compositional law: **Earth's limb occupies 30–40% of frame at all times.** No shot is ever an object against black — Earth is the fog. Orbits are 1px hairlines, solid ahead of nothing and dashed behind: passing behind the planet a trace converts mid-stroke to a 6px/5px dash at 28% alpha and returns solid on emergence — ISO hidden-line convention executed live against a real depth test, with the dash phase crawling 4px/s so a still frame is never frozen. Ground tracks paint the real sinusoid onto the continents in your livery color at 25% and fade after one revolution. Footprints are 1px circles with 6% fill, doubling to 12% on overlap, so a dense constellation quilts into a lattice. Satellites carry crumpled MLI modeled as a shallow-displaced plane, so flat shading fractures one gold blanket into forty facets, and stencil decals — `AE-4`, `+Z`, `NO STEP` — baked into the geometry. The camera never cuts; every reposition is a 2.5–4s cubic ease.

## How the question appears

**The PAD.** A hairline card docks lower-left. The world does not pause, dim, or blur behind it. It lists twelve fields the simulation is genuinely running, on dotted leaders. Eleven are filled by the flight computer. One is blank — not an input box, a 1px underscore sized to exactly the digits that will land on it. **Typed digits render in the identical face, weight, size, color and baseline as the computer's values.** Nothing on the card marks which number is the kid's. That single decision is the entire "a nine-year-old should feel trusted" brief, solved. The amber caret exists only while typing; on commit it goes out and the line becomes indistinguishable from the rest.

The answer is always derivable from two other fields on the same card by one grade-appropriate operation, and the number is _executed_, never graded. No invented units — no "thrust blocks," no "impulse units." Δv ÷ thruster acceleration is a real load-bearing equation and it is the identical single division.

Wrong answers get no red, no X, no shake. The entered value drops to 40% and slides left into an `ENTERED` column; a fresh blank opens beside it. And the anti-guessing pressure, which is the thing to prototype first: correction burns spend from a visible finite propellant column, and the correction card arrives at the **next node forty seconds later**, not immediately. Guessing costs fuel and time, legibly, with no punishment. Paired with the law that **nominal results are the beautiful ones** — a guessed-into orbit is a lopsided ellipse that never quite goes solid, fine but unlovely.

While typing, the projected conic ghosts at 22% dotted so magnitude errors are visible as shape. Critical modification: **the target ring is suppressed during entry.** You can see that 70 balloons off the field; you cannot converge on the answer by eye. Off entirely at grades 7–8.

## Grade adaptation

A grade-2 and a grade-7 player fly the same mission, see the same screen, and arrive at the same answer. Only the numeral form changes. **Grades 1–2:** RCS fires in countable discrete pulses — `Δv 24 m/s · per pulse 6 m/s · pulses __` → 4, then four amber puffs 350ms apart, the ellipse stepping once per puff. Labels are glossed (`HIGH POINT` under `APOAPSIS`) for the first sessions, then the gloss drops. Input is large tap cards. **3–4:** the spine — times tables and division, burn duration in seconds. **5–6:** fractions, decimals, and signed Δv, where +40 raises the _opposite_ side of the orbit and −40 lowers it; decimals arrive because a satellite failed and seven survivors must respace at 360 ÷ 7 = 51.4°, not because you leveled up. **7–8:** ratio, percent, and eventually scientific notation because the readout physically cannot display the value any other way. Precision itself is the reward for being older: readouts stop rounding, `214 KM` becomes `214.3 KM`. The word "grade" appears exactly once, on the certification card, and never again.

## Progression

Satellites get names the child types, and the name follows them onto every card, the register, the ground track label, and the moving light on a night pass. Livery color is also ground-track color and footprint color, so over weeks **the Earth slowly becomes your color** — territory delivered with no leaderboard, no shop and no hat. Planes are the long arc: one ring becomes two crossing at inclination, then a woven lattice. Completed PADs stack edge-on at the bottom of the left rail as 320px hairlines with mission numbers; forty of them is the progress bar. An imager payload returns stamped stills whose resolution is an honest function of how well you placed the bird. And one counterweight: a single deep-space probe, checking in from further out each week with a longer light delay, quiet at the edge of a busy network.

## The signature moment

**Closing the ring, on the dawn terminator.** Five satellites, a gap you've stared at for two sessions, and a sixth catching up from a lower, faster phasing orbit. The slot card comes up: six satellites, 360 degrees, spacing blank. You type 60. Then the game hands you eight seconds with nothing to do. The six ease apart along the hairline ring. Their footprints slide across the faceted continents, touch, and merge into one continuous band. Underneath, the raking sun crosses each triangle's normal in turn and the continents light facet by facet in a slow wave — which is not an effect, it falls out of the lighting rig for free, which is exactly why the rig is built that way. One line of mint appears under the register:

```
PLANE A · CONTINUOUS
```

No sound sting. No confetti. The kid made that happen with 360 ÷ 6 = 60.

## What we are deliberately not doing

**No glow, at any intensity.** No bloom, no lens flare, no chromatic aberration, no holographic panels, no emissive UI. Quiet Vector has zero bloom and that is precisely why it does not read as sci-fi. A hard rule of none is easier to hold than a budget of a little.

**No score, no percent, no XP, no stars.** Coverage is expressed only as geometry — lit cells, closed bands. A "94%" is a leaderboard with a costume on, and it invites exactly the thinking the art direction refuses.

**No multiple choice, ever.** Typed digits into fixed-width cells. Four answer chips reduce a division problem to a one-in-four guess, which is the fastest possible route to the toll-booth failure this whole design exists to avoid.

**No wall-clock decay, no streaks, no login rewards, no "you missed a day."** A child must not be able to lose ground by going to camp. Decay is session-relative and capped. The pull is custodial, never anxious.

**No red, and no second person.** The game never says "Great job." It says `BURN NOMINAL · APOAPSIS 420 KM` — telling the child the mission worked, not that they are a good boy.

## Open questions for Johnny

1. **Do grades 1–2 get a materially different shape, or the same game with easier numbers?** Constellation-building is a strategy pleasure with a payoff measured in weeks, and a six-year-old does not have that patience. My instinct is a tighter variant inside the identical world and art — one satellite, one region, a band that closes in a single sitting. That is real additional design work the grade slider does not solve, and it needs your call before the loop is locked.

2. **How hard does the propellant pressure bite?** It is the only thing standing between this and a worksheet with a screensaver between questions, and it pulls directly against the calm that is the entire reason to build the game in this language. The needle is narrow and I would not trust anyone's intuition about where it sits, including mine. This should be prototyped before any art — one card, one burn, one finite tank, with actual eight-year-olds and a stopwatch.

3. **Does the second register exist?** The strongest single image in the losing pitches was a fleet plan view rendered as a warm paper light table — `#E4DCCB` field, `#C9BEA8` grid, graphite orbits — a warm pale rectangle glowing in a dark room. It is genuinely original and it is the only anti-neon move that inverts value rather than desaturating. But it is a second art pipeline. Worth it, or does the limb carry the whole game?

4. **The name, and the wordmark face.** GROUND TRACK names the actual visual signature and letterspaces as well as QUIET VECTOR does. Confirm it survives a search, and pick the grotesque now — everything else keys off it. My recommendation is Space Grotesk Medium for display and numerals, IBM Plex Mono for all small type, Atkinson Hyperlegible for the rare read-aloud line.
