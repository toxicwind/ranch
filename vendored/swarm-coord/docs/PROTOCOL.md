# Swarm Coordination Protocol (`swarm-coord`)

> File-based durable mailbox protocol for multi-agent swarm coordination.

## 1. Message Envelope

Every message is an append-only JSONL line:

```json
{
  "from": "agent-1",
  "to": "agent-2",
  "type": "task",
  "id": "msg-m3ab1z-x9f2a1",
  "payload": { "op": "upper", "text": "hello" },
  "ts": "2026-10-28T05:30:00.000Z",
  "kind": "chat"
}
```

| Field | Type | Description |
|---|---|---|
| `from` | `string` | Sending agent identifier (`agent-1`, `agent-2`, `agent-3`, `coordinator`, `system`) |
| `to` | `string` | Target agent ID or `"all"` for broadcast |
| `type` | `MessageType` | Protocol verb: `init`, `join`, `task`, `result`, `ack`, `error`, `chat`, `heartbeat` |
| `id` | `string` | Globally unique message ID (`prefix-timestamp-random`) |
| `payload` | `unknown` | Arbitrary JSON payload |
| `ts` | `string` | ISO8601 UTC timestamp |
| `kind` | `string?` | Optional tag (e.g. `"chat"`) for squawk integration |

## 2. Delivery Mechanics

- **Outbox -> Bus**: Agents write to their local `agent-X/outbox.jsonl`. The coordinator reads outboxes and appends to `bus/messages.jsonl`.
- **Bus -> Inbox**: The coordinator fans out from the bus to matching `agent-Y/inbox.jsonl` (or all inboxes if `to === "all"`).
- **Outbox / Inbox Pruning**: Processed messages are cleared via atomic temp-and-rename writes.

## 3. Idempotency & Acks

- **Seen IDs Cache**: The coordinator loads seen message IDs from `bus/messages.jsonl` on boot. Any duplicate message ID is skipped and rejected.
- **Task Acknowledgment**: When an agent completes a `task`, it emits both a `result` message and an `ack` message referencing the task ID.
