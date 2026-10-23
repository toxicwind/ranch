# @estate/herd-models

Herd model catalog plugin for kappa-code — exposes local LLM models as Kappa model providers.

## Install

```bash
# Kappa auto-discovers from .kappa/plugin/ directory
```

## Usage

```typescript
import { default as herdModels } from "@estate/herd-models";
const plugin = herdModels();
```

## Tools

- `herd_list` — List all models served by herd
- `herd_chat` — Send a completion request to a herd model

## Conformance

Conforms to Agent Plugins v1.0.0.

## License

MIT