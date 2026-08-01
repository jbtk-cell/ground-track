<!--
Loop-engineering design for GROUND TRACK, drafted 2026-07-31.
Descends from the Quiet Vector dev-loop contract (AUTOMATION.md in that repo) and the
Fantasy Realm agent prompts. This file records only what should differ and why.
-->

# Loop design

## What carries over unchanged

The Quiet Vector contract is sound and most of it transfers verbatim:

- **GitHub issues + labels + PRs as the queue, never files.** This is the single best
  decision in the existing setup. It survives multiple machines with no git races.
- **Labels as the claiming substrate**: `auto`, `auto:idea`, `auto:bug`, `auto:building`,
  `auto:reviewing`, `auto:blocked`.
- **WIP caps** as runaway guards. Build stops above N open PRs; ideate stops above N open
  ideas; review gives up after N fix cycles and escalates.
- **Bugs before ideas.**
- **Independence by topology** - the reviewer is a different model on a different machine
  than the builder, which is what makes a self-administered merge gate trustworthy.
- **Branch discipline**: never commit to main, never force-push, one issue per branch,
  small scoped diffs, and a do-not-touch list covering CI config and the loop's own files.

## What must change, and why

### 1. Do not start the loop until milestone 1 exists

Agent loops are good at extending, refining and defending a thing that already has a
defined character. They are bad at originating one. Quiet Vector's loop worked because it
improved a game that already looked like something.

GROUND TRACK starts from nothing, and its entire premise is an aesthetic claim - "Quiet
Vector, but in orbit." That claim has to be established by hand, with Johnny judging,
before any loop can protect it.

**Trigger to start the loop:** milestone 1 renders, and baseline screenshots are committed.
Not before.

### 2. Add a visual gate as a fourth green light

This is the biggest change. Quiet Vector's reviewer could ask "does it fly without a
pageerror." That question has a mechanical answer. GROUND TRACK's central question is "does
it look right," which does not.

So the merge gate becomes **four** conditions, not three:

1. CI green (`npm run verify`).
2. Adversarial diff review clean.
3. Browser run clean - no pageerror, no WebGL fallback, expected mounts.
4. **Visual review passed.** `npm run shots` drives the app to a fixed set of canonical
   camera and simulation states and writes PNGs. The reviewing agent **reads the images**
   and judges them against ART-DIRECTION rules. Any pixel drift from the committed
   baselines must be intentional and explained in the PR body; unexplained drift blocks.

Committed baseline screenshots are what stop slow aesthetic decay over hundreds of
iterations. Without them, a visual project running an agent loop degrades invisibly.

### 3. Turn taste into lint wherever it is mechanically checkable

Several rules in DIRECTION.md are not judgment calls - they are assertions about the code,
and a linter can hold them far more reliably than a reviewer's attention across hundreds of
PRs:

- No bloom at any intensity. Ban the import; fail the build if a bloom/glow pass appears.
- Exactly one accent colour (`#D98A3C`), permitted only on the primary action and the live
  burn. Enforce a palette allowlist - fail on any colour literal outside the token set.
- No pure black anywhere. Darkest permitted value is `#101B26`.
- No red. The only warm-negative is desaturated rust `#A8624B`, hairline only.
- No score, XP, percentage or star rating in the UI layer.
- No multiple choice - answers are typed digits into fixed-width cells.

What genuinely needs human-or-agent judgment is then a much shorter list: framing, lighting
quality, motion feel.

### 4. Give the loop hard ground truth on the physics

Orbital mechanics is a rare gift for an agent loop: it has conservation laws, so the hardest
code in the project can be verified mechanically rather than by opinion. Property tests
should assert:

- Specific orbital energy is conserved along a coasting trajectory.
- Specific angular momentum is conserved along a coasting trajectory.
- Period matches Kepler's third law for the semi-major axis.
- Round-tripping through Kepler's equation recovers the input anomaly.
- A burn of duration `t` produces the apoapsis the maneuver card predicted, within tolerance.

That last one is the important one: it verifies that the number the child types and the
number the world obeys are the same number. That is the game's entire premise, under test.

### 5. Repurpose the playtest loop into a critic loop

Quiet Vector's playtest loop flew the plane and filed bugs. The equivalent question here -
"is the propellant pressure right for an eight-year-old" - is **not answerable by an agent**,
and pretending otherwise produces confident noise.

Replace it with a critic loop that does what agents can actually do well:

- **Drift check** - screenshots against the ART-DIRECTION rules above.
- **Invariant check** - the physics properties, plus the architectural invariants.
- **Completeness pass** - what in SCOPE.md is unbuilt, unverified, or silently dropped.

And add an explicit escalation lane: a **`needs:human`** label for anything requiring taste,
fun, or real children. The loop files these and leaves them alone. It never decides them.

### 6. Hold ideation nearly off at the start

The backlog is already written - SCOPE.md and DIRECTION.md contain more well-specified work
than the loop can consume for weeks. Ideas are the last thing this project needs early, and
an always-on ideate loop will produce feature accretion, which is the documented failure mode
of long-running loops.

Ideation runs **only** when the curated backlog drops below a threshold. When it does run,
DIRECTION.md's "what we are deliberately not doing" section is binding on it specifically -
that list exists to be enforced against exactly this agent.

### 7. Model assignment

Assign by task shape, and treat model heterogeneity as a feature - different models fail
differently, which is why an independent reviewer catches things.

- **Claude**: renderer work, anything art-direction sensitive, the review gate, the critic.
- **Codex**: mechanical and well-specified work - tests, refactors, wiring, content and data
  entry, boilerplate.

### 8. Start at two terminals, not four

Milestone 1 is a handful of files. Four loops contending over that surface area produces
merge conflicts and thrash, not throughput. Start with one builder and one reviewer; add the
critic when there is enough surface to critique, and ideation last.

## Project invariants the loop must never break

These belong in AGENTS.md / CLAUDE.md at the repo root, where every agent reads them:

1. **The typed number is executed, never graded.** There is no correct/incorrect branch.
   Typing 6 instead of 8 burns for six seconds and undershoots, through the identical code
   path as a right answer. Any PR introducing a validation-and-verdict path is rejected on
   sight.
2. **The simulation core is pure and engine-independent.** Orbital mechanics, maneuver-card
   generation and progression have no rendering, DOM, clock or randomness dependencies, and
   are fully testable headlessly.
3. **The renderer decides nothing.** It draws what the simulation already determined.
4. **Real orbital mechanics only.** No invented units, no fake physics, no "thrust blocks."
   If a number appears on a maneuver card, the simulation is genuinely running it.

## Operations: how the loop actually runs

Implemented 2026-08-01. Three launchd agents run headless Claude Code sessions
(`claude -p`) on a schedule, entirely on Johnny's machine, using his existing
`gh` and `claude` auth. Install once with `bash loop/install.sh`; pause with
`touch ~/ground-track-loop/PAUSED`; resume by removing that file; remove
entirely with `bash loop/uninstall.sh`.

| Job      | Script             | Model  | Schedule          | Role                                                        |
| -------- | ------------------ | ------ | ----------------- | ----------------------------------------------------------- |
| builder  | `loop/builder.sh`  | sonnet | even hours at :17 | fix requested changes, else claim one issue, build, open PR |
| reviewer | `loop/reviewer.sh` | opus   | odd hours at :23  | four-gate review; merge authority; steward of stale claims  |
| ideas    | `loop/ideas.sh`    | sonnet | daily 15:53       | plays the game, files at most 3 issues, dedupes hard        |

Mechanics worth knowing:

- **Cheap idling.** Each script pre-checks the queue with `gh` + `jq` and exits
  without spending tokens when there is no work. An idle loop costs nothing.
- **Claiming and caps** are as designed above: `auto:building` claims an issue,
  builder stops at 2 open auto PRs, reviewer merges at most 2 PRs per run,
  ideas stops at 8 unclaimed backlog issues.
- **Worktrees, never the checkout.** Jobs build in worktrees under
  `~/ground-track-loop/wt/`; the main checkout only ever moves by
  `git pull --ff-only` after a merge.
- **The loop cannot rewrite itself.** No job touches `loop/` or `.github/`;
  such changes are labeled `needs:human`. The harness and the gates change only
  by Johnny's hand.
- **Merge authority.** The reviewer merges with Johnny's standing authorization
  (recorded in CLAUDE.md), using his `gh` token, so merges to main trigger CI
  and the Pages deploy exactly as a human merge would.
- **Escalation.** Blocked issues get `auto:blocked` with a reason; loop-harness
  changes and questions get `needs:human`; a PR bounced three times gets
  `needs:human`. The loop runs while the Mac is awake and the user is logged
  in; fire times missed during sleep coalesce to one run on wake.
