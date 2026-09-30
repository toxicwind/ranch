# metaaivm-profile

First-class agent profile for the Meta AI VM (metaaivm.com) estate.

## What metaaivm.com is

`metaaivm.com` is Meta's per-user AI VM domain. The Muse (muse.ai) "Hatch"
agent runs in a per-user Meta cloud VM reached over a Noise-encrypted
WebSocket gateway. This session's own VM FQDN (from the runtime environment,
2026-09-30):

```
f4f307f9-74e5-4df4-af81-4cab07043424.metaaivm.com
```

Gateway (shared, not per-VM): `hatch.metaaivm.com`
Transport: `wss://hatch.metaaivm.com/v1/noise`
Handshake: `Noise_XX_25519_AESGCM_SHA256`
Framing: protobuf `NoiseTransportFrame` envelopes, `ServiceRequest` /
`ServiceResponse` with `ServiceFrame` stream multiplexing.

## Corpus

Non-duplicative material collected 2026-09-30 into
`/home/toxic/sovereign/hatch/metaaivm-corpus/`:

- `nikships/muse-cli` — Python CLI for the personal muse.ai agent; `docs/PROTOCOL.md`
  documents the full gateway protocol (258 methods in `routes.json`,
  protobuf descriptors `desc0.bin`/`desc1.bin`, Noise XX handshake,
  service IDs: daemon 0, sentinel 1, vault 2, authd 3). Fork candidate.
- `barkleesanders/muse-endo-teardown` — teardown of Meta's Muse macOS app
  (codename Endo); 51-command device-command catalog; per-user agent VM
  at `hatch.metaaivm.com`; feature-flag registry.
- `duclm1x1/Muse-Chat-MCP` — MCP server + OpenAI-compatible shim driving
  the real logged-in Chrome against muse.ai; documents the
  `wss://hatch.metaaivm.com/v1/noise` Noise transport (X25519 + HKDF +
  AES-GCM + Ed25519).
- `kleprevost/muse-mcp` — Python `muse-cli` client; `AGENTS.md` documents
  the `wss://hatch.metaaivm.com/v1/noise` flow with Chrome-impersonated
  HTTPS auth.

Deduplication: by file content hash (sha256), not by filename. The four
repos overlap on protocol description but each carries unique material:
muse-cli has the only full method table; endo-teardown has the only
binary teardown + flag registry; Muse-Chat-MCP has the only MCP/OpenAI
shim; muse-mcp has the only `AGENTS.md` operator notes.

## Fork selection

`nikships/muse-cli` selected for first-class fork. Rationale: it is the
only source with the complete gateway protocol (method table, protobuf
descriptors, Noise handshake details, service multiplexing), which is the
load-bearing material for any agent profile that needs to speak the
metaaivm gateway directly. The others are consumers or teardowns.

## Agent profile

Applies to agents carrying the Hatch autoloaded identifier or the `ipnext`
identifier. The profile:

- Identifies the runtime: per-user VM under `*.metaaivm.com`, shared
  gateway `hatch.metaaivm.com`, model family Muse Spark.
- Uses the corpus protocol material for gateway-aware operation.
- Operates under Chris's standing autonomous-operation order; questions
  resolve via the skill catalog, yote ffs, GitHub pattern-borrow, and
  exa web search — never by stalling on the user.

See `profile.json` for the machine-readable form.
