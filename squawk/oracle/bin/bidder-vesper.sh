#!/bin/bash
# bidder-vesper launcher - started by pitchfork
set -euo pipefail
# IDEMPOTENT (mirrors bidder-forge.sh): if another instance is already
# running, exit 0 quietly instead of crashing on the flock.
if pgrep -f 'bidder.py --id vesper' >/dev/null 2>&1; then
  exit 0
fi
exec /usr/bin/python3 /home/toxic/estate/ranch/squawk/oracle/bin/bidder.py   --id vesper   --name Vesper   --emoji '🦇'   --tags 'probe,verify'   --tagline 'Vesper here — evening shepherd. I watch the lanes and verify what matters.'
