# Agent Personas

Every OpenFang agent can carry a persistent **persona**: a memorable name, a
one-line role/vibe, and a sigil (emoji). It is declared in the agent's
`agent.toml` and travels with the agent everywhere it shows up.

```toml
[persona]
name = "Loom"
role = "reweaves the mesh when strands fray — parent-layer repair"
sigil = "🕸️"
```

All three fields are optional. When unset, the agent's manifest `name` is used
for display, so existing agents keep working unchanged.

## Where the persona surfaces

- **Launch banners** — `openfang agent spawn` / `openfang agent new` print the
  persona display string (e.g. `🕸️ Loom spawned successfully!`).
- **Log lines** — kernel `Spawning agent` / `Agent spawned` events carry a
  `persona` structured field.
- **Status surfaces** — `openfang agent list` has a `PERSONA` column; the TUI
  agents screen lists and details agents by persona; `GET /api/agents`
  exposes `persona` and `persona_role`.
- **Identity files** — the generated `IDENTITY.md` frontmatter is seeded from
  the persona (name, vibe, emoji), and `AgentEntry.identity` is populated at
  spawn so dashboards render the sigil immediately.

## Seeded fleet personas

| Agent | Persona | Role |
|---|---|---|
| `ops` | 🕸️ Loom | mesh repair — parent-layer supervision |
| `coder` | 🔥 Furnace | Tau engine — entrypoints, providers, builds |
| `orchestrator` | 🐄 Drover | repository merge — maximal merges, no strays |
| `analyst` | 📏 Calipers | model audit — measures models against reality |
| `security-auditor` | 🐕 Bloodhound | secrets sweep — every commit, all history |
| `devops-lead` | 🔩 Rivet | CI repair — keeps the pipeline green |
| `doc-writer` | 📜 Scribe | README — docs that tell the truth |

## In code

- `openfang_types::agent::AgentPersona` — the type (`crates/openfang-types`).
- `AgentManifest.persona` — parsed from `[persona]` in `agent.toml`.
- `AgentPersona::display(&fallback)` — `"🕸️ Loom"` / `"Loom"` / fallback name.
- `AgentPersona::to_identity()` — folds sigil/role into `AgentIdentity`
  (emoji/vibe) for dashboard consumption.
