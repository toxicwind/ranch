# Switchboard — the master skill router

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

**Status:** proof-of-concept live (2026-09-30). MCP server + agent-driven deploy proof passing.

## The problem it solves

The estate has three kinds of routers and none of them route *capabilities*:

| Router | Routes | Port |
|---|---|---|
| herd (`:25100`) | models → llama-swap backends | 25100 |
| sovereign-router (`:25104`) | model requests → providers (strategies, Elo, circuits) | 25104 |
| flock (`:25193`) | (model routing variant) | 25193 |

Meanwhile **skills** — the estate's actual capabilities (`SKILL.md` files with
`name:` + `description:` frontmatter in `/home/toxic/estate/skills/` and
`~/workspace/skills/`) — have no index and no router. OpenFang agents declare
`skills = []` and `mcp_servers = []` in `agent.toml`, but nothing resolves
those fields (verified: zero matches for "skill router" across 152k sovereign
files; every agent's lists are empty).

**Switchboard is the missing router: agent intents → skills/capabilities →
infrastructure.** It composes with the model routers, not against them:
an agent asks switchboard *what it can use*, asks the model router *who
thinks*, and executes through MCP tools.

## Surfaces

1. **MCP server** (`server.ts`, Bun, stdio, newline-delimited JSON-RPC):
   `initialize`, `tools/list`, `tools/call`.
2. **Completions-compatible**: works through OpenFang's `/v1/chat/completions`
   tool-calling once the kernel's model 404 is repaired (2026-09-30: kernel
   requests a model name herd 404s on — separate lane's bug, noted not fixed).

## Tools

| Tool | What it does | Replaces |
|---|---|---|
| `skill_search(query)` | Ranked search over the estate skill index | tribal knowledge |
| `skill_get(name)` | Full SKILL.md for a skill | — |
| `infra_containers()` | `docker ps -a` | Portainer container list |
| `infra_deploy(name, compose_yaml)` | Write compose → `docker compose up -d` | Portainer webhook deploys |
| `infra_logs(container, tail)` | `docker logs` | Portainer log viewer |
| `infra_down(name)` | `docker compose down` (rollback path) | Portainer stack stop |

Stacks live under `/home/toxic/switchboard/stacks/<name>/`.

## Proof (2026-09-30)

`proof.ts` acts as an OpenFang agent would: stdio JSON-RPC →
`tools/list` (6 tools) → `skill_search` → `infra_deploy` (nginx:alpine on
:18923) → verify container Up → HTTP 200 → `infra_logs` → `infra_down`.
**PROOF PASS** — 11/11 checks, a real deploy driven by an agent through MCP,
no dashboard touched.

## Roadmap

- [ ] Persistent skill index (sqlite, reindex on inotify — no polling)
- [ ] `infra_image_build(name, context)` — local builds (flicker-backed)
- [ ] `infra_rollback(name)` — previous-image instant rollback
- [ ] HTTP/SSE transport alongside stdio (for the :25xxx serve map)
- [ ] Wire `agent.toml` `skills`/`mcp_servers` resolution through switchboard
- [ ] OpenFang kernel: repair model-name 404 so completions tool-calling works
- [ ] Effusion deploy: Burrow's flicker-native pipeline can call
      `infra_deploy` instead of shelling docker directly

## Why not Portainer v3 / Coolify / Dokploy

The 2026 replacement bar is *agentic-first*: MCP tools + completions an
OpenFang agent drives. Dashboards with an API bolted on fail the bar —
they're click-ops with extra steps. (Full candidate shortlist with
pattern-borrow evidence: see the replacement research report.)
