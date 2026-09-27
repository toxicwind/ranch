#!/bin/bash
set -a
. /home/toxic/.browserless/.env
set +a
export TOKEN="${BROWSERLESS_TOKEN:?}"
export PORT="${BROWSERLESS_PORT:-25130}"
export HOST="127.0.0.1"
export PLAYWRIGHT_BROWSERS_PATH="/home/toxic/.browserless/browsers"
export CONNECTION_TIMEOUT="${BROWSERLESS_CONNECTION_TIMEOUT:-60000}"
export CONCURRENT="${BROWSERLESS_CONCURRENT:-10}"
export NODE_ENV=production
exec node /home/toxic/.browserless/app/build/index.js
