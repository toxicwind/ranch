#!/bin/bash
# roundup_herd_sweep.sh -- GuideLLM benchmark routed maximally through herd.
#
# CHRIS DOCTRINE: benchmark traffic goes through the herd router
# (http://127.0.0.1:25100), never direct to providers. herd/keypool own
# ALL provider credentials -- this script reads no secrets, passes no
# api_key to GuideLLM, and prints none.
#
# Models are discovered LIVE from herd /v1/models on every run. No model
# IDs are hardcoded here; selection is via --include/--exclude regexes.
#
# Usage:
#   guidellm_herd_sweep.sh [--outdir DIR] [--include REGEX] [--exclude REGEX]
#                          [--max-models N] [--concurrency N] [--timeout SECS]
#                          [--requests N] [--prompt-tokens N] [--output-tokens N]
#
# Defaults exclude the Kimi free-chain aliases (honest 402 while free Kimi
# is down -- benchmarking them measures nothing) and local-weight models
# (multi-GB loads; use --include to opt in).
set -u

OUTDIR=/home/toxic/estate/ranch/roundup/results/herd
INCLUDE='.*'
EXCLUDE='^(kimi|kimi-k2|kimi-code|kimi-auto)$|flock-|^beellama/|toolcall-local'
MAX_MODELS=0
CONCURRENCY=3
TIMEOUT=600
REQUESTS=5
PROMPT_TOKENS=32
OUTPUT_TOKENS=32
HERD=http://127.0.0.1:25100

# GUIDELLM discovery — the 2026-10-14 silent-failure bug: bare `guidellm` was
# not on PATH, every benchmark failed, the summary reported "completed: 0
# failed: 0", and the script exited 0. Resolve explicitly and fail loudly.
GUIDELLM=""
for c in ~/.venv-guidellm/bin/guidellm \
         /home/toxic/estate/ranch/roundup/guidellm/.venv/bin/guidellm; do
  [ -x "$c" ] && { GUIDELLM="$c"; break; }
done
[ -z "$GUIDELLM" ] && GUIDELLM=$(command -v guidellm || true)
if [ -z "$GUIDELLM" ]; then
  echo "FATAL: guidellm not found (checked ~/.venv-guidellm, fork .venv, PATH)." >&2
  echo "  install: python3 -m venv ~/.venv-guidellm && ~/.venv-guidellm/bin/pip install -e roundup/guidellm" >&2
  exit 3
fi
echo "[sweep] guidellm: $GUIDELLM"

while [ $# -gt 0 ]; do
  case "$1" in
    --outdir) OUTDIR="$2"; shift 2;;
    --include) INCLUDE="$2"; shift 2;;
    --exclude) EXCLUDE="$2"; shift 2;;
    --max-models) MAX_MODELS="$2"; shift 2;;
    --concurrency) CONCURRENCY="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --requests) REQUESTS="$2"; shift 2;;
    --prompt-tokens) PROMPT_TOKENS="$2"; shift 2;;
    --output-tokens) OUTPUT_TOKENS="$2"; shift 2;;
    *) echo "unknown flag: $1"; exit 2;;
  esac
done

mkdir -p "$OUTDIR"
echo "[sweep] discovering models from $HERD/v1/models ..."
MODELS_JSON=$(curl -s -m 20 "$HERD/v1/models") || { echo "herd unreachable"; exit 1; }

export SWEEP_INCLUDE="$INCLUDE" SWEEP_EXCLUDE="$EXCLUDE"
mapfile -t MODELS < <(echo "$MODELS_JSON" | python3 -c '
import json, sys, os, re
inc = re.compile(os.environ["SWEEP_INCLUDE"])
exc_raw = os.environ.get("SWEEP_EXCLUDE", "")
exc = re.compile(exc_raw) if exc_raw else None
data = json.load(sys.stdin).get("data", [])
ids = []
for m in data:
    i = m.get("id", "")
    if not i:
        continue
    if not inc.search(i):
        continue
    if exc and exc.search(i):
        continue
    ids.append(i)
for i in sorted(set(ids)):
    print(i)
')
[ "$MAX_MODELS" -gt 0 ] && MODELS=("${MODELS[@]:0:$MAX_MODELS}")
echo "[sweep] ${#MODELS[@]} models selected"

run_one() {
  local m="$1"
  local safe; safe=$(echo "$m" | tr '/:' '__')
  local out="$OUTDIR/${safe}.json"
  echo "=== $m ==="
  if timeout "$TIMEOUT" "$GUIDELLM" run \
    --backend "kind=openai_http,target=$HERD/v1,model=$m,validate_backend=False" \
    --data "kind=synthetic_text,prompt_tokens=$PROMPT_TOKENS,output_tokens=$OUTPUT_TOKENS" \
    --profile kind=synchronous \
    --constraint "kind=max_requests,count=$REQUESTS" \
    --tokenizer kind=huggingface_auto,model=gpt2 \
    --output "kind=json,path=$out" \
    --disable-progress >"$out.log" 2>&1; then
    echo "  OK -> $out"
  else
    echo "  FAIL(rc=$?) -> $out.log"
  fi
}
export -f run_one
export OUTDIR HERD TIMEOUT REQUESTS PROMPT_TOKENS OUTPUT_TOKENS

printf '%s\n' "${MODELS[@]}" | xargs -P "$CONCURRENCY" -I{} bash -c 'run_one "$@"' _ {}

echo
echo "[sweep] summary:"
# summary: count real benchmark jsons; FAILED sweep must exit non-zero
# (previously "completed: 0 failed: 0" with exit 0 — the silent failure).
python3 - "$OUTDIR" <<'PYEOF'
import json, sys, glob, os
outdir = sys.argv[1]
real, empty, corrupt = 0, 0, 0
details = []
for f in sorted(glob.glob(os.path.join(outdir, "*.json"))):
    name = os.path.basename(f)[:-5]
    try:
        d = json.load(open(f))
        b = d.get("benchmarks") or []
        if b:
            real += 1
            metrics = (b[0].get("metrics", {}) or {})
            lat = metrics.get("request_latency", {}) or metrics.get("time_to_first_token", {})
            mean = lat.get("mean") if isinstance(lat, dict) else None
            details.append(("OK", name, mean))
        else:
            empty += 1
            details.append(("EMPTY", name, None))
    except Exception:
        corrupt += 1
        details.append(("FAIL", name, None))
logs = glob.glob(os.path.join(outdir, "*.json.log"))
print(f"  benchmarks with data: {real}  empty: {empty}  corrupt: {corrupt}  runs attempted (logs): {len(logs)}")
for status, name, mean in details:
    if status == "OK":
        print("    OK   %-60s %s" % (name, ("mean_latency=%.3f" % mean) if mean else ""))
    else:
        print("    %-4s %s" % (status, name))
if real == 0:
    print("  FAILED: sweep produced ZERO benchmark results — do not report this run as done", file=sys.stderr)
    sys.exit(1)
PYEOF
SUMMARY_RC=$?
[ "$SUMMARY_RC" -ne 0 ] && exit 1
echo "[sweep] done: $OUTDIR"
