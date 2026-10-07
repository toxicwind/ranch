# MOVE — yote → arroyo/coyote

## Mapping

| Legacy | New |
|--------|-----|
| standalone `toxicwind/yote` / `~/yote` | `ranch/arroyo/coyote/` |
| Overlord / puppertrix GramJS | `ranch/arroyo/overlord/` |
| Discord bot surface | `ranch/arroyo/discord/` |
| MCP shim into gatehouse | `ranch/arroyo/mcp/` |

## Rules

1. Host name stays **yote**; only the product moves.
2. Introduce `ARROYO_*`; keep `YOTE_*` (e.g. `YOTE_TELEGRAM_API_ID/HASH/SESSION`) as aliases until cutover.
3. Archive standalone `toxicwind/yote` only after in-tree SSOT proven (historically `:25102`).
4. Never edit only the live path; do not symlink xai/spark workspaces.
5. Do not steal `:25204` (awrawr-ws-exec). Doorbell public stays `:25202`.

## Cutover checklist

- [ ] Copy/move sources into stubs above
- [ ] Point pitchfork / serve configs at new paths
- [ ] Prove Overlord BotFather flow + Bun coyote token path
- [ ] Archive old yote repo/tree
