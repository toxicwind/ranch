# nuvio

Nuvio is a custom Stremio-based media theater for **LG webOS TVs**. It exists because the
official Stremio app always plays the first audio track in the list, ignoring the viewer's
preferred language; Nuvio reads tracks from the TV's native media pipeline and picks the
configured one.

It lives under `android-fleet/` because the fleet is *the collection of Chris's own screens*,
not a claim about the OS. The Pixel and the Google TV are reached over ADB; Nuvio's LG is
reached over the webOS `ares` CLI (SSH). Same intent, different wire.

| Target | Device | Transport | Where |
|---|---|---|---|
| `phone-backup/` | Pixel 9 Pro XL | ADB, wireless debugging, rotating port | [`../docs/devices.md`](../docs/devices.md) |
| `../` (fleet root) | Google TV "SmartTV 4K FFM" | ADB, authorized 2026-09-18 | [`../docs/devices.md`](../docs/devices.md) |
| `nuvio-platform/` | LG webOS TV | webOS `ares` CLI over SSH | here |

## The two trees

| Path | What it is |
|---|---|
| `nuvio-platform/` | **toxicwind's superset.** Owns the interesting code: the P2P swarm, subtitle translation, the dedup + manifest proxy, the SEL search engine, the webOS app shell, plus Tizen packaging and a docker-compose stack. Its `src/` is the source of record. |
| `nuvio-webos/` | **The minimal upstream-shaped tree.** The same app with the four patches isolated in `patches/` and a `webosbrew/apps.json` that points at `NuvioMedia/NuvioTVWebOS`. This is the shape that installs cleanly from Homebrew Channel. |

`nuvio-webos/README.md` documents the device workflow (ares setup, Homebrew Channel,
`make deploy`). `nuvio-platform/README.md` documents the platform layout. Read those before
changing anything — they are the authority for their own trees.

## What is *not* committed here

Both trees were vendored third-party checkouts. Per `.gitignore`:

- `nuvio-platform/submodules/` — 11 upstream checkouts (NuvioWeb, NuvioTVWebOS, NuvioWebTVInstaller, comet, p2p-media-loader, hlsjs-p2p-engine, subtitle-translator, llm-subtrans, xiu, webos-homebrew, docchi-addon). Their URLs are declared in `nuvio-platform/.gitmodules` and belong to third parties, so they stay independent repos rather than becoming gitlinks here.
- `nuvio-platform/*.tar.gz` — the same 11 projects as source archives, 49 MB, unpacked on demand.

Between them that is 690 MB of the 690 MB. The tracked surface is ~50 files.

```sh
npm run submodules:update     # inside nuvio-platform/ — fetch the 11 upstream checkouts
```

## Build and deploy

From the fleet root, via the estate's mise tasks:

```sh
mise run nv-build      # build:webos
mise run nv-test       # test:coverage
mise run nv-package    # package:webos — produces the IPK, depends on nv-build
mise run nv-dev        # dev watch
```

Each task runs with its working directory already set to `nuvio-platform/`; there is no `cd`
to forget.

On the device itself the deploy is `make deploy DEVICE=<name>` from either tree, which
downloads dependencies, builds, packages the IPK, installs it, and launches it.