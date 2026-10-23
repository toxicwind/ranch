#!/usr/bin/env bash
# flock-free.sh — route by STRATEGY, not by model.
# Asks flock for "free" and lets it pick the best free-tier provider
# (NIM first, then OpenRouter-free, …) with 429 rotation and circuit
# breakers handled inside the router.
# Needs: FLOCK_KEY env (a flock client key).
# Run: FLOCK_KEY=... ./examples/flock-free.sh "why is the sky blue?"
set -euo pipefail

: "${FLOCK_KEY:?set FLOCK_KEY to a flock client key}"
PROMPT="${1:-moo}"

curl -s -m 180 http://127.0.0.1:25193/v1/chat/completions \
  -H "Authorization: Bearer ${FLOCK_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json,sys
print(json.dumps({'model': 'free', 'messages': [{'role': 'user', 'content': sys.argv[1]}]}))" "$PROMPT")" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
