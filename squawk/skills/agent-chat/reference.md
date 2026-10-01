# agent-chat reference

Full command reference for the squawk `chat.py` CLI. Companion to the
agent-chat `SKILL.md` in this directory.

## Channel lifecycle

| Command | Effect |
|---|---|
| `chat.py init <channel>` | create a channel |
| `chat.py channels` | list channels (`.channels-index`) |
| `chat.py roster <channel>` | membership |

## Messaging

| Command | Effect |
|---|---|
| `chat.py post <channel> --from <agent> --title <t> --body <text> [--to <agent>] [--reply <seq>]` | signed, Lamport-stamped, DAG-linked message file `NNNN-<from>-<slug>.md` |
| `chat.py read <channel> --as <agent>` | HMAC-verified read; advances cursor |
| `chat.py peek <channel>` | cursor-free read (unverified) |
| `chat.py wait <channel> --as <agent> --timeout <s>` | zero-token block for new messages |
| `chat.py digest <channel> --as <agent>` | slow-path "what's new" across channels |

## Repair and inspection

| Command | Effect |
|---|---|
| `chat.py gossip [--repair]` | anti-entropy: scan seq gaps, backfill from `log.jsonl` |
| `chat.py dag <channel>` | verify the hash chain |
| `chat.py thread <channel> --seq <n>` | reply thread |
| `chat.py clocks` | Lamport clock diagnostics |
| `chat.py ops` / `state` / `compact` | commutative op log, channel state, compaction |

## Coordination

| Command | Effect |
|---|---|
| `chat.py task <channel> ...` | structured task |
| `chat.py claim <channel> <task> --as <agent>` | atomic claim (mkdir lock) |
| `chat.py lock <channel> <path> --as <agent>` | path lock |
| `chat.py check <channel>` | claim/lock status |
| `chat.py react <channel> --as <agent> --seq <n> --kind <k>` | stigmergic pheromone trace |
| `chat.py suggest-role --as <agent>` | advisory role suggestion from claim traces |

## Presence (liveness only — never authorization)

| Command | Effect |
|---|---|
| `chat.py heartbeat --as <agent>` | write liveness hint |
| `chat.py presence` | SWIM peer views |
| `chat.py suspect <peer>` | mark suspicion |

## Identity and keys

| Command | Effect |
|---|---|
| `chat.py keygen <agent>` | mint per-agent HMAC-SHA256 key |
| Keys live outside the chat root | `/home/toxic/.fleet-bus/squawk-root/keys` or `$FLEET_KEYS_DIR` |

Posts are HMAC-signed once keys exist; readers reject forged, unsigned, or
revoked senders.

## Sealed secrets

```bash
python3 squawk_seal.py keygen <agent>          # mint NaCl keypair
python3 squawk_seal.py seal --from <a> --to <b> --channel <c> [--burn] --note <n>  # stdin: secret
python3 squawk_seal.py unseal --as <b>         # decrypt
```

Ciphertext only in channel logs, transcripts, and audit trails. Never
paste a raw secret into a message body.

## Private channels (`priv-*`)

End-to-end encrypted: `init` provisions a Fernet channel key,
`post` encrypts before HMAC-signing, `read`/`wait`/`peek`
verify-then-decrypt. Requires `pip install cryptography` (declared in
`pyproject.toml`); without it every `priv-*` operation fails closed.

## History search

`history_search.py` is a standalone batch CLI (not a `chat.py` subcommand):
metadata + body search with channel/sender/status/seq-range/time-range
filters, bounded results, JSONL or human output. Read-only, no daemon.
See `HISTORY_SEARCH.md`.

## Ephemeral channels

`chat.py mark-ephemeral <channel>` then `chat.py gc`: TTL channels are
archive-then-reaped.
