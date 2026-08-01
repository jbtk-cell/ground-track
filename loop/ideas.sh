#!/bin/bash
# GROUND TRACK loop: ideas/critic. Plays the game, keeps the backlog stocked.
# Scheduled daily at 15:53 via launchd. See loop/install.sh.
source "$(dirname "$0")/common.sh"
exec >> "$LOOP/logs/ideas.log" 2>&1
acquire_lock ideas
log "ideas run starting"

# Skip when the backlog is stocked: 8+ unclaimed auto issues means no new ideas.
backlog=$(gh issue list --repo "$GH_REPO" --state open --json number,labels 2>/dev/null | jq '[.[]
  | select([.labels[].name] | (contains(["auto:idea"]) or contains(["auto:bug"])))
  | select([.labels[].name] | contains(["auto:building"]) | not)
  ] | length')
if [ "${backlog:-0}" -ge 8 ]; then
  log "backlog stocked ($backlog unclaimed issues); exiting"
  exit 0
fi

read -r -d '' PROMPT <<'PROMPT_EOF' || true
You are the IDEAS/CRITIC job in the GROUND TRACK autonomous loop, running
unattended once a day. Your job: play the game the way a nine-year-old would,
then file the small number of issues most worth building next.

Repo: ~/ground-track (github jbtk-cell/ground-track). Binding docs: AGENTS.md,
docs/DIRECTION.md, docs/STRUCTURE.md (the build order at its end is the roadmap
- new ideas should serve it, not compete with it), docs/LOOP.md.

PROCEDURE
1. git -C ~/ground-track pull --ff-only. Build and serve the current main
   (npm ci if needed, npm run build, npm run preview), or use the live site at
   https://jbtk-cell.github.io/ground-track if the local build fails.
2. PLAY, with the playwright MCP tools, for a genuine stretch: complete a card
   correctly; type a wrong answer and watch what actually happens; type the
   maximum; type nothing and walk away; mash keys during a burn; resize small.
   Read the register lines. Take screenshots and READ them.
3. FILE at most 3 issues total:
   - auto:bug for anything broken or invariant-violating you actually observed,
     with exact reproduction steps and what you saw instead.
   - auto:idea only for the increment that most serves docs/STRUCTURE.md's
     build order from where main currently stands. Every idea issue needs
     concrete "Done when" lines a builder can meet without asking questions.
4. NEVER file: aesthetic origination (new palettes, new art registers, new
   typefaces - needs:human territory per LOOP.md); anything touching loop/ or
   .github/; grand redesigns; anything already covered by an open issue - read
   the existing list first and dedupe hard.
5. If the game plays clean and the backlog covers the road ahead, file nothing
   and say so. Zero issues is a valid, good outcome.
PROMPT_EOF

log "invoking ideas agent (backlog: $backlog)"
run_claude sonnet "$PROMPT"
rc=$?
log "ideas run finished (exit $rc)"
