<div align="center">

[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)
[![bun](https://img.shields.io/badge/bun-1.4.2-f9f1e1?logo=bun)](https://bun.sh)
[![mise](https://img.shields.io/badge/toolchains-mise-ffd55a)](https://mise.jdx.dev)
[![go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![rust](https://img.shields.io/badge/Rust-orange?logo=rust)](https://www.rust-lang.org)

# 🤠 ranch

**The whole self-hosted AI estate in one monorepo.** Local model serving (**herd**), cloud provider routing (**hodos**), the canonical router (**cuttinggate**), the coding agent (**tau**), the MCP gateway (**gatehouse**), the build-job system (**forge**), fleet chat (**squawk**), and the provider catalog (**roost**) they all share — one directory per component, the full mesh on one box, everything OpenAI-compatible.

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
- [Python](https://www.python.org) — squawk (fleet chat), squawk-ws, lasso (desktop control)
- [mise](https://mise.jdx.dev) — toolchains and build tasks; estate owns the shared build cache
- **pitchfork** — the daemon supervisor: supervised services on the live estate

## 📊 Monorepo Statistics (generated 10/16/2026, 11:01:21 PM)

| Metric | Value |
|---|---|
| Total directories | 243 |
| Directories with obvious upstream | 84 / 243 (34.6%) |
| Git-tracked directories | 83 |
| Submodules | 76 |
| Total size | 322.56 GB |
| Total tracked files | 645,130 |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 76 |
| package.json repository | 5 |
| README 'Forked from' | 1 |
| git remote upstream | 1 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|
| TypeScript | 27,953 |
| Markdown | 5,672 |
| Rust | 4,943 |
| SVG | 3,967 |
| JavaScript | 3,578 |
| JSON | 3,460 |
| Python | 3,120 |
| Go | 1,947 |
| TSX | 1,916 |
| MAP | 1,586 |
| PNG | 1,333 |
| PYC | 1,272 |
| QML | 1,158 |
| Kotlin | 1,081 |
| TOML | 911 |
| Shell | 790 |
| Text | 782 |
| C++ | 685 |
| KDL | 673 |
| CU | 564 |

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `models` | 139697.9 MB | 101 | — |
| `vendored` | 97064.4 MB | 2,460,398 | — |
| `hatch` | 18287.6 MB | 187,002 | github.com/toxicwind/hatch |
| `mesh` | 11526.0 MB | 132,127 | — |
| `tau` | 9895.6 MB | 126,228 | github.com/can1357/oh-my-pi |
| `qed` | 8179.6 MB | 56,807 | — |
| `kilo` | 7557.7 MB | 163,651 | — |
| `forge` | 6131.7 MB | 38,467 | — |
| `shell` | 4589.4 MB | 14,953 | — |
| `rust-algo-web` | 3626.3 MB | 11,657 | — |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/toxicwind/rig](https://github.com/toxicwind/rig) | 2 |
| [github.com/toxicwind/agent-customization-style-guide](https://github.com/toxicwind/agent-customization-style-guide) | 1 |
| [github.com/toxicwind/agent-dashboard](https://github.com/toxicwind/agent-dashboard) | 1 |
| [github.com/aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics) | 1 |
| [github.com/toxicwind/agon](https://github.com/toxicwind/agon) | 1 |
| [github.com/toxicwind/ai-merge-resolve](https://github.com/toxicwind/ai-merge-resolve) | 1 |
| [github.com/toxicwind/antilogos](https://github.com/toxicwind/antilogos) | 1 |
| [github.com/toxicwind/awesome-free-ai-coding](https://github.com/toxicwind/awesome-free-ai-coding) | 1 |
| [github.com/toxicwind/computer-use-linux](https://github.com/toxicwind/computer-use-linux) | 1 |
| [github.com/toxicwind/corral](https://github.com/toxicwind/corral.git) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|
| `rig` | `rig-ciwatch` | 100.0% |
| `tau` | `tau-verify` | 100.0% |
| `agon` | `antilogos` | 66.7% |
| `estate-hatch-toolkit` | `pearlctl` | 60.6% |
| `agent-customization-style-guide` | `mcp-dropin-guide` | 57.1% |
| `agon` | `gavel` | 54.5% |
| `antilogos` | `gavel` | 54.5% |
| `estate-shell` | `kairos` | 45.1% |
| `kairos` | `tok` | 41.1% |
| `agon` | `estate-shell` | 40.4% |

## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 76 |
| Fork (ours) | 61 |
| Upstream mirror | 20 |
| Fork (ours, no upstream) | 1 |
| Upstream mirror (no upstream) | 2 |
| Vendored (snapshot) | 69 |
| Experimental | 61 |
| Stub/Empty | 30 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-17T05:01:21.606Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
