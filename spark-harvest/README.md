# spark-harvest

Incremental GitHub harvest + first-class agent profile for the **Muse Spark** model family.

## What this is

- `harvest.ts` — bun harvester: GitHub repos / code / issues / PRs / commits / discussions for muse-spark keywords, watermarked + deduped into `/home/toxic/sovereign/hatch/spark-harvest/`. Runs on yote via crontab (see below).
- `src/profile.ts` + `profile.json` — executable first-class agent profile: machine-readable identity, validated against observed estate identifiers, with a pre-agent launch path that injects the autonomy directive.
- `verify.ts` — local integrity check (no network).
- Corpus: `/home/toxic/sovereign/hatch/spark-corpus/` (raw clones).

## Observed facts (2026-09-30 / 2026-10-01)

| Slot | Observed value | Basis |
|------|----------------|-------|
| Runtime box | hatch cell (`htch-runtime`, `/home/hatch`, `/opt/hatch`) | `hostname`, runtime paths |
| Model | `Muse Spark` | runtime trace context on every tool call; string embedded in `/opt/hatch/bin/*` |
| Model org | Meta Superintelligence Labs (MSL) | `kzinmr/ai-topics` wiki/concepts/meta-muse-spark.md, `startakovsky/llm-model-tracker` entries (corpus harvest) |
| Internal codename | "Avocado" | same sources |
| Versions | 1.1, 1.2 (2026-08-05, OpenRouter `meta/muse-spark-1.2`, 1M ctx), 1.3 (via OpenCode Zen gateway) | model-tracker entry, `dsh-our-free-model` catalog |
| VM infra | `*.metaaivm.com` (`hatch.metaaivm.com` Noise_XX gateway) | APK teardown `/home/toxic/apk-recon-aura-20260917/`, `JARVIS_FQDN` |

**Naming rule:** the model name never renames the runtime. `Muse Spark` is the autoloaded model identifier; `hatch` is the runtime; `metaaivm.com` is the VM domain.

## Rejected claim: "Google VM"

Zero Google-Cloud VM evidence anywhere on the estate: no GCE metadata endpoint, no Google-Cloud kernel markers. The only Google string is the Android client user-agent (`FBMF/Google;...;FBDV/Pixel 9 Pro XL`) — the phone vendor, not the VM. Decision: no rename; metaaivm.com corpus and docs stand.

## Harvest candidates (ranked 2026-10-01)

1. **zouyuxuan122/dsh-our-free-model** — 546★, MIT, pushed 2026-10-01. dsh plugin; free Muse Spark 1.3 via OpenCode's Zen gateway. Strongest ecosystem signal.
2. **HarjjotSinghh/helicon** — 70★, MIT. Desktop/web app for Meta's Muse Code CLI.
3. **compnew2006/MetaAI-Free-Hermes-Agent** — 28★. Meta AI free agent; references Muse Spark.
4. **kamellperry/meta-muse-spark-api** — 6★. OpenAI-compatible API server for Muse Spark. **Forked** → `toxicwind/meta-muse-spark-api` (commit `83edf43`, first-class spark-agent profile).
5. **muse-spark-app/muse-spark** — claims "official desktop client from Meta AI"; 112 lines of Python total. Rejected as fork candidate (false official claims, stub code).

Corpus clones: `meta-muse-spark-api/`, `muse-spark/`, `fork/` (the toxicwind fork), plus recon clones (`dsh-our-free-model/`, `helicon/`, `MetaAI-Free-Hermes-Agent/`).

## yote cron

```
37 4 * * * cd /home/toxic/sovereign/projects/range/ranch/spark-harvest && /home/toxic/.bun/bin/bun harvest.ts >> /home/toxic/sovereign/hatch/spark-harvest/harvest.log 2>&1
```

Mirrors the metaaivm collector pattern (03:17). Auth: `gh` CLI as toxicwind.

## Moon tasks

- `moon run spark-harvest:harvest` — run the harvester now
- `moon run spark-harvest:verify` — dry-run harvest + local integrity check
- `moon run spark-harvest:test` — bun tests for the profile
