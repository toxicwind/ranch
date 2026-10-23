#!/usr/bin/env bash
# Direct build entry: mise owns the toolchain; mbx-cache restores eligible task outputs.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
BUILD_CMD=$(cat <<'BUILD'
VENV_PY=/home/toxic/.venv-guidellm/bin/python
[ -x "$VENV_PY" ] || VENV_PY=python3
cd fork
PYTHONPATH=src "$VENV_PY" -m pytest tests/unit -q
echo "roundup build OK"
BUILD
)
exec "$ROOT/scripts/mise-build.sh" "roundup" "$ROOT/roundup" "$BUILD_CMD"
