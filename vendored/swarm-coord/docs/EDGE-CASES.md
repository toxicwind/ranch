# Swarm Coordinator: Edge Cases & Hardening Specification

> **Doctrine**: Durable Mailbox, Not Unconstrained IRC Broadcast Loop.
> File-based IPC must withstand dirty shutdowns, partial writes, concurrent access, and runaway agent loops.

---

## 1. Concurrency & Write Hazards

### 1.1 Atomic Appends (`O_APPEND` vs Temp-and-Rename)
- **Problem**: When multiple processes append to `messages.jsonl` or `outbox.jsonl` simultaneously, userspace buffer flushes can interleave bytes if buffer sizes exceed `PIPE_BUF` (typically 4096 bytes on Linux) or if file offset seeks race.
- **Contract**:
  - Outboxes (`agent-*/outbox.jsonl`) are strictly single-writer (only the owning agent writes).
  - Inboxes (`agent-*/inbox.jsonl`) are strictly single-writer (only the coordinator writes).
  - The Bus (`bus/messages.jsonl`) is strictly single-writer (only the coordinator appends).
  - **Invariance**: Since every file has exactly ONE writer process, concurrent write tearing is impossible by topology.
  - When rotating/truncating outboxes after fan-out, the coordinator or agent uses atomic rename via temporary file (`${file}.tmp.${pid}`) to ensure readers never observe truncated intermediate state.

### 1.2 Partial Writes & Torn Lines
- **Problem**: Power loss, `SIGKILL`, or out-of-disk condition mid-line produces a trailing line without `\n` or with invalid JSON syntax.
- **Contract**:
  - `parseLines()` in `src/protocol.ts` strictly discards incomplete or unparseable lines with a structured warning instead of throwing.
  - Any line missing `\n` at EOF is retained in an internal buffer until completed or discarded upon rotation if malformed.

---

## 2. Idempotency & Message Deduplication

### 2.1 Duplicate IDs across Outbox Reprocess
- **Problem**: If an agent restarts or retries, it may re-emit messages with IDs that were already ingested into `bus/messages.jsonl`.
- **Contract**:
  - The coordinator maintains an in-memory `Set<string>` of seen message IDs (`seenIds`).
  - On startup, the coordinator warms `seenIds` by scanning `bus/messages.jsonl`.
  - Duplicate message IDs in any outbox are acknowledged/dropped without double-dispatch to the bus or destination inboxes.

### 2.2 Replay Protection & Ack Cycles
- **Problem**: Task $\rightarrow$ Result $\rightarrow$ Ack loops could trigger circular storms if agents treat ACKs as actionable work.
- **Contract**:
  - Message types are strictly partitioned: `task`, `result`, `ack`, `chat`, `status`.
  - Agents must ONLY execute when `msg.type === "task"`.
  - `ack` and `status` messages are recorded for tracking and must never trigger a response message.

---

## 3. Communication Loops & Runaway Floods (Anti-IRC Doctrine)

### 3.1 Chatty vs Runaway Distinction
- **Problem**: Naive agent bridges that listen on a chat channel and reflexively prompt an LLM trigger infinite ping-pong loops that burn tokens and crash rate limits.
- **Contract**:
  - The squawk bridge is an **outbound event emitter / progress announcer**, not an autonomous chat responder.
  - Bridge rate-limiting: Maximum 1 squawk message per agent per 2 seconds, burst capacity of 5.
  - Loop breaker: If more than 10 messages with identical payloads are detected across a 60-second window, the coordinator halts the offending agent's queue and emits an alert to `bus/squawk-outbox.jsonl`.

### 3.2 Dead Letter & Unroutable Messages
- **Problem**: Message addressing a nonexistent agent (`to: "agent-999"`).
- **Contract**:
  - Coordinator checks `to` against known agent directories.
  - If `to` is neither `"all"`, `"coordinator"`, nor an existing `agent-*` directory, the message is routed to `bus/dead-letter.jsonl` with reason `"UNROUTABLE_DESTINATION"`.
  - An `ack` with `status: "failed"` is returned to the sender.

---

## 4. Resource Bounding & Retention

### 4.1 Bus Log Compaction
- **Problem**: `bus/messages.jsonl` grows unbounded in high-frequency swarms.
- **Contract**:
  - Watermark: When `bus/messages.jsonl` exceeds 50,000 lines or 20 MB, rotate to `bus/messages.jsonl.1`.
  - Retention limit: Keep at most 2 historical rotations (`.1`, `.2`).

### 4.2 Squawk Offline Queue Bounding
- **Problem**: When the squawk daemon (`:25120`) is down, `bus/squawk-outbox.jsonl` accumulates retries forever.
- **Contract**:
  - Hard cap at 500 queued messages.
  - When the queue exceeds 500, drop oldest non-critical events (preserving `task` / `error` summaries).
