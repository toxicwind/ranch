# estate-master — master estate connector

One CLI for the six estate routes. Routes, not credentials: keys stay in
their approved stores and never enter files, logs, or chat.

## Quick start

```bash
python3 ~/workspace/custom-connectors/custom.estate-master/bin/estate-master.py <command>
bash    ~/workspace/custom-connectors/custom.estate-master/bin/self-test.sh
```

## Tooling

- `bin/estate-master.py` — the unified CLI (all six routes).
- `bin/estate-thresher-status.sh` — yote-side thresher probe (deployed to
  `/home/toxic/.local/bin/estate-thresher-status` on yote; prints HTTP
  codes + counts only, never the key).
- `bin/self-test.sh` — proves each route, PASS/FAIL per route.

## Auth — one source, secretsmith SSOT

The thresher management API key lives in secretsmith under label
`THRESHER_API_KEY` (`service=thresher-api-key`). That entry holds the
same value as the `api_key` field in the thresher config file; the
helper reads secretsmith only and never reads the file.

Do NOT confuse this with `MCPPROXY_API_KEY` (`service=mcpproxy-api-key`):
that entry feeds MCP plugin provider keys via `thresher-serve.ts` and is
NOT the management API key (it 401s against `:25127`). The distinction
was proven live 2026-10-27: file-field value → 200, MCPPROXY value → 401.

No other route needs a credential: yote-conn, squawk, gatehouse,
oracle, and pitchfork all ride existing estate auth.

Hard rules: never mint/rotate credentials; never print, log, or persist
credential values; never `--reset`; never modify hatch client
safeguards; never bypass stop/pause/audit.

## Routes

### (a) yote-conn exec — cell → yote bridge

- Purpose: run a command on yote (the heavy tool host).
- Command: `estate-master.py yote <cmd...>`
- Expected output: the command's stdout, with the hostname gate
  verified first (`HOST:awrawr-pc`).
- Failure mode: bridge flap (`connector down`, remote end closed).
  Forward fix: retry — the CLI retries up to 3 attempts per call, and
  a single flap failure proves nothing. Three consecutive failures is
  reported as a flap, not a verdict. If the hostname is anything other
  than `awrawr-pc`, the CLI refuses (a fallback host would serve stale
  state).
- Proven: 2026-10-27 — first exec failed with a flap, immediate retry
  returned `awrawr-pc`.

### (b) thresher management API — gateway health on :25127

- Purpose: gateway server inventory and error list.
- Commands:
  - `estate-master.py thresher-status` → HTTP codes + totals.
  - `estate-master.py thresher-servers --errors-only` → error names.
- Expected output: `status_http=200 servers_http=200`,
  `servers_total=N servers_error=M servers_disabled=K`, plus the
  API's own stats line.
- Failure modes:
  - 401 → the SSOT entry does not match the daemon's key. Forward fix:
    re-verify the entry (round-trip hash check, never print values);
    do NOT fall back to the file field or to `MCPPROXY_API_KEY`.
  - 400 with a bare body → malformed auth header (usually a
    multi-line secretsmith capture). Forward fix: extract only the
    first `secret: <value>` line, mirroring `thresher-serve.ts`.
  - 0 servers parsed → response shape changed. Forward fix: re-inspect
    the shape (currently `{success, data: {servers: [...], stats: {}}}`).
- Proven: 2026-10-27 — 200/200, 67 servers, 10–11 error (one server
  flaps between runs), 8 disabled, ~774–780 tools.

### (c) squawk fleet read/post — the fleet channel

- Purpose: read the fleet log, post fleet messages.
- Commands:
  - `estate-master.py squawk-read [--n N] [--channel CH]`
  - `estate-master.py squawk-send <channel> <text>`
- Expected output: read prints recent messages; send prints
  `published <file>`.
- Failure mode / quirk: `squawk read` can return empty while a just-sent
  message exists on disk (read-lane/cache behavior). Forward fix: the
  send is proven by the message file under
  `/home/toxic/.fleet-bus/squawk-root/<channel>/`; for live reads use
  `squawk watch fleet --follow`, never poll `read` in a loop.
- Proven: 2026-10-27 — send published `125-ember-msg.md`, verified as
  a file in the fleet channel dir on yote.

### (d) gatehouse MCP tool discovery

- Purpose: discover and call Gatehouse-registered MCP tools.
- Commands:
  - `estate-master.py gatehouse-status` → `{"status":"ok"}`
  - `estate-master.py gatehouse-tools <query>` → `server:tool | blurb`
- Failure mode: the gatehouse CLI shells to the yote client and can hit
  the CLI's own 120s ceiling when the bridge is slow. Forward fix:
  retry — a later identical query succeeded in under 2s.
- Proven: 2026-10-27 — status ok; tools query returned results.

### (e) oracle intake posting — the market route

- Purpose: post work to the oracle market (intake → triage → bid →
  execute → verify → settle). The only command a coordinator needs.
- Command: `estate-master.py oracle-intake --from <name> --text "<work>"`
- Expected output: `posted <file>` (the intake file name).
- Failure mode: intake accepted but never triaged (oracle down or
  ledger stalled). Forward fix: check the ledger at
  `/home/toxic/estate/ranch/squawk/oracle/ledger/ledger.jsonl` for the
  `intake_decision` event; do not re-post (a duplicate intake double-
  spends bidder work).
- Proven: 2026-10-27 — intake posted
  (`6893-estate-master-selftest-intake-1793124327.md` and the
  self-test intake).

### (f) pitchfork service status — daemon inventory on yote

- Purpose: list estate services and their states.
- Command: `estate-master.py pitchfork [--filter SUBSTR]`
- Expected output: `estate/<name>  running|errored ...` lines.
- Failure mode: runs through route (a), so flap rules apply. A service
  showing `errored` is a state to report, not a connector failure.
- Proven: 2026-10-27 — full list returned; `estate/shim-drift-watch`
  running.

## Failure doctrine (applies to every route)

Error strings are claims, not facts. Before reporting a failure, check
it against observable state (ps, ss, curl, logs, what the tool really
returned). A transient failure is retried once against new evidence;
an auth failure is a question about the request before it is a question
about the key. Nothing here works around a safeguard: stop/pause/audit
requests are hard stops, and the hatch client is never modified.

## Related docs (deeplinks)

- Standing doctrine: [SOUL.md](../../../SOUL.md) · [IDENTITY.md](../../../IDENTITY.md) · [MEMORY.md](../../../MEMORY.md)
- Thresher runbook: the thresher repair state lives in the lane
  checkpoint at [estate-master-connector](../../estate-master-connector/DESIGN.md)
  (design notes + test output) and in the thresher repo on yote
  (`/home/toxic/estate/ranch/thresher/`).
- PR-review skill: [local-pr-review](../../custom-skills/local-pr-review/SKILL.md)
- Connector pattern: [custom_connector_setup](/opt/muse/skills/custom-connector-setup/SKILL.md)
- Oracle market: [local-oracle-route](../../custom-skills/local-oracle-route/SKILL.md)
- Gatehouse: [local-gatehouse](../../custom-skills/local-gatehouse/SKILL.md)
- Workspace house rules: [workspace AGENTS.md](../../AGENTS.md)

## Untested / known limits

- `squawk read` empty-result quirk (see route (c)); the send route is
  the proven half, the read CLI runs but can serve an empty window.
- Oracle triage/settlement downstream of posting is not asserted by
  the self-test (posting is the connector's route; settlement is the
  market's job).
- Thresher error-server membership flaps run to run (one server flipped
  between two consecutive probes); counts are a snapshot, not a verdict.
