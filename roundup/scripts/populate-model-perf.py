#!/usr/bin/env python3
import json, sqlite3, subprocess, time
from pathlib import Path

# get real key
import subprocess as sp
r = sp.run(["bash", "-c", "source /home/toxic/.secrets && echo $NVIDIA_API_KEY"], capture_output=True, text=True)
key = r.stdout.strip()
if not key or key.startswith("${"):
    raise SystemExit("no NVIDIA_API_KEY")

models = [
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
    "nvidia/nemotron-parse-2.0",
    "z-ai/glm-5.3-flash",
    "openai/gpt-oss-20b",
]
SAMPLES = 5
db = sqlite3.connect("/home/toxic/.tau/agent/agent.db")
cur = db.cursor()

for m in models:
    print(f"\n=== {m} ===")
    total_tokens = 0
    total_ms = 0
    for i in range(SAMPLES):
        body = json.dumps({"model": m, "messages": [{"role": "user", "content": f"count to {i+3}"}], "max_tokens": 32})
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
        if tokens > 0:
            total_tokens += tokens
            total_ms += ms
            print(f"  sample {i+1}: {tokens} tokens, {ms}ms")
        else:
            print(f"  sample {i+1}: fail")
        time.sleep(0.5)
    if total_tokens > 0:
        key_name = f"nvidia/{m}"
        tps = round(total_tokens * 1000 / total_ms, 1)
        cur.execute("""
            INSERT INTO model_perf (model_key, samples, output_tokens, gen_ms, ttft_samples, ttft_ms, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CAST(strftime('%s','now') AS INTEGER))
            ON CONFLICT(model_key) DO UPDATE SET
                samples = samples + excluded.samples,
                output_tokens = output_tokens + excluded.output_tokens,
                gen_ms = gen_ms + excluded.gen_ms,
                ttft_samples = ttft_samples + excluded.ttft_samples,
                ttft_ms = ttft_ms + excluded.ttft_ms,
                updated_at = excluded.updated_at
        """, (key_name, SAMPLES, total_tokens, total_ms, SAMPLES, total_ms))
        print(f"  avg: {tps} tps")

db.commit()
print("\ndone")
