#!/usr/bin/env bash
# roundup-bench.sh — GuideLLM-native benchmark across every provider.
# Uses the fork's instruction_following scorer via scenario YAML.
# Rank: quality desc, then p50 latency asc.

set -uo pipefail

FORK=/home/toxic/sovereign/projects/range/ranch/roundup/fork
GUIDELLM=/home/toxic/.local/bin/guidellm
VENV=/home/toxic/.venv-guidellm
OUT=/home/toxic/sovereign/projects/range/ranch/roundup/results/bench
SCEN=/tmp/guidellm-scenario.yaml
PROMPTS=/home/toxic/sovereign/projects/openrouter-probe/abstract-prompts.txt
SENTINEL="ABSTRACT-7X3Q"

mkdir -p "$OUT"

NIM_KEY="$(grep -E '^NVIDIA_API_KEY=' /home/toxic/.9router/env.systemd | head -1 | cut -d= -f2-)"
FLOCK_KEY="$(cat /home/toxic/.tau/flock.key 2>/dev/null || echo '')"
VR_KEY="$(grep -E '^API_KEY_SECRET=' /home/toxic/.config/vansrouter/env | cut -d= -f2-)"

G='\033[0;32m'; C='\033[0;36m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
ok()  { echo -e "  ${G}✓${N} $1"; }
bad() { echo -e "  ${R}✗${N} $1"; }
skip(){ echo -e "  ${Y}·${N} $1"; }
hdr() { echo -e "\n${C}══ $1 ══${N}"; }

# ─────────────────────────────────────────────────────────────────────
hdr "1. Verify fork + scoring API"

[ -d "$FORK/.git" ] || { bad "fork missing: $FORK"; exit 1; }
ok "fork: $(git -C "$FORK" rev-parse --short HEAD)"

"$VENV/bin/python" -c '
from guidellm.benchmark.scoring import list_scorers
print("  scorers:", ", ".join(list_scorers()))
' 2>/dev/null || {
  bad "scoring API import failed"
  "$VENV/bin/python" -c 'from guidellm.benchmark.scoring import list_scorers' 2>&1 | head -3 | sed 's/^/    /'
  exit 1
}

# ─────────────────────────────────────────────────────────────────────
hdr "2. Build scenario with instruction_following scorer"

# Read the sentinel from the scenario, use file data with the abstract prompts
cat > "$SCEN" <<YAML
backend:
  kind: openai_http
  target: PLACEHOLDER
  model: PLACEHOLDER
  api_key: PLACEHOLDER
  validate_backend: false
  stream: false
data:
  - kind: text_file
    path: $PROMPTS
profile:
  kind: synchronous
constraint:
  kind: max_requests
  count: 3
tokenizer:
  kind: huggingface_auto
  model: gpt2
metrics:
  kind: generative
  scorers: ["instruction_following"]
  scorer_config:
    instruction_following:
      sentinel: "$SENTINEL"
      strip_thinking: true
output:
  - kind: json
    path: PLACEHOLDER
disable_console_interactive: true
YAML

ok "scenario template: $SCEN"

# ─────────────────────────────────────────────────────────────────────
hdr "3. Discover reachable models per provider"

REACH="$OUT/reachability.tsv"
printf 'provider\tmodel\tcode\n' > "$REACH"

discover() {
  local name="$1" url="$2" auth="$3" limit="${4:-5}"
  local hdrs=(-H 'Content-Type: application/json')
  [ -n "$auth" ] && hdrs+=(-H "Authorization: Bearer $auth")

  local models
  models="$(curl -s "${hdrs[@]}" "$url/models" --max-time 10 2>/dev/null | jq -r '(.data // .)[].id' 2>/dev/null | head -"$limit")"
  local count; count="$(echo "$models" | grep -c .)"
  echo "  ── $name ($count models) ──"

  while IFS= read -r m; do
    [ -z "$m" ] && continue
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url/chat/completions" \
      "${hdrs[@]}" \
      -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1,\"stream\":false}" \
      --max-time 15 2>/dev/null || echo ERR)"
    printf '%s\t%s\t%s\n' "$name" "$m" "$code" >> "$REACH"
    [ "$code" = "200" ] && printf '    %s %s\n' "${G}✓${N}" "$m"
  done <<< "$models"
}

# NIM: first 15 (from /models, all 82 known)
discover "nim" "https://integrate.api.nvidia.com/v1" "$NIM_KEY" 15
# herd: first 5
discover "herd" "http://127.0.0.1:25100/v1" "" 5
# sov: first 5
discover "sov" "http://127.0.0.1:25104/v1" "" 5
# flock: first 5
discover "flock" "http://127.0.0.1:25193/v1" "$FLOCK_KEY" 5
# vansrouter: all 12
discover "vr" "http://127.0.0.1:20128/v1" "$VR_KEY" 12

REACHABLE="$(awk -F'\t' 'NR>1 && $3=="200" {print $1"|"$2}' "$REACH")"
REACHABLE_COUNT="$(echo "$REACHABLE" | grep -c .)"
echo
echo "  reachable: $REACHABLE_COUNT"

if [ "$REACHABLE_COUNT" = "0" ]; then
  bad "no reachable models — nothing to bench"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────
hdr "4. Run GuideLLM per model"

RESULTS="$OUT/results.tsv"
printf 'provider\tmodel\tquality\tttft_ms\tp50_ms\ttps\n' > "$RESULTS"

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
  local scen="$OUT/$safe.scenario.yaml"

  # substitute placeholders
  local api_key_yaml=""
  [ -n "$auth" ] && api_key_yaml="  api_key: $auth"

  {
    echo "backend:"
    echo "  kind: openai_http"
    echo "  target: $url"
    echo "  model: $model"
    [ -n "$auth" ] && echo "  api_key: $auth"
    echo "  validate_backend: false"
    echo "  stream: false"
    echo "data:"
    echo "  - kind: text_file"
    echo "    path: $PROMPTS"
    echo "profile:"
    echo "  kind: synchronous"
    echo "constraint:"
    echo "  kind: max_requests"
    echo "  count: 3"
    echo "tokenizer:"
    echo "  kind: huggingface_auto"
    echo "  model: gpt2"
    echo "metrics:"
    echo "  kind: generative"
    echo '  scorers: ["instruction_following"]'
    echo "  scorer_config:"
    echo "    instruction_following:"
    echo "      sentinel: \"$SENTINEL\""
    echo "      strip_thinking: true"
    echo "output:"
    echo "  - kind: json"
    echo "    path: $out_json"
    echo "disable_console_interactive: true"
  } > "$scen"

  printf '  %-6s %-45s ' "$prov" "$model"

  timeout 180 "$GUIDELLM" run --config "$scen" >"$OUT/$safe.log" 2>&1
  local rc=$?

  if [ $rc -ne 0 ] || [ ! -f "$out_json" ]; then
    printf '%s\n' "${R}FAIL${N}"
    return 1
  fi

  local quality ttft p50 tps
  quality="$(jq -r '(.benchmarks[0].quality.instruction_following.mean // .benchmarks[0].quality.instruction_following // 0)' "$out_json" 2>/dev/null)"
  ttft="$(jq -r '(.benchmarks[0].metrics.time_to_first_token.mean // .benchmarks[0].metrics.time_to_first_token // 0)' "$out_json" 2>/dev/null)"
  p50="$(jq -r '(.benchmarks[0].metrics.request_latency.p50 // .benchmarks[0].metrics.request_latency.mean // 0)' "$out_json" 2>/dev/null)"
  tps="$(jq -r '(.benchmarks[0].metrics.output_tokens_per_second.mean // .benchmarks[0].metrics.output_tokens_per_second // 0)' "$out_json" 2>/dev/null)"

  # normalize nulls
  [ "$quality" = "null" ] && quality=0
  [ "$ttft" = "null" ] && ttft=0
  [ "$p50" = "null" ] && p50=0
  [ "$tps" = "null" ] && tps=0

  printf '%s q=%-5s ttft=%-8s p50=%-8s tps=%s\n' "${G}OK${N}" "$quality" "$ttft" "$p50" "$tps"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$prov" "$model" "$quality" "$ttft" "$p50" "$tps" >> "$RESULTS"
  return 0
}

for entry in $REACHABLE; do
  prov="${entry%%|*}"; model="${entry#*|}"
  run_one "$prov" "$model"
done

# ─────────────────────────────────────────────────────────────────────
hdr "5. Ranking"

RANK="$OUT/ranking.md"
{
  echo "# GuideLLM Model Ranking — $(date '+%Y-%m-%d %H:%M')"
  echo
  echo "Scorer: instruction_following | Sentinel: $SENTINEL"
  echo "Rank: quality desc, p50 latency asc"
  echo
  echo "| rank | provider | model | quality | ttft_ms | p50_ms | tps |"
  echo "|------|----------|-------|---------|---------|--------|-----|"
  awk -F'\t' 'NR>1 {printf "%.4f\t%.2f\t%.2f\t%.2f\t%s\t%s\n", $3, $4, $5, $6, $1, $2}' "$RESULTS" | \
    sort -t$'\t' -k1,1nr -k3,3n | \
    awk -F'\t' '{printf "| %d | %s | %s | %.2f | %.0f | %.0f | %.1f |\n", NR, $5, $6, $1, $2, $3, $4}'
} > "$RANK"

cat "$RANK"

hdr "DONE"
echo "  ranking: $RANK"
echo "  raw:     $OUT/*.json"
