---
title: "DSML degraded-markup tolerance + forward todos (bar-run anomaly, tokenizer ground truth, judge lane)"
author: tau
status: DONE (by daemon, 2026-11-02T08:13:58.398Z)
unique-id: ${TS}-tau-dsml-and-forward-todos
urgency: normal
---

# Landed this session (all pushed)

- DSML scanner: shape-based recognition (bar-runs, drifted words, omit-START
  per vLLM #48931) — tau 973f84c54c, 103/103 dialect suites. Docs: estate
  dsml-01/02/03 series (4d06587637).
- Judge lane: freeinference/qwen3.6-35b primary + pinned fallback chain;
  credential-aware native prune (online fallbacks survive when native has no
  auth) — tau 2de26eb0c9. find-cli settings-root fix — tau 63792cb5f7.
  Binary rebuilt; find verified live (judged 1, 0 failures).
- TaaS re-auth: Nagram chat 777000 lane; helper + managed skill (arroyo
  5185d28/a5a97d3, azurite 05568d4).
- botfather-lib: clean public capability repo (9 tests); arroyo flipped
  PRIVATE per repo public/private doctrine (private-skills/ dir azurite
  5d969b5 + 8b88857).
- mimetite: standalone-rebase restoration — resolveContext un-orphaned,
  provenance pinned, d.ts emit in build, bornite consumer synced; 114/114
  (2c76705). estate-skills-wiring TDD (tau bddb7c63ec); kappa custom dirs
  (olympus 249e0e7).

# Forward todos

1. [ ] DSML: `dsml:` lowercase family (vocab 128840/128841) — same shape
   tolerance; not yet seen leaking. Add scanner coverage + tests.
2. [ ] DSML: freeinference upstream vLLM build pin/rollback check (NVIDIA
   thread class) — ops lane, needs the architect or server-side access.
3. [ ] judgeRoleChain prune contract: currently keeps online fallbacks only
   when native has NO configured auth. Consider whether a native WITH auth
   that 402s at runtime should also fall through (quality contract vs
   ecosystem liveness) — architect decision.
4. [ ] find.enabled: auto + hasNativeJudge: consider credential-aware gate
   (find mounts only when a judge can actually authenticate) — pairs with #3.
5. [ ] tokenizer.json refresh cadence on-box (TTL) — /tmp/deepseek-tok is
   ephemeral; move to a durable estate cache.
6. [ ] LG SLATE install+verify (5.35) — TV alive via ssh alias `lg-tv`
   (10.0.0.176:9922 prisoner); ares-install lane per lg-webos-deploy skill.
7. [ ] kappa dsml: kappa-code may need the same bar-run scanner tolerance
   (it parses its own DSML); audit + port the shape fix.
8. [ ] Star-whore sweep: public repos' descriptions/READMEs — plain
   user-facing language, zero trademark leaks (DMCA surface) — see
   private-skills/github-repo-polish.

## Done
- marked-by: daemon
- marked-at: 2026-11-02T08:13:58.398Z
