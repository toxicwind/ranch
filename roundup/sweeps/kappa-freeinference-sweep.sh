#!/usr/bin/env bash
# kappa-freeinference-sweep.sh — roundup bench of the freeinference catalog
# exactly as Kilo serves it (6 models; 4 chat-usable). Synchronous profile,
# strictly serial — the provider enforces concurrency limit:1 per key
# (findings.md §14), so parallel lanes are pointless here.
# File lock prevents concurrent runs with same API key (collision → quota exhausted).
LOCKFILE="/tmp/kappa-freeinference-sweep.lock"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "FATAL: another kappa-freeinference-sweep is already running (same API key)" >&2
  exit 1
fi
trap 'rm -f "$LOCKFILE"' EXIT

# exactly as Kilo serves it (6 models; 4 chat-usable). Synchronous profile,
# strictly serial — the provider enforces concurrency limit:1 per key
# (findings.md §14), so parallel lanes are pointless here.
ROUNDUP=/home/toxic/estate/ranch/roundup
GUIDELLM=""
for c in ~/.venv-guidellm/bin/guidellm "$ROUNDUP/guidellm/.venv/bin/guidellm"; do
  [ -x "$c" ] && { GUIDELLM="$c"; break; }
done
[ -z "$GUIDELLM" ] && { echo "FATAL: guidellm not found (python3 -m venv ~/.venv-guidellm && ~/.venv-guidellm/bin/pip install -e roundup/guidellm)" >&2; exit 3; }

K=$(grep -E '^FREEINFERENCE_API_KEY=' /home/toxic/.secrets | head -1 | cut -d= -f2-)
[ -z "$K" ] && { echo "FATAL: FREEINFERENCE_API_KEY missing from vault" >&2; exit 3; }
TARGET=https://freeinference.org/v1
DATE=$(date +%Y%m%d)
OUTDIR="$ROUNDUP/results/kappa-freeinf-$DATE"
mkdir -p "$OUTDIR"

# The Kilo freeinference catalog: chat models only (bge-m3 = embedding-only,
# diffusiongemma = not an agent model — discovered but skipped).
MODELS=(glm-5.3-flash deepseek-v4-flash qwen3.6-35b minimax-m3)

echo "[kappa-sweep] guidellm: $GUIDELLM"
echo "[kappa-sweep] target: $TARGET  (concurrency limit:1 -> synchronous, serial)"
echo "[kappa-sweep] models: ${MODELS[*]}"

FAIL=0
for m in "${MODELS[@]}"; do
  safe=$(echo "$m" | tr '/:' '__')
  echo "=== $m ==="
  if timeout 120 "$GUIDELLM" run \
    --backend "kind=openai_http,target=$TARGET,model=$m,validate_backend=False,api_key=$K" \
    --data "kind=synthetic_text,prompt_tokens=128,output_tokens=64" \
    --profile kind=synchronous \
    --constraint "kind=max_requests,count=5" \
    --tokenizer kind=huggingface_auto,model=gpt2 \
    --output "kind=json,path=$OUTDIR/$safe.json" \
    --disable-progress >"$OUTDIR/$safe.log" 2>&1; then
    echo "  OK -> $safe.json"
  else
    echo "  FAIL(rc=$?) -> $safe.log"; FAIL=$((FAIL+1))
  fi
  sleep 1  # be polite: serialization gate
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
print(f"\nKAPPA FREEINFERENCE RANKING ({len(rows)} benchmarks):")
print(f"{'model':24} {'lat/s':>7} {'TTFT ms':>8} {'out tok/s':>9}")
for n, lat, ttft, tps in rows:
    f = lambda v: f"{v:.2f}" if isinstance(v, (int, float)) else "-"
    print(f"{n[:24]:24} {f(lat):>7} {f(ttft):>8} {f(tps):>9}")
PYEOF
[ "$FAIL" -gt 0 ] && { echo "[kappa-sweep] $FAIL model(s) failed — see $OUTDIR/*.log"; exit 1; }
echo "[kappa-sweep] done: $OUTDIR"
