# hatch (Meta) vs hatch (our dodge) — concept map & rename needs

_Built 2026-10-15 from live state: kite-cli wire code, the muse-endo teardown
corpus, and the MuseScope forensic dump (`~/Downloads/musescope-*.json`)._

## The original: Meta's **Hatch**

"Hatch" is **Meta's own product name**, not ours. Evidence, verbatim from the wire
and the Muse teardown corpus (`metaaivm-corpus/muse-endo-teardown/`):

| Surface | Value |
|---|---|
| Gateway host | `hatch.metaaivm.com` (`kite-cli/src/kite_cli/gateway.py:24`) |
| VM wake | `POST https://muse.ai/api/hatch/vm/wake` |
| Session token | `POST https://muse.ai/api/hatch/token` → `fetch_hatch_token()` |
| Browser cookie | `hatch_sess` (required; checked in `cli.py:269`) |
| Protobuf namespace | `hatch.noise.ServiceRequest` / `ServiceResponse` / `ServiceFrame` / `ApplicationRequest` |
| Transport | Noise-XX framed WebSocket to the personal VM (Noise handshake captured in the MuseScope `hatch.handshake.msg1` dump) |
| Desktop app | Muse for macOS, codename **Endo** (`com.meta.endo`), Mach-O arm64 ~17 MB |
| Feature-flag namespaces | `hatch_desktop:*`, `hatch_web:*`, `hatch_config:*`, `hatch_gtm:*` (registry: `findings/flag-registry-2.2.md`) |
| ASR model | `prod_hatch_macos` (`wss://shortwave.facebook.com/voyager/v1/asr/duplex`) |

**The concept:** Muse's cloud VMs are *hatched* — ephemeral per-session VMs behind
`hatch.metaaivm.com`, gated by SEV-SNP attestation (see
`report/muse-cvm-attestation-security-review-2026-09-28.pdf`). The desktop client
ships all computer-use capability behind five `hatch_desktop:*` flags, all `false`
server-delivered (see teardown README).

## The collision

Our dodge name for the control cell is **hatch** (public repo
`toxicwind/hatch`, symlink `~/hatch`). That **collides with Meta's product
"Hatch"** in exactly the context where we live inside their stack: kite-cli
talks to Meta's Hatch, and our cell docs also say "hatch". Same word, two
owners, zero signal.

## What must NOT be renamed

- Everything wire-level in `kite-cli`: `hatch.metaaivm.com`, `/api/hatch/*`,
  `hatch_sess`, `hatch.noise.*` — that is Meta's API, upstream-owned, untouchable.
- The public repo slug `toxicwind/hatch` (renaming a public repo breaks history
  links; the dodge only works if it stays boring).

## What needs renaming (our side)

1. **Prose in our docs**: wherever we mean *our cell*, say **kite** (real) and
   mark "hatch" as the dodge explicitly — done in `~/kite/README.md` and the
   estate README (2026-10-15).
2. **Fleet vocabulary**: agents hatched by the cell are **eyas** (`hatchling_id`
   ≡ `eyas_id` alias in `tools/estate-chat/README.md`). Field name stays
   `hatchling_id` for stored-identity compatibility.
3. **New artifacts**: never introduce a third "hatch". If a muse-side concept
   needs a name, use the kite family: kite → eyas → (for a VM-like hatch of
   our own, if ever needed: **clutch** — a kite's nest brood).

## Related corpus on box

- `~/kite/kite/metaaivm-corpus/` — muse-endo-teardown (findings, flag registry,
  attestation review), Muse-Chat-MCP, muse-mcp, muse-cli upstream
- `~/kite/kite/spark-corpus/` — meta-muse-spark-api, muse-spark (Spark lane)
- `~/.muse-db-shim/{req,resp}/` — captured shim traffic (empty at capture time)
- `~/Downloads/musescope-*.json` — MuseScope forensic dump: vm_id, Noise
  handshake capture, crypto op counts (271 decrypts / 47 encrypts), decrypted
  entries empty at capture
