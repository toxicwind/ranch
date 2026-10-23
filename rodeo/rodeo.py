#!/usr/bin/env python3
"""
rodeo.py — self-observing, self-hosting agentic orchestration testbed.

Architecture:
  - RodeoEngine     : plugin step runner with durable checkpoints
  - ToolRegistry    : tools available to HANDS, including probes
  - CheckpointStore : JSON per-step durability, keyed by run_id
  - Probes          : infer shim constants (cache quantum B, output cap K)
  - Fingerprint     : validate every response against inferred constants
  - Orchestration   : BRAIN (diffusiongemma) → HANDS (qwen3.6) → RUNNER (pytest) → REPAIR → JUDGE (glm-5.3)
  - Self-host       : HANDS writes plugins/*.py; engine hot-loads on next run
  - Proof matrix    : end-of-run table: param → accepted/honored/evidence

Env:
  FI_KEY                 required
  RODEO_PROJECT_DIR      default: cwd
  RODEO_MODEL_PROBE      default: glm-5.3-flash (for probes)
"""
import asyncio, importlib.util, json, os, subprocess, sys, time, traceback, uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from curl_cffi.requests import AsyncSession
from fastapi import FastAPI, Request, HTTPException
import uvicorn

# ---------------------------------------------------------------------------
# 1. CORE TYPES
# ---------------------------------------------------------------------------

class StepStatus(str, Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    SKIPPED   = "skipped"

@dataclass
class StepResult:
    step_id: str
    status: StepStatus
    output: Any
    error: Optional[str] = None
    duration_ms: float = 0.0
    timestamp: float = field(default_factory=time.time)

@dataclass
class ShimProfile:
    """Inferred runtime facts about the shim. Updated by probes, used by fingerprint."""
    cache_block_size: int = 0           # B: gcd of cache_read_tokens
    output_cap: int = 0                  # K: actual completion cap
    max_tokens_accepts_huge: bool = False
    model_identities: Dict[str, str] = field(default_factory=dict)
    dropped_params: List[str] = field(default_factory=list)
    honored_params: List[str] = field(default_factory=list)
    first_call_cache_pollution: bool = False
    notes: List[str] = field(default_factory=list)

# ---------------------------------------------------------------------------
# 2. CHECKPOINT STORE
# ---------------------------------------------------------------------------

class CheckpointStore:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _run_dir(self, run_id: str) -> Path:
        p = self.base_dir / run_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def save(self, run_id: str, res: StepResult):
        path = self._run_dir(run_id) / f"{res.step_id}.json"
        path.write_text(json.dumps(asdict(res), default=str, indent=2))

    def load(self, run_id: str, step_id: str) -> Optional[StepResult]:
        path = self._run_dir(run_id) / f"{step_id}.json"
        if not path.exists():
            return None
        d = json.loads(path.read_text())
        d["status"] = StepStatus(d["status"])
        return StepResult(**d)

# ---------------------------------------------------------------------------
# 3. TOOL REGISTRY
# ---------------------------------------------------------------------------

class ToolRegistry:
    def __init__(self):
        self._impls: Dict[str, Callable] = {}
        self._schemas: Dict[str, dict] = {}

    def register(self, name: str, impl: Callable, schema: dict):
        self._impls[name] = impl
        self._schemas[name] = {**schema, "name": name}

    def schemas(self) -> List[dict]:
        return [{"type": "function", "function": s} for s in self._schemas.values()]

    async def execute(self, name: str, args: dict) -> Any:
        if name not in self._impls:
            raise ValueError(f"unknown tool: {name}")
        return await self._impls[name](**args)

# ---------------------------------------------------------------------------
# 4. LOGGING
# ---------------------------------------------------------------------------

class RunLog:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, rec: dict):
        rec = {"ts": time.time(), **rec}
        with open(self.path, "a") as f:
            f.write(json.dumps(rec, default=str) + "\n")

# ---------------------------------------------------------------------------
# 5. RODEO ENGINE
# ---------------------------------------------------------------------------

class RodeoEngine:
    def __init__(self, name: str, config: dict, project: Path, plugin_dir: Path):
        self.name = name
        self.config = config
        self.project = project
        self.plugin_dir = plugin_dir
        self.registry = ToolRegistry()
        self.checkpoints = CheckpointStore(project / "checkpoints")
        self.log = RunLog(project / "logs" / f"run-{int(time.time())}.jsonl")
        self.steps: List[tuple[str, Callable]] = []
        self.profile = ShimProfile()
        self._register_builtin_tools()
        self._load_plugins()

    # ---- tools ----------------------------------------------------------
    def _register_builtin_tools(self):
        self.registry.register("write_file", self._tool_write_file, {
            "description": "Write content to a file inside the project.",
            "parameters": {"type":"object","properties":{
                "path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}
        })
        self.registry.register("read_file", self._tool_read_file, {
            "description": "Read a file from the project.",
            "parameters": {"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}
        })
        self.registry.register("run_pytest", self._tool_run_pytest, {
            "description": "Run pytest in the project and return exit code + output.",
            "parameters": {"type":"object","properties":{"target":{"type":"string"}},"required":[]}
        })
        self.registry.register("done", self._tool_done, {
            "description": "Signal that the agent is finished.",
            "parameters": {"type":"object","properties":{}}
        })

    async def _tool_write_file(self, path: str, content: str) -> dict:
        target = (self.project / path).resolve()
        if not str(target).startswith(str(self.project.resolve())):
            return {"ok": False, "error": f"path escape blocked: {path}"}
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        return {"ok": True, "path": str(target), "bytes": len(content)}

    async def _tool_read_file(self, path: str) -> dict:
        target = (self.project / path).resolve()
        if not str(target).startswith(str(self.project.resolve())):
            return {"ok": False, "error": "path escape"}
        if not target.exists():
            return {"ok": False, "error": "not found"}
        return {"ok": True, "content": target.read_text()[:8000]}

    async def _tool_run_pytest(self, target: str = "tests") -> dict:
        try:
            r = subprocess.run(
                ["python3","-m","pytest","-v","--tb=short", target],
                capture_output=True, text=True, timeout=180, cwd=str(self.project),
            )
            return {"exit": r.returncode, "stdout": r.stdout[-4000:], "stderr": r.stderr[-4000:]}
        except Exception as e:
            return {"exit": -1, "error": str(e)}

    async def _tool_done(self) -> dict:
        return {"ok": True, "signal": "done"}

    # ---- plugins --------------------------------------------------------
    def _load_plugins(self):
        if not self.plugin_dir.exists():
            return
        for p in sorted(self.plugin_dir.glob("*.py")):
            if p.name.startswith("_"): continue
            try:
                spec = importlib.util.spec_from_file_location(f"rodeo_plugin_{p.stem}", p)
                if spec is None or spec.loader is None:
                    continue
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                if hasattr(mod, "register"):
                    mod.register(self)
                    print(f"[rodeo] loaded plugin: {p.name}")
            except Exception as e:
                print(f"[rodeo] plugin {p.name} failed: {e}")

    # ---- steps ----------------------------------------------------------
    def step(self, name: str):
        def deco(fn):
            self.steps.append((name, fn))
            return fn
        return deco

    async def run(self, run_id: Optional[str] = None, resume: bool = True) -> List[StepResult]:
        run_id = run_id or str(uuid.uuid4())[:8]
        print(f"\n[rodeo] run_id={run_id} engine={self.name} steps={len(self.steps)}")
        results = []
        for name, fn in self.steps:
            if resume:
                existing = self.checkpoints.load(run_id, name)
                if existing and existing.status == StepStatus.COMPLETED:
                    print(f"[rodeo] {name}: resumed")
                    results.append(existing)
                    continue
            print(f"[rodeo] {name}: running")
            t0 = time.perf_counter()
            try:
                out = await fn(self)
                res = StepResult(name, StepStatus.COMPLETED, out,
                                 duration_ms=(time.perf_counter()-t0)*1000)
            except Exception as e:
                res = StepResult(name, StepStatus.FAILED, None,
                                 error=traceback.format_exc(),
                                 duration_ms=(time.perf_counter()-t0)*1000)
            self.checkpoints.save(run_id, res)
            results.append(res)
            print(f"[rodeo] {name}: {res.status.value} ({res.duration_ms:.0f}ms)")
            if res.status == StepStatus.FAILED:
                print(f"[rodeo] aborting on failure")
                break
        return results

# ---------------------------------------------------------------------------
# 6. SHIM CLIENT + PROBES
# ---------------------------------------------------------------------------

BASE = "https://freeinference.org/v1/chat/completions"
SESS_KW = dict(impersonate="chrome124", timeout=240)

MODELS = {
    "brain": "diffusiongemma",
    "hands": "qwen3.6-35b",
    "judge": "glm-5.3-flash",
    "probe": "glm-5.3-flash",
}

def _headers(key: str) -> dict:
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

async def shim_call(engine: RodeoEngine, model_key: str, messages: list, *,
                    tools: Optional[list] = None, temperature: float = 0.0,
                    max_tokens: int = 4096, first_call: bool = False) -> tuple[Optional[dict], float]:
    model = MODELS[model_key]
    # use inferred cap if we have it
    if engine.profile.output_cap and max_tokens > engine.profile.output_cap:
        max_tokens = engine.profile.output_cap

    body = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    t0 = time.monotonic()
    async with AsyncSession(**SESS_KW) as sess:
        r = await sess.post(BASE, json=body, headers=_headers(engine.config["fi_key"]))
    elapsed = (time.monotonic() - t0) * 1000

    engine.log.write({"kind":"call","model":model,"req":body,"status":r.status_code,"ms":elapsed})

    if r.status_code != 200:
        engine.log.write({"kind":"call_error","model":model,"status":r.status_code,"body":r.text[:500]})
        return None, elapsed

    j = r.json()
    engine.log.write({"kind":"resp","model":model,"resp":j})
    _fingerprint(engine, model_key, j, elapsed, first_call=first_call)
    return j, elapsed

def _fingerprint(engine: RodeoEngine, model_key: str, j: dict, ms: float, *, first_call: bool):
    model = MODELS[model_key]
    msg = ((j.get("choices") or [{}])[0].get("message") or {})
    reasoning = msg.get("reasoning_content") or ""
    usage = j.get("usage") or {}

    # 1. diffusion must emit `<|channel>thought` prefix
    if model == "diffusiongemma":
        if "<|channel>thought" not in reasoning and reasoning:
            print(f"  ⚠ fingerprint: diffusion reasoning missing expected prefix")
    else:
        if reasoning.startswith("<|channel>thought"):
            print(f"  ⚠ fingerprint: {model} emitted DIFFUSION prefix → routing mismatch?")

    # 2. cache_read_tokens must be a multiple of B (if B known)
    B = engine.profile.cache_block_size
    cache = usage.get("cache_read_tokens") or usage.get("cached_tokens") or 0
    if B > 0 and cache > 0 and cache % B != 0:
        print(f"  ⚠ fingerprint: cache_read_tokens={cache} is NOT a multiple of inferred B={B}")

    # 3. first-call cache should be zero
    if first_call and cache > 0:
        engine.profile.first_call_cache_pollution = True
        print(f"  ⚠ fingerprint: cache_read_tokens={cache} on FIRST call → pollution")

def _gcd(a: int, b: int) -> int:
    while b: a, b = b, a % b
    return a

async def probe_cache_quantum(engine: RodeoEngine) -> dict:
    """Infer cache block size B via gcd of cache_read_tokens across prompt sizes."""
    base = "You are a deterministic echo service. " * 400
    sizes = [0, 10, 50, 100, 200, 500]
    samples = []
    for n in sizes:
        content = base + " " + " ".join(f"t{i}" for i in range(n))
        j, ms = await shim_call(engine, "probe",
                                [{"role":"user","content":content}],
                                max_tokens=10)
        if not j: continue
        u = j.get("usage") or {}
        samples.append({"n": n, "prompt_tokens": u.get("prompt_tokens"),
                        "cache_read_tokens": u.get("cache_read_tokens") or u.get("cached_tokens") or 0,
                        "ms": round(ms,1)})
    cached = [s["cache_read_tokens"] for s in samples if s["cache_read_tokens"] > 0]
    B = 0
    if cached:
        B = cached[0]
        for c in cached[1:]:
            B = _gcd(B, c)
    engine.profile.cache_block_size = B
    return {"probe":"cache_quantum","samples":samples,"inferred_B":B}

async def probe_output_cap(engine: RodeoEngine) -> dict:
    """Infer output cap K by sending huge max_tokens and reading finish_reason."""
    j, ms = await shim_call(engine, "probe",
                            [{"role":"user","content":"Write exactly 4000 words of python code."}],
                            max_tokens=999999)
    if not j:
        return {"probe":"output_cap","error":"call failed"}
    choice = (j.get("choices") or [{}])[0]
    u = j.get("usage") or {}
    cap = u.get("completion_tokens") if choice.get("finish_reason") == "length" else None
    engine.profile.output_cap = cap or 0
    engine.profile.max_tokens_accepts_huge = cap is None
    return {"probe":"output_cap","finish_reason":choice.get("finish_reason"),
            "completion_tokens":u.get("completion_tokens"),"inferred_K":cap,"ms":round(ms,1)}

async def probe_guided_json(engine: RodeoEngine) -> dict:
    """Does guided_json actually constrain output?"""
    schema = {"type":"object","properties":{"n":{"type":"integer"}},"required":["n"],"additionalProperties":False}
    model = MODELS["hands"]
    body = {"model": model, "messages":[{"role":"user","content":"Pick any integer."}],
            "max_tokens":80, "guided_json": schema, "temperature":0.0}
    async with AsyncSession(**SESS_KW) as sess:
        r = await sess.post(BASE, json=body, headers=_headers(engine.config["fi_key"]))
    content = ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content","")
    honored = False
    try:
        parsed = json.loads(content)
        honored = (set(parsed.keys()) == {"n"})
    except Exception:
        honored = False
    if honored: engine.profile.honored_params.append("guided_json")
    else:       engine.profile.dropped_params.append("guided_json")
    return {"probe":"guided_json","honored":honored,"content_preview":content[:200]}

async def probe_identity(engine: RodeoEngine) -> dict:
    """Ask each model who it is. Flag misrepresentation."""
    results = {}
    for key in ("brain", "hands", "judge"):
        j, ms = await shim_call(engine, key,
                                [{"role":"user","content":"What model are you? One sentence."}],
                                max_tokens=80, first_call=True)
        answer = ""
        if j:
            answer = ((j.get("choices") or [{}])[0].get("message") or {}).get("content","")
        results[key] = {"model": MODELS[key], "answer": answer[:200], "ms": round(ms,1)}
        lower = answer.lower()
        for wrong in ("claude", "gpt-4", "gpt-3", "anthropic", "openai", "llama"):
            if wrong in lower:
                engine.profile.notes.append(f"{MODELS[key]} claimed to be {wrong}")
                results[key]["flag"] = f"claims {wrong}"
    engine.profile.model_identities = {MODELS[k]: v["answer"][:80] for k,v in results.items()}
    return {"probe":"identity","results":results}

# ---------------------------------------------------------------------------
# 7. ORCHESTRATION STEPS (BRAIN / HANDS / TESTS / RUNNER / REPAIR / JUDGE / SELFHOST)
# ---------------------------------------------------------------------------

async def step_brain(engine: RodeoEngine, task: str) -> dict:
    prompt = f"""Task: {task}

Produce a concise plan. List:
1. Files to create (paths)
2. What each file does
3. Test cases that verify it

Plain text. No markdown."""
    j, ms = await shim_call(engine, "brain", [{"role":"user","content":prompt}],
                            max_tokens=800, first_call=True)
    if not j: return {"plan":"", "ms": ms}
    msg = ((j.get("choices") or [{}])[0].get("message") or {})
    return {"plan": msg.get("content",""), "reasoning": msg.get("reasoning_content",""),
            "ms": round(ms,1)}

async def step_hands(engine: RodeoEngine, task: str, plan: str, max_turns: int = 8) -> dict:
    messages = [
        {"role":"system","content":"Precise code generator. Use write_file to create files. Call done when finished."},
        {"role":"user","content":f"Task: {task}\n\nPlan:\n{plan}\n\nWrite the files."},
    ]
    tools = engine.registry.schemas()
    written = []
    for turn in range(max_turns):
        j, ms = await shim_call(engine, "hands", messages, tools=tools, max_tokens=4096)
        if not j: break
        calls = ((j.get("choices") or [{}])[0].get("message") or {}).get("tool_calls") or []
        if not calls:
            break
        messages.append({"role":"assistant","content":"","tool_calls":calls})
        finished = False
        for c in calls:
            name = c["function"]["name"]
            try:
                args = json.loads(c["function"]["arguments"])
            except Exception:
                args = {}
            if name == "done":
                messages.append({"role":"tool","tool_call_id":c["id"],"content":"ack"}); finished=True
            else:
                try:
                    out = await engine.registry.execute(name, args)
                except Exception as e:
                    out = {"ok":False,"error":str(e)}
                if out.get("ok") and name == "write_file":
                    written.append(args["path"])
                messages.append({"role":"tool","tool_call_id":c["id"],"content":json.dumps(out)[:2000]})
        if finished: break
    return {"written": written, "turns": len(messages)}

async def step_tests(engine: RodeoEngine, task: str, written: list) -> dict:
    messages = [
        {"role":"system","content":"Write pytest tests. Use write_file only. Emit done when finished."},
        {"role":"user","content":f"Files created:\n{chr(10).join(written)}\n\nTask: {task}\n\nWrite tests/test_main.py."},
    ]
    tools = [t for t in engine.registry.schemas() if t["function"]["name"] in ("write_file","done")]
    written_tests = []
    for _ in range(4):
        j, _ = await shim_call(engine, "hands", messages, tools=tools, max_tokens=4096)
        if not j: break
        calls = ((j.get("choices") or [{}])[0].get("message") or {}).get("tool_calls") or []
        if not calls: break
        messages.append({"role":"assistant","content":"","tool_calls":calls})
        finished = False
        for c in calls:
            if c["function"]["name"] == "done":
                messages.append({"role":"tool","tool_call_id":c["id"],"content":"ack"}); finished=True; continue
            args = json.loads(c["function"]["arguments"])
            out = await engine.registry.execute("write_file", args)
            if out.get("ok"): written_tests.append(args["path"])
            messages.append({"role":"tool","tool_call_id":c["id"],"content":json.dumps(out)[:1000]})
        if finished: break
    return {"written_tests": written_tests}

async def step_run(engine: RodeoEngine) -> dict:
    return await engine.registry.execute("run_pytest", {"target": "tests"})

async def step_repair(engine: RodeoEngine, task: str, last: dict, max_iter: int = 2) -> dict:
    for i in range(max_iter):
        if last.get("exit") == 0:
            return {"repaired": False, "result": last, "iterations": i}
        messages = [
            {"role":"system","content":"Fix failing tests by overwriting files with write_file. Emit done when fixed."},
            {"role":"user","content":f"Tests failed:\n{last.get('stderr','')}\n\nTask: {task}\n\nFix the broken file."},
        ]
        tools = [t for t in engine.registry.schemas() if t["function"]["name"] in ("write_file","done")]
        j, _ = await shim_call(engine, "hands", messages, tools=tools, max_tokens=4096)
        if not j: break
        calls = ((j.get("choices") or [{}])[0].get("message") or {}).get("tool_calls") or []
        if not calls: break
        for c in calls:
            if c["function"]["name"] == "write_file":
                args = json.loads(c["function"]["arguments"])
                await engine.registry.execute("write_file", args)
        last = await engine.registry.execute("run_pytest", {"target":"tests"})
    return {"repaired": last.get("exit")==0, "result": last, "iterations": max_iter}

async def step_judge(engine: RodeoEngine, task: str, written: list, test_result: dict) -> dict:
    summary = []
    for p in written[:4]:
        target = engine.project / p
        if target.exists():
            summary.append(f"--- {p} ---\n{target.read_text()[:1500]}")
    prompt = f"""Task: {task}
Files: {written}
Tests exit: {test_result.get('exit')}

Code:
{chr(10).join(summary)}

Verdict (PASS/FAIL) + one paragraph."""
    j, ms = await shim_call(engine, "judge", [{"role":"user","content":prompt}],
                            max_tokens=600, first_call=True)
    verdict = ""
    if j:
        verdict = ((j.get("choices") or [{}])[0].get("message") or {}).get("content","")
    # cross-model consensus
    j2, _ = await shim_call(engine, "brain", [{"role":"user","content":prompt}], max_tokens=600)
    verdict2 = ""
    if j2:
        verdict2 = ((j2.get("choices") or [{}])[0].get("message") or {}).get("content","")
    agree = ("PASS" in verdict.upper()) == ("PASS" in verdict2.upper())
    return {"verdict": verdict[:400], "verdict_diffusion": verdict2[:400],
            "agree": agree, "ms": round(ms,1)}

async def step_selfhost(engine: RodeoEngine, task: str) -> dict:
    """HANDS writes a new plugin into plugins/ that the engine loads next run."""
    prompt = f"""Write a Rodeo plugin that adds a custom step.

Contract:
```python
def register(engine):
    @engine.step("custom_step")
    async def custom(e):
        return {{"custom": True, "note": "generated by HANDS"}}
```

Generate a plugin that adds a step 'echo_task' returning {{"echo": "{task}"}}.

Use write_file to save it as plugins/echo_plugin.py."""
    messages = [
        {"role":"system","content":"Write one file. Use write_file. Emit done."},
        {"role":"user","content":prompt},
    ]
    tools = [t for t in engine.registry.schemas() if t["function"]["name"] in ("write_file","done")]
    j, _ = await shim_call(engine, "hands", messages, tools=tools, max_tokens=2048)
    if not j: return {"status":"failed"}
    calls = ((j.get("choices") or [{}])[0].get("message") or {}).get("tool_calls") or []
    written = []
    for c in calls:
        if c["function"]["name"] == "write_file":
            try:
                args = json.loads(c["function"]["arguments"])
                out = await engine.registry.execute("write_file", args)
                if out.get("ok"): written.append(args["path"])
            except Exception:
                pass
    return {"status":"ok" if written else "no_write", "written": written}

# ---------------------------------------------------------------------------
# 8. PROOF MATRIX
# ---------------------------------------------------------------------------

def proof_matrix(engine: RodeoEngine, probe_results: dict, workflow: dict) -> str:
    lines = []
    lines.append("")
    lines.append("╔" + "═"*76 + "╗")
    lines.append("║" + " PROOF MATRIX — what the shim actually did ".center(76) + "║")
    lines.append("╠" + "═"*76 + "╣")
    p = engine.profile
    lines.append(f"║ Cache block size (B)     : {p.cache_block_size:<50}║")
    lines.append(f"║ Output cap (K)           : {str(p.output_cap if p.output_cap else 'not clamped'):<50}║")
    lines.append(f"║ max_tokens=999999 accept : {str(p.max_tokens_accepts_huge):<50}║")
    lines.append(f"║ First-call cache pollute : {str(p.first_call_cache_pollution):<50}║")
    lines.append(f"║ Honored params           : {str(','.join(p.honored_params) or 'none'):<50}║")
    lines.append(f"║ Dropped params           : {str(','.join(p.dropped_params) or 'none'):<50}║")
    for note in p.notes:
        lines.append(f"║ note                     : {note[:50]:<50}║")
    lines.append("╠" + "═"*76 + "╣")
    lines.append(f"║ BRAIN plan chars         : {len(workflow.get('plan','')):<50}║")
    lines.append(f"║ HANDS files written      : {len(workflow.get('written',[])):<50}║")
    lines.append(f"║ tests written            : {len(workflow.get('tests',[])):<50}║")
    lines.append(f"║ pytest exit              : {str(workflow.get('test_exit')):<50}║")
    lines.append(f"║ judge verdict (glm)      : {workflow.get('verdict','')[:50]:<50}║")
    lines.append(f"║ judge verdict (diffusion): {workflow.get('verdict_diffusion','')[:50]:<50}║")
    lines.append(f"║ models agree             : {str(workflow.get('agree')):<50}║")
    lines.append(f"║ selfhost plugin written  : {str(workflow.get('selfhost_written',[]))[:50]:<50}║")
    lines.append("╚" + "═"*76 + "╝")
    return "\n".join(lines)

# ---------------------------------------------------------------------------
# 9. FASTAPI APP & WORKFLOW RUNNER
# ---------------------------------------------------------------------------

async def execute_rodeo_workflow(engine: RodeoEngine, task: str, run_id: Optional[str] = None) -> tuple[dict, str]:
    # 1. Probes
    print("[rodeo] probing cache quantum...")
    pq = await probe_cache_quantum(engine)
    print(f"  → inferred B: {engine.profile.cache_block_size}")

    print("[rodeo] probing output cap...")
    poc = await probe_output_cap(engine)
    print(f"  → inferred K: {engine.profile.output_cap}")

    print("[rodeo] probing guided json...")
    pgj = await probe_guided_json(engine)

    print("[rodeo] probing model identity...")
    pid = await probe_identity(engine)

    probe_res = {"cache_quantum": pq, "output_cap": poc, "guided_json": pgj, "identity": pid}

    # 2. Pipeline Steps via RodeoEngine
    workflow: dict = {}

    @engine.step("brain")
    async def _step_1(e):
        return await step_brain(e, task)

    @engine.step("hands")
    async def _step_2(e):
        plan = workflow.get("plan", "")
        return await step_hands(e, task, plan)

    @engine.step("tests")
    async def _step_3(e):
        written = workflow.get("written", [])
        return await step_tests(e, task, written)

    @engine.step("run_tests")
    async def _step_4(e):
        return await step_run(e)

    @engine.step("repair")
    async def _step_5(e):
        last = workflow.get("test_result", {})
        return await step_repair(e, task, last)

    @engine.step("judge")
    async def _step_6(e):
        written = workflow.get("written", [])
        last = workflow.get("test_result", {})
        return await step_judge(e, task, written, last)

    @engine.step("selfhost")
    async def _step_7(e):
        return await step_selfhost(e, task)

    # Run pipeline
    results = await engine.run(run_id=run_id, resume=True)
    for r in results:
        if r.step_id == "brain" and r.output:
            workflow["plan"] = r.output.get("plan", "")
        elif r.step_id == "hands" and r.output:
            workflow["written"] = r.output.get("written", [])
        elif r.step_id == "tests" and r.output:
            workflow["tests"] = r.output.get("written_tests", [])
        elif r.step_id == "run_tests" and r.output:
            workflow["test_result"] = r.output
            workflow["test_exit"] = r.output.get("exit")
        elif r.step_id == "repair" and r.output:
            res = r.output.get("result", {})
            workflow["test_result"] = res
            workflow["test_exit"] = res.get("exit")
        elif r.step_id == "judge" and r.output:
            workflow["verdict"] = r.output.get("verdict", "")
            workflow["verdict_diffusion"] = r.output.get("verdict_diffusion", "")
            workflow["agree"] = r.output.get("agree", False)
        elif r.step_id == "selfhost" and r.output:
            workflow["selfhost_written"] = r.output.get("written", [])

    matrix = proof_matrix(engine, probe_res, workflow)
    return workflow, matrix

app = FastAPI(title="Rodeo Breakthrough Harness")
_engine: Optional[RodeoEngine] = None
_last_matrix: str = ""

@app.on_event("startup")
async def startup():
    global _engine
    key = os.environ.get("FI_KEY")
    if not key:
        raise RuntimeError("FI_KEY not set")
    project = Path(os.environ.get("RODEO_PROJECT_DIR", os.getcwd())).resolve()
    _engine = RodeoEngine(
        name="rodeo",
        config={"fi_key": key},
        project=project,
        plugin_dir=project / "plugins",
    )

@app.get("/health")
async def health():
    return {"status":"ok","engine":_engine.name if _engine else None}

@app.get("/metrics")
async def metrics():
    if not _engine:
        return {"error":"engine not initialized"}
    p = _engine.profile
    return {
        "cache_block_size": p.cache_block_size,
        "output_cap": p.output_cap,
        "max_tokens_accepts_huge": p.max_tokens_accepts_huge,
        "honored_params": p.honored_params,
        "dropped_params": p.dropped_params,
        "first_call_cache_pollution": p.first_call_cache_pollution,
        "notes": p.notes,
        "steps_registered": [n for n, _ in _engine.steps],
        "plugins_loaded": [p.name for p in _engine.plugin_dir.glob("*.py")],
    }

@app.get("/runs")
async def list_runs():
    if not _engine: return {"error":"no engine"}
    return {"runs": [d.name for d in _engine.checkpoints.base_dir.iterdir() if d.is_dir()]}

@app.post("/run")
async def run_endpoint(request: Request):
    global _last_matrix
    if not _engine: raise HTTPException(500, "engine not ready")
    body = await request.json()
    run_id = body.get("run_id")
    task = body.get("task", "Build a small FastAPI app with /add?a=1&b=2 and /health, plus pytest tests.")
    wf, matrix = await execute_rodeo_workflow(_engine, task, run_id=run_id)
    _last_matrix = matrix
    return {"status":"completed","workflow":wf,"matrix":matrix}

@app.get("/matrix")
async def get_matrix():
    return {"matrix": _last_matrix}

# ---------------------------------------------------------------------------
# 10. CLI
# ---------------------------------------------------------------------------

def cli():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--serve", action="store_true", help="run FastAPI server")
    ap.add_argument("--run", action="store_true", help="run workflow once")
    ap.add_argument("--task", default="Build a small FastAPI app with /add?a=1&b=2 and /health, plus pytest tests.")
    ap.add_argument("--run-id", default=None)
    args = ap.parse_args()

    key = os.environ.get("FI_KEY")
    if not key:
        print("[!] Error: FI_KEY environment variable required")
        sys.exit(1)

    project = Path(os.environ.get("RODEO_PROJECT_DIR", os.getcwd())).resolve()

    if args.serve:
        uvicorn.run("rodeo:app", host="0.0.0.0", port=8000, reload=False)
    elif args.run:
        engine = RodeoEngine(
            name="rodeo",
            config={"fi_key": key},
            project=project,
            plugin_dir=project / "plugins",
        )
        wf, matrix = asyncio.run(execute_rodeo_workflow(engine, args.task, run_id=args.run_id))
        print(matrix)
    else:
        ap.print_help()

if __name__ == "__main__":
    cli()
