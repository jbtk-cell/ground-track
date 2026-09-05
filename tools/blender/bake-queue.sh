#!/bin/bash
# The Deck One bake queue: every room that needs a full-quality bake, one
# Blender process at a time (parallel bakes have been killed by memory
# pressure on this machine before). Logs one line per room to stdout.
#
#   bash tools/blender/bake-queue.sh /path/to/logdir
set -u
LOGDIR="${1:-/tmp}"
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
HERE="$(cd "$(dirname "$0")" && pwd)"

run() { # run <label> <samples> <script> [room]
  local label="$1" samples="$2" script="$3" room="${4:-}"
  local t0=$(date +%s)
  if [ -n "$room" ]; then
    GT_ROOM="$room" GT_BAKE_SAMPLES="$samples" "$BLENDER" --background --python "$HERE/$script" \
      > "$LOGDIR/bake-$label.log" 2>&1
  else
    GT_BAKE_SAMPLES="$samples" "$BLENDER" --background --python "$HERE/$script" \
      > "$LOGDIR/bake-$label.log" 2>&1
  fi
  local rc=$?
  local dt=$(( $(date +%s) - t0 ))
  local clip=$(grep -o "clipped above LIGHT_RANGE: [0-9.]*%" "$LOGDIR/bake-$label.log" | tail -1)
  if [ $rc -eq 0 ] && grep -q "wrote" "$LOGDIR/bake-$label.log"; then
    echo "OK   $label  ${dt}s  $clip"
  else
    echo "FAIL $label  ${dt}s  (see bake-$label.log)"
  fi
}

# The four bespoke rooms that grew doorways, and the warm limb deck.
run spine 1024 build_spine.py
run crown 1024 build_crown.py
run berth 1024 build_berth.py
run crawl 1024 build_crawl.py
run limbdeck 1024 build_limbdeck.py

# Deck One's forty-one generated rooms. Setpieces and 2048-atlas rooms get
# the full 1024 samples; the rest run at 768, which with adaptive sampling
# and denoise is indistinguishable at their scale.
for stem in gen-mess gen-hold gen-engine gen-garden gen-assembly; do
  run "$stem" 1024 build_generated.py "$stem"
done
for stem in gen-tee gen-galley gen-walk gen-cabins gen-bunks gen-ward gen-head \
  gen-lockers gen-return gen-chase gen-shop gen-pumps gen-filter gen-switch \
  gen-link gen-elbow gen-servers gen-comms gen-furnace gen-belt gen-drystores \
  gen-void gen-crib gen-bond gen-coldstore gen-holds gen-spur gen-lab \
  gen-annex gen-archive gen-charts gen-shortcut gen-scope gen-cache \
  gen-keela gen-keelb; do
  run "$stem" 768 build_generated.py "$stem"
done

echo "QUEUE DONE"
