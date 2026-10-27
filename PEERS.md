# Ranch peers — post-unsubmodule relocation map

Every path below used to be a gitlink (mode 160000) in this repo, with a
`.gitmodules` entry. The estate moved to a **submoduleless** model: repos are
peers, cloned independently at their permanent path, listed here instead of
being tracked by the parent.

Read this table as: old path → where that checkout lives now.

Generated 2026-10-27 during the ranch unsubmodule pass.

| old gitlink path | current home |
| --- | --- |
| `OmniRoute` | `pens/ranch/forge/router/atlas` (renamed → atlas) |
| `VansRouter` | `pens/geode/products/rhodochrosite` (renamed → rhodochrosite) |
| `antilogos` | `pens/olympus/products/antilogos` |
| `barn/corral` | `pens/ranch/corral` |
| `barn/flatbread` | `pens/ranch/barn/flatbread` |
| `barn/nativelink` | `pens/estate/config/nativelink` |
| `barn/rosec` | `pens/ranch/barn/rosec` |
| `barn/weave` | `pens/barn/weave` |
| `barn/weave-sub` | `pens/ranch/barn/weave-sub` |
| `borrowed/delendai` | `pens/ranch/delendai` |
| `estate-dispersal` | retired (absorbed into squawk) |
| `estate-end4` | retired (absorbed into squawk) |
| `fleetd` | `pens/ranch/.retired-squawk-20261024/fleetd` |
| `kilo-cli` | `pens/ranch/kilo-cli` |
| `kilo-code` | `pens/ranch/kilo-code` |
| `mcp/mcpproxy-go` | `pens/ranch/barn/thresher` (thresher IS the MCP proxy) |
| `mcpproxy-go` | `pens/ranch/barn/thresher` |
| `muse-cli` | `pens/olympus/products/muse` |
| `secretsmith` | `pens/barn/secretsmith` |
| `session-bus-refresh` | `pens/ranch/.retired-squawk-20261024/session-bus-refresh` |

The remaining ~85 peers did not move; they stay at their existing paths inside
this repo, cloned independently (each keeps its own `origin`).

Rule going forward: **no new gitlinks in this repo.** A peer is a clone with a
remote, not a pointer in the parent's index. `git submodule` is retired here.
