# Shepherd Truth v2 — report + outage delta (2026-10-23 ~21:20 MDT, yote live)
Script: shepherd_truth_v2.py (sha 0d548ad5), fixes v1 flock-pattern over-match
(matched `(^|\s|/)flock([-\s]|$)` — flock entry now absent from pitchfork, no ghost).

## Baseline v1 (2026-10-19 15:30 MDT) → v2 (2026-10-23 21:20 MDT)

- **6/6 bidders VERIFIED-LIVE** — unchanged, all `bidder.py --id <name>` alive.
- **oracle-market: TRACKING-LOSS → VERIFIED-LIVE** (pitchfork now "running",
  process alive). The v1 tracking-loss is healed — consistent with Finch's
  pitchfork-binding-sentinel (ranch da22aa0, estate 36858fd).
- **hodos :25193 — TRACKING-LOSS (pitchfork says stopped, process LIVE).**
  Real hodos binary (pid 383414, /home/toxic/pens/olympus/products/hodos/proxy,
  relaunched 06:10 via serve.sh), health 200. Port memory holds: 25193 = hodos,
  KEEP. Pitchfork record is stale — shepherd flags, does not touch.
- **:25127 reassigned — gatehouse → thresher (INTENTIONAL).** estate/gatehouse
  stopped, no gatehouse process; estate/thresher RUNNING and serving 25127
  per its own config (`--listen=127.0.0.1:25127`). Not a squat. Review item:
  confirm gatehouse MCP proxy retirement intended (42 servers, was canonical
  MCP path); if not, relaunch gatehouse on a new port rather than fighting
  thresher. `gatehouse-upstream` (a separate binary) runs on :25128.
- **herd: running → ERRORED (pitchfork), process GONE, :25100 FREE.**
  llama-swap is not listening anywhere. De-herd closure state: nothing
  references herd anymore — T3 will confirm via ffs sweep, then herd can be
  retired from pitchfork config deliberately (not emergency).
- **squawk-ws :25147 VERIFIED-LIVE** (bun pid 2823024, 200, seq advancing).
- **cuttinggate :25200 ok, keypool :25109 ok** — chain cuttinggate→hodos→vans intact.
- **errored in pitchfork now:** beellama-fast, herd, ml-serve, search-api,
  toolcall-llm, yote — post-outage churn, each needs classification (v3).
- **New executor gap (from Finch 2026-10-23):** `~/.local/bin/super-ralph`
  missing — 75 fallback executions died. bidder.py RALPH_BIN lane broken;
  rebuild belongs to the super-ralph lane, tracked for T2 matrix.

Raw v2 output: TRUTH-REPORT-v2.txt (this directory).
