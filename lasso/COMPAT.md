# COMPAT.md — Hyprland 0.56.x IPC Lua-state notes

## The problem (observed 2026-09-30, ranch's own box)

Hyprland 0.56 runs one of two config managers, chosen by the config file's
extension (`hyprland.lua` → Lua manager). Upstream hypruse handles this: it
probes `hyprctl -j status` → `configProvider` and translates legacy dispatcher
strings into `hl.dsp.*` Lua expressions for `hyprctl dispatch`.

**But** on the ranch's Nix-built Hyprland 0.56.2
(`efb50993780079460b0cbed1363e2166a2de1d9f`, `~/.config/hypr/hyprland.lua`):

- the *config* Lua state has the full `hl.*` API (`hl.bind`, `hl.dsp.*` all
  work in `hyprland.lua` and its modules),
- the *IPC* Lua state (`hyprctl eval`, `hyprctl dispatch`, and the raw
  `.socket.sock`) exposes `hl` as a **boolean `true`** — a mode flag, not the
  API table.

Every `hl.dsp.*` expression through IPC fails with:

```
attempt to index a boolean value (global 'hl')
```

Upstream `computer-use-linux` v0.7.7 (latest, 2026-09-29) has the same broken
`hl.dsp.focus` code — this is a Hyprland bug, not an MCP bug.

## The fix: three-strategy focus (ranch/lasso fork)

`hypruse.hyprctl.focus_window(address)` tries, in order:

1. **hyprctl dispatch** — Lua `hl.dsp.*` when the IPC Lua state has the API
   table (normal 0.56 builds), else the legacy dispatcher string (hyprlang
   sessions). Strict `stdout == "ok"` check, not just exit status.
2. **wlrctl** — `wlrctl toplevel focus "<app-id>"` via Wayland
   foreign-toplevel-management. Address → app-id mapped through
   `hyprctl -j clients` (`class` field). **Verified live 2026-09-30**: flips
   the active window on the broken-hl build where strategy 1 cannot run.
   Needs `wlrctl` on PATH (`/usr/local/bin/wlrctl` on yote).
3. **Legacy focuswindow** — last resort for hyprlang sessions.

The `type(hl)` probe (`lua_ipc_broken()`) is cached at startup — one
`hyprctl eval` per process, not per call. `dispatch()` itself still raises a
clear `HyprctlError` pointing here when the IPC Lua state is broken, instead
of surfacing the raw Lua traceback.

## What works on the ranch's 0.56.2 build

| tool / verb | status |
|---|---|
| `desktop` (monitors/workspaces/windows/cursor/layers) | ✅ via `hyprctl -j` |
| `screenshot`, `zoom` (grim) | ✅ |
| `ui`, `marks` (a11y tree) | ✅ |
| `binds` | ✅ |
| `wait_for` (event socket) | ✅ |
| `hypr focus_window` | ✅ via wlrctl fallback |
| `keyboard` via wtype, pointer buttons via virtual-pointer | ✅ (Wayland protocols, no dispatch) |
| other `hypr` dispatch verbs (workspace, close, fullscreen…) | ⚠️ raise clear error on this build; work where hl is the API table |

## If this gets fixed upstream

A Hyprland build where the IPC Lua state carries the real `hl` table makes
`lua_ipc_broken()` return `False` and strategy 1 handles everything — no
lasso change needed. Re-test with:

```bash
hyprctl eval "return type(hl.dsp)"   # want: no "boolean" error
hyprctl dispatch 'hl.dsp.focus({ workspace = 1 })'
```

Hyprland issue to file: "`hl` global is boolean `true` instead of API table
in IPC Lua state on 0.56.2".
