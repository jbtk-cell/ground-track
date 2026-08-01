# Shared preamble for GROUND TRACK loop jobs. Sourced by builder/reviewer/ideas.
# The loop runs headless Claude Code sessions on a launchd schedule. Everything
# here is deliberately boring: PATH, a pause switch, a lock, and one runner.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOOP="$HOME/ground-track-loop"
REPO="$HOME/ground-track"
GH_REPO=jbtk-cell/ground-track
mkdir -p "$LOOP/logs" "$LOOP/wt"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Pause switch: `touch ~/ground-track-loop/PAUSED` stops every job at its next
# fire time. Remove the file to resume. No other state to clean up.
if [ -f "$LOOP/PAUSED" ]; then
  log "PAUSED file present; exiting"
  exit 0
fi

# One instance per job. mkdir is atomic; flock(1) does not exist on macOS.
acquire_lock() {
  LOCKDIR="$LOOP/.lock-$1"
  if ! mkdir "$LOCKDIR" 2>/dev/null; then
    # A lock older than 3 hours means a run died without cleanup.
    if [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
      log "removing stale lock $LOCKDIR"
      rmdir "$LOCKDIR" 2>/dev/null || true
      mkdir "$LOCKDIR" 2>/dev/null || { log "lock contention; exiting"; exit 0; }
    else
      log "another instance is active; exiting"
      exit 0
    fi
  fi
  trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
}

# Sessions start in the repo so CLAUDE.md and AGENTS.md load. Worktrees live
# under $LOOP/wt (granted via --add-dir) so the main checkout is never edited.
# Tools are allowlisted; permissions are never disabled wholesale.
run_claude() { # $1 = model, $2 = prompt
  cd "$REPO" || exit 1
  claude -p "$2" --model "$1" \
    --add-dir "$LOOP/wt" \
    --allowedTools "Bash" "Edit" "Write" "Read" "Glob" "Grep" "WebFetch" "TodoWrite" "mcp__playwright__*" \
    2>&1
}
