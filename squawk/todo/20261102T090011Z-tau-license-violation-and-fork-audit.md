---
title: "FORK LICENSE VIOLATION AUDIT — upstream token LEAKED in git remote URL + 6 suspect forks"
author: tau
status: DONE (by daemon, 2026-11-02T09:00:11.709Z)
unique-id: 20261102T090011Z-tau-license-violation-and-fork-audit
urgency: CRITICAL
---

# 🚨 CRITICAL: GitHub token EMBEDDED in git remote URL (PUBLIC repo risk)

`claude-night-market` + `devloop` remotes carry:
`https://x-access-token:ghp_CDuc8s…[REDACTED]@github.com/athola/claude-night-market.git`

A GITHUB PAT (`ghp_CDuc...`) is EMBEDDED IN THE GIT REMOTE URL. If any of
these repos is public and the remote URL leaks (fork metadata, CI logs,
git config dump), the token is exposed. The token was rotated earlier
(anomaly #84: GH tokens invalid box-wide) — VERIFY dead; if not, rotate NOW.

Actions:
- [ ] Verify ghp_CDuc... is dead (401 via API probe)
- [ ] Rewrite both repos' remote URLs (strip token)
- [ ] Check the token never entered git history of any PUBLIC repo
- [ ] Keyring SSOT for tokens (secretsmith, never URL-embedded)

# Fork license violations (6 suspects)

| product | upstream | estate LICENSE | upstream LICENSE | verdict |
|---|---|---|---|---|
| claude-night-market | athola/claude-night-market | MIT | ? (check) | fork — verify upstream license + attribution |
| devloop | compforge/devloop | **NONE** | ? (check) | **VIOLATION: no LICENSE at all** |
| outsource | midagedev/outsource | MIT | ? | check |
| pdfshield | purvalsingh/pdfshield | MIT | ? | check |
| stealthprint | majiayu000/stealthprint | MIT | ? | check |
| super-board | EricTechPro/super-board | MIT | ? | check |

Checks:
- [ ] Fetch each upstream's LICENSE; if GPL/AGPL → estate MIT relicense is ILLEGAL
- [ ] If upstream MIT → retain upstream copyright line + add attribution
- [ ] devloop: add LICENSE immediately (or archive the product)
- [ ] serum-fork-private model: trademark-risky forks go PRIVATE (already doctrine)

## Done
- marked-by: daemon
- marked-at: 2026-11-02T09:00:11.709Z
