# 🤠 lasso

**Hyprland-native desktop control MCP** — you lasso windows to control them.

Forked from [IlyasKhallouki/hypruse](https://github.com/IlyasKhallouki/hypruse) v0.11.0
(commit `9a84bdb`, MIT licensed) into the ranch monorepo as real tracked files.
Upstream `LICENSE` preserved at `LICENSE`.

## Why we forked

`computer-use-linux` (the previous desktop-control MCP in gatehouse) fails on
our Hyprland 0.56.2 session: its `activate_window` sends legacy dispatcher
strings that the Lua config manager rejects, and it drags in a ydotool daemon
+ xdg portals just to press keys.

hypruse speaks Hyprland's own language:

- **State via stable `hyprctl -j` IPC** — monitors, workspaces, windows, cursor,
  layers, binds in one batched call (~4x faster than separate queries).
- **Native Wayland input** — pointer via compositor cursor dispatcher +
  virtual-pointer wire client; keyboard via `wtype` over
  `zwp_virtual_keyboard_v1` (no uinput guessing, no daemon).
- **Screenshots via `grim`** with logical↔pixel coordinate mapping, so a pixel
  in the image maps back to a clickable point.
- **Probes the config manager** (`hyprlang` vs `lua`) and speaks whichever the
  session runs — the exact failure mode that killed computer-use-linux here.

## Ranch fork additions

- **`lua_ipc_broken()` probe** (`src/hypruse/hyprctl.py`): detects when a
  session's IPC Lua state lacks the `hl` API table and raises a clear
  `HyprctlError` instead of a raw Lua traceback. See `COMPAT.md`.
- This README + `COMPAT.md`.

## Deps (all present on yote)

`hyprctl`, `grim`, `wtype`, `wl-copy`, `python3`, `uv`.
Python deps: `mcp>=1.2,<2` (installed via `uv sync` into `lasso/.venv/`, gitignored).

## Use via gatehouse

`hypruse` with no arguments runs the MCP stdio server — that is what gatehouse
spawns:

```json
{
  "name": "lasso",
  "protocol": "stdio",
  "command": "uv",
  "args": ["run", "--directory", "/home/toxic/sovereign/projects/range/ranch/lasso", "hypruse"]
}
```

Tools (via `retrieve_tools` → `call_tool_*`): `desktop`, `screenshot`, `zoom`,
`ui`, `marks`, `pointer`, `keyboard`, `click_ui`, `hypr`, `launch`, `binds`,
`clipboard`, `use_bind`, `wait_for`, `sequence` — plus the shell-verb CLI
(`hypruse VERB --help`) for agents that run commands directly.

Read-only verbs (safe to probe): `desktop`, `screenshot`, `zoom`, `ui`,
`marks`, `binds`. Set `HYPRUSE_READONLY=1` to hard-refuse all acting verbs.

## CLI quickstart

```bash
cd /home/toxic/sovereign/projects/range/ranch/lasso
export HYPRLAND_INSTANCE_SIGNATURE=$(ls /run/user/1000/hypr/ | head -1)
uv run hypruse desktop --json | head -c 600   # window list
uv run hypruse screenshot --out /tmp/shot.png # screenshot
uv run hypruse binds --json | head -c 400      # keybinds
```

## Upstream

- Repo: https://github.com/IlyasKhallouki/hypruse
- Fork point: v0.11.0 (`9a84bdb10fe755527b77fcc388d9a452526b9c5f`), 2026-09-30
- Sync policy: cherry-pick or re-fork on upstream releases; fork diffs stay
  minimal and documented here.

<!-- mcp-name: io.github.IlyasKhallouki/hypruse -->
