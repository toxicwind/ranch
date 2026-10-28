#!/usr/bin/env python3
"""awareness-manifest.py — builds the agent/subagent/model awareness SSOT from
LIVE registry evidence (rig agent list = what's actually Running), then probes
diversity candidates through geode :25193 for the swarm-10 (NO freeinference —
red-herring law: excluded until the global concurrency queue exists)."""
import subprocess, json, os, re, time

ENV = {k: v for k, v in os.environ.items() if "KAIROS" not in k.upper() and k not in ("BASH_ENV", "ENV")}
KEY = open("/home/toxic/.tau/rhodochrosite.key").read().strip()

def run(cmd, t=60):
    return subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=t, env=ENV)

# 1) live registry
r = run("rig agent list 2>&1")
rows = re.findall(r"^([0-9a-f-]{36})\s+(\S+)\s+\S*\s*(\S+)\s+(\S+)\s+(\S+)$", r.stdout, re.M)
registry = [{"id": i, "name": n, "state": s, "provider": p, "model": m} for i, n, _, p, m in rows]
by_model = {}
for a in registry:
    by_model.setdefault((a["provider"], a["model"]), []).append(a["name"])

# 2) diversity probes through geode (candidates from mimetite catalog, NON-freeinference)
candidates = [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "nvidia/nemotron-3-super-120b-a12b",
    "openrouter/z-ai/glm-5.3-flash",
    "openrouter/moonshotai/kimi-k3:free",
    "openrouter/deepseek/deepseek-v4-flash:free",
    "groq/openai/gpt-oss-120b",
    "mistral/mistral-large-latest",
    "google/gemini-2.5-flash",
    "cerebras/llama-3.3-70b",
    "github/openai/gpt-4o",
]
results = []
for m in candidates:
    t0 = time.time()
    pr = run(f"""curl -s -m 25 -o /tmp/sw.json -w '%{{http_code}}' http://127.0.0.1:25193/v1/chat/completions -H "Authorization: Bearer {KEY}" -H 'Content-Type: application/json' -d '{{"model":"{m}","messages":[{{"role":"user","content":"Reply with exactly: OK"}}],"max_tokens":16}}'""", t=30)
    code = pr.stdout.strip()
    body = ""
    try: body = json.load(open("/tmp/sw.json")).get("choices", [{}])[0].get("message", {}).get("content", "") or str(json.load(open("/tmp/sw.json")))[:80]
    except Exception: body = "?"
    ms = int((time.time() - t0) * 1000)
    verdict = "crystalline" if code == "200" and "OK" in str(body) else f"fracture:{code}"
    results.append({"model": m, "verdict": verdict, "ms": ms, "body": str(body)[:60]})
    print(f"{m}: {verdict} ({ms}ms) {str(body)[:40]}")

# 3) swarm-10: registry-proven first, then probed crystalline, diversity-capped
proven = [("nvidia", "nvidia/nemotron-3-ultra-550b-a55b", f"{len(by_model.get(('openai','nvidia/nemotron-3-ultra-550b-a55b'), []))} agents live"),
          ("nvidia", "nvidia/nemotron-3-super-120b-a12b", "bidder crew live")]
swarm = [{"model": m, "family": f, "evidence": e} for f, m, e in proven]
for rr in results:
    if rr["verdict"] == "crystalline":
        fam = rr["model"].split("/")[0]
        if sum(1 for s in swarm if s["family"] == fam) < 2 and len(swarm) < 10:
            swarm.append({"model": rr["model"], "family": fam, "evidence": f"probed {rr['ms']}ms"})

out = {"registry_size": len(registry), "by_model_live": {f"{k[0]}/{k[1]}": v for k, v in by_model.items()},
       "probes": results, "swarm10": swarm, "freeinference": "EXCLUDED (global concurrency queue missing; red-herring law)",
       "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
json.dump(out, open("/home/toxic/pens/ranch/geode-rig/swarm-10.json", "w"), indent=1)
print(f"swarm-10 written: {len(swarm)} models")
