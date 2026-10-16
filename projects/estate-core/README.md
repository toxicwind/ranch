# estate-core

Estate Core — private project for the estate runtime.

Part of the Ranch estate monorepo. Runs on awrawr-pc (home toxic) via Tailscale mesh.

## Configuration

- NIM API key: stored in secretsmith (`service=nim`, `provider=nvidia`)
- Brevo API key: stored in secretsmith (`service=brevo`)
- NIM base URL: `http://127.0.0.1:25193/v1`

## Setup

```bash
# Source the estate environment
source /home/toxic/estate/.env

# Verify secretsmith access
secretsmith --show search --attr service=nim
secretsmith --show search --attr service=brevo
```

## Tests

```bash
# Unit tests
bun test tests/

# Integration tests
bun test tests/integration/
```
