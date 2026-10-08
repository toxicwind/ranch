#!/bin/bash
# launcher for browser-keeper (pitchfork daemon browser-keeper, CDP :9223).
# Runs headed on the isolated Xvnc :99 display (Forge 2026-09-21); the keeper owns the nv-audit profile.
unset WAYLAND_DISPLAY
export DISPLAY=":99"  # Forge 2026-09-21: isolated Xvnc display, not Chris's Hyprland session
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/1000}"
# 2026-10-08 warden: .browserless archived by home reorg; prefer live, fall back to archive.
_BLESS=/home/toxic/.browserless
[ -d "$_BLESS/browsers" ] || _BLESS=/home/toxic/archive/home-dirs-2026/.browserless
export PLAYWRIGHT_BROWSERS_PATH="$_BLESS/browsers"
mkdir -p /home/toxic/.browserless/keeper
exec node /home/toxic/estate/ranch/barn/browserless/keeper/keeper.js
