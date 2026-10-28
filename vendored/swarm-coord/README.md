<div align="center">

# 🐝 `swarm-coord`

**Durable File-Bus Swarm Coordinator with Squawk Fleet Bridge**

*Single-writer invariant mailbox architecture connecting autonomous agents to the estate fleet bus.*

[![runtime: bun](https://img.shields.io/badge/runtime-Bun%201.4-FBF0DF?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh)
[![protocol: JSONL](https://img.shields.io/badge/protocol-JSONL%20durable%20mailbox-007ACC?style=for-the-badge)](docs/PROTOCOL.md)
[![fleet: squawk](https://img.shields.io/badge/fleet-squawk%20%3A25120-orange?style=for-the-badge)](bin/squawk-bridge.ts)

</div>

---

## Architecture Overview

`swarm-coord` replaces unconstrained IRC chat loops with a **durable, single-writer mailbox protocol**. Agents communicate via dedicated inboxes and outboxes, while the coordinator multiplexes messages onto the central bus and broadcasts event summaries to Squawk.

```text
               ┌────────────────┐
               │    Squawk      │
               │ daemon :25120  │
               └───────▲────────┘
                       │ HTTP POST (room: swarm-events)
             ┌─────────┴──────────┐
             │  bin/squawk-bridge │
             └─────────▲──────────┘
                       │ (tail bus/messages.jsonl)
                       │
       ┌───────────────▼──────────────┐
       │     bin/coordinator.ts       │
       │   (Bus Fan-out & Router)     │
       └───▲───────────┬──────────▲───┘
           │           │          │
   outbox  │     inbox │   inbox  │  outbox
           │           ▼          ▼  │
     ┌─────┴────┐  ┌────────┐  ┌─────┴────┐
     │ agent-1  │  │agent-2 │  │ agent-3  │
     └──────────┘  └────────┘  └──────────┘
```

### Invariants:
1. **Single Writer**: Only `agent-N` writes `agent-N/outbox.jsonl`. Only the coordinator writes `agent-N/inbox.jsonl` and `bus/messages.jsonl`.
2. **Crash Resilience**: Reads skip incomplete/malformed lines without failing; file truncations use atomic temp-and-rename.
3. **Idempotency**: All message IDs are deduplicated in-memory against a bus index on startup.

---

## Quickstart

### 1. Launch the Coordinator
```bash
bun run bin/coordinator.ts
```

### 2. Start Worker Agents
```bash
# Terminal 1
bun run bin/swarm.ts -- agent-1

# Terminal 2
bun run bin/swarm.ts -- agent-2
```

### 3. Launch Squawk Bridge (Optional)
```bash
bun run bin/squawk-bridge.ts
```

### 4. Inject a Task
Append a JSON payload directly into an agent's outbox:
```bash
echo '{"from":"agent-1","to":"agent-2","type":"task","id":"task-001","payload":{"op":"upper","text":"hello estate swarm"},"ts":"2026-10-28T05:00:00Z"}' >> agent-1/outbox.jsonl
```

### 5. Inspect Results
- Observe coordinator routing:
  ```bash
  cat bus/messages.jsonl
  ```
- Observe destination inbox and execution:
  ```bash
  cat agent-2/inbox.jsonl
  cat agent-2/outbox.jsonl
  ```

---

## Documentation

- [`docs/PROTOCOL.md`](docs/PROTOCOL.md) — Envelope schema, message types (`task`, `result`, `ack`, `chat`, `status`), and ack contracts.
- [`docs/EDGE-CASES.md`](docs/EDGE-CASES.md) — Concurrency, write tearing, replay protection, rate limits, and dead-letter routing.
- [`TODO.md`](TODO.md) — Feature roadmap and A2A delegation integration plan.
