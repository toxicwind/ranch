# 🌬️ windmill

GPU / PCIe telemetry for the ranch — the thing on the spread that never stops
spinning and tells you which way the wind blows.

Rebuilt 2026-09-30. Previously `pcie-moe-telemetry` (a CUDA-event MoE timing
harness whose server file went missing from disk, leaving the pitchfork daemon
red). Rebuilt in Bun, zero dependencies, polling `nvidia-smi` on a 5s cadence.

## Endpoints

| Route           | What                                          |
|-----------------|-----------------------------------------------|
| `/api/status`   | 200 + summary. **Pitchfork health/ready contract — keep stable.** |
| `/api/gpu`      | Full per-GPU vitals (temp, power, util, mem, clocks, fan) |
| `/api/pcie`     | PCIe link state (gen/width current+max) and Tx/Rx throughput |
| `/api/history`  | Ring buffer of recent samples (5s cadence, 30 min window) |

## Wiring

- Port: `25219` (`WINDMILL_PORT` env overrides; `config/ports.env` is the SSOT)
- pitchfork daemon: `windmill` → `bun run server.ts` in this dir
- Health: `GET http://127.0.0.1:25219/api/status` every 10s

## Notes

- `degraded: true` in responses means the last `nvidia-smi` poll failed;
  the previous sample is still served so health checks don't flap.
- Multi-GPU aware — every query loops all visible GPUs.
