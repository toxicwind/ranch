#!/usr/bin/env bash
# barn build entry — submits the barn build+test to the flicker/brand build daemon.
#
# barn is a pen of utilities; the build runs each component's canonical check:
#   gatehouse    go build ./...                      (Go, canonical)
#   secretsmith  python -m unittest discover -s tests (12 tests; /usr/bin/python3 has the cryptography dep)
#   gemini-mcp   py_compile server.py
#   lookout      tomllib parse of pitchfork.fragment.toml
#   chute        node --check chute.mjs
# browserless is excluded: needs npm install + a live server (own lane).
set -euo pipefail
CLI=""; for c in flicker brand; do if command -v "$c" >/dev/null 2>&1; then CLI="$c"; break; fi; done
[ -n "$CLI" ] || CLI="/home/toxic/estate/projects/range/ranch/branding/brand"
export BRAND_ROOT="${BRAND_ROOT:-/home/toxic/brand}"; export BRAND_PORT="${BRAND_PORT:-25148}"
NAME="barn-build"; REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_CMD='set -euo pipefail
cd gatehouse && go build ./... && cd ..
cd secretsmith && /usr/bin/python3 -m unittest discover -s tests && cd ..
/usr/bin/python3 -m py_compile gemini-mcp/server.py
/usr/bin/python3 -c "import tomllib; tomllib.load(open(\"lookout/pitchfork.fragment.toml\",\"rb\"))"
node --check chute/chute.mjs
echo "barn build OK"'
out="$("$CLI" submit --name "$NAME" --repo "$REPO" --toolchain go --cmd "$BUILD_CMD" 2>&1)"; printf '%s\n' "$out"
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
