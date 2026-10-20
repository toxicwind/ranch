# Atria ferret-den surface recon (2026-10-20) — authoritative, via gatehouse den MCP

Ran through the **fixed** den MCP tools (the den server now runs the Lua workflow
engine + dnsx `-l`/multi-type fixes). Confirms and extends the earlier CLI run.

## DNS (den:squeak, multi-type A/AAAA/CNAME/MX/NS/TXT) — 39 records

| host | type | value | infra |
|------|------|-------|-------|
| `api.atria-asi.ai` | A | 8.219.11.2, 47.84.81.102, 47.236.72.31 | **Aliyun ALB** |
| `api.atria-asi.ai` | CNAME | `alb-xg7hdn3j58c7oyfilr.ap-southeast-1.alb.aliyuncsslbintl.com` | Aliyun ALB (AP-Southeast-1) |
| `auth.atria-asi.ai` | A | 8.219.11.2, 47.84.81.102, 47.236.72.31 | Aliyun ALB |
| `auth.atria-asi.ai` | CNAME | same `…aliyuncsslbintl.com` | Aliyun ALB |
| `www.atria-asi.ai` | CNAME | `d16u98l0jgxvs6.cloudfront.net` | AWS CloudFront |
| `www.atria-asi.ai` | A (CloudFront) | 3.162.163.27/82/89/104 | CloudFront |
| `www.atria-asi.ai` | AAAA | 2600:9000:284a:* | CloudFront IPv6 |
| `www.atria-asi.ai` | NS | ns-*.awsdns-*.org/.co.uk/.com/.net | **AWS Route53** |
| `atria-asi.ai` | A | 3.162.163.27/82/89/104 | CloudFront |
| `atria-asi.ai` | NS | angelina/hank.ns.cloudflare.com | **Cloudflare** |
| `atria-asi.ai` | AAAA | 2600:9000:284a:* | CloudFront IPv6 |

**Key finding:** the API/Auth surface runs on **Aliyun Application Load Balancer
(AP-Southeast-1)**, NOT Vercel; the website/landing is on **CloudFront**
(CNAME `d16u98l0jgxvs6.cloudfront.net`); DNS is split Cloudflare (apex) + AWS
Route53 (www).

## HTTP (den:nose / httpx)

| url | status | size | title | tech |
|-----|:------:|-----:|-------|------|
| `https://auth.atria-asi.ai` | 302 | 57 | — | HSTS (Logto redirect) |
| `https://www.atria-asi.ai` | 200 | 1637 | Atria Dawn | AliyunOSS webserver, CloudFront, AWS, HTTP/3 |
| `https://atria-asi.ai` | 200 | 1637 | Atria Dawn | same |
| `https://api.atria-asi.ai` | 200 | 128072 | Atria Dawn — 模型 API | (console app) |

## Ports (den:scratch / naabu, top 100)

- `api.atria-asi.ai`: 80, 443
- `auth.atria-asi.ai`: 80, 443
- `www.api.atria-asi.ai`: none (dead CNAME)

## TLS (den:padlock)

- all 3 hosts: TLSv1.2, `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`.
- www cert SAN includes `*.atominnolab.com`, `atria-asi.com`, `atominnolab.com`
  → Atria's parent company is **Atomlo Lab** (also owns atria-asi.com /
  atominnolab.com).

## Prior CLI run (docs/atria/ferret/*.txt), cross-checked

Earlier direct `ferret <tool>` runs agreed: auth=302, www/api=200, AliyunOSS +
CloudFront. The den-MCP run adds the authoritative DNS/ALB/CDN mapping above.

## Finding

The Atria API is served from **Aliyun ALB (ap-southeast-1)** fronted by the
`api.atria-asi.ai` CNAME; Logto auth on `auth`; marketing on CloudFront. The
whole estate (Atria + parent Atomlo Lab = `atominnolab.com`/`atria-asi.com`)
shares the infra. Additional hosts to probe: `*.atria-asi.com`, `*.atominnolab.com`.