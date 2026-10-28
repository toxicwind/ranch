# firefox-cdp

Firefox CDP (RemoteAgent/DevTools) enablement for the android-fleet Pixel devices.

## Why a dedicated repo
The Fenix installed on the Pixel (161.0a1, `org.mozilla.fenix`) is a **non-debuggable
release build on a `user` build** — `run-as` is refused, `prefs.js` is unreachable,
and CDP is therefore NOT exposed by default. The one live path is the in-app
**Settings → Developer tools → "Remote debugging via USB"** toggle (unlocked by
7 taps on the version string). This repo owns that procedure + the CDP socket
forwarding + verification.

## Structure
- `bin/enable-cdp.sh` — adb UI automation: launch settings, unlock dev tools,
  flip the toggle, forward the socket, verify.
- `bin/cdp-probe.sh` — CDP liveness check (`/json/version`) through the forward.

## Status
2026-10-27: diagnosed (see table below); enablement in progress.

| Check | Result |
|---|---|
| adb | `10.0.0.77:43945` device (komodo_beta, Pixel 9 Pro XL, Android 17) |
| Firefox | `org.mozilla.fenix` 161.0a1 + `org.mozilla.fennec_fdroid`, both `flags=0x0` |
| build | `ro.build.type=user`, `ro.debuggable=0` |
| run-as | refused (`package not debuggable`) |
| prefs.js | unreachable |
| delend-code-race | no borrow (hard boundary) |
