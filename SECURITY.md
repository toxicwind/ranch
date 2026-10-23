# Security Policy

## Reporting a vulnerability

The ranch is a monorepo of many components. Report a vulnerability in the
component's **own** tracker via GitHub's private vulnerability reporting
(`Security` tab → `Report a vulnerability`) on
[toxicwind/ranch](https://github.com/toxicwind/ranch/security/advisories/new),
naming the affected animal (`herd/`, `flock/`, `barn/gatehouse`, …).

Do **not** open a public issue for a live vulnerability. You will get a
response within 72 hours; we will coordinate disclosure before any public fix
lands.

## Secrets policy

This estate runs on secrets that must never touch the repo:

- Provider API keys live in the environment or `/home/toxic/.secrets` — never in code, config, or chat logs.
- `barn/gatehouse`'s `mcp_config.json` is gitignored; the tracked `mcp_config.json.dist` is the scrubbed template, re-materialized with live secrets at every start.
- Flock client auth uses `$FLOCK_KEY`, minted per deployment.

If you discover a committed secret: rotate it first, then remove it. Reverting
the commit alone does not un-leak a secret.

## Supported versions

`main` is the supported line. Security fixes land on `main` first and are
called out in [CHANGELOG.md](CHANGELOG.md).
