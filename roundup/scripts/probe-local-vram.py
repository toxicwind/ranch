#!/usr/bin/env python3
"""probe-local-vram.py — Audit local GPU VRAM and detect running llama-server processes.

Verifies whether local models are occupying GPU memory against the estate policy
("nothing should be using local models right now").
"""

import json
import re
import subprocess
import sys


def get_gpu_info():
    cmd = [
        "nvidia-smi",
        "--query-gpu=name,memory.used,memory.total,utilization.gpu",
        "--format=csv,noheader"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return None
    parts = [p.strip() for p in res.stdout.strip().split(",")]
    if len(parts) >= 4:
        return {
            "name": parts[0],
            "used_mb": parts[1],
            "total_mb": parts[2],
            "util_pct": parts[3]
        }
    return None


def get_compute_apps():
    cmd = [
        "nvidia-smi",
        "--query-compute-apps=pid,process_name,used_memory",
        "--format=csv,noheader"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    apps = []
    for line in res.stdout.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 3:
            apps.append({
                "pid": int(parts[0]),
                "process": parts[1],
                "vram": parts[2]
            })
    return apps


def inspect_pid_model(pid):
    try:
        cmdline = open(f"/proc/{pid}/cmdline", "rb").read().decode("utf-8", errors="replace").replace("\x00", " ")
        model_match = re.search(r"--model\s+([^\s]+)", cmdline) or re.search(r"-m\s+([^\s]+)", cmdline)
        port_match = re.search(r"--port\s+([0-9]+)", cmdline) or re.search(r"-p\s+([0-9]+)", cmdline)
        return {
            "model": model_match.group(1) if model_match else "unknown",
            "port": port_match.group(1) if port_match else "unknown",
            "cmd": cmdline[:100]
        }
    except Exception:
        return {"model": "unknown", "port": "unknown", "cmd": ""}


def main():
    gpu = get_gpu_info()
    if not gpu:
        print("[!] nvidia-smi failed or no GPU found", file=sys.stderr)
        sys.exit(1)

    print(f"[*] GPU: {gpu['name']} | VRAM: {gpu['used_mb']} / {gpu['total_mb']} | Util: {gpu['util_pct']}")

    apps = get_compute_apps()
    llama_apps = []
    other_apps = []
    for a in apps:
        if "llama" in a["process"] or "beellama" in a["process"]:
            info = inspect_pid_model(a["pid"])
            a.update(info)
            llama_apps.append(a)
        else:
            other_apps.append(a)

    print(f"\n[*] Active Compute Processes ({len(apps)} total):")
    if llama_apps:
        print(f"  ⚠️ LOCAL LLAMA PROCESSES DETECTED ({len(llama_apps)}):")
        for la in llama_apps:
            print(f"     PID {la['pid']:<7} VRAM {la['vram']:<10} port {la['port']:<6} model: {la['model']}")
    else:
        print("  ✅ Zero local llama-server processes holding VRAM.")

    if other_apps:
        print(f"  ℹ️ Other GPU processes ({len(other_apps)}):")
        for oa in other_apps:
            print(f"     PID {oa['pid']:<7} VRAM {oa['vram']:<10} process: {oa['process']}")

    if llama_apps:
        print("\n[!] Policy Violation: local models are currently holding GPU memory.")
        if "--json" in sys.argv:
            print(json.dumps({"status": "violation", "llama_apps": llama_apps}, indent=2))
        sys.exit(2)
    else:
        print("\n[✓] Clean: no local LLM servers active on GPU.")
        if "--json" in sys.argv:
            print(json.dumps({"status": "clean"}, indent=2))
        sys.exit(0)


if __name__ == "__main__":
    main()
