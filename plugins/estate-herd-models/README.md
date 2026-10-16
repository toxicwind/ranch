# @estate/herd-models

Herd model catalog plugin for kilo-code — exposes local LLM models as Kilo model providers.

## Install

```bash
# Kilo auto-discovers from .kilo/plugin/ directory
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