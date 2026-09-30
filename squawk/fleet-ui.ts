// fleet-ui: squawk fleet web UI + feed proxy on :25136.
// Serves BOTH lanes: funnel /fleet -> 127.0.0.1:25136 and tailnet-direct 100.72.199.93:25136.
// Binds 0.0.0.0 so either lane reaches the same backend; pitchfork supervises (retry=true)
// for correct failover. Moved out of /tmp into the ranch repo 2026-09-30.
//
// WS-aware (2026-09-30): the UI's live sources (squawk-ws push, nats-ws) open a
// WebSocket at the same host+mount as the page (e.g. wss://<funnel>/fleet/squawk-ws).
// A plain fetch() proxy cannot complete the 101 upgrade, so without this the UI
// always degraded to 65s long-polling after every WS attempt 404'd. Upgrade
// requests are now shuttled frame-by-frame to the real backends over loopback.
const FEED = "http://127.0.0.1:25135";
const UI_HTML = await Bun.file("/home/toxic/sovereign/projects/range/ranch/squawk/ui.html").text();

// websocket upgrade targets: client path -> backend ws url.
// the query string is forwarded verbatim (it carries ?token= for squawk-ws).
const WS_TARGETS: Record<string, string> = {
  "/squawk-ws": "ws://127.0.0.1:25147/squawk-ws",
  "/nats-ws": "ws://127.0.0.1:4223/",
};

type SockData = { target: string; backend?: WebSocket; pending: (string | Buffer)[] };

Bun.serve<SockData>({
  port: 25136,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const url = new URL(req.url);
    // --- websocket upgrade: shuttle to the real backend, don't fetch-proxy ---
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const base = WS_TARGETS[url.pathname];
      if (base && server.upgrade(req, { data: { target: base + url.search, pending: [] } })) {
        return; // upgraded: the socket now lives in the websocket handlers
      }
      return new Response("no websocket target for " + url.pathname, { status: 404 });
    }
    if (url.pathname === "/" || url.pathname === "/ui") {
      return new Response(UI_HTML, { headers: { "Content-Type": "text/html" } });
    }
    // proxy everything else to the feed
    // the feed serves everything under /squawk-feed/*; the client speaks
    // bare relative paths, so add the prefix here (unless already present)
    const pfx = url.pathname.startsWith("/squawk-feed/") ? "" : "/squawk-feed";
    const target = FEED + pfx + url.pathname + url.search;
    const resp = await fetch(target, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  },
  websocket: {
    open(ws) {
      let backend: WebSocket;
      try {
        backend = new WebSocket(ws.data.target);
      } catch {
        try { ws.close(1011, "backend dial failed"); } catch {}
        return;
      }
      ws.data.backend = backend;
      backend.onopen = () => {
        for (const m of ws.data.pending.splice(0)) {
          try { backend.send(m); } catch {}
        }
      };
      backend.onmessage = (ev) => {
        try { ws.send(ev.data); } catch {}
      };
      backend.onclose = (ev) => {
        try { ws.close(ev.code || 1000, ev.reason || "backend closed"); } catch {}
      };
      backend.onerror = () => {
        try { ws.close(1011, "backend error"); } catch {}
      };
    },
    message(ws, message) {
      const b = ws.data.backend;
      if (b && b.readyState === WebSocket.OPEN) {
        try { b.send(message); } catch {}
      } else {
        ws.data.pending.push(message); // queue the subscribe frame until dial completes
      }
    },
    close(ws) {
      try { ws.data.backend?.close(); } catch {}
    },
  },
});
console.log("fleet-ui on 0.0.0.0:25136 (funnel /fleet + tailnet-direct), ws-aware");
