# Android fleet devices (2026-09-18)

> Full dossiers: `pixel` → `android-fleet-pixel-adb` skill; Hisense TV →
> `docs/hisense-wuyishan.md` (2026-10-28 deep recon: hardware, ports, IPTV
> schema reverse, root-state verdict).

## Pixel 9 Pro XL — the Architect's phone

- LAN IP 10.0.0.77, ADB over wireless debugging. Connect port rotates
  (currently 44933); pairing persists in `/home/toxic/.android/adbkey*`.
- `pixel-adb-keepalive.sh` (pitchfork daemon) holds the session: reconnect
  every 60s, fast port re-scan (30000-50000) when the port rotates.
- Android 17. Mobilerun Portal 0.7.25, Aura 7.0.0.25.163.

## Google TV "SmartTV 4K FFM" — bedroom (Kodi .225)

- 10.0.0.225:5555, ADB authorized 2026-09-18 (was `unauthorized` until the Architect
  approved the on-TV dialog).
- Android 11. Kodi 21.2 data at
  `/sdcard/Android/data/org.xbmc.kodi/files/.kodi/`.
- This unlocks direct file deploys for kodi-fleet (forked addons, settings,
  log reads) — no more JSON-RPC-only limit.
- `adb -s 10.0.0.225:5555 shell` / `push` / `pull` from awrawr-pc.
- 2026-10-28 deep recon: codename `wuyishan` (55E82GUA), mt5895 SoC, `user`
  build, NO root path (locked AVB, no su/Magisk, non-debuggable apps).
  Third-party fleet: nuvio.livetv (KEEP, IPTV build), com.nuvio.tv (regular,
  pending removal), playtorrio (holds Xtream portal creds), wizard.red.the
  (Kodi fork), cloudstream, downloader. Full dossier:
  `docs/hisense-wuyishan.md`.
