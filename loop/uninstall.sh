#!/bin/bash
# Removes the GROUND TRACK loop launchd agents. Leaves logs and the repo alone.
set -uo pipefail
UID_NUM=$(id -u)
for name in builder reviewer ideas; do
  plist="$HOME/Library/LaunchAgents/com.groundtrack.$name.plist"
  launchctl bootout "gui/$UID_NUM" "$plist" 2>/dev/null && echo "unloaded com.groundtrack.$name"
  rm -f "$plist"
done
echo "Loop uninstalled. Logs remain in ~/ground-track-loop/logs/."
