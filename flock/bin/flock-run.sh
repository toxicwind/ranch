#!/bin/bash
# Pitchfork entry. Sources estate SSOT and syncs the client key, then execs flock.
set -euo pipefail
. "$HOME/estate/config/flock-ssot/env-shim.sh"
export PROXY_API_KEYS="${PROXY_API_KEYS:-$FLOCK_API_KEY}"
# First-class secretsmith: source the NVIDIA NIM upstream key from the
# freedesktop keyring (service=nim), never from a committed literal, so a
# rotation in the keyring flows straight into flock on next start. Flock's
# nvidia provider resolves its lanes via key_env=NVIDIA_NIM_API_KEY.
if [ -z "${NVIDIA_NIM_API_KEY:-}" ]; then
  export NVIDIA_NIM_API_KEY="$("$HOME/estate/ranch/secretsmith/bin/secretsmith" get --attr service=nim --show 2>&1 | sed -n 's/^secret: *//p' | head -1)" || true
fi
# Propagate the client key to tau (flocksync settings + config.yml) so a
# key rotation here never strands tau on a stale key (first-class sync).
python3 /home/toxic/estate/ranch/flock/bin/sync-flock-client-key.py || true
exec /home/toxic/.flock/flock "$@"
