# :25127 MCP gateway — thresher is canonical (Chris's order, 2026-10-23 ~22:13 MDT)

estate/gatehouse is RETIRED. estate/thresher is the MCP gateway on :25127
(pid 3107910, also bound on tailnet 100.72.199.93:25127).

- Management API key: line 10 of /home/toxic/estate/ranch/thresher/mcp_config.json
  (read on yote; NEVER paste into chat/files/memory).
- Verified live 2026-10-23: /api/v1/status 200, /api/v1/servers 200,
  /api/v1/tools 200 (e.g. vram_status via vram-mcp).
- estate/gatehouse disabled (was stopped; config preserved). The separate
  gatehouse-upstream binary on :25128 is a different thing, untouched.
- Shepherd rule update: any MCP-gateway check targets thresher :25127 now;
  do not flag gatehouse's absence, do not restart it onto 25127.

Usage: curl -H "Authorization: Bearer $KEY" http://127.0.0.1:25127/api/v1/status
