#!/bin/bash
set -e
cd /home/toxic/tau
# CachyOS absolute path - MUST be inside bridge sandbox
export DEVIN_AGENTIC_HOME="$(pwd)/.sandbox/home"
mkdir -p "$DEVIN_AGENTIC_HOME"
# guard from omniroute executor: isIsolatedHome check
if [[ "$DEVIN_AGENTIC_HOME" != *".sandbox"* ]]; then
  echo "FAIL: must contain .sandbox segment"
  exit 1
fi
if [[ "$DEVIN_AGENTIC_HOME" != /* ]]; then
  echo "FAIL: must be absolute"
  exit 1
fi
echo "OK DEVIN_AGENTIC_HOME=$DEVIN_AGENTIC_HOME"
# normalize like the #12545 fix
node -e '
const v = process.env.DEVIN_AGENTIC_HOME;
const n = v.replace(/\\/g,"/");
const ok = n === "/home/bridge" || n.includes("/.sandbox/");
console.log("normalized:",n,"isolated:",ok);
if(!ok) process.exit(1);
'
