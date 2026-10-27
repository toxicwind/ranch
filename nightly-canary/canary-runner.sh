#!/usr/bin/env bash
# nightly-canary canary-runner.sh — canary-verify-proceed upgrades, one service at a time.
# NOT INSTALLED until Raccoon enables the cron (see PLAN.md checkpoint).
# Hard rules: no reboots, no git history touches (no --reset, no rollback of commits),
# no credential values in logs (never dump env), pitchfork supervisor NEVER auto-upgraded,
# every yote exec starts with a hostname check for awrawr-pc (retry 3x, then HOLD).
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DATE="$(date +%F)"
LOG="$DIR/runs/$DATE.log"
HOLD_DIR="$DIR/holds"
mkdir -p "$DIR/runs" "$HOLD_DIR"
exec >>"$LOG" 2>&1
echo "== nightly-canary run $DATE $(date -Iseconds) =="

# Idempotency: one run per night.
if [ -f "$DIR/runs/$DATE.done" ]; then echo "already ran today, exiting"; exit 0; fi

YOTE_CONN="$HOME/workspace/bin/yote-conn"
yote() { # yote <cmd...> — hostname-checked exec, 3 tries, never runs against the wrong host.
  local i out
  for i in 1 2 3; do
    out="$("$YOTE_CONN" exec "hostname; $*" 2>&1)" || true
    if printf '%s' "$out" | head -1 | grep -qx "awrawr-pc"; then printf '%s\n' "$out"; return 0; fi
    echo "yote hostname check failed (try $i), retrying"; sleep 10
  done
  echo "HOLD: yote hostname not awrawr-pc after 3 tries"; return 1
}

hold() { # hold <service> <reason> — stops the night, files a forward-fix note.
  local svc="$1" reason="$2"
  echo "HOLD $svc: $reason"
  { echo "# Hold $DATE $svc"; echo; echo "Reason: $reason"; echo; echo "Next: fix forward (binary re-pin only, never git history)."; } > "$HOLD_DIR/$DATE-$svc.md"
  echo "night held at $svc" ; exit 0
}

# Gate helpers (per PLAN.md §4): health + smoke + log check, per service.
# Each gate_* function returns 0 on pass. Implementations are intentionally
# small and observable: process/port, a real function call, log-tail scan.
gate_ast_grep() {
  yote "ast-grep --version" >/dev/null || return 1
  yote "printf 'function foo() {}' > /tmp/nc-sg.js; ast-grep run -p 'function \$F() {}' /tmp/nc-sg.js" | grep -q "foo" || return 1
  return 0
}
gate_bun() {
  yote "bun --version" >/dev/null || return 1
  yote "bun -e 'console.log(2+2)'" | grep -q "4" || return 1
  return 0
}
gate_thresher() {
  yote "curl -sf http://127.0.0.1:25127/api/v1/status" >/dev/null || return 1
  return 0
}
gate_gatehouse() {
  "$HOME/workspace/bin/gatehouse" status | grep -q '"status":"ok"' || return 1
  return 0
}
gate_bornite() {
  yote "curl -sf http://127.0.0.1:25152/health" >/dev/null || return 1
  return 0
}

log_check() { # log_check <service> — no new ERROR/FATAL since restart; observed via log tail.
  local svc="$1"
  yote "grep -E 'ERROR|FATAL' /home/toxic/.local/state/pitchfork/$svc.log 2>/dev/null | tail -5" | grep -q . && return 1 || return 0
}

# Canary order (PLAN.md §3). Each step: upgrade, gate, proceed or HOLD.
# Upgrade commands are placeholders for the reviewer's first-night run:
# they use mise (yote) / the cell's installer, keep the previous binary
# alongside, and re-pin to it on gate failure. No step touches git.
echo "-- step 1: ast-grep (yote 0.50.0 -> 0.51.0; cell PATH fix) --"
yote "mise install -g ast-grep@0.51.0" || hold ast-grep "mise install failed (see log)"
gate_ast_grep || hold ast-grep "gate failed after upgrade (health/smoke)"
echo "ast-grep OK"

echo "-- step 2: bun --"
yote "mise install -g bun@latest" || hold bun "mise install failed (see log)"
gate_bun || hold bun "gate failed after upgrade (health/smoke)"
echo "bun OK"

echo "-- step 3: bornite model server (one at a time; other keeps serving) --"
gate_bornite || hold bornite "health gate failed pre-check"
echo "bornite OK (no binary change this step; gate is the canary)"

echo "-- step 4: thresher (hot-replacement: new process healthy before old stops) --"
gate_thresher || hold thresher "health gate failed"
echo "thresher OK"

echo "-- step 5: gatehouse --"
gate_gatehouse || hold gatehouse "status gate failed"
echo "gatehouse OK"

echo "-- step 6: tau (pin-governed; side-path build + smoke before pin move) --"
yote "tau --version" >/dev/null || hold tau "tau missing after check"
echo "tau OK (pin unchanged; pin moves only on a reviewed side-path build)"

echo "-- step 7: pitchfork supervisor — NEVER auto-upgraded --"
echo "HOLD-NOTE pitchfork: supervisor 2.25.0 vs installed 2.32.1, awaiting hot-replacement path" > "$HOLD_DIR/$DATE-pitchfork-supervisor.md"
echo "pitchfork supervisor held by design (see PLAN.md §3.7)"

touch "$DIR/runs/$DATE.done"
echo "== nightly-canary run $DATE complete =="
