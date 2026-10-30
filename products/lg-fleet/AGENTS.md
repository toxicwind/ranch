# SLATE lane — LG webOS netflix-max product contract

## Owner
tau (this session) — lane owner for LG TV SLATE deploy + Netflix-Max UX.

## Products
- `pens/ranch/products/lg-fleet/` — tool lane (key/diag/recover/hot/deploy/build/assets/audit/swarm)
- `pens/ranch/products/nuvio/nuvio-webos/` — SLATE build source (app/ + service/)
- `pens/ranch/products/vision-kit/mcp/server.ts` — aesthetic judgment MCP

## Rules
- **Never monkeypatch the www Stremio bundle** — it's a compiled webpack bundle; serve OUR shell (app/) instead.
- **Combined ipk only** — appinfo.json at package root + `services/<svcid>/` subtree, `--pkgid <id>`. Separate app+service ipks evict each other.
- **Host Node ≤16** for ares CLI; TV is Node 8.12 → launch.js ES5 only.
- **TV overlay** `/media/developer/apps/usr/palm/` — never read `/media/cryptofs/` (read-only system).
- TV: OLED65CXPUA `prisoner@10.0.0.176:9922`; Dev Mode key server `:9991/webos_rsa` (6-char on-screen passphrase = LG_PASS).

## Current state
- Assets generated: icon.png, largeIcon.png, splash.png, hero-slate.png, poster-fallback.png in app/assets/
- vision-kit serve.ts (keyring boot) committed; pitchfork daemon wiring edited (env interpolation reverted)
- lg-hot v2 live-reload server: syntax-validated, runs (SSE reload)
- swarm-point.ts: 20 comm routes × 20 concurrency patterns, TDD 34/34, pushed `4d80a89b8`

## Next actions
- Restart vision-kit daemon (keyring env) + re-run diagnose/narrate judgment on regenerated splash
- Finish role patch on TV (heredoc-in-luna mangled — write patch script to TV file first)
- Deploy combined ipk via slate-deploy.ts
- Archive tar.gz + commit + push all repos
