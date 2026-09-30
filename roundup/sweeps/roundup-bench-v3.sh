#!/usr/bin/env bash
set -uo pipefail

FORK=/home/toxic/sovereign/projects/range/ranch/roundup/fork
GUIDELLM=/home/toxic/.local/bin/guidellm
VENV=/home/toxic/.venv-guidellm
OUT=/home/toxic/sovereign/projects/range/ranch/roundup/results/bench
SECDIR=/home/toxic/.config/guidellm-bench
PROMPTS=/home/toxic/sovereign/projects/openrouter-probe/abstract-prompts.txt
SENTINEL="ABSTRACT-7X3Q"
PARALLEL=20
PROBE_TIMEOUT=5

mkdir -p "$OUT" "$SECDIR"
chmod 700 "$SECDIR"

NIM_KEY="$(grep -E '^NVIDIA_API_KEY=' /home/toxic/.9router/env.systemd | head -1 | cut -d= -f2-)"
FLOCK_KEY="$(cat /home/toxic/.tau/flock.key 2>/dev/null || echo '')"
VR_KEY="$(grep -E '^API_KEY_SECRET=' /home/toxic/.config/vansrouter/env | cut -d= -f2-)"

# ANSI-C quoting — the fix for the broken color vars
G=$'\033[0;32m'; Y=$'\033[1;33m'; R=$'\033[0;31m'; C=$'\033[0;36m'; N=$'\033[0m'
ok()  { printf '  %s✓%s %s\n' "$G" "$N" "$1"; }
bad() { printf '  %s✗%s %s\n' "$R" "$N" "$1"; }
hdr() { printf '\n%s══ %s ══%s\n' "$C" "$1" "$N"; }

# ─────────────────────────────────────────────────────────────────────
hdr "0. Verify guidellm"

[ -x "$GUIDELLM" ] || { bad "not at $GUIDELLM"; exit 1; }
ok "version: $("$GUIDELLM" --version 2>&1 | head -1)"
"$VENV/bin/python" -c 'from guidellm.benchmark.scoring import list_scorers; print("  scorers:", ", ".join(list_scorers()))' 2>&1 | head -2

"$GUIDELLM" run --help > "$SECDIR/run-help.txt" 2>&1
HAS_CONFIG=no; rg -qE '^\s*(-c|--config|--scenario)\b' "$SECDIR/run-help.txt" && HAS_CONFIG=yes
HAS_FLAGS=no;  rg -q '^\s*--backend\b' "$SECDIR/run-help.txt" && HAS_FLAGS=yes
echo "  --config: $HAS_CONFIG   --backend: $HAS_FLAGS"

# ─────────────────────────────────────────────────────────────────────
hdr "1. Discover ALL models from /v1/models (no limits)"

REACH="$OUT/reachability.tsv"
: > "$REACH"

probe_one() {
  local prov="$1" url="$2" auth="$3" model="$4"
  local hdrs=(-H 'Content-Type: application/json')
  [ -n "$auth" ] && hdrs+=(-H "Authorization: Bearer $auth")
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url/chat/completions" \
    "${hdrs[@]}" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1,\"stream\":false}" \
    --max-time "$PROBE_TIMEOUT" 2>/dev/null || echo ERR)"
  printf '%s\t%s\t%s\n' "$prov" "$model" "$code"
}
export -f probe_one
export PROBE_TIMEOUT

sweep() {
  local prov="$1" url="$2" auth="$3"
  local hdrs=(-H 'Content-Type: application/json')
  [ -n "$auth" ] && hdrs+=(-H "Authorization: Bearer $auth")

  local total
  total="$(curl -s "${hdrs[@]}" "$url/models" --max-time 10 2>/dev/null | jq -r '(.data // .)[].id' 2>/dev/null)"
  local n; n="$(echo "$total" | grep -c .)"
  echo "  ── $prov: $n models ──"

  # parallel probe
  echo "$total" | xargs -P "$PARALLEL" -I{} bash -c 'probe_one "$@"' _ "$prov" "$url" "$auth" {} >> "$REACH"

  local ok_n; ok_n="$(awk -F'\t' -v p="$prov" '$1==p && $3=="200"' "$REACH" | wc -l)"
  ok "$prov: $ok_n/$n reachable"
}

sweep "nim"   "https://integrate.api.nvidia.com/v1" "$NIM_KEY"
sweep "herd"  "http://127.0.0.1:25100/v1" ""
sweep "sov"   "http://127.0.0.1:25104/v1" ""
sweep "flock" "http://127.0.0.1:25193/v1" "$FLOCK_KEY"
sweep "vr"    "http://127.0.0.1:20128/v1" "$VR_KEY"

hdr "Reachability summary"
awk -F'\t' '$3=="200" {print $1}' "$REACH" | sort | uniq -c | sort -rn | sed 's/^/  /'
echo "  total reachable: $(awk -F'\t' '$3=="200"' "$REACH" | wc -l)"
echo "  total tested:    $(wc -l < "$REACH")"

# ─────────────────────────────────────────────────────────────────────
hdr "2. Quality + latency — GuideLLM per reachable model"

RESULTS="$OUT/results.tsv"
printf 'provider\tmodel\tquality\tttft_ms\tp50_ms\ttps\n' > "$RESULTS"

declare -A TOK=(
  ["nex-agi/nex-n2.5-mini:free"]="nex-agi/Nex-N2.5-mini"
  ["nex-agi/nex-n2.5-pro:free"]="nex-agi/Nex-N2.5-Pro"
  ["poolside/laguna-s-2.1:free"]="poolside/Laguna-S-2.1"
  ["inclusionai/ling-3.0-flash-fin:free"]="inclusionAI/Ling-3.0-flash-Fin"
  ["inclusionai/ling-3.0-flash-vl:free"]="inclusionAI/Ling-3.0-flash-VL"
)
DEFAULT_TOK=gpt2

run_one() {
  local prov="$1" model="$2"
  local url auth
  case "$prov" in
    nim)   url="https://integrate.api.nvidia.com/v1"; auth="$NIM_KEY" ;;
    herd)  url="http://127.0.0.1:25100/v1"; auth="" ;;
    sov)   url="http://127.0.0.1:25104/v1"; auth="" ;;
    flock) url="http://127.0.0.1:25193/v1"; auth="$FLOCK_KEY" ;;
    vr)    url="http://127.0.0.1:20128/v1"; auth="$VR_KEY" ;;
    *) return ;;
  esac
  local safe; safe="$(echo "${prov}__${model}" | tr '/:.' '___')"
  local out_json="$OUT/$safe.json"
  local scen="$SECDIR/$safe.yaml"
  local tok="${TOK[$model]:-$DEFAULT_TOK}"
  local bk="kind=openai_http,target=$url,model=$model,validate_backend=False"
  [ -n "$auth" ] && bk="$bk,api_key=$auth"

  local rc=1
  if [ "$HAS_CONFIG" = "yes" ]; then
    {
      echo "backend:"; echo "  kind: openai_http"; echo "  target: $url"
      echo "  model: $model"; [ -n "$auth" ] && echo "  api_key: $auth"
      echo "  validate_backend: false"; echo "  stream: false"
      echo "data:"; echo "  - kind: text_file"; echo "    path: $PROMPTS"
      echo "profile:"; echo "  kind: synchronous"
      echo "constraint:"; echo "  kind: max_requests"; echo "  count: 3"
      echo "tokenizer:"; echo "  kind: huggingface_auto"; echo "  model: $tok"
      echo "metrics:"
      echo "  kind: generative"
      echo '  scorers: ["instruction_following"]'
      echo "  scorer_config:"
      echo "    instruction_following:"
      echo "      sentinel: \"$SENTINEL\""
      echo "      strip_thinking: true"
      echo "output:"; echo "  - kind: json"; echo "    path: $out_json"
      echo "disable_console_interactive: true"
    } > "$scen"
    timeout 120 "$GUIDELLM" run --config "$scen" >"$OUT/$safe.log" 2>&1
    rc=$?
  else
    timeout 120 "$GUIDELLM" run \
      --backend "$bk" \
      --data "kind=text_file,path=$PROMPTS" \
      --profile "kind=synchronous" \
      --constraint "kind=max_requests,count=3" \
      --tokenizer "kind=huggingface_auto,model=$tok" \
      --output "kind=json,path=$out_json" \
      --disable-progress >"$OUT/$safe.log" 2>&1
    rc=$?
  fi

  if [ $rc -ne 0 ] || [ ! -f "$out_json" ]; then
    printf '%s\t%s\t0\t0\t0\t0\n' "$prov" "$model" >> "$RESULTS"
    return
  fi

  local q t p tps
  q="$(jq -r '(.benchmarks[0].quality.instruction_following.mean // .benchmarks[0].quality.instruction_following // 0)' "$out_json" 2>/dev/null)"
  t="$(jq -r '(.benchmarks[0].metrics.time_to_first_token.mean // .benchmarks[0].metrics.time_to_first_token // 0)' "$out_json" 2>/dev/null)"
  p="$(jq -r '(.benchmarks[0].metrics.request_latency.p50 // .benchmarks[0].metrics.request_latency.mean // 0)' "$out_json" 2>/dev/null)"
  tps="$(jq -r '(.benchmarks[0].metrics.output_tokens_per_second.mean // .benchmarks[0].metrics.output_tokens_per_second // 0)' "$out_json" 2>/dev/null)"
  for v in q t p tps; do eval "[ \"\$$v\" = \"null\" ] && $v=0"; done
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$prov" "$model" "$q" "$t" "$p" "$tps" >> "$RESULTS"
}
export -f run_one
export NIM_KEY FLOCK_KEY VR_KEY OUT SECDIR PROMPTS SENTINEL GUIDELLM HAS_CONFIG DEFAULT_TOK

# Bench reachable set in parallel
awk -F'\t' '$3=="200" {print $1"|"$2}' "$REACH" | \
  xargs -P 4 -I{} bash -c '
    IFS="|" read -r p m <<< "{}"
    echo "  start: $p / $m"
    run_one "$p" "$m"
    echo "  done:  $p / $m"
  ' | rg '^  (start|done)'

# ─────────────────────────────────────────────────────────────────────
hdr "3. Ranking"

RANK="$OUT/ranking.md"
{
  echo "# GuideLLM Model Ranking — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Scorer: instruction_following | Sentinel: $SENTINEL"
  echo "Rank: quality desc, p50 asc"
  echo
  echo "| rank | provider | model | quality | ttft_ms | p50_ms | tps |"
  echo "|------|----------|-------|---------|---------|--------|-----|"
  tail -n +2 "$RESULTS" | sort -t$'\t' -k3,3nr -k5,5n | \
    awk -F'\t' '{printf "| %d | %s | %s | %.2f | %.0f | %.0f | %.1f |\n", NR, $1, $2, $3, $4, $5, $6}'
} > "$RANK"

head -40 "$RANK"

hdr "DONE"
echo "  ranking: $RANK"
echo "  models:  $(tail -n +2 "$RESULTS" | wc -l)"
