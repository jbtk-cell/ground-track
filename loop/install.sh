#!/bin/bash
# Installs the GROUND TRACK loop: three launchd agents running headless Claude
# Code sessions on a schedule. Run once, by a human, from any directory:
#
#   bash ~/ground-track/loop/install.sh
#
# The loop then operates unattended (while the Mac is awake and you are logged
# in). Pause everything: touch ~/ground-track-loop/PAUSED. Resume: remove it.
# Remove entirely: bash ~/ground-track/loop/uninstall.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM=$(id -u)
mkdir -p "$AGENTS_DIR" "$HOME/ground-track-loop/logs" "$HOME/ground-track-loop/wt"
chmod +x "$HERE"/builder.sh "$HERE"/reviewer.sh "$HERE"/ideas.sh

for name in builder reviewer ideas; do
  plist="com.groundtrack.$name.plist"
  cp "$HERE/launchd/$plist" "$AGENTS_DIR/$plist"
  plutil -lint "$AGENTS_DIR/$plist"
  # bootout is idempotent-ish: ignore "not loaded" on first install
  launchctl bootout "gui/$UID_NUM" "$AGENTS_DIR/$plist" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$AGENTS_DIR/$plist"
  echo "loaded com.groundtrack.$name"
done

echo
launchctl list | grep com.groundtrack || true
echo
echo "Installed. Schedule: builder even hours :17, reviewer odd hours :23,"
echo "ideas daily 15:53. Logs: ~/ground-track-loop/logs/"
echo
echo "Kicking off one builder run now so the loop starts immediately..."
launchctl kickstart "gui/$UID_NUM/com.groundtrack.builder"
echo "Watch it: tail -f ~/ground-track-loop/logs/builder.log"
