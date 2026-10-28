#!/usr/bin/env bash
# serve.sh — gemini-mcp own entrypoint (:25227). Maps the keyring SSOT
# (secretsmith env) onto server.py's expected GEMINI_API_KEY_N surface.
# Keyring is truth; ~/.secrets is retired (anomaly #8 class: set -a or the
# env dies at exec).
set -a
eval "$(secretsmith env 2>/dev/null | grep -E '^GEMINI_EAP_KEY|^NVIDIA_API_KEY')"
set +a

# server.py wants GEMINI_API_KEY_1..N: map the live EAP key in.
export GEMINI_API_KEY_1="${GEMINI_EAP_KEY_1:-${GEMINI_EAP_KEY:-}}"
# Port from the SSOT (config/ports.env) — never inherit stale ambient values
# (anomaly-17 class: env-dependent bind).
GEMINI_MCP_PORT=$(grep -E "^GEMINI_MCP_PORT=" /home/toxic/estate/config/ports.env | cut -d= -f2)
export GEMINI_MCP_PORT

cd /home/toxic/pens/ranch/barn/gemini-mcp
exec /home/toxic/.awrawr-mcp-venv/bin/python server.py
