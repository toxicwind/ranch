#!/bin/bash
# Pitchfork entry. Sources estate SSOT and syncs the client key, then execs flock.
set -euo pipefail
. "$HOME/estate/config/flock-ssot/env-shim.sh"
export PROXY_API_KEYS="${PROXY_API_KEYS:-$FLOCK_API_KEY}"
exec /home/toxic/.flock/flock "$@"
