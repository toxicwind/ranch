# Event Transport

**stdout is the bus.** Every actionable line the backplane emits must match
this shape exactly:

```
[CHR|<repo_hash>|<agent_id>|<role>|<run_id>|<cycle>|<step>|L000001] {json}
```

- `repo_hash` — first 10 hex of sha256(repo_root absolute path)
- `agent_id` — first 8 hex of sha256(hostname + uid + pane id)
- `role` — COORD, EXHUMER, CARTOGRAPHER, OPERATOR, SURGEON, SYNTH
- `run_id` — compact UTC timestamp + 6 random hex
- `cycle` — monotonically increasing integer
- `step` — BOOTSTRAP, SNAPSHOT, EXHUME, CARTO, OPERATE, SURGERY, SYNTH, APPLY, PROOF, CHECKPOINT, RECURSE
- `L000001` — line counter, monotonic **per process**

## Rules

- **No truncation.** Large output becomes `OUTPUT_CHUNKS` events.
- **No silent swallowing.** A nonzero return code is an event, not a secret.
- **Anything that does not parse is not an event.** `parseFrame` returns
  `null` for noise rather than guessing.

## Minimum event types

| Type | Payload |
|---|---|
| `cmd` | `{cwd, argv, rc, ms}` |
| `stdout` / `stderr` | chunked (gzip+base64) when large |
| `file_read` / `file_write` | `{path, sha256, mtime, bytes}` |
| `decision` | `{cluster_id, rationale, evidence_refs[]}` |
| `proof` | `{argv, rc, excerpt}` |
| `checkpoint` | `{cycle, changed[], verified[], next}` |

## Why the step is a header field

`step` is transport metadata, not application data. It is passed explicitly
to `frame()` and `EventBus.emit()` rather than inferred from the payload.
An earlier version read it from the JSON body, which meant every event that
forgot to set `step` silently framed as `OPERATE`. The tests
(`test/event-frame.test.ts`) pin the exact output shape so that regression
cannot come back.
