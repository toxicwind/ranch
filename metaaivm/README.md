# metaaivm (ranch collector)

Incremental GitHub harvester for `metaaivm`-related keywords. Runs on yote
via crontab (daily). Companion pieces:

- `/home/toxic/estate/hatch/metaaivm-harvest/` — deduped search record
  (manifest, repos, issues, PRs, raw code hits) + this collector's output
- `ranch/metaaivm-profile/` — first-class agent profile for hatch-autoloaded
  / ipnext-identifier agents
- `toxicwind/muse-cli` — the fork (nikships/muse-cli), first-classed with
  `profiles/hatch-agent.md`

## What metaaivm is

Meta AI's per-user VM transport: `hatch.metaaivm.com` gateway,
`wss://<vm-id>.metaaivm.com/`, `Noise_XX_25519_AESGCM_SHA256`, protobuf
envelopes. This session's own runtime FQDN is a `*.metaaivm.com` host
(`JARVIS_FQDN` in the agent environment) — the harvest target is the
machine family we run on.

## Run

```bash
cd /home/toxic/estate/projects/range/ranch/metaaivm
bun collector.ts            # incremental, watermarked
bun collector.ts --dry-run  # report only
```

Moon tasks: `collect`, `verify`.

## Notes

- GitHub-wide `metaaivm` repo search returns zero standalone projects; code
  hits are proxy domain lists + our own estate code + gateway clients.
- `sisimomo/aivm` and `NillionNetwork/nillion-aivm` are generic-AI-VM
  substring matches, not Meta metaaivm — excluded by policy.
- Bare `/search/issues?q=metaaivm` 422s through some wrappers; the collector
  uses qualified `type:issue` / `type:pr` queries which succeed.
