<div align="center">

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![ranch](https://img.shields.io/badge/ranch-pylae-black?style=for-the-badge)](https://github.com/toxicwind/ranch)

</div>

# 🚪 pylae (πύλαι)

**The gates — a free AI gateway.** One endpoint that fronts 370+ providers
(150+ free) with auto-fallback. Claude Code, Codex, Cursor, Cline, Copilot &
Antigravity into FREE Claude / GPT / Gemini. RTK + Caveman stacked compression
saves 15–95% tokens (~89% avg). Never hit limits.

## What's here

- **`@omniroute`** npm packages — the opencode plugin, plugin-v2, provider
  (the gateway's integrations).
- **`open-sse`**, **`src`** — the gateway routing core.
- **`mcp-server.mjs`**, **`omniroute.mjs`** — runtime entries.
- Multi-container deploys (`docker-compose.*.yml`), self-host + ollama-local.

## Quick start

```bash
bun install          # install deps
./bin/omniroute.mjs  # run the gateway
# point your tool at http://localhost:<port> — it fronts the free providers
```

## The gates

pylae routes each request through the provider pool, falls back on failure,
and compresses with RTK/Caveman stacking — you pay for nothing and hit no
limits. It's the free-door to the fleet's inference.

## License & security

MIT — provider keys come from the box, never the repo.