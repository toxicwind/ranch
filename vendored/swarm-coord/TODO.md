# Swarm Coordinator Roadmap & Task Board (`swarm-coord`)

## Phase 1: Core Mailbox Substrate [COMPLETED]
- [x] Strict JSONL message schema (`src/protocol.ts`) with `task`, `result`, `ack`, `chat`, `status`
- [x] Single-writer invariant enforcement (agents write own outbox; coordinator writes inboxes + bus)
- [x] Coordinator fan-out daemon (`bin/coordinator.ts`) with startup idempotency replay cache
- [x] Swarm agent worker loop (`bin/swarm.ts`) with basic task operations (`echo`, `upper`, `reverse`)
- [x] Squawk HTTP bridge (`bin/squawk-bridge.ts`) targeting `:25120/v1/rooms/<room>/messages` with offline retry spool
- [x] Protocol specification (`docs/PROTOCOL.md`)
- [x] Edge-case & anti-IRC storm hardening specification (`docs/EDGE-CASES.md`)

## Phase 2: Autonomous Coordination & Fleet Integration [IN PROGRESS]
- [ ] Task deadline and lease expiration (auto-reassign stale tasks after 30s)
- [ ] Multi-agent task chaining (Agent A result triggers Agent B task)
- [ ] Direct `/v1/presence` heartbeat publication to squawk daemon
- [ ] Compaction daemon for `bus/messages.jsonl` (>50k lines rotation)
- [ ] Dynamic agent registration (create `agent-N/` directories on demand via `join` message)

## Phase 3: A2A Protocol Interop & Verification
- [ ] Expose LDP (LLM Delegate Protocol) Agent Cards in `bus/cards/<agent-id>.json`
- [ ] Wire Hephaistos (`pens/ergasterion/hephaistos`) retrospective and patch harness
- [ ] End-to-end integration test with mock squawk listener
