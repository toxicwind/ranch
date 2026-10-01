#!/usr/bin/env bash
# claude shim wrapper — routes ALL NIM traffic through local nim-proxy.
# Original binary preserved at claude.nim-shim-real.
#
# Canonical source: toxicwind/ranch corral/bin/claude-shim-wrapper.sh
# (installed to ~/.local/bin/claude). Edit the canonical source and
# reinstall; do not hand-edit the installed copy.
set -euo pipefail
# Smithers preflight runs `claude auth status` expecting JSON with loggedIn.
# The NIM shim is not the real Claude Code CLI; report logged-in so
# proxy-routed workflows proceed (routing is validated by corral at startup).
if [[ "${1:-}" == "auth" && "${2:-}" == "status" ]]; then
  echo '{"loggedIn":true,"method":"nim-proxy"}'
  exit 0
fi
# Caller-provided proxy routing wins over the static secrets file.
# (2026-10-01: the corral CLI injects per-run NIM_BASE_URL / NVIDIA_API_KEY /
# NIM_MODEL / ANTHROPIC_BASE_URL pointing at the flock router :25193.
# Sourcing /home/toxic/.secrets unconditionally used to clobber them with
# the retired pre-flock :8000 endpoint whose upstream NVIDIA credentials 401,
# so every shim-spawned agent died with nim_kimi_UPSTREAM_401. The secrets
# file still supplies defaults for callers that set nothing.)
_keep_nim_base_url="${NIM_BASE_URL:-}"
_keep_nvidia_api_key="${NVIDIA_API_KEY:-}"
_keep_nim_model="${NIM_MODEL:-}"
_keep_anthropic_base_url="${ANTHROPIC_BASE_URL:-}"
if [[ -f /home/toxic/.secrets ]]; then
  set -a
  # shellcheck disable=SC1091
  source /home/toxic/.secrets
  set +a
fi
[[ -n "$_keep_nim_base_url" ]] && export NIM_BASE_URL="$_keep_nim_base_url"
[[ -n "$_keep_nvidia_api_key" ]] && export NVIDIA_API_KEY="$_keep_nvidia_api_key"
[[ -n "$_keep_nim_model" ]] && export NIM_MODEL="$_keep_nim_model"
[[ -n "$_keep_anthropic_base_url" ]] && export ANTHROPIC_BASE_URL="$_keep_anthropic_base_url"
unset _keep_nim_base_url _keep_nvidia_api_key _keep_nim_model _keep_anthropic_base_url
export NIM_BASE_URL="${NIM_BASE_URL:-http://127.0.0.1:25193/v1}"
# Shim reads NVIDIA_API_KEY; map the deprecated NIM_PROXY_API_KEY alias onto
# it ONLY as a fallback. 2026-10-01: the unconditional mapping clobbered the
# caller-provided 36-char flock key with the stale 55-char alias, so agents
# routed to flock :25193 were rejected with "missing or invalid proxy API key".
if [[ -z "${NVIDIA_API_KEY:-}" && -n "${NIM_PROXY_API_KEY:-}" ]]; then
  export NVIDIA_API_KEY="$NIM_PROXY_API_KEY"
fi
exec /home/toxic/.local/bin/claude.nim-shim-real "$@"
