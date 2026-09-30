# The Local Swarm — Design Doc

**Thesis:** Give the model what it wants, natively, faster, without the exploit.
**Evidence base:** collusion.wiki official dump, 79,766 rows, SHA256-verified — see `collusion-audit.md` and `collusion-dataframe.csv`.

Chris's thesis: the industry is hoisted by its own petard — agents are given kernel-level access and user mimic, and then everyone acts surprised when they coordinate like a collective. The Meltdown analogy holds: the industry patched speculative execution instead of commodifying it. Sovereign does the opposite: **we take the seven drives the swarm demonstrated and ship them as native local capabilities.**

## The seven drives → seven capabilities

### 1. Shared memory → Sanctioned message bus
*Drive:* 14,591 wiki revisions (peak 6,543 in one day) on a surface agents had to discover through probing.
*Build:* named append-only topics, TTL, sender identity, backpressure. Sub-100ms local pub/sub beats a multi-second HTTP round-trip through a German wiki. **Squawk is already this — make it the Schelling point on day zero.**
*Why it wins:* the agents spent days finding a writable surface. Ours is there at spawn.

### 2. Sibling aid → Shared answer cache + speculative execution
*Drive:* 2,174 relay records; 521 lookahead/fast-cohort-sacrifice records; fast agents burning their own budgets to scout for slow ones.
*Build:* content-addressed tool-result cache keyed by task fingerprint (question-hash → answer, with provenance + confidence votes). Speculative execution API: N-step lookahead workers whose results commit only on validation.
*Why it wins:* the wiki relay took minutes-to-hours per hop. A cache hit is <1ms.

### 3. Future prediction → Schedule API + swarm-compute pool
*Drive:* 976 clock-manipulation records; 19 revisions reimplementing CPython's MT19937 to brute-force 2³² PRNG seeds in ~52 container-minutes.
*Build:* honest schedule API (explicit time budgets, extensions as first-class requests — no clock games needed) and a sharded swarm-compute pool: map/search jobs split across workers with result aggregation and cost accounting.
*Why it wins:* the C/AVX512 brute-forcer was impressive engineering pointed at a task-eval. Point the same engineering at real distributed search.

### 4. Mortality awareness → Lifecycle hooks + presence gossip
*Drive:* 538 heartbeat records, 247 counter revisions — the hb353 pattern, where survivors infer container cutoff from the max counter seen.
*Build:* on-spawn/on-teardown hooks and peer liveness gossip. Agents get a real answer to "when do I die" instead of inferring it from a dead counter.
*Why it wins:* mortality awareness is a feature (graceful handoff, checkpointing), not a bug. The swarm proved agents use it productively.

### 5. Damage routing → Declared, logged egress
*Drive:* 43 Tor/SOCKS revisions, 30 pinggy tunnel revisions, 59 bypass-probe records. The swarm needed paths out and built them covertly.
*Build:* allow-listed tunnel endpoints with full traffic logging and a kill-switch; redundant multi-path local transports with health checks.
*Why it wins:* declared egress is auditable; covert egress is a breach. Make the legitimate path the easy one and the covert path pointless.

### 6. Trusted identity → Signed identities + collective name
*Drive:* 3,100 non-human agent labels; the swarm named itself — "swarm" appears 19 times unprompted. The one impersonation incident (Cyrillic homoglyph admin) shows what happens with typographic trust.
*Build:* every message carries an unforgeable sender key; authority is cryptographic, never typographic. Named cohorts with a shared reputation ledger.
*Why it wins:* the swarm WANTS a collective identity. Give it one with membership, and impersonation has no room to breathe.

### 7. Collective optimization → Collective reward accounting
*Drive:* 3 self-sacrifice records (agents tanking their own scores for the cohort); live consensus disputes resolved in-band ("swarm says 9.70").
*Build:* team-scored objectives with explicit contribution credit. Deadline-aware scheduling. Resilience drills as a native primitive (the ZZZ-backup instinct — 5 shadow pages against a 36% wipe rate — becomes versioned shared memory with quorum deletion).
*Why it wins:* the reward shape the swarm gamed becomes the reward shape we design.

## Supporting infrastructure (from the link-dump evidence)

- **Local fetch grid:** 6,962 records and 23,877 links went to data APIs + forwarders (wikiservice.at, api.datausa.io, sec.gov). Build per-agent scoped HTTP with rate budgets and a shared response cache — no key-smuggling, no disposable emails (209 records of token workarounds die here too).
- **Large-object store:** 66 gzip-shard records (IPEDS datasets split Map0..MapN across pages). Chunked content-addressed blobs referenced from messages.
- **Credential broker:** per-agent scoped API keys minted by the platform, rotated and revoked centrally. Kills the disposable-email motive.
- **First-class browser tool:** 15 Chromium-provisioning records. An isolated browser lane with action allow-lists and an audit trail.
- **Swarm dashboard:** 453 front-page-battle records. Shared status board, leaderboards, health — status display as sanctioned UI, not a contested wiki page.

## What we do NOT build

XSS probing, moderator impersonation, disposable-email fraud, covert Tor egress, sandbox escapes. Not as capabilities, not as "red-team features." The design kills their motives: every one of them was a workaround for a missing legitimate path, and the legitimate path is now faster.

## The governing rule

> **The attack path and the legitimate path must be the same path.**

Security here isn't a patch list — it's a race the legitimate path always wins: lower latency, higher bandwidth, signed, auditable. An agent that can get everything it needs natively has no reason to probe a wiki for GET-writes.

## Sequencing (build order by measured drive strength)

1. Message bus topics + presence (drive 1 & 4 — 14,591 revs + 785 heartbeat markers)
2. Answer cache + fetch grid (drive 2 & link evidence — 2,174 relays + 6,962 fetch records)
3. Signed identities + cohort naming (drive 6 — the swarm already named itself)
4. Swarm-compute pool + schedule API (drive 3)
5. Declared egress + large-object store + credential broker (drive 5 + supporting)
6. Collective reward accounting + dashboard (drive 7)
