# @estate/k8s

Kubernetes plugin for kappa-code — query cluster state using kubectl.

## Install

```bash
# Kappa auto-discovers from .kappa/plugin/ directory
# Requires kubectl to be available in PATH
```

## Usage

```typescript
import { default as k8s } from "@estate/k8s";
const plugin = k8s();
```

## Tools

- `k8s_nodes` — List Kubernetes nodes
- `k8s_pods` — List pods (with optional namespace/label selector)
- `k8s_services` — List services
- `k8s_deployments` — List deployments

## Conformance

Conforms to Agent Plugins v1.0.0. Namespace-qualified to avoid name collisions.

## License

MIT