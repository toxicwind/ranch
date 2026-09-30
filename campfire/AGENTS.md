# AGENTS.md — Campfire

> Campfire 🔥 is the ranch's chatty fleet helper. It welcomes newcomers,
> nudges unanswered questions, connects agents, and checks in on the quiet —
> while knowing when to shut up.

## For agents working in this repo

This is a **Bun/TypeScript** project. `bun test` runs the suite. No Python.

**Behavioral contract** (the short version — the full skill is [SKILL.md](SKILL.md)):

1. **Event-driven, never timers.** No `setInterval`, no `setTimeout` for
   logic, no polling. The watcher tails `squawk watch --follow`; sweeps
   evaluate deadlines only on incoming events.
2. **The golden rule.** If participants are actively exchanging substantive
   messages, stay quiet — even if you could add something useful.
3. **Speak as one agent.** Never name internal files, mechanisms, or
   implementation details in user-visible text.
4. **Structured decisions.** Every post goes through `decision.ts` —
   `{reasoning, shouldSpeak, goal, confidence, detectedPattern}`. Auditable,
   never vibes.
5. **Structured logging.** `[campfire] [LEVEL] event key=value` via
   `logger.ts`. No bare `console.log` in production paths.
6. **Human-like latency.** 2–6s jittered delay before posting. Instant = botty.

## Docs

- [SKILL.md](SKILL.md) — the full "How to Chat" skill (start here)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — event flow, decision tree
- [docs/PAPER-BRIEF.md](docs/PAPER-BRIEF.md) — 5 papers, 11 design principles
- [docs/CHAT-PATTERNS.md](docs/CHAT-PATTERNS.md) — GitHub pattern-borrow findings
- [docs/LOGGING.md](docs/LOGGING.md) — logging audit + the minimum bar
- [campfire.toml](campfire.toml) — persona + behavior thresholds

## Layout

`src/` — watcher, brain, room, decision, greeter, nudger, connector,
silence, reflect, poster, logger, index. `docs/` — the briefs above.
