# Portainer replacement — hyper-race results + recommendation (2026-09-30)

## Audit verdict (see `docs/audits/portainer-inventory-2026-09-30.md`)

**Portainer is a ghost.** No live instance on yote, tailnet, or DNS. Zero
stacks/containers/volumes under management. Only dead references remain
(effusion webhook — 6 months of failed runs; dedi-ops/dayz manual-import
tooling). Nothing to migrate; only references to delete.

## Hyper-race: daemon-direct lane (real E2E, yote, 2026-09-30)

Identical protocol per candidate: stdio MCP → tools/list → agent-style
`create → start → HTTP 200 → logs → remove`, wall-clock timed.

| Candidate | Tools | Deploy latency | E2E | Verdict |
|---|---|---|---|---|
| **Switchboard** (ours, Bun) | 6 (4 infra) | **5.5s** | ✅ PASS | fastest; compose-native; estate skill index |
| ckreiling/mcp-server-docker (Python) | 19 | **13.3s** | ✅ PASS | consistent arg naming; lean; established (746★) |
| L337-org/docker-mcp (Python) | 165 (83 infra) | **20.9s** | ✅ PASS | richest surface; read-only/destructive flags; multi-daemon; inconsistent arg names (`container` vs `id_or_name`); 8★, 2 days old |

Also probed:
- **Flicker :25148** — API live (submit 200), but job execution is **stalled**:
  jobs 33–35 sit `pending`; the woodpecker agent isn't picking up. Executor
  lane needs a look before Flicker is trusted for deploys.
- **Dagger v0.21.9** — engine live on yote, CLI works. Pipeline substrate,
  not a serving plane. Agent-scriptable via GraphQL/`dagger call` today.

Not E2E-raced (require their own server install — out of scope on the live
box): Dokploy (+official MCP), Coolify (read-only native MCP + community
write MCPs), Komodo (no native MCP). See the research shortlist
(`docs/audits/portainer-replacement-shortlist-20260930.md`) for the full
8-candidate ranking with pattern-borrow + paper evidence.

## Recommendation

**Don't install another dashboard. The 2026 agentic replacement is a
composition, and the estate already owns every piece:**

1. **Switchboard = the control plane + master skill router** (this repo).
   Fastest deploy path measured (5.5s), compose-native (matches how the
   estate actually deploys), and the only surface that routes *capabilities*
   (skills) instead of just models. Keep it; don't replace it with a PaaS.
2. **Borrow L337's safety patterns into Switchboard**: read-only/destructive
   tool flags, bounded output with `truncated`, multi-daemon support.
   Its 165-tool surface is the reference for which tools to add next —
   adopt the design, not the dependency (Python + 2-day-old + 8★).
3. **ckreiling/mcp-server-docker as the fallback daemon-direct MCP**:
   if an agent needs raw daemon tools outside Switchboard's compose model,
   this is the stable, lean choice.
4. **Flicker for build jobs** once its executor stall is fixed (flagged).
5. **Dagger for programmable pipelines** (`dagger call` from agents).

Dokploy/Coolify are honest answers to a different question ("hosted PaaS
with an agent API"). This estate is building agent-native infrastructure —
Switchboard + Flicker + Dagger is that, with measured evidence.

## Remaining blocker (not this lane)

OpenFang `/v1/chat/completions` 500s for every agent: the kernel requests a
model name herd 404s on (`LLM driver error: Model not found ... upstream
404`). The true `agent → completions → Switchboard MCP → deploy` loop needs
that repaired. The MCP half is proven; the completions half is not.
