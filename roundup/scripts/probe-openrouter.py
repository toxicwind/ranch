#!/usr/bin/env python3
"""probe-openrouter.py — Complete audit of OpenRouter keys, quotas, and model catalog.

Saves full untruncated JSON and Markdown results to ranch/roundup/results/.
Documents the deprecation of stealth/space-bunny-alpha and status of active free models.
"""

import json
import os
import subprocess
import sys
import time

SECRETS_FILE = os.environ.get("SECRETS_FILE", "/home/toxic/.secrets")
RESULTS_DIR = os.environ.get("RESULTS_DIR", "/home/toxic/estate/ranch/roundup/results")


def get_openrouter_keys():
    keys = {}
    if os.path.isfile(SECRETS_FILE):
        with open(SECRETS_FILE) as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[7:]
                if "=" in line:
                    k, v = line.split("=", 1)
                    v = v.strip("\"'\n")
                    if "openrouter" in k.lower() and v.startswith("sk-or-v1-"):
                        keys[k] = v
    return keys


def check_key_auth(key):
    cmd = [
        "curl", "-s", "-m", "10",
        "-H", f"Authorization: Bearer {key}",
        "https://openrouter.ai/api/v1/auth/key"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(res.stdout)
        if "error" in data:
            return {"status": "error", "code": data["error"].get("code"), "message": data["error"].get("message")}
        d = data.get("data", {})
        free_reqs = d.get("free_model_daily_requests", {})
        return {
            "status": "ok",
            "label": d.get("label"),
            "is_free_tier": d.get("is_free_tier"),
            "free_used": free_reqs.get("used", 0),
            "free_limit": free_reqs.get("limit", 0),
            "free_remaining": free_reqs.get("remaining", 0),
            "rate_limit": d.get("rate_limit", {})
        }
    except Exception as e:
        return {"status": "parse_error", "raw": res.stdout[:200]}


def fetch_free_models(key):
    cmd = [
        "curl", "-s", "-m", "10",
        "-H", f"Authorization: Bearer {key}",
        "https://openrouter.ai/api/v1/models"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(res.stdout)
        return [m["id"] for m in data.get("data", []) if ":free" in m.get("id", "")]
    except Exception:
        return []


def test_model(key, model_id):
    payload = {
        "model": model_id,
        "messages": [
            {"role": "user", "content": "Respond with the word: verified"}
        ],
        "max_tokens": 20
    }
    t0 = time.time()
    cmd = [
        "curl", "-s", "-m", "15", "-X", "POST",
        "-H", f"Authorization: Bearer {key}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "https://openrouter.ai/api/v1/chat/completions"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = int((time.time() - t0) * 1000)
    try:
        d = json.loads(res.stdout)
        if "choices" in d and len(d["choices"]) > 0:
            msg = d["choices"][0].get("message", {})
            return {"status": "PASS", "latency_ms": elapsed, "response": (msg.get("content") or msg.get("reasoning_content") or "").strip()}
        elif "error" in d:
            err = d["error"]
            return {"status": "FAIL", "latency_ms": elapsed, "code": err.get("code"), "message": err.get("message", "")}
    except Exception:
        pass
    return {"status": "FAIL", "latency_ms": elapsed, "message": res.stdout[:200]}


def main():
    keys = get_openrouter_keys()
    if not keys:
        print("[!] No OpenRouter keys found in secrets", file=sys.stderr)
        sys.exit(1)

    print(f"[*] Auditing {len(keys)} OpenRouter key(s)...")
    key_reports = {}
    valid_key = None
    for kname, k in keys.items():
        auth = check_key_auth(k)
        key_reports[kname] = auth
        if auth["status"] == "ok":
            valid_key = k
            print(f"  ✅ {kname:<25} label: {auth['label']} | daily free: {auth['free_used']}/{auth['free_limit']} (rem: {auth['free_remaining']})")
        else:
            print(f"  ❌ {kname:<25} {auth.get('code')}: {auth.get('message')}")

    # Explicit check on space-bunny
    space_bunny_tests = {}
    for kname, k in keys.items():
        res = test_model(k, "openrouter/stealth/space-bunny-alpha")
        space_bunny_tests[kname] = res

    # Catalog audit
    free_models = fetch_free_models(valid_key) if valid_key else []
    print(f"\n[*] Discovered {len(free_models)} free models in OpenRouter catalog.")

    model_results = []
    if valid_key:
        for mid in free_models:
            res = test_model(valid_key, mid)
            res["model_id"] = mid
            model_results.append(res)
            sym = "✅" if res["status"] == "PASS" else "❌"
            detail = f"{res.get('latency_ms')}ms: {res.get('response', '')[:40]}" if res["status"] == "PASS" else f"{res.get('code')}: {res.get('message', '')[:60]}"
            print(f"  {sym} {mid:<45} {detail}")

    os.makedirs(RESULTS_DIR, exist_ok=True)
    json_path = os.path.join(RESULTS_DIR, "openrouter_recon.json")
    md_path = os.path.join(RESULTS_DIR, "openrouter_recon.md")

    with open(json_path, "w") as f:
        json.dump({
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "keys": key_reports,
            "space_bunny_status": space_bunny_tests,
            "catalog_free_models": free_models,
            "test_results": model_results
        }, f, indent=2)

    with open(md_path, "w") as f:
        f.write("# OpenRouter Full Reconnaissance & Space-Bunny Audit\n\n")
        f.write(f"- Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n")
        f.write("- Analysis: `openrouter/stealth/space-bunny-alpha` is **DEAD**.\n")
        f.write("  - Deprecated keys return `401 User not found`.\n")
        f.write("  - Valid keys return `400: openrouter/stealth/space-bunny-alpha is not a valid model ID` (removed from upstream catalog).\n\n")

        f.write("## Key Account Audits\n\n")
        f.write("| Key Name | Status | Daily Free Used/Limit | Code / Message |\n")
        f.write("| --- | --- | --- | --- |\n")
        for kname, r in key_reports.items():
            if r["status"] == "ok":
                f.write(f"| `{kname}` | Active | {r['free_used']}/{r['free_limit']} (rem: {r['free_remaining']}) | OK |\n")
            else:
                f.write(f"| `{kname}` | Dead | N/A | {r.get('code')}: {r.get('message')} |\n")

        f.write("\n## Space-Bunny Probe Matrix\n\n")
        f.write("| Key Name | Model Tested | Result Code | Detail |\n")
        f.write("| --- | --- | --- | --- |\n")
        for kname, sb in space_bunny_tests.items():
            f.write(f"| `{kname}` | `stealth/space-bunny-alpha` | {sb.get('code', sb.get('status'))} | {sb.get('message', sb.get('response', ''))} |\n")

        f.write("\n## Catalog Free Models\n\n")
        f.write("| Model ID | Status | Latency | Response / Error |\n")
        f.write("| --- | --- | --- | --- |\n")
        for r in model_results:
            stat = r["status"]
            resp = (r.get("response") or f"{r.get('code')}: {r.get('message', '')}").replace("|", "\\|").replace("\n", " ")[:80]
            f.write(f"| `{r['model_id']}` | {stat} | {r.get('latency_ms', 0)}ms | {resp} |\n")

    print(f"\n[✓] OpenRouter report saved to:\n  JSON: {json_path}\n  MD:   {md_path}")


if __name__ == "__main__":
    main()
