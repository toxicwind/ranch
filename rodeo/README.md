# rodeo

Self-observing, self-hosting agentic orchestration testbed.

## Architecture

- **RodeoEngine**: Plugin step runner with durable checkpoints keyed by `run_id`
- **ToolRegistry**: Built-in tools (`write_file`, `read_file`, `run_pytest`, `done`) + dynamic plugin tools
- **Probes**: Inferred runtime constants from the freeinference shim:
  - Cache block quantum $B$
  - Output completion cap $K$
  - Parameter drops (`guided_json`, etc.)
  - Model identity verification
- **Fingerprint**: Every response validated against inferred $B$, $K$, reasoning prefixes, and first-call cache pollution
- **Orchestration**: BRAIN (`diffusiongemma`) → HANDS (`qwen3.6-35b`) → tests → RUNNER (`pytest`) → REPAIR → JUDGE (`glm-5.3-flash`)
- **Self-host**: HANDS writes plugins into `plugins/*.py`; engine hot-loads on next invocation
- **Proof Matrix**: End-of-run tabular accounting of shim behavior and orchestration outcomes

## Quickstart

```bash
# Set credentials (or load via secretsmith)
export FI_KEY="hyi-u5H98cHTgYz_bTWcZMW0373Sl_ytJzRVCmTFSJXtJqs"

# Run single end-to-end workflow
./rodeo.py --run

# Serve FastAPI interface
./rodeo.py --serve
```

### Endpoints

- `GET /metrics` — Live inferred shim profile ($B$, $K$, dropped params, loaded plugins)
- `GET /matrix` — Latest proof matrix output
- `GET /runs` — List checkpointed runs
- `POST /run` — Trigger a run (`{"task": "...", "run_id": "..."}`)
