# Thresher gateway runbook

> Deeplinks — what this is: the live runbook for the thresher MCP gateway
> (:25127) on yote: current state, the one-source key rule, per-server fix
> notes, and the restart rule.
> What links here: [docs index](./INDEX.md).
> What this links to: [master connector](../custom-connectors/custom.estate-master/CONNECTOR.md)
> (pending parallel lane), [estate docs index](./INDEX.md).

## Identity

- **thresher** is the :25127 MCP gateway on yote (mcpproxy-go). It replaced
  gatehouse. Daemon pid 1899641 at last check (started 2026-10-27 03:57 MDT),
  launched with `--config=/home/toxic/estate/ranch/thresher/mcp_config.json`.
- Management API (read-only calls, from yote):
  `curl -H "Authorization: Bearer $KEY" http://127.0.0.1:25127/api/v1/status`
  (also `/api/v1/servers`, `/api/v1/tools`). `$KEY` comes from secretsmith
  only — see below. Never print it.

## The one-source key rule (SSOT, Chris 2026-10-27)

- **One source: kryptos secretsmith, service `mcpproxy-api-key`
  (`MCPPROXY_API_KEY` via `thresher-serve.ts`).** That is the only key the
  running daemon trusts.
- The `api_key` field in `/home/toxic/estate/ranch/thresher/mcp_config.json`
  is STALE and 401s (Bearer, `X-API-Key`, and `?apikey=` alike). Do not use
  it, do not "fix" it by minting a new one, do not rotate anything. The fix
  direction is: make the config file's key field point at / be replaced by
  the secretsmith value at deploy time, or drop the field and let
  `thresher-serve.ts` inject it. One source, no second copy.
- Never print, paste, or log any key value. Verify auth by HTTP status only.

## Current state (2026-10-27 ~04:01 MDT)

- **57 servers total: 39 connected, 10 error, 8 intentionally disabled.**
- Enabled-connected is 39/49. The old "55/55" target is stale — do not chase
  it; the server set changed.
- Intentionally disabled (NOT failures): agent-mcp-gateway, ast-grep-nnunley,
  ast-grep-xray, awrawr, huggingface, mise-mcp-server, pd, websearch-skill.
- Gone from the config — do not chase: estate-brain, kleio, kappa-serve
  (all zero entries in the current 57-server config).

## The 10 error servers — fix notes

1. **github** — config command is the doubled path
   `/home/toxic/estate//home/toxic/pens/ranch/barn/thresher/bin/github-mcp.sh`.
   Fix the config command prefix, and fix the launcher's token source: it
   parses `~/.config/gh/hosts.yml` for `oauth_token`, but yote gh auth is
   keyring-based (no `oauth_token` in hosts.yml). Use `gh auth token`
   (verified live on yote as toxicwind). Existing credential, no rotation.
2. **qdrant-mcp** — the `uvx` process dies during sentence-transformers
   model load; :25133 was not listening at check time. Diagnose the model
   load first, then restart qdrant-server; the URL itself is correct.
3. **byte-vision-llamacpp** — wrapper exists, but `~/.config/byte-vision`
   is missing and the :8080 llama backend is down. Recreate the config dir
   and env, restart the backend.
4. **safurrier-filesystem-smart** — `run_server.py` missing under the
   vendored `organized-lattice-v3/adhoc-mcp-servers/mcp-filesystem/` tree.
   Restore the file or prune the entry (prune needs a call — see below).
5. **tpc-thought-ledger** — `mcp-server.js` missing under the same vendored
   tree. Same call: restore or prune.
6. **grasp-hub** — `/home/toxic/estate/grasp-hub/mcp/server.ts` missing.
   Restore or prune.
7. **herd-test** — `/home/toxic/estate/src/mcp/herd.ts` missing. Restore
   or prune.
8. **den** — ferret-den startup fails on missing pd-mcp. Restore pd-mcp
   or prune the dependency.
9. **gibber-crypto** — SSE :25106 connection refused; daemon not
   listening. Restart the gibber daemon, then re-check.
10. **sidechat-shim** — :25199 already in use by the live shim, so
    thresher's spawn collides (Errno 98). Re-point thresher's spawn to a
    free port or drop the entry — never kill the live shim to free the port.

## Prune-vs-repair rule (Chris 2026-10-27: go for green, repair)

- Default is REPAIR: restore the missing file / restart the daemon and
  re-verify via the management API.
- Prune an entry only when the upstream project is gone with no restore
  path — and say so in the commit message. Never silently drop entries.
- After any config edit: commit + push to ranch main (fetch-first),
  restart via pitchfork (below), re-query `/api/v1/servers`, and report
  the new connected/error tally.

## Restart rule

- Restart thresher ONLY through its owned pitchfork path — never kill the
  daemon directly, never restart the whole bridge for a gateway change.
- After restart: wait for the daemon to serve, then verify with
  `/api/v1/status` (200) and `/api/v1/servers` (new tally). A restart that
  is not verified by the API did not happen.

## History

- 2026-10-23 ~22:14 MDT: 46/55 connected, 773 tools (gatehouse-era tally,
  stale). The Oct 23 eight failures are superseded by the 2026-10-27 ten.
- 2026-10-27 ~04:01 MDT: 39/49 enabled-connected; key source reconciled to
  secretsmith SSOT by Chris's order.
