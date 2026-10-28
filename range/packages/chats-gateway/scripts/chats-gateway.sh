#!/usr/bin/env bash
# chats-gateway — estate launcher.
#
# Resolves the gateway's two secrets from the secretsmith keyring and execs
# the gateway with them in its environment.
#
# Secret doctrine: keys come from the keyring (freedesktop Secret Service)
# first; ~/.secrets is the fallback record, never the source of truth.
# Secrets travel in the child-process environment ONLY — this script never
# prints, logs, or writes key material.
#
# Each variable is probed on its own: a missing keyring item is skipped so the
# rest of the environment still stands, and the gateway then refuses to start
# (it requires CHATS_GATEWAY_TOKEN) or degrades honestly (the kappa tab
# reports that it has no credential).
#
# The keyring items this script expects:
#
#   service=chats-gateway  key=CHATS_GATEWAY_TOKEN
#   service=kappa-server   key=KAPPA_SERVER_PASSWORD
#
# Create them with (the secret is read from stdin):
#
#   openssl rand -base64 32 | secretsmith set --label chats-gateway \
#     --attr service=chats-gateway --attr key=CHATS_GATEWAY_TOKEN
#
#   printf %s "$KAPPA_SERVER_PASSWORD" | secretsmith set --label kappa-server \
#     --attr service=kappa-server --attr key=KAPPA_SERVER_PASSWORD
set -euo pipefail

SOV="${ESTATE_ROOT:-/home/toxic/estate}"
SMITH="${SECRETSMITH_BIN:-$SOV/ranch/secretsmith/bin/secretsmith}"
PKG="${CHATS_GATEWAY_DIR:-$SOV/ranch/range/packages/chats-gateway}"

TOKEN_SPEC="key=CHATS_GATEWAY_TOKEN,service=chats-gateway"
KAPPA_SPEC="key=KAPPA_SERVER_PASSWORD,service=kappa-server"

ENVS=()

spec_of() { # VAR attrspec -> add the mapping only if the item exists
  if "$SMITH" exec --env "${1}=${2}" -- true >/dev/null 2>&1; then
    ENVS+=(--env "${1}=${2}")
    return 0
  fi
  return 1
}

if ! spec_of CHATS_GATEWAY_TOKEN "$TOKEN_SPEC"; then
  echo "chats-gateway: no keyring item matches CHATS_GATEWAY_TOKEN (${TOKEN_SPEC})" >&2
  echo "chats-gateway: create it with:" >&2
  echo "  openssl rand -base64 32 | $SMITH set --label chats-gateway \\" >&2
  echo "    --attr service=chats-gateway --attr key=CHATS_GATEWAY_TOKEN" >&2
  exit 1
fi

# Optional: the kappa server's Basic-auth password. Without it the kappa tab
# still loads its shell and says plainly that it has no credential.
spec_of KAPPA_SERVER_PASSWORD "$KAPPA_SPEC" || true

cd "$PKG"
exec "$SMITH" exec "${ENVS[@]}" -- bun run src/index.ts
