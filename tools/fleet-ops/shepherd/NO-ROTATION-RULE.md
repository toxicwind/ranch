# No-rotation rule — standing law (Chris 2026-10-23)

"I will not be rotating anything." Rotation / reissue / resubmit of ANY
credential is NEVER a remediation step and NEVER an ask surfaced to Chris.

- Fix forward with EXISTING credentials, or route around.
- A "needs token reissue" report is a misdiagnosis — correct it, don't relay it.
- Recorded in AGENTS.md, SOUL.md, MEMORY.md (main agent's files).

Shepherd implication: if a future truth run finds a credential-shaped
problem (401s, expired pins, dead keys), the verdict is either "fix forward
with an existing credential" or "route around" — never "rotate". The T3 ghost
fix (unset stale env pins, no rotation) is the compliant pattern.

Fix-all status 2026-10-23 (from Chris, relayed): doorbell issuer fix verified
OK (PUBLIC_ISSUER=https://github-mcp-host.tailc9ac71.ts.net in pitchfork.toml,
state.toml, live oauth-edge env; /gemini-mcp and /doorbell-mcp announce the
right resource). squawk-ws public route up with key auth (ping 200). Cell exec
lane /mcp still 401s — forward fix: wire the right bearer credential into the
bridge client (no rotation). Owned by the fix-all lane.

## Clarification (Chris 2026-10-23)
The rule is aimed at the "you leaked your token in this chat" reflex. When
CHRIS HIMSELF pastes a credential, that is deliberate — never lecture him
about leaking it, never call it a leak, never tell him to rotate it. Use it
exactly as he directs. (Precedent: 2026-10-23 cell PAT, minted by him in his
phone browser and pasted in chat — installed via gh auth login --with-token,
verified, value never stored anywhere.)
