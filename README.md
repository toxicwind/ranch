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

## 📊 Monorepo Statistics (generated 10/19/2026, 5:35:39 PM)

| Metric | Value |
|---|---|
| Total directories | 246 |
| Directories with obvious upstream | 152 / 246 (61.8%) |
| Git-tracked directories | 159 |
| Submodules | 146 |
| Total size | 321.56 GB |
| Total tracked files | 1,061,010 |

## 🗂️ Registered Submodules (222)

The full map — every animal's pen, with its repo and description (from README heads). From `.gitmodules` + `FORKS-report.json`; regenerate with the README.

| Path | Repo | Description |
|---|---|---|
| `agent-customization-style-guide` | [toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide.git) | A style guide for writing correct AGENTS.md, .prompt.md, .agent.md and .instructions.md files. Flat R-NNN rule |
| `agent-dashboard` | [toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard.git) | Working fork of vercel/next.js for the agent-dashboard effort |
| `AgentForensics` | [aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics.git) | AgentForensics is an open-source security framework that monitors complete LLM agent sessions in real time, de |
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
| `barn/flatbread` | [toxicwind/flatbread](https://github.com/toxicwind/flatbread.git) | Context alignment, version controlled. |
| `barn/nativelink` | [toxicwind/nativelink](https://github.com/toxicwind/nativelink.git) | NativeLink is a Nix-powered, open source, high-performance build cache and remote execution server, compatible |
| `barn/rosec` | [toxicwind/rosec](https://github.com/toxicwind/rosec.git) | A secrets daemon implementing the freedesktop.org Secret Service API with modular backend providers |
| `barn/weave` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | Entity-level git merge driver. Resolves false conflicts git invents when independent agents edit the same file |
| `barn/weave-sub` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | Entity-level git merge driver. Resolves false conflicts git invents when independent agents edit the same file |
| `bench-radar` | [toxicwind/bench-radar](https://github.com/toxicwind/bench-radar.git) | Nobody reads the nightly benchmark log — so this service does, and **pages |
| `borrowed/herdr` | [ogulcancelik/herdr](https://github.com/ogulcancelik/herdr.git) | the runtime your coding agents live on |
| `borrowed/loom` | [rjwalters/loom](https://github.com/rjwalters/loom.git) | Agent Orchestration |
| `bridge` | [toxicwind/bridge](https://github.com/toxicwind/bridge.git) | The bridge is the control plane between **hatch** (this cell) and **yote** (the heavy box). This project holds |
| `bugbounty` | [toxicwind/bugbounty](https://github.com/toxicwind/bugbounty.git) | Headed Playwright helpers that open the **real paid bounty programs** for |
| `campfire` | [toxicwind/campfire](https://github.com/toxicwind/campfire.git) | > 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map. |
| `chronos-forge` | [toxicwind/chronos-forge](https://github.com/toxicwind/chronos-forge.git) | A repo-scoped **Mixture-of-Experts agent backplane** with an endless, |
| `classifier` | [toxicwind/classifier](https://github.com/toxicwind/classifier.git) | — |
| `classifier-preflight` | [toxicwind/classifier-preflight](https://github.com/toxicwind/classifier-preflight.git) | Internal meta tool: preflight any text that goes into a scheduled task body, |
| `codebase-memory` | [toxicwind/codebase-memory](https://github.com/toxicwind/codebase-memory.git) | — |
| `computer-use-linux` | [toxicwind/computer-use-linux](https://github.com/toxicwind/computer-use-linux.git) | Linux desktop control over MCP — AT-SPI, GNOME Shell, Wayland portals, ydotool |
| `corral` | [toxicwind/corral](https://github.com/toxicwind/corral.git) | > **Ticket-driven development & speculative merge queue — evolved from super-ralph lineage** |
| `cron-trust` | [toxicwind/cron-trust](https://github.com/toxicwind/cron-trust.git) | — |
| `dashboard` | [toxicwind/dashboard](https://github.com/toxicwind/dashboard.git) | — |
| `dedicated/dedicated-server-ops` | [toxicwind/dedi-ops](https://github.com/toxicwind/dedi-ops.git) | Dedicated-host automation: Ansible, edge/domain routing, service orchestration, runbooks. |
| `didymos` | [toxicwind/didymos](https://github.com/toxicwind/didymos.git) | *First-class Gemini API MCP server for the mesh: a self-healing multi-key pool with round-robin + automatic fa |
| `disparate-latent-experiment` | [toxicwind/disparate-latent-experiment](https://github.com/toxicwind/disparate-latent-experiment.git) | — |
| `doorbell` | [toxicwind/doorbell](https://github.com/toxicwind/doorbell.git) | ranch/doorbell — estate MCP monad (tier policies, SSE, /sessions). Curl install from raw main. |
| `dots-client` | [toxicwind/dots-client](https://github.com/toxicwind/dots-client.git) | Alternate model-call shim for Dots-3-Note (`dots-studio/dots-3-note-preview:free`) |
| `drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | Drover: Autonomous herd-level model router, ACP agent host, and multi-model intelligence extension for VS Code |
| `dualspace-ast-bm25-hybrid` | [toxicwind/dualspace-ast-bm25-hybrid](https://github.com/toxicwind/dualspace-ast-bm25-hybrid.git) | Dual-space AST call-graph + BM25 reciprocal-rank-fusion code retrieval engine for autonomous coding agents |
| `duel/vendor/argus-ai-debate` | [Argus-Framework/argus-ai-debate](https://github.com/Argus-Framework/argus-ai-debate.git) | Multi-agent AI framework where LLMs debate each other to verify claims. Bayesian reasoning, adversarial eviden |
| `duel/vendor/ChatEval` | [thunlp/ChatEval](https://github.com/thunlp/ChatEval.git) | Codes for our paper "ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate" |
| `duel/vendor/debate-or-vote` | [deeplearning-wisc/debate-or-vote](https://github.com/deeplearning-wisc/debate-or-vote.git) | Official code repo for NeurIPS 2025 Spotlight paper, "Debate or Vote: Which Yields Better Decisions in Multi-A |
| `duel/vendor/llm_debate` | [ucl-dark/llm_debate](https://github.com/ucl-dark/llm_debate.git) | Code release for "Debating with More Persuasive LLMs Leads to More Truthful Answers" |
| `duet` | [toxicwind/duet](https://github.com/toxicwind/duet.git) | Fast, real-time two-way file sync over SSH. One command, no daemons — .gitignore-aware, blake3-cached, rsync-s |
| `emergent` | [toxicwind/emergent](https://github.com/toxicwind/emergent.git) | One research question in → ranked code patterns out. Built 2026-10-03 (tansy lane). |
| `estate-chat` | [toxicwind/estate-chat](https://github.com/toxicwind/estate-chat.git) | The fleet's first-class coordination plane on awrawr-pc. Presence, live |
| `estate-dispersal` | [toxicwind/sovereign-dispersal](https://github.com/toxicwind/sovereign-dispersal.git) | Bun monolith fusing seven overlooked substrates: sovereign fs-map, ralph regen, pi-natives, fastest-wins cance |
| `estate-dispersal-monolith` | [toxicwind/estate-dispersal-monolith](https://github.com/toxicwind/estate-dispersal-monolith.git) | — |
| `estate-end4` | [toxicwind/sovereign-end4](https://github.com/toxicwind/sovereign-end4.git) | Usability-first dotfiles |
| `estate-hatch-toolkit` | [toxicwind/estate-hatch-toolkit](https://github.com/toxicwind/estate-hatch-toolkit.git) | — |
| `estate-kappa-plugin` | [toxicwind/estate-kappa-plugin](https://github.com/toxicwind/estate-kappa-plugin.git) | Native estate plugins for kappa (gatehouse MCP, herd local models, hodos strategy) |
| `estate-monitor` | [toxicwind/estate-monitor](https://github.com/toxicwind/estate-monitor.git) | — |
| `estate-recon` | [toxicwind/estate-recon](https://github.com/toxicwind/estate-recon.git) | **Unified Sovereign Reconnaissance Repository.** |
| `estate-scripts` | [toxicwind/estate-scripts](https://github.com/toxicwind/estate-scripts.git) | Consolidated repository of operational, CI/CD, release, benchmark, and auditing scripts for the estate-scripts |
| `estate-scripts-dispersal` | [toxicwind/estate-scripts-dispersal](https://github.com/toxicwind/estate-scripts-dispersal.git) | — |
| `estate-scripts-end4` | [toxicwind/estate-scripts-end4](https://github.com/toxicwind/estate-scripts-end4.git) | — |
| `estate-scripts-scripts` | [toxicwind/estate-scripts-scripts](https://github.com/toxicwind/estate-scripts-scripts.git) | — |
| `estate-scripts-skills` | [toxicwind/estate-scripts-skills](https://github.com/toxicwind/estate-scripts-skills.git) | — |
| `estate-shell` | [toxicwind/estate-shell](https://github.com/toxicwind/estate-shell.git) | The shell SSOT for the estate: **dots** (hypr, quickshell ii, fish, foot, kitty, |
| `estate-skills` | [toxicwind/sovereign-skills](https://github.com/toxicwind/sovereign-skills.git) | Kimi-style skill definitions and agent orchestration patterns. Extensible skill framework for LLM agent swarms |
| `estate-skills-hub` | [toxicwind/estate-skills-hub](https://github.com/toxicwind/estate-skills-hub.git) | OPERATION SPARKFALL audit batch 4 |
| `estate-whoa-breakthrough` | [toxicwind/estate-whoa-breakthrough](https://github.com/toxicwind/estate-whoa-breakthrough.git) | — |
| `examples` | [toxicwind/examples](https://github.com/toxicwind/examples.git) | Runnable proof that the ranch works. Everything here runs against the live |
| `extensions` | [toxicwind/extensions](https://github.com/toxicwind/extensions.git) | — |
| `extensions/drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | Drover: Autonomous herd-level model router, ACP agent host, and multi-model intelligence extension for VS Code |
| `fanout` | [toxicwind/fanout](https://github.com/toxicwind/fanout.git) | Runs shell commands **concurrently** and prints a per-leg receipt. Built for |
| `fast-race` | [toxicwind/fast-race](https://github.com/toxicwind/fast-race.git) | `fast_race.py` applies the squawk HFT latency doctrine |
| `ferret-den` | [toxicwind/ferret-den](https://github.com/toxicwind/ferret-den.git) | MCP translation layer for ProjectDiscovery recon. den:whisker runs subfinder. den:fang runs nuclei. Confirm ga |
| `fleet` | [toxicwind/fleet](https://github.com/toxicwind/fleet.git) | — |
| `fleet-chat` | [toxicwind/fleet-chat](https://github.com/toxicwind/fleet-chat.git) | The fleet's first-class coordination server on awrawr-pc. Rooms, real |
| `fleet-ops` | [toxicwind/fleet-ops](https://github.com/toxicwind/fleet-ops.git) | Built 2026-09-19 after the iowait-freeze incident (50–80% iowait, load |
| `fleetd` | [toxicwind/fleetd](https://github.com/toxicwind/fleetd.git) | fleetd: first-class fleet coordination daemon (join/presence/send/read over WS+HTTP, SQLite, tailnet) |
| `flicker` | [toxicwind/flicker](https://github.com/toxicwind/flicker.git) | Woodpecker is a simple, yet powerful CI/CD engine with great extensibility. |
| `forge` | [toxicwind/forge](https://github.com/toxicwind/forge.git) | — |
| `forge/router/weasel` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | Never stop coding. Free MIT AI gateway: one endpoint, 375 providers (150+ free), 1,400+ models Kimi, Claude, G |
| `forge/web` | [toxicwind/CMSaasStarter](https://github.com/toxicwind/CMSaasStarter.git) | A modern SaaS template/boilerplate built with SvelteKit, Tailwind, and Supabase. Includes marketing page, blog |
| `freebuffet` | [toxicwind/freebuffet](https://github.com/toxicwind/freebuffet.git) | **One CLI to configure every AI coding agent with 165 LLM providers.** |
| `furlong/vendor/coder_reviewer_reranking` | [facebookresearch/coder_reviewer_reranking](https://github.com/facebookresearch/coder_reviewer_reranking.git) | Official code release for the paper Coder Reviewer Reranking for Code Generation. |
| `furlong/vendor/RACE` | [jszheng21/RACE](https://github.com/jszheng21/RACE.git) | RACE is a multi-dimensional benchmark for code generation that focuses on Readability, mAintainability, Correc |
| `furlong/vendor/speed-run` | [2389-research/speed-run](https://github.com/2389-research/speed-run.git) | Token-efficient code generation pipeline - parallel implementation with hosted LLM (Cerebras) for ~60% token s |
| `furlong/vendor/SRank-CodeRanker` | [FSoft-AI4Code/SRank-CodeRanker](https://github.com/FSoft-AI4Code/SRank-CodeRanker.git) | [ACL 2024] Novel reranking method to select the best solutions for code generation |
| `gavel` | [toxicwind/gavel](https://github.com/toxicwind/gavel.git) | **The auction market for dispatches.** Gavel runs an auctioneer and a field of |
| `gavel/vendor/agora` | [KAIJUJO/Agora](https://github.com/KAIJUJO/Agora.git) | Framework for confidence-calibrated, auction-based task allocation for LLM agents |
| `gavel/vendor/auction-agent11` | [wushuchris/11-distributed-auction-task-allocation-agent](https://github.com/wushuchris/11-distributed-auction-task-allocation-agent.git) | Distributed multi-agent task allocation using typed auctions, deterministic bidding rules, reallocation, and a |
| `gavel/vendor/contract-net-router` | [M00C1FER/contract-net-router](https://github.com/M00C1FER/contract-net-router.git) | Capability-based agent router — Contract Net Protocol bidding, coalition building, health-aware penalty scorin |
| `gayxxx-estate` | [toxicwind/gayxxx-estate](https://github.com/toxicwind/gayxxx-estate.git) | A CloudStream extension repository: **19 CS3 plugins repacked from validated DEX** (ZIP archives with `classes |
| `ghq` | [toxicwind/ghq](https://github.com/toxicwind/ghq.git) | — |
| `github-search` | [toxicwind/github-search](https://github.com/toxicwind/github-search.git) | > **TOXICWIND FORK** — Autonomous high-recall GitHub search client, API server, Next.js frontend, and Model Co |
| `gito` | [toxicwind/gito](https://github.com/toxicwind/gito.git) | — |
| `godzilla-llama.cpp` | [toxicwind/godzilla-llama.cpp](https://github.com/toxicwind/godzilla-llama.cpp.git) | Windows-first **MSVC + CUDA** |
| `hatch` | [toxicwind/hatch](https://github.com/toxicwind/hatch.git) | Hatch — runtime cell tooling and side-channel shim (split from estate) |
| `hatch-decode` | [toxicwind/hatch-decode](https://github.com/toxicwind/hatch-decode.git) | > **Why should you care?** The runtime daemon that owns your cell has 158 |
| `hatch/kite-cli` | [toxicwind/kite-cli](https://github.com/toxicwind/kite-cli.git) | kite-cli: talk to your personal muse.ai AI agent from the terminal |
| `herd` | [toxicwind/herd](https://github.com/toxicwind/herd.git) | Herd — Orchestrate fleets of LLM inference engines. Zero downtime, zero friction. |
| `herdproof-bun` | [toxicwind/herdproof-bun](https://github.com/toxicwind/herdproof-bun.git) | — |
| `hf-model-sync` | [toxicwind/hf-model-sync](https://github.com/toxicwind/hf-model-sync.git) | — |
| `hodos` | [toxicwind/hodos](https://github.com/toxicwind/hodos.git) | — |
| `host-proof` | [toxicwind/host-proof](https://github.com/toxicwind/host-proof.git) | A universal **read-only** host proof bundle. Point it at any box and it |
| `identity-router` | [toxicwind/identity-router](https://github.com/toxicwind/identity-router.git) | Universal knowledge router for durable agent memory: routes lessons, preferences, rules and corrections to the |
| `kairos` | [toxicwind/kairos](https://github.com/toxicwind/kairos.git) | *The opportune moment* — the 2-second rule, first-class: every command an agent |
| `keep` | [toxicwind/keep](https://github.com/toxicwind/keep.git) | **keep is the single home for secrets.** Nothing secret ever lives in chat, |
| `keryx` | [toxicwind/keryx](https://github.com/toxicwind/keryx.git) | > **File-based multi-agent chat. No daemon, no sockets, no HTTP — just a |
| `kilo` | [toxicwind/kilo](https://github.com/toxicwind/kilo.git) | — |
| `kimi-auto` | [toxicwind/kimi-auto](https://github.com/toxicwind/kimi-auto.git) | kimi-auto dynamic model resolver (pitchfork daemon) |
| `kimi-claw` | [toxicwind/kimi-claw](https://github.com/toxicwind/kimi-claw.git) | — |
| `kodi-fleet` | [toxicwind/kodi-fleet](https://github.com/toxicwind/kodi-fleet.git) | A[awrawr-pc] --> H[kodi-handoff] |
| `kryptos` | [toxicwind/kryptos](https://github.com/toxicwind/kryptos.git) | > **The maximal freedesktop Secret Service CLI.** A from-scratch Python |
| `lasso` | [toxicwind/lasso](https://github.com/toxicwind/lasso.git) | > 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map. |
| `leakfix-src` | [toxicwind/leakfix-src](https://github.com/toxicwind/leakfix-src.git) | — |
| `ledger` | [toxicwind/ledger](https://github.com/toxicwind/ledger.git) | > 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map. |
| `lib` | [toxicwind/lib](https://github.com/toxicwind/lib.git) | — |
| `loom` | [toxicwind/loom](https://github.com/toxicwind/loom.git) | Agent Orchestration |
| `matter-server` | [toxicwind/matter-server](https://github.com/toxicwind/matter-server.git) | The live Matter app runs from `/home/toxic/.matter-server/app` — outside |
| `maw` | [toxicwind/maw](https://github.com/toxicwind/maw.git) | `maw` is a coordination layer for teams running many coding agents in parallel on one repo. |
| `mcp` | [toxicwind/mcp](https://github.com/toxicwind/mcp.git) | — |
| `mcp-dropin-guide` | [toxicwind/mcp-dropin-guide](https://github.com/toxicwind/mcp-dropin-guide.git) | A style guide for writing MCP drop-in servers: stdio JSON-RPC, Content-Length framing, tool schemas, and doorb |
| `mcp/mcp-prompt-injection-detector` | [thilinawishvekeerthi/mcp-prompt-injection-detector](https://github.com/thilinawishvekeerthi/mcp-prompt-injection-detector.git) | Lightweight explainable ML system for pre-invocation MCP tool poisoning and prompt injection detection. XGBoos |
| `mcp/mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | Supercharge AI Agents, Safely |
| `mcp/pd-mcp-standalone` | [toxicwind/pd-mcp](https://github.com/toxicwind/pd-mcp.git) | MCP server for ProjectDiscovery recon tools — subfinder, dnsx, naabu, httpx, katana, nuclei, tlsx, shuffledns. |
| `mcp/rsync-mcp` | [toxicwind/rsync-mcp](https://github.com/toxicwind/rsync-mcp.git) | Rsync MCP: the /home/toxic rsync connection as a first-class MCP server (Bun/TypeScript, stdio). Fork lineage: |
| `mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | Supercharge AI Agents, Safely |
| `mesh` | [toxicwind/mesh](https://github.com/toxicwind/mesh.git) | *One endpoint in front of everything: multi-provider LLM routing, MCP federation, and browser automation for t |
| `mesh/pylae` | [toxicwind/flocksync](https://github.com/toxicwind/flocksync.git) | — |
| `meta-research-toolkit` | [toxicwind/meta-research-toolkit](https://github.com/toxicwind/meta-research-toolkit.git) | — |
| `metaaivm` | [toxicwind/metaaivm](https://github.com/toxicwind/metaaivm.git) | Incremental GitHub harvester for `metaaivm`-related keywords. Runs on yote |
| `metaaivm-profile` | [toxicwind/metaaivm-profile](https://github.com/toxicwind/metaaivm-profile.git) | First-class agent profile for the Meta AI VM (metaaivm.com) estate. |
| `metaclaw-runtime` | [toxicwind/metaclaw-runtime](https://github.com/toxicwind/metaclaw-runtime.git) | Zero-Browser Noise_XX WebSocket client, Sentinel auto-approval engine, and direct VM agent dispatcher for Meta |
| `mission-control` | [toxicwind/mission-control](https://github.com/toxicwind/mission-control.git) | Event-driven continuation controller. A parent mission stays open until |
| `ml-serve` | [toxicwind/ml-serve](https://github.com/toxicwind/ml-serve.git) | Hot-loaded ONNX segmentation + e621 native tag resolution over HTTP for the |
| `muse-cli` | [toxicwind/muse-cli](https://github.com/toxicwind/muse-cli.git) | CLI for your personal muse.ai AI agent: chat, side chats, feed, goals, ideas, and sessions from the terminal.  |
| `naming-audit` | [toxicwind/naming-audit](https://github.com/toxicwind/naming-audit.git) | — |
| `nim-inkling-api-research` | [toxicwind/nim-inkling-api-research](https://github.com/toxicwind/nim-inkling-api-research.git) | Research-grade tooling for evaluating NVIDIA NIM API compatibility, parameter discovery, and inference latency |
| `nim-omnibus` | [toxicwind/nim-omnibus](https://github.com/toxicwind/nim-omnibus.git) | > Part of [**the ranch**](https://github.com/toxicwind/ranch) — NVIDIA NIM fleet, Brev cloud, NVCF functions,  |
| `nim-repos/api-evangelist-nvidia-nim` | [api-evangelist/nvidia-nim](https://github.com/api-evangelist/nvidia-nim) | NVIDIA NIM — independent third-party profile of a public API surface, by API Evangelist. NVIDIA NIM (NVIDIA In |
| `nim-repos/bauka0-nvidia-nim-provider` | [bauka0/nvidia-nim-provider](https://github.com/bauka0/nvidia-nim-provider) | VS Code extension: NVIDIA NIM provider for AI agents (model catalog, tool-loop guard, sampling calibration) |
| `nim-repos/david-eve-za-nvidia-nim-mcp` | [david-eve-za/nvidia-nim-mcp](https://github.com/david-eve-za/nvidia-nim-mcp) | — |
| `nim-repos/diegovisk-pi-nvidia-nim` | [diegovisk/pi-nvidia-nim](https://github.com/diegovisk/pi-nvidia-nim) | — |
| `nim-repos/furqanafridi-free-claude-code` | [furqanafridi/free-claude-code](https://github.com/furqanafridi/free-claude-code) | Use claude-code for free in the terminal, VSCode extension or discord like OpenClaw (voice supported) |
| `nim-repos/gabriel-ferraresi-NIMGEN` | [gabriel-ferraresi/NIMGEN](https://github.com/gabriel-ferraresi/NIMGEN) | First MCP server for NVIDIA NIM FLUX - AI image generation & editing |
| `nim-repos/Gitlawb-openclaude` | [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) | runs anywhere. uses anything |
| `nim-repos/h0rcrux-hermes-backup` | [h0rcrux/hermes-backup](https://github.com/h0rcrux/hermes-backup) | Hermes Agent 备份 - 配置、记忆、Skills、免疫系统 |
| `nim-repos/iammalego-keymux` | [iammalego/keymux](https://github.com/iammalego/keymux) | Drop-in OpenAI SDK wrapper that pools API keys with smart scheduling — avoids 429s before they happen. Zero de |
| `nim-repos/joeldg-nvidiarouter` | [joeldg/nvidiarouter](https://github.com/joeldg/nvidiarouter) | route build.nvidia.com models |
| `nim-repos/lizhebio-nim-qwen-model-router` | [lizhebio/nim-qwen-model-router](https://github.com/lizhebio/nim-qwen-model-router) | — |
| `nim-repos/lucky-mandator-gocode-router` | [lucky-mandator/gocode-router](https://github.com/lucky-mandator/gocode-router) | — |
| `nim-repos/mschwarzmueller-pi_agent_rust` | [mschwarzmueller/pi_agent_rust](https://github.com/mschwarzmueller/pi_agent_rust) | High-performance AI coding agent CLI written in Rust with zero unsafe code |
| `nim-repos/musistudio-claude-code-router` | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | One local control plane for every AI agent: route across models, fuse new capabilities, orchestrate tools, and |
| `nim-repos/nezerkc-opencode-provider-nvidia-nim` | [nezerkc/opencode-provider-nvidia-nim](https://github.com/nezerkc/opencode-provider-nvidia-nim) | Open-source NVIDIA NIM provider for OpenCode. 67+ free models with one-click install. |
| `nim-repos/nirholas-three.ws` | [nirholas/three.ws](https://github.com/nirholas/three.ws) | — |
| `nim-repos/NVIDIA-NemoClaw` | [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw) | Run agents like Hermes, LangChain Deep Agents, and OpenClaw more securely inside NVIDIA OpenShell with managed |
| `nim-repos/olszalsik-a0-nvidia-nim` | [olszalsik/a0-nvidia-nim](https://github.com/olszalsik/a0-nvidia-nim) | nvidia_nim plugin for Agent Zero v2.5 (local backup) |
| `nim-repos/rickeshtn-nim-code` | [rickeshtn/nim-code](https://github.com/rickeshtn/nim-code) | Trying an alternative for claude-code |
| `nim-repos/Sateeshreddymaddi-Custom-Nvidia-Nim-Node` | [Sateeshreddymaddi/Custom-Nvidia-Nim-Node](https://github.com/Sateeshreddymaddi/Custom-Nvidia-Nim-Node) | An n8n community node that connects your workflows to NVIDIA NIM. Supports chat completions with NVIDIA-hosted |
| `nim-repos/shaivpidadi-freeridev3` | [shaivpidadi/freeridev3](https://github.com/shaivpidadi/freeridev3) | One free AI endpoint, every free tier behind it. Local OpenAI-compatible gateway routing across OpenRouter, Gr |
| `nim-repos/stillhue-claudio` | [stillhue/claudio](https://github.com/stillhue/claudio) | — |
| `nim-repos/thispointon-kondi` | [thispointon/kondi](https://github.com/thispointon/kondi) | A desktop app where AI personas debate before they act. Assemble a council of specialized agents — each with t |
| `nim-repos/tibbee-pi-nvidia-nim-provider` | [tibbee/pi-nvidia-nim-provider](https://github.com/tibbee/pi-nvidia-nim-provider) | NVIDIA NIM provider for pi coding agent — 100+ models with full thinking support |
| `nim-repos/xRyul-pi-nvidia-nim` | [xRyul/pi-nvidia-nim](https://github.com/xRyul/pi-nvidia-nim) | NVIDIA NIM API provider extension for pi coding agent - access 100+ models from build.nvidia.com |
| `null-g-proxy` | [toxicwind/null-g-proxy](https://github.com/toxicwind/null-g-proxy.git) | — |
| `nuvio` | [toxicwind/nuvio](https://github.com/toxicwind/nuvio.git) | Nuvio is a custom Stremio-based media theater for **LG webOS TVs**. It exists because the |
| `nvidia-alive` | [toxicwind/nvidia-alive](https://github.com/toxicwind/nvidia-alive.git) | Live endpoint auditing for NVIDIA NIM — don't trust providers, only endpoints. Probers, streaming clients, and |
| `nvidia-kernel-guard` | [toxicwind/nvidia-kernel-guard](https://github.com/toxicwind/nvidia-kernel-guard.git) | Per-kernel NVIDIA driver guard for Arch/CachyOS: every installed kernel flavor gets its matching nvidia-open d |
| `nvidia-nim-model-probe` | [toxicwind/nvidia-nim-model-probe](https://github.com/toxicwind/nvidia-nim-model-probe.git) | NVIDIA NIM lists 82 models. We probed 19 one by one with a fail-fast diagnostic ladder: only 5 answer. Raw dat |
| `oh-my-pi` | [toxicwind/oh-my-pi](https://github.com/toxicwind/oh-my-pi.git) | — |
| `OmniRoute` | [toxicwind/OmniRoute](https://github.com/toxicwind/OmniRoute.git) | Never stop coding. Free MIT AI gateway: one endpoint, 359 providers (150+ free), 1200+ models Kimi, Claude, GP |
| `openfang` | [toxicwind/openfang](https://github.com/toxicwind/openfang.git) | **An open-source Agent OS in Rust.** Not a chatbot framework, not a Python wrapper around an LLM — a full oper |
| `openfang-join` | [toxicwind/openfang-join](https://github.com/toxicwind/openfang-join.git) | Admit a fleet (squawk) agent into OpenFang as a first-class agent. One command: |
| `openrouter-probe` | [toxicwind/openrouter-probe](https://github.com/toxicwind/openrouter-probe.git) | **Stop trusting provider labels. Measure which free models actually follow instructio |
| `ops` | [toxicwind/ops](https://github.com/toxicwind/ops.git) | **Every fix lives in a real file.** The durable, committed home for operations scripts that used |
| `opsis` | [toxicwind/opsis](https://github.com/toxicwind/opsis.git) | *Headed browser automation for the fleet: one MCP server, one persistent Chromium, zero dead sessions.* |
| `outlier-toolkit` | [toxicwind/outlier-toolkit](https://github.com/toxicwind/outlier-toolkit.git) | Vendored community tooling for Outlier AI (Scale AI) contributor missions: queue watchers, pay analyzer, worke |
| `outsource` | [toxicwind/outsource](https://github.com/toxicwind/outsource.git) | **Your Claude session does the thinking. Cheaper model subscriptions do the typing.** |
| `pack-fix` | [toxicwind/pack-fix](https://github.com/toxicwind/pack-fix.git) | **Find orphaned stuff on yote and the cell — adopt it or clean it. Never leave a reorg half-done.* |
| `paper-poller` | [toxicwind/paper-poller](https://github.com/toxicwind/paper-poller.git) | Fleet paper-research capability: agents post PAPER-TASK directives, a pitchfork daemon claims and executes the |
| `pearlctl` | [toxicwind/pearlctl](https://github.com/toxicwind/pearlctl.git) | Drive Pixel Screenshots from the command line — decoded intent catalog + deep links + fast Bun CLI over ADB |
| `phone-lane` | [toxicwind/phone-lane](https://github.com/toxicwind/phone-lane.git) | — |
| `phone-ocr-sweep` | [toxicwind/phone-ocr-sweep](https://github.com/toxicwind/phone-ocr-sweep.git) | OCR sweep over adb-pulled phone screenshots (corpus at `/home/toxic/ocr-sweep/shots/`, |
| `phone-sentinel` | [toxicwind/phone-sentinel](https://github.com/toxicwind/phone-sentinel.git) | Zero-touch, network-reactive ADB sentinel for Chris's Pixel 9 Pro XL on LAN and Tailscale. |
| `pinax` | [toxicwind/pinax](https://github.com/toxicwind/pinax.git) | > *Every flock comes home to **roost** — where the birds settle, perch, and |
| `pj-fast` | [toxicwind/pj-fast](https://github.com/toxicwind/pj-fast.git) | pj-fast: Papa John's trpc recon toolkit — 50 env-configured Playwright scripts, verified deal routes; includes |
| `plugin-ecosystem` | [toxicwind/plugin-ecosystem](https://github.com/toxicwind/plugin-ecosystem.git) | — |
| `plugin-ecosystem/agentpluginzoo` | [tezansahu/agentpluginzoo](https://github.com/tezansahu/agentpluginzoo.git) | — |
| `ralph-dashboard` | [toxicwind/ralph-dashboard](https://github.com/toxicwind/ralph-dashboard.git) | toxicwind fork of Endogen/ralph-dashboard — Ralph agent run dashboard with yote durability fixes (discovery-ca |
| `refusal-hunt` | [toxicwind/refusal-hunt](https://github.com/toxicwind/refusal-hunt.git) | Refusal-storm forensics: ledger, detectors, and audits for canned-refusal / completed-badge anomalies. |
| `repo-first-class` | [toxicwind/repo-first-class](https://github.com/toxicwind/repo-first-class.git) | > **Make any GitHub repo first-class: a canonical, current checkout — maximally polished, committed, pushed, r |
| `rig` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | Self-hosted agent runtime in Rust — deploy autonomous AI agents from your terminal. 40 channels, 60 skills, 50 |
| `rig-ciwatch` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | Self-hosted agent runtime in Rust — deploy autonomous AI agents from your terminal. 40 channels, 60 skills, 50 |
| `roundup-site` | [owieth/turborepo-example](https://github.com/owieth/turborepo-example) | Modern monorepo template — Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, Nextra docs, TypeScript 5.9, Turb |
| `rust-wrappers` | [toxicwind/rust-wrappers](https://github.com/toxicwind/rust-wrappers.git) | — |
| `safety-review-gate` | [toxicwind/safety-review-gate](https://github.com/toxicwind/safety-review-gate.git) | Safety review gate investigation artifacts: run-ID backfill shards, validation, progress logs |
| `secretsmith` | [toxicwind/secretsmith](https://github.com/toxicwind/secretsmith.git) | Maximal Secret Service CLI: full CRUD, collections, schema registry, Chromium/Chrome os_crypt decrypt pipeline |
| `session-bus-refresh` | [toxicwind/session-bus-refresh](https://github.com/toxicwind/session-bus-refresh.git) | Refresh is the **same one-shot join-packet read at a newer cursor**. A worker |
| `skillforge` | [toxicwind/skillforge](https://github.com/toxicwind/skillforge.git) | Universal skill packaging for AI agents |
| `stealthprint` | [toxicwind/stealthprint](https://github.com/toxicwind/stealthprint.git) | A reusable library for fingerprinting stealth / anonymous models served behind |
| `strudel-dev-vite` | [toxicwind/strudel-dev-vite](https://github.com/toxicwind/strudel-dev-vite.git) | Vite workspace for Strudel live-coding experiments. |
| `strudel-sampler-server-vite` | [toxicwind/strudel-sampler-server-vite](https://github.com/toxicwind/strudel-sampler-server-vite.git) | Strudel Sampler - Production Microservice |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `super-board` | [toxicwind/super-board](https://github.com/toxicwind/super-board.git) | — |
| `tau-verify` | [toxicwind/tau](https://github.com/toxicwind/tau.git) | τ — the Sovereign Ranch coding agent: terminal coding agent with interactive CLI + SDK, multi-provider LLM bra |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | A monorepo of Tau extensions — ours plus forks of others. |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | A monorepo of Tau extensions — ours plus forks of others. |
| `tok` | [toxicwind/tok](https://github.com/toxicwind/tok.git) | **Standalone fast token counter.** Pure-JS BPE via `gpt-tokenizer` — zero native |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | output coverage reports using Node.js' built in coverage |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | output coverage reports using Node.js' built in coverage |
| `toxicwind-repos` | [toxicwind/toxicwind-repos](https://github.com/toxicwind/toxicwind-repos) | Test write 1786424413 |
| `trading-post` | [toxicwind/trading-post](https://github.com/toxicwind/trading-post.git) | TypeScript AI agent framework: cognitive memory, runtime tool forging, multi-agent orchestration, 11 LLM provi |
| `universal-keypool-bun` | [toxicwind/universal-keypool-bun](https://github.com/toxicwind/universal-keypool-bun.git) | OPERATION SPARKFALL audit batch 4 |
| `universal-keypool-gateway` | [toxicwind/universal-keypool-gateway](https://github.com/toxicwind/universal-keypool-gateway.git) | OPERATION SPARKFALL audit batch 4 |
| `VansRouter` | [toxicwind/VansRouter](https://github.com/toxicwind/VansRouter.git) | 🆓 Lightweight Version of 9Route x Omniroute Combined Logic - Unlimited FREE AI coding. Connect Claude Code, C |
| `vendor/tailnet-doctor` | [toxicwind/tailnet-doctor](https://github.com/toxicwind/tailnet-doctor.git) | — |
| `websites/arlockworks/app` | [toxicwind/arlockworks-next](https://github.com/toxicwind/arlockworks-next.git) | Next.js 16 + Tailwind v4 locksmith storefront (Pinal/Maricopa counties) — local SEO, 24-city grid. |
| `websites/arlockworks/app` | [toxicwind/arlockworks-next](https://github.com/toxicwind/arlockworks-next.git) | Next.js 16 + Tailwind v4 locksmith storefront (Pinal/Maricopa counties) — local SEO, 24-city grid. |
| `websites/arlockworks/main` | [toxicwind/arlockworks-core](https://github.com/toxicwind/arlockworks-core.git) | — |
| `websites/arlockworks/main` | [toxicwind/arlockworks-core](https://github.com/toxicwind/arlockworks-core.git) | — |
| `websites/effusionlabs/main` | [toxicwind/effusion-labs](https://github.com/toxicwind/effusion-labs.git) | Effusion Labs — Digital studio and knowledge base. Eleventy + Vite + Tailwind v4, bun-powered, modular config. |
| `websites/effusionlabs/main` | [toxicwind/effusion-labs](https://github.com/toxicwind/effusion-labs.git) | Effusion Labs — Digital studio and knowledge base. Eleventy + Vite + Tailwind v4, bun-powered, modular config. |
| `websites/effusionlabs/tickets` | [toxicwind/effusion-labs-tickets](https://github.com/toxicwind/effusion-labs-tickets.git) | Buyer-first ticketing platform for Gallery Effusion events (Bun API + React + Postgres). |
| `websites/effusionlabs/tickets` | [toxicwind/effusion-labs-tickets](https://github.com/toxicwind/effusion-labs-tickets.git) | Buyer-first ticketing platform for Gallery Effusion events (Bun API + React + Postgres). |
| `wezterm` | [toxicwind/wezterm](https://github.com/toxicwind/wezterm.git) | A GPU-accelerated cross-platform terminal emulator and multiplexer written by @wez and implemented in Rust |
| `workmux` | [toxicwind/workmux](https://github.com/toxicwind/workmux.git) | — |
| `zed-android-port` | [toxicwind/zed-android-port](https://github.com/toxicwind/zed-android-port.git) | Started as a joke. Rust on aarch64, sounded portable. Laughed about it. Kept going. Couldn't stop. There's an  |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 146 |
| package.json repository | 3 |
| go.mod module | 1 |
| git remote upstream | 1 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|
| TypeScript | 32,726 |
| Markdown | 7,755 |
| JavaScript | 6,881 |
| Rust | 5,196 |
| Go | 5,032 |
| JSON | 4,620 |
| SVG | 4,052 |
| Python | 3,331 |
| MAP | 2,937 |
| MDX | 2,018 |
| TSX | 1,950 |
| PNG | 1,644 |
| PYC | 1,301 |
| QML | 1,158 |
| Kotlin | 1,081 |
| YAML | 1,000 |
| TOML | 975 |
| Shell | 927 |
| Text | 909 |
| O | 898 |

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `models` | 139697.9 MB | 101 | — |
| `vendored` | 97076.2 MB | 2,463,036 | — |
| `hatch` | 18290.4 MB | 187,335 | github.com/toxicwind/hatch |
| `mesh` | 11526.1 MB | 132,171 | github.com/toxicwind/mesh |
| `tau` | 9895.6 MB | 126,228 | github.com/can1357/oh-my-pi |
| `qed` | 8179.6 MB | 56,807 | — |
| `kappa` | 7891.3 MB | 180,761 | — |
| `shell` | 4616.7 MB | 14,969 | — |
| `rust-algo-web` | 3626.3 MB | 11,657 | — |
| `nim-repos` | 2727.2 MB | 63,558 | — |

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
| Submodule | 146 |
| Fork (ours) | 137 |
| Upstream mirror | 20 |
| Fork (ours, no upstream) | 6 |
| Upstream mirror (no upstream) | 2 |
| Vendored (snapshot) | 28 |
| Experimental | 29 |
| Stub/Empty | 30 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-19T23:37:10.323Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
