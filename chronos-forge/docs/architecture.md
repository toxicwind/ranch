# Chronos-Forge Architecture

A repo-scoped Mixture-of-Experts (MoE) agent backplane. It runs an endless,
proof-gated loop that mutates exactly one cluster per cycle, under a hard
freshness guarantee, on both Windows and POSIX hosts.

## The one loop

```
BOOTSTRAP → SNAPSHOT → (parallel experts) → SYNTH → APPLY → PROOF → CHECKPOINT → RECURSE
```

It never stops until `state.json.done == true` or a `maxCycles` bound is hit.

## Modules

| Module | Responsibility |
|---|---|
| `event-frame.ts` | Framed stdout transport. Every actionable line is `[CHR\|repo_hash\|agent_id\|role\|run_id\|cycle\|step\|L000001] {json}` |
| `pseudoembedding.ts` | Content-addressable chunks (`pe_<sha256_16>`), referenced as `⟦PE:...⟧`. Pointers, never memory |
| `hashing.ts` | Deterministic identity: `repo_hash`, `agent_id`, `run_id` |
| `state.ts` | Atomic per-repo `state.json` — cycle counter, action log, next pointer |
| `lock.ts` | Cross-platform advisory lock. `flock(2)` on POSIX, marker file on Windows |
| `snapshot.ts` | Freshness guard: sha256+mtime before and immediately before every write |
| `cluster.ts` | Mutation clusters (A/B/C), role specs, SYNTH scoring and winner selection |
| `websift.ts` | Warning-triggered web search → minimal/conservative/refactor fixes |
| `timeout.ts` | Hard 2000ms execution budget so a hung proof cannot freeze a cycle |

## Invariants

1. **Exactly one cluster per cycle.** No "bonus improvements" ride along.
2. **Every mutation is proof-gated.** One proof command, one observed excerpt, one checkpoint append.
3. **Freshness is re-checked at the write boundary**, not planned in advance.
4. **The repo lock is held only to increment the cycle and checkpoint.**
5. **stdout is the transport.** No truncation, no silent swallowing — large output becomes chunks.

## Cross-platform notes

The original design assumed Linux. Two things had to change for Windows:

- `flock(1)` does not exist on Windows. `lock.ts` probes for a real `flock`
  and falls back to an exclusive-create marker file, preserving the same
  exclusive/shared/blocking/timeout semantics.
- Path hashing is case-normalized on Windows only, so the same logical path
  yields one hash on each OS.

## Roles

| Role | Mandate | Edits repo? |
|---|---|---|
| EXHUMER | entropy, brittle constants, hot files | no |
| CARTOGRAPHER | entrypoint graph, config precedence | no |
| OPERATOR | repro commands, runtime snapshot | no |
| SURGEON | competing clusters A/B/C | no |
| SYNTH | scores and routes; picks one winner | no |
| COORD | applies the single winner, runs proof, checkpoints | yes |

Experts never read each other's output before writing their own. The
coordinator waits at most one second for parallelism; late output becomes
next cycle's input rather than a stall.
