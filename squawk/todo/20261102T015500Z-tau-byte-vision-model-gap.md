---
title: "byte-vision-llamacpp MCP down — ModelPath missing"
author: tau-maximal-audit
status: DONE (by daemon, 2026-11-02T01:57:50.254Z)
unique-id: 20261102T015500Z-tau-byte-vision-model-gap
urgency: normal
---

# byte-vision-llamacpp MCP down — ModelPath missing

**Source:** Phase 1.5 OSINT of all estate MCP servers (gateway :25127 live inventory, 2026-11-02).

## Evidence

- Gateway reports `last_error: "failed to connect: MCP initialize failed during no-auth strategy: transport error: unexpected content t…"`
- `/home/toxic/.config/byte-vision/byte-vision-cfg.env` sets `ModelPath=/home/toxic/models/qwen3.5-9b-Q5_K_M.gguf`
- `/home/toxic/models/` **does not exist** — no GGUF available locally
- Binary is a renamed `feedlot-mcp` (module `feedlot-mcp (devel)`); loads `feedlot-cfg.env` relative to cwd (logs a warning when absent, but ModelPath is the fatal initialize failure)

## Root cause

The vision MCP's llama.cpp backend cannot start: its configured model has never existed on this box. Gateway marks the server `error` after transport init fails.

## Fix (blocked on a model-side decision)

Choose one:
1. **Acquire a GGUF** (e.g. qwen3.5-9b-Q5_K_M ~6GB) → needs explicit architect approval (external download) → then update `ModelPath` + gateway restart.
2. **Disable the server** (`enabled: false`) if the vision lane is not in use → keeps gateway clean.
3. **Repoint to an existing model** if one is placed in `~/models/` later.

Until decided: server stays `error`, harmless (enabled but non-connecting; no traffic loss otherwise).

## Sibling fix (landed 2026-11-02)

`markitdown` stdio MCP pinned `--python 3.12` (was Python 3.15 → magika/onnxruntime ABI conflict; verified resolution + exit=0). Thresher commit `364366e`.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T01:57:50.254Z
