# rustdesk-server (estate)

Self-hosted RustDesk ID/rendezvous + relay server. ranch/ is gitignored in the
estate repo, so this README + SHA256SUMS carry the provenance for reproduction.

- Version: **1.1.16** (official upstream release)
- Source: https://github.com/rustdesk/rustdesk-server/releases/download/1.1.16/rustdesk-server-linux-amd64.zip
- Verify: `cd ranch/rustdesk-server && sha256sums -c SHA256SUMS` (or `sha256sum -c`)
- Install: `curl -sL -o rs.zip <url> && unzip -o rs.zip`

## Runtime

- Pitchfork daemons: `rustdesk-hbbs` (hbbs -p 25221 -r 100.72.199.93:25222),
  `rustdesk-hbbr` (hbbr -p 25222). See estate pitchfork.toml.
- Ports (SSOT: estate config/ports.env RUSTDESK_* keys):
  - 25220 tcp — hbbs nat-type test (hbbs port-1)
  - 25221 tcp+udp — hbbs ID/rendezvous (hole punch needs UDP)
  - 25222 tcp — hbbr relay
  - 25223 tcp — hbbs websocket
  - 25224 tcp — hbbr websocket relay
- Keypair `id_ed25519` / `id_ed25519.pub` is generated here on first run.
  **Never commit the private key.** Public key (base64) is shown by
  `mise run rustdesk-clients` from the estate root.
- Client config: ID server `100.72.199.93:25221`, relay `100.72.199.93:25222`,
  plus the public key — over Tailscale.
