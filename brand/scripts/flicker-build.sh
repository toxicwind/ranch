#!/usr/bin/env bash
# brand build entry — Hooksmith's git-hooks component.
# No compiled artifacts: the build is (1) shell syntax check on the three
# scripts, (2) a behavioral smoke test — install into a scratch git repo,
# prove a real-shaped secret commit is BLOCKED and a clean commit passes.
set -euo pipefail
CLI=""; for c in flicker brand; do if command -v "$c" >/dev/null 2>&1; then CLI="$c"; break; fi; done
[ -n "$CLI" ] || CLI="/home/toxic/estate/projects/range/ranch/branding/brand"
export BRAND_ROOT="${BRAND_ROOT:-/home/toxic/brand}"; export BRAND_PORT="${BRAND_PORT:-25148}"
NAME="brand-build"; REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_CMD='set -euo pipefail
bash -n pre-commit && bash -n pre-push && bash -n install.sh
S=$(mktemp -d); trap "rm -rf $S" EXIT
git init -q "$S"; git -C "$S" config user.email t@t; git -C "$S" config user.name t
./install.sh "$S" >/dev/null
printf "key=AKIAIOSFODNN7EXAMPLE\n" > "$S/evil.txt"; git -C "$S" add evil.txt
if git -C "$S" commit -qm x 2>/dev/null; then echo "FAIL: secret commit was not blocked"; exit 1; fi
git -C "$S" rm -q --cached evil.txt; rm -f "$S/evil.txt"
printf "hello\n" > "$S/ok.txt"; git -C "$S" add ok.txt
git -C "$S" commit -qm ok || { echo "FAIL: clean commit was blocked"; exit 1; }
echo "brand hooks OK: syntax clean, secret blocked, clean commit passed"'
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
