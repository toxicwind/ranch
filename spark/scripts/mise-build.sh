#!/usr/bin/env bash
# Direct build entry: mise owns the toolchain; mbx-cache restores eligible task outputs.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
BUILD_CMD=$(cat <<'BUILD'
python3 -c "import json; d=json.load(open('manifests/dropbox-inventory.json')); ks={'generated_at','entries','repo_candidates','totals'}; assert ks <= set(d), sorted(set(d)); print('entries:', len(d['entries']), 'repo_candidates:', len(d['repo_candidates'])); print('spark manifest OK')"
BUILD
)
exec "$ROOT/scripts/mise-build.sh" "spark" "$ROOT/spark" "$BUILD_CMD"
