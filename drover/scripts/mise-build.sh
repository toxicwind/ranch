#!/usr/bin/env bash
# Direct build entry: mise owns the toolchain; mbx-cache restores eligible task outputs.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
BUILD_CMD=$(cat <<'BUILD'
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
cp -r . "$W/drover"
cd "$W/drover"
bun install
cd sidecar
bun install
node esbuild.js
echo "DROVER-BUILD-OK"
BUILD
)
exec "$ROOT/scripts/mise-build.sh" "drover" "$ROOT/drover" "$BUILD_CMD"
