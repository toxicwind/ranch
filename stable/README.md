# stable

The estate's browser project. One persistent headed Chromium for the whole
mesh, driven through MCP — no ephemeral browser sessions, logins and tabs
survive across tasks.

## Layout

- `keeper/` — the whole thing: the keeper daemon (`keeper.cjs`, headed
  Chromium on CDP `127.0.0.1:9223`) plus the keeper-first MCP server
  (`src/` → `dist/`, eleven `persistent_*` tools). Full-grade package:
  `package.json` (`browser-keeper` 1.3.0), `README.md`, `LICENSE`,
  `.gitignore`, `smoke/keeper-smoke.mjs`. Start here.
- `server/` — headed audit scripts (separate from the keeper/MCP).
- `mcp.sh` — stdio launcher for the MCP server (manual use; Gatehouse
  spawns it in production).
- `moon.yml` — monorepo build/lint tasks.
- `bench/`, `quickshell/`, `ref/`, `test/` — benchmarks, quickshell bar
  button, reference material, tests.

## How the keeper runs

Pitchfork-supervised as `estate/browser-keeper`:

```bash
cd /home/toxic/estate && ./bin/pitchfork-restart estate/browser-keeper --cold
```

Needs `estate/agent-display` (Xvnc :99) up first. Ready when
`curl -sf http://127.0.0.1:9223/json/version` answers (Chrome 148).

## How it registers in Gatehouse

Gatehouse (`estate/gatehouse`, `127.0.0.1:25127`) spawns
`keeper/dist/index.js` per the `browserless` entry in
`/home/toxic/estate/ranch/barn/gatehouse/mcp_config.json` (live) and
`mcp_config.json.dist` (durable template — entry must be in BOTH).

**Quirk:** Gatehouse silently drops entries carrying an `env` field — the
entry must have NO `env` key. The server defaults to CDP `127.0.0.1:9223`.

Verify:

```bash
~/workspace/bin/gatehouse servers | grep browserless
~/workspace/bin/gatehouse call browserless:persistent_status '{}'
```

## History

Moved from `barn/browserless/` 2026-10-12 (Chris: browser work belongs in
its own project, barn stays untouched). Git history preserved via `git mv`.
