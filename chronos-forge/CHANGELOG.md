# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-15

Initial working implementation. Ported from a Linux-only design to run on both
POSIX and Windows.

### Added

- **Event transport** (`event-frame.ts`) — framed stdout lines in the exact
  `[CHR|repo_hash|agent_id|role|run_id|cycle|step|L000001] {json}` shape, with a
  monotonic per-process line counter and a strict parser that returns `null`
  for noise instead of guessing.
- **Pseudoembeddings** (`pseudoembedding.ts`) — content-addressable chunks
  (`pe_<sha256_16>`) with gzip+base64 encoding, idempotent stores, integrity
  verification on retrieval, and loud dangling-pointer errors.
- **Identity derivation** (`hashing.ts`) — deterministic `repo_hash`,
  `agent_id`, `run_id`; Windows path case-normalization so one logical path
  yields one hash per OS.
- **State** (`state.ts`) — atomic `state.json` via temp-file + rename, so a
  crash never leaves a torn state. Cycle counter, action log, next pointer.
- **Cross-platform lock** (`lock.ts`) — probes for real `flock(1)` and uses it
  on POSIX; falls back to an exclusive-create marker file on Windows.
  Exclusive/shared, blocking, non-blocking, and bounded-wait all supported.
- **Freshness guard** (`snapshot.ts`) — sha256+mtime recorded before a write
  and re-checked immediately before it; drift aborts the cycle rather than
  clobbering concurrent edits.
- **Clusters and roles** (`cluster.ts`) — A/B/C mutation clusters, role specs,
  SYNTH scoring by proofability/locality/non-regression, and winner selection
  that breaks ties toward the smaller blast radius.
- **WebSIFT** (`websift.ts`) — warning-triggered diagnostic pivot producing
  minimal/conservative/refactor fix hypotheses, with undated sources counted
  and flagged rather than silently trusted.
- **Execution budget** (`timeout.ts`) — hard 2000ms ceiling per side-effecting
  call so a hung proof command cannot freeze the endless loop.
- **The loop** (`cycle.ts`) — BOOTSTRAP → SNAPSHOT → experts → SYNTH → APPLY →
  PROOF → CHECKPOINT → RECURSE, enforcing one cluster per cycle and the
  mandatory proof gate.

### Fixed

- `frame()` previously inferred the transport `step` from the JSON payload,
  so any event that omitted it silently framed as `OPERATE`. `step` is now an
  explicit parameter to `frame()` and `EventBus.emit()`.
- `retrieveChunk()` leaked raw zlib errors (`incorrect header check`) on a
  tampered payload. It now reports a stable `chunk integrity failure`.
- `require('node:child_process')` inside ESM modules, which throws at runtime.
  Replaced with top-level imports.

### Notes

- 23 tests pass on Node 22 (Windows) and Node 24 (Linux).
- The expert panel runs sequentially while preserving the structural
  independence rule (experts never read each other's output). True concurrent
  dispatch is tracked in the roadmap.

[0.1.0]: https://github.com/toxicwind/ranch/commits/main/chronos-forge
