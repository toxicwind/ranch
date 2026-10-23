#!/usr/bin/env python3
import json, os, subprocess, time
from pathlib import Path

secrets = Path("/home/toxic/.secrets").read_text()
key = None
for line in secrets.splitlines():
    if line.startswith("NIM_API_KEY="):
        key = line.split("=", 1)[1].strip().strip('"')
        break
if not key:
    raise SystemExit("no NIM_API_KEY")

models = [
    "google/diffusiongemma-26b-a4b-it",
    "meta/llama-3.2-11b-vision-instruct",
    "meta/muse-glimmer-30b",
    "nvidia/ising-calibration-1.5-31b",
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3.5-content-safety",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-parse-2.0",
    "nvidia/riva-translate-4b-instruct-v1.1",
    "nvidia/riva-translate-4b-instruct-v2",
    "openai/gpt-oss-20b",
    "poolside/laguna-xs-2.1",
    "z-ai/glm-5.3-flash",
]
out = Path("/home/toxic/estate/ranch/roundup/results/nvidia-tps.jsonl")
out.parent.mkdir(parents=True, exist_ok=True)
with out.open("w") as f:
    for m in models:
        print(f"probing {m}")
        body = json.dumps({"model": m, "messages": [{"role": "user", "content": "say hi"}], "max_tokens": 16})
        start = time.time()
        proc = subprocess.run([
            "curl", "-s", "-m", "30",
            "-H", f"Authorization: Bearer {key}",
            "-H", "Content-Type: application/json",
            "-d", body,
            "https://integrate.api.nvidia.com/v1/chat/completions"
        ], capture_output=True, text=True)
        ms = int((time.time() - start) * 1000)
        try:
            data = json.loads(proc.stdout)
            tokens = data.get("usage", {}).get("completion_tokens", 0)
        except Exception:
            tokens = 0
        tps = round(tokens * 1000 / ms, 1) if ms and tokens else 0
        rec = {"model": m, "tps": tps, "ms": ms, "tokens": tokens}
        f.write(json.dumps(rec) + "\n")
        print(f"  {m}: {tps} tps ({ms}ms, {tokens} tokens)")
print(f"wrote {out}")
