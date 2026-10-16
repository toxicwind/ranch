<div align="right">

[![License: MIT](https://img.shields.io/badge/license-MIT%20%2B%20upstream-blue?style=for-the-badge)](LICENSE)
[![ranch/mcp](https://img.shields.io/badge/ranch%2Fmcp-fork-blue?style=for-the-badge)](https://github.com/toxicwind/huggingface-mcp-server)
[![smithery](https://img.shields.io/badge/install-smithery-black?style=for-the-badge)](smithery.yaml)

</div>

# huggingface-mcp-server

Fork of [`shreyaskarnik/huggingface-mcp-server`](https://github.com/shreyaskarnik/huggingface-mcp-server)
(MIT © 2025 Shreyas Karnik) — Hugging Face models, datasets, Spaces, collections,
papers, and Hub files as MCP tools. Maintained as a ranch fork with locked
uv resolution (`.python-version` + `uv.lock` vendored for reproducible installs).

Part of the [estate](https://github.com/toxicwind/estate) MCP fleet.

## What the fork changes

- **Reproducible env**: pins Python via `.python-version` and full `uv.lock`
- **ranch packaging**: Dockerfile tuned for the estate registry; smithery.yaml kept
- upstream features otherwise unchanged

## Run

```bash
uv run src/server.py        # stdio MCP
# or
docker build -t hf-mcp . && docker run -i --rm -e HF_TOKEN hf-mcp
```

## Configuration

| Env | Required | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | yes | Hugging Face API token |
| `ALLOWED_DIRS` | no | Filesystem allowlist for Hub file downloads |

Secrets belong in the keyring (`ranch/secretsmith`), never in the repo.

## Upstream provenance

- Upstream: `shreyaskarnik/huggingface-mcp-server` (MIT)
- Fork home: `ranch/mcp/huggingface-mcp-server` in estate/ranch
- Sync: track upstream, rebase fork-only files on top; never renumber rule ids

## License

MIT — upstream © Shreyas Karnik; fork changes MIT. See [LICENSE](LICENSE).
