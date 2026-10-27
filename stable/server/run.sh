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
# 2026-10-27: the management route (routes/management/http/meta.get.js) resolves
# playwright-core's browsers.json through process.cwd(), not through the app
# dir. With the daemon cwd set to the estate/namespace dir that path did not
# exist, the route threw MODULE_NOT_FOUND and killed the whole server (it
# exited instead of binding :25130). Run from the app dir so
# ./node_modules/playwright-core/browsers.json resolves.
cd "$_BLESS/app"
exec node "$_BLESS/app/build/index.js"
