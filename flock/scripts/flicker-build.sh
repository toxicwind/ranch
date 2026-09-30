#!/usr/bin/env bash
# flock build entry: submit build+test to flicker, the estate build-job system.
#
# flock's real component is flock/proxy (the in-tree Rust crate "flock";
# bin/flock-run.sh execs its binary). Canonical per its CI
# (flock/proxy/.github/workflows/ci.yml, "Tests (unit + integration)"):
#   cargo build && cargo test
# The job runs in flock/proxy (WORKDIR_REL below).
#
# Usage: scripts/flicker-build.sh
# Env:   FLICKER_URL (default http://127.0.0.1:25148)
# Exit:  0 iff the flicker job succeeds (or an identical job already
#        succeeded: CACHED). 1 on failure/timeout.
set -euo pipefail
FLICKER_URL="${FLICKER_URL:-http://127.0.0.1:25148}"
NAME="flock-build"
BUILD_CMD="cargo build && cargo test"
WORKDIR_REL="proxy"
TIMEOUT=600
POLL=2

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKDIR="$(cd "$REPO/$WORKDIR_REL" && pwd)"
COMMAND="cd \"$WORKDIR\" && $BUILD_CMD"

payload="$(python3 - "$NAME" "$COMMAND" <<'PYEOF'
import json, sys
print(json.dumps({"name": sys.argv[1], "command": sys.argv[2]}))
PYEOF
)"
resp="$(curl -sS -m 30 -X POST "$FLICKER_URL/api/jobs" \
  -H 'Content-Type: application/json' -d "$payload")"
jid="$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
cached="$(printf '%s' "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("cached", False))')"
echo "submitted job id=$jid"
if [ "$cached" = "True" ]; then
  echo "CACHED (id $jid)"
  curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid/logs" | tail -n 10
  exit 0
fi
seen=0
deadline=$((SECONDS+TIMEOUT))
while :; do
  status="$(curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
  logs="$(curl -sS -m 30 "$FLICKER_URL/api/jobs/$jid/logs")"
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
