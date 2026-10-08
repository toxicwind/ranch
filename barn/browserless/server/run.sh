#!/bin/bash
set -a
# 2026-10-08 warden: .browserless archived by home reorg; prefer live, fall back to archive.
_BLESS=/home/toxic/.browserless
[ -d "$_BLESS/app" ] || _BLESS=/home/toxic/archive/home-dirs-2026/.browserless
[ -f "$_BLESS/.env" ] && . "$_BLESS/.env"
set +a
export TOKEN="${BROWSERLESS_TOKEN:?}"
export PORT="${BROWSERLESS_PORT:-25130}"
export HOST="127.0.0.1"
export PLAYWRIGHT_BROWSERS_PATH="$_BLESS/browsers"
export CONNECTION_TIMEOUT="${BROWSERLESS_CONNECTION_TIMEOUT:-60000}"
export CONCURRENT="${BROWSERLESS_CONCURRENT:-10}"
export NODE_ENV=production
exec node "$_BLESS/app/build/index.js"
