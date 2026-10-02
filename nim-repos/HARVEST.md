# NIM repo harvest — UUID-audit evidence + patterns

Harvested 2026-09-20. 23 repos cloned to `/home/toxic/estate/ranch/nim-repos/`
(one dir per repo, `--depth 1`). Ranked by `rank_repos.py` → `RANKED.md`
(recency 50% + relevance 45% + stars capped at 5% — popularity is not evidence).

## New UUIDs harvested: 2 (registry now 3 total)

1. **`01327741-a1cb-4bdb-a31e-5391c8ca48c2`** → `LIKELY_DEAD`
   - Source: `nirholas/three.ws`, `tests/api/cosmos-endpoint.test.js:62`
   - Comment in source: *"The exact upstream body the live account received on the retired model."*
   - A real retired NVCF function UUID from a live account (2026-06-11), image-gen lane.
2. **`767b5b9a-3f9d-4c1d-86e8-fa861988cee7`** → `CONFIRMED_404_EXAMPLE`
   - Source: `NVIDIA/NemoClaw`, `src/lib/validation.test.ts:373`
   - Comment in source: *"the literal NVCF detail string from /v1/chat/completions"*
   - Real captured 404 body; model not named in the test.
3. (pre-existing) `23d4f03a-b8a6-4adb-a183-7daa083a09cc` → `GLOBALLY_DEAD` (moonshotai/kimi-k2.6)

Note: bulk UUID regex hits in NemoClaw/three.ws/claude-code-router are test
fixtures, not live evidence — only the two above carry "captured from a live
account" provenance and were filed.

## Best patterns found (borrow these)

### 1. NemoClaw `nvcf-model-access.ts` — THE canonical 404 classifier (borrow verbatim)
`NVIDIA/NemoClaw/src/lib/inference/nvcf-model-access.ts`:
- `isNvcfFunctionNotFoundForAccount(msg)`: `/Function[ \t]+'[^']+':[ \t]*Not found for account/i`
- POSIX ERE twin for shell/sandbox probes: `Function[[:blank:]]+'[^']+':[[:blank:]]*Not found for account` (both forms live side-by-side so host and sandbox can't drift — good discipline, copy it)
- `nvcfFunctionNotFoundMessage(model)`: reframes to "Model '<id>' not found — in the NVIDIA Build catalog but not deployed for your account…"
- Also: `shouldSkipResponsesProbe()` — NVIDIA Build has no `/v1/responses` at all; probing it only produces false 404 noise. Skip it.
- Our `nvcf_classifier.py` should adopt the shell-ERE twin for any bash-side probing.

### 2. kondi — independent kimi-k2.6 404 confirmation (2026-07)
`thispointon/kondi`, `mcp-connect-mvp/src/config/models.ts:548-552`:
> "several models in the live /models list are deliberately excluded as NOT usable
> (verified 2026-07): moonshotai/kimi-k2.6 (404 'Function not found'),
> meta/llama-4-maverick (request hangs), qwen/qwen3.5-397b-a17b (hangs on any
> real completion), minimaxai/minimax-m3 (streaming = instant 'Internal server error')"
- Third-party, independent confirmation of our GLOBALLY_DEAD verdict on kimi-k2.6.
- Adds 3 more catalog liars with distinct failure modes (hang vs instant-500 vs 404).

### 3. tibbee/pi-nvidia-nim-provider — 404/410 disambiguation + ghost-ID guard
- Troubleshooting table: plain-text `404 page not found` (no UUID) = typo/renamed; `404` + `Function '<uuid>'` = not entitled OR de-provisioned; `410 Gone` + "end of life" = retired, permanent.
- `GET /v1/models` is a global catalog, not an entitlement list — do not use it to confirm access.
- New models can flip 404↔200 while function registration propagates — retry before concluding.
- **Ghost-ID guard**: retired/ghost IDs are pinned so a catalog refresh can never resurrect them. (We should add this to our allowlist manager.)
- Ships models only after a live probe on the hosted endpoint — the probe-before-build mandate, implemented.
- Per-model `chat_template_kwargs` injection (thinking effort, budgets) — relevant to our reasoning-model handling.

### 4. FreeRideV3 `docs/providers/nvidia_nim.md` — probe-built provider reference
`shaivpidadi/freeridev3`:
- Auth failures are **403, not 401** on NIM (`{"status":403,"detail":"Authorization failed"}`) — map both to AUTH.
- `404` + plain-text body (no JSON) = MODEL_NOT_FOUND (unknown model id) — distinct from the NVCF JSON 404.
- Curated allowlist of tier-1 models + `NVIDIA_NIM_FREE_MODELS_OVERRIDE` env escape hatch.

### 5. three.ws — retired-lane pattern (good operator hygiene)
- Maps a retired-lane 404 to `503 lane_unavailable` with page-ready copy, and **never leaks the upstream detail** (asserts the UUID/account id are absent from the response body).
- Our reframer should do the same: translate, don't parrot.

### 6. gocode-router — `NVCF-AI-Resource` header (novel, needs live testing)
`lucky-mandator/gocode-router` sends `NVCF-AI-Resource: "moonshotai/kimi-k2.5"` as a request header against `integrate.api.nvidia.com/v1`.
Worth a live probe: if the header pins the NVCF function directly, it may bypass catalog-routing weirdness. Untested by us — flag for probe_truth.py.

### 7. big-agi docs — key-scope detail
`enricoros/big-agi` `docs/config-nvidianim.md`: when creating the key, it must include the **Public API Endpoints scope** — keys without it "look valid but fail all inference with 404". Actionable: key *creation* scope, not just account entitlement.

### 8. claude-code-router issue — kimi-k2.6 + `reasoning` field → 500
`musistudio/claude-code-router#1410`: sending a `reasoning` field to kimi-k2.6 on NIM → `500 unhashable type: 'dict'` (backend crashes hashing the dict). Lesson: never send provider-specific reasoning fields blindly; gate per model.

## Per-repo contribution notes

| repo | stars | what it contributed |
|---|---|---|
| NVIDIA/NemoClaw | 22499 | canonical 404 classifier + shell ERE + reframed message; real 404 UUID fixture; Responses-probe skip |
| nirholas/three.ws | 201 | retired-model UUID from live account; lane_unavailable mapping; never-leak-upstream-detail hygiene |
| musistudio/claude-code-router | 37329 | kimi-k2.6 reasoning-field 500 bug report |
| Gitlawb/openclaude | 33441 | curated nvidiaNimModels.ts list |
| api-evangelist/nvidia-nim | 1 | APIs.json profile, endpoint surface inventory |
| stillhue/claudio | 2 | nemotron model lists, provider config |
| tibbee/pi-nvidia-nim-provider | 3 | 404/410 disambiguation, PAE docs, ghost-ID guard, live-probe-only shipping, chat_template_kwargs injection |
| thispointon/kondi | 5 | 4 listed-but-broken models w/ failure modes (kimi-k2.6 404 confirmed) |
| bauka0/nvidia-nim-provider | 11 | per-key-fingerprint catalog, failover, Copilot picker |
| lizhebio/nim-qwen-model-router | 0 | 404-handler, NVCF asset-upload helpers |
| shaivpidadi/freeridev3 | 47 | 403-auth mapping, plain-404=MODEL_NOT_FOUND, curated allowlist + override env |
| nezerkc/opencode-provider-nvidia-nim | 2 | 42+ model opencode provider |
| joeldg/nvidiarouter | 1 | OpenAI gateway, multi-key rotation, terminal dashboard |
| h0rcrux/hermes-backup | 0 | SKILL.md: verified-working model table, writer/palmyra 404-despite-listing note, HEAD-vs-POST 404 gotcha |
| diegovisk/pi-nvidia-nim | 2 | 82 curated models, per-model transforms, sticky router w/ fallback chain, rate-limit retry |
| david-eve-za/nvidia-nim-mcp | 1 | MCP server for NIM |
| xRyul/pi-nvidia-nim | 49 | pi coding-agent extension |
| olszalsik/a0-nvidia-nim | 0 | provider plugin contract |
| Sateeshreddymaddi/Custom-Nvidia-Nim-Node | 0 | n8n node, 17 chat + 5 embedding models |
| rickeshtn/nim-code | 0 | historical: kimi-k2.6 "6/6 on stress suite" (~87d ago — dates the decommission window) |
| lucky-mandator/gocode-router | 0 | NVCF-AI-Resource header pattern |
| gabriel-ferraresi/NIMGEN | 0 | NIM FLUX MCP server (image lane) |
| iammalego/keymux | 2 | key-pool w/ 429 rotation (badge-only for NIM — no code) |

## Web-wide finds (non-GitHub)

- **NVIDIA forum #379257** — kimi-k2.6 404, UUID `23d4f03a…` (seed of the whole audit).
- **NVIDIA forum #371967** — "Public API Endpoints" access-request thread; moderator: account permissions aren't granted via forum posts; fix path is fresh key from build.nvidia.com model page.
- **NVIDIA forum #376230** — 403-on-/v1 + org login loop; community workaround: delete key, regenerate.
- **NVIDIA forum #368740** — kimi-k2.6 infinite-repetition "!!!" bug thread (May 2026): model was live-but-degraded before decommission — brackets the death window (degraded May → dead early July).
- **BuzzRAG / StartupFortune** — kimi-k2.6 NVFP4 Blackwell release (May 13, 2026): the model lived on HF/NVFP4 while the hosted function died — catalog vs runtime schism in miniature.
- **No GitLab/Codeberg/SourceHut presence** worth mining — GitHub owns this space.
- **npm**: `nimgen` (NIM FLUX MCP), `pi-extension-nvidia-nim` (tibbee), `@sateeshreddy/n8n-nodes-nvidia-nim`, `@musistudio/claude-code-router`. No PyPI/crates NIM-hosted-API client of note found.

## The prize (novel, needs live testing)

1. **`NVCF-AI-Resource` header** (gocode-router) — may pin the NVCF function directly. Probe it.
2. **Key-creation scope** (big-agi) — "Public API Endpoints" is a scope selected at key *creation*; our dead keys may predate it. If we ever mint a fresh NVIDIA key, select the scope.
3. **Ghost-ID guard** (tibbee) — pin dead UUIDs so refreshes can't resurrect them; port into our allowlist manager.

## Mining method

`rank_repos.py` scored all 23 on recency (50%) + relevance (45%) + stars (5% cap),
penalizing archived and badge-only repos. Deepest extraction went to the top 20%:
NemoClaw, three.ws, claude-code-router (+ kondi, tibbee, freeridev3 on relevance).
Bulk UUID regex hits were filtered to live-capture provenance only — fixtures excluded.

## AST findings (ast-grep structural mining, 2026-09-20)

Ran structural (not text) queries across all repos: try/catch inspecting
status codes, client-call configs, model-map objects, switch routing,
retry/backoff, NVCF header literals. 1164 catch blocks scanned; NIM-relevant
subset below.

### Pattern → repos → meaning → WTF rating

**Structural 404-body classifiers (the rarest, most valuable pattern)**
- `NVIDIA/NemoClaw` — `isNvcfFunctionNotFoundForAccount` + POSIX ERE twin +
  reframed user message. Only repo that parses the 404 *body* instead of the
  status code. WTF: ★★★★★ — borrow verbatim, including the no-drift twin discipline.

**NVCF direct-plane usage (surface #2, the honest one)**
- `nirholas/three.ws` — `GET api.nvcf.nvidia.com/v2/nvcf/functions` (per-key
  entitlement list with `status` per function), `pexec/status` polling,
  `NVCF-POLL-SECONDS` / `NVCF-REQID` / `NVCF-INPUT-ASSET-REFERENCES` headers,
  `ai.api.nvidia.com/v1/genai/...` invoke URLs, 502/503/504 gateway retry with
  backoff, `lane_unavailable` → 503 mapping that never leaks upstream detail.
  WTF: ★★★★★ — the only repo that talks to NVCF directly; its verify-*.mjs
  scripts are the template for our entitlement probe.

**Custom header injection toward NIM**
- `lucky-mandator/gocode-router` — generic per-provider custom headers;
  `example.config.yaml` demonstrates `NVCF-AI-Resource: "moonshotai/kimi-k2.5"`.
  WTF: ★★★★☆ — novel, untested; one probe decides.

**Model maps / fallback chains (what authors believe is live)**
- `nirholas/three.ws` `api/brain/chat.js` PROVIDERS (31 ids), `api/_lib/chat-models.js`
  MODEL_CATALOG — curated, excludes dead lanes.
- `thispointon/kondi` `mcp-connect-mvp/src/config/models.ts` — curated with
  *exclusion comments* naming 4 dead models + failure modes (strongest signal:
  authors recording what NOT to route to).
- `stillhue/claudio` `test-provider-auto-router.js` — nvidia provider cfg with
  auto-routing test harness.
- `bauka0/nvidia-nim-provider` — per-key-fingerprint catalog, failover chains.
- WTF: ★★★★☆ — exclusion lists are more informative than inclusion lists.

**Stream hardening (bauka0)**
- `src/provider/stream-pump.ts`, `turn-executor.ts`, `chat-provider.ts` —
  catch blocks handling empty streams, thinking-only turns, SSE error objects,
  fallback budgeting. WTF: ★★★☆☆ — useful for our client robustness.

**Retry/backoff**
- Mostly generic (SSE reconnect, daemon respawn). NIM-specific: three.ws
  `upstream-fetch.js` honors `retryAfter`; NVCF gateway retry on 502/503/504
  (cold-model 504 is the most common transient — retry lands on warmed nodes).
  WTF: ★★★☆☆ — note Chris's no-artificial-delay doctrine: these are
  *response-driven* retries (honor server's retryAfter / 202-poll), not sleeps.

**What AST found that grep missed**
- The `try { $$$A } catch ($E) { $$$B }` sweep confirmed only NemoClaw and
  three.ws structurally branch on NIM error *bodies*; everyone else branches on
  status codes or nothing.
- No repo constructs requests to any host other than `integrate.api.nvidia.com`
  for chat — except three.ws's NVCF/genai surfaces. The ecosystem has a
  single-point-of-failure mental model; the workaround space (surfaces #2/#3)
  is essentially unexplored.

### Ranking feed

ast-grep hits now feed `rank_repos.py` relevance: +10 for structural 404-body
handling, +10 for NVCF direct-plane usage, +5 for NVCF header experimentation.
