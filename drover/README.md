# Drover — Herd Router VS Code Extension

> 🗺️ Part of [**the ranch**](https://github.com/toxicwind/ranch) — the whole inference estate, one map.

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

The main build entry is `scripts/mise-build.sh`. It runs the canonical build
locally through mise; eligible task artifacts restore through mbx-cache:

```sh
./scripts/mise-build.sh
```

The build copies the tree to a temp dir first: the ranch root `package.json`
declares a `corral` workspace with no `package.json` on disk, so `bun install`
run from `drover/` walks up to the root and fails. The sidecar
(`sidecar/src/sidecar.ts` → `dist/sidecar.js` via `node esbuild.js`) is the
actively maintained build; the root `compile` script is unwirable (`src/` was
removed, see note above).

## Monorepo

Part of the ranch monorepo. See `../package.json` for workspace config.
