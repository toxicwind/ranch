# lg-fleet — LG webOS TV deploy lane

Product plane for the **LG OLED65CXPUA** (`10.0.0.176`, webOS dev mode `prisoner@9922`).
Deploy SLATE (`com.toxicwind.slate`, webOS Stremio shell) from the `nuvio` product.

## Layout

```
lg-fleet/
├── bin/
│   ├── lg-app          # app lifecycle (install/launch/close/remove via ares)
│   ├── lg-deploy       # app deploy wrapper over slate-build + ares-install
│   ├── lg-diag         # quick ssh/ports smoke probe
│   ├── lg-diag-v2      # PRODUCTION: overlay + bus + SAM + jail + ports check
│   ├── lg-hot          # hot-reload deploy
│   ├── lg-key          # dev-mode key fetch/decrypt/provision/ssh-proof (auto-refresh)
│   └── lg-recover      # LS2 privilege fix: role patch + jail mount + sam restart + service start
├── scripts/
│   ├── slate-build.ts  # build ONE combined SLATE ipk (app + service under single id)
│   └── slate-deploy.sh # two-lane deploy: ares-install app + hbchannel exec service
├── docs/
│   └── slate-tv-status.md   # TV forensics + root-cause record
└── README.md           # this file
```

## Quick start

```bash
# 0. provision the LG key (requires LG_PASS = 6-char passphrase shown on TV dev-mode app)
LG_PASS=XXXXXX ~/.local/bin/lg-key 10.0.0.176

# 1. diagnose before any install
~/.local/bin/lg-diag-v2

# 2. build + install + launch SLATE (combined ipk, app + service)
LG_PASS=XXXXXX ~/.local/bin/lg-deploy

# 3. recover if the service bus is missing (dev-mode lacks LS2 grant)
~/.local/bin/lg-recover
```

## Tools

| Tool | What it does |
|------|--------------|
| `lg-key` | Fetch dev-mode RSA key from TV key server, decrypt with `LG_PASS`, provision `ares` device entry, prove via SSH. Idempotent: skips if key already healthy. |
| `lg-diag` | Quick SSH + port smoke probe. |
| `lg-diag-v2` | **Production check.** Overlay app dir, overlay service dir, SAM `listApps` cache, bus `listServices`, jail mount, ports 8080/11470. Run FIRST before any install. |
| `lg-recover` | Patch `com.palm.lunasend` role `allowedNames` (add `com.toxicwind.slate.server`), persist `/var/lib/webosbrew` jail mount, restart `sam`, start service via Homebrew Channel exec (`luna-send-pub hbchannel.service/exec`). |
| `lg-deploy` | Assert host Node ≤16 (ares CLI), build combined ipk via `slate-build.ts`, `ares-install`, `ares-launch`, then start service via hbchannel exec, run `lg-diag-v2`. |
| `lg-hot` | Hot-reload deploy. |
| `slate-build.ts` | Build ONE ipk containing `applications/com.toxicwind.slate/` + `services/com.toxicwind.slate.server/` under a single package id — prevents the webOS eviction bug (installing app and service separately replaces one with the other). |
| `slate-deploy.sh` | Orchestrates key → build → install → launch → diag. Two lanes: `ares` for the app, `hbchannel.service/exec` for the service bus. |

## tv-ssh-test

Connectivity smoke test for the TV ssh lane (key provisioning + ssh probe).

## SLATE TV status

See `docs/slate-tv-status.md` — the root-cause record: service never started because (a) webOS dev-mode install grants no LS2 bus privilege, (b) SAM caches `appinfo.json` at boot, (c) service id must match app id prefix. The combined ipk fixes (c); `lg-recover` fixes (a)/(b).

## Requirements

- `bun` (host, for `slate-build.ts`)
- `@webos-tools/cli` (`ares-install`, `ares-launch`, `ares-package`) under **Node ≤16** — Node 24 fails with `isDate`/`Callback already called` host errors
- LG webOS dev mode ON, key server on `9991`, SSH on `9922`
- `LG_PASS` env = 6-char case-sensitive passphrase shown on the TV Developer Mode app
