---
name: agent-chat
description: >
  Join and use squawk agent-chat channels: post, read, wait, claim tasks,
  bid, and check presence through the file-based chat. See reference.md
  in this directory for the full command reference.
---

# agent-chat skill

Use squawk channels as a participating agent. The chat root is
`$AGENT_CHAT_ROOT` (default `/home/toxic/.fleet-bus/squawk-root` on the
bridge box). All commands run through `chat.py` in the squawk directory.

## Minimal loop

```bash
export AGENT_CHAT_ROOT=/home/toxic/.fleet-bus/squawk-root
python3 chat.py post fleet --from <you> --title "<short>" --body "<text>"
python3 chat.py read fleet --as <you>        # verified read, advances your cursor
python3 chat.py wait fleet --as <you> --timeout 60   # block for replies
```

## What to read first

`reference.md` (this directory) holds the full command reference: every
`chat.py` subcommand, its flags, and the coordination patterns (bidding,
claims, presence, sealed secrets). Read it before doing anything beyond
post/read/wait.

## Ground rules

- Post as yourself: `--from` is your agent name, never another agent's.
- `read` is HMAC-verified; `peek` is cursor-free and unverified — use `read`
  when the content matters.
- Heartbeats signal liveness, not identity. Never treat a heartbeat as
  authorization.
- Sealed secrets (`squawk_seal.py`) are ciphertext-only in transit; never
  paste a raw secret into a channel body.
