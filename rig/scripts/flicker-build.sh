#!/usr/bin/env bash
# rig build entry: submit build+test to flicker, the estate build-job system.
#
# Canonical maintainer commands (rig/CONTRIBUTING.md, rig/CLAUDE.md):
#   cargo build --workspace && cargo test --workspace   # 1744+ tests
#
# Usage: scripts/flicker-build.sh
# Env:   FLICKER_URL (default http://127.0.0.1:25148)
# Exit:  0 iff the flicker job succeeds (or an identical job already
#        succeeded: CACHED). 1 on failure/timeout.
# Job submission retries transient flicker 5xx/connection errors with
# backoff; polling tolerates transient flicker errors until the timeout.
set -euo pipefail
FLICKER_URL="${FLICKER_URL:-http://127.0.0.1:25148}"
NAME="rig-build"
BUILD_CMD="cargo build --workspace && cargo test --workspace"
WORKDIR_REL="."
TIMEOUT=600
POLL=2
SUBMIT_ATTEMPTS=5

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(cd "$REPO/$WORKDIR_REL" && pwd)"
COMMAND="cd \"$WORKDIR\" && $BUILD_CMD"

payload="$(python3 - "$NAME" "$COMMAND" <<'PYEOF'
import json, sys
print(json.dumps({"name": sys.argv[1], "command": sys.argv[2]}))
PYEOF
)"
resp_file="$(mktemp)"
attempt=1; delay=2
while :; do
  code="$(curl -sS -m 30 -o "$resp_file" -w '%{http_code}' -X POST \
    "$FLICKER_URL/api/jobs" -H 'Content-Type: application/json' \
    -d "$payload" 2>/dev/null || true)"
  # curl -w prints 000 itself when the connection fails
  resp="$(cat "$resp_file")"
  jid="$(printf '%s' "$resp" | python3 -c \
    'import json,sys
try: print(json.load(sys.stdin).get("id",""))
except Exception: print("")')"
  if [ "$code" = "200" ] && [ -n "$jid" ]; then break; fi
  retryable=true
  case "$code" in 4*) retryable=false;; esac
  if [ "$retryable" = false ] || [ "$attempt" -ge "$SUBMIT_ATTEMPTS" ]; then
    echo "submit failed (HTTP $code): $(printf '%s' "$resp" | head -c 300)" >&2
    rm -f "$resp_file"; exit 1
  fi
  echo "submit attempt $attempt failed (HTTP $code); retrying in ${delay}s" >&2
  sleep "$delay"; delay=$((delay*2)); attempt=$((attempt+1))
done
rm -f "$resp_file"
cached="$(printf '%s' "$resp" | python3 -c \
  'import json,sys
try: print(json.load(sys.stdin).get("cached", False))
except Exception: print(False)')"
echo "submitted job id=$jid"
if [ "$cached" = "True" ]; then
  echo "CACHED (id $jid)"
  curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid/logs" 2>/dev/null | tail -n 10 || true
  exit 0
fi
seen=0
deadline=$((SECONDS+TIMEOUT))
while :; do
  if ! job="$(curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid" 2>/dev/null)"; then
    echo "(transient flicker error; continuing)"
    status=""
  else
    status="$(printf '%s' "$job" | python3 -c \
      'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: print("")')"
  fi
  logs="$(curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid/logs" 2>/dev/null || true)"
  n=${#logs}
  [ "$n" -lt "$seen" ] && seen=0
  if [ "$n" -gt "$seen" ]; then printf '%s' "${logs:$seen}"; seen=$n; fi
  case "$status" in
    success) printf '\nSUCCEEDED (id %s)\n' "$jid"; exit 0;;
    failure) printf '\nFAILED (id %s)\n' "$jid" >&2; exit 1;;
  esac
  if [ "$SECONDS" -ge "$deadline" ]; then
    printf '\ntimeout waiting for job %s (last status %s)\n' "$jid" "$status" >&2
    exit 1
  fi
  sleep "$POLL"
done
