# Drover — Herd Router VS Code Extension

VS Code extension for herd-level model routing with Gemini EAP tool retrieval.

## Structure

- `drover-1.0.0-sovereign.vsix` — working built extension (installable)
- `sidecar/` — Gemini EAP tool-retrieval sidecar (real source, builds clean)
  - `src/sidecar.ts` — LM Chat Provider using `interactions.create` with `tool_search`
  - Builds to `dist/sidecar.js` via `node esbuild.js`

## Note on source

The original `src/` contained only minified/decompiled fragments (not rebuildable).
They were removed. The `.vsix` is the canonical working artifact. A proper
source rebuild is future work — the sidecar is the actively maintained piece.

## Build

```sh
# Main extension (from vsix — no source rebuild available)
code-insiders --install-extension drover-1.0.0-sovereign.vsix --force

# Sidecar (real source)
cd sidecar && node esbuild.js
```

## Monorepo

Part of the ranch monorepo. See `../package.json` for workspace config.
