#!/usr/bin/env python3
"""probe-nvidia-nim.py — Full-spectrum probe of all NVIDIA NIM integration models.

Tests completions directly against https://integrate.api.nvidia.com/v1.
Handles both standard text models (choices[0].message.content) and reasoning
models (choices[0].message.reasoning_content).
Persists full untruncated JSON and Markdown results to ranch/roundup/results/.
"""

import json
import os
import subprocess
import sys
import time

SECRETS_FILE = os.environ.get("SECRETS_FILE", "/home/toxic/.secrets")
RESULTS_DIR = os.environ.get("RESULTS_DIR", "/home/toxic/estate/ranch/roundup/results")


def get_nvidia_keys():
    keys = []
    if os.path.isfile(SECRETS_FILE):
        with open(SECRETS_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[7:]
                if "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip("\"'\n")
                    if k in ("NVIDIA_API_KEYS", "MOONBOX_NVIDIA_BEARER", "NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY"):
                        for item in v.split(","):
                            item = item.strip()
                            if item.startswith("nvapi-") and item not in keys:
                                keys.append(item)
    return keys


def list_models(key):
    cmd = [
        "curl", "-s", "-m", "15",
        "-H", f"Authorization: Bearer {key}",
        "https://integrate.api.nvidia.com/v1/models"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(res.stdout)
        return data.get("data", [])
    except Exception as e:
        return []


def test_completion(key, model_id):
    payload = {
        "model": model_id,
        "messages": [
            {"role": "system", "content": "You are a concise test responder."},
            {"role": "user", "content": "Respond with the word: verified"}
        ],
        "max_tokens": 30,
        "temperature": 0.2
    }
    t0 = time.time()
    cmd = [
        "curl", "-s", "-m", "15", "-X", "POST",
        "-H", f"Authorization: Bearer {key}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "https://integrate.api.nvidia.com/v1/chat/completions"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - t0
    latency_ms = int(elapsed * 1000)

    try:
        d = json.loads(res.stdout)
        if "choices" in d and len(d["choices"]) > 0:
            msg = d["choices"][0].get("message", {})
            content = (msg.get("content") or "").strip()
            reasoning = (msg.get("reasoning_content") or "").strip()
            text = content or reasoning
            return {
                "status": "PASS",
                "latency_ms": latency_ms,
                "response": text,
                "is_reasoning": bool(reasoning and not content),
                "model_reported": d.get("model", model_id),
                "raw_finish_reason": d["choices"][0].get("finish_reason")
            }
        else:
            return {
                "status": "FAIL",
                "latency_ms": latency_ms,
                "error_code": d.get("status", d.get("code")),
                "error_detail": d.get("detail", d.get("message", str(d)))
            }
    except Exception:
        return {
            "status": "FAIL",
            "latency_ms": latency_ms,
            "error_detail": res.stdout[:500]
        }


def main():
    keys = get_nvidia_keys()
    if not keys:
        print("[!] No nvapi-* keys found in secrets", file=sys.stderr)
        sys.exit(1)

    working_key = None
    catalog = []
    for k in keys:
        catalog = list_models(k)
        if catalog:
            working_key = k
            break

    if not working_key or not catalog:
        print("[!] Could not fetch model catalog with any key", file=sys.stderr)
        sys.exit(1)

    model_ids = [m["id"] for m in catalog]
    print(f"[*] Auditing all {len(model_ids)} models from NVIDIA NIM catalog...")

    results = []
    passed = 0
    failed = 0

    for i, mid in enumerate(model_ids):
        res = test_completion(working_key, mid)
        res["model_id"] = mid
        results.append(res)
        if res["status"] == "PASS":
            passed += 1
            mode = " [reasoning]" if res["is_reasoning"] else ""
            print(f"  [{i+1}/{len(model_ids)}] ✅ PASS {mid:<45} {res['latency_ms']}ms{mode}: {res['response'][:60]}")
        else:
            failed += 1
            err = res.get("error_detail", "unknown error")
            print(f"  [{i+1}/{len(model_ids)}] ❌ FAIL {mid:<45} {res['latency_ms']}ms: {str(err)[:80]}")

    os.makedirs(RESULTS_DIR, exist_ok=True)
    json_path = os.path.join(RESULTS_DIR, "nvidia_nim_recon.json")
    md_path = os.path.join(RESULTS_DIR, "nvidia_nim_recon.md")

    with open(json_path, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "total_models": len(model_ids),
            "passed": passed,
            "failed": failed,
            "results": results
        }, f, indent=2)

    with open(md_path, "w") as f:
        f.write("# NVIDIA NIM Full Model Reconnaissance Report\n\n")
        f.write(f"- Date: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n")
        f.write(f"- Total Catalog Models: {len(model_ids)}\n")
        f.write(f"- Working Models: **{passed}**\n")
        f.write(f"- Unavailable/Retired Models: **{failed}**\n\n")

        f.write("## Verified Working Models\n\n")
        f.write("| Model ID | Latency (ms) | Reasoning? | Sample Output |\n")
        f.write("| --- | --- | --- | --- |\n")
        for r in results:
            if r["status"] == "PASS":
                reasoning = "Yes" if r["is_reasoning"] else "No"
                resp = r["response"].replace("|", "\\|").replace("\n", " ")[:80]
                f.write(f"| `{r['model_id']}` | {r['latency_ms']} | {reasoning} | {resp} |\n")

        f.write("\n## Unavailable / Failing Models\n\n")
        f.write("| Model ID | Latency (ms) | Error Details |\n")
        f.write("| --- | --- | --- |\n")
        for r in results:
            if r["status"] == "FAIL":
                err = str(r.get("error_detail", "")).replace("|", "\\|").replace("\n", " ")[:100]
                f.write(f"| `{r['model_id']}` | {r['latency_ms']} | {err} |\n")

    print(f"\n[✓] Full untruncated audit saved to:\n  JSON: {json_path}\n  MD:   {md_path}")
    print(f"Summary: {passed} working, {failed} unavailable.")


if __name__ == "__main__":
    main()
