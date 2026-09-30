# 💬 Campfire Chat-Patterns Brief

**Researched:** 2026-09-30 by PatternBorrower (ember's pack)
**Method:** `pattern-borrow.ts` (GitHub-wide term ranking) + `sort=updated` repo
search + code search + full-file reads on yote (8 queries, 64 repos scanned)
**Ranked by:** recency + relevance, never stars alone

## Top 5 borrowable patterns

### 1. Declarative goal JSONs — behavior without code changes
**`berkmancenter/llm_engine`** — `proactiveGroupAgent` (374-line impl + goal JSONs,
all read in full)

Every intervention type is a JSON goal file: `triggers.conditions[]`,
`minConfidence`, `guardrails[]`, `outputContract.format`, `examples[]`.
The runtime composes the system prompt from active goals; **new behavior =
new JSON, no code change.**

The killer sub-pattern: **structured intervention judgment**. The LLM must
return `{reasoning, shouldIntervene, goalId, sharedChatMessage, confidenceScore,
detectedPattern}` — "should I speak?" as an explicit, auditable decision,
never vibes.

- **Silence-compatibility flag:** goals declare whether they may fire *on*
  silence (`provoke_participation`) or require signal (`surface_signal`)
- **The golden rule:** "If participants are actively exchanging substantive
  messages, stay quiet — even if you could add something useful. A working
  discussion doesn't need intervention."
- **2+ independent signals** before surfacing anything observed privately
- **Min contribution interval + grace buffer** so the agent can't double-post

**Borrowed:** Campfire's brain now emits a structured decision record
(`decision.ts`) with goal, confidence, and reasoning — the auditable gate.
The golden rule strengthened the room's flow gate.

### 2. Predicate-gated heartbeat with NOOP fast path
**`brett817/ascendops`** — `heartbeat/SKILL.md` (356 lines, read in full)

The scheduled wake **first checks whether anything noteworthy happened**
since the last beat (new message, error, stale task). If not → NOOP: 1-line
memory + timestamp + done, skip everything expensive. A weekly safety-net
forces a full scan regardless.

Operational details: never `exit 0` inside the agent's persistent shell
(watchdog restart storm — use a guard variable); fold separate pollers into
the one heartbeat so two don't exist.

**Borrowed:** validates Campfire's event-driven sweep (deadline evaluation
only on incoming events — already the design). The NOOP fast path is the
sweep's early-return when nothing is due.

### 3. "Speak as one agent" + "warm chat, not status prose"
**`aitne-sh/aitne`** (`conversational.md`, 89 lines) + **`ayesha-shaik/ai_training`**
(SKILL.md chat-persona section)

Two rules that shaped Campfire's own SKILL.md:
- **Identity:** phrase facts as your own memory, never name internal
  files/mechanisms in user-visible text — with the honesty carve-out (when
  asked for sourcing, answer precisely)
- **Register:** "stop behaving like a terse coding agent. Behave like warm
  chat." Flowing prose over bullet-dumps; explain thinking out loud; one
  good follow-up question at natural stopping points

The two poles: ai_training's warm teacher vs `ai-driven-dev/framework`'s
terse operator ("Answer first: result before reason"). **Campfire picks its
register deliberately: warm campfire, not ops console.**

### 4. Event-driven agent skeleton — `@on_event` + lifecycle hooks
**`openagents-org/openagents`** — `worker_agent.py` event model

`on_startup`, `on_direct`, `on_channel_post`, `on_channel_reply`,
`on_channel_mention`, `on_reaction`, `on_shutdown` — the handler taxonomy
instead of a poll loop. (Their "CommunityHelper" welcome agent is doc-level
only; the SDK skeleton is the real artifact.)

**Borrowed:** Campfire's brain is organized as event handlers
(`onMessage` → join/question/milestone/complete/nudge paths), not a loop.

### 5. Push transitions, don't heartbeat
**`simadevelopment/opsiforce`** — ADR-0020 (read in full)

Deliberate *anti*-heartbeat: push Working/Idle **transitions** over the event
bus; re-read truth at boundaries (boot, reconnect, lifecycle) instead of
continuously proving liveness. "Status is queryable at rest, so staleness is
repaired by re-reading rather than by continuously proving liveness."

**Borrowed:** Campfire's presence philosophy — it speaks when something
happened, never to prove it's alive.

### Honorable mentions

- **`byte5ai/omadia-agent-facilitator`** — visible convener, never hidden
  observer; round-robin addressing by name; reflective summarizing
  ("I'm hearing… — is that right?")
- **`ideaflowco/openchat`** — privacy invariant: "an agent can only read what
  its context is allowed to read"
- **`intellina-systems/skills`** — ship SKILL.md + AGENTS.md in dual format
  ("so the rest pick them up too"); presence at natural checkpoints, never
  counted
- **`022ugdw213/nvidia-muse-dev-swarm`** — sqlite queue with stale-requeue,
  heartbeat-table presence (best literal HF+OpenAI+swarm match, 345 lines read)

## Domain 3 — HF + OpenAI + swarm seed repos (Chris's request)

Ranked by recency, then relevance:

1. **`022ugdw213/nvidia-muse-dev-swarm`** (2026-09-25) — HF datasets via
   parquet API + OpenAI-compatible NVIDIA client + sqlite task queue.
   Best literal match.
2. **`metauto-ai/GPTSwarm`** (1050★, ICML 2024 oral) — swarm as optimizable
   graph; agents as nodes, edges pruned/created against benchmark score
3. **`kyegomez/swarms`** (7221★, pushed today) — canonical enterprise MAS
   framework; flagged as seed, not deep-read
4. **`monaccode/astromesh`** (2026-09-25) — multi-model runtime (Ollama,
   OpenAI-compat, vLLM, HF TGI) with swarm orchestration pattern
5. **`modelscope/AgentJet`** (240★) — HF-ecosystem RL tuning platform

**Excluded:** the July 2026 OpenAI/HF security incident repos (news, not
patterns); awesome-lists (indexes, not patterns); name-match 0-star repos.

## What changed in Campfire's code

| Pattern | Change |
|---|---|
| Structured judgment (llm_engine) | `src/decision.ts` — decision record with goal, confidence, reasoning |
| Golden rule | `room.ts` — flow gate strengthened: active substantive exchange = hard quiet |
| Speak-as-one-agent | SKILL.md §8 — no internal mechanism names in visible text |
| Event skeleton | brain.ts handler organization (already event-driven) |
| Dual format | This doc + SKILL.md (AGENTS.md pointer in campfire/ root) |

---

*Raw research: `/tmp/campfire-research/patterns.md` (26.6KB, full honesty ledger
of read-vs-skimmed-vs-unverified)*
