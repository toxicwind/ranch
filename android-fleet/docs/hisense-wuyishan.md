# Hisense SmartTV 4K FFM (`wuyishan`) — Device Profile

> Second Android device in the fleet, added 2026-10-28. Companion doc to
> `pixel-adb-keepalive.sh` / the `android-fleet-pixel-adb` skill.

## Identity

| Field | Value |
|---|---|
| LAN IP | `10.0.0.225` (Wi-Fi `DankWifi`, wlan0) |
| ADB endpoint | `10.0.0.225:5555` — **fixed port**, unlike Pixel's rotating one |
| Serial | `0000dc9a7d3e0b65` |
| MAC (Wi-Fi / BT) | `38:64:07:f0:48:56` / `38:64:07:f0:48:55` |
| Model | SmartTV 4K FFM (marketing) — `ro.vt.product.model` = **55E82GUA** |
| Device/codename | `wuyishan` (system flavor `hisense_us_Hisense_ATSC3U`) |
| Board | MT9900, SoC `mt5895` (MediaTek), Wi-Fi driver `mt7961` |
| Android | 11 (SDK 30), patch `2026-04-05`, build `RTT2.211209.001` / `00.00.00.101` |
| Fingerprint | `Hisense/wuyishan/wuyishan:11/RTT2.211209.001/00.00.00.101:user/release-keys` |
| Build type | `user`, `release-keys` — **NOT debuggable** (`ro.debuggable=0`, `ro.secure=1`) |
| Verified boot | green, `vbmeta device_state: locked` — no root via boot chain |
| CPU | 4× Cortex-A73 (ARMv8, 32-bit userspace `armeabi-v7a`, zygote32) |
| RAM | ~1.9 GB (zram swap 800 MB) |
| Display | 3840x2160 (2K VCOM), density 320 |
| AB slots | yes (`_a` active), dynamic partitions, Treble |
| Encryption | file-based (FBE), `dm-crypt` default key |

## ADB connectivity

USB-debugging toggle is what unlocks network ADB on this TV (Hisense hides the
"Wireless debugging" screen entirely on this firmware). Once USB debugging is on:

```bash
adb connect 10.0.0.225:5555     # standard ATV port; persists across reboots
```

- Pairing not needed (port 5555, pre-Android-11-style adbd-tcp; authorization
  prompt appeared once on TV and was accepted).
- Connection survives TV power-cycle as long as USB debugging stays enabled.
- Keepalive (if needed): simple `adb connect 10.0.0.225:5555` retry loop, no
  port scan — see `estate/pixel-adb-keepalive` for the pattern; TV variant can
  be a one-liner since the port never rotates.

## Open network ports (scanned 2026-10-28)

| Port | Purpose |
|---|---|
| 5555 | adbd (TCP) |
| 6466/6467 | Google Cast / Cast receiver |
| 7000 | AirPlay / Companion |
| 8008/8009 | Chromecast (v1/v2) |
| 8443 | Cast TLS |
| 9000/9001 | Hisense/MediaTek services (`hs_*`, mdnsd-adjacent) |
| 9500/9501 | localhost-only — MTK internal |
| 12345 | localhost-only — MTK internal |
| 38400/39500 | LAN-bound MTK services (tunneled app traffic) |

IPv6 is live (Comcast `2601:280:5280:1c00::/64`); many outbound 443 flows.

## Memory / storage profile (the "why is it slow" answer)

- **RAM 1.9 GB is the bottleneck.** `MemAvailable` sags to ~260 MB with
  `com.nuvio.livetv` (~136 MB PSS) + launcher + GMS + `com.esaba.downloader`
  (~121 MB PSS, mostly swap) resident. SwapTotal 800 MB with ~680 MB used.
- **/data 6.0 GB, 4.4 GB used (76%)** — APKs are the bulk (playtorrio 72 MB,
  nuvio.livetv 54 MB APKs plus CloudStream extension packs in
  `files/cs_extensions/*.cs3`).
- System partitions (`/`, `/vendor`, `/product`, `/system_ext`) are 100% full —
  that is normal for A/B read-only roots, not user-deletable.
- Only ~1.4 GB free on /data: keep one player app, not two.

## Installed apps of interest (third-party)

| Package | Role |
|---|---|
| `com.nuvio.livetv` | **Nuvio IPTV (KEEP)** — has `IptvIcon*` leanback launcher icons |
| `com.nuvio.tv` | regular Nuvio (candidate for removal — architect order: keep IPTV) |
| `com.playtorrio.tv` | PlayTorrio (Stremio-like, CloudStream core) — holds IPTV portal creds |
| `wizard.red.the` | "Red Light" — Kodi fork, has MANAGE_EXTERNAL_STORAGE |
| `com.lagradost.cloudstream3.prerelease` | CloudStream |
| `com.esaba.downloader` | Downloader (sideloading helper) |
| `com.castify.tv`, `com.playtorrio.tv` | cast targets |

## Root / privilege state (2026-10-28)

- No `su`, no Magisk; `user` build + locked bootloader + AVB enforcing → **no
  on-device root path**. `run-as` unavailable (apps not debuggable).
- App data dirs (`/data/user/0/<pkg>`) are shell-inaccessible — permission denied.
- `adb backup` exists but requires on-TV confirmation dialog and produced only
  the 47-byte header without interactive confirm (deprecated API on A11).
- FileProviders are `not exported` — content query blocked by SecurityException.
- **Pattern-borrow conclusion:** same situation as Pixel Fenix CDP — genuine
  Android security boundary; the workable lane is in-app export/import via
  deep links (`nuvio://`, `playtorrio://`, `stremio://` schemes) or manual
  portal re-entry, NOT filesystem extraction.

## IPTV schema reverse (from APK dex strings)

### playtorrio — `iptv_portals` (DataStore-backed)

```
table: iptv_portals
columns: portalUrl, portalUser, portalPass, portalName, portalExpiry
datastore key: iptv_portal_browser/{portalUrl}/{portalUser}/{portalPass}
              ?portalName={portalName}&portalExpiry={portalExpiry}
```
Xtream portals live here. PlayTorrio also ships CloudStream extension packs
(`files/cs_extensions/*.cs3` — `IPTVPlayer.cs3`, `PublicSportsIPTV.cs3`,
`QuickIPTV.cs3`, plus VOD providers: MPlayer, LayarKaca, Kisskh, Idlix, …).
`.cs3` = CloudStream extension archive, not a database.

### nuvio.livetv (Room DB, same core as com.nuvio.tv)

```
poster_fix  (uid TEXT PK, title TEXT NOT NULL, year INTEGER)
posters     (uid TEXT PK, poster TEXT, checked INTEGER NOT NULL, title TEXT)
prefixes    (pl TEXT, prefix TEXT, PK (pl, prefix))
stage       (src TEXT NOT NULL, xid TEXT NOT NULL, start INTEGER NOT NULL,
             stop INTEGER NOT NULL, title TEXT NOT NULL, descr TEXT, cat …)
```
Room entities: `tableChannel`, `tableByteChannel`, `tablePlaylistFromState`.
DataStore buckets seen in dex: `nuvio_type`, `nuvio_vod_cache`,
`nuvio_vod_cache_stale`, `oauth/device/code`. Portal/xtream config goes into
the same Room store via the in-app IPTV setup, not via a portable file.

## Useful settings snapshot

| Setting | Value | Note |
|---|---|---|
| `adb_enabled` | 1 | |
| `adb_wifi_enabled` | 0 | Hisense never exposed wireless-debug UI |
| animation scales | 0.5 ×3 | already reduced |
| `screen_off_timeout` | 600000 (10 min) | |
| `install_non_market_apps` (secure) | 1 | sideloading open |
| `lockscreen.disabled` | 1 | |
| `location_mode` | 3 (off-ish/network) | |
| launcher | `com.google.android.apps.tv.launcherx` (Google TV) | |

## Quick commands

```bash
TV=10.0.0.225:5555
adb connect $TV
adb -s $TV shell pm list packages -3          # sideloaded apps
adb -s $TV shell dumpsys meminfo com.nuvio.livetv
adb -s $TV shell am force-stop com.nuvio.tv   # the to-be-deleted regular Nuvio
adb -s $TV install -r app.apk                 # sideload
adb -s $TV shell logcat -c && adb -s $TV logcat
```

## Rename/backdrop (pending work)

- Extract Xtream portal creds from playtorrio (via in-app view, since
  filesystem route is walled) → re-add into Nuvio IPTV (`com.nuvio.livetv`).
- `pm uninstall -k --user 0 com.nuvio.tv` to drop regular Nuvio while keeping
  IPTV variant — **not executed yet; awaiting explicit go** (destructive,
  architect-ordered scope: "delete regular nuvio, keep iptv").
