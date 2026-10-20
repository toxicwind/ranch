# Atria ferret-den surface recon (2026-10-20)

Ran via [`ferret`](../../../../../../../.local/bin/ferret) — the estate's
projectdiscovery wrapper (`webprobe`=httpx, `dnsprobe`=dnsx, `tlsprobe`=tlsx,
`subprobe`=subfinder). Targets read from `targets.txt`:
`api.atria-asi.ai`, `www.atria-asi.ai`, `auth.atria-asi.ai`.

## Found

| host | webprobe (httpx) | dns (dnsx) | tls (tlsx) |
|------|------------------|-----------|-----------|
| `auth.atria-asi.ai` | **302** (redirect → Logto sign-in) | resolves | :443 OK |
| `www.atria-asi.ai` | **200** "Atria Dawn", CloudFront, Alibaba OSS + CloudFront, HTTP/3 | resolves | :443 OK |
| `api.atria-asi.ai` | **200** "Atria Dawn — 模型 API" (the console) | resolves | :443 OK |
| `www.api.atria-asi.ai` | (subdomain via subfinder — NEW, not in HAR) | — | — |

## Notes

- Infra corroborates the HAR: **Vercel/Next.js console** on `api`/`www`, **Logto**
  auth on `auth` (302), static via **AliyunOSS → CloudFront**.
- `subprobe` surfaced `www.api.atria-asi.ai` — a host not observed at all in the
  request-oracle capture; worth a follow-up httpx to see if it hosts anything.

## Raw files

- `webprobe.txt`, `dnsprobe.txt`, `tlsprobe.txt`, `subprobe.txt`
- `targets.txt` — input