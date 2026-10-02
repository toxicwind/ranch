#!/usr/bin/env bash
# health-check.sh — the ranch 30-second proof.
# Every core service answers 200 on /health. No setup, no keys.
# Run: ./examples/health-check.sh
set -euo pipefail

declare -A NAMES=(
  [25100]="herd — local front door"
  [25193]="flock — cloud provider router"
  [25127]="gatehouse — MCP gateway"
  [25151]="oracle — decision engine"
  [25200]="cuttinggate — canonical router"
)

fail=0
for p in 25100 25193 25127 25151 25200; do
  code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${p}/health" || echo "000")
  printf '%s %s  %s\n' "$p" "$code" "${NAMES[$p]}"
  [ "$code" = "200" ] || fail=1
done

# local models behind one OpenAI-compatible door
count=$(curl -s -m 5 http://127.0.0.1:25100/v1/models | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" || echo "?")
echo "herd serves ${count} models"

exit "$fail"
