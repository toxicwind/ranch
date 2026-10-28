# flotilla 🛶

> A **flotilla of floating windows** on the android-fleet Pixel — freeform
> viewports that ride alongside your Termius SSH session like
> picture-in-picture cards. One shell script. No APK. No root.
>
> Part of [**the ranch**](https://github.com/toxicwind/ranch) via `android-fleet`.

```
┌──────────────────────────────────┐
│  termius — focus, your thumbs    │
│   $ tau "ship the auth flow"     │
│                                  │
│        ┌───────────────┐         │
│        │ ▒▒▒ floated ▒▒▒│        │   ← freeform card
│        │ ▒ github 2FA  ▒│        │     (rounded, captioned,
│        │ ▒ authorize  ▒▒│        │       taps are yours)
│        └───────────────┘         │
└──────────────────────────────────┘
```

---

## Verified on

| | |
|---|---|
| **Device** | Pixel 9 Pro XL (`komodo_beta`) |
| **Android** | 17 (user build, `ro.debuggable=0`) |
| **Transport** | wireless adb, LAN `10.0.0.77:<rotating>` |
| **adb** | 1.0.41 (host) — the on-device levers below are **alpha-grade in Oct 2026**: undocumented flags, rotating ports, help-text that lies |
| **Freeform** | OFF by default on Pixel user builds; flotilla idempotently enables it |

---

## Use

```bash
flotilla open https://github.com/login/device      # float any URL (Firefox default)
flotilla bounds 42 900 400 2200 1400               # move/resize task 42
flotilla list                                      # tasks + ids for bounds
flotilla focus                                     # who owns the screen right now
flotilla dark on                                   # floated pages go dark
flotilla enable                                    # idempotent freeform enable
```

Env: `FLOTILLA_DEVICE` (default `10.0.0.77:43945`) — re-point when the port rotates.

---

## Focus doctrine

`adb input` lands on the **focused** window — tap blind and you've typed into
the wrong app, mid-SSH. flotilla's covenant:

> **flotilla floats windows; it never taps.** Launches bring their own window
> forward (tap-free). Every press belongs to the human holding the phone.

This is a feature, not a limitation: the floated card is *deliberately* the
one thing on the phone that wants a finger.

---

## The alpha-tax cheat sheet (October 2026)

Levers that work, and how they misbehave:

| Lever | The truth |
|---|---|
| `settings put global enable_freeform_support 1` | freeform OFF by default on user builds; set-and-forget, survives reboots |
| `am start … --windowingMode 5` | mode **5** = freeform. Flag is **invisible in `am start --help`** — it only shows in the parent `am` help. Nobody blogs this. |
| `am stack resize <taskId> L T R B` | the ONLY move/resize lever. Bounds are **space-separated** (flotilla converts your commas). Silently no-ops outside freeform. |
| `am stack list` | taskId source of truth for `bounds` |
| `cmd window` | `set-display-windowing-mode 5` exists but is **display-wide**, per-app freeform beats it |
| `cmd uimode night yes/no` | system dark — floated pages follow it (Firefox honors) |
| wireless adb port | **rotates on every wireless-debugging toggle**; the fleet keepalive re-scans 30000-50000 and re-binds |
| `input tap/text` | foreground-window-only by OS design — this is WHY the focus doctrine exists |

## Debug kit

When a float misbehaves, in order:

```bash
flotilla focus                                   # did focus really move?
adb -s $D shell dumpsys window | grep -iE 'mCurrentFocus|WindowingMode'
adb -s $D shell am stack list                    # find taskId + bounds
adb -s $D shell settings get global enable_freeform_support   # expect 1
adb -s $D shell getprop ro.build.version.release ro.product.model
```

**Symptom → cause:**

| Symptom | Cause | Fix |
|---|---|---|
| `both `port` and deprecated…` pitchfork WARN | unrelated monolith churn | ignore |
| floated app opens **fullscreen** | freeform support off | `flotilla enable`, re-open |
| `am stack resize` no-op | task not in mode 5 | re-open with flotilla, check `am stack list` |
| taps land in Termius | focus never left your SSH app | **good** — that's the covenant; tap the card first |
| `device offline` | wireless port rotated | fleet keepalive re-scan, update `FLOTILLA_DEVICE` |

## MCP surface (2026-10-28)

`flotilla/mcp/server.ts` — the phone as first-class MCP tools, federated via
thresher (`flotilla:*` on `:25127/mcp`):

| Tool | What it does |
|---|---|
| `flotilla:pixel_screenshot` | screencap → PNG on the box (+ focus in the result) |
| `flotilla:pixel_open` / `pixel_openshot` | headless URL open (fenix is the sole default — no chooser); openshot polls focus then caps in one round trip |
| `flotilla:pixel_tap` / `pixel_text` / `pixel_key` | input, **always returns current focus** (the covenant, enforced in-band) |
| `flotilla:pixel_ui` | UI-hierarchy XML — the safe prelude to any tap |
| `flotilla:pixel_connect` / `pixel_focus` | adb rescue (rotating port) / who owns the screen |
| `flotilla:flotilla_float` | freeform float via the CLI (windowingMode-5 alpha levers stay here) |

Daemon: pitchfork `estate/flotilla-mcp`, `:25245` (`FLOTILLA_MCP_PORT` in
ports.env), registered in the LIVE thresher config — registration walkthrough:
`estate/docs/mcp-guide-thresher.md`. Verified ship-day: routed
`retrieve_tools` → all tools namespaced `flotilla:*`; screenshot returned a
real 348 KB PNG while the architect SSH'd from the phone.

## Provenance

- Distilled live on 2026-10-27/28 completing a GitHub device-flow login while
  the architect SSH'd from the phone — the exact scenario flotilla exists for.
- Sibling: `android-fleet/firefox-cdp` (the Fenix CDP diagnosis flotilla was
  born from), `bin/pixel-adb-keepalive.sh` (the port-rotation keeper).
