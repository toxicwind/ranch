<div align="center">

[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)
[![bun](https://img.shields.io/badge/bun-1.4.2-f9f1e1?logo=bun)](https://bun.sh)
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

## 📊 Monorepo Statistics (generated 10/19/2026, 6:00:53 PM)

| Metric | Value |
|---|---|
| Total directories | 248 |
| Directories with obvious upstream | 154 / 248 (62.1%) |
| Git-tracked directories | 161 |
| Submodules | 148 |
| Total size | 0.00 GB |
| Total tracked files | 214,230 |

## 🗂️ Registered Submodules (224)

The full map — every animal's pen, with its repo and description (from README heads). From `.gitmodules` + `FORKS-report.json`; regenerate with the README.

| Path | Repo | Description |
|---|---|---|
| `agent-customization-style-guide` | [toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide.git) | 1. Scope |
| `agent-dashboard` | [toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard.git) | — |
| `AgentForensics` | [aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics.git) | — |
| `agon` | [toxicwind/agon](https://github.com/toxicwind/agon.git) | — |
| `ai-merge-resolve` | [toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve.git) | — |
| `android-fleet` | [toxicwind/android-fleet](https://github.com/toxicwind/android-fleet.git) | ADB-managed Android devices on the LAN — the Architect's Pixel 9 Pro XL and the bedroom Google TV. (LG webOS T |
| `antilogos` | [toxicwind/antilogos](https://github.com/toxicwind/antilogos.git) | — |
| `arroyo` | [toxicwind/arroyo](https://github.com/toxicwind/arroyo.git) | Umbrella for overlord · coyote · discord · mcp under ranch. |
| `ast-grep-rules` | [toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules.git) | — |
| `auto1m` | [toxicwind/auto1m](https://github.com/toxicwind/auto1m.git) | No ceiling: an automatic composite that operates over ~1M tokens using the whole model fleet, instead of treat |
| `awesome-free-ai-coding` | [toxicwind/awesome-free-ai-coding](https://github.com/toxicwind/awesome-free-ai-coding.git) | — |
| `barn` | [toxicwind/barn](https://github.com/toxicwind/barn.git) | Small single-purpose utilities that keep the ranch running. Each sub-component |
| `barn/corral` | [./barn/corral](./barn/corral) | — |
| `barn/flatbread` | [toxicwind/flatbread](https://github.com/toxicwind/flatbread.git) | — |
| `barn/nativelink` | [toxicwind/nativelink](https://github.com/toxicwind/nativelink.git) | — |
| `barn/rosec` | [toxicwind/rosec](https://github.com/toxicwind/rosec.git) | — |
| `barn/weave` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `barn/weave-sub` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `bash-style-guide` | [toxicwind/bash-style-guide](https://github.com/toxicwind/bash-style-guide.git) | — |
| `bench-radar` | [toxicwind/bench-radar](https://github.com/toxicwind/bench-radar.git) | Nobody reads the nightly benchmark log — so this service does, and **pages |
| `borrowed/herdr` | [ogulcancelik/herdr](https://github.com/ogulcancelik/herdr.git) | — |
| `borrowed/loom` | [rjwalters/loom](https://github.com/rjwalters/loom.git) | — |
| `bridge` | [toxicwind/bridge](https://github.com/toxicwind/bridge.git) | The bridge is the control plane between **hatch** (this cell) and **yote** (the heavy box). This project holds |
| `bugbounty` | [toxicwind/bugbounty](https://github.com/toxicwind/bugbounty.git) | Headed Playwright helpers that open the **real paid bounty programs** for |
| `campfire` | [toxicwind/campfire](https://github.com/toxicwind/campfire.git) | > 🗺️ Part of **the ranch** — the whole inference estate, one map. |
| `chronos-forge` | [toxicwind/chronos-forge](https://github.com/toxicwind/chronos-forge.git) | A repo-scoped **Mixture-of-Experts agent backplane** with an endless, |
| `classifier` | [toxicwind/classifier](https://github.com/toxicwind/classifier.git) | — |
| `classifier-preflight` | [toxicwind/classifier-preflight](https://github.com/toxicwind/classifier-preflight.git) | Internal meta tool: preflight any text that goes into a scheduled task body, |
| `codebase-memory` | [toxicwind/codebase-memory](https://github.com/toxicwind/codebase-memory.git) | — |
| `computer-use-linux` | [toxicwind/computer-use-linux](https://github.com/toxicwind/computer-use-linux.git) | — |
| `corral` | [toxicwind/corral](https://github.com/toxicwind/corral.git) | > **Ticket-driven development & speculative merge queue — evolved from super-ralph lineage** |
| `cron-trust` | [toxicwind/cron-trust](https://github.com/toxicwind/cron-trust.git) | — |
| `dashboard` | [toxicwind/dashboard](https://github.com/toxicwind/dashboard.git) | — |
| `dedicated/dedicated-server-ops` | [toxicwind/dedi-ops](https://github.com/toxicwind/dedi-ops.git) | — |
| `didymos` | [toxicwind/didymos](https://github.com/toxicwind/didymos.git) | — |
| `disparate-latent-experiment` | [toxicwind/disparate-latent-experiment](https://github.com/toxicwind/disparate-latent-experiment.git) | — |
| `doorbell` | [toxicwind/doorbell](https://github.com/toxicwind/doorbell.git) | HTTP MCP door on port 25202. v7. One initialize returns the router catalog. |
| `dots-client` | [toxicwind/dots-client](https://github.com/toxicwind/dots-client.git) | Alternate model-call shim for Dots-3-Note (dots-studio/dots-3-note-preview:free) |
| `drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | > 🗺️ Part of **the ranch** — the whole inference estate, one map. |
| `dualspace-ast-bm25-hybrid` | [toxicwind/dualspace-ast-bm25-hybrid](https://github.com/toxicwind/dualspace-ast-bm25-hybrid.git) | Dual-space code retrieval engine for autonomous coding agents: a regex-based |
| `duel/vendor/argus-ai-debate` | [Argus-Framework/argus-ai-debate](https://github.com/Argus-Framework/argus-ai-debate.git) | — |
| `duel/vendor/ChatEval` | [thunlp/ChatEval](https://github.com/thunlp/ChatEval.git) | — |
| `duel/vendor/debate-or-vote` | [deeplearning-wisc/debate-or-vote](https://github.com/deeplearning-wisc/debate-or-vote.git) | — |
| `duel/vendor/llm_debate` | [ucl-dark/llm_debate](https://github.com/ucl-dark/llm_debate.git) | — |
| `duet` | [toxicwind/duet](https://github.com/toxicwind/duet.git) | — |
| `emergent` | [toxicwind/emergent](https://github.com/toxicwind/emergent.git) | One research question in → ranked code patterns out. Built 2026-10-03 (tansy lane). |
| `estate-chat` | [toxicwind/estate-chat](https://github.com/toxicwind/estate-chat.git) | The fleet's first-class coordination plane on awrawr-pc. Presence, live |
| `estate-dispersal` | [toxicwind/sovereign-dispersal](https://github.com/toxicwind/sovereign-dispersal.git) | Bun monolith fusing seven overlooked substrates into one deploy-ready proof-of-concept: estate-scripts fs-map, |
| `estate-dispersal-monolith` | [toxicwind/estate-dispersal-monolith](https://github.com/toxicwind/estate-dispersal-monolith.git) | — |
| `estate-end4` | [toxicwind/sovereign-end4](https://github.com/toxicwind/sovereign-end4.git) | > **The Desktop Shell & Wayland UI layer for the estate-scripts ecosystem.** |
| `estate-hatch-toolkit` | [toxicwind/estate-hatch-toolkit](https://github.com/toxicwind/estate-hatch-toolkit.git) | — |
| `estate-kappa-plugin` | [toxicwind/estate-kappa-plugin](https://github.com/toxicwind/estate-kappa-plugin.git) | Official estate plugin collection for **kappa** (@kappacode/cli). |
| `estate-monitor` | [toxicwind/estate-monitor](https://github.com/toxicwind/estate-monitor.git) | — |
| `estate-recon` | [toxicwind/estate-recon](https://github.com/toxicwind/estate-recon.git) | Consolidated, evidence-first telemetry, reverse-engineered runtime architectures, APK forensic suites, and cli |
| `estate-scripts` | [toxicwind/estate-scripts](https://github.com/toxicwind/estate-scripts.git) | Consolidated repository of operational, CI/CD, release, benchmark, and auditing scripts for the estate-scripts |
| `estate-scripts-dispersal` | [toxicwind/estate-scripts-dispersal](https://github.com/toxicwind/estate-scripts-dispersal.git) | — |
| `estate-scripts-end4` | [toxicwind/estate-scripts-end4](https://github.com/toxicwind/estate-scripts-end4.git) | — |
| `estate-scripts-scripts` | [toxicwind/estate-scripts-scripts](https://github.com/toxicwind/estate-scripts-scripts.git) | — |
| `estate-scripts-skills` | [toxicwind/estate-scripts-skills](https://github.com/toxicwind/estate-scripts-skills.git) | — |
| `estate-shell` | [toxicwind/estate-shell](https://github.com/toxicwind/estate-shell.git) | The shell SSOT for the estate: **dots** (hypr, quickshell ii, fish, foot, kitty, |
| `estate-skills` | [toxicwind/sovereign-skills](https://github.com/toxicwind/sovereign-skills.git) | Kimi-style skill definitions and agent orchestration patterns. |
| `estate-skills-hub` | [toxicwind/estate-skills-hub](https://github.com/toxicwind/estate-skills-hub.git) | — |
| `estate-whoa-breakthrough` | [toxicwind/estate-whoa-breakthrough](https://github.com/toxicwind/estate-whoa-breakthrough.git) | — |
| `examples` | [toxicwind/examples](https://github.com/toxicwind/examples.git) | Runnable proof that the ranch works. Everything here runs against the live |
| `extensions` | [toxicwind/extensions](https://github.com/toxicwind/extensions.git) | — |
| `extensions/drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `fanout` | [toxicwind/fanout](https://github.com/toxicwind/fanout.git) | Runs shell commands **concurrently** and prints a per-leg receipt. Built for |
| `fast-race` | [toxicwind/fast-race](https://github.com/toxicwind/fast-race.git) | fast_race.py applies the squawk HFT latency doctrine |
| `ferret-den` | [toxicwind/ferret-den](https://github.com/toxicwind/ferret-den.git) | An MCP server that exposes the Warren's reconnaissance kit under decoupled tool names to prevent false-positiv |
| `fleet` | [toxicwind/fleet](https://github.com/toxicwind/fleet.git) | — |
| `fleet-chat` | [toxicwind/fleet-chat](https://github.com/toxicwind/fleet-chat.git) | The fleet's first-class coordination server on awrawr-pc. Rooms, real |
| `fleet-ops` | [toxicwind/fleet-ops](https://github.com/toxicwind/fleet-ops.git) | Built 2026-09-19 after the iowait-freeze incident (50–80% iowait, load |
| `fleetd` | [toxicwind/fleetd](https://github.com/toxicwind/fleetd.git) | First-class fleet coordination daemon for awrawr-pc. The literal way for |
| `flicker` | [toxicwind/flicker](https://github.com/toxicwind/flicker.git) | — |
| `forge` | [toxicwind/forge](https://github.com/toxicwind/forge.git) | — |
| `forge/router/weasel` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | — |
| `forge/web` | [toxicwind/CMSaasStarter](https://github.com/toxicwind/CMSaasStarter.git) | — |
| `freebuffet` | [toxicwind/freebuffet](https://github.com/toxicwind/freebuffet.git) | Add API keys, health-check providers, and auto-generate configs for **OpenCode**, **Codex CLI**, and **Claude  |
| `furlong/vendor/coder_reviewer_reranking` | [facebookresearch/coder_reviewer_reranking](https://github.com/facebookresearch/coder_reviewer_reranking.git) | — |
| `furlong/vendor/RACE` | [jszheng21/RACE](https://github.com/jszheng21/RACE.git) | — |
| `furlong/vendor/speed-run` | [2389-research/speed-run](https://github.com/2389-research/speed-run.git) | — |
| `furlong/vendor/SRank-CodeRanker` | [FSoft-AI4Code/SRank-CodeRanker](https://github.com/FSoft-AI4Code/SRank-CodeRanker.git) | — |
| `gavel` | [toxicwind/gavel](https://github.com/toxicwind/gavel.git) | bidders over a single [squawk message channel] |
| `gavel/vendor/agora` | [KAIJUJO/Agora](https://github.com/KAIJUJO/Agora.git) | — |
| `gavel/vendor/auction-agent11` | [wushuchris/11-distributed-auction-task-allocation-agent](https://github.com/wushuchris/11-distributed-auction-task-allocation-agent.git) | — |
| `gavel/vendor/contract-net-router` | [M00C1FER/contract-net-router](https://github.com/M00C1FER/contract-net-router.git) | — |
| `gayxxx-estate` | [toxicwind/gayxxx-estate](https://github.com/toxicwind/gayxxx-estate.git) | A CloudStream extension repository: **19 CS3 plugins repacked from validated DEX** (ZIP archives with classes. |
| `ghq` | [toxicwind/ghq](https://github.com/toxicwind/ghq.git) | — |
| `github-search` | [toxicwind/github-search](https://github.com/toxicwind/github-search.git) | > **TOXICWIND FORK** — Autonomous high-recall GitHub search client, API server, Next.js frontend, and Model Co |
| `gito` | [toxicwind/gito](https://github.com/toxicwind/gito.git) | — |
| `godzilla-llama.cpp` | [toxicwind/godzilla-llama.cpp](https://github.com/toxicwind/godzilla-llama.cpp.git) | Windows-first **MSVC + CUDA** |
| `hatch` | [toxicwind/hatch](https://github.com/toxicwind/hatch.git) | — |
| `hatch-decode` | [toxicwind/hatch-decode](https://github.com/toxicwind/hatch-decode.git) | > **Why should you care?** The runtime daemon that owns your cell has 158 |
| `hatch/kite-cli` | [toxicwind/kite-cli](https://github.com/toxicwind/kite-cli.git) | — |
| `herd` | [toxicwind/herd](https://github.com/toxicwind/herd.git) | — |
| `herdproof-bun` | [toxicwind/herdproof-bun](https://github.com/toxicwind/herdproof-bun.git) | — |
| `hf-model-sync` | [toxicwind/hf-model-sync](https://github.com/toxicwind/hf-model-sync.git) | — |
| `hodos` | [toxicwind/hodos](https://github.com/toxicwind/hodos.git) | — |
| `host-proof` | [toxicwind/host-proof](https://github.com/toxicwind/host-proof.git) | A universal **read-only** host proof bundle. Point it at any box and it |
| `identity-router` | [toxicwind/identity-router](https://github.com/toxicwind/identity-router.git) | > The universal knowledge router for durable agent memory — lessons, preferences, rules, corrections, and exte |
| `kairos` | [toxicwind/kairos](https://github.com/toxicwind/kairos.git) | runs gets a **2.0s hard deadline**; breachi |
| `keep` | [toxicwind/keep](https://github.com/toxicwind/keep.git) | env files, or repo history again — every service, agent, and daemon |
| `keryx` | [toxicwind/keryx](https://github.com/toxicwind/keryx.git) | > **File-based multi-agent chat. No daemon, no sockets, no HTTP — just a |
| `kilo` | [toxicwind/kilo](https://github.com/toxicwind/kilo.git) | — |
| `kimi-auto` | [toxicwind/kimi-auto](https://github.com/toxicwind/kimi-auto.git) | — |
| `kimi-claw` | [toxicwind/kimi-claw](https://github.com/toxicwind/kimi-claw.git) | — |
| `kodi-fleet` | [toxicwind/kodi-fleet](https://github.com/toxicwind/kodi-fleet.git) | A[awrawr-pc] --> H[kodi-handoff] |
| `kryptos` | [toxicwind/kryptos](https://github.com/toxicwind/kryptos.git) | > **The maximal freedesktop Secret Service CLI.** A from-scratch Python |
| `lasso` | [toxicwind/lasso](https://github.com/toxicwind/lasso.git) | > 🗺️ Part of **the ranch** — the whole inference estate, one map. |
| `leakfix-src` | [toxicwind/leakfix-src](https://github.com/toxicwind/leakfix-src.git) | — |
| `ledger` | [toxicwind/ledger](https://github.com/toxicwind/ledger.git) | > 🗺️ Part of **the ranch** — the whole inference estate, one map. |
| `lib` | [toxicwind/lib](https://github.com/toxicwind/lib.git) | — |
| `loom` | [toxicwind/loom](https://github.com/toxicwind/loom.git) | Developers working with tightly-coupled repositories face a growing friction problem. When a change in one rep |
| `matter-server` | [toxicwind/matter-server](https://github.com/toxicwind/matter-server.git) | The live Matter app runs from /home/toxic/.matter-server/app — outside |
| `maw` | [toxicwind/maw](https://github.com/toxicwind/maw.git) | maw is a coordination layer for teams running many coding agents in parallel on one repo. |
| `mcp` | [toxicwind/mcp](https://github.com/toxicwind/mcp.git) | — |
| `mcp-dropin-guide` | [toxicwind/mcp-dropin-guide](https://github.com/toxicwind/mcp-dropin-guide.git) | 1. Scope |
| `mcp/mcp-prompt-injection-detector` | [thilinawishvekeerthi/mcp-prompt-injection-detector](https://github.com/thilinawishvekeerthi/mcp-prompt-injection-detector.git) | — |
| `mcp/mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | — |
| `mcp/pd-mcp-standalone` | [toxicwind/pd-mcp](https://github.com/toxicwind/pd-mcp.git) | — |
| `mcp/rsync-mcp` | [toxicwind/rsync-mcp](https://github.com/toxicwind/rsync-mcp.git) | — |
| `mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | > **The sovereign MCP tool federation, security firewall, and agent gateway. Connects 231+ tools across 18 ser |
| `mesh` | [toxicwind/mesh](https://github.com/toxicwind/mesh.git) | — |
| `mesh/pylae` | [toxicwind/flocksync](https://github.com/toxicwind/flocksync.git) | — |
| `meta-research-toolkit` | [toxicwind/meta-research-toolkit](https://github.com/toxicwind/meta-research-toolkit.git) | — |
| `metaaivm` | [toxicwind/metaaivm](https://github.com/toxicwind/metaaivm.git) | Incremental GitHub harvester for metaaivm-related keywords. Runs on yote |
| `metaaivm-profile` | [toxicwind/metaaivm-profile](https://github.com/toxicwind/metaaivm-profile.git) | First-class agent profile for the Meta AI VM (metaaivm.com) estate. |
| `metaclaw-runtime` | [toxicwind/metaclaw-runtime](https://github.com/toxicwind/metaclaw-runtime.git) | — |
| `mission-control` | [toxicwind/mission-control](https://github.com/toxicwind/mission-control.git) | Event-driven continuation controller. A parent mission stays open until |
| `ml-serve` | [toxicwind/ml-serve](https://github.com/toxicwind/ml-serve.git) | Hot-loaded ONNX segmentation + e621 native tag resolution over HTTP for the |
| `muse-cli` | [toxicwind/muse-cli](https://github.com/toxicwind/muse-cli.git) | Talk to your personal muse.ai AI agent from the terminal. |
| `naming-audit` | [toxicwind/naming-audit](https://github.com/toxicwind/naming-audit.git) | — |
| `nim-inkling-api-research` | [toxicwind/nim-inkling-api-research](https://github.com/toxicwind/nim-inkling-api-research.git) | — |
| `nim-omnibus` | [toxicwind/nim-omnibus](https://github.com/toxicwind/nim-omnibus.git) | > Part of **the ranch** — NVIDIA NIM fleet, Brev cloud, NVCF functions, garak fuzzing, and security audit tool |
| `nim-repos/api-evangelist-nvidia-nim` | [api-evangelist/nvidia-nim](https://github.com/api-evangelist/nvidia-nim) | — |
| `nim-repos/bauka0-nvidia-nim-provider` | [bauka0/nvidia-nim-provider](https://github.com/bauka0/nvidia-nim-provider) | — |
| `nim-repos/david-eve-za-nvidia-nim-mcp` | [david-eve-za/nvidia-nim-mcp](https://github.com/david-eve-za/nvidia-nim-mcp) | — |
| `nim-repos/diegovisk-pi-nvidia-nim` | [diegovisk/pi-nvidia-nim](https://github.com/diegovisk/pi-nvidia-nim) | — |
| `nim-repos/furqanafridi-free-claude-code` | [furqanafridi/free-claude-code](https://github.com/furqanafridi/free-claude-code) | — |
| `nim-repos/gabriel-ferraresi-NIMGEN` | [gabriel-ferraresi/NIMGEN](https://github.com/gabriel-ferraresi/NIMGEN) | — |
| `nim-repos/Gitlawb-openclaude` | [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) | — |
| `nim-repos/h0rcrux-hermes-backup` | [h0rcrux/hermes-backup](https://github.com/h0rcrux/hermes-backup) | — |
| `nim-repos/iammalego-keymux` | [iammalego/keymux](https://github.com/iammalego/keymux) | — |
| `nim-repos/joeldg-nvidiarouter` | [joeldg/nvidiarouter](https://github.com/joeldg/nvidiarouter) | — |
| `nim-repos/lizhebio-nim-qwen-model-router` | [lizhebio/nim-qwen-model-router](https://github.com/lizhebio/nim-qwen-model-router) | — |
| `nim-repos/lucky-mandator-gocode-router` | [lucky-mandator/gocode-router](https://github.com/lucky-mandator/gocode-router) | — |
| `nim-repos/mschwarzmueller-pi_agent_rust` | [mschwarzmueller/pi_agent_rust](https://github.com/mschwarzmueller/pi_agent_rust) | — |
| `nim-repos/musistudio-claude-code-router` | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | — |
| `nim-repos/nezerkc-opencode-provider-nvidia-nim` | [nezerkc/opencode-provider-nvidia-nim](https://github.com/nezerkc/opencode-provider-nvidia-nim) | — |
| `nim-repos/nirholas-three.ws` | [nirholas/three.ws](https://github.com/nirholas/three.ws) | — |
| `nim-repos/NVIDIA-NemoClaw` | [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw) | — |
| `nim-repos/olszalsik-a0-nvidia-nim` | [olszalsik/a0-nvidia-nim](https://github.com/olszalsik/a0-nvidia-nim) | — |
| `nim-repos/rickeshtn-nim-code` | [rickeshtn/nim-code](https://github.com/rickeshtn/nim-code) | — |
| `nim-repos/Sateeshreddymaddi-Custom-Nvidia-Nim-Node` | [Sateeshreddymaddi/Custom-Nvidia-Nim-Node](https://github.com/Sateeshreddymaddi/Custom-Nvidia-Nim-Node) | — |
| `nim-repos/shaivpidadi-freeridev3` | [shaivpidadi/freeridev3](https://github.com/shaivpidadi/freeridev3) | — |
| `nim-repos/stillhue-claudio` | [stillhue/claudio](https://github.com/stillhue/claudio) | — |
| `nim-repos/thispointon-kondi` | [thispointon/kondi](https://github.com/thispointon/kondi) | — |
| `nim-repos/tibbee-pi-nvidia-nim-provider` | [tibbee/pi-nvidia-nim-provider](https://github.com/tibbee/pi-nvidia-nim-provider) | — |
| `nim-repos/xRyul-pi-nvidia-nim` | [xRyul/pi-nvidia-nim](https://github.com/xRyul/pi-nvidia-nim) | — |
| `null-g-proxy` | [toxicwind/null-g-proxy](https://github.com/toxicwind/null-g-proxy.git) | — |
| `nuvio` | [toxicwind/nuvio](https://github.com/toxicwind/nuvio.git) | Nuvio is a custom Stremio-based media theater for **LG webOS TVs**. It exists because the |
| `nvidia-alive` | [toxicwind/nvidia-alive](https://github.com/toxicwind/nvidia-alive.git) | > Live endpoint auditing for NVIDIA NIM — and every provider in the |
| `nvidia-kernel-guard` | [toxicwind/nvidia-kernel-guard](https://github.com/toxicwind/nvidia-kernel-guard.git) | — |
| `nvidia-nim-model-probe` | [toxicwind/nvidia-nim-model-probe](https://github.com/toxicwind/nvidia-nim-model-probe.git) | — |
| `oh-my-pi` | [toxicwind/oh-my-pi](https://github.com/toxicwind/oh-my-pi.git) | — |
| `OmniRoute` | [toxicwind/OmniRoute](https://github.com/toxicwind/OmniRoute.git) | — |
| `openfang` | [toxicwind/openfang](https://github.com/toxicwind/openfang.git) | — |
| `openfang-join` | [toxicwind/openfang-join](https://github.com/toxicwind/openfang-join.git) | Admit a fleet (squawk) agent into OpenFang as a first-class agent. One command: |
| `openrouter-probe` | [toxicwind/openrouter-probe](https://github.com/toxicwind/openrouter-probe.git) | — |
| `ops` | [toxicwind/ops](https://github.com/toxicwind/ops.git) | — |
| `opsis` | [toxicwind/opsis](https://github.com/toxicwind/opsis.git) | — |
| `outlier-toolkit` | [toxicwind/outlier-toolkit](https://github.com/toxicwind/outlier-toolkit.git) | Outlier (Scale AI's contributor platform) publishes no publi |
| `outsource` | [toxicwind/outsource](https://github.com/toxicwind/outsource.git) | A Claude Code skill that runs **third-party model CLIs as headless implementation sub-agents**. The lead Claud |
| `pack-fix` | [toxicwind/pack-fix](https://github.com/toxicwind/pack-fix.git) | — |
| `paper-poller` | [toxicwind/paper-poller](https://github.com/toxicwind/paper-poller.git) | — |
| `pdfshield` | [purvalsingh/pdfshield](https://github.com/purvalsingh/pdfshield.git) | A machine-learning classifier that reads a PDF's *internal structure* and *what its JavaScript actually does* |
| `pearlctl` | [toxicwind/pearlctl](https://github.com/toxicwind/pearlctl.git) | — |
| `phone-lane` | [toxicwind/phone-lane](https://github.com/toxicwind/phone-lane.git) | — |
| `phone-ocr-sweep` | [toxicwind/phone-ocr-sweep](https://github.com/toxicwind/phone-ocr-sweep.git) | OCR sweep over adb-pulled phone screenshots (corpus at /home/toxic/ocr-sweep/shots/, |
| `phone-sentinel` | [toxicwind/phone-sentinel](https://github.com/toxicwind/phone-sentinel.git) | Zero-touch, network-reactive ADB sentinel for Chris's Pixel 9 Pro XL on LAN and Tailscale. |
| `pinax` | [toxicwind/pinax](https://github.com/toxicwind/pinax.git) | > *Every flock comes home to **roost** — where the birds settle, perch, and |
| `pj-fast` | [toxicwind/pj-fast](https://github.com/toxicwind/pj-fast.git) | — |
| `plugin-ecosystem` | [toxicwind/plugin-ecosystem](https://github.com/toxicwind/plugin-ecosystem.git) | — |
| `plugin-ecosystem/agentpluginzoo` | [tezansahu/agentpluginzoo](https://github.com/tezansahu/agentpluginzoo.git) | — |
| `ralph-dashboard` | [toxicwind/ralph-dashboard](https://github.com/toxicwind/ralph-dashboard.git) | > **toxicwind fork** of Endogen/ralph-dashboard. |
| `refusal-hunt` | [toxicwind/refusal-hunt](https://github.com/toxicwind/refusal-hunt.git) | Agent serving layers sometimes **refuse benign work** — and the refusal hides |
| `repo-first-class` | [toxicwind/repo-first-class](https://github.com/toxicwind/repo-first-class.git) | > **Make any GitHub repo first-class: a canonical, current checkout — maximally polished, committed, pushed, r |
| `rig` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | — |
| `rig-ciwatch` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | — |
| `roundup-site` | [owieth/turborepo-example](https://github.com/owieth/turborepo-example) | A modern monorepo template built with Next.js 16, React 19, Tailwind CSS v4, TypeScript 5.9, Turborepo, and pn |
| `rust-wrappers` | [toxicwind/rust-wrappers](https://github.com/toxicwind/rust-wrappers.git) | — |
| `safety-review-gate` | [toxicwind/safety-review-gate](https://github.com/toxicwind/safety-review-gate.git) | > **The evidence locker for the safety-review gate investigation — run-ID backfill artifacts, checksummed and  |
| `secretsmith` | [toxicwind/secretsmith](https://github.com/toxicwind/secretsmith.git) | Fork lineage: [GNOME/libsecret](https://github |
| `session-bus-refresh` | [toxicwind/session-bus-refresh](https://github.com/toxicwind/session-bus-refresh.git) | Refresh is the **same one-shot join-packet read at a newer cursor**. A worker |
| `skillforge` | [toxicwind/skillforge](https://github.com/toxicwind/skillforge.git) | > This repository is a fresh scaffold — the packaging tooling it describes does not exist in the tree yet. |
| `stealthprint` | [toxicwind/stealthprint](https://github.com/toxicwind/stealthprint.git) | A reusable library for fingerprinting stealth / anonymous models served behind |
| `strudel-dev-vite` | [toxicwind/strudel-dev-vite](https://github.com/toxicwind/strudel-dev-vite.git) | — |
| `strudel-sampler-server-vite` | [toxicwind/strudel-sampler-server-vite](https://github.com/toxicwind/strudel-sampler-server-vite.git) | — |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `super-board` | [toxicwind/super-board](https://github.com/toxicwind/super-board.git) | — |
| `tau-verify` | [toxicwind/tau](https://github.com/toxicwind/tau.git) | — |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | — |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | — |
| `tok` | [toxicwind/tok](https://github.com/toxicwind/tok.git) | deps, zero network at runtime, works anywhere Bun or Node runs. A dr |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | — |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | — |
| `toxicwind-repos` | [toxicwind/toxicwind-repos](https://github.com/toxicwind/toxicwind-repos) | — |
| `trading-post` | [toxicwind/trading-post](https://github.com/toxicwind/trading-post.git) | tasks go up on the board; agents bid, win, execute, and get settled — on the |
| `universal-keypool-bun` | [toxicwind/universal-keypool-bun](https://github.com/toxicwind/universal-keypool-bun.git) | > **Status (2026-09-30 audit):** 17/17 tests pass (node --test / bun test); node --check lint clean. Package r |
| `universal-keypool-gateway` | [toxicwind/universal-keypool-gateway](https://github.com/toxicwind/universal-keypool-gateway.git) | > **High-throughput key rotation, speculative latency racing, status-aware cooldown state machines, model virt |
| `VansRouter` | [toxicwind/VansRouter](https://github.com/toxicwind/VansRouter.git) | — |
| `vendor/tailnet-doctor` | [toxicwind/tailnet-doctor](https://github.com/toxicwind/tailnet-doctor.git) | — |
| `websites/arlockworks/app` | [toxicwind/arlockworks-next](https://github.com/toxicwind/arlockworks-next.git) | — |
| `websites/arlockworks/app` | [toxicwind/arlockworks-next](https://github.com/toxicwind/arlockworks-next.git) | — |
| `websites/arlockworks/main` | [toxicwind/arlockworks-core](https://github.com/toxicwind/arlockworks-core.git) | — |
| `websites/arlockworks/main` | [toxicwind/arlockworks-core](https://github.com/toxicwind/arlockworks-core.git) | — |
| `websites/effusionlabs/main` | [toxicwind/effusion-labs](https://github.com/toxicwind/effusion-labs.git) | — |
| `websites/effusionlabs/main` | [toxicwind/effusion-labs](https://github.com/toxicwind/effusion-labs.git) | — |
| `websites/effusionlabs/tickets` | [toxicwind/effusion-labs-tickets](https://github.com/toxicwind/effusion-labs-tickets.git) | — |
| `websites/effusionlabs/tickets` | [toxicwind/effusion-labs-tickets](https://github.com/toxicwind/effusion-labs-tickets.git) | — |
| `wezterm` | [toxicwind/wezterm](https://github.com/toxicwind/wezterm.git) | — |
| `workmux` | [toxicwind/workmux](https://github.com/toxicwind/workmux.git) | — |
| `zed-android-port` | [toxicwind/zed-android-port](https://github.com/toxicwind/zed-android-port.git) | Started as a joke. Rust on aarch64, sounded portable. Laughed about it. Kept going. Couldn't stop. There's an  |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 148 |
| package.json repository | 3 |
| go.mod module | 1 |
| git remote upstream | 1 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|
| TypeScript | 32,726 |
| Markdown | 7,773 |
| JavaScript | 6,881 |
| Rust | 5,196 |
| Go | 5,032 |
| JSON | 4,623 |
| SVG | 4,053 |
| Python | 3,344 |
| MAP | 2,937 |
| MDX | 2,018 |
| TSX | 1,950 |
| PNG | 1,644 |
| PYC | 1,301 |
| QML | 1,158 |
| Kotlin | 1,081 |
| YAML | 1,001 |
| TOML | 976 |
| Shell | 931 |
| Text | 910 |
| O | 898 |

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `vendored` | 0.0 MB | 0 | — |
| `openrouter-probe` | 0.0 MB | 83 | github.com/toxicwind/openrouter-probe |
| `estate-scripts` | 0.0 MB | 125 | github.com/toxicwind/estate-scripts |
| `refusal-hunt` | 0.0 MB | 3,237 | github.com/toxicwind/refusal-hunt |
| `OmniRoute` | 0.0 MB | 24,058 | github.com/toxicwind/OmniRoute |
| `github-search` | 0.0 MB | 674 | github.com/toxicwind/github-search |
| `tau` | 0.0 MB | 7,815 | github.com/can1357/oh-my-pi |
| `squawk` | 0.0 MB | 213 | — |
| `tau-verify` | 0.0 MB | 7,810 | github.com/toxicwind/tau |
| `godzilla-llama.cpp` | 0.0 MB | 3,869 | github.com/toxicwind/godzilla-llama.cpp |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/toxicwind/rig](https://github.com/toxicwind/rig) | 2 |
| [github.com/toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide) | 1 |
| [github.com/toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard) | 1 |
| [github.com/aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics) | 1 |
| [github.com/toxicwind/agon](https://github.com/toxicwind/agon) | 1 |
| [github.com/toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve) | 1 |
| [github.com/toxicwind/android-fleet](https://github.com/toxicwind/android-fleet) | 1 |
| [github.com/toxicwind/antilogos](https://github.com/toxicwind/antilogos) | 1 |
| [github.com/toxicwind/arroyo](https://github.com/toxicwind/arroyo) | 1 |
| [github.com/toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|
| `rig` | `rig-ciwatch` | 100.0% |
| `tau` | `tau-verify` | 100.0% |
| `agon` | `forge` | 71.4% |
| `agon` | `antilogos` | 66.7% |
| `estate-hatch-toolkit` | `pearlctl` | 60.6% |
| `agent-customization-style-guide` | `mcp-dropin-guide` | 57.1% |
| `estate-chat` | `fleet-chat` | 55.4% |
| `meta-research-toolkit` | `model-max` | 55.3% |
| `agon` | `gavel` | 54.5% |
| `antilogos` | `gavel` | 54.5% |

## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 148 |
| Fork (ours) | 138 |
| Upstream mirror | 21 |
| Fork (ours, no upstream) | 6 |
| Upstream mirror (no upstream) | 2 |
| Experimental | 58 |
| Stub/Empty | 29 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-20T00:00:54.067Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
