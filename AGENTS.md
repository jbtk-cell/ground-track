# GROUND TRACK - notes for coding agents

A satellite game. The flight computer solves the orbit, prints the whole
maneuver card, and stops one line short. The player types the last number.

Read [docs/DIRECTION.md](docs/DIRECTION.md) before touching anything visual, and
[docs/STRUCTURE.md](docs/STRUCTURE.md) before touching gameplay. Both are
binding, not advisory. [docs/LOOP.md](docs/LOOP.md) describes how the agent
loop is meant to run.

## Verify with this

```bash
npm run verify     # typecheck, lint, test, build
npm run shots      # render every camera preset to shots/current
npm run gates      # run every gate in scripts/gates/ against those PNGs
npm run palette    # just the palette gate, when that is all you changed
npm run shots:diff # just the pixel-drift gate (comparison only runs in CI - see below)
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

5. **Thresholds are printed card fields enforced as plant limits** — tolerance,
   corridor width, box width, capacity — the `toleranceKm` / tank-cutoff
   precedent in `mission.ts`. They apply to every entry alike and are visible on
   the card before entry. A threshold the player never saw printed is a hidden
   verdict.

6. **Grade changes only the numeral form.** No area, encounter, or content gates
   by grade or curriculum. The only gate in the game is delta-v aboard, and it
   prints as a fact line (`TRANSFER DV 2 400 M/S · TANK 900 M/S`), never a lock.

7. **Completion keys to physical totals** (seconds, frames, m/s, kilograms,
   cells) — never sustained-performance judgments, never wall-clock streaks.
   No percent anywhere in the UI layer, including register strings.

## Art direction rules that are mechanically checked

Every `.mjs` file in `scripts/gates/` is a gate. CI runs the whole directory
via `npm run gates`, so **adding a gate is adding a file** - no CI config
change, which means the loop can strengthen its own taste checks. A gate takes
no arguments, reads what it needs (rendered frames are in `shots/current`),
prints its findings, and exits non-zero to fail.

Gates in place today:

- `palette` - there is no black anywhere; `VOID_SLATE` (`#101B26`) is the
  darkest value. Also: no red anywhere except the sanctioned warm tokens
  (`CAUTION_RUST`, `ACCENT`, `FOIL`, `SETTLEMENT`, and the dawn/earthshine
  tones) - a hue/saturation/value scan flags pixels in the red band, excluding
  any within colour distance of a sanctioned token.
- `shots-diff` - every preset in `shots/current` must stay within pixel-drift
  tolerance of the committed `shots/baseline`; a missing or an unexpected
  extra preset always fails, in any environment. The byte-level pixel
  comparison itself only runs when `CI` is set: GitHub Actions' `ubuntu-latest`
  runner renders with software-rasterised Chromium, and a developer's own
  machine renders with real GPU antialiasing that disagrees with the
  CI-rendered baseline by about 1% on every preset even with nothing changed.
  **CI is the sole authoritative environment for this gate.** Outside CI,
  `npm run gates` / `npm run shots:diff` print an advisory and skip the pixel
  comparison, so a clean local tree stays green and nothing tempts a
  re-baseline off local rendering. Force the real comparison locally with
  `CI=1 npm run shots:diff` - useful to confirm a change actually moves pixels,
  or to reproduce a CI failure (below).
  - **Moving a baseline deliberately:** push the source change first, without
    touching `shots/baseline`. Once CI's `visual` job runs, download that run's
    `shots` artifact (`gh run download <run-id> -n shots`) - it holds
    `shots/current` exactly as CI rendered it - copy those PNGs into
    `shots/baseline`, commit, push, and explain the change in the PR body.
    That download-and-copy is the only sanctioned way to move a baseline;
    running `npm run shots -- --baseline` on your own machine captures your
    machine's rendering, not CI's, and reintroduces the mismatch.
  - **Reproducing a CI failure's diff images:** they are not uploaded as a CI
    artifact. Download the failing run's `shots` artifact into `shots/current`
    and run `CI=1 npm run shots:diff` locally - the comparison is pure byte
    math with no rendering involved, so it reproduces CI's verdict exactly and
    writes the same images to `shots/diff`.
- `accent` - `#D98A3C` appears in source only at its three canonical
  definition sites (`src/render/palette.ts`, `src/style.css`,
  `src/ui/pad.css`), scanned by literal hex; and in rendered frames only on
  the live burn (`mission-burn`'s burn mark and plume), scanned by colour
  distance, with every other preset held to antialiasing-level noise.

Deleting or loosening an existing gate is not ordinary work: it needs an issue
that asks for it and a PR body that says why, and the reviewer rejects it
otherwise.

Also mechanically checked, though not a `scripts/gates/` file:

- **No bloom at any intensity.** `eslint.config.js`'s `no-restricted-imports`
  rejects any import of `three/examples/jsm/postprocessing/*`,
  `three/addons/postprocessing/*`, a `*Bloom*` shader module, or the pmndrs
  `postprocessing` package anywhere under `src/`. Checked by `npm run verify`
  (lint), not by `npm run gates` - there is no rendered-frame gate for this.

These rules are in DIRECTION.md and are not yet automated - hold them by hand,
and turning one into a gate is always welcome work:

- **Earth's limb holds 30-40% of frame.** No shot is an object against black.
- **No score, XP, percentage or star rating.** Coverage is expressed as geometry.
- **No multiple choice.** Typed digits into fixed-width cells.

## Layout

```
src/sim/      pure orbital mechanics - vec3, Kepler solver, elements, burns
              (burn.ts), formatting (format.ts), card planning (plan.ts),
              the mission state machine (mission.ts), shared types (types.ts)
src/render/   three.js - palette, noise, earth, atmosphere, starfield, scene,
              units mapping (units.ts), orbit traces (orbitTrace.ts),
              satellite.ts, targetRing.ts
src/ui/       DOM wiring - the PAD (pad.ts) and the app loop (app.ts, which
              owns all mutable session state and the wall-to-sim pacing)
scripts/      shots.mjs (visual baselines), gates.mjs (runs scripts/gates/*)
scripts/gates/  one file per mechanically checked art-direction rule
scripts/lib/  shared helpers for gate scripts (png.mjs - PNG decode/encode)
tests/        mirrors src/. Headless.
docs/         DIRECTION.md, STRUCTURE.md, PLATFORM.md, LOOP.md
```

## Mission hooks

The page exposes `window.groundTrack` for the shot harness and verifiers:

- `presets` / `setPreset(name)` - the four landing framings plus four
  deterministic mission states (`mission-card`, `mission-ghost`,
  `mission-burn`, `mission-complete`), each rebuilt by advancing a fresh
  mission in fixed steps, never taken from the live session.
- `setPaused(bool)`, `setTime(seconds)` - freeze and pin the planet clock.
- `mission.state()` / `mission.type(digits)` / `mission.commit()` /
  `mission.warp(mult)` - drive the live session headlessly.

## Style

No emoji anywhere, including commit messages. Comments explain why, not what.
Match the surrounding code.
