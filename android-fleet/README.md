<h1 align="center">🐑 android-fleet</h1>

<p align="center"><b>ADB-managed Android devices on the LAN</b> — the Architect's Pixel 9 Pro XL and the bedroom Google TV, reachable from every agent, headlessly, at 2am.</p>

<div align="center">

[![license: MIT](https://img.shields.io/badge/license-MIT%20%2B%20upstream-blue?style=for-the-badge)](https://github.com/toxicwind/estate-scripts-projects#license)
[![pixel: wireless](https://img.shields.io/badge/pixel%20wireless%20debug-OK-22c55e?style=for-the-badge)]()
[![flotilla mcp](https://img.shields.io/badge/flotilla%20mcp%20%3A25245-live-6e56cf?style=for-the-badge)](docs/flotilla-mcp-tools.md)
[![termius audit](https://img.shields.io/badge/termius%20forensic-dossier-ed5c51?style=for-the-badge)](docs/termius-audit-20261028.md)
[![tv: kodi](https://img.shields.io/badge/tv%20kodi%20reachable-OK-22c55e?style=for-the-badge)](docs/devices.md)

</div>

---

## 📑 Table of contents

- [Why this exists](#-why-this-exists)
- [Devices](#-devices)
- [The headless route](#-the-headless-route)
- [MCP surface — flotilla](#-mcp-surface--flotilla)
- [The arsenal (rebranded black-tier tooling)](#-the-arsenal-rebranded-black-tier-tooling)
- [Forensics dossiers](#-forensics-dossiers)
- [Scripts](#-scripts)
- [Quick start](#-quick-start)
- [Config](#-config)
- [License & security](#-license--security)

---

## 🎯 Why this exists

The fleet's reach ends where ADB begins — unless someone holds the sessions open.
Wireless debugging ports rotate, TVs need on-screen approval, and a dropped
session at 2am means no deploys until morning. This project keeps both devices
reachable: a **keepalive daemon** that rediscovers the Pixel's rotating port,
and **documented, approved access to the TV** that unlocks direct Kodi file
deploys.

> **Doctrine:** additive-only. The keepalive never touches other adb devices;
> pair keys are credentials — never committed, never shared.

---

## 📱 Devices

| | Device | Endpoint | Access | Notes |
|---|---|---|---|---|
| 🟢 | **Pixel 9 Pro XL** *(the Architect's phone)* | `10.0.0.77:<rotates>` | wireless debugging · paired | keepalive holds the session; port rediscovered via fast scan on rotation |
| 🟢 | **Google TV** "SmartTV 4K FFM" *(bedroom)* | `10.0.0.225:5555` | ADB authorized 2026-09-18 | Kodi host — direct file deploys, no JSON-RPC-only limit |
| 🟡 | **LG webOS TV** | developer mode / Homebrew Channel | webOS `ares` CLI over SSH | not ADB — see [`nuvio/`](nuvio/README.md) |

📄 Full reference: [`docs/devices.md`](docs/devices.md)

---

## 🛰 The headless route

The complete **zero-hands** path from "agent on the box" to "acting on the phone":

1. **Transport** — wireless-debug ADB; `estate/pixel-adb-keepalive` (pitchfork)
   re-scans 30000-50000 every 60s so `adb devices` is normally already live.
   Rescue: mDNS (`adb mdns services`) → nmap fallback.
2. **Firewall** — the box drops LAN input by policy (`/etc/nftables.conf`,
   `inet awrawr_filter`). Any port the phone must hit (e.g. taas 25243) goes in
   the `10.0.0.0/24` tcp set. **Box-side curls never traverse this path** —
   probe from the phone (`adb shell nc -z <box> <port>`).
3. **Routing** — http VIEW intents resolve to Firefox (`org.mozilla.fenix`,
   `IntentReceiverActivity`) as the **SOLE default**: `am start -d <url>` is
   headless, no chooser ever appears.
4. **Tools** — `flotilla/mcp/server.ts` (`:25245`, thresher-federated as
   `flotilla:*`): screenshot / tap / text / ui-dump / headless-open with the
   **focus covenant** — every input tool returns the focused window.


### 🔑 Phone Auth SSOT & Fast Headless Editing Doctrine (2026-10-28)

1. **Max Use Phone for Auth**: The Architect's Pixel 9 Pro XL is the estate's primary auth vault holding Bitwarden (`com.x8bit.bitwarden`), Authy (`com.authy.authy`), and authenticators/keys.
   - For 2FA, OTP, portal sign-ins, or vault lookups: query the phone headlessly via flotilla MCP (`:25245`) or wireless ADB (`10.0.0.77:<port>`).
2. **Fast Headless Dequeue & Edit (`Alt+Up` / `Shift+Up`)**:
   - In headless TUI / CLI agent sessions, `Alt+Up` and `Shift+Up` (`app.message.dequeue`) dequeue a queued message back into the editor for instant, fast iteration without re-typing.
   - In remote ADB / termius headless navigation, use keychords to drive inputs at high speed.
```mermaid
flowchart TB
    subgraph lan[LAN 10.0.0.0/24]
        PIXEL[Pixel 9 Pro XL<br/>10.0.0.77:44933<br/>wireless debugging]
        TV[Google TV "SmartTV 4K FFM"<br/>10.0.0.225:5555<br/>Kodi 21.2]
    end
    subgraph yote[awrawr-pc]
        KA[pixel-adb-keepalive.sh<br/>pitchfork daemon<br/>reconnect 60s · port rescan 30000-50000]
        ADB[/usr/bin/adb]
        FLOTILLA[flotilla MCP :25245<br/>thresher-federated desktop → phone]
    end
    KA -->|holds session| PIXEL
    ADB -->|shell · push · pull| TV
    FLOTILLA -->|screencap · tap · type · ui| PIXEL
    TV -.->|unlocks| KODI[kodi-fleet deploys<br/>forked addons · settings · log reads]
```

---

## 🧿 MCP surface — flotilla

`flotilla/mcp/server.ts` on `:25245`, federated into the estate's only MCP gateway
(thresher `:25127`, sessioned `retrieve_tools` proof — see
[`estate/docs/mcp-guide-thresher.md`](https://github.com/toxicwind/estate-scripts-projects/blob/main/docs/mcp-guide-thresher.md)).

| Tier | Tools |
|---|---|
| **Input (focus-covenant)** | `pixel_screenshot` · `pixel_tap` · `pixel_text` · `pixel_key` · `pixel_ui` · `pixel_open` · `pixel_openshot` · `pixel_focus` · `pixel_connect` |
| **Audit / forensics (v2)** | `pixel_shell` · `pixel_package` · `pixel_appstate` · `pixel_shared` |
| **Float** | `flotilla_float` (picture-in-picture over the SSH session) |

📄 Full tool reference + verified audit patterns: [`docs/flotilla-mcp-tools.md`](docs/flotilla-mcp-tools.md)

---

## ⚔️ The arsenal (rebranded black-tier tooling)

> "Black" is a color, not a verdict. These are the non-mainstream, hacker-tier
> utilities the estate **actually uses** — renamed into the fleet so the name
> never leaks the original's bad reputation, and wired for the Architect's own
> devices only.

| Tool | Rebrand in-fleet | What it does for us | Status |
|---|---|---|---|
| [**Shizuku**](https://github.com/RikkaApps/Shizuku) `v13.6.0` | `pixel-priv-bridge` | spawns a privileged `app_process` via `adb shell sh …/start.sh` → system-API elevation for non-rooted phones | 📥 [`vendored/shizuku/`](vendored/shizuku/) · installed on Pixel |
| [**BlackDex**](https://github.com/CodingGay/BlackDex) `v3.2` | `apk-unpack-vault` | non-root dex unpacking — feeds `apk-autopsy` when jadx hits packed APKs | 📥 [`vendored/shizuku/BlackDex64-v3.2.apk`](vendored/shizuku/) |
| [**apkeep**](https://github.com/EFForg/apkeep) | `apk-provenance` | clean APK acquisition from Play / APKPure / F-Droid / Huawei — no device pulls | 🛠 cargo install |
| [**Frida gadget**](https://github.com/kiks7/frida-non-root) | `in-house-instrument` | dynamic instrumentation of **our own** fleet-tv builds (never the signed daily-driver apps) | 🔬 next build |
| [**VirtualXposed / VirtualApp**](https://github.com/android-hacker/virtualxposed) | `sandbox-app-config` | sandbox-runnable app copies for safe config forensics | 🔬 on demand |
| [**STF / DeviceFarmer**](https://github.com/DeviceFarmer/stf) | `device-farm` | browser-based multi-device fleet control — the "every pen has a rig" pattern | 🗺 roadmap |

**Why not raw root?** The Pixel is `ro.build.type=user` (not debuggable, no
bootloader unlock, no magisk/kernelsu/apatch). Shizuku + the sandbox lane are
the *reachable* elevations on a daily-driver user build — see the
[Termius dossier](docs/termius-audit-20261028.md) for exactly where each
boundary sits.

---

## 🕵️ Forensics dossiers

| Dossier | What it proves |
|---|---|
| [**Termius on Pixel — full audit**](docs/termius-audit-20261028.md) | the "wtf crashed my termius" case, root-caused: terminal copy >1MB blows the clipboard binder (→ `TransactionTooLargeException`), 512MB heap OMM family. Full settings map from APK schema reverse: 3 SQLite DBs, `allowBackup=false` verified in the manifest we pulled. |

Write-up rule: dossiers go in `docs/` with the date, carry **provenance**
(which tool/command produced which fact), and say what was *actually*
observed vs inferred.

---

## 🧰 Scripts

| Script | Job |
|---|---|
| `bin/pixel-adb-keepalive.sh` | holds the Pixel's ADB session over LAN wireless debugging. Reconnects every 60s; rediscovers the connect port via fast port scan (30000–50000) when wireless debugging rotates it. One-time pairing 2026-09-17 (keys persist in `/home/toxic/.android/adbkey*`). Additive only: never touches other adb devices (emulator-5554 etc.). Replaced the old Tailscale tcpip target (100.123.57.58:5555, dropped 2026-09-17 per the Architect: "new one drop other"). |

---

## 🚀 Quick start

```bash
adb -s 10.0.0.77:44933 shell            # Pixel (port rotates — keepalive tracks it)
adb -s 10.0.0.225:5555 shell            # Google TV
adb -s 10.0.0.225:5555 push addon.zip /sdcard/   # Kodi file deploy

# MCP surface (from any agent):
#   tools/list  → flotilla:* → pixel_shell "pm list packages | grep -i termius"
```

---

## ⚙️ Config

- Pixel pairing: `adb pair 10.0.0.77:<pair-port>` (one-time, code from the phone's
  "Pair with pairing code" screen). Keys in `/home/toxic/.android/adbkey*`.
- TV authorization: approved on the TV dialog 2026-09-18 (was `unauthorized`
  until the Architect approved it).
- Kodi data on the TV: `/sdcard/Android/data/org.xbmc.kodi/files/.kodi/`.

---

## 🛡 License & security

MIT where marked — [LICENSE](https://github.com/toxicwind/estate-scripts-projects#license).
ADB is **root-equivalent on the device** — these are the Architect's personal
devices on his LAN. The pairing keys (`/home/toxic/.android/adbkey*`) are
**credentials: never commit, never share.** Keepalive is additive-only by design
(never touches other adb devices).