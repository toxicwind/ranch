<div align="center">

[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)
[![bun](https://img.shields.io/badge/bun-1.4.4-f9f1e1?logo=bun)](https://bun.sh)
[![mise](https://img.shields.io/badge/toolchains-mise-ffd55a)](https://mise.jdx.dev)
[![go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![rust](https://img.shields.io/badge/Rust-orange?logo=rust)](https://www.rust-lang.org)

# 🤠 ranch

**The whole self-hosted AI estate in one monorepo.** Local model serving (**herd**), cloud provider routing (**hodos**), the canonical router (**cuttinggate**), the coding agent (**tau**), the MCP gateway (**gatehouse**), the build-job system (**forge**), fleet chat (**keryx**), and the provider catalog (**roost**) they all share — one directory per component, the full mesh on one box, everything OpenAI-compatible.

[Explore the docs »](docs/) · [Report Bug](https://github.com/toxicwind/ranch/issues/new?labels=bug&template=bug_report.md) · [Request Feature](https://github.com/toxicwind/ranch/issues/new?labels=enhancement&template=feature_request.md)

<img src="docs/images/ranch-demo.svg" alt="ranch 30-second proof: 52 local models behind one OpenAI-compatible door, every core service answering 200" width="720">

</div>

<details>
<summary><b>Table of Contents</b></summary>
<ol>
<li><a href="#-about">About</a></li>
<li><a href="#%EF%B8%8F-built-with">Built with</a></li>
<li><a href="#-getting-started">Getting started</a></li>
<li><a href="#-30-second-proof">30-second proof</a></li>
<li><a href="#-usage">Usage</a></li>
<li><a href="#%EF%B8%8F-architecture">Architecture</a></li>
<li><a href="#-the-ranch--component-map">The ranch — component map</a></li>
<li><a href="#-repo-topology">Repo topology</a></li>
<li><a href="#-the-contract">The contract</a></li>
<li><a href="#%EF%B8%8F-roadmap">Roadmap</a></li>
<li><a href="#-contributing">Contributing</a></li>
<li><a href="#-license">License</a></li>
<li><a href="#-contact">Contact</a></li>
<li><a href="#-acknowledgments">Acknowledgments</a></li>
</ol>
</details>

---

## 🐄 About

If you run models on a box **and** call cloud APIs, this is the shape of the answer: local traffic stays local, cloud traffic goes through one rate-limit-aware router, and **strategy names — not model names — decide the route**. Any client that speaks the OpenAI API just works — `curl`, the OpenAI SDK, your agent framework of choice.

The ranch is a **real monorepo**, not a folder of checkouts: [Bun workspaces](https://bun.sh) link the TypeScript animals, [moon](https://moonrepo.dev) orchestrates polyglot tasks (Bun/TS, Go, Python, Rust) with pinned toolchains, and CI runs only what your change touches (`moon ci`). One directory per animal, no pens inside pens — this README is the map.

### The agent this estate serves

**tau** is the coding agent — a terminal coding agent (fork of [oh-my-pi](https://github.com/can1357/oh-my-pi)) with an interactive CLI + SDK, 30+ tools, subagents, LSP-aware editing, and a native Rust hot path. It speaks to dozens of providers through a compiled model catalog sourced from **roost**, the ranch's single provider-data authority. Tau lives in its own repo ([toxicwind/tau](https://github.com/toxicwind/tau)) and nests into the ranch at `tau/` (gitignored — an independent repo with its own remote, absent in a fresh clone); on a live estate, **chute** exposes its stdio ACP engine as a TCP daemon on `:25111`, and its model traffic flows through herd and hodos. If you only learn one animal, learn tau — the rest of the ranch exists so the agent can work.

## 🛠️ Built with

- [Go](https://go.dev) — herd (local front door), forge (build jobs), gatehouse (MCP gateway)
- [Rust](https://www.rust-lang.org) — hodos (provider router), rig (OpenFang kernel), tau's native hot path
- [Bun](https://bun.sh) + [TypeScript](https://www.typescriptlang.org) — workspaces, cuttinggate, fleet-ui, windmill, stream-broker, roost, tau's agent brain
- [Python](https://www.python.org) — keryx (fleet chat), squawk-ws, lasso (desktop control)
- [mise](https://mise.jdx.dev) — toolchains and build tasks; estate owns the shared build cache
- **pitchfork** — the daemon supervisor: supervised services on the live estate

## 📊 Monorepo Statistics (generated 10/29/2026, 8:09:33 PM)

| Metric | Value |
|---|---|
| Total directories | 138 |
| Directories with obvious upstream | 62 / 138 (44.9%) |
| Git-tracked directories | 59 |
| Components (peer repos) | 61 |
| Total size | 0.54 GB |
| Total tracked files | 59 |

## 🗂️ Components (61)

The full map — every animal's pen, with its repo and description (from README heads). From `.gitmodules` + `FORKS-report.json`; regenerate with the README.

| Path | Stack / Lang | Repo | Description |
|---|---|---|---|
| `android-fleet` | 📁 `Workspace` | [toxicwind/android-fleet](https://github.com/toxicwind/android-fleet.git) | — |
| `arroyo` | 📁 `Workspace` | [toxicwind/arroyo](https://github.com/toxicwind/arroyo.git) | — |
| `ast-grep-rules` | 📁 `Workspace` | [toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules.git) | — |
| `auto1m` | 📁 `Workspace` | [toxicwind/auto1m](https://github.com/toxicwind/auto1m.git) | — |
| `bench-radar` | 📁 `Workspace` | [toxicwind/bench-radar](https://github.com/toxicwind/bench-radar.git) | — |
| `bridge` | 📁 `Workspace` | [toxicwind/bridge](https://github.com/toxicwind/bridge.git) | — |
| `bugbounty` | 📁 `Workspace` | [toxicwind/bugbounty](https://github.com/toxicwind/bugbounty.git) | — |
| `classifier` | 📁 `Workspace` | [toxicwind/classifier](https://github.com/toxicwind/classifier.git) | — |
| `classifier-preflight` | 📁 `Workspace` | [toxicwind/classifier-preflight](https://github.com/toxicwind/classifier-preflight.git) | — |
| `codebase-memory` | 📁 `Workspace` | [toxicwind/codebase-memory](https://github.com/toxicwind/codebase-memory.git) | — |
| `cron-trust` | 📁 `Workspace` | [toxicwind/cron-trust](https://github.com/toxicwind/cron-trust.git) | — |
| `dashboard` | 📁 `Workspace` | [toxicwind/dashboard](https://github.com/toxicwind/dashboard.git) | — |
| `disparate-latent-experiment` | 📁 `Workspace` | [toxicwind/disparate-latent-experiment](https://github.com/toxicwind/disparate-latent-experiment.git) | — |
| `dots-client` | 📁 `Workspace` | [toxicwind/dots-client](https://github.com/toxicwind/dots-client.git) | — |
| `drover` | 📁 `Workspace` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `emergent` | 📁 `Workspace` | [toxicwind/emergent](https://github.com/toxicwind/emergent.git) | — |
| `examples` | 📁 `Workspace` | [toxicwind/examples](https://github.com/toxicwind/examples.git) | — |
| `extensions` | 📁 `Workspace` | [toxicwind/extensions](https://github.com/toxicwind/extensions.git) | — |
| `fanout` | 📁 `Workspace` | [toxicwind/fanout](https://github.com/toxicwind/fanout.git) | — |
| `fast-race` | 📁 `Workspace` | [toxicwind/fast-race](https://github.com/toxicwind/fast-race.git) | — |
| `fleet` | 📁 `Workspace` | [toxicwind/fleet](https://github.com/toxicwind/fleet.git) | — |
| `fleet-ops` | 📁 `Workspace` | [toxicwind/fleet-ops](https://github.com/toxicwind/fleet-ops.git) | — |
| `forge` | 📁 `Workspace` | [toxicwind/forge](https://github.com/toxicwind/forge.git) | — |
| `github-search` | 📁 `Workspace` | [toxicwind/github-search](https://github.com/toxicwind/github-search.git) | — |
| `hatch-decode` | 📁 `Workspace` | [toxicwind/hatch-decode](https://github.com/toxicwind/hatch-decode.git) | — |
| `herdproof-bun` | 📁 `Workspace` | [toxicwind/herdproof-bun](https://github.com/toxicwind/herdproof-bun.git) | — |
| `hf-model-sync` | 📁 `Workspace` | [toxicwind/hf-model-sync](https://github.com/toxicwind/hf-model-sync.git) | — |
| `homelessbrian-NuvioTV` | 📁 `Workspace` | [homelessbrian/NuvioTV](https://github.com/homelessbrian/NuvioTV) | — |
| `host-proof` | 📁 `Workspace` | [toxicwind/host-proof](https://github.com/toxicwind/host-proof.git) | — |
| `IPTV-BRIDGE` | 📁 `Workspace` | [jozphe/IPTV-BRIDGE](https://github.com/jozphe/IPTV-BRIDGE) | — |
| `keep` | 📁 `Workspace` | [toxicwind/keep](https://github.com/toxicwind/keep.git) | — |
| `kerloys-iptv-webos` | 📁 `Workspace` | [toxicwind/kerloys-iptv-webos](https://github.com/toxicwind/kerloys-iptv-webos.git) | — |
| `kimi-claw` | 📁 `Workspace` | [toxicwind/kimi-claw](https://github.com/toxicwind/kimi-claw.git) | — |
| `kodi-fleet` | 📁 `Workspace` | [toxicwind/kodi-fleet](https://github.com/toxicwind/kodi-fleet.git) | — |
| `lasso` | 📁 `Workspace` | [toxicwind/lasso](https://github.com/toxicwind/lasso.git) | — |
| `leakfix-src` | 📁 `Workspace` | [toxicwind/leakfix-src](https://github.com/toxicwind/leakfix-src.git) | — |
| `ledger` | 📁 `Workspace` | [toxicwind/ledger](https://github.com/toxicwind/ledger.git) | — |
| `lib` | 📁 `Workspace` | [toxicwind/lib](https://github.com/toxicwind/lib.git) | — |
| `matter-server` | 📁 `Workspace` | [toxicwind/matter-server](https://github.com/toxicwind/matter-server.git) | — |
| `mcp` | 📁 `Workspace` | [toxicwind/mcp](https://github.com/toxicwind/mcp.git) | — |
| `mesh` | 📁 `Workspace` | [toxicwind/mesh](https://github.com/toxicwind/mesh.git) | — |
| `meta-research-toolkit` | 📁 `Workspace` | [toxicwind/meta-research-toolkit](https://github.com/toxicwind/meta-research-toolkit.git) | — |
| `metaaivm` | 📁 `Workspace` | [toxicwind/metaaivm](https://github.com/toxicwind/metaaivm.git) | — |
| `metaaivm-profile` | 📁 `Workspace` | [toxicwind/metaaivm-profile](https://github.com/toxicwind/metaaivm-profile.git) | — |
| `mission-control` | 📁 `Workspace` | [toxicwind/mission-control](https://github.com/toxicwind/mission-control.git) | — |
| `ml-serve` | 📁 `Workspace` | [toxicwind/ml-serve](https://github.com/toxicwind/ml-serve.git) | — |
| `naming-audit` | 📁 `Workspace` | [toxicwind/naming-audit](https://github.com/toxicwind/naming-audit.git) | — |
| `null-g-proxy` | 📁 `Workspace` | [toxicwind/null-g-proxy](https://github.com/toxicwind/null-g-proxy.git) | — |
| `nuviotv-bun` | 📁 `Workspace` | [toxicwind/nuviotv-bun](https://github.com/toxicwind/nuviotv-bun.git) | — |
| `NuvioTVSmart` | 📁 `Workspace` | [toxicwind/NuvioTVSmart](https://github.com/toxicwind/NuvioTVSmart.git) | — |
| `NuvioTVWebOS` | 📁 `Workspace` | [toxicwind/NuvioTVWebOS](https://github.com/toxicwind/NuvioTVWebOS) | — |
| `nuvioweb` | 📁 `Workspace` | [toxicwind/nuvioweb](https://github.com/toxicwind/nuvioweb.git) | — |
| `openfang` | 📁 `Workspace` | [toxicwind/openfang](https://github.com/toxicwind/openfang.git) | — |
| `openfang-join` | 📁 `Workspace` | [toxicwind/openfang-join](https://github.com/toxicwind/openfang-join.git) | — |
| `openrouter-probe` | 📁 `Workspace` | [toxicwind/openrouter-probe](https://github.com/toxicwind/openrouter-probe.git) | — |
| `ops` | 📁 `Workspace` | [toxicwind/ops](https://github.com/toxicwind/ops.git) | — |
| `pack-fix` | 📁 `Workspace` | [toxicwind/pack-fix](https://github.com/toxicwind/pack-fix.git) | — |
| `phone-ocr-sweep` | 📁 `Workspace` | [toxicwind/phone-ocr-sweep](https://github.com/toxicwind/phone-ocr-sweep.git) | — |
| `plugin-ecosystem` | 📁 `Workspace` | [toxicwind/plugin-ecosystem](https://github.com/toxicwind/plugin-ecosystem.git) | — |
| `range` | 📁 `Workspace` | [toxicwind/range](https://github.com/toxicwind/range.git) | — |
| `thresher-backup-20261029` | 📁 `Workspace` | [toxicwind/gatehouse-go](https://github.com/toxicwind/gatehouse-go.git) | — |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 61 |
| package.json repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `range-ui.tmp` | 177.0 MB | 334 | — |
| `qed` | 122.4 MB | 4,522 | — |
| `propylon` | 113.7 MB | 7 | — |
| `barn` | 58.5 MB | 2,411 | — |
| `herd` | 22.7 MB | 2 | — |
| `rustdesk-server` | 18.7 MB | 8 | — |
| `roundup` | 8.5 MB | 650 | — |
| `vendor` | 8.2 MB | 484 | — |
| `rust-algo-web` | 4.5 MB | 161 | — |
| `research` | 3.6 MB | 129 | — |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/jozphe/IPTV-BRIDGE](https://github.com/jozphe/IPTV-BRIDGE) | 1 |
| [github.com/toxicwind/NuvioTVSmart](https://github.com/toxicwind/NuvioTVSmart) | 1 |
| [github.com/toxicwind/NuvioTVWebOS](https://github.com/toxicwind/NuvioTVWebOS) | 1 |
| [github.com/toxicwind/android-fleet](https://github.com/toxicwind/android-fleet) | 1 |
| [github.com/toxicwind/arroyo](https://github.com/toxicwind/arroyo) | 1 |
| [github.com/toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules) | 1 |
| [github.com/toxicwind/auto1m](https://github.com/toxicwind/auto1m) | 1 |
| [github.com/toxicwind/bench-radar](https://github.com/toxicwind/bench-radar) | 1 |
| [github.com/toxicwind/bridge](https://github.com/toxicwind/bridge) | 1 |
| [github.com/toxicwind/bugbounty](https://github.com/toxicwind/bugbounty) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|


## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 61 |
| Fork (ours) | 57 |
| Upstream mirror | 2 |
| Vendored (snapshot) | 42 |
| Experimental | 35 |
| Stub/Empty | 2 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-29T20:09:33.772Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
