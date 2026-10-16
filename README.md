<div align="center">

[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)
[![bun](https://img.shields.io/badge/bun-1.4.2-f9f1e1?logo=bun)](https://bun.sh)
[![mise](https://img.shields.io/badge/toolchains-mise-ffd55a)](https://mise.jdx.dev)
[![go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![rust](https://img.shields.io/badge/Rust-orange?logo=rust)](https://www.rust-lang.org)

# 🤠 ranch

**The whole self-hosted AI estate in one monorepo.** Local model serving (**herd**), cloud provider routing (**flock**), the canonical router (**cuttinggate**), the coding agent (**tau**), the MCP gateway (**gatehouse**), the build-job system (**flicker**), fleet chat (**squawk**), and the provider catalog (**roost**) they all share — one directory per component, the full mesh on one box, everything OpenAI-compatible.

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

**tau** is the coding agent — a terminal coding agent (fork of [oh-my-pi](https://github.com/can1357/oh-my-pi)) with an interactive CLI + SDK, 30+ tools, subagents, LSP-aware editing, and a native Rust hot path. It speaks to dozens of providers through a compiled model catalog sourced from **roost**, the ranch's single provider-data authority. Tau lives in its own repo ([toxicwind/tau](https://github.com/toxicwind/tau)) and nests into the ranch at `tau/` (gitignored — an independent repo with its own remote, absent in a fresh clone); on a live estate, **chute** exposes its stdio ACP engine as a TCP daemon on `:25111`, and its model traffic flows through herd and flock. If you only learn one animal, learn tau — the rest of the ranch exists so the agent can work.

## 🛠️ Built with

- [Go](https://go.dev) — herd (local front door), flicker (build jobs), gatehouse (MCP gateway)
- [Rust](https://www.rust-lang.org) — flock proxy (provider router), rig (OpenFang kernel), tau's native hot path
- [Bun](https://bun.sh) + [TypeScript](https://www.typescriptlang.org) — workspaces, cuttinggate, fleet-ui, windmill, stream-broker, roost, tau's agent brain
- [Python](https://www.python.org) — squawk (fleet chat), squawk-ws, lasso (desktop control)
- [mise](https://mise.jdx.dev) — toolchains and build tasks; estate owns the shared build cache
- **pitchfork** — the daemon supervisor: supervised services on the live estate

## 📊 Monorepo Statistics (generated 10/15/2026, 1:25:17 AM)

| Metric | Value |
|---|---|
| Total directories | 194 |
| Directories with obvious upstream | 48 / 194 (24.7%) |
| Git-tracked directories | 48 |
| Submodules | 37 |
| Total size | 121.66 GB |
| Total tracked files | 325,109 |

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| .gitmodules | 37 |
| package.json repository | 3 |
| git remote origin (non-toxicwind) | 2 |
| git remote upstream | 2 |
| go.mod module | 1 |
| README 'Forked from' | 1 |
| GitHub parent fork | 1 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|
| Python | 23 |
| TypeScript | 22 |
| Markdown | 15 |
| Shell | 12 |
| Rust | 6 |
| TOML | 5 |
| GITIGNORE | 4 |
| CONF | 2 |
| Text | 2 |
| JSON | 2 |
| LICENSE | 1 |
| LOCK | 1 |
| RULES | 1 |
| RUST-GATEWAY/LICENSE | 1 |

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `qed` | 63710.1 MB | 358,476 | — |
| `mesh` | 19351.0 MB | 322,548 | — |
| `wezterm` | 8131.4 MB | 31,543 | github.com/toxicwind/wezterm |
| `tau` | 5087.8 MB | 48,433 | github.com/can1357/oh-my-pi |
| `tau-extensions` | 4786.4 MB | 77,624 | github.com/toxicwind/tau-extensions |
| `shell` | 3827.8 MB | 14,599 | — |
| `rust-algo-web` | 3315.1 MB | 11,657 | — |
| `nim-repos` | 2709.8 MB | 63,117 | — |
| `barn` | 2253.2 MB | 12,945 | — |
| `github-search` | 2158.2 MB | 45,093 | — |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/aparnaa19/AgentForensics](https://github.com/aparnaa19/AgentForensics) | 1 |
| [github.com/roninjin10/super-ralph](https://github.com/roninjin10/super-ralph.git) | 1 |
| [github.com/toxicwind/doorbell](https://github.com/toxicwind/doorbell) | 1 |
| [github.com/A-man-Sharma-04/modelpilot](https://github.com/A-man-Sharma-04/modelpilot) | 1 |
| [./estate-scripts](./estate-scripts) | 1 |
| [go.woodpecker-ci.org/woodpecker/v3](https://go.woodpecker-ci.org/woodpecker/v3) | 1 |
| [github.com/Aetherall/hyprgrid](https://github.com/Aetherall/hyprgrid) | 1 |
| [github.com/jairnarvaez/Hyprgrid](https://github.com/jairnarvaez/Hyprgrid) | 1 |
| [github.com/toxicwind/kilo-cli](https://github.com/toxicwind/kilo-cli) | 1 |
| [github.com/toxicwind/kilo-code](https://github.com/toxicwind/kilo-code) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|
| `pd-mcp-standalone` | `pearlctl` | 45.9% |
| `mcpproxy-go` | `squawk` | 41.3% |
| `estate-scripts` | `squawk` | 38.9% |
| `repo-first-class` | `squawk` | 35.4% |
| `outlier-toolkit` | `refusal-hunt` | 35.1% |
| `strudel-dev-vite` | `strudel-sampler-server-vite` | 34.9% |
| `ferret-den` | `squawk` | 34.6% |
| `outlier-toolkit` | `session-bus-refresh` | 33.9% |
| `mcpproxy-go` | `pearlctl` | 33.3% |
| `ferret-den` | `mcpproxy-go` | 32.8% |

## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Submodule | 37 |
| Fork (ours) | 41 |
| Upstream mirror | 6 |
| Fork (ours, no upstream) | 3 |
| Upstream mirror (no upstream) | 1 |
| Vendored (snapshot) | 58 |
| Experimental | 57 |
| Stub/Empty | 31 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-15T07:25:17.304Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
