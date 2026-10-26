# qs-common.sh — shared helpers for the qs-* entrypoints (estate-scripts/projects/shell).
# Source it from a qs-* script AFTER computing QS_HOME:
#   QS_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
#   . "$QS_HOME/lib/qs-common.sh"

# Canonical locations. Override via env for testing.
: "${QS_CONFIG_NAME:=ii}"
: "${QS_HOME:?QS_HOME must be set by the caller}"
QS_CANON_CONFIG="$QS_HOME/ii/dots/.config/quickshell/$QS_CONFIG_NAME"
QS_USER_CONFIG="$HOME/.config/quickshell/$QS_CONFIG_NAME"
QS_UNIT="quickshell-ii.service"
QS_LAUNCH_LOG="$HOME/.local/state/quickshell/launch.log"

# qs_wayland_alive — true when the unix socket actually accepts connections.
# Guards against stale wayland-N files left behind by a dead/restarted
# compositor: a leftover socket file is -S but nothing listens, and Qt aborts
# with "Failed to create wl_display (Connection refused)" -> SIGABRT -> systemd
# Restart=always fork/abort loops (15k+ restarts observed on awrawr-pc).
qs_wayland_alive() {
  local sock="${1:-}"
  [ -S "$sock" ] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$sock" <<'PY' 2>/dev/null
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    s.connect(sys.argv[1])
except OSError:
    sys.exit(1)
s.close()
PY
  else
    # no python3: fall back to existence, best effort
    return 0
  fi
}

# qs_detect_env — fill in the session env quickshell needs when launched
# outside a full login shell (systemd unit, ssh, cron). Picks a CONNECTABLE
# wayland socket, not merely the first leftover file.
qs_detect_env() {
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
  if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    local s found="" first=""
    for s in "$XDG_RUNTIME_DIR"/wayland-*; do
      [ -e "$s" ] || continue
      case "$s" in *.lock) continue ;; esac
      [ -z "$first" ] && first="$(basename "$s")"
      if qs_wayland_alive "$s"; then found="$(basename "$s")"; break; fi
    done
    WAYLAND_DISPLAY="${found:-${first:-wayland-1}}"
  fi
  export WAYLAND_DISPLAY
  if [ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ] && [ -d "$XDG_RUNTIME_DIR/hypr" ]; then
    HYPRLAND_INSTANCE_SIGNATURE="$(ls -t "$XDG_RUNTIME_DIR/hypr" 2>/dev/null | head -1)"
    export HYPRLAND_INSTANCE_SIGNATURE
  fi
  export QT_QPA_PLATFORM="${QT_QPA_PLATFORM:-wayland}"
}

qs_pids() { pgrep -x quickshell 2>/dev/null || true; }

qs_unit_active() { systemctl --user is-active --quiet "$QS_UNIT" 2>/dev/null; }

# qs_config_target — the shell.qml the live config name resolves to.
qs_config_target() {
  local name="${1:-$QS_CONFIG_NAME}"
  printf '%s/.config/quickshell/%s/shell.qml' "$HOME" "$name"
}

# qs_ipc_instances — list instance ids the IPC client can see for config $1.
qs_ipc_instances() {
  local name="${1:-$QS_CONFIG_NAME}"
  /usr/bin/quickshell -c "$name" ipc show 2>&1 || true
}

qs_log() {
  mkdir -p "$(dirname "$QS_LAUNCH_LOG")"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$QS_LAUNCH_LOG"
}
