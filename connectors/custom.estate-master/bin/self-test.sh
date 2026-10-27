#!/usr/bin/env bash
# estate-master self-test — proves each route works, prints PASS/FAIL
# per route, exits non-zero if any route fails. Never prints secrets:
# the thresher check reports HTTP codes and counts only.
set -u
BIN="$(cd "$(dirname "$0")" && pwd)"
CLI="$BIN/estate-master.py"
PASS=0; FAIL=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

echo "== route (a) yote-conn exec + hostname gate =="
if python3 "$CLI" yote "hostname" 2>/dev/null | grep -qx "awrawr-pc"; then ok "yote hostname gate"; else bad "yote hostname gate"; fi

echo "== route (b) thresher management API via SSOT =="
OUT=$(python3 "$CLI" thresher-status 2>&1)
echo "$OUT"
if echo "$OUT" | grep -q "status_http=200" && echo "$OUT" | grep -q "servers_total="; then ok "thresher auth + counts"; else bad "thresher auth + counts"; fi

echo "== route (c) squawk fleet read/post =="
if python3 "$CLI" squawk-read --n 1 >/dev/null 2>&1; then ok "squawk read runs"; else bad "squawk read runs"; fi
# Send proof is the published file on yote; the send below is labeled.
if python3 "$CLI" squawk-send fleet "estate-master self-test: route probe, no action needed" 2>&1 | grep -q "published"; then ok "squawk send published"; else bad "squawk send published"; fi

echo "== route (d) gatehouse MCP tool discovery =="
if python3 "$CLI" gatehouse-status 2>&1 | grep -q "ok"; then ok "gatehouse status"; else bad "gatehouse status"; fi
if python3 "$CLI" gatehouse-tools huggingface 2>&1 | grep -q ":"; then ok "gatehouse tools query"; else bad "gatehouse tools query"; fi

echo "== route (e) oracle intake posting =="
if python3 "$CLI" oracle-intake --from estate-master-selftest --text "Self-test probe: report yote hostname. Read-only." 2>&1 | grep -q "posted"; then ok "oracle intake posted"; else bad "oracle intake posted"; fi

echo "== route (f) pitchfork service status =="
if python3 "$CLI" pitchfork --filter shim-drift-watch 2>&1 | grep -q "running"; then ok "pitchfork status"; else bad "pitchfork status"; fi

echo "== summary: PASS=$PASS FAIL=$FAIL =="
[ "$FAIL" -eq 0 ]
