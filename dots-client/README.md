# dots-client

Alternate model-call shim for Dots-3-Note (`dots-studio/dots-3-note-preview:free`)
via OpenRouter. Chris 2026-10-13: "Remember use alt shoms" — this is the alt
shim for Dots work: caller-side coercions that neutralize the model behaviors
found in the Dots 3 Note recon (see `../tau/docs/dots3-fixes.md`).

## What it neutralizes

- **Ghost outputs** — `reasoning.exclude=True` + `max_tokens:128` reasoning cap, so
  reasoning tokens can't burn the whole completion budget (`finish=length` with
  no content).
- **List:string mismatches** — strict tool schemas (`strict:true`,
  `additionalProperties:false`) with `provider.require_parameters`, forcing
  real structured arguments instead of markdown-checklist strings.
- **22s latency** — `temperature:0.1`, bounded reasoning, no fallbacks
  (`allow_fallbacks:false`) so a slow/dead provider fails fast instead of
  hanging through fallback chains.
- **Replay crashes** — assistant `content=None` normalized to `""` before the
  call, so replay/continuation payloads never carry null content.

## Fixes applied on intake (2026-10-13)

- `base_url` was pasted as a markdown link
  (`[https://openrouter.ai/api/v1](https://openrouter.ai/api/v1)`); corrected to
  the plain URL. The pasted form would have failed every call.

## Usage

```python
from sovereign_dots_client import SovereignDotsClient

client = SovereignDotsClient(api_key="...")
msg = client.execute_structured_step(
    session_id="sess-123",
    messages=[{"role": "user", "content": "do the thing"}],
    tools=[{"type": "function", "function": {"name": "todo", "parameters": {...}}}],
    forced_tool="todo",  # or omit for auto
)
```

## Relationship to the tau-side fixes

The tau provider path (`toxicwind/tau`) carries the same coercions in
TypeScript: forced-tool empty-args retry (`f946a2cc`), Dots max_tokens floors
(256/512/1024), markdown-list recovery (`a180f13c`), general tool-arg chunking
and replay preservation (`5ab11e7`). This client is the Python alternate for
direct OpenRouter callers.
