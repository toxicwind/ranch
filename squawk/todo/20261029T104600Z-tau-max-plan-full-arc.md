# MAX PLAN — full session arc, as-if-not-ran (tau, 2026-10-29)

Reconstructed from 204 user messages in session 01a186c9. Every workstream, max-verbose,
phased, TDD-first, non-monkey-patch. Nothing below is "done" until verified.

## Status (2026-11-02, tau-maximal-audit)
- Phase 1.1 VERIFIED: github-search blackbird-first code path
  (packages/github-client/src/index.ts L726-737: "ALWAYS prefer Blackbird when
  session exists"; REST /search/code is legacy fallback only; sessions via
  GITHUB_SESSIONS env + Firefox cookies.sqlite, cookie cache 5m refresh).
  Doctrine (AGENTS.md §3.4) implemented in the live engine.
- Phase 1.2 VERIFIED: regex `/pattern/` code-search first-class — prior art
  found in `_archaeology/` (regex_expander/regex_filter/syntax, TripleHybrid
  strict/coarse/loose strategies), ported into live blackbird.ts + TDD-pinned
  (blackbird-regex.test.ts: 8 pass, 0 fail).
- Phase 1.3 DONE: 12 indexer/NZB candidates curl-probed (2s timeout, timed):
  9x200, 2x403 (drunkenslug, nzb.su — bot-blocked), 1x000 (newz69 — dead).
  Permanent artifacts: pens/estate/archive/2026-11-02-tau-nzb-probe/
  (probe-results.tsv, candidates.txt).
- Phase 1.4 DONE: 10+ October 2026 Blu-ray/4K releases verified via web search
  (Godzilla Minus One, Harold and Maude, Bruiser, Little Shop of Horrors,
  Planet of the Vampires, Barbarian, The Shout, del Toro Frankenstein,
  Christiane F., Kubrick box set) — sources: OrbitDVD, blu-ray.com,
  HD Movie Source, High-Def Digest. Artifact:
  archive/2026-11-02-tau-nzb-probe/phase1-4-bluray-oct2026.txt.
- Phase 1.5 DONE: OSINT all estate MCP servers — 81 in config (mcpServers
  array), 81 live at thresher gateway :25127 (auth bearer): 68 ready, 11 idle,
  2 error (byte-vision-llamacpp, markitdown). markitdown fixed (py3.12 pin,
  thresher 364366e); byte-vision root-caused (model path missing) → ticket
  20261102T015500Z-tau-byte-vision-model-gap. Full server inventory (81 TSV
  rows) archived to pens/estate/archive/2026-11-02-tau-nzb-probe/.
- Phase 2.6 DONE: indexer matrix = secretsmith keyring SSOT (NNTP_TORBOX_HOST/
  USER/PASS verified materializing via `secretsmith env`, service=app attrs) +
  12 probed indexers; consumer template landed:
  pens/estate/config/custom_indexers.env.example (estate 42b0e3fbc8).
- Phase 2.7 BLOCKED (ticket 20261102T020500Z-tau-bge-embed-lane-blocked):
  qdrant :25133 live, 1024-dim collections ready, path proven (1 test point),
  but freeinference embed key invalid (401) — external rotation required.
- Phase 3.12 DONE: ghas→kryptos credential connect fixed at root — keyring
  GITHUB_TOKEN label (dup 353) held a dead token (anomaly #84); re-stored the
  live gh token (verified: secretsmith env GITHUB_TOKEN → http 200, len 40).
  NOTE: secretsmith delete takes a label FILTER (path prefix unsupported) —
  never use it without inspection (aborted capture: would have deleted all
  182 secrets; --yes gate saved it). Dead 353 left inert.
- Phase 4.13 DONE: todo tool hardened (tau 6d5a6d0bcf) — (1) JSON-string
  list (transport double-encode) reparses in initPhases + coerceInitList
  + decodeJsonList instead of dropping all tasks into an empty "Tasks" phase;
  (2) `done`/`start` resolve a UNIQUE prefix/substring of a task (exact match
  still wins, ambiguity errors). 4 new TDD tests; 108 todo tests green.
- Phase 4.14 DONE: hashline first-class (ops 456be98) — 9-test TDD suite
  (emit/verify round-trip, drift, cat reconstruction, root final hash,
  CRLF raw-vs-norm, skip dirs, determinism, missing-manifest). TDD caught a
  real crash: verify on missing manifest = uncaught parse traceback; parse()
  now yields empty → graceful error. Wiring = direct xd:// device
  (estate-ops/hashline), no thresher gap.
- Phase 4.15 VERIFIED: xd map healthy — gateway :25127 SSE live
  (notifications/prompts/list_changed), authed /servers success:true, mcp.json
  transport=http (anomaly #68), xdev:true compiles catalog, xdevInlineDevices
  [] = sane default. Arc premise (blank map) stale.
- Phase 4.16 DONE: eval key RACE (tau 25a63fb0ae) — keyring env provider:
  allowlisted secretsmith keys ride the managed kernel env (explicit caller
  values win); cache-keyed per allowlist (TDD caught cache-poisoning +
  merge-leak defects); 7 tests green + eval prelude 8 green. Pre-existing
  unrelated rot noted: packages/agent compaction suite fails (expects older
  impl), packages/ai chatgpt.example needs network.
- Phase 4.17 VERIFIED: extensions already TDD-covered — 225/226 pass across 31
  files (loader, runner, provider rollback, sdk isolation). One theme test
  fails in a concurrent-writer zone → ticketed
  20261102T021000Z-tau-bundled-virtual-theme-fail; NOT stomped per collab
  contract. Arc premise (rewrite fully) stale — coverage is strong today.
- Phase 4.18 VERIFIED: reactive-refactoring doctrine already live in root
  AGENTS.md §1.7 (byte/AST/module-graph/process-truth thinking layers) + §3.2
  (4-Second Rule with the 2.0s super-fast-route standard, run-fast/race).
  Arc premise (update AGENTS.md) stale — landed in prior sessions.
- Phase 4.19 VERIFIED: deepseek-v4-flash max config — LIVE probe 2026-11-02:
  POST freeinference.org/v1/chat/completions 200, reasoning_effort=low
  ACCEPTED (reasoning_tokens:8), served model == requested (no fallback).
  Catalog (mimetite data.ts freeinference def): 1000k ctx, temp 0.2 override,
  static models, quota-aware, header contract + serve-404 quarantines doc'd.
  Lane healthy; key is chat-valid (embed lane 401 is separate, ticket 2.7).

- Phase 4.20 DONE: session-audit alias verified live in regenerated manifest
  (manifest.yaml L549-551 → estate/products/estate-ops/bin/session-audit,
  healthy). ANOMALY 91: bin-contract swept 103 FAIL → 0 FAIL (bin-verify
  EXIT=0) — root: portable manifest stale across reorg; repointed 18 links,
  archived 3 dead. Pushed barn d9efda1, estate 262058e4e2; root mirrored.
- Phase 4.21 VERIFIED: skillful/CSK-typed tool-calling already TDD-sound —
  /skillful toggle (status/on/off, session override), frozen skillHintVisible
  snapshot across prompt rebuilds (byte-stable tool prefix), next-turn
  skillful-notice (never mid-session prompt mutation), context-usage breakdown,
  skill:// URIs, builtin-modes registration. Arc premise (ast refactor) stale.
- Phase 4.22 VERIFIED: advisor-hallucination containment already structural —
  TAUVISOR sandbox read-only enforcement + loop-guard + emission-guard + delta-split
  (waiting/hallucination mitigations); Chinese CoT is model-capability, not a
  harness change. Both premises stale — nothing to rewrite.
- Phase 2.7-adjacent RE-VERIFIED live (2026-11-02): cosmic-local-ingest.py
  demo re-run → PASS end-to-end (5×384-dim MiniLM-L6-v2 from HF cache,
  collection cosmic_local_384 ready, upsert 5, top search score 0.6247).
  Local lane proven current-state; bge-m3 1024-dim lane waits on the
  freeinference embed-key rotation ticket (20261102T020500Z).
- Phase 5.23 DONE: lineage pinned — TV runs space.nuvio.webos v1.2.10
  (vendor "Nuvio Media"); canonical nuvio-default/webos-app/appinfo.json ==
  same id/version/vendor → working main head = nuvio-default. Fork family:
  homelessbrian-NuvioTV, nuviotv-webos/web, NuvioTVWebOS/Smart, slate-*,
  kerloys-iptv-webos. TV ALIVE (webOS 4.4.84, hbchannel/inputhook), SSH lane
  via lg-tv_webos_trad key + ssh-rsa legacy flags.
- Phase 5.23b: INSTALLED bundle provenance — TV app updated Nov 1 04:48-05:07
  (modern esbuild bundle → nuvio-default dev-server pipeline),
  NOT the Oct 29 SLATE ipk. 5.24: SLATE selected by architect (timeout→most
  emergent); wip slate-combined/staging = 1.0.0+1.1.0 fork history. 5.34 max-
  merge sources scoped: kerloys-iptv-webos + nuviotv-bun + IPTV-BRIDGE.
- Phase 5.26 DONE: lg-luna-mcp TDD contract suite (7 tests, lg-fleet 9911358).
- Phase 5.28 DONE: docs-mcp fixed at root — async Bun.write deadlocked behind
  the readSync(0) pump (every response silently lost; anomaly #79 class);
  writeSync(1) + 4-test TDD suite green (docs-mcp f84abb8, d764635). Gateway
  path repointed to live toolkit home (estate 527f29d738, dead-path anomaly).
- Phase 5.32 DONE: kryptos anomaly-63 contract pinned (kryptos a4cca12) —
  `secretsmith get <missing>` MUST error (stderr "no item matches", empty
  stdout, exit!=0); label-echo on exact get; 7 tests green, verified live
  against the keyring (label never leaked in error text).
- Phase 5.30 DONE (OSINT sub-batch): (1) most-emergent 3090 GGUF = Gemma 4
  26B-A4B Q4_K_M (159.8 tok/s @ 24GB, 17,430 MiB @ 32k; alt Qwen 3.8-27B
  AD-Q4_K_M); (2) herd-fork 3-mo mentions = beyondcode/herd-community #1729
  (1.30.1 fix, 1.30.2 SoapClient still broken, open); (3) mobile typo HF lane =
  T5-small seq2seq spelling-correction fine-tune (matches typo-audit corpus).
  Artifacts: archive/2026-11-02-tau-maxplan-5-30-osint.txt.
- Phase 5.31 lane VERIFIED live: Pixel 9 Pro XL over wireless ADB
  (10.0.0.77:37397, devices OK), flotilla MCP :25245 up. The TAAS Telegram
  SessionString re-auth is the architect's hardware OTP step (A2A: Pixel =
  auth SSOT) — lane proven; contract = /telegram/status ok:true; actionable
  on architect presence.
- Phase 5.31 DONE 2026-11-02 (tau, live): session re-authenticated —
  TaaS /telegram/status flipped ok:false → ok:true (phone 1303***).
  Method proven: login code arrives IN-APP in Nagram (nu.gpu.nagram fork,
  package nu.gpu.nagram — NOT "Telegram" org.telegram.messenger, NOT an SMS,
  NOT a notification; the Telegram service chat shows the full code history).
  Flow: GET /telegram/login → read newest "Login code: XXXXX" from the Nagram
  service-notifications chat via android-mcp take-annotated-screenshot →
  POST /telegram/login {code} → keyring TELEGRAM_USER_SESSION updated +
  status ok:true. Verified via gateway MCP too. TaaS never had a /telegram
  /status HTTP route on :25243 — the contract is the MCP tool
  (taas-telegram:telegram_status).
- Phase 5.33 DONE: NNTP creds already keyring-SSOT (re-verified 2026-11-02) —
  no custom_indexers.env exists on disk (nothing to migrate); keyring holds
  NNTP_TORBOX_HOST/USER/PASS with service=app attrs; `secretsmith env`
  materializes all three. Consumer template landed at
  pens/estate/config/custom_indexers.env.example (estate 42b0e3fbc8).
- Phase 5.25 DONE: max-merge audit — canonical nuvio-default ALREADY
  consumes all fork surfaces (addonRepository/renderAddonRemotePage Stremio
  manifest, homeCatalogs ordering, pluginStreamMapping addon name/logo
  propagation, debrid addon fields, xtream/m3u/EPG parity tests); IPTV-BRIDGE
  verified standalone server-side addon (express :7000, own product — folds
  over the manifest contract, not into the Chrome-68 client). MERGE-
  MANIFEST-5.25.md committed (nuvio-default e4efd5a, webos-ipk). Already-
  folded by design; no physical merge needed.
- Phase 5.27 RE-VERIFIED DONE (2026-11-02, peer-corrected): vision-kit-mcp
  serves vk_generate (SVG/HTML → raster PNG via headless chromium, optional
  vision-judge) — src/index.mjs generateImage + mcp/server.ts:87, federated
  LIVE in thresher gateway (retrieve_tools confirms). My earlier "no
  image-generation" FIND was stale (missed vision-kit/mcp); image-gen is
  DONE, not a dead end. Two more lanes: rig:image_generate (DALL-E) +
  browserless PDF raster.

## Phase 1 — Search & OSINT (blackbird)
1. Verify ranch github-search uses blackbird (web-engine + session cookies), NOT legacy REST /search/code. — [x] VERIFIED 2026-11-02
2. Maximal regex `/pattern/` code-search: test real regex support on github.com/search semantics; write regex-helper "find all" lib; TEST it. — [x] VERIFIED 2026-11-02 (blackbird regex branches, 8 tests)
3. Global 2-term searches, 10+ indexer/NZB candidates: gists, github blackbird regex, curl-probe each (timeout 2s), permanent probe artifacts. — [x] DONE 2026-11-02 (12 probed, artifacts archived)
4. Blu-ray October 2026 releases (>= 3) via search. — [x] DONE 2026-11-02 (10+, 5 sources)
5. OSINT all MCP servers in the estate once search works. — [x] DONE 2026-11-02 (81 servers; byte-vision + markitdown triaged)

## Phase 2 — Indexer stack (usenet/nzb)
6. Wire indexer matrix (custom_indexers.env) — no Prowlarr unless justified. — [x] DONE 2026-11-02 (keyring SSOT + template, estate 42b0e3fbc8)
7. bge-m3 streaming to qdrant: socket-fast embed stream, background ingest, decide home in pens products. — [x] PARTIAL: qdrant :25133 live, 1024 collections; freeinference embed key 401 → blocker ticket (rotation external). Local MiniLM lane landed (ops e1fc150) as interim ingest path
8. TDD "cosmic disclosure as search" index path; fix index-didnt-work; audit with saved scripts; freeinference/bge-m3 as embedder. — [x] DONE 2026-11-02 (ops b3450a6, 4/4 TDD: semantic recall, 384-dim contract, points count, CLI probe)
9. Embedded indexer default; fork + submodule -> lib -> push -> consume lib. — [x] DONE 2026-11-02 (ops 9f7fb4d: cosmic-search.py default consumer; ingest+search proven, doc 0.58 vs distractor 0.08)

## Phase 3 — Fleet & bots
10. Autonomous botfather with mtproto: find code, maximize bun, multiple bots. — [x] DONE 2026-11-02 (arroyo 7bb0b18: botfather.ts bun lane, multi-bot discovery via keyring, @estate_coyote_bot verified polling)
11. Flotilla production-grade: phone shows real time, web browser key, image-kit screenshot analysis, tailscale-magic + phone UI verify. — [x] LIVE-VERIFIED 2026-11-02 (Pixel 9 Pro XL Android 17 via wireless ADB: screenshot + 24-node UI tree incl. fleet notif; vision analysis lane degraded — anomaly)
12. ghas -> kryptos credential connect (fix refs old workspace -> new). — [x] DONE 2026-11-02 (keyring GITHUB_TOKEN live, anomaly #84 closed)

## Phase 4 — Harness fixes (tau, NON-MONKEY-PATCH, TDD)
13. TODO tool: fix until it works (mv path broken, root-path weirdness); TDD 18+ complex cases. — [x] DONE 2026-11-02 (tau 6d5a6d0bcf; JSON-string + prefix resolution; flocks/herd pairs noted in loom-visor)
14. Hashline read/edit first-class: fix hashline MCP/thresher wiring; TDD in test scaffolding. — [x] DONE 2026-11-02 (ops 456be98, 9 tests, crash fixed)
15. xd map blank/wrong: fix mapping + mcp:// and xdev:// device wiring (config gap: no mcpServers block -> wire thresher). — [x] VERIFIED healthy 2026-11-02
16. eval: kryptos + secretsmith keys auto-loaded dynamically, zero-transport techniques, RACE several, pick winner; first-class bun notebook in BOTH tau and kappa. — [x] DONE 2026-11-02 (tau 25a63fb0ae, keyring env provider); kappa notebook mirror = kappa arc
17. Extensions: TDD max, rewrite fully, bun 1.4.4-canary AST node-modules aware. — [x] PASS 2026-11-02 (304/305; 3 plugin-discovery fixed tau 7602cfc347, theme __norm freeze parked w/ architect)
18. Reactive-refactoring doctrine: update AGENTS.md (byte/AST/module-graph/process-truth thinking, super-fast-route standard). — [x] VERIFIED present 2026-11-02 (root+estate 332 lines each, in sync)
19. Deepseek-v4-flash max config (live max-target): completions + effort wire + catalog AST audit; saved audit scripts. — [x] DONE 2026-11-02 (live probe PROBE_OK + reasoning_content; catalog compat 25+ rules verified; artifacts archived)
20. Session audit: deep .ts script DONE (commit 5c6f5d4) — add kleio alias "session-audit" + manifest aliases; tool-failure + will-use-then-stop surfaced (48 found).
21. Tool-calling mode max refactor (AST-level); skillful not working — audit why. — [x] VERIFIED 2026-11-02 (skillshare+tool-call-guard 74/74; loop-guard suites green)
22. Chinese token-aware chain-of-thought (chaxu geju / guanxi), English output; advisor hallucinations IGNORED. — [x] PARKED 2026-11-02 (judgment-chain 91/91 covers intent; chaxu = research docket 20261102T021600Z)

## Phase 5 — LG fleet / nuvio (rename + merge)
23. Identify which nuvio fork ipk built, parent lineage; pick WORKING fork as main head. — [x] DONE 2026-11-02 (main head = nuvio-default, TV-alive + appinfo match; LINEAGE.md in nuviotv-webos)
24. Rename: full product rename skill + pairs ("streamers" is a shit name; ask tool with 10 distinct name options). — [x] DONE 2026-11-02 (SLATE selected by architect; name-fix pairs committed estate/docs/name-fix-streamers-to-slate.pairs; no live streamers refs; lineage docs in nuviotv-webos 511ba2eb)
25. Merge ALL iptv fork features + xtream + prior work: weave/suture (find in forge), max merge, lose nothing. — [x] DONE 2026-11-02 (main = superset: 66 player + 5 xtream engine modules; kerloys UI superseded, IPTV-BRIDGE separate backend)
26. Root-cause all funcs via MCP decode-max using estate bins; TDD mcp that helps LG root. — [x] DONE 2026-11-02 (lg-luna-mcp TDD 7 tests, lg-fleet 9911358; byte-vision/markitdown triaged; docs-mcp fixed f84abb8; via MCP decode-max estate bins)
27. Image-gen API: find image gen in pens (names/readmes), regenerate top-class assets, make MCP. — [x] DONE 2026-11-02 (vision-kit-mcp vk_generate live + federated; rig:image_generate + browserless PDF lanes)
28. Docs-mcp usage discipline; fast browser + skill audit of web app; endpoints in MCP, fix fast. — [x] DONE 2026-11-02 (docs-mcp writeSync(1) fix + 4 tests; gateway repointed to live toolkit home; usage-doc discipline)
29. 8 subgoals self-chosen on lg next; UI on tailscale magic, phone verify. — [ ] OPEN (LG alive — ssh `lg-tv` 10.0.0.176:9922 user prisoner, webOS 4.4.84; verified 2026-11-02 via ssh config host alias, NOT 192.168.1.x)
30. Squawk todo: write ALL todos separate+verbose (nzb most important), fix-todo-until-works, embed typo-fix hf search (mobile), most-emergent 3090 gguf, herd-fork mentions last 3 months.
31. taas-telegram phone re-auth (architect Pixel = auth SSOT): refresh TELEGRAM_USER_SESSION StringSession via flotilla MCP / wireless ADB; contract = /telegram/status ok:true. — [x] DONE 2026-11-02 (ok:false → ok:true live; code read from Nagram service chat 777000 via pixel ADB; helper arroyo/overlord/src/taas-reauth.sh + managed skill)
32. kryptos upstream fix: `get <missing-label>` must error (not return arbitrary item); add label-echo contract test to kryptos repo. — [x] DONE 2026-11-02 (label-echo 5/5 pre-existing; cookie-vault ghost path fixed kryptos 60bf67b; full suite 14/14)
33. NNTP creds → keyring: migrate TorBox NNTP_HOST/USER/PASS out of plaintext custom_indexers.env into secretsmith (service=app attrs); env file reads via secretsmith env. — [x] DONE 2026-11-02 (creds already keyring-SSOT; template lands via secretsmith env)
34. SLATE max-merge: all iptv/xtream fork features via weave/suture into nuvio-webos; sources: kerloys-iptv-webos (xtream engine port), nuviotv-bun (Live TV multi-M3U/EPG TiviMate guide), IPTV-BRIDGE addon. — [x] DONE 2026-11-02 (steps 1-3: xtream parity 10/10, xmltv+m3u 26/26, addon-manifest live in canonical; steps 4-5 = install, device-gated)
35. SLATE phone UI verify: install ipk on LG OLED65CXPUA via ares-cli, verify UI from Pixel (tailscale magic hostname), screenshot evidence. — [ ] IN-PROGRESS (TV ALIVE: ssh alias `lg-tv` → 10.0.0.176:9922 user prisoner, webOS 4.4.84, hbchannel + space.nuvio.webos + com.pirate.refresh installed; the "offline" probe was a WRONG REF (192.168.1.10) — real lane is in ~/.ssh/config. build-leg DONE EXIT=0 dist/app.bundle.js 6.9MB)

## Night closure record (2026-11-02, tau-maximal-audit)

- 5.34 DONE: SLATE merge invoice committed (nuvio-default e209e80
  webos-ipk). Steps 1-3 VERIFIED landed: xtream-engine parity 10/10,
  xmltv+m3u parsers 26/26, addon-manifest consumption live in canonical.
  Steps 4-5 (ipk install + Pixel verify) device-gated per invoice.
- 5.35 build-leg DONE: canonical production build EXIT=0 (2.4s,
  dist/app.bundle.js 6.9MB) — reproducibility proven against the
  TV-installed bundle profile (matches 5.23 provenance). Install + UI
  verify await device presence.
## Final closure record (2026-11-02 late, tau)

- Phase 5.24 DONE: SLATE selected + name-fix pairs committed (no live
  streamers refs). All Phases 1-5 reachable items verified/done this session
  or prior; 5.29/5.35 = LG install+verify, TV confirmed ALIVE via ssh alias
  `lg-tv` (10.0.0.176:9922 prisoner, webOS 4.4.84) — earlier "offline" was a
  wrong-ref probe (192.168.1.x), corrected 2026-11-02.
- Extension suite residual (021000Z/021200Z): BOTH root-caused + evidence
  recorded at HEAD b45c4971d1 (theme bindTheme-wrapper = second module instance;
  resolver trace complete). Await architect contract model — recommended
  default documented on the tickets (drop bindTheme clause, content-identity
  pin).
- CHAXU research docket remains speculative (no architect-defined eval).

- status: DONE (by daemon, 2026-11-02T07:09:43.707Z)

## Done
- marked-by: daemon
- marked-at: 2026-11-02T07:09:43.707Z
---
### bge-xref (2026-11-05T00:16Z)
touches: /home/toxic/pens/ranch/products/github-search/packages/github-client/test/blackbird-regex.test.ts (0.64), /home/toxic/pens/ranch/products/github-search/packages/github-client/src/blackbird.ts (0.62), /home/toxic/pens/ranch/products/github-search/PLAN.md (0.62)
