# ranch dashboard

The control UI for the ranch: herd (local) + flock (external).

Ripped out of `herd` (sovereign-projects/projects/herd) on 2026-09-21.
herd no longer bundles or serves a UI; this is its home now.

## Run

```sh
bun install
# point at herd (defaults to same origin)
VITE_HERD_API=http://127.0.0.1:25100 bun run dev
```

Or at runtime: `window.__HERD_API__ = "http://127.0.0.1:25100"` before load.

## Build

```sh
bun run build   # -> dist/
```

## Roadmap

- flock (external providers: NIM, OpenRouter, Groq, ...) panel alongside herd
- unified model view: local GGUFs + cloud endpoints, one playground
