# THEME-DESIGN — Holder categorization for the ranch meta-manifest

> Prepared 2026-10-22 by the theme-design subagent (ses_e9ec586ecffecYJjOkMB5IbhfU).
> Grounds the `.meta-themes.yaml` repo→holder map in prior art and proposes the
> minimal-obtuse generator design + full 214-repo assignment. This is a **report /
> design doc**; it does not edit the generator or the theme data.

---

## 0. Paper-finder findings — grounding the "holders as bounded contexts" framing

One-sentence thesis carried through every design decision below: **a large repo
set should be sliced by domain responsibility (bounded context), not by
technical/structure layer, and the slice map is DATA the humans curate — not a
keyword lexicon the code guesses with.**

Prior art found (via the estate paper-poller racer, arXiv + OpenAlex/alphaXiv legs):

| #   | Reference                                                                                                                                                                                                                           | What it says about naming/slicing repos into domains                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **DDD strategic design — Eric Evans; «An Exploratory Study of Strategic Domain-Driven Design with Large Language Models»** (Springer LNCS ~2026, DOI 10.1007/978-3-032-28160-9_11)                                                  | The closest analogy to the "Greek-coded **holders**". Bounded contexts slice a system by **domain responsibility** and are **named after that responsibility** (Shopping, Pricing). The **context map** is a first-class, human-maintained artifact — never derived by code keywords. Decompose by domain ownership, **not** by tech layer or directory. → _The holder list = bounded contexts; the `.meta-themes.yaml` = the context map._ |
| 2   | **HiGitClass (Zhang et al.), ICDM 2019** — keyword/hierarchy-driven classification of GitHub repositories                                                                                                                           | Classifying large repo sets is only reliable when driven by **curated labeled seed data / a controlled name hierarchy**. A flat free-text keyword lexicon mis-classifies (same word, different domain). → _Prefer an explicit `repo→holder` map curated by a human over a keyword/prefix matcher in code._                                                                                                                                  |
| 3   | **«Microservice Decomposition via Static & Dynamic Analysis of the Monolith»** (ICSA-C 2020) and **«Decomposition of Monolith Applications Into Microservices: A Systematic Review»** (IEEE TSE 2023, DOI 10.1109/TSE.2023.3287297) | Both conclude the correct slice is **cohesive domain / bounded context**, and that the **decomposition artifact (the slice map) is kept separate from the mapping code**. Moving a repo into a domain is a data edit — an architecture decision, not a recompile. → _Dumb generator + explicit map is the industry-validated shape._                                                                                                        |
| 4   | **MUDABlue (Kawaguchi et al.), APSEC 2004 / JSS 2006** — automatic semantic categorization of open-source repositories                                                                                                              | Semantic clustering (LSI/topic) can _surface_ which repos are related, but the **named domain labels are human-produced**; automation only proposes groups. Named domains that stick are the ones a curator endorses. → _Use data I (and the earth's naming brain) curate; don't let a model invent holder names from tokens._                                                                                                              |
| 5   | **«The issue of monorepo and polyrepo in large enterprises»** (SIGSOFT 2019, DOI 10.1145/3328433.3328435)                                                                                                                           | Monorepo/team cognition is _improved_ when the top-level grouping is **meaningful domains**; a flat structural grouping (`submodules`, `tools`, `vendor`) adds no domain meaning and erodes shared cognition. → _`submodules`/`tools`/`vendor` are NOT holders — exactly the estate's constraint._                                                                                                                                          |

**Estates-specific grounding (local prior art, NAMING-THEMES.md):** the earth's own
naming brain (GNL `ambiguous` audit) already classifies the ~214 repos into ~5
strong themes (GREEK-letter/prefix/root, FLIGHT/BIRD, RANCH/FARM) and labels
everything else as "STRUCT-LABEL" or "GENERIC-ENGLISH". The holder list below
_reifies those themes into bounded contexts_ (decision in this design): Greek-coded
products → `olympus`, ranch/farm pens & build infra → `ranch-structure`, and the
non-themed-but-internal families get their own cohesive holders.

---

## 1. Minimal generator design — dumb generator, explicit map, general fallback

The generator (`toolkit/gen-meta-manifest.ts`) must contain **zero category
heuristics**. It:

1. Reads `.gitmodules` → the canonical 212 (212 submodule paths + `olympus` +
   `skopos` synthetic = 214 peer repos). **The map is keyed by the real `.gitmodules`
   path.**
2. Reads `.meta-themes.yaml` → an **explicit `path → holder` map** (data). Each entry
   lists a repo's top-level (or exact nested) path under its holder.
3. For every path: `map[path] ?? map[topLevelSegment(path)] ?? "general"`.
   - Flat precedence: exact path → top-level segment → `general`.
   - This one linchpin rule lets one line (`corral:`) classify every `<corral>/...`
     nested vendor pack without hand-listing each, while STILL being "data not code":
     the data author wrote `corral`, the code only resolves nesting.
4. **Unknown paths fall to `general`** — never an error, never guessed.
5. Wire the resolved holder into the generated `.meta.yaml` (each repo grouped under
   its holder, ordered deterministically; `general` last).

**Why this is minimal-obtuse:**

- Adding a repo = one data line. Re-theming a repo = move one line. No recompile, no
  heuristics to race against real intent (per Refs 1, 2, 3 above).
- `submodules`/`tools`/`vendor` **never appear as holders** — those repos fold into a
  holder by role (per SIGSOFT'19 and the estate constraint). E.g. `vendor/tailnet-doctor`
  → `general`, `tools/c8` → `general`, `gavel/vendor/*` → `oracle`.
- The `prefixes:` block in the current `.meta-themes.yaml` (nim, websites) is fine as a
  convenience for _structural containers whose members are homogeneous_, but it must be
  whitelist-only and audit-gated — it is a data shape, not a free-text guesser.

**Draft `gen-meta-manifest.ts` shape (data-first):**

```ts
const map = readThemes(); // path -> holder from .meta-themes.yaml
const holder = (p: string) => map[p] ?? map[topLevel(p)] ?? "general"; // exact -> top-level -> general
```

---

## 2. The proposed holders + the 214-repo assignment

**Holder list (13 bounded contexts; names = domain responsibility, per Ref 1/4):**

| Holder            | Responsibility (bounded context)                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `olympus`         | Greek-coded first-class products (the pantheon: τ/κ/kilo/muse/keryx/hodos/kairos/kryptos/skopos + mythic siblings) |
| `ranch-structure` | the venture's own pens, shelters, build infra (ranch motif)                                                        |
| `gatehouse-mcp`   | connectivity: MCP servers, proxies, gateways, key-routers                                                          |
| `oracle`          | agent-market: bidding, auctions, debates, task allocation                                                          |
| `corral`          | orchestration: multi-agent fleet control, control planes                                                           |
| `estate-ops`      | estate-level ops, monitor, scripts, shell, dispersal, tooling                                                      |
| `herd`            | models & inference: llama.cpp, NIM, serving, providers                                                             |
| `nim`             | nvidia-NIM provider/router research cluster (homogeneous container)                                                |
| `websites`        | deployed public sites (dockerd web deployables)                                                                    |
| `skills`          | authoring: guides, skill-hub, classifier-safety, naming audits                                                     |
| `research`        | audits, hunts, labs, experiments, benchmark projects                                                               |
| `security`        | secrets, trust gates, stealth, hardening                                                                           |
| `general`         | **fallback** for anything not explicitly mapped                                                                    |

**Coverage: 214/214 mapped (167 explicit + 47 `general` fallback).** Verified against
`.gitmodules` (212) + synthetic `olympus`/`skopos`. Zero stray keys.

### `olympus` (15) — Greek-coded products

```
agon antilogos arroyo chronos-forge didymos hodos kairos keryx kilo kryptos
muse-cli olympus skopos tau-verify tau/tau-extensions
```

### `ranch-structure` (16) — the venture's pens & build infra

```
barn barn/corral barn/flatbread barn/nativelink barn/rosec barn/weave barn/weave-sub
borrowed/herdr corral flicker forge forge/router/weasel forge/web herd herdproof-bun skillforge
```

### `gatehouse-mcp` (15) — connectivity

```
OmniRoute VansRouter bridge doorbell identity-router mcp mcp/mcp-prompt-injection-detector
mcp/mcpproxy-go mcp/pd-mcp-standalone mcp/rsync-mcp mcpproxy-go null-g-proxy
session-bus-refresh universal-keypool-bun universal-keypool-gateway
```

### `oracle` (10) — agent-market

```
duel/vendor/argus-ai-debate duel/vendor/ChatEval duel/vendor/debate-or-vote
duel/vendor/llm_debate gavel gavel/vendor/agora gavel/vendor/auction-agent11
gavel/vendor/contract-net-router outsource trading-post
```

### `corral` (12) — orchestration

```
android-fleet dots-client drover extensions/drover fleet fleet-chat fleet-ops fleetd
kodi-fleet mission-control super-board workmux
```

### `estate-ops` (26) — estate-level ops

```
ai-merge-resolve cron-trust dashboard dedicated/dedicated-server-ops estate-chat
estate-dispersal estate-dispersal-monolith estate-end4 estate-hatch-toolkit
estate-kappa-plugin estate-monitor estate-recon estate-scripts-dispersal
estate-scripts-end4 estate-scripts-scripts estate-scripts-skills estate-shell
estate-skills estate-skills-hub estate-whoa-breakthrough host-proof ledger ops
pack-fix paper-poller toxicwind-repos
```

### `herd` (7) — models & inference

```
godzilla-llama.cpp hf-model-sync ml-serve nvidia-alive nvidia-kernel-guard
nvidia-nim-model-probe openrouter-probe
```

### `nim` (27) — nvidia-NIM provider/router cluster

```
nim-inkling-api-research nim-omnibus nim-repos/* (all 25 vendor mirrors)
```

### `websites` (4) — deployed sites

```
websites/arlockworks/app websites/arlockworks/main
websites/effusionlabs/main websites/effusionlabs/tickets
```

### `skills` (7) — authoring

```
agent-customization-style-guide bash-style-guide classifier classifier-preflight
naming-audit outlier-toolkit safety-review-gate
```

### `research` (22) — audits, hunts, labs, benchmarks

```
AgentForensics bench-radar bugbounty disparate-latent-experiment dualspace-ast-bm25-hybrid
emergent fanout fast-race ferret-den ffs-diff furlong/vendor/RACE furlong/vendor/SRank-CodeRanker
furlong/vendor/coder_reviewer_reranking furlong/vendor/speed-run gayxxx-estate
meta-research-toolkit metaaivm metaaivm-profile metaclaw-runtime refusal-hunt
roundup-site wezterm
```

### `security` (6) — secrets, trust, hardening

```
keep leakfix-src pdfshield rust-wrappers secretsmith stealthprint
```

### `general` (47) — fallback (not explicitly mapped; listed for transparency)

```
ast-grep-rules auto1m awesome-free-ai-coding borrowed/loom campfire codebase-memory
computer-use-linux examples extensions freebuffet ghq github-search gito hatch
hatch-decode hatch/kite-cli kimi-auto kimi-claw lasso lib loom matter-server maw
mesh mesh/pylae nuvio oh-my-pi openfang openfang-join opsis pearlctl phone-lane
phone-ocr-sweep pinax pj-fast plugin-ecosystem plugin-ecosystem/agentpluginzoo
ralph-dashboard repo-first-class rig strudel-dev-vite strudel-sampler-server-vite
submodules/phone-sentinel tok tools/c8 vendor/tailnet-doctor zed-android-port
```

**Honesty note:** the 47 in `general` are intentionally _not_ forced into a holder.
Per Refs 2 & 4, forcing ambiguous names into themes produces worse signal than a clean
`general` bucket. Several are defensible flip-candidates for a future slice (e.g.
`hatch`/`hatch/kite-cli` → `gatehouse-mcp` or `corral`; `kimi-auto`/`kimi-claw` →
`herd`; `rig`, `auto1m` → `research`/`estate-ops`). That curation is a human decision
and exactly the incremental rollout in §3.

---

## 3. Recommended incremental rollout — don't hand-write 214 at once

Do NOT ship the full map in one commit. The 13-holder / 214-map above is the **target**;
land it in a minimal, verifiable first slice, then grow by curation:

**Slice 0 — the skeleton (this already largely exists).** Ship the dumb-generator
(data-over-code, exact→top-level→`general`) into `gen-meta-manifest.ts` with a
`.meta-themes.yaml` that carries **only the rock-solid, high-confidence holders**:
`olympus`, `ranch-structure`, `websites`, `nim`, `general`. Everything else lands in
`general`. This is ~55 explicit lines, fully verifiable, zero guessing.

**Slice 1 — the "obvious internal families" (next, safe).** Add `estate-ops`,
`gatehouse-mcp`, `corral`, `herd`, `security`, `skills`. These are unambiguous from
names/roles (the earth's naming brain + AGENTS.md already assert most of them). Adds
~85 more lines; still zero ambiguity.

**Slice 2 — the judgement call.** Add `oracle` (gavel/duel/trading/outsource packs),
`research` (the `*-vendor/*` swapped-in experiment repos, ferret-den, ffs-diff, etc.),
and decide the `general` flip-candidates (hatch/kite, kimi-*, rig). Land **one holder
per commit** with a short "why" line in the commit body, so a future reader can revert
a single themed grouping if it proves wrong — this matches MUDABlue's "automation
proposes, humans name one group at a time" and DDD's "the context map is maintained
incrementally" doctrine.

**Rollout gates:**

- After each slice: run `bun toolkit/gen-meta-manifest.ts` and confirm every path still
  resolves (total = 214, `general` shrinks monotonically, no path ever disappears).
- Keep the `prefixes:` block **whitelist-only**; every nested member must be audited
  before it's allowed to ride a prefix into a themed holder.
- Never let a vendor/`submodules`/`tools` container name leak into the holder ORDER list
  (CAT_ORDER must be thematic only).

---

## Summary

- Grounded in 5 prior-art findings (DDD strategic design, HiGitClass, two
  microservice-decomposition reviews, MUDABlue, SIGSOFT'19 monorepo): slice by **domain
  responsibility**, keep the map as **curated data**, never a code keyword lexicon.
- Proposed **13 holders** named as bounded contexts and a complete, verified **214/214
  assignment** (167 explicit, 47 honest `general` fallback).
- Recommended rollout: **skeleton → obvious families → judgement-call holders** in small
  per-commit slices, each verified by regeneration, never hand-writing all 214 at once.
