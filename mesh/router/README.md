# Sovereign Router & Mesh Routing

*Multi-provider LLM routing gateway on port :25104 with Speculative Learning, Obelisk Thompson-sampling Bayesian engine, 7-family rate limit deconvolution, and Gatehouse MCP tool integration.*

![ranch](https://img.shields.io/badge/toxicwind-ranch-blue?style=for-the-badge) ![mesh](https://img.shields.io/badge/mesh-router-purple?style=for-the-badge) ![bun](https://img.shields.io/badge/bun-black?style=for-the-badge) ![port 25104](https://img.shields.io/badge/port-25104-orange?style=for-the-badge)

## Active Routing Architecture (v3.2+)

- **Canonical Active Service**: The TypeScript router on port `:25104` (`sovereign-router-ts`) is the active sovereign router daemon composed under `pitchfork` (`auto = ["start"]`).
- **Speculative Learning**: Parallel hedged dispatch ($K=3, \delta=100\text{ms}$) where aborted in-flight losers are observed at fractional weights ($\beta += 0.3$, $\beta += 0.6$, rate-limit refill Gamma) turning tail-latency hedges into zero-cost continuous exploration.
- **Hierarchical Bayesian State**: 
  - Level 1: Shared credential bucket refill rates ($r \sim \text{Gamma}(\text{shape}_r, \text{rate}_r)$) modeling multi-key quotas.
  - Level 2: Beta quality and Gamma latency/throughput posteriors per `(provider/model/task_path)`.
- **7-Family Rate Limit Deconvolution**: Disambiguates `rpm`, `tpm`, `five_hour`, `seven_day`, `model_scoped`, `concurrency`, and `spend_cap` from raw HTTP 429 headers and bodies.
- **Gatehouse MCP Integration**: Direct connection with `:25127` Gatehouse MCP proxy with all quarantine tools approved.

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/v1/chat/completions` | POST | Route streaming or buffered chat completions |
| `/v1/models` | GET | List available and live-discovered models |
| `/health` | GET | Health and provider status summary |
| `/belief` | GET | Live inspection of Bayesian belief posteriors and arm counts |
| `/status` | GET | Granular provider circuits, latencies, and health metrics |
| `/ui` | GET | Web dashboard with live monitoring |

## Directory Layout

```text
ranch/mesh/router/
├── sovereign-router-ts/   # Canonical live TS router daemon (:25104)
│   ├── router.ts          # Core Bun HTTP server & hedged speculative dispatcher
│   ├── obelisk_engine.ts  # @takk/bayesroute wrapper & latent task path descent
│   ├── model_disabler.ts  # BeliefField, CredentialBuckets & Gamma/Beta sampling
│   ├── rate_limit_deconvolution.ts # 7-family 429 classifier
│   ├── adversarial_verifiers.ts    # L2/L4/L5 defense layers
│   ├── race/              # Evolutionary variant race harness
│   └── seed/              # Deep Seed v2 capability ladder & classifier sidecar
├── herd/                  # BeeLlama / llama-swap local GPU inference daemon (:25100)
└── flock-py/              # Python reference implementation
```
