#!/usr/bin/env bash
# Direct build entry: mise owns the toolchain; mbx-cache restores eligible task outputs.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
BUILD_CMD=$(cat <<'BUILD'
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
bun build ./server.ts --target=bun --outdir "$OUT"
BUILD
)
exec "$ROOT/scripts/mise-build.sh" "windmill" "$ROOT/windmill" "$BUILD_CMD"
