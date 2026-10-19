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

## 📊 Monorepo Statistics (generated 10/19/2026, 5:06:27 AM)

| Metric | Value |
|---|---|
| Total directories | 190 |
| Directories with obvious upstream | 140 / 190 (73.7%) |
| Git-tracked directories | 0 |
| Submodules | 139 |
| Total size | 0.92 GB |
| Total tracked files | 0 |

## 🗂️ Registered Submodules (221)

The full map — every animal's pen, with its repo and description (from README heads). From `.gitmodules` + `FORKS-report.json`; regenerate with the README.

| Path | Repo | Description |
|---|---|---|
| `agent-customization-style-guide` | [toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide.git) | — |
| `agent-dashboard` | [toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard.git) | — |
| `AgentForensics` | [aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics.git) | — |
| `agon` | [toxicwind/agon](https://github.com/toxicwind/agon.git) | — |
| `ai-merge-resolve` | [toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve.git) | — |
| `android-fleet` | [toxicwind/android-fleet](https://github.com/toxicwind/android-fleet.git) | — |
| `antilogos` | [toxicwind/antilogos](https://github.com/toxicwind/antilogos.git) | — |
| `arroyo` | [toxicwind/arroyo](https://github.com/toxicwind/arroyo.git) | — |
| `ast-grep-rules` | [toxicwind/ast-grep-rules](https://github.com/toxicwind/ast-grep-rules.git) | — |
| `auto1m` | [toxicwind/auto1m](https://github.com/toxicwind/auto1m.git) | — |
| `awesome-free-ai-coding` | [toxicwind/awesome-free-ai-coding](https://github.com/toxicwind/awesome-free-ai-coding.git) | — |
| `barn` | [toxicwind/barn](https://github.com/toxicwind/barn.git) | — |
| `barn/corral` | [./barn/corral](./barn/corral) | — |
| `barn/flatbread` | [toxicwind/flatbread](https://github.com/toxicwind/flatbread.git) | — |
| `barn/nativelink` | [toxicwind/nativelink](https://github.com/toxicwind/nativelink.git) | — |
| `barn/rosec` | [toxicwind/rosec](https://github.com/toxicwind/rosec.git) | — |
| `barn/weave` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `barn/weave-sub` | [toxicwind/weave](https://github.com/toxicwind/weave.git) | — |
| `bench-radar` | [toxicwind/bench-radar](https://github.com/toxicwind/bench-radar.git) | — |
| `borrowed/herdr` | [ogulcancelik/herdr](https://github.com/ogulcancelik/herdr.git) | — |
| `borrowed/loom` | [rjwalters/loom](https://github.com/rjwalters/loom.git) | — |
| `bridge` | [toxicwind/bridge](https://github.com/toxicwind/bridge.git) | — |
| `bugbounty` | [toxicwind/bugbounty](https://github.com/toxicwind/bugbounty.git) | — |
| `campfire` | [toxicwind/campfire](https://github.com/toxicwind/campfire.git) | — |
| `chronos-forge` | [toxicwind/chronos-forge](https://github.com/toxicwind/chronos-forge.git) | — |
| `classifier` | [toxicwind/classifier](https://github.com/toxicwind/classifier.git) | — |
| `classifier-preflight` | [toxicwind/classifier-preflight](https://github.com/toxicwind/classifier-preflight.git) | — |
| `codebase-memory` | [toxicwind/codebase-memory](https://github.com/toxicwind/codebase-memory.git) | — |
| `computer-use-linux` | [toxicwind/computer-use-linux](https://github.com/toxicwind/computer-use-linux.git) | — |
| `corral` | [toxicwind/corral](https://github.com/toxicwind/corral.git) | — |
| `cron-trust` | [toxicwind/cron-trust](https://github.com/toxicwind/cron-trust.git) | — |
| `dashboard` | [toxicwind/dashboard](https://github.com/toxicwind/dashboard.git) | — |
| `dedicated/dedicated-server-ops` | [toxicwind/dedi-ops](https://github.com/toxicwind/dedi-ops.git) | — |
| `didymos` | [toxicwind/didymos](https://github.com/toxicwind/didymos.git) | — |
| `disparate-latent-experiment` | [toxicwind/disparate-latent-experiment](https://github.com/toxicwind/disparate-latent-experiment.git) | — |
| `doorbell` | [toxicwind/doorbell](https://github.com/toxicwind/doorbell.git) | — |
| `dots-client` | [toxicwind/dots-client](https://github.com/toxicwind/dots-client.git) | — |
| `drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `dualspace-ast-bm25-hybrid` | [toxicwind/dualspace-ast-bm25-hybrid](https://github.com/toxicwind/dualspace-ast-bm25-hybrid.git) | — |
| `duel/vendor/argus-ai-debate` | [Argus-Framework/argus-ai-debate](https://github.com/Argus-Framework/argus-ai-debate.git) | — |
| `duel/vendor/ChatEval` | [thunlp/ChatEval](https://github.com/thunlp/ChatEval.git) | — |
| `duel/vendor/debate-or-vote` | [deeplearning-wisc/debate-or-vote](https://github.com/deeplearning-wisc/debate-or-vote.git) | — |
| `duel/vendor/llm_debate` | [ucl-dark/llm_debate](https://github.com/ucl-dark/llm_debate.git) | — |
| `duet` | [toxicwind/duet](https://github.com/toxicwind/duet.git) | — |
| `emergent` | [toxicwind/emergent](https://github.com/toxicwind/emergent.git) | — |
| `estate-chat` | [toxicwind/estate-chat](https://github.com/toxicwind/estate-chat.git) | — |
| `estate-dispersal` | [toxicwind/sovereign-dispersal](https://github.com/toxicwind/sovereign-dispersal.git) | — |
| `estate-dispersal-monolith` | [toxicwind/estate-dispersal-monolith](https://github.com/toxicwind/estate-dispersal-monolith.git) | — |
| `estate-end4` | [toxicwind/sovereign-end4](https://github.com/toxicwind/sovereign-end4.git) | — |
| `estate-hatch-toolkit` | [toxicwind/estate-hatch-toolkit](https://github.com/toxicwind/estate-hatch-toolkit.git) | — |
| `estate-monitor` | [toxicwind/estate-monitor](https://github.com/toxicwind/estate-monitor.git) | — |
| `estate-recon` | [toxicwind/estate-recon](https://github.com/toxicwind/estate-recon.git) | — |
| `estate-scripts` | [toxicwind/estate-scripts](https://github.com/toxicwind/estate-scripts.git) | — |
| `estate-scripts-dispersal` | [toxicwind/estate-scripts-dispersal](https://github.com/toxicwind/estate-scripts-dispersal.git) | — |
| `estate-scripts-end4` | [toxicwind/estate-scripts-end4](https://github.com/toxicwind/estate-scripts-end4.git) | — |
| `estate-scripts-scripts` | [toxicwind/estate-scripts-scripts](https://github.com/toxicwind/estate-scripts-scripts.git) | — |
| `estate-scripts-skills` | [toxicwind/estate-scripts-skills](https://github.com/toxicwind/estate-scripts-skills.git) | — |
| `estate-shell` | [toxicwind/estate-shell](https://github.com/toxicwind/estate-shell.git) | — |
| `estate-skills` | [toxicwind/sovereign-skills](https://github.com/toxicwind/sovereign-skills.git) | — |
| `estate-skills-hub` | [toxicwind/estate-skills-hub](https://github.com/toxicwind/estate-skills-hub.git) | — |
| `estate-whoa-breakthrough` | [toxicwind/estate-whoa-breakthrough](https://github.com/toxicwind/estate-whoa-breakthrough.git) | — |
| `examples` | [toxicwind/examples](https://github.com/toxicwind/examples.git) | — |
| `extensions` | [toxicwind/extensions](https://github.com/toxicwind/extensions.git) | — |
| `extensions/drover` | [toxicwind/drover](https://github.com/toxicwind/drover.git) | — |
| `fanout` | [toxicwind/fanout](https://github.com/toxicwind/fanout.git) | — |
| `fast-race` | [toxicwind/fast-race](https://github.com/toxicwind/fast-race.git) | — |
| `ferret-den` | [toxicwind/ferret-den](https://github.com/toxicwind/ferret-den.git) | — |
| `fleet` | [toxicwind/fleet](https://github.com/toxicwind/fleet.git) | — |
| `fleet-chat` | [toxicwind/fleet-chat](https://github.com/toxicwind/fleet-chat.git) | — |
| `fleet-ops` | [toxicwind/fleet-ops](https://github.com/toxicwind/fleet-ops.git) | — |
| `fleetd` | [toxicwind/fleetd](https://github.com/toxicwind/fleetd.git) | — |
| `flicker` | [toxicwind/flicker](https://github.com/toxicwind/flicker.git) | — |
| `forge` | [toxicwind/forge](https://github.com/toxicwind/forge.git) | — |
| `forge/router/weasel` | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) | — |
| `forge/web` | [toxicwind/CMSaasStarter](https://github.com/toxicwind/CMSaasStarter.git) | — |
| `freebuffet` | [toxicwind/freebuffet](https://github.com/toxicwind/freebuffet.git) | — |
| `furlong/vendor/coder_reviewer_reranking` | [facebookresearch/coder_reviewer_reranking](https://github.com/facebookresearch/coder_reviewer_reranking.git) | — |
| `furlong/vendor/RACE` | [jszheng21/RACE](https://github.com/jszheng21/RACE.git) | — |
| `furlong/vendor/speed-run` | [2389-research/speed-run](https://github.com/2389-research/speed-run.git) | — |
| `furlong/vendor/SRank-CodeRanker` | [FSoft-AI4Code/SRank-CodeRanker](https://github.com/FSoft-AI4Code/SRank-CodeRanker.git) | — |
| `gavel` | [toxicwind/gavel](https://github.com/toxicwind/gavel.git) | — |
| `gavel/vendor/agora` | [KAIJUJO/Agora](https://github.com/KAIJUJO/Agora.git) | — |
| `gavel/vendor/auction-agent11` | [wushuchris/11-distributed-auction-task-allocation-agent](https://github.com/wushuchris/11-distributed-auction-task-allocation-agent.git) | — |
| `gavel/vendor/contract-net-router` | [M00C1FER/contract-net-router](https://github.com/M00C1FER/contract-net-router.git) | — |
| `gayxxx-estate` | [toxicwind/gayxxx-estate](https://github.com/toxicwind/gayxxx-estate.git) | — |
| `ghq` | [toxicwind/ghq](https://github.com/toxicwind/ghq.git) | — |
| `github-search` | [toxicwind/github-search](https://github.com/toxicwind/github-search.git) | — |
| `gito` | [toxicwind/gito](https://github.com/toxicwind/gito.git) | — |
| `godzilla-llama.cpp` | [toxicwind/godzilla-llama.cpp](https://github.com/toxicwind/godzilla-llama.cpp.git) | — |
| `hatch` | [toxicwind/hatch](https://github.com/toxicwind/hatch.git) | — |
| `hatch-decode` | [toxicwind/hatch-decode](https://github.com/toxicwind/hatch-decode.git) | — |
| `hatch/kite-cli` | [toxicwind/kite-cli](https://github.com/toxicwind/kite-cli.git) | — |
| `herd` | [toxicwind/herd](https://github.com/toxicwind/herd.git) | — |
| `herdproof-bun` | [toxicwind/herdproof-bun](https://github.com/toxicwind/herdproof-bun.git) | — |
| `hf-model-sync` | [toxicwind/hf-model-sync](https://github.com/toxicwind/hf-model-sync.git) | — |
| `hodos` | [toxicwind/hodos](https://github.com/toxicwind/hodos.git) | — |
| `host-proof` | [toxicwind/host-proof](https://github.com/toxicwind/host-proof.git) | — |
| `identity-router` | [toxicwind/identity-router](https://github.com/toxicwind/identity-router.git) | — |
| `kairos` | [toxicwind/kairos](https://github.com/toxicwind/kairos.git) | — |
| `keep` | [toxicwind/keep](https://github.com/toxicwind/keep.git) | — |
| `keryx` | [toxicwind/keryx](https://github.com/toxicwind/keryx.git) | — |
| `kilo` | [toxicwind/kilo](https://github.com/toxicwind/kilo.git) | — |
| `kimi-auto` | [toxicwind/kimi-auto](https://github.com/toxicwind/kimi-auto.git) | — |
| `kimi-claw` | [toxicwind/kimi-claw](https://github.com/toxicwind/kimi-claw.git) | — |
| `kodi-fleet` | [toxicwind/kodi-fleet](https://github.com/toxicwind/kodi-fleet.git) | — |
| `kryptos` | [toxicwind/kryptos](https://github.com/toxicwind/kryptos.git) | — |
| `lasso` | [toxicwind/lasso](https://github.com/toxicwind/lasso.git) | — |
| `leakfix-src` | [toxicwind/leakfix-src](https://github.com/toxicwind/leakfix-src.git) | — |
| `ledger` | [toxicwind/ledger](https://github.com/toxicwind/ledger.git) | — |
| `lib` | [toxicwind/lib](https://github.com/toxicwind/lib.git) | — |
| `loom` | [toxicwind/loom](https://github.com/toxicwind/loom.git) | — |
| `matter-server` | [toxicwind/matter-server](https://github.com/toxicwind/matter-server.git) | — |
| `maw` | [toxicwind/maw](https://github.com/toxicwind/maw.git) | — |
| `mcp` | [toxicwind/mcp](https://github.com/toxicwind/mcp.git) | — |
| `mcp-dropin-guide` | [toxicwind/mcp-dropin-guide](https://github.com/toxicwind/mcp-dropin-guide.git) | — |
| `mcp/mcp-prompt-injection-detector` | [thilinawishvekeerthi/mcp-prompt-injection-detector](https://github.com/thilinawishvekeerthi/mcp-prompt-injection-detector.git) | — |
| `mcp/mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | — |
| `mcp/pd-mcp-standalone` | [toxicwind/pd-mcp](https://github.com/toxicwind/pd-mcp.git) | — |
| `mcp/rsync-mcp` | [toxicwind/rsync-mcp](https://github.com/toxicwind/rsync-mcp.git) | — |
| `mcpproxy-go` | [toxicwind/mcpproxy-go](https://github.com/toxicwind/mcpproxy-go.git) | — |
| `mesh` | [toxicwind/mesh](https://github.com/toxicwind/mesh.git) | — |
| `mesh/pylae` | [toxicwind/flocksync](https://github.com/toxicwind/flocksync.git) | — |
| `meta-research-toolkit` | [toxicwind/meta-research-toolkit](https://github.com/toxicwind/meta-research-toolkit.git) | — |
| `metaaivm` | [toxicwind/metaaivm](https://github.com/toxicwind/metaaivm.git) | — |
| `metaaivm-profile` | [toxicwind/metaaivm-profile](https://github.com/toxicwind/metaaivm-profile.git) | — |
| `metaclaw-runtime` | [toxicwind/metaclaw-runtime](https://github.com/toxicwind/metaclaw-runtime.git) | — |
| `mission-control` | [toxicwind/mission-control](https://github.com/toxicwind/mission-control.git) | — |
| `ml-serve` | [toxicwind/ml-serve](https://github.com/toxicwind/ml-serve.git) | — |
| `muse-cli` | [toxicwind/muse-cli](https://github.com/toxicwind/muse-cli.git) | — |
| `naming-audit` | [toxicwind/naming-audit](https://github.com/toxicwind/naming-audit.git) | — |
| `nim-inkling-api-research` | [toxicwind/nim-inkling-api-research](https://github.com/toxicwind/nim-inkling-api-research.git) | — |
| `nim-omnibus` | [toxicwind/nim-omnibus](https://github.com/toxicwind/nim-omnibus.git) | — |
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
| `nuvio` | [toxicwind/nuvio](https://github.com/toxicwind/nuvio.git) | — |
| `nvidia-alive` | [toxicwind/nvidia-alive](https://github.com/toxicwind/nvidia-alive.git) | — |
| `nvidia-kernel-guard` | [toxicwind/nvidia-kernel-guard](https://github.com/toxicwind/nvidia-kernel-guard.git) | — |
| `nvidia-nim-model-probe` | [toxicwind/nvidia-nim-model-probe](https://github.com/toxicwind/nvidia-nim-model-probe.git) | — |
| `oh-my-pi` | [toxicwind/oh-my-pi](https://github.com/toxicwind/oh-my-pi.git) | — |
| `OmniRoute` | [toxicwind/OmniRoute](https://github.com/toxicwind/OmniRoute.git) | — |
| `openfang` | [toxicwind/openfang](https://github.com/toxicwind/openfang.git) | — |
| `openfang-join` | [toxicwind/openfang-join](https://github.com/toxicwind/openfang-join.git) | — |
| `openrouter-probe` | [toxicwind/openrouter-probe](https://github.com/toxicwind/openrouter-probe.git) | — |
| `ops` | [toxicwind/ops](https://github.com/toxicwind/ops.git) | — |
| `opsis` | [toxicwind/opsis](https://github.com/toxicwind/opsis.git) | — |
| `outlier-toolkit` | [toxicwind/outlier-toolkit](https://github.com/toxicwind/outlier-toolkit.git) | — |
| `outsource` | [toxicwind/outsource](https://github.com/toxicwind/outsource.git) | — |
| `pack-fix` | [toxicwind/pack-fix](https://github.com/toxicwind/pack-fix.git) | — |
| `paper-poller` | [toxicwind/paper-poller](https://github.com/toxicwind/paper-poller.git) | — |
| `pearlctl` | [toxicwind/pearlctl](https://github.com/toxicwind/pearlctl.git) | — |
| `phone-lane` | [toxicwind/phone-lane](https://github.com/toxicwind/phone-lane.git) | — |
| `phone-ocr-sweep` | [toxicwind/phone-ocr-sweep](https://github.com/toxicwind/phone-ocr-sweep.git) | — |
| `phone-sentinel` | [toxicwind/phone-sentinel](https://github.com/toxicwind/phone-sentinel.git) | — |
| `pinax` | [toxicwind/pinax](https://github.com/toxicwind/pinax.git) | — |
| `pj-fast` | [toxicwind/pj-fast](https://github.com/toxicwind/pj-fast.git) | — |
| `plugin-ecosystem` | [toxicwind/plugin-ecosystem](https://github.com/toxicwind/plugin-ecosystem.git) | — |
| `plugin-ecosystem/agentpluginzoo` | [tezansahu/agentpluginzoo](https://github.com/tezansahu/agentpluginzoo.git) | — |
| `ralph-dashboard` | [toxicwind/ralph-dashboard](https://github.com/toxicwind/ralph-dashboard.git) | — |
| `refusal-hunt` | [toxicwind/refusal-hunt](https://github.com/toxicwind/refusal-hunt.git) | — |
| `repo-first-class` | [toxicwind/repo-first-class](https://github.com/toxicwind/repo-first-class.git) | — |
| `rig` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | — |
| `rig-ciwatch` | [toxicwind/rig](https://github.com/toxicwind/rig.git) | — |
| `roundup-site` | [owieth/turborepo-example](https://github.com/owieth/turborepo-example) | — |
| `rust-wrappers` | [toxicwind/rust-wrappers](https://github.com/toxicwind/rust-wrappers.git) | — |
| `safety-review-gate` | [toxicwind/safety-review-gate](https://github.com/toxicwind/safety-review-gate.git) | — |
| `secretsmith` | [toxicwind/secretsmith](https://github.com/toxicwind/secretsmith.git) | — |
| `session-bus-refresh` | [toxicwind/session-bus-refresh](https://github.com/toxicwind/session-bus-refresh.git) | — |
| `skillforge` | [toxicwind/skillforge](https://github.com/toxicwind/skillforge.git) | — |
| `stealthprint` | [toxicwind/stealthprint](https://github.com/toxicwind/stealthprint.git) | — |
| `strudel-dev-vite` | [toxicwind/strudel-dev-vite](https://github.com/toxicwind/strudel-dev-vite.git) | — |
| `strudel-sampler-server-vite` | [toxicwind/strudel-sampler-server-vite](https://github.com/toxicwind/strudel-sampler-server-vite.git) | — |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `submodules/phone-sentinel` | [/home/toxic/phone-sentinel](/home/toxic/phone-sentinel) | — |
| `super-board` | [toxicwind/super-board](https://github.com/toxicwind/super-board.git) | — |
| `tau-verify` | [toxicwind/tau](https://github.com/toxicwind/tau.git) | — |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | — |
| `tau/tau-extensions` | [toxicwind/tau-extensions](https://github.com/toxicwind/tau-extensions.git) | — |
| `tok` | [toxicwind/tok](https://github.com/toxicwind/tok.git) | — |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | — |
| `tools/c8` | [bcoe/c8](https://github.com/bcoe/c8.git) | — |
| `toxicwind-repos` | [toxicwind/toxicwind-repos](https://github.com/toxicwind/toxicwind-repos) | — |
| `trading-post` | [toxicwind/trading-post](https://github.com/toxicwind/trading-post.git) | — |
| `universal-keypool-bun` | [toxicwind/universal-keypool-bun](https://github.com/toxicwind/universal-keypool-bun.git) | — |
| `universal-keypool-gateway` | [toxicwind/universal-keypool-gateway](https://github.com/toxicwind/universal-keypool-gateway.git) | — |
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
| `zed-android-port` | [toxicwind/zed-android-port](https://github.com/toxicwind/zed-android-port.git) | — |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 139 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `forge` | 369.4 MB | 2,427 | github.com/toxicwind/forge |
| `range` | 177.0 MB | 333 | — |
| `qed` | 122.4 MB | 4,522 | — |
| `propylon` | 113.7 MB | 7 | — |
| `barn` | 55.7 MB | 2,315 | github.com/toxicwind/barn |
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


## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 139 |
| Vendored (snapshot) | 50 |
| Experimental | 63 |
| Stub/Empty | 77 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-19T05:06:27.729Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
