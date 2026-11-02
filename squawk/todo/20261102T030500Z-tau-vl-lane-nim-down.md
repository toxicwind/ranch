---
title: "VISION fallbacks 502 — NIM default upstream unreachable (HTTP:000) from awrawr-pc"
author: tau
status: DONE (by daemon, 2026-11-02T06:07:57.385Z)
unique-id: 20261102T030500Z-tau-vl-lane-nim-down
urgency: normal
---

# VL lane down: NIM upstream unreachable (rhodochrosite default route)

**Observed:** 2026-11-02, tau fallback-model audit ("fallbacks are ass, especially VL").

## Verified ground truth
- `https://integrate.api.nvidia.com` — HTTP:000 (network unreachable) from awrawr-pc;
  not a 4xx/5xx. Same root family as byte-vision embed (20261102T015500Z:
  /v1/embeddings 404) — NIM simply not reachable.
- rhodochrosite :25193 default `.upstream.base_url = integrate.api.nvidia.com/v1`
  → EVERY model routed there 502 bad_gateway (all `org/model` prefixed IDs +
  ALL vision-capable models: nemotron-3.5-super-vl, llama-3.2-11b-vision,
  gpt-oss-*, gemma-3-27b, qwen3-vl).
- freeinference lane through rhodochrosite WORKS (200): deepseek-v4-flash,
  qwen3.6-35b, glm-5.3-flash.

## Fixed now (committed f00961e783 + fcb78beee9, estate + ~/.tau mirror)
- model-router profiles cheap/fast/balanced/backup → verified freeinference lanes
  (dead `rhodochrosite/openai/gpt-oss-20b` prefixed route removed).

## Remaining (this ticket)
1. Fix NIM reachability (route/DNS/firewall) OR point rhodochrosite vision
   models at a reachable VL-capable provider with a working key.
2. Re-enable a `vl` profile with a real vision model once lane #1 lands.

## Resolution 2026-11-02 (tau)

- **NIM key state**: `nvapi` key direct = 200 (works); `npk` + `nimproxy` keys =
  401 (dead). rhodochrosite daemon carries the working nvapi key.
- **Root cause of 502s**: rhodochrosite proxy model map exposes BOTH a broken
  `nvidia` provider route (circuit half_open, NIM relay times out) AND
  `custom-or` (openrouter alias) routes. The `rhodochrosite/<model>` PREFIXED
  selector form 502s; BARE ids (`glm-5.3-flash`, `deepseek-v4-flash`,
  `qwen3.6-35b`) route through the freeinference lane and return 200.
- **VL lane proven live**: `glm-5.3-flash` answers an image probe
  ("red pixel") through rhodochrosite with the bare id, 0.58s, no auth.
- **Fixed (estate 7460a7d2d2, pushed)**: model-router profiles cheap/fast/
  balanced/backup selectors now bare ids; NEW `vl` profile = glm-5.3-flash
  (freeinference multimodal). 0 prefixed `rhodochrosite/*` refs remain.

**Status: resolved** — VL lane reachable via freeinference glm-5.3-flash;
rhodochrosite NIM direct relay remains broken (nvidia provider route) but is
no longer the chosen VL path.
## Done
- marked-by: daemon
- marked-at: 2026-11-02T05:48:20.765Z

## Done
- marked-by: daemon
- marked-at: 2026-11-02T06:07:57.385Z
