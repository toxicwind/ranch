<div align="right">

[![license: MIT](https://img.shields.io/badge/license-MIT%20%2B%20upstream-blue?style=for-the-badge)](https://github.com/toxicwind/estate-scripts-projects#license)
[![estate-scripts-projects](https://img.shields.io/badge/estate-scripts--projects-1f6feb?style=for-the-badge)](https://github.com/toxicwind/estate-scripts-projects)

</div>

# Yote — Unified Messaging Gateway

> Telegram + Discord gateway in Rust, extracted from OpenFang.

> **Why care? One service, both chat networks: the gateway unifies Telegram Bot API and Discord into a single LLM-backed service, extracted from `openfang-channels` so it can evolve independently.**

- **Telegram + Discord in one binary — unified message ingress**
- **LLM-backed — routes through herd (`:25100`)**
- **estate-scripts port discipline — `:25102` via `YOTE_PORT`, per the ports SSOT**
- **Extracted from OpenFang — `crates/openfang-channels` lineage, standalone future**

```mermaid
flowchart LR
    TG[Telegram Bot API] --> GW[yote gateway]
    DC[Discord gateway] --> GW
    GW --> LLM[herd :25100]
    LLM --> R[responses]
    R --> GW --> TG & DC
```

## Quick start

```bash
git clone https://github.com/toxicwind/yote.git && cd yote
cargo build --release
TELEGRAM_BOT_TOKEN=... DISCORD_BOT_TOKEN=... LLM_ENDPOINT=http://127.0.0.1:25100/v1 ./target/release/yote
```

## License & security

- **License:** [MIT](https://github.com/toxicwind/estate-scripts-projects#license)
- **Security:** Bot tokens via environment variables — never in the repo. Binds per the estate-scripts ports SSOT (`YOTE_PORT`).

---

> Extracted from [OpenFang](https://github.com/toxicwind/openfang) `crates/openfang-channels`.  
> Telegram + Discord gateway unified into a single service.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Telegram   │────→│             │     │                 │
│   Bot API   │     │   Yote      │────→│  LLM (llama-    │
└─────────────┘     │  Gateway    │     │   swap :25100)  │
┌─────────────┐     │             │     │                 │
│   Discord   │────→│             │     │                 │
│  Gateway    │     │             │     │                 │
└─────────────┘     └─────────────┘     └─────────────────┘
```

## Quick Start

```bash
git clone https://github.com/toxicwind/yote.git
cd yote
cargo build --release

# Configure
export TELEGRAM_BOT_TOKEN=your_token
export DISCORD_BOT_TOKEN=your_token
export LLM_ENDPOINT=http://127.0.0.1:25100/v1

# Run
./target/release/yote
```

## Ports (estate-scripts SSOT)

| Service | Port | Env Var |
|---------|------|---------|
| Yote HTTP API | 25102 | `YOTE_PORT` |

## License

Apache-2.0 OR MIT (same as OpenFang)
