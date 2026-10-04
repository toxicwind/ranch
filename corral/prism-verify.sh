#!/usr/bin/env bash
# Prism: yote-side verification after aesthe file transfers.
set -u
R=/home/toxic/estate/ranch/corral
cd "$R" || exit 1

echo "=== 1. file inventory ==="
ls -la src/ui/tokens.ts src/ui/cli-style.ts src/report/renderReport.ts src/components/Monitor.tsx patch-cli.py

echo "=== 2. patch cli/index.ts ==="
time python3 patch-cli.py

echo "=== 3. typecheck ==="
if [ -f package.json ] && grep -q '"typecheck"' package.json; then
  time bun run typecheck 2>&1 | tail -5
else
  time bunx --yes tsc --noEmit -p tsconfig.json 2>&1 | tail -8 || \
  time bun build src/cli/index.ts --outdir /tmp/prism-buildcheck --target bun 2>&1 | tail -5
fi

echo "=== 4. unit-test new modules (bun) ==="
time bun -e '
import { renderRunReport } from "./src/report/renderReport.ts";
import { paint, progressBar } from "./src/ui/cli-style.ts";
const html = renderRunReport({ runId: "sr-verify", projectName: "corral", prompt: "verify", status: "success", steps: [{ name: "a", status: "success" }] });
if (!html.includes("<!DOCTYPE html>")) throw new Error("report render broken");
if (progressBar(0.5).length < 10) throw new Error("progress broken");
console.log("modules OK", html.length, "bytes");
' 2>&1 | tail -3

echo "=== 5. render sample report from a real past run ==="
time bun -e '
import { writeRunReport } from "./src/report/renderReport.ts";
const p = await writeRunReport({ runId: "sr-mupb0hph-316ead3a", root: "/home/toxic/estate/ranch/corral", prompt: "sample" });
console.log("wrote", p);
' 2>&1 | tail -2

echo "=== 6. screenshots 390px + 1440px ==="
HTML=$(ls -t .smithers/reports/sr-mupb0hph-316ead3a.html | head -1)
bash /home/hatch/prism-work/prism-shots.sh 2>/dev/null || true
CHROME="$(command -v chromium || command -v chromium-browser || command -v google-chrome)"
mkdir -p /tmp/prism-shots
for W in 390 1440; do
  time "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --window-size="${W},900" --hide-scrollbars \
    --screenshot="/tmp/prism-shots/report-${W}px.png" "file://$HTML" 2>&1 | tail -1
done
ls -la /tmp/prism-shots/

echo "=== 7. git status ==="
git status --porcelain | head -20
