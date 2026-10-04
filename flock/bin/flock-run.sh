#!/bin/bash

. "$HOME/estate/config/flock-ssot/env-shim.sh" 2>/dev/null || true
# Flock launcher: injects provider API keys from /home/toxic/.secrets
# into the daemon environment, then execs the binary. Keeps secret
# values out of pitchfork.toml (which is committed to git).
set -euo pipefail

SECRETS="/home/toxic/.secrets"

load_key() {
    local name="$1" val
    val="$(grep -m1 "^${name}=" "$SECRETS" | cut -d= -f2-)" || true
    if [ -n "$val" ]; then
        export "$name=$val"
    fi
}

load_key GROQ_API_KEY
load_key CEREBRAS_API_KEY
load_key NVIDIA_API_KEY
load_key FLOCK_API_KEY
# The flock proxy authenticates clients against PROXY_API_KEYS, but the
# estate bidder clients (super-ralph) send FLOCK_API_KEY. Accept the
# existing estate key server-side so both sides agree. No new secret is
# created or rotated here.
export PROXY_API_KEYS="${PROXY_API_KEYS:-$FLOCK_API_KEY}"

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-${FLOCK_PORT:-25193}}"
export FLOCK_PORT="$PORT"
export DATA_DIR="${DATA_DIR:-/home/toxic/.flock-data}"

exec /home/toxic/.flock/flock "$@"
