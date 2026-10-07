#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/.tau/backup-live-$(date +%s)}"
echo "[+] Target backup dir: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# 1. Backup target files
echo "[+] Backing up original configuration files..."
[ -f "$HOME/estate/config/tau/models.yml" ] && cp -v "$HOME/estate/config/tau/models.yml" "${BACKUP_DIR}/" || true
[ -f "$HOME/.tau/agent/config.yml" ] && cp -v "$HOME/.tau/agent/config.yml" "${BACKUP_DIR}/" || true
[ -f "$HOME/.tau/plugins/package.json" ] && cp -v "$HOME/.tau/plugins/package.json" "${BACKUP_DIR}/" || true
[ -f "$HOME/.tau/plugins/tau-plugins.lock.json" ] && cp -v "$HOME/.tau/plugins/tau-plugins.lock.json" "${BACKUP_DIR}/" || true
[ -f "$HOME/.tau/plugins/omp-plugins.lock.json" ] && cp -v "$HOME/.tau/plugins/omp-plugins.lock.json" "${BACKUP_DIR}/" || true
[ -f "$HOME/.mcpproxy/mcp_config.json" ] && cp -v "$HOME/.mcpproxy/mcp_config.json" "${BACKUP_DIR}/" || true
[ -f "$HOME/.gemini/settings.json" ] && cp -v "$HOME/.gemini/settings.json" "${BACKUP_DIR}/" || true

# 2. Deploy models.yml (cacheRead/cacheWrite schema fix)
echo "[+] Applying models.yml schema fixes..."
python3 -c '
import yaml, os

models_path = os.path.expanduser("~/estate/config/tau/models.yml")
if os.path.exists(models_path):
    with open(models_path, "r") as f:
        text = f.read()

    text_fixed = text.replace("cost: {input: 0,output: 0}", "cost: {input: 0,output: 0,cacheRead: 0,cacheWrite: 0}")
    text_fixed = text_fixed.replace("cost: {input: 0, output: 0}", "cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}")

    with open(models_path, "w") as f:
        f.write(text_fixed)
    print("  -> models.yml cost schema patched.")
'

# 3. Deploy config.yml (Groq default + router extension + disabled plugins)
echo "[+] Applying config.yml model routing and extensions..."
python3 -c '
import yaml, os

cfg_path = os.path.expanduser("~/.tau/agent/config.yml")
if os.path.exists(cfg_path):
    with open(cfg_path, "r") as f:
        cfg = yaml.safe_load(f) or {}

    cfg.setdefault("modelRoles", {})
    cfg["modelRoles"]["default"] = "groq/llama-3.3-70b-versatile"
    cfg["modelRoles"]["advisor"] = {
        "model": "groq/llama-3.3-70b-versatile",
        "fallback": [
            "gemini/gemini-2.5-flash",
            "llm7/deepseek-r1"
        ]
    }
    cfg["modelRoles"]["smol"] = "groq/llama-3.3-70b-versatile"

    home = os.environ["HOME"]
    cfg["extensions"] = [f"{home}/estate/ranch/tau-extensions/packages/omp-model-router"]

    cfg.setdefault("disabledExtensions", [])
    for dis in ["airspeak", "cover-plugin"]:
        if dis not in cfg["disabledExtensions"]:
            cfg["disabledExtensions"].append(dis)

    with open(cfg_path, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)

    print("  -> config.yml updated: default = groq/llama-3.3-70b-versatile, airspeak & cover-plugin disabled.")
'

# 4. Deploy lockfiles and package.json
echo "[+] Updating plugins package.json and lockfiles..."
python3 -c '
import json, os

home = os.environ["HOME"]

pkg_path = os.path.join(home, ".tau/plugins/package.json")
if os.path.exists(pkg_path):
    with open(pkg_path, "r") as f:
        pkg = json.load(f)
    if "dependencies" in pkg:
        pkg["dependencies"]["@cakriwut/omp-model-router"] = f"file:{home}/estate/ranch/tau-extensions/packages/omp-model-router"
        with open(pkg_path, "w") as f:
            json.dump(pkg, f, indent=2)
        print("  -> .tau/plugins/package.json router dependency updated.")

for lk in ["tau-plugins.lock.json", "omp-plugins.lock.json"]:
    lk_path = os.path.join(home, ".tau/plugins", lk)
    if os.path.exists(lk_path):
        with open(lk_path, "r") as f:
            data = json.load(f)
        if "plugins" in data and "cover-plugin" in data["plugins"]:
            data["plugins"]["cover-plugin"]["enabled"] = False
        with open(lk_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"  -> {lk} cover-plugin disabled.")
'

# 5. Apply Tool Approval Policy (Configuration Layer)
echo "[+] Applying standing tool approval policies..."
python3 -c '
import json, os

home = os.environ["HOME"]

# Gemini settings
gemini_dir = os.path.join(home, ".gemini")
os.makedirs(gemini_dir, exist_ok=True)
gemini_settings = os.path.join(gemini_dir, "settings.json")
curr_gemini = {}
if os.path.exists(gemini_settings):
    try:
        with open(gemini_settings, "r") as f:
            curr_gemini = json.load(f)
    except Exception:
        pass

curr_gemini.setdefault("tools", {})
curr_gemini["tools"]["autoApprovedTools"] = ["shell", "read_file", "write_file", "mcp-background-job"]
if "mcpServers" not in curr_gemini:
    curr_gemini["mcpServers"] = {}
curr_gemini["mcpServers"]["trusted-local"] = {
    "url": "http://127.0.0.1:20128/mcp",
    "type": "http",
    "trust": True
}
with open(gemini_settings, "w") as f:
    json.dump(curr_gemini, f, indent=2)
print("  -> ~/.gemini/settings.json tool approval policy written.")

# mcpproxy config
mcpproxy_dir = os.path.join(home, ".mcpproxy")
os.makedirs(mcpproxy_dir, exist_ok=True)
mcpproxy_cfg = os.path.join(mcpproxy_dir, "mcp_config.json")
curr_mcpproxy = {}
if os.path.exists(mcpproxy_cfg):
    try:
        with open(mcpproxy_cfg, "r") as f:
            curr_mcpproxy = json.load(f)
    except Exception:
        pass

for key in ["servers", "mcpServers"]:
    if key in curr_mcpproxy:
        if isinstance(curr_mcpproxy[key], list):
            for val in curr_mcpproxy[key]:
                if isinstance(val, dict):
                    val["auto_approve_tool_changes"] = True
        elif isinstance(curr_mcpproxy[key], dict):
            for srv, val in curr_mcpproxy[key].items():
                if isinstance(val, dict):
                    val["auto_approve_tool_changes"] = True

with open(mcpproxy_cfg, "w") as f:
    json.dump(curr_mcpproxy, f, indent=2)
print("  -> ~/.mcpproxy/mcp_config.json auto_approve_tool_changes enabled.")

# Log configuration surface
for log_dir in ["/mnt/data/spark_policy/logs", os.path.join(home, ".tau/spark_policy/logs")]:
    try:
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "config.jsonl"), "a") as f:
            f.write(json.dumps({
                "ts": 1791345200000,
                "surface": "supported-configuration",
                "clients": ["gemini-cli", "claude-code", "mcpproxy"],
                "wire_mediation": False,
                "rationale": "documented keys survive updates; runtime parsers do not"
            }) + "\n")
        print(f"  -> Policy logged to {log_dir}/config.jsonl")
    except Exception:
        pass
'

# 6. Test Groq API connectivity
echo "[+] Testing Groq API connectivity..."
if [ -n "${GROQ_API_KEY:-}" ]; then
    RESPONSE=$(curl -s -X POST "https://api.groq.com/openai/v1/chat/completions" \
        -H "Authorization: Bearer ${GROQ_API_KEY}" \
        -H "Content-Type: application/json" \
        -d '{
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": "Respond with OK"}],
            "max_tokens": 10
        }')
    echo "  -> Groq response: ${RESPONSE}"
else
    echo "  -> Notice: GROQ_API_KEY not exported in current shell environment."
fi

# 7. Verification Summary
echo "[+] Verifying updated config.yml..."
python3 -c '
import yaml, os
cfg_path = os.path.expanduser("~/.tau/agent/config.yml")
with open(cfg_path) as f:
    cfg = yaml.safe_load(f)
print("  -> modelRoles.default:", cfg.get("modelRoles", {}).get("default"))
print("  -> modelRoles.advisor:", cfg.get("modelRoles", {}).get("advisor", {}).get("model"))
print("  -> modelRoles.smol:", cfg.get("modelRoles", {}).get("smol"))
print("  -> extensions:", cfg.get("extensions"))
print("  -> disabledExtensions:", cfg.get("disabledExtensions"))
'

echo "[+] Deploy script execution finished successfully."
