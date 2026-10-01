#!/usr/bin/env bash
# Regression test for claude-shim-wrapper.sh key precedence (2026-10-01).
# The deprecated NIM_PROXY_API_KEY alias must NEVER clobber an explicitly
# provided NVIDIA_API_KEY. Run: bash corral/bin/claude-shim-wrapper.test.sh
set -u
WRAPPER="$(cd "$(dirname "$0")" && pwd)/claude-shim-wrapper.sh"
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

# Stub the real binary: dump the env it receives.
mkdir -p "$TMPD/bin"
cat > "$TMPD/bin/claude.nim-shim-real" <<'EOF'
#!/usr/bin/env bash
echo "GOT_NVIDIA_API_KEY=${NVIDIA_API_KEY:-<empty>}"
echo "GOT_NIM_BASE_URL=${NIM_BASE_URL:-<empty>}"
EOF
chmod +x "$TMPD/bin/claude.nim-shim-real"

# Point the wrapper at the stub by copying it and rewriting the exec line.
cp "$WRAPPER" "$TMPD/wrapper.sh"
sed -i "s|/home/toxic/.local/bin/claude.nim-shim-real|$TMPD/bin/claude.nim-shim-real|" "$TMPD/wrapper.sh"
# Isolate from the real secrets file for deterministic results.
sed -i "s|/home/toxic/.secrets|$TMPD/empty-secrets|" "$TMPD/wrapper.sh"
touch "$TMPD/empty-secrets"
touch "$TMPD/empty-bashrc"
# BASH_ENV would otherwise inject the real ~/.bashrc.env (+ real .secrets)
# into every bash subprocess and make results environment-dependent.
export BASH_ENV="$TMPD/empty-bashrc"

pass=0; fail=0
check() { # name expected_var expected_value -- env...
  local name="$1" want_var="$2" want="$3"; shift 3
  local got
  got="$(env -u NVIDIA_API_KEY -u NIM_PROXY_API_KEY -u NIM_BASE_URL "$@" bash "$TMPD/wrapper.sh" dummy-arg 2>/dev/null | grep "^GOT_${want_var}=" | cut -d= -f2-)"
  if [[ "$got" == "$want" ]]; then
    echo "PASS: $name"; pass=$((pass+1))
  else
    echo "FAIL: $name (want [$want] got [$got])"; fail=$((fail+1))
  fi
}

echo "--- wrapper key-precedence tests ---"
check "caller key wins over alias" NVIDIA_API_KEY "CALLER_KEY_36" \
  NVIDIA_API_KEY="CALLER_KEY_36" NIM_PROXY_API_KEY="ALIAS_KEY_55"
check "alias used as fallback when no caller key" NVIDIA_API_KEY "ALIAS_KEY_55" \
  NIM_PROXY_API_KEY="ALIAS_KEY_55"
check "caller key kept when no alias" NVIDIA_API_KEY "CALLER_KEY_36" \
  NVIDIA_API_KEY="CALLER_KEY_36"
check "explicit base URL preserved" NIM_BASE_URL "http://127.0.0.1:25193/v1" \
  NIM_BASE_URL="http://127.0.0.1:25193/v1"

echo "--- $pass passed, $fail failed ---"
[[ "$fail" -eq 0 ]]
