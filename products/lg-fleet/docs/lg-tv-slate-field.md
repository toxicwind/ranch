# LG webOS TV — SLATE deployment & forensics (2026-10-29)

Field notes from the SLATE-for-fleet bring-up. Reversed from a long live-debug
session; treat the original devs' ares/webOS assumptions as suspect and verify
against THIS record + `lg-diag` before re-flailing.

## 1. The TV lane (physical + SSH)

| Item | Value |
|---|---|
| TV | LG OLED65CXPUA (webOS 7.x), dev-mode ON (key server must be foregrounded) |
| IP | `10.0.0.176` | 
| SSH | `prisoner@10.0.0.176:9922` (webOS dev-mode SSH, NOT root) |
| key server | `http://10.0.0.176:9991/webos_rsa` (only answers while Developer Mode app on screen) |
| passphrase | 6-char case-sensitive on TV screen; env `LG_PASS` |
| ares device | `lg-tv` (entry in `~/.webos/tv/novacom-devices.json`) |
| root channel | `~/.local/bin/lgroot '<cmd>'` (Homebrew root exec; returns perms denied on current firmware — see §5) |

### Key files (all under `~/.ssh/`)
- `lg-tv_webos` — ENCRYPTED key from server (1766B)
- `lg-tv_webos_clear` — decrypted PKCS#8 (`BEGIN PRIVATE KEY`)
- `lg-tv_webos_trad` — **TRADITIONAL RSA** (`BEGIN RSA PRIVATE KEY`) — **THE ONE ares/webOS accepts**
- `lg-tv_webos_pkcs8` — retained PKCS#8 copy

**⚠ KEY FORMAT GOTCHA (cost us an hour):** ares throws
`Cannot parse privateKey: Unsupported key format` for PKCS#8. webOS tooling
requires traditional RSA: `openssl rsa -in KEY_clear -traditional -out KEY_trad`.
`lg-key` now does this automatically + provisions the ares entry + ssh-proves.

## 2. webOS package layout — the REAL dirs (not the docs)

Two partitions, easy to confuse (this confusion caused ~40min of false "not
installed" reads):

| Path | Partition | Writable? | Meaning |
|---|---|---|---|
| `/media/cryptofs/apps/usr/palm/...` | mmcblk0p56 | RO (system) | NOT where dev apps go |
| `/media/developer/apps/usr/palm/...` | dev overlay | **RW** | **real install home** |

Installed dev apps/services:
```
/media/developer/apps/usr/palm/applications/<appid>/     # appinfo.json, index.html
/media/developer/apps/usr/palm/services/<svcid>/         # launch.js, server.js, package.json
/media/developer/apps/usr/palm/packages/<appid>/         # packageinfo.json
```

**Install success ≠ files visible on first try** — `ares-install` says
`Success` but the app lands in `/media/developer` (overlay), which `ls` on the
RO crypto path misses. Always read `/media/developer/apps/usr/palm/`.

## 3. Building the ipk — the ares contract (AST-verified in package.js)

`ares-package`'s `checkDirectory` decides by which manifest it finds at the
packaged ROOT:

### App ipk
- root has `appinfo.json` → app package →
  `usr/palm/applications/<id>/` in data.tar
- `--pkgid` optional (id comes from appinfo)

### Service ipk (the trap)
- root has `services.json` → service dir. **NEVER put `packageinfo.json` at the
  packaged root** — that always errors `NOT_PACKAGE_WITH_PKGDIR`
  ("Cannot package the directory with package directory")
- `--pkgid` MUST be a prefix of the service id, or
  `ServiceID must start with package id <...>`

### COMBINED app+service (THE WINNER — single package, no eviction)
```
stage/
  appinfo.json                # at ROOT → app detected (depth-0)
  <app files...>
  services/
    com.toxicwind.slate.server/
      services.json           # → service subdir found (depth-3 walk)
      launch.js  server.js  package.json  ...
```
Package the **stage parent** with `--pkgid com.toxicwind.slate`. Result:
ONE ipk with all three trees:
```
usr/palm/applications/com.toxicwind.slate/
usr/palm/services/com.toxicwind.slate.server/
usr/palm/packages/com.toxicwind.slate/
```

**WHY NOT SEPARATE app+service ipks:** both carry package id
`com.toxicwind.slate`, so installing one REPLACES the other (webOS axiom) —
the last one always evicts the first. Only the combined single-package ipk
keeps both. This was the "why does the app keep disappearing" mystery.

`scripts/slate-build.ts` (in nuvio-webos) implements exactly this.

## 4. Service runtime — why "Loading Stremio..." forever

Symptoms: app installs, service dir + manifest present, but `lg-diag` shows
8080/11470 not listening / serverinfo dead / launch.log missing.

Root causes found (in order of likeliness):
1. **Service process never starts** — webOS auto-launches a service only when
   the app's luna call is *permitted*. Dev-mode (`ares-install`) apps may lack
   the LS2 privilege to call `luna://com.toxicwind.slate.server/start`. The
   reliable path (kieranbrown/stremio-webos) ships via **webOSbrew/Homebrew
   Channel**, which installs with full service bus grant.
2. **Node version** — TV runs **Node 8.12** (`node -v`). Server.js built for
   modern Node crashes on boot if it uses ES6+ syntax. kieranbrown bundles a
   Node-18 ARMv7 runtime + supervisor (launch.js) precisely to escape this.
3. **Stale service name collision** — old `com.toxicwind.streamers.server`
   could hold the bus name, blocking re-registration (`Error: ... already
   exists`). Clean stale services first.

Legacy `service/launch.js` pre-dates logging — a silent crash looked identical
to "not started". Our version writes `launch.log` + supervisor + `isUp` now
(borrowed from Alexesmm, ES5 to survive Node 8).

## 5. Diagnostics that WORK

| Tool | What | Notes |
|---|---|---|
| `lg-key [ip] [pass]` | key auto-refresh + provision + ssh-prove | now does PKCS8→trad conversion |
| `lg-diag` | 8-point health: ssh/app/service/manifest/ports/serverinfo/log | **run FIRST** |
| `lg-app list/remove/launch` | app lifecycle | |
| `lg-deploy` | package+install+launch app dir | |
| `lg-hot` | watch+redeploy dev loop | |
| `scripts/slate-deploy.sh` | 5-step full lane, self-healing | `LG_PASS=...` on rotation |
| `lgroot '<cmd>'` | Homebrew root exec | **current firmware: luna-send Permission denied** even as root — don't rely |

**Logs:** `/tmp/svc.log` (service stdout/stderr, per-launch), `/tmp/srvboot.log`.

## 6. GitHub identity — the pairs rule (do not regress)

`pairs-merge.py` now ingests `substr:`/`word:`/`path:` kinds (not just path
relocations) into `maps/rename.json`; `pairs-apply.py` applies them
semantically (substr=case-sensitive, word=`\b` boundary). The aether/streamers
→ slate + io.strem.tv → com.toxicwind.slate rules live in
`sources/nuvio__nuvio-webos__aether-rename.pairs`. Run `pairs-merge.py` then
`pairs-apply.py check <tree>` after any rename.

**Do NOT rename upstream Stremio engine strings** (www bundles, internal
"Stremio Server") — it's a vendored fork; the engine self-identifying as
Stremio is correct. Rename only your layer: package/app/service ids,
`com.toxicwind.slate*`, repo, branding.

## 7. This session's file map (what lives where)

| Task | Product home |
|---|---|
| Deploy lane | `lg-fleet/scripts/slate-deploy.sh` |
| Key auto | `lg-fleet/bin/lg-key` |
| Health | `lg-fleet/bin/lg-diag` |
| App lifecycle | `lg-fleet/bin/lg-app` |
| ipk builder | `lg-fleet/scripts/slate-build.ts` |
| Status | `lg-fleet/docs/slate-tv-status.md` |
| Pairs merge/apply | `geode/products/pairs/bin/pairs-{merge,apply}.py` |