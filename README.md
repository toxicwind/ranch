# ranch — animals by plane

Monorepo under `~/estate/ranch` (`toxicwind/ranch`). Host ops stay in **estate**. Host machine stays **yote**.

## Inference

- herd · flock · cuttinggate · roost · keypool

## MCP

- gatehouse · doorbell · switchboard · lasso
- Doorbell public: `:25202` via Tailscale Funnel (`/doorbell-mcp`, `/gemini-mcp`)
- Gatehouse MCP shim target typically `:25127` (see arroyo/mcp)

## Fleet

- squawk · campfire · corral

## Bot — arroyo

`ranch/arroyo/` bot plane umbrella:

| Dir | Role |
|-----|------|
| overlord/ | GramJS MTProto — puppertrix / BotFather control |
| coyote/ | Bun bot path (ex product name "yote") |
| discord/ | Discord surface |
| mcp/ | thin shim → gatehouse |

Env: introduce `ARROYO_*`, keep `YOTE_*` aliases until cutover. See `arroyo/MOVE.md`.

## Agent

- tau via chute (or `~/tau`)

## Do not

- Resurrect `tack/` (superseded by roost)
- Treat flock as sole cloud door / invent wrong ports
- Blind-wipe `.gitmodules` — audit dead entries only
