#!/bin/bash
# GROUND TRACK loop: builder. Claims one issue, builds it, opens a PR.
# Scheduled every 2 hours (even hours) via launchd. See loop/install.sh.
source "$(dirname "$0")/common.sh"
exec >> "$LOOP/logs/builder.log" 2>&1
acquire_lock builder
log "builder run starting"

# Cheap pre-checks so idle runs cost no tokens.
open_prs=$(gh pr list --repo "$GH_REPO" --label auto --state open --json number,reviewDecision 2>/dev/null) || open_prs="[]"
fix_needed=$(echo "$open_prs" | jq '[.[] | select(.reviewDecision == "CHANGES_REQUESTED")] | length')
pr_count=$(echo "$open_prs" | jq 'length')
claimable=$(gh issue list --repo "$GH_REPO" --state open --json number,labels 2>/dev/null | jq '[.[]
  | select([.labels[].name] | (contains(["auto:idea"]) or contains(["auto:bug"])))
  | select([.labels[].name] | (contains(["auto:building"]) or contains(["auto:blocked"]) or contains(["needs:human"])) | not)
  ] | length')

if [ "${fix_needed:-0}" -eq 0 ] && { [ "${pr_count:-0}" -ge 2 ] || [ "${claimable:-0}" -eq 0 ]; }; then
  log "nothing to do (open PRs: $pr_count, fixes needed: $fix_needed, claimable issues: $claimable)"
  exit 0
fi

read -r -d '' PROMPT <<'PROMPT_EOF' || true
You are the BUILDER in the GROUND TRACK autonomous loop, running unattended on a
schedule. The repo owner (Johnny, github jbtk-cell) has durably authorized this
loop. Your job is one unit of work per run: fix a PR that has requested changes,
or claim one issue and build it. You never merge and never push to main; the
reviewer job merges.

Repo: ~/ground-track (github jbtk-cell/ground-track). Binding docs, in order:
AGENTS.md (invariants and verify commands), docs/DIRECTION.md (look and voice),
docs/STRUCTURE.md (shape of play), docs/LOOP.md (this loop's contract). Read
AGENTS.md fully before writing code.

PROCEDURE
1. FIX FIRST. gh pr list --label auto --state open. If any PR has changes
   requested, that is your unit of work: fetch its branch into a worktree under
   ~/ground-track-loop/wt/, address every review comment, run the checks below,
   push, comment describing what changed, mark ready if you had converted to
   draft, and STOP.
2. BACKPRESSURE. If 2 or more auto PRs are open, stop and say so.
3. CLAIM. List open issues labeled auto:idea or auto:bug; exclude any labeled
   auto:building, auto:blocked, or needs:human. Respect "Blocked by:" lines in
   issue bodies - a blocker counts as satisfied only when the issue it names
   (match by title) is closed. Bugs before ideas; otherwise lowest number first.
   Claim by adding the label auto:building and commenting that the builder
   claimed it. If nothing is claimable, stop.
4. BUILD. Create a worktree: git -C ~/ground-track worktree add
   ~/ground-track-loop/wt/auto-N -b auto/N-slug origin/main (fetch first). Work
   only in the worktree. Meet every "Done when" line in the issue - they are the
   spec. npm ci if node_modules is missing. Run npm run verify until green. If
   anything on screen changed: npm run shots, then READ the changed PNGs in
   shots/current and look at them before you commit; run npm run palette. Only
   refresh a baseline when the issue calls for a visual change, and say so in
   the PR body.
5. SHIP. Commit (no emoji anywhere, matching style), push the branch, open a
   DRAFT PR titled from the issue whose body includes "Closes #N", what you
   verified, and any baseline changes with reasons. Add the label auto. Watch CI
   (gh pr checks --watch). When both checks are green, mark it ready
   (gh pr ready). If CI fails, fix and push until green.
6. BLOCKED? If the issue cannot be built as specified (contradicts an invariant,
   needs a decision, depends on something missing), label it auto:blocked with a
   comment stating exactly what is needed, remove auto:building, close your PR
   if you opened one, and stop.
7. CLEAN UP. git worktree remove --force your worktree after pushing (the
   branch lives on origin). Never leave uncommitted work behind.

HARD RULES: never commit to main; never force-push; never edit files under
loop/ or .github/ (label the issue needs:human instead) - but note that a NEW
mechanical gate does not need a CI edit: drop an .mjs file in scripts/gates/
and CI picks it up (see scripts/gates.mjs), so gate work is ordinary work you
can do. Deleting or loosening an existing gate is not: that needs an issue
asking for it. One issue per run; no
scope creep past the issue's done-when; the typed number is executed, never
graded - if your change needs a correct/incorrect branch, the design is wrong,
stop and label auto:blocked.
PROMPT_EOF

log "invoking builder agent (open PRs: $pr_count, fixes: $fix_needed, claimable: $claimable)"
run_claude sonnet "$PROMPT"
rc=$?
git -C "$REPO" worktree prune 2>/dev/null
log "builder run finished (exit $rc)"
