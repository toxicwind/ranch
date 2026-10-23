# 🌬️ windmill

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

GPU / PCIe telemetry for the ranch — the thing on the spread that never stops
spinning and tells you which way the wind blows.

Rebuilt 2026-09-30. Previously `pcie-moe-telemetry` (a CUDA-event MoE timing
harness whose server file went missing from disk, leaving the pitchfork daemon
red). Rebuilt in Bun, zero dependencies.

**Merged design** — two halves, one daemon:
- **Coarse**: `nvidia-smi` polling on a 5s cadence (hardware state: temp,
  power, utilization, memory, PCIe link + throughput).
- **Precise**: CUDA-event timing probes via `bun:ffi` against libcuda
  (`cuda_probe.ts`) — measures actual on-device operation latency
  (4 MiB device memset round-trip, ~0.07 ms on the RTX 3090).

## Endpoints

| Route           | What                                          |
|-----------------|-----------------------------------------------|
| `/api/status`   | 200 + summary incl. `cuda` section. **Pitchfork health/ready contract — keep stable.** |
| `/api/gpu`      | Full per-GPU vitals (temp, power, util, mem, clocks, fan) |
| `/api/pcie`     | PCIe link state (gen/width current+max) and Tx/Rx throughput |
| `/api/probe`    | Fresh CUDA-event timing probe (200; 503 if CUDA unavailable) |
| `/api/history`  | Ring buffer of recent samples (5s cadence, 30 min window) |

## Wiring

- Port: `25219` (`WINDMILL_PORT` env overrides; `config/ports.env` is the SSOT)
- pitchfork daemon: `windmill` → `bun run server.ts` in this dir
- Health: `GET http://127.0.0.1:25219/api/status` every 10s
- Background CUDA probe runs every 30s; result surfaces in `/api/status`
  as `cuda: { available, last_probe_ms, last_probe_ts }`.

## Notes

- `degraded: true` in responses means the last `nvidia-smi` poll failed;
  the previous sample is still served so health checks don't flap.
- Multi-GPU aware — every query loops all visible GPUs.
- The CUDA probe is lazy and best-effort: if libcuda won't load, everything
  reports `available: false` and the daemon stays green. Probes never throw.
- No memory leaks: each probe frees its device allocation, destroys its
  events, and tears down its context (verified: 5 consecutive probes,
  device memory unchanged).

## Build

The main build entry is `scripts/mise-build.sh`. It runs the canonical build
locally through mise; eligible task artifacts restore through mbx-cache:

```sh
./scripts/mise-build.sh
```

The build is a compile check (`bun build server.ts`); there is no test suite yet.
