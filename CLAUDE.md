# GROUND TRACK - project instructions

Read AGENTS.md first; its invariants are binding. docs/DIRECTION.md governs how
the game looks and speaks in orbit, docs/INTERIORS.md governs how rebuilt
rooms look indoors, docs/STRUCTURE.md governs the shape of play, docs/LOOP.md
governs how the autonomous loop runs. All are binding, not advisory.

## The autonomous loop

This repo is worked by scheduled unattended agents (see loop/). The repo owner
(Johnny, github jbtk-cell) has durably authorized the loop:

- The BUILDER job may claim auto-labeled issues, build them in worktrees, and
  open PRs. It never merges and never pushes to main.
- The REVIEWER job is the merge authority: it may approve and squash-merge
  auto-labeled PRs into main after all four gates in docs/LOOP.md pass (CI,
  adversarial diff, browser run, visual review). This authorization is standing
  and explicit; a reviewer session that has verified all four gates should
  merge without asking.
- No loop job ever modifies loop/ or .github/ - changes to the loop's own
  harness or gates are labeled needs:human and left for Johnny.
- needs:human issues are questions for Johnny only. Agents never resolve them.

## Non-negotiables (short form - AGENTS.md has the full list)

- The typed number is executed, never graded. No correct/incorrect branch.
- No score, XP, percent, or star anywhere, including register strings.
- No red anywhere; pure black (0,0,0) never appears anywhere. In orbit,
  VOID_SLATE #101B26 is the darkest value and there is no bloom. Indoors,
  rebuilt rooms follow docs/INTERIORS.md (owner decision 2026-08-31):
  near-black to luma 5 and authored glow allowed, postprocessing still banned.
- src/sim stays pure: no three.js, DOM, clock, or randomness.
- No emoji anywhere, including commit messages.
- Verify with npm run verify; anything visual also needs npm run shots plus
  actually reading the images, and npm run palette.
