#!/usr/bin/env bash
# bench-routes.sh — timed 5-step scripted flows per browser route.
# Route A: keeper CDP :9223 (node, bench-keeper-cdp.js)
# Route B: browserless pool :25130 (REST)
# Route C: noVNC viewing path :6080 -> :5900 (components)
# Part of barn/browserless/bench/. Run on yote: ./bench-routes.sh
set -u
cd "$(dirname "$0")"
echo "===== ROUTE-A keeper CDP :9223 (headed chromium on Xvnc :99) ====="
node bench-keeper-cdp.js
echo "===== ROUTE-B browserless pool :25130 ====="
TOKEN=$(grep -E "^BROWSERLESS_TOKEN" /home/toxic/.browserless/.env | cut -d= -f2 | tr -d '" ')
step() { # name url jsondata
  local name="$1" url="$2" data="$3"
  local out

  out=$(curl -s -m 60 -o /dev/null -w "%{http_code} %{size_download} %{time_total}" \
    -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$data" "http://127.0.0.1:25130$url")
  echo "ROUTE-B $name: http=${out%% *} rest=${out#* } (bytes time_s)"
}
step "content"    "/content"    '{"url":"https://example.com"}'
step "screenshot" "/screenshot" '{"url":"https://example.com"}'
step "pdf"        "/pdf"        '{"url":"https://example.com"}'
step "function"   "/function"   '{"code":"export default async ({page}) => ({title: await page.title()})","context":{"url":"https://example.com"}}'
t0=$(date +%s%3N)
mcode=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" http://127.0.0.1:25130/metrics)
t1=$(date +%s%3N); echo "ROUTE-B metrics: http=$mcode $((t1-t0))ms (GET)"
echo "===== ROUTE-C noVNC viewing path ====="
t0=$(date +%s%3N)
code=$(curl -s -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:6080/vnc.html)

t1=$(date +%s%3N); echo "ROUTE-C vnc.html: http=$code $((t1-t0))ms"
python3 - <<'PYEOF'
import socket, time
t0 = time.time()
s = socket.create_connection(("127.0.0.1", 5900), timeout=8)
ver = s.recv(12)
s.sendall(b"RFB 003.008\n")
n = s.recv(1)[0]; types = s.recv(n)
s.close()
print(f"ROUTE-C rfb-handshake: {ver.strip().decode()} sectypes={list(types)} {int((time.time()-t0)*1000)}ms")
t0 = time.time()
w = socket.create_connection(("127.0.0.1", 6080), timeout=8)
w.sendall(b"GET /websockify HTTP/1.1\r\nHost: 127.0.0.1:6080\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
resp = w.recv(1024).decode(errors="replace").split("\r\n")[0]
w.close()

print(f"ROUTE-C ws-upgrade: {resp} {int((time.time()-t0)*1000)}ms")
PYEOF
t0=$(date +%s%3N)
xvnc=$(pgrep -c Xvnc); ws=$(pgrep -cf "websockify.*6080")
t1=$(date +%s%3N); echo "ROUTE-C daemons: Xvnc_procs=$xvnc websockify_6080=$ws $((t1-t0))ms"
echo "===== done ====="

