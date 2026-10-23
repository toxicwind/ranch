#!/usr/bin/env python3
import os, sys, json, yaml, urllib.request, subprocess

print("=== 1. GROQ MODELS & VERIFICATION ===")
key = os.environ.get("GROQ_API_KEY", "")

# Fetch available models list from Groq
models_available = []
try:
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/models",
        headers={"Authorization": f"Bearer {key}", "User-Agent": "curl/8.5.0"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        d = json.loads(resp.read().decode())
        models_available = [m["id"] for m in d.get("data", [])]
        llama_models = [m for m in models_available if "llama" in m.lower() or "qwen" in m.lower()]
        print("  -> Matching models on Groq:", llama_models[:10])
except Exception as e:
    print("  -> Models fetch error:", e)

# Test completion with candidate models
test_candidates = ["llama-3.3-70b-versatile", "meta-llama/llama-3.3-70b-instruct", "llama3-70b-8192", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]
working_model = None
for candidate in test_candidates:
    try:
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "User-Agent": "curl/8.5.0"},
            data=json.dumps({"model": candidate, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}).encode()
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode())
            content = res_data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            print(f"  [+] Groq completion verified on {candidate}: "{content}"")
            working_model = candidate
            break
    except Exception as e:
        # print(f"  [-] Candidate {candidate} failed: {e}")
        pass

# If the exact working model differs, update models.yml & config.yml
home = os.environ["HOME"]
models_path = os.path.join(home, "estate/config/tau/models.yml")
cfg_path = os.path.join(home, ".tau/agent/config.yml")

if working_model and working_model != "llama-3.3-70b-versatile":
    print(f"  [!] Aligning models.yml and config.yml to verified model: {working_model}")
    with open(models_path) as f:
        m_txt = f.read()
    if working_model not in m_txt:
        # Add model definition
        with open(models_path) as f:
            m_data = yaml.safe_load(f)
        if "providers" in m_data and "groq" in m_data["providers"]:
            m_data["providers"]["groq"]["models"].insert(0, {
                "id": working_model,
                "name": f"Groq {working_model}",
                "contextWindow": 128000,
                "maxOutput": 32768,
                "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}
            })
            with open(models_path, "w") as f:
                yaml.dump(m_data, f, default_flow_style=False, sort_keys=False)
    
    with open(cfg_path) as f:
        cfg = yaml.safe_load(f)
    cfg["modelRoles"]["default"] = f"groq/{working_model}"
    cfg["modelRoles"]["advisor"]["model"] = f"groq/{working_model}"
    cfg["modelRoles"]["smol"] = f"groq/{working_model}"
    with open(cfg_path, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)

print("\n=== 2. VERIFY LIVE CONFIGURATIONS ===")
with open(cfg_path) as f:
    cfg = yaml.safe_load(f)
print("  -> config.yml modelRoles:", cfg.get("modelRoles"))
print("  -> config.yml extensions:", cfg.get("extensions"))
print("  -> config.yml disabledExtensions:", cfg.get("disabledExtensions"))

with open(models_path) as f:
    m = yaml.safe_load(f)
missing_costs = []
for p_name, p_data in m.get("providers", {}).items():
    for mod in p_data.get("models", []):
        c = mod.get("cost", {})
        for field in ["cacheRead", "cacheWrite", "input", "output"]:
            if field not in c or not isinstance(c[field], (int, float)):
                missing_costs.append(f"{p_name}.{mod.get(id)}.{field}")
print("  -> models.yml schema valid:", len(missing_costs) == 0, "(missing: " + str(missing_costs) + ")")

with open(os.path.join(home, ".tau/plugins/package.json")) as f:
    pkg = json.load(f)
print("  -> router dep:", pkg.get("dependencies", {}).get("@cakriwut/omp-model-router"))

for lk in ["tau-plugins.lock.json", "omp-plugins.lock.json"]:
    with open(os.path.join(home, ".tau/plugins", lk)) as f:
        l = json.load(f)
    print(f"  -> {lk} cover-plugin enabled:", l.get("plugins", {}).get("cover-plugin", {}).get("enabled"))

with open(os.path.join(home, ".gemini/settings.json")) as f:
    g = json.load(f)
print("  -> gemini autoApprovedTools:", g.get("tools", {}).get("autoApprovedTools"))

print("\n=== 3. VERIFY BACKUPS & DEPLOY LOG ===")
backup_dirs = sorted([d for d in os.listdir(os.path.join(home, ".tau")) if d.startswith("backup-live-")])
if backup_dirs:
    latest = os.path.join(home, ".tau", backup_dirs[-1])
    print(f"  -> Latest backup dir: {latest}")
    print("  -> Backup files:", os.listdir(latest))
    log_file = os.path.join(latest, "deploy.log")
    if os.path.exists(log_file):
        with open(log_file) as f:
            lines = f.readlines()
        print(f"  -> deploy.log length: {len(lines)} lines")
        print("  -> deploy.log last 5 lines:")
        for line in lines[-5:]:
            print("     " + line.strip())

print("\n=== 4. TAU CLI TEST ===")
res = subprocess.run(["tau", "--version"], capture_output=True, text=True)
print("  -> tau --version output:", res.stdout.strip() or res.stderr.strip())

# Clean up temporary groq_models.json
if os.path.exists("/home/toxic/groq_models.json"):
    os.remove("/home/toxic/groq_models.json")
