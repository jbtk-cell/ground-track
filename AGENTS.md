# GROUND TRACK - notes for coding agents

A satellite game. The flight computer solves the orbit, prints the whole
maneuver card, and stops one line short. The player types the last number.

Read [docs/DIRECTION.md](docs/DIRECTION.md) before touching anything visual. It
is binding, not advisory. [docs/LOOP.md](docs/LOOP.md) describes how the agent
loop is meant to run.

## Verify with this

```bash
npm run verify     # typecheck, lint, test, build
npm run shots      # render every camera preset to shots/current
npm run palette    # assert the art direction's colour rules against those PNGs
```

Do not report work as complete without running `npm run verify` and seeing it
pass. For anything that changes what is on screen, run `npm run shots` and
**look at the images** before claiming the change is good.

## Invariants - never break these

1. **The typed number is executed, never graded.** There is no correct/incorrect
   branch anywhere in this codebase. Typing 6 instead of 8 burns for six seconds
   and undershoots, through the identical code path as a right answer. A PR that
   introduces a validate-and-verdict path is rejected on sight. This is the
   difference between this game and a worksheet.

2. **`src/sim` is pure and engine-independent.** No three.js, no DOM, no clock,
   no randomness. It is enforced by an ESLint `no-restricted-imports` rule, not
   just by convention. Everything in it is testable headlessly.

3. **The renderer decides nothing.** `src/render` draws what the simulation
   already determined. If the canvas needs to know something, it comes from a
   simulation result, not from geometry recomputed at draw time.

4. **Real orbital mechanics only.** No invented units, no fake physics, no
   "thrust blocks". If a number appears on a maneuver card, the simulation is
   genuinely running it. The tests in `tests/orbit.test.ts` hold this: energy and
   angular momentum are conserved, the period obeys Kepler's third law, and a
   burn produces the apoapsis the card predicted.

## Art direction rules that are mechanically checked

`npm run palette` enforces these against rendered frames:

- There is no black anywhere. `VOID_SLATE` (`#101B26`) is the darkest value.

These are in DIRECTION.md and are not yet automated - hold them by hand, and
automating one is always a welcome change:

- **No bloom at any intensity.** No lens flare, no chromatic aberration, no
  emissive UI. This single rule is most of why the game does not read as sci-fi.
- **One accent.** `#D98A3C` appears on exactly two things: the primary action,
  and a live burn.
- **Earth's limb holds 30-40% of frame.** No shot is an object against black.
- **No red.** The only warm-negative is desaturated rust `#A8624B`, hairline.
- **No score, XP, percentage or star rating.** Coverage is expressed as geometry.
- **No multiple choice.** Typed digits into fixed-width cells.

## Layout

```
src/sim/      pure orbital mechanics - vec3, Kepler solver, elements, burns
src/render/   three.js - palette, noise, earth, atmosphere, starfield, scene
src/ui/       DOM wiring
scripts/      shots.mjs (visual baselines), palette-check.mjs (colour gate)
tests/        mirrors src/. Headless.
docs/         DIRECTION.md, PLATFORM.md, LOOP.md
```

## Style

No emoji anywhere, including commit messages. Comments explain why, not what.
Match the surrounding code.
