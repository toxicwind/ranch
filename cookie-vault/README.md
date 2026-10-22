# cookie-vault

Full-session (cookies + per-origin localStorage) grab and restore between the
live Firefox profile and the keeper Chromium, with an optional continuous
auto-sync mode.

## Why it exists

The estate keeps one **keeper Chromium** (headed, persistent, `nv-audit`
profile) that the agent drives for logins, tabs and long-lived browser state.
A lot of that state lives in the architect's Firefox session. `cookie-vault`
bridge-mirrors the two so the keeper starts every task already signed into the
services (Google, AI Studio, NVIDIA, etc.) that Firefox has.

## Ports — the SSOT, not hardcoded

The keeper's CDP endpoint is defined by the estate Port SSOT
(`config/ports.env`):

```
BROWSER_KEEPER_CDP_PORT=25154
BROWSER_KEEPER_CDP=http://127.0.0.1:25154
```

`src/cli.js` resolves the CDP URL in this order:

1. `BROWSER_KEEPER_CDP` (full URL) if set,
2. else `BROWSER_KEEPER_CDP_PORT`,
3. else the SSOT default `25154`.

Historically this hardcoded the Chromium CDP fallback `127.0.0.1:9223`. That
port now belongs to a _separate, throwaway_ chrome-for-testing instance with a
scoped temp profile — writing to it silently no-ops and leaves the real keeper
untouched. Never reintroduce a bare `9223` default.

## Commands

```
cookie-vault grab-firefox      cookies + localStorage from live Firefox -> vault
cookie-vault grab-keeper       cookies + DOMStorage from keeper Chromium -> vault
cookie-vault restore-keeper    inject vault snapshot into keeper Chromium
cookie-vault sync              grab Firefox -> restore keeper in one shot
cookie-vault auto [ms]         run forever: sync when Firefox store mtime changes
cookie-vault status            report what the vault holds
```

The default Firefox profile is `~/.mozilla/firefox/7c8v85fg.default-nightly`
(override with `FF_PROFILE`). The vault is `~/.browserless/vault/vault.json`.

`grab-firefox` snapshot-copies `cookies.sqlite` + `webappsstore.sqlite` (and
per-origin localStorage) to avoid locking a live Firefox, decompresses the
value blobs, and writes the vault. `restore-keeper` pushes the snapshot into
the keeper over CDP (`Storage.setCookies` + DOMStorage).

## Caveats

- Cookies injected via CDP land in the running Chromium's **in-memory** store.
  Non-session cookies (future expiry) are flushed to the profile on browser
  shutdown; session cookies (no expiry) do not persist across a full Chromium
  relaunch.
- Google re-validates the session server-side. A cookie copy from one browser
  is frequently challenged back to `accounts.google.com` even when the values
  and flags are correct — completing that requires a one-time real sign-in in
  the keeper. See `estate/ops/gemini-eap/BILLING.md`.
