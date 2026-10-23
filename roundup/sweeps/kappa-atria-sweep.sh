#!/usr/bin/env bash
# kappa-atria-sweep.sh — roundup bench of the Atria catalog (Atria-Dawn)
# As Atria serves it today (1 model: Atria-Dawn; old Atria-Dawn-Preview remains
# compatible). 512K context window, 60 rpm shared across the account.
# Synchronous, serial — the trial key carries a small token quota (~9.7k) and
# rpm is shared, so keep lanes minimal and polite.
# File lock prevents concurrent runs with same API key (collision → quota exhausted).
LOCKFILE="/tmp/kappa-atria-sweep.lock"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "FATAL: another kappa-atria-sweep is already running (same API key)" >&2
  exit 1
fi
trap 'rm -f "$LOCKFILE"' EXIT

ROUNDUP=/home/toxic/estate/ranch/roundup
GUIDELLM=""
for c in ~/.venv-guidellm/bin/guidellm "$ROUNDUP/guidellm/.venv/bin/guidellm"; do
  [ -x "$c" ] && { GUIDELLM="$c"; break; }
done
[ -z "$GUIDELLM" ] && { echo "FATAL: guidellm not found (python3 -m venv ~/.venv-guidellm && ~/.venv-guidellm/bin/pip install -e roundup/guidellm)" >&2; exit 3; }

# Read the key from the keyring (kf → secretsmith, SSOT) with vault fallback.
# Never echo it.
K=""
command -v kf >/dev/null 2>&1 && K=$(kf ATRIA_API_KEY 2>/dev/null)
[ -z "$K" ] && K=$(grep -E '^ATRIA_API_KEY=' /home/toxic/.secrets 2>/dev/null | head -1 | cut -d= -f2-)
[ -z "$K" ] && { echo "FATAL: ATRIA_API_KEY missing (keyring/vault)" >&2; exit 3; }
TARGET=https://api.atria-asi.ai/v1
DATE=$(date +%Y%m%d)
OUTDIR="$ROUNDUP/results/kappa-atria-$DATE"
mkdir -p "$OUTDIR"

# The Atria catalog: single chat model. Keep the benchmark small — the trial
# key's quota is limited, and output cap is 8k by default (65536 max).
MODELS=(Atria-Dawn)

echo "[atria-sweep] guidellm: $GUIDELLM"
echo "[atria-sweep] target: $TARGET  (rpm:60 shared -> synchronous, serial)"
echo "[atria-sweep] models: ${MODELS[*]}"
echo "[atria-sweep] note: Atria-Dawn is a REASONING model — it emits nothing visible until"
echo "                    max_tokens clears the reasoning phase (~128+). output_tokens=256 here"
echo "                    so the benchmark measures real answer throughput, not the reasoning tail."

FAIL=0
for m in "${MODELS[@]}"; do
  safe=$(echo "$m" | tr '/:' '__')
  echo "=== $m ==="
  if timeout 120 "$GUIDELLM" run \
    --backend "kind=openai_http,target=$TARGET,model=$m,validate_backend=False,api_key=$K,max_tokens=256" \
    --data "kind=synthetic_text,prompt_tokens=128,output_tokens=256" \
    --profile kind=synchronous \
    --constraint "kind=max_requests,count=5" \
    --tokenizer kind=huggingface_auto,model=gpt2 \
    --output "kind=json,path=$OUTDIR/$safe.json" \
    --disable-progress >"$OUTDIR/$safe.log" 2>&1; then
    echo "  OK -> $safe.json"
  else
    echo "  FAIL(rc=$?) -> $safe.log"; FAIL=$((FAIL+1))
  fi
  sleep 1  # be polite: share the 60 rpm window
done

python3 - "$OUTDIR" <<'PYEOF'
import json, sys, glob, os
outdir = sys.argv[1]
rows = []
for f in sorted(glob.glob(os.path.join(outdir, "*.json"))):
    name = os.path.basename(f)[:-5]
    try:
        d = json.load(open(f))
        b = d.get("benchmarks") or []
        if not b:
            print(f"EMPTY {name}"); continue
        m = b[0].get("metrics", {}) or {}
        def g(k):
            v = m.get(k)
            return v.get("successful", {}).get("mean") if isinstance(v, dict) else None
        rows.append((name, g("request_latency"), g("time_to_first_token_ms"), g("output_tokens_per_second")))
    except Exception as e:
        print(f"CORRUPT {name}: {e}")
rows.sort(key=lambda r: r[1] if r[1] is not None else 9e9)
print(f"\nKAPPA ATRIA RANKING ({len(rows)} benchmarks):")
print(f"{'model':24} {'lat/s':>7} {'TTFT ms':>8} {'out tok/s':>9}")
for n, lat, ttft, tps in rows:
    f = lambda v: f"{v:.2f}" if isinstance(v, (int, float)) else "-"
    print(f"{n[:24]:24} {f(lat):>7} {f(ttft):>8} {f(tps):>9}")
PYEOF
[ "$FAIL" -gt 0 ] && { echo "[atria-sweep] $FAIL model(s) failed — see $OUTDIR/*.log"; exit 1; }
echo "[atria-sweep] done: $OUTDIR"