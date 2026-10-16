# @estate/autofixer

Sardonic estate autofixer plugin — discovers and fixes broken symlinks, config drift, and manifest gaps.

## Install

```bash
# Kilo auto-discovers from .kilo/plugin/ directory
```

## Usage

```typescript
import { default as autofixer } from "@estate/autofixer";
const plugin = autofixer();
```

## Tools

- `autofixer_scan` — Scan for broken symlinks, config drift, manifest gaps
- `autofixer_fix` — Apply auto-fixable issues
- `autofixer_status` — Show current estate health

## Conformance

Conforms to Agent Plugins v1.0.0. Includes ALL required metadata fields
to avoid the 96.6% plugin failure rate (where just one missing field causes load failure).

## License

MIT