#!/bin/bash
# browser-toggle.sh: show/hide the keeper Chromium viewer window via TigerVNC / Hyprland.
# Connects to the isolated keeper display (Xvnc :99 at 127.0.0.1:5900).
set -u

VNC_PASSWD="/home/toxic/.browserless/vncpasswd"
VNC_HOST="127.0.0.1:5900"

if [ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
  for d in /run/user/1000/hypr/*/; do
    sig="$(basename "$d")"
    if HYPRLAND_INSTANCE_SIGNATURE="$sig" hyprctl clients -j >/dev/null 2>&1; then
      export HYPRLAND_INSTANCE_SIGNATURE="$sig"
      break
    fi
  done
fi

# Find running TigerVNC viewer window on Hyprland
INFO="$(hyprctl clients -j 2>/dev/null | python3 -c "import json,sys
cs=json.load(sys.stdin)
for c in cs:
    cls = c.get('class', '').lower()
    if 'vnc' in cls or 'tiger' in cls:
        print(str(c.get('address','')) + '|' + str(c.get('workspace',{}).get('name','')))
        break
")"

if [ -n "$INFO" ]; then
  ADDR="${INFO%%|*}"
  WS="${INFO##*|}"
  SEL="address:$ADDR"
  if [[ "$WS" == *"special"* ]]; then
    hyprctl dispatch "hl.dsp.window.move({workspace=\"e+0\", window=\"$SEL\"})" > /dev/null 2>&1 || true
    hyprctl dispatch "hl.dsp.focus({window=\"$SEL\"})" > /dev/null 2>&1 || true
  else
    hyprctl dispatch "hl.dsp.window.move({workspace=\"special:browser\", follow=false, window=\"$SEL\"})" > /dev/null 2>&1 || true
  fi
else
  # Launch TigerVNC viewer connected to keeper
  WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-1}" DISPLAY="${DISPLAY:-:0}" \
    vncviewer -RemoteResize -geometry 1600x900 -passwd "$VNC_PASSWD" "$VNC_HOST" >/dev/null 2>&1 &
fi
