<div align="center">

[![ci](https://github.com/toxicwind/ranch/actions/workflows/ci.yml/badge.svg)](https://github.com/toxicwind/ranch/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![stars](https://img.shields.io/github/stars/toxicwind/ranch)](https://github.com/toxicwind/ranch/stargazers)
[![bun](https://img.shields.io/badge/bun-1.4.4-f9f1e1?logo=bun)](https://bun.sh)
[![mise](https://img.shields.io/badge/toolchains-mise-ffd55a)](https://mise.jdx.dev)
[![go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)](https://go.dev)
[![rust](https://img.shields.io/badge/Rust-orange?logo=rust)](https://www.rust-lang.org)

# 🤠 ranch

**The estate's service catalog.** Fleet chat (**squawk** :25120), the MCP gateway (**thresher** :25127 — mcpproxy-go fork, one audited door), evals (**roundup**), android-fleet + flotilla (the Pixel), the telegram lane (**arroyo/coyote**), and dozens of single-purpose services — one directory per service, everything OpenAI-compatible. The cloud routers live next door in **geode** (rhodochrosite :25193 canonical); the coding agent is **tau** (own repo, olympus); build ops live in **barn**.

[Explore the docs »](docs/) · [Report Bug](https://github.com/toxicwind/ranch/issues/new?labels=bug&template=bug_report.md) · [Request Feature](https://github.com/toxicwind/ranch/issues/new?labels=enhancement&template=feature_request.md)

<img src="docs/images/ranch-demo.svg" alt="ranch 30-second proof: 52 local models behind one OpenAI-compatible door, every core service answering 200" width="720">

</div>

## Facts (generated — do not hand-edit)

<!-- FACTS:START -->
| service dirs | 298 |
| squawk bus port | 25120 (ports.env ESTATE_CHAT_PORT) |
| thresher MCP gateway port | 25127 (ports.env THRESHER_PORT) |
<!-- FACTS:END -->

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

**tau** is the coding agent (fork of [oh-my-pi](https://github.com/can1357/oh-my-pi)) — terminal CLI + SDK, 30+ tools, subagents, native Rust hot path. It lives in its own repo ([toxicwind/tau](https://github.com/toxicwind/tau), nested under olympus on disk) and resolves every model through **mimetite** (geode's provider catalog) routed via **rhodochrosite** :25193. If you only learn one animal, learn tau — the rest of the catalog exists so the village can run.

## 🛠️ Built with

- [Go](https://go.dev) — thresher (the MCP gateway, mcpproxy-go fork)
- [Rust](https://www.rust-lang.org) — rig (the agent OS kernel, [toxicwind/rig](https://github.com/toxicwind/rig)), tau's native hot path, geode's rhodochrosite router
- [Bun](https://bun.sh) + [TypeScript](https://www.typescriptlang.org) — squawk, fleet-ui, roundup, eidolon, mimetite's catalog codegen
- [Python](https://www.python.org) — arroyo/coyote (telegram MTProto), loggy-bridge, lasso (desktop control)
- [mise](https://mise.jdx.dev) — toolchains and build tasks; estate owns the shared build cache
- **pitchfork** — the daemon supervisor: supervised services on the live estate

## 📊 Monorepo Statistics (generated 10/28/2026, 4:08:24 AM)

| Metric | Value |
|---|---|
| Total directories | 131 |
| Directories with obvious upstream | 4 / 131 (3.1%) |
| Git-tracked directories | 0 |
| Components (peer repos) | 0 |
| Total size | 1.08 GB |
| Total tracked files | 0 |

## 🗂️ Components

*(.gitmodules not readable)*

## 🔭 Upstream Sources

| Source | Count |
|---|---|
| package.json repository | 2 |
| README 'Forked from' | 1 |
| Cargo.toml repository | 1 |

## 🌐 Languages (by tracked files)

| Language | Files |
|---|---|

## 📦 Top 10 Largest Directories

| Directory | Size | Files | Upstream |
|---|---|---|---|
| `forge` | 387.8 MB | 4,091 | — |
| `range-ui.tmp` | 177.0 MB | 334 | — |
| `range` | 133.5 MB | 26,353 | — |
| `qed` | 122.4 MB | 4,522 | — |
| `propylon` | 113.7 MB | 7 | — |
| `barn` | 58.5 MB | 2,411 | — |
| `herd` | 22.7 MB | 2 | — |
| `rustdesk-server` | 18.7 MB | 8 | — |
| `github-search` | 10.5 MB | 643 | — |
| `roundup` | 8.4 MB | 644 | — |

## 🔮 Top Upstreams by Fork Count

| Upstream | Forks |
|---|---|
| [github.com/roninjin10/super-ralph](https://github.com/roninjin10/super-ralph.git) | 1 |
| [github.com/A-man-Sharma-04/modelpilot](https://github.com/A-man-Sharma-04/modelpilot) | 1 |
| [github.com/IlyasKhallouki/hypruse](https://github.com/IlyasKhallouki/hypruse) | 1 |
| [github.com/toxicwind/yote](https://github.com/toxicwind/yote) | 1 |

## 🔲 Similarity Clusters (README-based)

Directories with similar README content (Jaccard on first 500 chars):

| Dir A | Dir B | Similarity |
|---|---|---|


## 📁 Directory Type Breakdown

| Type | Count |
|---|---|
| Vendored (snapshot) | 68 |
| Experimental | 63 |

---

*Generated by `bun toolkit/generate-readme.ts` at 2026-10-28T04:08:24.657Z*

---

*Do not edit this file directly — it is generated from `FORKS-report.json`.*
*Run `bun toolkit/generate-readme.ts --update` to regenerate.*
