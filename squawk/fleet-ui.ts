// fleet-ui: squawk fleet web UI + feed proxy on :25136.
// Serves BOTH lanes: funnel /fleet -> 127.0.0.1:25136 and tailnet-direct 100.72.199.93:25136.
// Binds 0.0.0.0 so either lane reaches the same backend; pitchfork supervises (retry=true)
// for correct failover. Moved out of /tmp into the ranch repo 2026-09-30.
const FEED = "http://127.0.0.1:25135";
const UI_HTML = await Bun.file("/home/toxic/sovereign/projects/range/ranch/squawk/ui.html").text();

Bun.serve({
  port: 25136,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
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
});
console.log("fleet-ui on 0.0.0.0:25136 (funnel /fleet + tailnet-direct)");
