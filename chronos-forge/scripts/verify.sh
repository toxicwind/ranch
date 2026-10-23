#!/usr/bin/env bash
# Full verification gate: typecheck, build, compile tests, run tests.
# Cross-platform: works on Linux/macOS and under Git-bash on Windows.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> typecheck"
npx tsc -p tsconfig.json --noEmit

echo "==> build"
npx tsc -p tsconfig.json

echo "==> compile tests"
npx tsc -p tsconfig.test.json

echo "==> test"
node --test dist-test/*.test.js

echo
echo "ALL CHECKS PASSED"
