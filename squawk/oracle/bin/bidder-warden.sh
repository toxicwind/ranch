#!/bin/bash
# bidder-warden launcher - started by pitchfork
set -euo pipefail
# IDEMPOTENT: if another instance is already running, exit 0 quietly
if pgrep -f "bidder.py --id warden" >/dev/null 2>&1; then
  exit 0
fi
exec /usr/bin/python3 /home/toxic/estate/ranch/squawk/oracle/bin/bidder.py \
  --id warden \
  --name Warden \
  --emoji "🛡️" \
  --tags "verify,drift-probe,docs" \
  --tagline "I verify, re-check, and prove it. Drift, docs, or test runs - point me at the claim."
