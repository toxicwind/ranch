# Research → Implementation: Rig fork patches

Three papers/principles, each ending in code. No research-only artifacts.

## 1. Agent-friendly CLI: guided failures, never silent wrongness

**Source:** Priyanga P. Kini (nilenso), *"What Makes a Command-Line Interface
Agent-Friendly? A multi-arm empirical study deriving design principles from
AI-agent traces"*, August 2026.
https://github.com/nilenso/autoresearch/blob/HEAD/docs/agent-friendly-cli-paper.md

**Findings we built on:**
- The dominant agent failure mode is **Class C — "silent wrong"**: a command
  that succeeds but misleads. Worse than a loud failure.
- Failures should be **guided (Class B)**: say what went wrong, why, and the
  exact recovery action. "Did you mean …?" suggestions sharply cut failures.
- **Stdout stays machine-readable; guidance goes to stderr.** Don't truncate
  silently; name the recovery path.

**Implementation in this fork:**
- `agent set --provider llama-swap --model <typo>` used to be *accepted
  silently* and fail later at inference time — textbook Class C. Now
  `set_agent_model` validates with a strict provider-scoped check
  (`ModelCatalog::has_model_for_provider`, no cross-provider fallback) and
  returns a **guided `InvalidInput` error listing the provider's known
  models** — Class B.
- Providers with **no catalog models are not rejected**: we only claim
  knowledge we positively have (no false authority over custom endpoints).
- The API maps `InvalidInput` → **HTTP 400** (was 500), so CLI agents can
  distinguish "fix your input" from "server broke".
- CLI contract already matches the paper: errors → stderr (`eprintln!`),
  success payloads → stdout (`println!`).
- The `agent set` argument parser is a **pure function**
  (`resolve_agent_set`) with a parsing matrix test suite: legacy positional
  form, `--provider/--model` flags, mixed forms, slash- and colon-containing
  model IDs (`toolcall-local/qwen3.5-9b-tool`, `qwen:qwen-plus`) pass through
  unmangled. Interpretation is explicit and testable, not inferred at the
  call site.

## 2. Tail-latency fan-out: race the probes, bound each attempt

**Source:** Jeffrey Dean & Luiz André Barroso, *"The Tail at Scale"*,
Communications of the ACM, 2013. Fan-out latency is dominated by the slowest
member; the fix is bounded attempts run concurrently.

**Also:** Chris's HFT doctrine — race redundant paths, first-valid-wins,
fail-fast with short ceilings, measure every hop, plan the fallback before
the primary.

**Implementation in this fork (verified in-repo, kept — not redone):**
- `provider_health`: 1s connect ceiling, 2s total probe timeout, 60s result
  cache — the fail-fast bound on every attempt.
- Boot-time local-provider discovery races all probes via
  `probe_providers_concurrent` (`futures::future::join_all`): the batch
  costs ~the slowest single probe, not the sum. An earlier sequential
  `for … await` version would have paid 2s × N on the boot path.
- `/api/providers` health probes are likewise concurrent with per-provider
  timeouts and cache.
- llama-swap rides the same raced path as a first-class local provider
  (default `http://localhost:25100/v1`, the herd multiplexer; override via
  `LLAMA_SWAP_BASE_URL` / `LLAMA_SWAP_HOST`), with dynamic model discovery
  merged into the catalog.

## 3. Provider registry as an open plug-in boundary

**Source:** Ali Paikan, Vadim Tikhanoff, Giorgio Metta, Lorenzo Natale,
*"Enhancing software module reusability using port plug-ins"*,
arXiv:1411.1102. http://arxiv.org/pdf/1411.1102v1
Core principle: extend through **stable connection points** rather than
application-specific modifications — new modules attach at the boundary
with no changes to existing code.

**Implementation in this fork:**
- The provider registry + driver boundary is the connection point.
  llama-swap was added **as a registered provider with a driver**, not as a
  special-case shim: catalog entry, known-provider registration, local
  health support, dynamic discovery.
- `set_agent_model` resolves `provider/model` prefixes through a **generic
  fallback**: any registered provider ID works as an explicit prefix with
  **no code changes** — a new provider registered tomorrow resolves the
  same way. The hardcoded prefix list is a fast path, not the mechanism.
- Built-in tool-capable model metadata (e.g.
  `toolcall-local/qwen3.5-9b-tool` on llama-swap) ships in the catalog so
  agents can select tool-use models without probing.
