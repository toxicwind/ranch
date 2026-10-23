# AGENTS.md — estate-brain

estate-brain is the fleet's single source of truth for crew rosters, personas,
signing identities, keys, and tokens. It consolidates the legacy `squawk-persona`
registry, the `estate/crews` roster/personas/identity-specs, and the deployed
squawk-root profiles into one queryable whole.

Refines: `/home/toxic/AGENTS.md` (authoritative rules); the `ranch` repo owns
this directory's content.

## Non-negotiable

- **Secrets never committed.** `personas/personas.yml` stores token _paths_,
  never token _values_. Signing keys live in `$FLEET_KEYS_DIR` (0600), never in
  git. `.gitignore` excludes `*.key`.
- **`personas/personas.yml` is the authority.** `$SQUAWK_ROOT/runners.yml` and
  any generated output are derived; regenerate with `estate-brain gen-runners`.
- **Additive-only on the live box.** Never remove or rename a persona that a
  live daemon depends on without an explicit order. Renames go through the
  `identity:` field, keeping the persona key stable.
- **No hand-editing generated files.** `runners.yml` is generated; edit
  `personas/personas.yml` instead.

## Commands

```bash
B=bun bin/estate-brain.ts
$B list
$B show <persona>
$B resolve <persona>       # json: key_file, token_file
$B env <persona>           # export FLEET_KEYS_DIR / SQUAWK_SENDER / token
$B keygen <persona>        # ensure key 0600
$B gen-runners --root <R>  # write R/runners.yml
$B validate                # registry + key/token presence
$B agents                  # list rig agent configs, bound to personas
$B deploy --live-dir <R>   # mirror agent.toml -> OpenFang run dir
$B corral <p> -- <cmd>     # run Corral orchestration as persona <p>
$B checkpoint <p> -m <msg> # DelendAI checkpoint + push as persona <p>
```

`bin/squawk-persona` is a back-compat alias for the same CLI.

## Everyone drives Corral & Delend

Every persona can orchestrate and merge, not just the coordinator:
`estate-brain corral <p> -- ...` and `estate-brain checkpoint <p> -m ...`
export the persona's identity (`FLEET_KEYS_DIR`, `SQUAWK_SENDER`, token) into
the child process so the agent signs and pushes as itself. Secrets never
printed.

## Rules

1. **FLEET_KEYS_DIR is the key override** honored by this project and every
   squawk HMAC signer (`fleet_identity`, `fleet_e2ee`, `squawk_seal`, `chat.py`).
2. **Roles are lowercase-kebab** (e.g. `estate-ops`, `queue-rabbit`). Persona
   `identity` may differ in case (e.g. `Sable`, `Marten`) but is the sender name.
3. **Channels** must exist in `$SQUAWK_ROOT` (or `[fleet]` default). Add a
   persona's channels, not one-off send targets.
4. **Token names** reference the registry `tokens:` table; never inline a path
   in a profile body.

## Adding a persona

1. Add a block to `personas/personas.yml` (identity, key, role, description,
   channels, poll_interval, heartbeat).
2. `estate-brain keygen <persona>` to mint the signing key.
3. `estate-brain gen-runners` to publish it to squawk.
4. `bun test` to confirm the registry still validates.

## Verification

`bun test` (8 tests: registry schema, persona/render escaping, keygen
idempotency). Run with `RUN_FAST_ACTIVE=1` to bypass the estate 2s shim that
normally SIGKILLs `bun test`.
