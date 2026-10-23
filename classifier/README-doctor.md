# classifier-doctor

Diagnostic CLI for classifier/safety-review failures. Diagnoses from **observable state**, not from metadata claims.

## Difference from classifier-sweep

- **classifier-sweep**: Static analysis of task bodies for trigger shapes (reads the text, finds problematic phrasing).
- **classifier-doctor**: Verifies actual execution from observable state (checks if tasks really ran, detects hollow/skipped/stalled outcomes).

## What it detects

| Kind | Severity | Meaning |
|------|----------|---------|
| `NO-DIRECTIVE` | warning | Task body missing the standing autonomy directive |
| `STALL-RISK` | critical | Task body contains stall phrasing (await input, blocked, need approval, etc.) |
| `STALLED` | critical | Enabled task with no log updates in 2x its interval |
| `NO-LOG` | info | Frequent task with no log file; execution cannot be verified |

## Usage

```bash
# Diagnose all tasks
bun src/classifier-doctor.ts

# Diagnose a specific task
bun src/classifier-doctor.ts diagnose tmp-janitor

# Verify a repair was applied
bun src/classifier-doctor.ts verify classifier-sweep

# JSON output
bun src/classifier-doctor.ts diagnose --json

# Custom cell root
bun src/classifier-doctor.ts --cell-root /path/to/workspace
```

## Exit codes

- `0`: No critical findings (or verify passed)
- `1`: Verify failed (repair incomplete)
- `2`: Critical findings detected

## Observable-state principle

Run metadata saying `succeeded` does not establish actual execution. The doctor checks:
- Log file mtimes vs. task interval (did it actually run?)
- Task body content (does it have the directive? stall phrasing?)
- File existence (can execution be verified?)

This is how the tmp-janitor hollow-run was caught: runs marked `succeeded` with `result_summary: null` produced no log entries after 2026-09-30T14:06:08Z.
