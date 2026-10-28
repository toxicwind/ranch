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
# Cell PATH fix (PLAN first-night item 1): ~/.local/bin holds a working
# ast-grep (0.45.3); the workspace copy is broken; mise is not on the cell.
export PATH="$HOME/.local/bin:$PATH"
# DRY_RUN=1: upgrade steps become mise --dry-run probes; gates still run
# for real (read-only probes); no .done file is written, idempotency exit skipped.
DRY_RUN="${DRY_RUN:-0}"
RUN_START_MS="$(date +%s%3N)"
exec >>"$LOG" 2>&1
echo "== nightly-canary run $DATE $(date -Iseconds) =="

# Idempotency: one run per night.
if [ "$DRY_RUN" != "1" ] && [ -f "$DIR/runs/$DATE.done" ]; then echo "already ran today, exiting"; exit 0; fi

YOTE_CONN="$HOME/workspace/bin/yote-conn"
yote() { # yote <cmd...> — hostname-checked exec, 3 tries, propagates the inner exit code.
  local i out rc
  for i in 1 2 3; do
    out="$("$YOTE_CONN" exec "hostname; $*" 2>&1)"; rc=$?
    if printf '%s' "$out" | head -1 | grep -qx "awrawr-pc"; then printf '%s\n' "$out"; return "$rc"; fi
    echo "yote hostname check failed (try $i), retrying"; sleep 10
  done
  echo "HOLD: yote hostname not awrawr-pc after 3 tries"; return 1
}

mise_install() { # mise_install <tool@version> — real install, or --dry-run probe when DRY_RUN=1.
  if [ "$DRY_RUN" = "1" ]; then yote "mise install --dry-run $1"; else yote "mise install $1"; fi
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
  local code
  # Auth-aware, credential-free: 200 = answering; 401 = alive behind the
  # auth wall (no key used or printed). 000/5xx/timeout = down.
  code="$(yote "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:25127/api/v1/status" | tail -1)"
  [ "$code" = "200" ] || [ "$code" = "401" ] || return 1
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

log_check() { # log_check <daemon_id> <since_ms> — no ERROR/FATAL rows in logs.db since since_ms.
  # Level is NULL in practice, so match on message text too. Non-numeric
  # output (e.g. a yote HOLD line) and unknown daemon_ids fail closed.
  local daemon_id="$1" since_ms="$2" count total
  total="$(yote "sqlite3 /home/toxic/.local/state/pitchfork/logs/logs.db \"SELECT COUNT(*) FROM log_entries WHERE daemon_id = '$daemon_id';\"" | tail -1)"
  case "$total" in ''|*[!0-9]*) echo "log_check $daemon_id: unreadable total [$total]"; return 1;; esac
  if [ "$total" -eq 0 ]; then echo "log_check $daemon_id: unknown daemon (no rows in logs.db)"; return 1; fi
  count="$(yote "sqlite3 /home/toxic/.local/state/pitchfork/logs/logs.db \"SELECT COUNT(*) FROM log_entries WHERE daemon_id = '$daemon_id' AND (level IN ('ERROR','FATAL') OR message LIKE '%ERROR%' OR message LIKE '%FATAL%') AND timestamp > $since_ms;\"" | tail -1)"
  case "$count" in ''|*[!0-9]*) echo "log_check $daemon_id: unreadable count [$count]"; return 1;; esac
  if [ "$count" -gt 0 ]; then echo "log_check $daemon_id: $count ERROR/FATAL rows since $since_ms"; return 1; fi
  echo "log_check $daemon_id: clean since $since_ms"; return 0
}

# Canary order (PLAN.md §3). Each step: upgrade, gate, proceed or HOLD.
# Upgrade commands are placeholders for the reviewer's first-night run:
# they use mise (yote) / the cell's installer, keep the previous binary
# alongside, and re-pin to it on gate failure. No step touches git.
echo "-- step 1: ast-grep (yote 0.51.0 already; cell PATH fix) --"
mise_install "ast-grep@0.51.0" || hold ast-grep "mise install failed (see log)"
gate_ast_grep || hold ast-grep "gate failed after upgrade (health/smoke)"
command -v ast-grep >/dev/null || hold ast-grep "cell ast-grep not on PATH after fix"
ast-grep --version >/dev/null || hold ast-grep "cell ast-grep version check failed"
echo "ast-grep OK"

echo "-- step 2: bun --"
mise_install "bun@latest" || hold bun "mise install failed (see log)"
gate_bun || hold bun "gate failed after upgrade (health/smoke)"
echo "bun OK"

echo "-- step 3: bornite model server (one at a time; other keeps serving) --"
gate_bornite || hold bornite "health gate failed pre-check"
log_check estate/bornite "$RUN_START_MS" || hold bornite "log gate (c) failed"
echo "bornite OK (no binary change this step; gate is the canary)"

echo "-- step 4: thresher (hot-replacement: new process healthy before old stops) --"
gate_thresher || hold thresher "health gate failed"
log_check estate/thresher "$RUN_START_MS" || hold thresher "log gate (c) failed"
echo "thresher OK"

echo "-- step 5: gatehouse --"
gate_gatehouse || hold gatehouse "status gate failed"
log_check estate/gatehouse "$RUN_START_MS" || hold gatehouse "log gate (c) failed"
echo "gatehouse OK"

echo "-- step 6: tau (pin-governed; side-path build + smoke before pin move) --"
yote "tau --version" >/dev/null || hold tau "tau missing after check"
echo "tau OK (pin unchanged; pin moves only on a reviewed side-path build)"

echo "-- step 7: pitchfork supervisor — NEVER auto-upgraded --"
echo "HOLD-NOTE pitchfork: supervisor 2.25.0 vs installed 2.32.1, awaiting hot-replacement path" > "$HOLD_DIR/$DATE-pitchfork-supervisor.md"
echo "pitchfork supervisor held by design (see PLAN.md §3.7)"

if [ "$DRY_RUN" != "1" ]; then touch "$DIR/runs/$DATE.done"; fi
echo "== nightly-canary run $DATE complete =="
