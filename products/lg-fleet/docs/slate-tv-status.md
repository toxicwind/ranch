# SLATE TV launch — status (2026-10-29 tau)

## What's DONE and verified (not flailing, real evidence)
- **App + service install correctly in ONE ipk** (the flail-killer):
  `slate-combined.sh` — appinfo at ROOT + `services/<svc-id>/` subtree, single pkgid
  `com.toxicwind.slate`. AST-verified from ares package.js: `checkDirectory` finds
  appinfo(root) + `findServiceDir` walks depth-3 for services.json. Installs show
  applications/ + services/ + packages/ all present. (lg-diag: app ✅ service ✅ manifest ✅)
- **Dead streamers service was NOT the blocker** — svc.log was stale (2026-10-28 19:42).
  Current install is clean, only com.toxicwind.slate.server + pirate.refresh present.

## The REAL final blocker (root cause)
- TV system Node is **v8.12.0**. SLATE's `server.js` = modern Stremio server (needs 14+).
  webOS auto-starts the service via launch.js → crashes running modern server.js on Node 8.
- **Proven fix already exists**: Alexesmm/stremcompat-lg-webos bundles a Node-18 ARMv7
  runtime (`bin/node18`) + supervisor launch.js with `isUp()` socket probe +
  `launch.log`. This is the pattern-borrow to apply — not a new invention.

## Next (dedicated step)
1. Vendor a Node-18 ARMv7 runtime into services/com.toxicwind.slate.server/bin/
2. Rewrite launch.js as ES5 supervisor (borrow Alexesmm): spawn node18 + tvserver.js,
   log via launch.log, isUp probe on APP_PORT before responding `ready`.
3. slate-combined.sh --launch → lg-diag MUST go all-green (ports 8080/11470 + serverinfo).
4. lg-fleet MCP drop-in wrapping lg-deploy/lg-diag/lg-app/lg-key for autonomous installs.

## Crossrefs used
kieranbrown/stremio-webos · Alexesmm/stremcompat-lg-webos (both work on this TV class)