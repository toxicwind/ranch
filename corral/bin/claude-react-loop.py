#!/usr/bin/env python3
"""ReAct loop for claude-shim: full Gatehouse MCP tool use for shim agents.

The nim-shim-real binary is prompt->text only with zero tool capability.
This wrapper implements a ReAct (Reasoning + Acting) loop:
1. Fetch the live Gatehouse tool catalog (36 servers / 258 tools) and
   inject it as tool instructions.
2. Call the model via nim-shim-real.
3. Parse <tool_call> tags from model output.
4. Execute via Gatehouse CLI (tool-read / tool-write / tool-destructive).
5. Feed results back, repeat until the model answers without tool tags.

Durability rules for this file:
- NO timeouts anywhere. Subprocesses run to completion; the model calls
  return when they return. (Standing user directive: never use timeouts.)
- The catalog is fetched live at startup so it never goes stale.
- Iteration ceiling is 25 (Corral default maxIterations), not 10.
"""
import collections
import json
import os
import re
import subprocess
import sys
import urllib.request

GATEHOUSE_BIN = "/home/toxic/estate/ranch/range/bin/gatehouse"
GATEHOUSE_CONFIG = (
    "/home/toxic/estate/ranch/barn/gatehouse/mcp_config.json"
)
NIM_SHIM_REAL = "/home/toxic/.local/bin/claude.nim-shim-real"
MAX_ITERATIONS = 25
MAX_RESULT_CHARS = 6000

# Intent routing: map a tool name to a gatehouse call intent.
_WRITE_TOKENS = (
    "write", "create", "update", "put", "patch", "set", "add", "push",
    "merge", "copy", "move", "rename", "index", "ingest", "execute",
    "run", "launch", "publish", "hset", "xadd", "convert", "refactor",
    "replace", "extract", "type", "click", "press", "drag", "scroll",
)
_DESTRUCTIVE_TOKENS = ("delete", "remove", "destroy", "drop", "truncate", "kill")


def run(cmd):
    """Run a command with NO timeout. It returns when it returns."""
    return subprocess.run(cmd, capture_output=True, text=True)


def fetch_catalog():
    """Return the live gatehouse tool catalog as a list of dicts."""
    r = run([GATEHOUSE_BIN, "tools", "list", "-c", GATEHOUSE_CONFIG, "-o", "json"])
    try:
        data = json.loads(r.stdout)
        if isinstance(data, dict):
            data = data.get("tools", [])
        return data
    except Exception:
        return []


def compact_catalog(catalog):
    grouped = collections.defaultdict(list)
    for t in catalog:
        name = t.get("name", "")
        server = t.get("server_name", "")
        if server and name:
            grouped[server].append(name)
    lines = []
    for server in sorted(grouped):
        lines.append("%s: %s" % (server, ", ".join(sorted(grouped[server]))))
    return "\n".join(lines)


def full_catalog(catalog):
    lines = []
    for t in sorted(catalog, key=lambda x: (x.get("server_name", ""), x.get("name", ""))):
        lines.append(
            "%s:%s - %s"
            % (t.get("server_name"), t.get("name"),
               (t.get("description") or "")[:160])
        )
    return "\n".join(lines)


def tool_schema(catalog, server, name):
    for t in catalog:
        if t.get("server_name") == server and t.get("name") == name:
            return json.dumps(
                {"server": server, "name": name,
                 "description": t.get("description"),
                 "schema": t.get("schema")},
                indent=2)[:4000]
    return "Tool %s:%s not found in catalog." % (server, name)


def build_instructions(catalog):
    return """You have full tool access through the Gatehouse MCP proxy (36 servers, 258 tools).
To use a tool, output EXACTLY this format:

<tool_call>
{"server": "<server>", "tool": "<tool>", "arguments": {<args as JSON object>}}
</tool_call>

TOOL CATALOG (server: tools):
%s

Special discovery tools (use these to learn a tool's argument schema before calling it):
- <tool_call>{"server": "gatehouse", "tool": "catalog", "arguments": {}}</tool_call>
  returns every tool with its one-line description.
- <tool_call>{"server": "gatehouse", "tool": "describe", "arguments": {"server": "<server>", "tool": "<tool>"}}</tool_call>
  returns the full JSON schema for one tool.

Quick reference for common filesystem work (hashline server):
- write: {"file": "/path", "content": "..."} - create or overwrite a file
- read: {"file": "/path"} - read a file
- patch: {"file": "/path", "edits": [...]} - surgical edit (see describe for schema)
- find_block: locate a block by anchor; remove_file; rename_file

CRITICAL RULES:
- When the task requires creating, writing, reading, modifying, executing, searching, or checking ANYTHING, you MUST output the <tool_call> tag with valid JSON. Do NOT just describe what you would do. Narrating an action without emitting a <tool_call> is a failed task.
- Call gatehouse:describe FIRST when you are unsure of a tool's arguments.
- Output ONLY the <tool_call> tag when you need to use a tool, nothing else.
- After a tool executes you will see its result. Then either call another tool or give your final answer.
- If the task needs no tools, answer directly without tool_call tags.
""" % compact_catalog(catalog)


def call_model(prompt):
    """Call nim-shim-real. No timeout - returns when the model returns.

    Reasoning-model fallback: some models (e.g. gpt-oss) nondeterministically
    put their answer in the `reasoning` field with empty `content`, which the
    shim drops. When the shim returns empty, retry via a direct API call and
    use content, falling back to reasoning. 2026-10-01.
    """
    result = run([NIM_SHIM_REAL, prompt])
    out = result.stdout.strip()
    if out:
        return out
    return direct_model_call(prompt)


def direct_model_call(prompt):
    """Direct OpenAI-compatible chat call; merges content and reasoning."""
    base = os.environ.get("NIM_BASE_URL", "http://127.0.0.1:25200/v1").rstrip("/")
    key = os.environ.get("NVIDIA_API_KEY", "")
    model = os.environ.get("NIM_MODEL", "")
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 8192,
        "temperature": 1,
        "top_p": 0.95,
    }).encode()
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json",
                 "User-Agent": "corral-react-loop/1.0"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print("direct_model_call failed: %s" % e, file=sys.stderr)
        return ""
    try:
        msg = data["choices"][0]["message"]
    except (KeyError, IndexError, TypeError):
        return ""
    content = (msg.get("content") or "").strip()
    if content:
        return content
    return (msg.get("reasoning") or "").strip()


def intent_for(tool_name):
    name = (tool_name or "").lower()
    for tok in _DESTRUCTIVE_TOKENS:
        if tok in name:
            return "tool-destructive"
    for tok in _WRITE_TOKENS:
        if tok in name:
            return "tool-write"
    return "tool-read"


def execute_tool(catalog, server, tool, arguments):
    """Execute a tool via Gatehouse CLI. Returns result text."""
    if server == "gatehouse":
        if tool == "catalog":
            return full_catalog(catalog)
        if tool == "describe":
            return tool_schema(catalog,
                               (arguments or {}).get("server", ""),
                               (arguments or {}).get("tool", ""))
        return "Unknown gatehouse pseudo-tool: %s (use catalog or describe)" % tool

    tool_name = "%s:%s" % (server, tool)
    cmd = intent_for(tool)
    json_args = json.dumps(arguments or {})
    result = run([GATEHOUSE_BIN, "call", cmd,
                  "--tool-name=%s" % tool_name,
                  "--json_args=%s" % json_args,
                  "-c", GATEHOUSE_CONFIG, "-o", "json"])
    output = (result.stdout or "") + (result.stderr or "")
    if len(output) > MAX_RESULT_CHARS:
        output = output[:MAX_RESULT_CHARS] + "\n... [truncated]"
    return output.strip() or "(empty result)"


def main():
    if len(sys.argv) < 2:
        print("Usage: claude-react-loop.py <prompt>", file=sys.stderr)
        sys.exit(1)

    catalog = fetch_catalog()
    user_prompt = sys.argv[1]
    full_prompt = build_instructions(catalog) + "\n\nTask: " + user_prompt

    for _ in range(MAX_ITERATIONS):
        output = call_model(full_prompt)

        match = re.search(r"<tool_call>\s*(.*?)\s*</tool_call>", output, re.DOTALL)
        if not match:
            print(output)
            return

        try:
            tool_call = json.loads(match.group(1))
            server = tool_call["server"]
            tool = tool_call["tool"]
            arguments = tool_call.get("arguments", {})
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print("Tool call parse error: %s\nOutput was: %s" % (e, output))
            return

        result = execute_tool(catalog, server, tool, arguments)
        full_prompt += (
            "\n\nTool call executed: %s:%s\nResult: %s\n\n"
            "Continue with the task. If done, provide your final answer "
            "without tool_call tags." % (server, tool, result)
        )

    print("Max iterations reached without completion.")


if __name__ == "__main__":
    main()
