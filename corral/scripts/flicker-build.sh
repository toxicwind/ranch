#!/usr/bin/env bash
# corral build entry — corral is an empty stub directory (no code, no docs,
# no config yet). There is nothing to compile or test, so the build is a
# no-op that guards the assumption: if files ever land here, this job FAILS
# loudly so the wiring gets revisited with a real build command.
set -euo pipefail
CLI=""; for c in flicker brand; do if command -v "$c" >/dev/null 2>&1; then CLI="$c"; break; fi; done
[ -n "$CLI" ] || CLI="/home/toxic/estate/projects/range/ranch/branding/brand"
export BRAND_ROOT="${BRAND_ROOT:-/home/toxic/brand}"; export BRAND_PORT="${BRAND_PORT:-25148}"
NAME="corral-build"; REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_CMD='set -euo pipefail
if [ -n "$(ls -A .)" ]; then echo "corral: unexpected files present - wiring needs a real build:"; ls -A .; exit 1; fi
echo "corral: empty stub component - nothing to build (wired as no-op)"'
out="$("$CLI" submit --name "$NAME" --repo "$REPO" --toolchain python3 --cmd "$BUILD_CMD" 2>&1)"; printf '%s\n' "$out"
jid="$(printf '%s\n' "$out" | sed -n 's/^QUEUED  \([A-Za-z0-9-]*\)  .*/\1/p' | head -1)"
[ -n "$jid" ] || jid="$(printf '%s\n' "$out" | sed -n 's/^CACHED  identical job already succeeded as \([A-Za-z0-9-]*\)/\1/p' | head -1)"
[ -n "$jid" ] || { echo "submit failed" >&2; exit 1; }
if printf '%s\n' "$out" | grep -q '^CACHED'; then echo "CACHED $jid"; "$CLI" logs "$jid" 2>/dev/null | tail -n 5; exit 0; fi
tail -F "$BRAND_ROOT/logs/$jid.log" 2>/dev/null & tailpid=$!; trap "kill $tailpid 2>/dev/null" EXIT
deadline=$((SECONDS+1800))
while :; do
  st="$("$CLI" status "$jid" 2>/dev/null | sed -n 's/^ *status: \([a-z-]*\).*/\1/p' | head -1)"
  case "$st" in succeeded) echo "SUCCEEDED $jid"; exit 0;; failed) echo "FAILED $jid" >&2; exit 1;; esac
  [ "$SECONDS" -ge "$deadline" ] && { echo "timeout" >&2; exit 1; }
  sleep 3
done
