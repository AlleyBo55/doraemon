#!/usr/bin/env bash
# Watches the gateway logs and creds file for the once-per-hour refresh event.
# Print the surrounding lines + token state every time we see a refresh-related
# message, so we can see exactly what happened.

set -u

LOG=$HOME/.openclaw/logs/kiro-gateway.log
ERR=$HOME/.openclaw/logs/kiro-gateway.err.log
CRED=$HOME/.aws/sso/cache/kiro-auth-token.json

echo "watching $LOG and $ERR"
echo "press ctrl-c to stop"
echo

# tail both logs, prefixing each line with a label
( tail -F "$LOG" 2>/dev/null | sed -u 's/^/[stdout] /' &
  tail -F "$ERR" 2>/dev/null | sed -u 's/^/[stderr] /' &
  wait
) | while read -r line; do
  echo "$(date '+%H:%M:%S')  $line"
  case "$line" in
    *refresh*|*401*|*"auth-fail"*|*"degrading gracefully"*|*"fresher creds"*)
      # show how far the on-disk token is from expiring right now
      if [ -f "$CRED" ]; then
        EXP=$(python3 -c "import json,datetime; c=json.load(open('$CRED')); now=datetime.datetime.now(datetime.timezone.utc); exp=datetime.datetime.fromisoformat(c['expiresAt'].replace('Z','+00:00')); print(f'    token expires in {(exp-now).total_seconds():.0f}s')" 2>/dev/null)
        [ -n "$EXP" ] && echo "$EXP"
      fi
      ;;
  esac
done
