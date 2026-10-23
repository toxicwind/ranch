# Pass 4 — SSH access, ingress trust, peerd (cell binary `bf02fce7cca9c808bc60a236d5cc1b8112bc85c3`)

**Date:** 2026-10-20. Source: `strings -n 8` over the staged binary
`/home/toxic/estate/ranch/hatch/opt-hatch/bin/hatch` → `strings_all.txt`
(746,395 lines). Trigger: live Noise-stack probes from
`estate-recon/muse-meta-hatch/artifacts/web-bundle-decode/` (see
`FINDINGS.md` there) hit a 401 `notary_required` on `ssh_access`, then a
501 with the exact message decoded below.

## 1. ssh_access is a first-class crate in the cell

- `hatch-engine/crates/hatch-networking/src/ssh_access.rs` implements the
  5th noise service (`SERVICE_SSH_ACCESS = 4`, matching the web client).
- Routes confirmed live from the cell: `POST /v1/ssh/operator/enable`,
  `POST /v1/ssh/operator/disable`, `GET/POST /v1/ssh/operator/status`.
- The notary header name `X-Hatch-Notary-Authorization` is present in the
  cell binary too — validation happens cell-side, not only ingress-side.

## 2. Live probe result (our Noise_XX stack, shared LB)

Sequence: 401 `notary_required: exact notary endorsement required` →
after minting `POST /api/hatch/ssh-access/tokens {vm_id}` and attaching
the route endorsement as `X-Hatch-Notary-Authorization` **plus** the
main `/v1/noise` notary token as the WSS `notary_token` param plus
client-matched headers (`x-app-id: hatch-web`, `Accept-Language`,
`x-request-id`):

```
501 {"error":"Meta SSH access controls are available only on confidential
VMs. On this VM, Meta SSH access is always enabled."}
```

The whole chain — Noise_XX handshake, ServiceRequest routing to service 4,
notary endorsement validation — **validates**. The 501 is a policy answer,
not an auth failure. The cell also carries the matching i18n string:
_"Explanation shown when a user tries to enable or disable operator SSH
access on a non-confidential VM, where Meta SSH access is always enabled."_

Consequence: operator toggling only exists on confidential VMs (CVMs).
On this standard VM the SSH door is not gated by the operator toggle.

## 3. Ingress trust model (why header-only 401'd first)

Cell-side strings expose the trust boundary:

- `X-Hatch-Verified-Uid` — "authenticated via X-Hatch-Verified-Uid (ingress
  auth check)"; "trusted ingress request missing verified UID header;
  rejecting protected HTTP route"; "unauthorized; request must be
  authenticated through the ingress".
- WS-upgrade metrics: `ws_upgrade_authd_roundtrip_ms`,
  `ws_upgrade_vault_status_ms`, `ws_upgrade_authd_permit_wait_ms` — direct
  WS upgrades do an authd roundtrip + vault + permit check cell-side.
- `x-hatch-verified-webhook-relay` — a second trusted-relay header.

The shared LB authenticates (cookies → access token → hatch token) and
stamps `X-Hatch-Verified-Uid` on trusted requests; a raw client must
present the full notary endorsement set to satisfy protected routes.

## 4. peerd (peer daemon) — the pairing backbone

- Cell-side client: `/run/hatch/peerd/api.sock` UDS
  (`hatch_networking::uds::acl::peerdaemon`,
  `hatch-server/src/daemon/peers/peerd_client/exact_connection.rs`).
- Long-lived event stream: "peerd event stream connected / ended;
  reconnecting / unavailable; retrying", `PeerdEvent::*` variants
  (`StreamLagged`, `PeerAttested`, `ConnDown`, `DialFailed`, …).
- `PeerdIdentity` (3 fields), "peerd's verified attestation verdict for the
  counterpart's latest …", peer admission mirror ("failed to publish peer
  admission mirror to peerd", "failed to disable peer admission after …").
- Pairs with the web edge route `/hatch/peer/accept` (PEER_INVITE_LANDING)
  — the nodes/shared-agent pairing flow terminates in peerd attestation.

## 5. Notary machinery

- `notary_mint_ms` metric in the cell (spaces + networking crates).
- Edge mints `endorsement.v1.<payload>.<sig>.<uri-payload>.<uri-sig>`
  tokens; restrictions include `timeout:<unix>`, `hostname:<vm>.metaaivm.com`,
  `uri-handle-prefix:<route>`; `identity` is the numeric user id.
- `notary_e` / `notary_i` / `notary_m` symbols in the cell.
- Endorsement routes minted live: `/v1/ssh/operator/{enable,disable,status}`.

## 6. Quota machinery exists cell-side (context for the "usage limit" red herring)

Sentinel metric families in the binary: `quota_mode`, `quota_limit`,
`quota_activity_class`, `quota_evaluated_total`, `quota_exceeded_total`,
`quota_rejected_total`, `quota_retry_after_secs`,
`quota_available_units`, `quota_refill_units_per_second`,
`out_of_credits` event, `subscription_tier_raw`, `monthly_credits_status`.
The chat-surface credit gate is quota-policy machinery; agent execution
(heartbeat, scheduled tasks, background runs) observed continuing through
the banner state on 2026-10-19.

## Artifacts

- `strings_all.txt` — full strings dump of the staged cell binary
- probes + logs: `estate-recon/muse-meta-hatch/artifacts/web-bundle-decode/`
  (`tools/noise_middec.py`, `ssh_noise_session.jsonl`, `ssh_tokens.json`,
  `notary_main.json`, `tools/probe_v1_ssh.py`)
