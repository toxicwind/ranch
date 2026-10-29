#!/usr/bin/env bash
# slate-deploy.sh — LG webOS SLATE deploy lane (single command, self-healing).
# Fixes the "dead lane": auto-refresh key -> provision ares -> build combined
# ipk (app+service, single package id) -> install -> launch -> diag.
#
# Usage: LG_PASS=<tv-screen-passphrase> ./slate-deploy.sh [--force-key]
#   LG_PASS required once per key rotation; omit to reuse a healthy key.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"          # lg-fleet product root
ARES=/tmp/ares-cli/node_modules/.bin
TV=lg-tv
IP=10.0.0.176

echo "== 0/5 host toolchain (ares CLI needs Node <=16; Node 24 fails as 'TV error') =="
HOSTNODE="$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)"
if [[ -n "$HOSTNODE" && "$HOSTNODE" -gt 16 ]]; then
  echo "  WARN: host node v$(node -v) — ares may fail with isDate/Callback errors; export NVM use 16 if install fails"
fi

echo "== 1/5 key lane =="
if [[ -n "${LG_PASS:-}" ]]; then
  LG_PASS="$LG_PASS" "$ROOT/bin/lg-key" "$IP" "$LG_PASS"
elif [[ -f ~/.ssh/lg-tv_webos_trad && -f ~/.webos/tv/novacom-devices.json ]]; then
  "$ROOT/bin/lg-key" "$IP" || true
else
  echo "FAIL: need LG_PASS=<screen-passphrase> on first/key-rotated run" >&2; exit 1
fi

echo "== 2/5 build combined ipk =="
# slate-build.ts resolves the nuvio source via its own path config (NUVIO_WEBOS env or default)
NUVIO_WEBOS=/home/toxic/pens/ranch/products/nuvio/nuvio-webos bun "$ROOT/scripts/slate-build.ts" --no-launch

IPKB=$(ls -t ~/.cache/slate-build/com.toxicwind.slate_*_all.ipk | head -1)
echo "  ipk: $IPKB"

echo "== 3/5 install =="
"$ARES/ares-install" -d "$TV" "$IPKB"

echo "== 4/5 launch (two lanes: app via ares; service via hbchannel root exec) =="
"$ARES/ares-launch" -d "$TV" com.toxicwind.slate || true
# ares-install does NOT grant the LS2 bus privilege on dev-mode installs —
# the service must be started by the Homebrew Channel's exec service.
NOVACOM="${NOVACOM:-/home/toxic/.npm-global/bin/ares-novacom}"
"$NOVACOM" -d "$TV" --run "luna-send -n 1 -f luna://org.webosbrew.hbchannel.service/exec '{\"command\":\"/media/developer/apps/usr/palm/services/com.toxicwind.slate.server/launch.js\"}'" 2>&1 | grep -vE "post-quantum|store now" || true

echo "== 5/5 diag =="
"$ROOT/bin/lg-diag" 2>&1 | grep -vE "post-quantum|store now|upgraded" || true
echo "lane: done (see 5/5 for health)"