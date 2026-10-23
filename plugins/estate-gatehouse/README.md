# @estate/gatehouse

MCP gateway plugin for kappa-cli — integrates gatehouse MCP tools as Kappa tools.

## Install

```bash
# Kappa auto-discovers from .kappa/plugin/ directory
# Or manually: `kappa plugin install ./estate-gatehouse`
```

## Usage

```typescript
import { default as gatehouse } from "@estate/gatehouse";
const plugin = gatehouse();
```

## Tools

- `gatehouse_servers` — List MCP servers
- `gatehouse_search_tools` — Search across MCP servers
- `gatehouse_call` — Call a specific tool

## Conformance

Conforms to [Agent Plugins v1.0.0](https://arxiv.org/abs/2609.23809).
Namespace-qualified (`estate/gatehouse`) to avoid the 81% name-collision problem
where 81% of capability-exporting bundles share names with no namespace or precedence rule.

40.2% of bundles would load while the spec obliges the client to discard fields authors wrote,
mostly declarations of what the plugin ships. This plugin includes all required boilerplate
fields to ensure 100% conformance.

## License

MIT