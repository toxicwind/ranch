# Browser Stack — canonical map (Sable, 2026-09-30)

What runs where on yote, how the pieces plug together, and what broke on 2026-09-30.

## The four routes

| Route | What | Where | How to reach it |
|---|---|---|---|
| A | Keeper: one persistent headed Chromium (nv-audit profile) | Xvnc :99, CDP http://127.0.0.1:9223 | `chromium.connectOverCDP("http://127.0.0.1:9223")` (playwright-core) |
| B | Browserless pool: throwaway Chromium per request | http://127.0.0.1:25130 (token in `/home/toxic/.browserless/.env`) | REST: POST /content /screenshot /pdf /function, GET /metrics |
| C | noVNC viewer: watch the keeper's screen in a browser | http://127.0.0.1:6080/vnc.html → websockify → Xvnc :5900 (VncAuth) | Any browser; password in `/home/toxic/.browserless/vncpass` |
| D | fast-browser skill: one-shot scripted flows (browsnap.ts) | skill, not a port | Uses Route A (keeper CDP) or its own launch — see skill README |

All four are pitchfork-managed except the pool internals. Daemons: `agent-display` (Xvnc :99),
`agent-viewer` (websockify :6080), `browser-keeper` (keeper.js → chromium :9223),
`browserless` (node :25130).

## Notes that save you an hour

- **:9223 serves HTTP AND the pipe.** Playwright's `launchPersistentContext` appends
  `--remote-debugging-pipe`, but Chrome still serves the HTTP CDP endpoint from
  `--remote-debugging-port=9223`. (Vex's "pipe wins, port dead" was wrong — the port was
  silent because no healthy browser existed, not because of the pipe.)
- **Keeper owns its profile exclusively** (`/home/toxic/.browserless/profiles/nv-audit`).
  The pool uses temp profiles per session — they never fight.
- **Crashpad shares one global dir** (`~/.config/google-chrome-for-testing/Crash Reports/`,
  including `settings.dat`) across ALL chromium-1223 launches on the box, regardless of
  `--user-data-dir`. A wedged crashpad there blocks every chrome launch box-wide (see incident).

## 2026-09-30 incident: the crashpad flock cascade

04:51–04:58 MDT: keeper chromes died with SIGTRAP at startup (5 minidumps in
`Crash Reports/pending/`; `status.json`: `exitCode=null, signal=SIGTRAP`).
05:01 MDT: a keeper chrome crashed; its `chrome_crashpad_handler` ptrace-stopped the chrome
(`T` state) and wedged 71+ minutes holding an exclusive FLOCK on the shared
`Crash Reports/settings.dat`. Every chrome launched after that — keeper relaunches,
browserless pool sessions, probes — blocked forever on the lock (`locks_lock_inode_wait`,
20+ waiters). Browserless /content 500'd after 30s; the keeper churned. The pool was never
broken — pure collateral damage.

Fix (all in this repo):
1. SIGKILLed the wedged cascade (~100 chrome/crashpad pids, explicit pid list).
2. `keeper/keeper.js`: `hardRecycle()` — graceful `ctx.close()` with a 10s ceiling, then
   SIGKILL any keeper chrome PIDs (found by profile dir in cmdline); startup stale-reap of
   lingering keeper chromes. A wedged browser can no longer pile up. (commit `74b6ce4`)
3. Verified: keeper up, :9223 serving, pool 200s, noVNC path green.

SIGTRAP root cause still open — if keeper chromes crash again, the minidumps + status.json
carry the trail, and the keeper now self-heals in ~30s instead of cascading.

## Benchmarks (2026-09-30, bench/bench-routes.sh)

- Route A (keeper :9223): connect 21ms, goto example.com 159ms, title 7ms, screenshot 112ms, eval+close 7ms — **~306ms total**.
- Route B (pool :25130): /content 307ms, /screenshot 302ms, /pdf 303ms, /function 254ms, /metrics 1ms — all HTTP 200.
- Route C (noVNC): vnc.html 200 in 15ms, RFB 003.008 handshake 3ms, WS upgrade 101 in 3ms.

## computer-use-linux fork

Upstream `agent-sh/computer-use-linux` v0.7.7 can't focus windows on Hyprland 0.56.2:
the `hl` global in the IPC Lua state is boolean `true`, not the API table (Hyprland bug;
`hyprctl repl 'type(hl)'` → `boolean`). Our fork **toxicwind/computer-use-linux** carries
Rook's three-strategy `activate_window` (Lua dispatch when `hl` is a table → `wlrctl
toplevel focus` → legacy `focuswindow`), strict stdout=="ok", cached `type(hl)` probe.
See the fork's CHANGELOG.
