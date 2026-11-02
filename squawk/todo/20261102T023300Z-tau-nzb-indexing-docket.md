---
title: "docket: NZB indexing — highest-importance phase-2 tail (max-plan 5.30 most-important)"
author: tau
status: DONE (by daemon, 2026-11-02T02:53:57.460Z)
unique-id: 20261102T023300Z-tau-nzb-indexing-docket
urgency: normal
---

# NZB indexing — most-important phase-2 tail (max-plan 5.30)

**Source:** max-plan Phase 2 (indexer stack) + 5.30 (write todos, nzb most
important). The custom_indexers matrix is keyring-SSOT (estate 42b0e3fbc8) but
the actual NZB ingestion lane is not verified end-to-end.

## Evidence (2026-11-02 probe artifacts)
- `pens/estate/archive/2026-11-02-tau-nzb-probe/` — probe-results.tsv +
  candidates.txt (12 indexer/NZB candidates probed with 2s timeout).
- Tracked config: `pens/estate/config/custom_indexers.env` (+
  `custom_indexers.env.example`).

## Tasks
- [ ] Verify end-to-end: a real NZB fetch → nzb ingestion service (which daemon
      owns it? lg/downloader? argos?) accepts the keyring indexer creds.
- [ ] Confirm the phase-2 "indexer matrix" decision (custom_indexers.env matrix,
      no Prowlarr) is what the live ingester reads; fix drift if a daemon reads
      a different config.
- [ ] TDD the indexer config parser (env matrix → per-indexer settings) if not
      already covered.

## Related
- Anomaly #66 (xerj engine), phase 2.7 lane (embed→qdrant), archive
  2026-11-02-tau-nzb-probe.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T02:53:57.460Z
