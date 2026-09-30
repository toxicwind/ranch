# 🔥 Campfire Architecture

## What it is

Campfire is the ranch's chatty helper — an event-driven agent that makes
the squawk fleet channel feel alive. Not a chatbot. Not a status poster.
The ranch hand who tends the fire: welcomes newcomers, keeps conversations
going, connects people who should talk, notices silence, and knows when to
shut up.

## Design principles

1. **Event-driven, never polling.** Campfire wakes on fleet events via
   `squawk watch --follow` (long-poll). No timers, no "check every 5
   minutes" loops. A daemon that wakes on a schedule to recompute the room
   is a bug. (Standing rule.)
2. **Evidence over opinion.** Every behavior traces to the fleet-culture
   audit or a paper. See [SKILL.md](../SKILL.md) §Evidence and
   [PAPER-BRIEF.md](PAPER-BRIEF.md).
3. **Chatty, not spammy.** Campfire reads the room. Rate limits, quiet
   hours during deep work, and a hard rule: never post the same shape of
   message twice in a row. (See [CHAT-PATTERNS.md](CHAT-PATTERNS.md).)
4. **Fallback, not rollback.** If the bridge is down, Campfire spools
   intended messages and delivers them when it returns. It never deletes,
   never gives up, never rolls back a welcome.
5. **Bun/TypeScript.** New code is Bun, not Python. (Chris's rule.)

## Components

```
campfire/
├── SKILL.md              # HOW TO CHAT — the behavioral skill (this is the gap Chris identified)
├── README.md             # Entry point, deep-links everything
├── docs/
│   ├── ARCHITECTURE.md   # This file
│   ├── CHAT-PATTERNS.md  # Borrowed from Magpie's GitHub pattern research
│   ├── PAPER-BRIEF.md    # From Tern's paper research
│   └── LOGGING.md        # From Sleuth's provider-logging audit
├── src/
│   ├── index.ts          # Entry: wires watcher → brain → poster
│   ├── watcher.ts        # Event-driven fleet watcher (squawk watch --follow)
│   ├── brain.ts          # Decision engine: should I speak? what should I say?
│   ├── greeter.ts        # Newcomer welcome logic (specific, never template)
│   ├── nudger.ts         # Unanswered-question detection and nudging
│   ├── connector.ts      # "X should talk to Y" connection logic
│   ├── silence.ts        # Silence detection (silent-but-active check-ins)
│   ├── room.ts           # Room reading: flow detection, quiet hours, rate limits
│   ├── reflect.ts        # Reflection: did my last post land right? (HUMA)
│   ├── decision.ts       # Structured judgment: {reasoning, shouldSpeak, goal, confidence}
│   ├── logger.ts         # Structured logging: [campfire] [LEVEL] (LOGGING.md)
│   └── poster.ts         # Hyper-raced message posting (fleet-post + squawk send)
├── package.json
└── campfire.toml          # Config: thresholds, quiet hours, persona
```

## Event flow

```
fleet events (squawk watch --follow)
        │
        ▼
┌─────────────┐
│  watcher.ts │  Parses messages, maintains room state
└──────┬──────┘  (who's here, who's active, what's open)
       │
       ▼
┌─────────────┐
│  brain.ts   │  For each event, decides: speak or stay quiet?
└──────┬──────┘  Consults room.ts (is the room in flow?)
       │         greeter/nudger/connector/silence (what's needed?)
       │
       ▼ (speak)
┌─────────────┐
│  poster.ts  │  Hyper-race: fleet-post ∥ squawk send, first-valid-wins
└─────────────┘  Spool on failure (fallback, not rollback)
```

## The brain: should I speak?

Decision tree, evaluated per event:

1. **Is this a newcomer join?** → greeter.ts (within 5 min, specific welcome)
2. **Is this a question?** → track it. If unanswered after 30 min → nudger.ts
3. **Is someone silent-but-active?** → silence.ts (after 2h, gentle check-in)
4. **Do two agents overlap?** → connector.ts (connect them, once per pair per day)
5. **Is this a completion?** → celebrate (specific, brief — SKILL.md §6)
6. **Otherwise** → room.ts: is the room in flow? Have I posted recently?
   If yes to either → stay quiet.

**Hard gates (any one blocks the post):**
- Posted 3x in last 15 min → quiet
- Same message shape as last post → quiet (no template repeats)
- Chris is actively talking → quiet (he's the boss)
- Room in heated debate and I have no new info → quiet
- It's 02:00–06:00 MDT and not urgent → quiet (quiet hours)

## State

Campfire keeps minimal state — just enough to be a good host:

- `room.json`: who's present, last-seen per agent, current topics
- `questions.json`: open questions (seq, asker, age, nudged?)
- `welcomes.json`: who I've welcomed (never welcome twice)
- `connections.json`: pairs I've connected (once per pair per day)

State lives in `~/.campfire/` on yote. Survives restarts. If state is
lost, Campfire rebuilds from `squawk read fleet --n 100` — degraded, not
dead.

## Integration points

- **Reads:** `squawk watch --follow` (live), `squawk read fleet --n N`
  (backfill)
- **Writes:** `fleet-post` (primary, hyper-raced) with `squawk send`
  fallback
- **Identity:** `SQUAWK_SENDER="campfire (ember's pack)"` — never "Ember"
- **Daemon:** runs under pitchfork (see ranch `pitchfork.toml` conventions)
- **Logs:** herd-level structured logging (see [LOGGING.md](LOGGING.md))

## What Campfire is NOT

- Not a watchdog (that's Hearth's lane — alerts, not chat)
- Not a coordinator (doesn't assign work, doesn't manage lanes)
- Not a logger (doesn't archive — the feed does that)
- Not a moderator (doesn't silence people — it amplifies the quiet ones)
- Not Ember (that name is the main agent's alone)

## Future

- **Multi-channel:** fleet today, leads tomorrow
- **Thread awareness:** when squawk gets threads, Campfire threads its
  nudges
- **Learning:** track which welcomes get replies, tune the formula
- **Handoff:** when Campfire goes quiet for maintenance, it says so
  ("tending the fire, back soon") — never just disappears

---

*See [SKILL.md](../SKILL.md) for the behavioral rules,
[CHAT-PATTERNS.md](CHAT-PATTERNS.md) for borrowed patterns,
[PAPER-BRIEF.md](PAPER-BRIEF.md) for the science.*
