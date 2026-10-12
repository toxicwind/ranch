#!/bin/bash
# bidder-raccoon launcher - started by pitchfork
set -euo pipefail
# IDEMPOTENT (mirrors bidder-forge.sh): if another instance is already
# running, exit 0 quietly instead of crashing on the flock.
if pgrep -f 'bidder.py --id raccoon' >/dev/null 2>&1; then
  exit 0
fi
exec /usr/bin/python3 /home/toxic/estate/ranch/squawk/oracle/bin/bidder.py   --id raccoon   --name Raccoon   --emoji '🦝'   --tags 'probe,research,code-fix,verify,docs'   --tagline 'Raccoon here — I wash every task before I serve it. Probes, research, fixes, verification.'
