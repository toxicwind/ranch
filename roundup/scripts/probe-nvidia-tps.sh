#!/bin/bash
source /home/toxic/.secrets
MODELS=(
  "google/diffusiongemma-26b-a4b-it"
  "meta/llama-3.2-11b-vision-instruct"
  "meta/muse-glimmer-30b"
  "nvidia/ising-calibration-1.5-31b"
  "nvidia/nemotron-3-super-120b-a12b"
  "nvidia/nemotron-3.5-content-safety"
  "nvidia/nemotron-3.5-lightning-30b-a3b"
  "nvidia/nemotron-parse-2.0"
  "nvidia/riva-translate-4b-instruct-v1.1"
  "nvidia/riva-translate-4b-instruct-v2"
  "openai/gpt-oss-20b"
  "poolside/laguna-xs-2.1"
  "z-ai/glm-5.3-flash"
)
OUT=/home/toxic/estate/ranch/roundup/results/nvidia-tps.jsonl
: > $OUT
for m in "${MODELS[@]}"; do
  echo "probing $m"
  START=$(date +%s%3N)
  RESP=$(curl -s -m 30 -H "Authorization: Bearer $NIM_API_KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}],\"max_tokens\":16}" \
    https://integrate.api.nvidia.com/v1/chat/completions)
  END=$(date +%s%3N)
  MS=$((END - START))
  TOKENS=$(echo "$RESP" | jq -r ".usage.completion_tokens // 0")
  TPS=$(echo "scale=1; $TOKENS * 1000 / $MS" | bc 2>/dev/null || echo 0)
  echo "{\"model\":\"$m\",\"tps\":$TPS,\"ms\":$MS,\"tokens\":$TOKENS}" >> $OUT
  echo "  $m: ${TPS} tps (${MS}ms, ${TOKENS} tokens)"
done
echo "wrote $OUT"
