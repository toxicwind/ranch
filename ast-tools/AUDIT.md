# AST + newest-tools audit — 2026-10-27 (Raccoon lane)

Boxes: hatch cell + yote (`awrawr-pc`, hostname verified inside every yote exec).
One bridge flap mid-run (retry-safe); all yote results re-verified after it.
Newest versions checked against live release info, not memory.

## Table

| Tool | Box | Observed | Newest (live source) | Verdict | Action |
|---|---|---|---|---|---|
| ast-grep | yote | 0.50.0 → **0.51.0** | 0.51.0 (github.com/ast-grep/ast-grep releases, HTTP 200) | WAS STALE, UPGRADED | Done: `/home/toxic/.local/bin/ast-grep` replaced, backup `ast-grep.bak-0.50.0` kept, `--version` verified 0.51.0 |
| ast-grep | cell | MISSING (`/usr/bin/sg` is a different tool: `sg group`) | 0.51.0 | GAP | Nightly lane: platform-level install (cell PATH has no `~/.local/bin`; `/usr/local/bin` is ephemeral) |
| bun | both | 1.4.4 | bun-v1.4.4 (github.com/oven-sh/bun releases) | CURRENT | None |
| node | both | v24.22.1 | v24.22.1 LTS (nodejs.org dist index; latest overall v26.12.1) | CURRENT on LTS line | None |
| ffs | yote | 0.1.30 | estate-ops at origin HEAD `10a3211` (github.com/toxicwind/barn) | CURRENT | None (estate-internal, no public release channel) |
| hashline | yote | no `--version` flag (CLI: emit/verify/cat/root/head) | estate-ops at origin HEAD `10a3211` | CURRENT | None; version flag is a UX gap, not staleness |
| pitchfork | yote | 2.32.1 (mise install + estate-ops bash-script symlink) | 2.32.3 (mise registry) | STALE — service, do not touch live | Nightly lane: `mise install pitchfork@2.32.3`, verify `pitchfork --version` = 2.32.3 and daemon list intact before/after |
| gatehouse proxy (thresher/mcpproxy-go :25127) | yote | status ok; 67 registered servers, 8 disabled | n/a (proxy version not exposed via API/CLI) | SERVICE | Nightly lane: pin/expose a real proxy version; per-server versions are not exposed by the registry API |
| thresher server count | yote | config 67 = registered 67 | — | COUNTED | Live status tally ~04:0x: 39 connected / 10 error / 8 disabled (57 reported; 10 enabled unaccounted — open question for nightly lane). Repair itself is the parent's go-for-green lane; not duplicated here |
| herd router :25100 | yote | /health 200, /v1/models 200; /api/version = `{"version":"0","commit":"abcd1234"}` | n/a (placeholder) | UNVERSIONED — service | Nightly lane: bake a real version/commit into the router build so staleness is checkable |
| model-guard :25101, keypool :25109, hodos :25193 | yote | all LISTEN | — | UP | None |
| sovereign :25104 | yote | NOT listening | — | DARK (known state) | None (matches standing state, not a new finding) |

## Disabled servers (gatehouse, 8)

agent-mcp-gateway, ast-grep-nnunley, ast-grep-xray, awrawr, huggingface,
mise-mcp-server, pd, websearch-skill (also quarantined). Not failures.

## Upgraded this run

- ast-grep on yote: 0.50.0 → 0.51.0 (official `app-x86_64-unknown-linux-gnu.zip`,
  version verified pre- and post-install). No running service touched.

## Handed to nightly/canary lane (services, not touched live)

1. pitchfork 2.32.1 → 2.32.3: `mise install pitchfork@2.32.3`; verify
   `pitchfork --version` and full daemon list before/after.
2. Cell ast-grep install (platform-level, not a cell-local binary drop).
3. Herd router real version string; gatehouse proxy version exposure.
4. Thresher status-API gap: 67 registered vs 57 status-reported.
