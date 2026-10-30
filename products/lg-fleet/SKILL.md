# Master orchestration skill — slate TV netflix-max lane

## Purpose
Deploy and verify a Netflix-grade UX on the LG webOS TV (`OLED65CXPUA`, `prisoner@10.0.0.176:9922`) for the **SLATE** shell (`com.toxicwind.slate`, v1.1.0), replacing the dead `streamers`/`aether` forks. Orchestrates: key lane → dev-mode provision → combined ipk (app+service single package id) → install → launch → live-reload → vision-kit aesthetic judgment → deploy proof.

## Scope
- `pens/ranch/products/lg-fleet/` — lg-key, lg-diag-v2, lg-recover, lg-hot (v2 live-reload), lg-deploy, lg-app; scripts/slate-deploy.ts, slate-build.ts, slate-assets.ts, slate-audit.ts; swarm-point.ts + test
- `pens/ranch/products/nuvio/nuvio-webos/` — app/ (index.html + assets/), service/ (launch.js + server.js + ffmpeg), scripts/slate-build.ts
- `pens/ranch/products/vision-kit/mcp/server.ts` + src/index.mjs (judgment)
- `pens/estate/pitchfork.toml` (vision-kit daemon, thresher federated)

## Constraints
- TV runs **Node 8.12**: service `launch.js` must stay ES5; `server.js` (modern Stremio bundle with optional-chaining/nullish) **cannot run on TV node** — requires bundled Node18 ARM runtime (Alexesmm route) or transpilation. NOT fixed yet.
- ares CLI needs **host Node ≤16** (`isDate`/`Callback already called` otherwise).
- webOS services install to `/media/developer/apps/usr/palm/` (dev-mode overlay), NOT `/media/cryptofs/` (read-only).
- LS2 bus: dev-mode installs grant **no bus privilege** — role file `com.palm.lunasend-pub.json` allowedNames must include `com.toxicwind.slate.server`; SAM caches appinfo.json at boot → restart sam after manifest changes.
- Service bus names globally unique — clean stale names before reinstall.
- Token/credential rules: secretsmith keyring SSOT (rule 3). TorBox NNTP creds migrated OUT of `custom_indexers.env` plaintext into keyring.

## Lane order
1. `lg-key [ip] [pass]` — fetch dev key (Dev Mode app foregrounded), decrypt with LG_PASS, PKCS8→traditional RSA conversion, ares provision, SSH proof (`LG_SSH_OK`)
2. `lg-diag-v2` — ssh / overlay-app / overlay-service / SAM cache / bus / jail-mount / ports (8080+11470) — run FIRST
3. `lg-recover` — role-file patch + sam restart + stale-bus close + jail mount; reboot TV once for ls-hubd
4. `slate-build.ts [--install] [--launch]` — combined ipk via ares package dir (`applications/<id>` + `services/<id>.server/`, `--pkgid <id>`; packageinfo.json inside packaged dir = FAIL)
5. `slate-deploy.ts` — whole lane: Node16 assert → key → build → install (ares-install app + hbchannel.service/exec service) → launch → diag
6. `lg-hot --port 18080` — Bun dev server for app/ with SSE live-reload (fast UX iteration, no reinstall)
7. vision-kit `vk_narrate`/`vk_diagnose` — aesthetic judgment (bump max_tokens to 2500+ for qwen3.6 reasoning models)

## Known live defects
- vision-kit `vk_diagnose` returns empty content on qwen3.6-35b (P5 prompt burns 9k+ reasoning tokens regardless of effort/budget suppression — server-side ignores it). `vk_narrate` works with max_tokens ≥ 2500.
- SLATE service doesn't auto-start on dev-mode installs (LS2 privilege) — needs hbchannel exec + role patch.
- ghost `/home/toxic/estate` removed (lease #48); name-fix.ts ESTATE const repointed to pens.
