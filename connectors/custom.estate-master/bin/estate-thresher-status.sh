#!/usr/bin/env bash
# estate-thresher-status — yote-side thresher management API probe.
# SSOT key source: secretsmith label THRESHER_API_KEY
# (service=thresher-api-key). The MCPPROXY_API_KEY entry feeds MCP
# plugin provider keys, NOT the management API; the mcp_config.json
# file field holds the same value as the SSOT entry and is never
# read by this script. This script prints ONLY: HTTP status, server
# counts, and (with --errors-only) the NAMES of error servers. The
# key value is never printed, logged, or passed as a visible argument.
set -u
RAW="$(/home/toxic/.local/bin/secretsmith get --label THRESHER_API_KEY --attr service=thresher-api-key --show 2>/dev/null)"
# get --show output is multi-line; take the FIRST "secret: <value>" line,
# mirroring thresher-serve.ts /^secret: (.+)$/m. Never print RAW or KEY.
KEY=""
while IFS= read -r line; do
  case "$line" in
    "secret: "*) KEY="${line#secret: }"; break;;
  esac
done <<< "$RAW"
KEY="${KEY%$'\r'}"
unset RAW
if [ -z "$KEY" ]; then echo "THRESHER FAIL: secretsmith key lookup empty"; exit 1; fi
AUTH="Authorization: Bearer $KEY"
SCODE=$(curl -s -o /tmp/estate-thresher-status.json -w "%{http_code}" -H "$AUTH" http://127.0.0.1:25127/api/v1/status)
VCODE=$(curl -s -o /tmp/estate-thresher-servers.json -w "%{http_code}" -H "$AUTH" http://127.0.0.1:25127/api/v1/servers)
unset KEY AUTH
echo "status_http=$SCODE servers_http=$VCODE"
python3 - "$@" <<'PYEOF'
import json, sys
try:
    st = json.load(open('/tmp/estate-thresher-status.json'))
    sv = json.load(open('/tmp/estate-thresher-servers.json'))
except Exception as e:
    print("THRESHER FAIL: unparsable API response:", type(e).__name__); sys.exit(1)
servers = sv.get('data', {}).get('servers', []) if isinstance(sv, dict) else []
stats = sv.get('data', {}).get('stats', {}) if isinstance(sv, dict) else {}
errs = []
disabled = 0
total = 0
for s in servers if isinstance(servers, list) else []:
    total += 1
    if not s.get('enabled', True):
        disabled += 1
        continue
    stt = str(s.get('status', '')).lower()
    if 'error' in stt or 'fail' in stt:
        errs.append(s.get('name', '?'))
print("servers_total=%d servers_error=%d servers_disabled=%d" % (total, len(errs), disabled))
if stats:
    print("api_stats=" + ",".join("%s=%s" % (k, v) for k, v in sorted(stats.items())))
if '--errors-only' in sys.argv:
    for n in errs:
        print("error: " + str(n))
PYEOF
