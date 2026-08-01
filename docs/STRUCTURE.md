<!--
Meta-game structure, synthesized 2026-08-01.
Owner direction: "like Prodigy — not in art style, in gameplay. Not a story game.
Areas and enemies you can beat over and over."
Process: 2 research agents on how Prodigy actually plays (battle loop, zones,
retention), 3 independent structure designs, 3 judge lenses (Prodigy fidelity,
invariant compliance, buildability). Winner: FIVE REGIMES (2 of 3 judges), with
grafts from the two losing designs (HAILS, FLEET REGISTER) mandated by the judges.
DIRECTION.md governs how the game looks and speaks. This file governs the shape
of play. Both are binding on loop agents.
-->

# STRUCTURE — areas, encounters, and the reason to come back

Prodigy's island becomes the space around Earth. Orbital regimes are the zones. The roaming monsters are physical situations — a decaying perigee, debris on a crossing track, a slot sliding off station — and they respawn forever because **the respawn mechanism is the physics**: drag never stops, the Earth's lumpy gravity never stops, phasing drift never stops. Every encounter is the one existing mechanic, a PAD card with one blank, and every outcome is a printed measurement on a physical spectrum. There is no story. A player who ignores every request and grinds station-keeping forever is playing the game correctly.

## The Prodigy mapping

| Prodigy                                        | GROUND TRACK                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Elemental zones (Firefly Forest, Shiverchill…) | Orbital regimes — each defined by its weather (dominant perturbation), tempo (rev period), and light                                  |
| Roaming monsters, touch to battle              | Standing situations, visible as geometry; fly near or click to task the computer                                                      |
| Turn-based battle, math powers the spell       | The PAD exchange: card prints, one blank, typed number executes as real thrust                                                        |
| Wrong answer → fumble, lost turn               | **Refused.** Every number executes. A short burn is a real orbit and the shortfall becomes the next, smaller card                     |
| Monsters respawn by fiat                       | Perturbations regenerate situations mechanically                                                                                      |
| Pet capture and collection                     | Derelict salvage — caught frames are refit and join the fleet, flyable and named                                                      |
| Shiny/rare pets                                | Heritage buses with strange physics — a crude 25 m/s-per-s thruster means two-second burns; rarity IS different arithmetic            |
| Gear changes battle stats                      | Hardware changes the card numbers — thruster sets the numeral form, tank sets reach, imager sets what a pass returns                  |
| Level-gated zones                              | Tank-gated regimes — the planner prints the Δv fact, not a lock                                                                       |
| Daily respawns, streaks                        | **Refused.** The comeback hook is physical: a transfer parked mid-coast, a plane one bird short, a derelict still crossing your trace |
| Story quests (skippable)                       | None at all                                                                                                                           |

The one deliberate departure from Prodigy is the whole design: Prodigy grades every answer (fumble on a miss). GROUND TRACK never does. The pressure that replaces grading is propellant and time, applied to every entry alike.

## The areas

An area is an orbital regime: an altitude/inclination band defined by three real things at once — its **weather** (the perturbation that regenerates its encounters), its **tempo** (rev period, which sets the pace of play there), and its **light** (which expression of the fixed palette dominates the frame). Nothing is themed; every distinction falls out of where you physically are.

Five regimes plus one horizon. They do not all ship at once — the build order below stands up the Low Field and the Ring first, the Dawn Line after, the Shell and the Long Swing when the coverage and constellation machinery exists.

**1 · THE LOW FIELD** (LEO, 300–600 km) — the starter area, where the existing apogee-raise slice already lives. Weather: atmospheric drag, the gentlest and most legible perturbation — perigee sinks, cards come more often the lower you get. Tempo: fast, 90-minute revs, day/night strobing past. Light: cream altitude haze at full strength, the limb as a floor. Encounters: REBOOST, THE CROSSING, CORRIDOR ENTRY, low TASKED PASSES.

**2 · THE DAWN LINE** (sun-synchronous polar, ~700–800 km, 98°) — the title palette as a place. The orbit rides the terminator permanently: the whole area is golden hour. The quiet lesson: the same J2 that is weather elsewhere is harnessed here — sun-synchronism is the enemy working for you. Ground tracks cover every latitude, so this is the territory-painting area. Encounters: TASKED PASS (the photograph area), repeat-track phasing.

**3 · THE SHELL** (MEO, ~20 200 km, semi-synchronous) — the lattice. Weather: the radiation belt below, rendered as a sparse torus of static 1–2 px flecks sampled like the star ramp — radiation as a place you transit, never an effect. Tempo: stately 12-hour revs; Earth reads as a full sphere for the first time. Encounters: THE SLOT (360 ÷ N, the spine), plane phasing, belt transits.

**4 · THE RING** (GEO, 35 786 km) — the night area. Weather: triaxiality drift; the slot box is a thin graphite rectangle your bead slowly slides out of, forever. Tempo: you hang still and the Earth turns beneath you, settlement pinpricks dominating. Satellites are named beads on one shared hairline circle, derelicts among them as gray beads. Encounters: KEEPING, longitude relocation (drift × days = degrees), graveyard raising.

**5 · THE LONG SWING** (Molniya, 12-hour, 63.4°) — the ellipse as a place. Weather: the plunge itself — hours of near-motionless apogee dwell over the pole, then a whip through the perigee haze in minutes; the tempo contrast IS the area. Hairline mint auroral arcs, 1 px polylines, no glow. Encounters: DWELL, twin-bird handoffs.

**HORIZON · FARSIDE** (lunar, post-launch) — grows out of DIRECTION's deep-space probe. The Moon's limb takes over the 30–40% law so nothing ever sits against black; typed digits echo back a beat late because light delay is real. Unlocked the day a delivered tank can honestly print a translunar card.

## The map, and travel

No second art pipeline and no cut: the map is the camera pulling back (the mandated 2.5–4 s cubic ease) until the regime rings fit — Earth's disc holding 30–40% of frame, each regime a labeled hairline annulus with a mono eyebrow (`LOW FIELD 400 KM · THE RING 35 786 KM`), your birds as livery beads, lit coverage cells quilting the disc, open transfers as dashed conics. Clicking a regime eases the camera down through the haze to it.

The core distinction: **looking is free, flying costs Δv.** Moving a satellite between regimes is flown, not selected — a Hohmann leg of two PAD cards, departure and circularization, each with one blank, the transfer conic going dashed-to-solid as it is flown. Regime access is gated by tank physics, not locks, and the gate is printed as a fact, never hidden:

```
TRANSFER DV .......... 2 400 m/s
TANK ................... 900 m/s
```

No card prints. The world withholds nothing and judges nothing; the Δv just isn't aboard yet. That line is how a locked zone pulls — the kid can see the number to grow toward from day one.

## One encounter

60–120 seconds, and it is the existing coast → card → burning → assess machine with the assess phase generalized from one tolerance check to a printed measurement.

**TRIGGER (0–10 s).** The situation exists as geometry: a gray dashed trace crossing yours, a rust hairline conjunction corridor, a bead edging toward its slot-box wall, a request line in the register. Flying near it or clicking it tasks the flight computer — the touch-a-monster beat, but the monster is a trajectory.

**PLAN (10–20 s).** The computer solves the whole problem and the PAD docks lower-left, world still moving behind it. One blank on a 1 px underscore. The blank is always derivable from two printed fields by one grade-banded operation.

**ENTRY (20–45 s).** The player reads, divides, types. Ghost conic at 22% shows magnitude as shape; target geometry suppressed during entry. On commit the caret goes out and the digits become indistinguishable from the machine's.

**EXECUTION (45–60 s).** Ignition at the node. The typed number is integrated exactly as typed; the propellant column drops. Tank and energy ceiling remain plant limits applied to every entry alike.

**THE PASS (60–100 s).** The situation physically plays out and the machine prints a measurement, never a grade: `CLOSEST APPROACH 9 KM` · `OFFSET 41 KM EAST` · `DRIFT 0.4°/DAY WEST` · `ARRIVAL 12 KM BEHIND`. Where the pass delivers something countable — contact seconds, coverage — the payoff is per-second and visible: cells light one by one for exactly the seconds the footprint covers them while the register ticks.

**RESOLUTION (100–120 s).** If the resulting geometry sits inside the printed tolerance — a card field, enforced exactly like today's `toleranceKm` — the situation retires: the trace clears, the cell lights, a register line is added. If not, the computer plans a correction from the ACTUAL orbit at the next node, one propellant notch down. Walking away is also legitimate: a left situation just keeps standing. Both exits are states of the world, not judgments of the player. **AGAIN is one keypress** — the next situation is already in the queue.

**The remainder rule** (binding for every coverage-shaped encounter): a partial delivery banks the delivered fact and re-posts the shortfall as a smaller card planned from the orbit that actually exists.

```
CONTACT 61 S · WINDOW 90 S
```

Sixty-one is not a fail; 61 seconds of data were delivered, and a 29-second remainder window posts against a later pass. This is `planCorrection` generalized: **the remaining problem is always smaller.** Prodigy punishes a miss with a lost turn; here a miss hands you an easier division.

**The offer queue.** Session open prints a quiet register block — standing situations with countdowns, a menu, never an obligation:

```
SITUATIONS 3
KEEPING · SLOT 14 ......... DRIFT 0.3°/DAY
TASKED PASS · SITE 214 .... NEXT PASS 04:10
CATCH · AGENA CLASS ....... GAP 90 KM
```

Sites ask, they never plead. No greeting, no missed-day line, no summary of absence.

## The eight encounter types

Every type specifies its blank at all four bands. Grade changes the numeral form on an otherwise identical card — regimes never gate by grade, and no area is an arithmetic tier in disguise.

**REBOOST** — Low Field weather. Drag has eaten a perigee; the haze visibly softens as the bird sinks; cards arrive more often the lower it gets. The enemy is the atmosphere. Outcome: a continuous new perigee altitude, `PERIGEE 412 KM`. Short entries leave it lower — softer haze, sooner cards, more tank over time. Respawn: solar-activity cycles scale the drag rate; drag never stops.

- grades 1–2 · pulses: `Δv 24 · per pulse 6 · PULSES __` (4)
- grades 3–4 · `Δv 18 ÷ thruster 6 · BURN DURATION __ s` (3)
- grades 5–6 · ion thruster brings decimals: `Δv 4.5 ÷ 0.5` (9)
- grades 7–8 · ratio form: `PERIGEE RISES 3 KM PER M/S · RAISE 45 KM · Δv __` (15)

**THE CROSSING** — debris on an intersecting track, a desaturated-rust hairline marking the conjunction corridor. Low Field and Shell. Outcome: `CLOSEST APPROACH 9 KM`, a distance, never a verdict. A pass inside the corridor width (a printed card field, a plant limit) has the bird shutter its payload and feather arrays for that pass — a protective posture, so the cell it would have lit stays unlit. Absence, not alarm; never a damage number. Respawn: each spawn seeds new crossing geometry.

- grades 1–2 · pulses to shift the track
- grades 3–4 · `Δv 12 ÷ 4 · BURN DURATION __ s` (3)
- grades 5–6 · signed Δv: +40 raises the far side, −40 lowers it
- grades 7–8 · period-change form: shift needed ÷ shift per second

**TASKED PASS** — the Dawn Line's signature. A ground site requests a frame; the imager is the weapon and the ground track is the aim. Outcome: **a photograph is ALWAYS returned** — of whatever was actually under the track on the typed rev. Dead-center site, terrain 41 km east, or open ocean; the still stamps its own measurement (`OFFSET 41 KM EAST`) and goes in the album either way. The picture you took is the entire outcome. Remainder rule applies to multi-frame requests. Respawn: endless sites at fresh longitudes; the westward-shift-per-rev changes with altitude, so the division is never the same twice.

- grades 1–2 · countable: track moves one marked step west per rev, site three steps west, `REVS __`
- grades 3–4 · `SHIFT 24°/REV · SITE 72° WEST · REVS TO PASS __` (3)
- grades 5–6 · decimal trim: a burn-seconds card fine-tunes the track
- grades 7–8 · combined revs-plus-trim, ratio form

**THE CATCH** — the collection engine. A derelict — spent stage, dead weather bird, tumbling cubesat — coasts on a neighboring orbit; the servicer gives chase from a lower, faster phasing orbit. Outcome: `ARRIVAL 12 KM BEHIND`, signed and continuous. Inside the printed capture corridor the grapple takes and the docking simply proceeds — `HARD DOCK · SALVAGE · AGENA CLASS`, no fanfare; outside it, the computer replans from the actual gap and the chase continues. Extra revs are time, not shame. Caught frames are towed in, refit over a session, and **join the fleet** — flyable, kid-named, with a register plate and their own stat sheet. Salvage physically refuels: `RECOVERED · 40 M/S` ticks the tank column up — catching monsters feeds the resource that guessing spends. Rarely, a heritage bus appears in the advisories — an old frame with strange hardware whose rarity is different arithmetic. Respawn: gap, direction, altitude, closing rate, and the derelict model re-roll per target.

- grades 1–2 · countable laps, the register ticking one per rev
- grades 3–4 · `GAP 120 KM · CLOSES 30 KM/REV · REVS __` (4)
- grades 5–6 · decimal residual: `GAP 105 ÷ 30` (3.5)
- grades 7–8 · ratio of the two orbital periods

**KEEPING** — the Ring's standing weather. Triaxiality drags a bead east or west out of its slot box. The enemy is the shape of the Earth. Outcome: a continuous drift rate, `DRIFT 0.1°/DAY WEST`. Near zero and the bead sits; residual drift and its footprint eases off its cells, which quietly unlight. Respawn: real triaxiality wells — each slot on the Ring plays differently, forever.

- grades 1–2 · pulses
- grades 3–4 · `Δv 6 ÷ 2 · BURN DURATION __ s` (3)
- grades 5–6 · relocation: `TRAVEL 12° · DRIFT 1.5°/DAY · DAYS __` (8)
- grades 7–8 · signed drift and inverse forms: drift × days = degrees, any one blank

**THE SLOT** — the Shell. A constellation plane needs its birds evenly spaced — DIRECTION's signature moment, made repeatable. Outcome: the spacing executes as typed and the coverage band shows the consequence as geometry — even spacing quilts a continuous lit band; lopsided spacing leaves a dark cell that circulates on a real period. `PLANE A · CONTINUOUS` prints only when the band closes — a fact about the sky, not the child. Respawn: N grows with the fleet; failures and second planes regenerate the arithmetic.

- grades 1–2 · countable: 12 ring marks, 6 birds, `MARKS APART __` (2)
- grades 3–4 · `360 ÷ 6 · SPACING __ °` (60)
- grades 5–6 · a failure forces `360 ÷ 7` (51.4); the second plane offsets by the Walker half-step (22.5)
- grades 7–8 · Walker delta phasing as a ratio

**DWELL** — the Long Swing. Polar cells need continuous coverage; one Molniya bird dwells above 60°N only part of each rev, so twin birds must hand off on time. Outcome: delivered coverage as geometry, `COVERAGE 20 H OF 24` and nothing else; a short entry hands off early, a long one leaves a repeating dark gap. Remainder rule applies. Respawn: two-bird then three-bird handoffs, different target latitudes, station-keeping period tweaks.

- grades 1–2 · not posted (the Long Swing's tempo is a later-band pleasure; nothing gates — the cards there simply involve halves and the youngest players have no tank that reaches it yet)
- grades 3–4 · `PERIOD 12 H ÷ 2 BIRDS · HANDOFF EVERY __ H` (6)
- grades 5–6 · fraction of period: `2/3 OF 12 H · DWELL __ H` (8)
- grades 7–8 · three-bird phasing, percent-of-period forms

**CORRIDOR ENTRY** — end of life. A spent frame comes down through the long ocean disposal corridor; the retro burn is planned; the entry ellipse draws as the number is typed. Outcome: entry point along track, continuous — `ENTRY 300 KM DOWNRANGE OF CENTER`. The corridor is thousands of km long; anywhere inside retires the frame and frees its launch mass for the manifest. Far outside, the register simply records where it fell — the world never flinches, and the freed mass arrives regardless. Respawn: corridor, starting orbit, remaining propellant and retro thruster differ per retirement; deorbiting a heritage frame with its odd engine is a genuinely different division.

- grades 1–2 · retro pulses
- grades 3–4 · `Δv ÷ accel · BURN DURATION __ s`
- grades 5–6 · decimal Δv
- grades 7–8 · `ENTRY SHIFTS 120 KM PER M/S · OFFSET 360 KM · Δv __` (3)

## Progression

Everything that accumulates is a thing in the world, never a number about the player.

**TERRITORY** — the slow win. Lit coverage cells in livery color quilt the Earth across weeks; the map view makes this the first thing seen each session. The Dawn Line paints fastest, the Ring holds widest. A finished sky has no orange in it.

**FLEET** — the pet collection, physically. Frames arrive three ways: resupply launches (watched from orbit as a moving light climbing off the limb), derelict rescue via THE CATCH (refit takes a session, then it flies), and rare heritage finds. The child names each bird and the name follows it onto every card, track, and night-pass light. Heritage frames are the shiny-pet chase, and their pull is arithmetic: a crude high-thrust engine means two-second burns; a solid kick stage is one fixed impulse to plan around.

**HARDWARE** — the level-up that is a difficulty dial in disguise. Thrusters set the numeral form physically (cold-gas pulses = counting; 6 m/s-per-s hydrazine = the division spine; 0.5 m/s-per-s ion = decimals and long patient burns). Tanks are reach — the only regime gate in the game. Imagers set what a nominal pass honestly returns. Hardware is delivered against the **MANIFEST**: physical totals only — cells lit, contact seconds delivered, frames returned, m/s recovered, corridor entries inside. Never "consistently met," never a streak, never a judged achievement. Packing the manifest is itself grade arithmetic: `HYDRAZINE 24 KG + IMAGER 12 KG + WHEEL 4 KG` against `CAPACITY 40 KG`, capacity a plant limit, the sum checked by the kid.

**COLLECTION** — three registers with no percent on any of them: the SALVAGE REGISTER (every caught derelict as a modeled object with a plate), the FRAME ALBUM (every returned photograph including the misses, each stamped with its honest offset — a diary of the player's actual orbits), and the PAD STACK (completed cards edge-on in the left rail; forty of them is the progress bar).

**THE ECONOMY** — two currencies, both physical: propellant (spent visibly, scavenged from salvage) and manifest mass (earned by outcomes in the world). No coins, no gems, no shop, no XP.

**LONG ARCS** — one ring becomes two planes becomes a woven lattice; the deep-space probe checks in from farther out each week; Farside waits for the tank that can reach it. The pull back tomorrow is never a streak — it is an open transfer parked mid-coast (circularization is tomorrow's first card), a plane one bird short, a derelict still crossing your trace.

## Consequence discipline

Costs are propellant, time, and absence — always legible, never punitive, applied to every entry alike.

- A close conjunction shutters the payload for that pass; the cell stays unlit. Never a damage readout, never `POWER 62%` — a percent in the register is a score with a costume on, and the palette/no-percent lint applies to register strings too.
- An empty tank prints no card. An insufficient tank prints the Δv fact. Nothing is ever locked, hidden, or flagged.
- Losing states are absence — unlit cells, a standing derelict, a drifting bead — never alarm.

## A ten-minute session (grade 4)

0:00 — camera eases to the fleet from wherever it last stood; the register prints standing lines only. 0:30 — KEEPING: `Δv 6 ÷ 2`, types 3, the bead settles, `DRIFT 0.0°/DAY`. 2:00 — TASKED PASS: shift 24°/rev, site 72° west, types 3; two compressed golden-hour revs, shutter on rev three, `FRAME RETURNED · OFFSET 2 KM`, the cell lights in livery green. 5:00 — THE CATCH: the stage chased since Tuesday is 90 km ahead, closes 30 per rev, types 3, `ARRIVAL 4 KM AHEAD`, grapple, `RECOVERED · 40 M/S`. 7:30 — the manifest delivered a bigger tank, so the Shell transfer card prints for the first time: `Δv 320 ÷ 8`, types 40; the coast to apogee will outlast the session, and that parked mid-transfer is the entire comeback hook, made of physics. 9:30 — three PADs slide into the rail; the map holds a moment — a little more of the Earth in the player's color than yesterday. No summary screen. Close.

## Structural invariants (loop agents: these are lintable)

1. **No branch on the entry.** Every encounter routes through the one `commitEntry` path; no code path anywhere compares the typed value to a stored answer. A CI test asserts this structurally, holding executed-never-graded as a mechanical gate rather than review vigilance.
2. **Thresholds are printed card fields enforced as plant limits** — tolerance, corridor width, box width, capacity — the exact `toleranceKm` / tank-cutoff precedent in `mission.ts`. They apply to every entry alike and are always visible on the card before entry.
3. **Corrections plan from the actual orbit.** Never a retry of the same numbers; the remaining problem is always smaller.
4. **Grade changes only the numeral form.** Regimes never gate by grade or curriculum; the only gate in the game is Δv aboard, and it prints as a fact line.
5. **Manifest and contract completion key to physical totals** (seconds, frames, m/s, kilograms, cells) — never sustained-performance judgments, never wall-clock streaks. Decay stays session-relative and capped.
6. **No percent anywhere in the UI layer, including register strings.** Extend the existing lint.
7. **The map is a camera move, not a scene.** One art pipeline; the limb law holds in every view.

## Build order

Small, independently shippable, dependencies stated. The first two PRs are pure refactors pinned by tests; nothing visible changes until PR3.

1. **encounter-core** — extract the `mission.ts` state machine into a generic Encounter contract (trigger, plan, commit, execute, measure) with apogee-raise re-expressed as the first encounter type. Behavior-identical, existing status lines pinned by tests. Includes the structural invariant test: no code path branches on the entry value.
2. **spectrum-measures** — generalize assess from the single tolerance check to a typed Measurement (distance, rate, offset, hours) with status-line formatters; apogee-raise migrates to printing a measurement against a printed tolerance field. Small, pure, headless; de-risks every later encounter type at once.
3. **drag + REBOOST** — atmospheric drag as a capped session-relative secular rate in the propagator; property tests assert monotone energy decay under drag and unchanged conservation with it off. Ships the first physics-respawning encounter.
4. **triaxiality + KEEPING** — same discipline, the Ring's weather and its encounter.
5. **offer queue** — the standing SITUATIONS register block with countdowns, and AGAIN as one keypress. Offers, never obligations.
6. **coverage-core** — sim-only, headless: ground-cell grid, footprint-from-orbit-state, contact-seconds integrator, the remainder rule. No footprint code exists anywhere today; this scopes it honestly before anything renders it.
7. **persistence** — the save layer (fleet, elements, registers, album, territory). Named early because session-relative content is meaningless without it; no save code exists in src today.
8. **regime map** — the pull-back camera register: hairline annuli, mono eyebrows, fleet beads, coverage cells (from PR6). Look-only, no new art pipeline.
9. **transfer travel** — the two-card Hohmann leg with the capability-fact gate line, dashed-to-solid conic, and mid-coast parking across sessions (needs PR7).
10. **TASKED PASS** — sites, request lines, revs-to-pass card, the always-returned frame, the album (needs PR6, PR7).
11. **THE CATCH** — phasing rendezvous, capture corridor as plant limit, salvage register, scavenged propellant. Heritage frames follow in a later pass.
12. **manifest + resupply** — launch deliveries against physical totals, hardware that regates regimes physically.

THE SLOT, DWELL, THE CROSSING, and CORRIDOR ENTRY follow on the same rails once the Shell and Long Swing stand up; each is an issue with its grade-band table already written above.

## Still open for Johnny

The four open questions in DIRECTION.md stand. This document resolves the map without the warm-paper light table (question 3) — the pull-back camera carries it — but the light table remains available as a possible secondary register later, and it remains Johnny's call, not the loop's.
