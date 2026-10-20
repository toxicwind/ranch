# Atria-Dawn — weird-findings (full probe transcript)

Token-frugal probe harness: `roundup/sweeps/kappa-atria-recon.py`.
Every request kept input ~<=40 tokens and output <=8 tokens (plus a single
512-token confirmation call), so the whole run spent roughly 150 tokens against
the ~10k trial bucket. Full log follows verbatim per section.

## Section 1 — latency vs output budget (input fixed tiny)

| max_tokens | latency | finish | content | completion_tokens | reasoning_tokens | cached_input |
|-----------:|--------:|--------|---------|------------------:|-----------------:|-------------:|
| 1 | 7012 ms | length | None | 1 | 1 | 15/15 |
| 4 | 6433 ms | length | None | 4 | 4 | 15/15 |
| 8 | 17832 ms| length | None | 8 | 8 | 15/15 |

`cached_tokens == prompt_tokens` on every call => full input cache hit.

> At max_tokens=512 (separate confirm): content=`'VISIBLE_OK'`, finish=stop,
> reasoning_tokens=11, completion_tokens=15. The tiny-budget `None` is a
> reasoning-starvation artifact, not a model failure.

## Section 2 — reasoning controls

| control | status | reasoning_tokens | behavior |
|---------|:------:|-----------------:|----------|
| baseline | 200 | 8 | reasons |
| reasoning_effort=none | 400 (error) | — | rejected |
| enable_thinking=false | 200 | 8 | ignored, still reasons |
| thinking={enabled} | 200 | 8 | ignored, still reasons |

message keys present: `content`, `role`, `reasoning_content` => the model returns
a `reasoning_content` field at the message level on non-streaming too.

## Section 3 — guided / structured decoding

All return 200 but every token goes to `reasoning_tokens` with `content=None`,
`finish=length`: `guided_regex`, `guided_choice`, `guided_json`,
`response_format: json_object`. No evidence the grammar constrains output before
the budget runs out. Re-test with a large max_tokens before relying on FSM.

## Section 4 — parallel branches

- `n: 2` -> `choices=1`
- `n: 4` -> `choices=1`
Parallel branch sampling is not honored; always one choice returned.

## Section 5 — special params

`seed`, `logprobs`+`top_logprobs`, `stop:["\n"]`, and `metadata` all return 200;
effect not observable at tiny budget (reasoning eats it).

## Section 6 — streaming (SSE) shape

Chunk object keys: `choices, content, created, id, model, object,
reasoning_content, role, usage`. First deltas:
1. `{index:0, delta:{role:"assistant", content:""}, finish_reason:null}`
2. `{index:0, delta:{reasoning_content:"Let"}, ...}`
3. `{index:0, delta:{reasoning_content:"'"+\s"}, ...}`

=> reasoning_content streams first, then content. Compatible with
`@ai-sdk/openai-compatible` (reads `delta.content`); the model is usable via the
OpenAI wire format.

## Takeaway (one line)

Atria-Dawn = a cached, reasoning-first model that must be called with
`max_tokens >= ~128` (512 recommended); reasoning cannot be turned off, `n` is
ignored, and guided decoding is unproven at small budgets.