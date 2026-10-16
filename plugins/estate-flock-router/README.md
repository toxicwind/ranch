# @estate/flock-router

Flock provider routing plugin for kilo-code — queries strategy weights, health, and routing decisions.

## Install

```bash
# Kilo auto-discovers from .kilo/plugin/ directory
```

## Usage

```typescript
import { default as flockRouter } from "@estate/flock-router";
const plugin = flockRouter();
```

## Tools

- `flock_status` — Get flock status: providers, health, weights
- `flock_strategies` — List available routing strategies
- `flock_route` — Get routing decision for a model

## Conformance

Conforms to Agent Plugins v1.0.0. Namespace-qualified to avoid 81% name-collision problem
(from arXiv 2609.23809: "81% of capability-exporting bundles share a name with another plugin,
with no namespace or precedence rule to decide which one answers").

## License

MIT