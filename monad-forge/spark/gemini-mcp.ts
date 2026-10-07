const PORT = parseInt(process.env.GEMINI_MCP_PORT || process.env.PORT || "25202");
const GATEHOUSE_URL = "http://127.0.0.1:25127/mcp";
const GATEHOUSE_KEY = "763b67284d88ecfa7576fbd54c854e334d88bbf7dddc936927b1b8dfe5b41e59";

const sessions = new Map<string, ReadableStreamDefaultController>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname.endsWith("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // 1. SSE Stream Handshake (GET)
    if (req.method === "GET") {
      const sessionId = crypto.randomUUID();
      let keepAlive: any;

      const body = new ReadableStream({
        start(controller) {
          sessions.set(sessionId, controller);
          controller.enqueue(
            new TextEncoder().encode(`event: endpoint\ndata: /gemini-mcp?sessionId=${sessionId}\n\n`)
          );

          // Heartbeat keeps Tailscale HTTP/2 proxy from dropping stream
          keepAlive = setInterval(() => {
            try {
              controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
            } catch {
              clearInterval(keepAlive);
            }
          }, 5000);
        },
        cancel() {
          if (keepAlive) clearInterval(keepAlive);
          sessions.delete(sessionId);
        }
      });

      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...corsHeaders
        }
      });
    }

    // 2. Transparent Forwarding to mcpproxy-go (POST)
    if (req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");
      const body = await req.text();

      // Forward JSON-RPC directly to mcpproxy-go
      const upstream = await fetch(GATEHOUSE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GATEHOUSE_KEY}`
        },
        body
      });

      const responseText = await upstream.text();

      // Push to active SSE stream if connected
      if (sessionId && sessions.has(sessionId)) {
        sessions.get(sessionId)!.enqueue(
          new TextEncoder().encode(`event: message\ndata: ${responseText}\n\n`)
        );
      }

      return new Response(responseText, {
        status: upstream.status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
});

console.log(`[+] mcpproxy-go bridge active on 127.0.0.1:${PORT} -> ${GATEHOUSE_URL}`);
