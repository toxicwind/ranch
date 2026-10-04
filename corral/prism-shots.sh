#!/usr/bin/env bash
# Prism: screenshot a corral run report at mobile (390px) + desktop (1440px).
# Usage: ./prism-shots.sh <report.html> <outdir>
set -euo pipefail
HTML="${1:?report html path}"
OUT="${2:?output dir}"
mkdir -p "$OUT"
CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome)"
for W in 390 1440; do
  time "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --window-size="${W},900" --hide-scrollbars \
    --screenshot="$OUT/report-${W}px.png" "file://$HTML" 2>&1 | tail -1
done
ls -la "$OUT"
