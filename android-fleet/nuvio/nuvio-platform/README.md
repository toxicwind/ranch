# Nuvio Platform

**Nuvio** — Custom Stremio-based media theater for LG webOS TVs with working default audio language selection, built on top of the Nuvio/NuvioMedia forks.

The official Stremio app has a bug where it always plays the first audio track in the list, ignoring the user's preferred audio language setting. This build fixes that by reading tracks from the TV's native media pipeline and automatically selecting the track matching your configured language.

Built from the [Nuvio fork](https://github.com/NuvioMedia/NuvioTVWebOS) with the official Stremio streaming server.

---

## Architecture

| Component               | Path                              | Description                              |
| ----------------------- | --------------------------------- | ---------------------------------------- |
| **NuvioTVWebOS**        | `submodules/NuvioTVWebOS/`        | Core webOS app (patched Stremio Theater) |
| **NuvioWeb**            | `submodules/NuvioWeb/`            | Nuvio web client                         |
| **NuvioWebTVInstaller** | `submodules/NuvioWebTVInstaller/` | WebOS installer                          |
| **NuvioWebTVInstaller** | `submodules/NuvioWebTVInstaller/` | WebOS installer                          |

---

## Prerequisites

1. **Install webOS ares CLI** — `npm i -g @webosose/ares-cli` (requires Node.js 20 for SSH compatibility)
2. **Enable Developer Mode** on your TV: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app
   - OR install [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) for rooted TVs
3. **Configure your TV as a device** — `ares-setup-device`

> **Note:** Developer Mode expires after 1000 hours. Rooted TVs with Homebrew Channel don't have this limitation.

---

## Install via Homebrew Channel (Recommended)

If your TV is rooted with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel):

1. Open Homebrew Channel on your TV
2. Go to settings and add this repository:
   `https://raw.githubusercontent.com/kieranbrown/stremio-webos/main/webosbrew/apps.json`
3. Find Nuvio in the app list and install

---

## Install Manually

```sh
make deploy
```

This downloads all dependencies, builds the app, packages the IPK, installs it on your TV, and launches it.

Replace the default device name if needed: `make deploy DEVICE=myTV`

### Other Commands

```sh
make build     # Download dependencies + build (no install)
make package   # Build + create IPK
make restart   # Close + relaunch on TV
make clean     # Remove build artifacts
```

---

## Auto-start on Input Select

On rooted TVs, register Nuvio as an input source so it appears in the TV's input list and can auto-launch:

```sh
luna-send-pub -n 1 'luna://com.webos.service.eim/addDevice' '{"appId":"io.nuvio.tv","pigImage":""}'
```

Run this via SSH on the TV.

---

## Submodules

```sh
git submodule update --init --recursive
```

| Submodule           | Path                              | Description                              |
| ------------------- | --------------------------------- | ---------------------------------------- |
| NuvioTVWebOS        | `submodules/NuvioTVWebOS/`        | Core webOS app (patched Stremio Theater) |
| NuvioWeb            | `submodules/NuvioWeb/`            | Nuvio web client                         |
| NuvioWebTVInstaller | `submodules/NuvioWebTVInstaller/` | WebOS installer                          |

---

## Patches (in `patches/`)

| Patch                                   | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| `audio-track-selection.patch`           | Auto-select audio track matching user's configured language |
| `fix-search-keyboard-polling.patch`     | Fix search keyboard polling behavior                        |
| `fix-search-keyboard-textinput.patch`   | Fix search keyboard text input                              |
| `use-native-decode-on-direct-url.patch` | Use native decode for direct URLs                           |

---

## Credits

- [NuvioMedia/NuvioTVWebOS](https://github.com/NuvioMedia/NuvioTVWebOS) — Core fork
- [Stremio](https://www.stremio.com/)
- [NoobyGains/stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv) — Theater frontend base
- [webOS Homebrew Project](https://www.webosbrew.org/)
