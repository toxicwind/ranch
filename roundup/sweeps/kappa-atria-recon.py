#!/usr/bin/env python3
# ATRIA MAX WEIRD - TOKEN-FRUGAL (hard budget ~9.7k; probe surface, not spend)
# Every request: input <= ~40 tokens, output <= 8 tokens. Whole run ~150 tokens.
# Durable transcript: writes every line to the roundup docs/atria log too.
import os, json, time, urllib.request, urllib.error

K = os.environ["ATRIA_API_KEY"]
BASE = "https://api.atria-asi.ai/v1"
TRANSCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "docs", "atria", "weird-findings.log"
)
_tf = open(os.path.abspath(TRANSCRIPT), "w", encoding="utf-8")


def out(s):
    print(s, flush=True)
    _tf.write(s + "\n")
    _tf.flush()


def post(p, stream=False):
    body = json.dumps(p).encode()
    req = urllib.request.Request(
        f"{BASE}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {K}", "Content-Type": "application/json"},
        method="POST",
    )
    t = time.perf_counter()
    try:
        r = urllib.request.urlopen(req, timeout=60)
        raw = r.read().decode()
        return (
            round((time.perf_counter() - t) * 1000),
            r.status,
            json.loads(raw) if raw else {},
        )
    except urllib.error.HTTPError as e:
        return (
            round((time.perf_counter() - t) * 1000),
            e.code,
            json.loads(e.read().decode() or "{}"),
        )


def desc(j):
    u = j.get("usage", {})
    c = (j.get("choices") or [{}])[0]
    m = c.get("message") or {}
    d = c.get("finish_reason")
    return f"status={j.get('id') and 'ok'} tok_use={u} finish={d} content={str(m.get('content'))[:40]!r} resp_fields={list(j.keys())}"


out("=" * 74)
out("ATRIA-DAWN WEIRD-RECON (token-frugal)")
out("=" * 74)

# 1 LATENCY INVERSION: flat vs autoregressive?
out("\n[1] LATENCY: output-length sensitivity (input fixed tiny)")
for mt in [1, 4, 8]:
    ms, st, j = post(
        {
            "model": "Atria-Dawn",
            "messages": [{"role": "user", "content": "2+2"}],
            "max_tokens": mt,
        }
    )
    out(f"  max_tokens={mt} latency={ms}ms {desc(j)}")
# distinguishes fixed suffix (a hard-code cache) vs per-token generate, cheaply

# 2 REASONING TAX KILL: does it even think?
out("\n[2] REASONING-KILL: does param set kill/keep reasoning_content?")
for name, extra in [
    ("baseline", {}),
    ("reasoning_effort none", {"reasoning_effort": "none"}),
    ("enable_thinking False", {"enable_thinking": False}),
    ("thinking", {"thinking": {"type": "enabled"}}),
]:
    p = {
        "model": "Atria-Dawn",
        "messages": [{"role": "user", "content": "def add(a,b): "}],
        "max_tokens": 8,
    }
    p.update(extra)
    ms, st, j = post(p)
    m = (j.get("choices") or [{}])[0].get("message") or {}
    out(f"  [{name}] {desc(j)} msg_keys={list(m.keys())}")

# 3 FSM / GUIDED DECODING: does it forward guided_* / json_schema?
out("\n[3] GUIDED DECODING passthrough")
for name, extra in [
    ("guided_regex", {"guided_regex": "def add\\(.*\\):"}),
    ("guided_choice", {"guided_choice": ["yes", "no"]}),
    (
        "guided_json",
        {"guided_json": {"type": "object", "properties": {"a": {"type": "integer"}}}},
    ),
    ("response_format json", {"response_format": {"type": "json_object"}}),
]:
    p = {
        "model": "Atria-Dawn",
        "messages": [{"role": "user", "content": "return def add"}],
        "max_tokens": 8,
    }
    p.update(extra)
    ms, st, j = post(p)
    out(f"  [{name}] st={st} {desc(j)}")

# 4 PARALLEL BRANCHING n
out("\n[4] PARALLEL n (branches)")
for n in [2, 4]:
    p = {
        "model": "Atria-Dawn",
        "messages": [{"role": "user", "content": "x"}],
        "max_tokens": 4,
        "n": n,
    }
    ms, st, j = post(p)
    out(f"  n={n} choices={len(j.get('choices', []))} {desc(j)}")

# 5 special params / fields
out("\n[5] SPECIAL PARAMS")
for name, extra in [
    ("seed", {"seed": 7}),
    ("logprobs", {"logprobs": True, "top_logprobs": 2}),
    ("stop_reason", {"stop": ["\n"]}),
    ("metadata", {"metadata": {"x": "1"}}),
]:
    p = {
        "model": "Atria-Dawn",
        "messages": [{"role": "user", "content": "one"}],
        "max_tokens": 4,
    }
    p.update(extra)
    ms, st, j = post(p)
    out(f"  [{name}] st={st} {desc(j)}")

# 6 STREAMING SHAPE (single)
out("\n[6] STREAMING delta fields")
body = json.dumps(
    {
        "model": "Atria-Dawn",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 4,
        "stream": True,
    }
).encode()
req = urllib.request.Request(
    f"{BASE}/chat/completions",
    data=body,
    headers={"Authorization": f"Bearer {K}", "Content-Type": "application/json"},
    method="POST",
)
r = urllib.request.urlopen(req, timeout=60)
first = []
allkeys = set()
for line in r:
    s = line.decode().strip()
    if not s.startswith("data: "):
        continue
    d = s[6:]
    if d == "[DONE]":
        continue
    try:
        o = json.loads(d)
    except:
        continue
    allkeys.update(o.keys())
    ch = (o.get("choices") or [{}])[0]
    allkeys.update(ch.get("delta", {}).keys())
    if len(first) < 3:
        first.append(str(ch).replace("\n", " "))
out(f"  sse_chunk_keys={sorted(allkeys)} first3={first}")

out("\n" + "=" * 74)
out("ATH DONE - see full usage in each desc")
out("=" * 74)
_tf.close()
