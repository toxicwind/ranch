#!/bin/bash
# Sequential live race: every chat model through pens-completions MCP surface.
OUT=/tmp/kappa/fleet-orb/race-results.jsonl
: > "$OUT"
N=0
while IFS= read -r M; do
  N=$((N+1))
  START=$(date +%s%N)
  RESP=$(curl -s --max-time 200 -X POST http://127.0.0.1:25252/mcp -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$N,\"method\":\"tools/call\",\"params\":{\"name\":\"pens_complete\",\"arguments\":{\"model\":\"$M\",\"prompt\":\"Reply with exactly: FLEET-OK\",\"max_tokens\":300}}}")
  END=$(date +%s%N)
  MS=$(( (END-START)/1000000 ))
  echo "{\"model\":\"$M\",\"ms\":$MS,\"resp\":$(python3 -c "import json,sys;print(json.dumps(sys.stdin.read()[:600]))" <<<"$RESP")}" >> "$OUT"
done < /tmp/kappa/fleet-orb/chat.txt
echo "RACE-DONE $N" >> "$OUT"
