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

## 📊 Monorepo Statistics (generated 10/20/2026, 6:54:18 AM)

| Metric | Value |
|---|---|
| Total directories | 194 |
| Directories with obvious upstream | 143 / 194 (73.7%) |
| Git-tracked directories | 48 |
| Components (peer repos) | 142 |
| Total size | 0.92 GB |
| Total tracked files | 48 |

## 🗂️ Components (213)

The full map — every animal's pen, with its repo and description (from README heads). From `.gitmodules` + `FORKS-report.json`; regenerate with the README.

| Path | Stack / Lang | Repo | Description |
|---|---|---|---|
| `agent-customization-style-guide` | 🐚 `Shell` | [toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide.git) | 1. Scope |
| `agent-dashboard` | 🦀 `Rust` | [toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard.git) | — |
| `AgentForensics` | 🐍 `Python` | [aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics.git) | — |
| `agon` | 🐍 `Python` | [toxicwind/agon](https://github.com/toxicwind/agon.git) | — |
| `ai-merge-resolve` | 🔷 `TypeScript` | [toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve.git) | — |
| `android-fleet` | 📖 `Docs/Data` | [toxicwind/android-fleet](https://github.com/toxicwind/android-fleet.git) | — |
| `antilogos` | 📖 `Docs/Data` | [toxicwind/antilogos](https://github.com/toxicwind/antilogos.git) | — |
| `arroyo` | 📖 `Docs/Data` | [toxicwind/arroyo](https://github.com/toxicwind/arroyo.git) | — |
| `ast-grep-rules` | 📁 `Workspace` | [toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules.git) | — |
| `auto1m` | 🐍 `Python` | [toxicwind/auto1m](https://github.com/toxicwind/auto1m.git) | — |
| `awesome-free-ai-coding` | 🐍 `Python` | [toxicwind/awesome-free-ai-coding](https://github.com/toxicwind/awesome-free-ai-coding.git) | — |
| `barn` | 🐚 `Shell` | [toxicwind/barn](https://github.com/toxicwind/barn.git) | — |
| `barn/corral` | 📁 `Workspace` | [./barn/corral](./barn/corral) | — |
| `barn/flatbread` | 🔷 `TypeScript` | [toxicwind/flatbread](https://github.com/toxicwind/flatbread.git) | — |
| `barn/nativelink` | 🦀 `Rust` | [toxicwind/nativelink](https://github.com/toxicwind/nativelink.git) | — |
| `barn/rosec` | 🦀 `Rust` | [toxicwind/rosec](https://github.com/toxicwind/rosec.git) | — |
| `barn/weave` | 🦀 `Rust` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `barn/weave-sub` | 🦀 `Rust` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `bash-style-guide` | 🐚 `Shell` | [toxicwind/bash-style-guide](https://github.com/toxicwind/bash-style-guide.git) | — |
| `bench-radar` | 🔷 `TypeScript` | [toxicwind/bench-radar](https://github.com/toxicwind/bench-radar.git) | — |
| `borrowed/herdr` | 🦀 `Rust` | [ogulcancelik/herdr](https://github.com/ogulcancelik/herdr.git) | — |
| `borrowed/loom` | 🦀 `Rust` | [rjwalters/loom](https://github.com/rjwalters/loom.git) | — |
| `bridge` | 📖 `Docs/Data` | [toxicwind/bridge](https://github.com/toxicwind/bridge.git) | — |
| `bugbounty` | 🔷 `TypeScript` | [toxicwind/bugbounty](https://github.com/toxicwind/bugbounty.git) | — |
| `campfire` | 🔷 `TypeScript` | [toxicwind/campfire](https://github.com/toxicwind/campfire.git) | — |
| `chronos-forge` | 🔷 `TypeScript` | [toxicwind/chronos-forge](https://github.com/toxicwind/chronos-forge.git) | — |
| `classifier` | 🔷 `TypeScript` | [toxicwind/classifier](https://github.com/toxicwind/classifier.git) | — |
| `classifier-preflight` | 🔷 `TypeScript` | [toxicwind/classifier-preflight](https://github.com/toxicwind/classifier-preflight.git) | — |
| `codebase-memory` | 🐚 `Shell` | [toxicwind/codebase-memory](https://github.com/toxicwind/codebase-memory.git) | — |
| `computer-use-linux` | 🦀 `Rust` | [toxicwind/computer-use-linux](https://github.com/toxicwind/computer-use-linux.git) | — |
| `corral` | ⚡ `Bun` | [toxicwind/corral](https://github.com/toxicwind/corral.git) | — |
| `cron-trust` | 📖 `Docs/Data` | [toxicwind/cron-trust](https://github.com/toxicwind/cron-trust.git) | — |
| `dashboard` | 📁 `Workspace` | [toxicwind/dashboard](https://github.com/toxicwind/dashboard.git) | — |
| `dedicated/dedicated-server-ops` | 🐍 `Python` | [toxicwind/dedi-ops](https://github.com/toxicwind/dedi-ops.git) | — |
| `didymos` | 📖 `Docs/Data` | [toxicwind/didymos](https://github.com/toxicwind/didymos.git) | — |
| `disparate-latent-experiment` | ⚡ `Bun` | [toxicwind/disparate-latent-experiment](https://github.com/toxicwind/disparate-latent-experiment.git) | — |
| `doorbell` | ⚡ `Bun` | [toxicwind/doorbell](https://github.com/toxicwind/doorbell.git) | HTTP MCP door on port 25202. v7. One initialize returns the router catalog. |
| `dots-client` | 🐍 `Python` | [toxicwind/dots-client](https://github.com/toxicwind/dots-client.git) | — |
| `drover` | 🔷 `TypeScript` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `dualspace-ast-bm25-hybrid` | 🔷 `TypeScript` | [toxicwind/dualspace-ast-bm25-hybrid](https://github.com/toxicwind/dualspace-ast-bm25-hybrid.git) | — |
| `duel/vendor/argus-ai-debate` | `—` | [Argus-Framework/argus-ai-debate](https://github.com/Argus-Framework/argus-ai-debate.git) | — |
| `duel/vendor/ChatEval` | `—` | [thunlp/ChatEval](https://github.com/thunlp/ChatEval.git) | — |
| `duel/vendor/debate-or-vote` | `—` | [deeplearning-wisc/debate-or-vote](https://github.com/deeplearning-wisc/debate-or-vote.git) | — |
| `duel/vendor/llm_debate` | `—` | [ucl-dark/llm_debate](https://github.com/ucl-dark/llm_debate.git) | — |
| `emergent` | 🔷 `TypeScript` | [toxicwind/emergent](https://github.com/toxicwind/emergent.git) | — |
| `estate-chat` | 🔷 `TypeScript` | [toxicwind/estate-chat](https://github.com/toxicwind/estate-chat.git) | — |
| `estate-dispersal` | ⚡ `Bun` | [toxicwind/estate-dispersal](https://github.com/toxicwind/estate-dispersal.git) | Bun monolith fusing seven overlooked substrates into one deploy-ready proof-of-concept: estate-scripts fs-map, |
| `estate-dispersal-monolith` | 📁 `Workspace` | [toxicwind/estate-dispersal-monolith](https://github.com/toxicwind/estate-dispersal-monolith.git) | — |
| `estate-end4` | 📖 `Docs/Data` | [toxicwind/estate-end4](https://github.com/toxicwind/estate-end4.git) | — |
| `estate-hatch-toolkit` | 🐍 `Python` | [toxicwind/estate-hatch-toolkit](https://github.com/toxicwind/estate-hatch-toolkit.git) | — |
| `estate-kappa-plugin` | 🔷 `TypeScript` | [toxicwind/estate-kappa-plugin](https://github.com/toxicwind/estate-kappa-plugin.git) | Official estate plugin collection for **kappa** (@kappacode/cli). |
| `estate-monitor` | 🔷 `TypeScript` | [toxicwind/estate-monitor](https://github.com/toxicwind/estate-monitor.git) | — |
| `estate-recon` | 📖 `Docs/Data` | [toxicwind/estate-recon](https://github.com/toxicwind/estate-recon.git) | — |
| `estate-scripts-dispersal` | `—` | [toxicwind/estate-scripts-dispersal](https://github.com/toxicwind/estate-scripts-dispersal.git) | — |
| `estate-scripts-end4` | `—` | [toxicwind/estate-scripts-end4](https://github.com/toxicwind/estate-scripts-end4.git) | — |
| `estate-scripts-scripts` | `—` | [toxicwind/estate-scripts-scripts](https://github.com/toxicwind/estate-scripts-scripts.git) | — |
| `estate-scripts-skills` | `—` | [toxicwind/estate-scripts-skills](https://github.com/toxicwind/estate-scripts-skills.git) | — |
| `estate-shell` | ⚡ `Bun` | [toxicwind/estate-shell](https://github.com/toxicwind/estate-shell.git) | — |
| `estate-skills` | 📖 `Docs/Data` | [toxicwind/estate-skills](https://github.com/toxicwind/estate-skills.git) | Kimi-style skill definitions and agent orchestration patterns. |
| `estate-skills-hub` | 🔷 `TypeScript` | [toxicwind/estate-skills-hub](https://github.com/toxicwind/estate-skills-hub.git) | — |
| `estate-whoa-breakthrough` | ⚡ `Bun` | [toxicwind/estate-whoa-breakthrough](https://github.com/toxicwind/estate-whoa-breakthrough.git) | — |
| `examples` | 🐚 `Shell` | [toxicwind/examples](https://github.com/toxicwind/examples.git) | — |
| `extensions` | 📁 `Workspace` | [toxicwind/extensions](https://github.com/toxicwind/extensions.git) | — |
| `extensions/drover` | 🔷 `TypeScript` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `fanout` | 📖 `Docs/Data` | [toxicwind/fanout](https://github.com/toxicwind/fanout.git) | — |
| `fast-race` | 🐍 `Python` | [toxicwind/fast-race](https://github.com/toxicwind/fast-race.git) | — |
| `ferret-den` | ⚡ `Bun` | [toxicwind/ferret-den](https://github.com/toxicwind/ferret-den.git) | An MCP server that exposes the Warren's reconnaissance kit under decoupled tool names to prevent false-positiv |
| `ffs-diff` | 🔷 `TypeScript` | [toxicwind/ffs-diff](https://github.com/toxicwind/ffs-diff.git) | — |
| `fleet` | 🔷 `TypeScript` | [toxicwind/fleet](https://github.com/toxicwind/fleet.git) | — |
| `fleet-chat` | 🔷 `TypeScript` | [toxicwind/fleet-chat](https://github.com/toxicwind/fleet-chat.git) | — |
| `fleet-ops` | 🐍 `Python` | [toxicwind/fleet-ops](https://github.com/toxicwind/fleet-ops.git) | — |
| `fleetd` | 🐍 `Python` | [toxicwind/fleetd](https://github.com/toxicwind/fleetd.git) | First-class fleet coordination daemon for awrawr-pc. The literal way for |
| `flicker` | 📁 `Workspace` | [toxicwind/flicker](https://github.com/toxicwind/flicker.git) | — |
| `forge` | 🐚 `Shell` | [toxicwind/forge](https://github.com/toxicwind/forge.git) | — |
| `forge/router/weasel` | 🔷 `TypeScript` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | — |
| `forge/web` | 🔷 `TypeScript` | [toxicwind/CMSaasStarter](https://github.com/toxicwind/CMSaasStarter.git) | — |
| `freebuffet` | 🔷 `TypeScript` | [toxicwind/freebuffet](https://github.com/toxicwind/freebuffet.git) | — |
| `furlong/vendor/coder_reviewer_reranking` | `—` | [facebookresearch/coder_reviewer_reranking](https://github.com/facebookresearch/coder_reviewer_reranking.git) | — |
| `furlong/vendor/RACE` | `—` | [jszheng21/RACE](https://github.com/jszheng21/RACE.git) | — |
| `furlong/vendor/speed-run` | `—` | [2389-research/speed-run](https://github.com/2389-research/speed-run.git) | — |
| `furlong/vendor/SRank-CodeRanker` | `—` | [FSoft-AI4Code/SRank-CodeRanker](https://github.com/FSoft-AI4Code/SRank-CodeRanker.git) | — |
| `gavel` | 🐍 `Python` | [toxicwind/gavel](https://github.com/toxicwind/gavel.git) | bidders over a single [squawk message channel] |
| `gavel/vendor/agora` | 🐍 `Python` | [KAIJUJO/Agora](https://github.com/KAIJUJO/Agora.git) | — |
| `gavel/vendor/auction-agent11` | 🐍 `Python` | [wushuchris/11-distributed-auction-task-allocation-agent](https://github.com/wushuchris/11-distributed-auction-task-allocation-agent.git) | — |
| `gavel/vendor/contract-net-router` | 🐍 `Python` | [M00C1FER/contract-net-router](https://github.com/M00C1FER/contract-net-router.git) | — |
| `gayxxx-estate` | 📖 `Docs/Data` | [toxicwind/gayxxx-estate](https://github.com/toxicwind/gayxxx-estate.git) | — |
| `ghq` | 🐹 `Go` | [toxicwind/ghq](https://github.com/toxicwind/ghq.git) | — |
| `github-search` | ⚡ `Bun` | [toxicwind/github-search](https://github.com/toxicwind/github-search.git) | — |
| `gito` | 🐍 `Python` | [toxicwind/gito](https://github.com/toxicwind/gito.git) | — |
| `godzilla-llama.cpp` | 🐍 `Python` | [toxicwind/godzilla-llama.cpp](https://github.com/toxicwind/godzilla-llama.cpp.git) | — |
| `hatch` | 📖 `Docs/Data` | [toxicwind/hatch](https://github.com/toxicwind/hatch.git) | — |
| `hatch-decode` | 📖 `Docs/Data` | [toxicwind/hatch-decode](https://github.com/toxicwind/hatch-decode.git) | — |
| `hatch/kite-cli` | 🐍 `Python` | [toxicwind/kite-cli](https://github.com/toxicwind/kite-cli.git) | — |
| `herd` | 📁 `Workspace` | [toxicwind/herd](https://github.com/toxicwind/herd.git) | — |
| `herdproof-bun` | 📁 `Workspace` | [toxicwind/herdproof-bun](https://github.com/toxicwind/herdproof-bun.git) | — |
| `hf-model-sync` | 🔷 `TypeScript` | [toxicwind/hf-model-sync](https://github.com/toxicwind/hf-model-sync.git) | — |
| `hodos` | 📁 `Workspace` | [toxicwind/hodos](https://github.com/toxicwind/hodos.git) | — |
| `host-proof` | 🐚 `Shell` | [toxicwind/host-proof](https://github.com/toxicwind/host-proof.git) | — |
| `identity-router` | 🐍 `Python` | [toxicwind/identity-router](https://github.com/toxicwind/identity-router.git) | > The universal knowledge router for durable agent memory — lessons, preferences, rules, corrections, and exte |
| `kairos` | 🔷 `TypeScript` | [toxicwind/kairos](https://github.com/toxicwind/kairos.git) | _The opportune moment_ — the 2-second rule, first-class: every command an agent |
| `keep` | 🦀 `Rust` | [toxicwind/keep](https://github.com/toxicwind/keep.git) | — |
| `keryx` | 📖 `Docs/Data` | [toxicwind/keryx](https://github.com/toxicwind/keryx.git) | — |
| `kilo` | `—` | [toxicwind/kilo](https://github.com/toxicwind/kilo.git) | — |
| `kimi-auto` | 📁 `Workspace` | [toxicwind/kimi-auto](https://github.com/toxicwind/kimi-auto.git) | — |
| `kimi-claw` | 🔷 `TypeScript` | [toxicwind/kimi-claw](https://github.com/toxicwind/kimi-claw.git) | — |
| `kodi-fleet` | 📖 `Docs/Data` | [toxicwind/kodi-fleet](https://github.com/toxicwind/kodi-fleet.git) | — |
| `kryptos` | 🐍 `Python` | [toxicwind/kryptos](https://github.com/toxicwind/kryptos.git) | — |
| `lasso` | 🐍 `Python` | [toxicwind/lasso](https://github.com/toxicwind/lasso.git) | — |
| `leakfix-src` | 📁 `Workspace` | [toxicwind/leakfix-src](https://github.com/toxicwind/leakfix-src.git) | — |
| `ledger` | 🔷 `TypeScript` | [toxicwind/ledger](https://github.com/toxicwind/ledger.git) | — |
| `lib` | 🔷 `TypeScript` | [toxicwind/lib](https://github.com/toxicwind/lib.git) | — |
| `loom` | 🦀 `Rust` | [toxicwind/loom](https://github.com/toxicwind/loom.git) | Developers working with tightly-coupled repositories face a growing friction problem. When a change in one rep |
| `matter-server` | 🔷 `TypeScript` | [toxicwind/matter-server](https://github.com/toxicwind/matter-server.git) | — |
| `maw` | 🦀 `Rust` | [toxicwind/maw](https://github.com/toxicwind/maw.git) | — |
| `mcp` | 📁 `Workspace` | [toxicwind/mcp](https://github.com/toxicwind/mcp.git) | — |
| `mcp/mcp-prompt-injection-detector` | 📖 `Docs/Data` | [thilinawishvekeerthi/mcp-prompt-injection-detector](https://github.com/thilinawishvekeerthi/mcp-prompt-injection-detector.git) | — |
| `mcp/mcpproxy-go` | 🐹 `Go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | — |
| `mcp/pd-mcp-standalone` | ⚡ `Bun` | [toxicwind/pd-mcp](https://github.com/toxicwind/pd-mcp.git) | — |
| `mcp/rsync-mcp` | 🔷 `TypeScript` | [toxicwind/rsync-mcp](https://github.com/toxicwind/rsync-mcp.git) | — |
| `mcpproxy-go` | 🐹 `Go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | > **The estate MCP tool federation, security firewall, and agent gateway. Connects 231+ tools across 18 server |
| `mesh` | 📖 `Docs/Data` | [toxicwind/mesh](https://github.com/toxicwind/mesh.git) | — |
| `mesh/pylae` | 🔷 `TypeScript` | [toxicwind/flocksync](https://github.com/toxicwind/flocksync.git) | — |
| `meta-research-toolkit` | ⚡ `Bun` | [toxicwind/meta-research-toolkit](https://github.com/toxicwind/meta-research-toolkit.git) | — |
| `metaaivm` | 🔷 `TypeScript` | [toxicwind/metaaivm](https://github.com/toxicwind/metaaivm.git) | — |
| `metaaivm-profile` | 🔷 `TypeScript` | [toxicwind/metaaivm-profile](https://github.com/toxicwind/metaaivm-profile.git) | — |
| `metaclaw-runtime` | 🔷 `TypeScript` | [toxicwind/metaclaw-runtime](https://github.com/toxicwind/metaclaw-runtime.git) | — |
| `mission-control` | 📖 `Docs/Data` | [toxicwind/mission-control](https://github.com/toxicwind/mission-control.git) | — |
| `ml-serve` | 🐍 `Python` | [toxicwind/ml-serve](https://github.com/toxicwind/ml-serve.git) | — |
| `muse-cli` | 🐍 `Python` | [toxicwind/muse-cli](https://github.com/toxicwind/muse-cli.git) | Talk to your personal muse.ai AI agent from the terminal. |
| `naming-audit` | 🐍 `Python` | [toxicwind/naming-audit](https://github.com/toxicwind/naming-audit.git) | — |
| `nim-inkling-api-research` | 🐹 `Go` | [toxicwind/nim-inkling-api-research](https://github.com/toxicwind/nim-inkling-api-research.git) | — |
| `nim-omnibus` | 🐚 `Shell` | [toxicwind/nim-omnibus](https://github.com/toxicwind/nim-omnibus.git) | — |
| `nim-repos/api-evangelist-nvidia-nim` | 📖 `Docs/Data` | [api-evangelist/nvidia-nim](https://github.com/api-evangelist/nvidia-nim) | — |
| `nim-repos/bauka0-nvidia-nim-provider` | 🔷 `TypeScript` | [bauka0/nvidia-nim-provider](https://github.com/bauka0/nvidia-nim-provider) | — |
| `nim-repos/david-eve-za-nvidia-nim-mcp` | 🔷 `TypeScript` | [david-eve-za/nvidia-nim-mcp](https://github.com/david-eve-za/nvidia-nim-mcp) | — |
| `nim-repos/diegovisk-pi-nvidia-nim` | 🔷 `TypeScript` | [diegovisk/pi-nvidia-nim](https://github.com/diegovisk/pi-nvidia-nim) | — |
| `nim-repos/furqanafridi-free-claude-code` | 🐍 `Python` | [furqanafridi/free-claude-code](https://github.com/furqanafridi/free-claude-code) | — |
| `nim-repos/gabriel-ferraresi-NIMGEN` | 🔷 `TypeScript` | [gabriel-ferraresi/NIMGEN](https://github.com/gabriel-ferraresi/NIMGEN) | — |
| `nim-repos/Gitlawb-openclaude` | ⚡ `Bun` | [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) | — |
| `nim-repos/h0rcrux-hermes-backup` | 🐍 `Python` | [h0rcrux/hermes-backup](https://github.com/h0rcrux/hermes-backup) | — |
| `nim-repos/iammalego-keymux` | 🔷 `TypeScript` | [iammalego/keymux](https://github.com/iammalego/keymux) | — |
| `nim-repos/joeldg-nvidiarouter` | 🐍 `Python` | [joeldg/nvidiarouter](https://github.com/joeldg/nvidiarouter) | — |
| `nim-repos/lizhebio-nim-qwen-model-router` | 🐍 `Python` | [lizhebio/nim-qwen-model-router](https://github.com/lizhebio/nim-qwen-model-router) | — |
| `nim-repos/lucky-mandator-gocode-router` | 🐹 `Go` | [lucky-mandator/gocode-router](https://github.com/lucky-mandator/gocode-router) | — |
| `nim-repos/mschwarzmueller-pi_agent_rust` | 🦀 `Rust` | [mschwarzmueller/pi_agent_rust](https://github.com/mschwarzmueller/pi_agent_rust) | — |
| `nim-repos/musistudio-claude-code-router` | 🔷 `TypeScript` | [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) | — |
| `nim-repos/nezerkc-opencode-provider-nvidia-nim` | 🔷 `TypeScript` | [nezerkc/opencode-provider-nvidia-nim](https://github.com/nezerkc/opencode-provider-nvidia-nim) | — |
| `nim-repos/nirholas-three.ws` | 🔷 `TypeScript` | [nirholas/three.ws](https://github.com/nirholas/three.ws) | — |
| `nim-repos/NVIDIA-NemoClaw` | 🔷 `TypeScript` | [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw) | — |
| `nim-repos/olszalsik-a0-nvidia-nim` | 🐍 `Python` | [olszalsik/a0-nvidia-nim](https://github.com/olszalsik/a0-nvidia-nim) | — |
| `nim-repos/rickeshtn-nim-code` | 🐚 `Shell` | [rickeshtn/nim-code](https://github.com/rickeshtn/nim-code) | — |
| `nim-repos/Sateeshreddymaddi-Custom-Nvidia-Nim-Node` | 🔷 `TypeScript` | [Sateeshreddymaddi/Custom-Nvidia-Nim-Node](https://github.com/Sateeshreddymaddi/Custom-Nvidia-Nim-Node) | — |
| `nim-repos/shaivpidadi-freeridev3` | 🐍 `Python` | [shaivpidadi/freeridev3](https://github.com/shaivpidadi/freeridev3) | — |
| `nim-repos/stillhue-claudio` | 📖 `Docs/Data` | [stillhue/claudio](https://github.com/stillhue/claudio) | — |
| `nim-repos/thispointon-kondi` | 📖 `Docs/Data` | [thispointon/kondi](https://github.com/thispointon/kondi) | — |
| `nim-repos/tibbee-pi-nvidia-nim-provider` | 🔷 `TypeScript` | [tibbee/pi-nvidia-nim-provider](https://github.com/tibbee/pi-nvidia-nim-provider) | — |
| `nim-repos/xRyul-pi-nvidia-nim` | 🔷 `TypeScript` | [xRyul/pi-nvidia-nim](https://github.com/xRyul/pi-nvidia-nim) | — |
| `null-g-proxy` | ⚡ `Bun` | [toxicwind/null-g-proxy](https://github.com/toxicwind/null-g-proxy.git) | — |
| `nuvio` | 📖 `Docs/Data` | [toxicwind/nuvio](https://github.com/toxicwind/nuvio.git) | — |
| `nvidia-alive` | 🐚 `Shell` | [toxicwind/nvidia-alive](https://github.com/toxicwind/nvidia-alive.git) | > Live endpoint auditing for NVIDIA NIM — and every provider in the |
| `nvidia-kernel-guard` | 🐚 `Shell` | [toxicwind/nvidia-kernel-guard](https://github.com/toxicwind/nvidia-kernel-guard.git) | — |
| `nvidia-nim-model-probe` | 🐍 `Python` | [toxicwind/nvidia-nim-model-probe](https://github.com/toxicwind/nvidia-nim-model-probe.git) | — |
| `oh-my-pi` | ⚡ `Bun` | [toxicwind/oh-my-pi](https://github.com/toxicwind/oh-my-pi.git) | — |
| `OmniRoute` | 🔷 `TypeScript` | [toxicwind/OmniRoute](https://github.com/toxicwind/OmniRoute.git) | — |
| `openfang` | 📖 `Docs/Data` | [toxicwind/openfang](https://github.com/toxicwind/openfang.git) | — |
| `openfang-join` | 📖 `Docs/Data` | [toxicwind/openfang-join](https://github.com/toxicwind/openfang-join.git) | — |
| `openrouter-probe` | 🐍 `Python` | [toxicwind/openrouter-probe](https://github.com/toxicwind/openrouter-probe.git) | — |
| `ops` | 📖 `Docs/Data` | [toxicwind/ops](https://github.com/toxicwind/ops.git) | — |
| `opsis` | 📖 `Docs/Data` | [toxicwind/opsis](https://github.com/toxicwind/opsis.git) | — |
| `outlier-toolkit` | 🐍 `Python` | [toxicwind/outlier-toolkit](https://github.com/toxicwind/outlier-toolkit.git) | Outlier (Scale AI's contributor platform) publishes no publi |
| `outsource` | 🐹 `Go` | [toxicwind/outsource](https://github.com/toxicwind/outsource.git) | — |
| `pack-fix` | 📖 `Docs/Data` | [toxicwind/pack-fix](https://github.com/toxicwind/pack-fix.git) | — |
| `paper-poller` | 📖 `Docs/Data` | [toxicwind/paper-poller](https://github.com/toxicwind/paper-poller.git) | — |
| `pdfshield` | 🐍 `Python` | [purvalsingh/pdfshield](https://github.com/purvalsingh/pdfshield.git) | A machine-learning classifier that reads a PDF's *internal structure* and *what its JavaScript actually does* |
| `pearlctl` | 🔷 `TypeScript` | [toxicwind/pearlctl](https://github.com/toxicwind/pearlctl.git) | — |
| `phone-lane` | 📖 `Docs/Data` | [toxicwind/phone-lane](https://github.com/toxicwind/phone-lane.git) | — |
| `phone-ocr-sweep` | 🐚 `Shell` | [toxicwind/phone-ocr-sweep](https://github.com/toxicwind/phone-ocr-sweep.git) | — |
| `pinax` | 🔷 `TypeScript` | [toxicwind/pinax](https://github.com/toxicwind/pinax.git) | — |
| `pj-fast` | 🔷 `TypeScript` | [toxicwind/pj-fast](https://github.com/toxicwind/pj-fast.git) | — |
| `plugin-ecosystem` | 📁 `Workspace` | [toxicwind/plugin-ecosystem](https://github.com/toxicwind/plugin-ecosystem.git) | — |
| `plugin-ecosystem/agentpluginzoo` | 🐍 `Python` | [tezansahu/agentpluginzoo](https://github.com/tezansahu/agentpluginzoo.git) | — |
| `ralph-dashboard` | 📖 `Docs/Data` | [toxicwind/ralph-dashboard](https://github.com/toxicwind/ralph-dashboard.git) | > **toxicwind fork** of Endogen/ralph-dashboard. |
| `refusal-hunt` | 🐍 `Python` | [toxicwind/refusal-hunt](https://github.com/toxicwind/refusal-hunt.git) | Agent serving layers sometimes **refuse benign work** — and the refusal hides |
| `repo-first-class` | 🐍 `Python` | [toxicwind/repo-first-class](https://github.com/toxicwind/repo-first-class.git) | > **Make any GitHub repo first-class: a canonical, current checkout — maximally polished, committed, pushed, r |
| `rig` | 🦀 `Rust` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | — |
| `roundup-site` | 🔷 `TypeScript` | [owieth/turborepo-example](https://github.com/owieth/turborepo-example) | A modern monorepo template built with Next.js 16, React 19, Tailwind CSS v4, TypeScript 5.9, Turborepo, and pn |
| `rust-wrappers` | 📁 `Workspace` | [toxicwind/rust-wrappers](https://github.com/toxicwind/rust-wrappers.git) | — |
| `safety-review-gate` | 📖 `Docs/Data` | [toxicwind/safety-review-gate](https://github.com/toxicwind/safety-review-gate.git) | > **The evidence locker for the safety-review gate investigation — run-ID backfill artifacts, checksummed and  |
| `secretsmith` | 🐍 `Python` | [toxicwind/secretsmith](https://github.com/toxicwind/secretsmith.git) | Fork lineage: [GNOME/libsecret](https://github |
| `session-bus-refresh` | 🐍 `Python` | [toxicwind/session-bus-refresh](https://github.com/toxicwind/session-bus-refresh.git) | Refresh is the **same one-shot join-packet read at a newer cursor**. A worker |
| `skillforge` | 📖 `Docs/Data` | [toxicwind/skillforge](https://github.com/toxicwind/skillforge.git) | > This repository is a fresh scaffold — the packaging tooling it describes does not exist in the tree yet. |
| `stealthprint` | 🐍 `Python` | [toxicwind/stealthprint](https://github.com/toxicwind/stealthprint.git) | — |
| `strudel-dev-vite` | 🔷 `TypeScript` | [toxicwind/strudel-dev-vite](https://github.com/toxicwind/strudel-dev-vite.git) | — |
| `strudel-sampler-server-vite` | 🔷 `TypeScript` | [toxicwind/strudel-sampler-server-vite](https://github.com/toxicwind/strudel-sampler-server-vite.git) | — |
| `submodules/phone-sentinel` | 🔷 `TypeScript` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `super-board` | 🐚 `Shell` | [toxicwind/super-board](https://github.com/toxicwind/super-board.git) | — |
| `tau-verify` | ⚡ `Bun` | [toxicwind/tau](https://github.com/toxicwind/tau.git) | — |
| `tau/tau-extensions` | ⚡ `Bun` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | — |
| `tok` | ⚡ `Bun` | [toxicwind/tok](https://github.com/toxicwind/tok.git) | deps, zero network at runtime, works anywhere Bun or Node runs. A dr |
| `tools/c8` | 🔷 `TypeScript` | [bcoe/c8](https://github.com/bcoe/c8.git) | — |
| `toxicwind-repos` | 🐍 `Python` | [toxicwind/toxicwind-repos](https://github.com/toxicwind/toxicwind-repos) | — |
| `trading-post` | 🔷 `TypeScript` | [toxicwind/trading-post](https://github.com/toxicwind/trading-post.git) | tasks go up on the board; agents bid, win, execute, and get settled — on the |
| `universal-keypool-bun` | 🔷 `TypeScript` | [toxicwind/universal-keypool-bun](https://github.com/toxicwind/universal-keypool-bun.git) | — |
| `universal-keypool-gateway` | 🔷 `TypeScript` | [toxicwind/universal-keypool-gateway](https://github.com/toxicwind/universal-keypool-gateway.git) | — |
| `VansRouter` | 🔷 `TypeScript` | [toxicwind/VansRouter](https://github.com/toxicwind/VansRouter.git) | — |
| `vendor/tailnet-doctor` | `—` | [toxicwind/tailnet-doctor](https://github.com/toxicwind/tailnet-doctor.git) | — |
| `websites/arlockworks/app` | ⚡ `Bun` | [toxicwind/arlockworks-next](https://github.com/toxicwind/arlockworks-next.git) | — |
| `websites/arlockworks/main` | 📖 `Docs/Data` | [toxicwind/arlockworks-core](https://github.com/toxicwind/arlockworks-core.git) | — |
| `websites/effusionlabs/main` | ⚡ `Bun` | [toxicwind/effusion-labs](https://github.com/toxicwind/effusion-labs.git) | — |
| `websites/effusionlabs/tickets` | ⚡ `Bun` | [toxicwind/effusion-labs-tickets](https://github.com/toxicwind/effusion-labs-tickets.git) | — |
| `wezterm` | `—` | [toxicwind/wezterm](https://github.com/toxicwind/wezterm.git) | — |
| `workmux` | 🦀 `Rust` | [toxicwind/workmux](https://github.com/toxicwind/workmux.git) | — |
| `zed-android-port` | 🦀 `Rust` | [toxicwind/zed-android-port](https://github.com/toxicwind/zed-android-port.git) | — |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 142 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|
| TypeScript | 7,326 |
| Markdown | 2,280 |
| Python | 1,990 |
| Go | 1,785 |
| JavaScript | 1,442 |
| PYC | 1,268 |
| Rust | 1,101 |
| JSON | 833 |
| Shell | 326 |
| TOML | 297 |
| PNG | 242 |
| TSX | 236 |
| KDL | 222 |
| Text | 219 |
| WEBP | 159 |
| YAML | 156 |
| Swift | 156 |
| JSONL | 100 |
| MJS | 67 |
| VUE | 61 |

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `forge` | 369.5 MB | 2,479 | github.com/toxicwind/forge |
| `range` | 177.0 MB | 333 | — |
| `qed` | 122.4 MB | 4,522 | — |
| `propylon` | 113.7 MB | 7 | — |
| `barn` | 55.8 MB | 2,321 | github.com/toxicwind/barn |
| `herd` | 22.7 MB | 1 | github.com/toxicwind/herd |
| `rustdesk-server` | 18.8 MB | 8 | — |
| `github-search` | 10.5 MB | 605 | github.com/toxicwind/github-search |
| `vendor` | 8.2 MB | 484 | — |
| `roundup` | 8.2 MB | 589 | — |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/toxicwind/rig](https://github.com/toxicwind/rig) | 2 |
| [github.com/aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics) | 1 |
| [github.com/toxicwind/OmniRoute](https://github.com/toxicwind/OmniRoute) | 1 |
| [github.com/toxicwind/VansRouter](https://github.com/toxicwind/VansRouter) | 1 |
| [github.com/toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide) | 1 |
| [github.com/toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard) | 1 |
| [github.com/toxicwind/agon](https://github.com/toxicwind/agon) | 1 |
| [github.com/toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve) | 1 |
| [github.com/toxicwind/android-fleet](https://github.com/toxicwind/android-fleet) | 1 |
| [github.com/toxicwind/antilogos](https://github.com/toxicwind/antilogos) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|
| `rig` | `rig-ciwatch` | 100.0% |
| `agon` | `antilogos` | 66.7% |
| `agon` | `gavel` | 54.5% |
| `antilogos` | `gavel` | 54.5% |
| `kairos` | `tok` | 40.4% |
| `agon` | `repo-first-class` | 38.8% |
| `agon` | `kairos` | 38.0% |
| `antilogos` | `kairos` | 38.0% |
| `OmniRoute` | `VansRouter` | 37.7% |
| `agon` | `rig` | 37.0% |

## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 142 |
| Fork (ours) | 45 |
| Upstream mirror | 3 |
| Vendored (snapshot) | 50 |
| Experimental | 69 |
| Stub/Empty | 27 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-20T12:54:18.481Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
