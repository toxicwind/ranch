#!/usr/bin/env python3
"""probe-keypool.py — Probe keypool daemon health, provider pools, and key states.

Reads live status from 127.0.0.1:25109 and tests live completions across
healthy pools.
"""

import json
import subprocess
import sys
import time

KEYPOOL_BASE = "http://127.0.0.1:25109"


def get_status():
    res = subprocess.run(["curl", "-s", "-m", "5", f"{KEYPOOL_BASE}/status"], capture_output=True, text=True)
    try:
        return json.loads(res.stdout)
    except Exception as e:
        print(f"[!] Failed to fetch keypool status: {e}", file=sys.stderr)
        return None


def test_pool_completion(pool_name, model, path="chat/completions"):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "respond with one word: ready"}],
        "max_tokens": 10
    }
    url = f"{KEYPOOL_BASE}/{pool_name}/{path}"
    t0 = time.time()
    res = subprocess.run([
        "curl", "-s", "-m", "15", "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        url
    ], capture_output=True, text=True)
    elapsed = time.time() - t0
    try:
        d = json.loads(res.stdout)
        if "choices" in d and len(d["choices"]) > 0:
            return {"status": "ok", "latency_ms": int(elapsed * 1000)}
        elif "error" in d:
            return {"status": "error", "error": str(d["error"])[:100]}
    except Exception:
        pass
    return {"status": "error", "error": res.stdout[:100]}


def main():
    status = get_status()
    if not status:
        sys.exit(1)

    print(f"[*] Keypool status from {KEYPOOL_BASE}:")
    for pool_name, pool_data in status.items():
        keys = pool_data.get("keys", [])
        healthy = [k for k in keys if k.get("state") == "healthy"]
        down = [k for k in keys if k.get("state") == "down"]
        upstream = pool_data.get("upstream", "")
        status_sym = "✅" if healthy else "❌"
        print(f"  {status_sym} {pool_name:<26} upstream: {upstream}")
        print(f"     healthy: {len(healthy)}/{len(keys)} keys")

    print("\n[*] Probing live completions on healthy pools:")
    if "gemini-eap-openai" in status:
        res = test_pool_completion("gemini-eap-openai", "gemini-2.5-flash")
        sym = "✅" if res["status"] == "ok" else "❌"
        lat = f"{res.get('latency_ms')}ms" if res["status"] == "ok" else res.get("error")
        print(f"  {sym} gemini-eap-openai (gemini-2.5-flash): {lat}")


if __name__ == "__main__":
    main()
