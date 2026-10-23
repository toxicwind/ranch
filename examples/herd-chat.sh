#!/usr/bin/env bash
# herd-chat.sh — chat with a local model through herd's OpenAI-compatible API.
# No key needed: herd serves on-box models.
# Run: ./examples/herd-chat.sh "why is the sky blue?"
set -euo pipefail

MODEL="${MODEL:-beellama/exaone-4-0-1-2b-q4km}"
PROMPT="${1:-moo}"

curl -s -m 120 http://127.0.0.1:25100/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json,sys
print(json.dumps({'model': sys.argv[1], 'messages': [{'role': 'user', 'content': sys.argv[2]}]}))" "$MODEL" "$PROMPT")" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
