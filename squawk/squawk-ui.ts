// squawk-ui: squawk web UI + feed proxy on :25136.
// Serves BOTH lanes: funnel /fleet -> 127.0.0.1:25136 and tailnet-direct.
// Binds 0.0.0.0 so either lane reaches the same backend; pitchfork supervises (retry=true)
// for correct failover. Moved out of /tmp into the ranch repo 2026-09-30.
//
// WS-aware (2026-09-30): the UI's live sources (squawk-ws push, nats-ws) open a
// WebSocket at the same host+mount as the page (e.g. wss://<funnel>/fleet/squawk-ws).
// A plain fetch() proxy cannot complete the 101 upgrade, so without this the UI
// always degraded to 65s long-polling after every WS attempt 404'd. Upgrade
// requests are now shuttled frame-by-frame to the real backends over loopback.
//
// Server-auth (2026-09-30): the squawk server holds the feed token itself
// (/home/toxic/hatch/agents/ember/squawk-relay/feed-token) and injects it on proxied
// feed requests and squawk-ws upgrades when the browser sent none (or an empty
// one). Browsers never paste tokens; the token value only travels on loopback.
// The funnel only listens on tailnet addresses, so this is not a public
// exposure. A pasted/magic-link token is still forwarded as-is when present.
//
// Hot-reload (2026-10-03): the Svelte 5 UI is prebuilt via `mise run build`
// (mbx-cache) to ui/dist/bundle.js, and the stylesheet is a first-class
// asset at ui/design.css. The server re-reads both when their mtime changes,
// so UI edits land without a daemon restart.
//
// Channel-aware (2026-10-03): /wait and /send are served directly from the
// channel store (/home/toxic/.fleet-bus/squawk-root/<channel>/*.md) so tabs
// actually isolate per channel. The legacy feed proxy at :25135 remains for
// CLI/other consumers; the UI no longer depends on its /wait channel filtering.
//
// Roster (2026-10-07): GET /roster and /api/agents/roster serve fleet
// agent cards via fleet-roster buildRoster; ?channel= uses _meta.json.
//
// Signed send (2026-10-07): /send uses ui_relay_post.py (thin _post_message;
// forge-race winner ~63ms) with chat.py relay-in hedge. Never hand-writes .md.
import { readFileSync, statSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildRoster } from "./fleet-roster.ts";

const FEED = "http://127.0.0.1:25135";
const SQUAWK_DIR = "/home/toxic/estate/ranch/squawk";
const UI_ENTRY = join(SQUAWK_DIR, "ui", "dist", "bundle.js");
const FEED_TOKEN_PATH = "/home/toxic/hatch/agents/ember/squawk-relay/feed-token";
const SQUAWK_ROOT = "/home/toxic/.fleet-bus/squawk-root";

// websocket upgrade targets: client path -> backend ws url.
const WS_TARGETS: Record<string, string> = {
  "/squawk-ws": "ws://127.0.0.1:25147/squawk-ws",
  "/nats-ws": "ws://127.0.0.1:4223/",
};

// --- server-side feed token: read lazily, refresh when the file changes ---
let feedToken = "";
let feedTokenMtimeMs = 0;
function getFeedToken(): string {
  try {
    const st = statSync(FEED_TOKEN_PATH);
    if (st.mtimeMs !== feedTokenMtimeMs) {
      feedToken = readFileSync(FEED_TOKEN_PATH, "utf8").trim();
      feedTokenMtimeMs = st.mtimeMs;
    }
  } catch {
    /* token file unreadable: keep whatever we have (possibly empty) */
  }
  return feedToken;
}

// copy incoming headers, injecting the server-side feed token when the
// browser sent no usable Authorization header of its own.
function authHeaders(incoming: Headers): Headers {
  const out = new Headers(incoming);
  const auth = out.get("authorization") || "";
  if (!/^bearer\s+\S/i.test(auth)) {
    const t = getFeedToken();
    if (t) out.set("authorization", "Bearer " + t);
  }
  return out;
}

// backend ws url for an upgrade request; injects the server token into
// squawk-ws when the browser's ?token= is missing or empty.
function wsTarget(pathname: string, search: string): string {
  const base = WS_TARGETS[pathname];
  if (!base) return "";
  if (pathname === "/squawk-ws" && !new URLSearchParams(search).get("token")) {
    const t = getFeedToken();
    if (t) return base + "?token=" + encodeURIComponent(t);
  }
  return base + search;
}

// --- channel store: read/write message files directly for true tab isolation ---
const VALID_CHANNEL = /^[a-z0-9-_]{1,32}$/;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "msg";
}

type Msg = {
  seq: number;
  from: string;
  to: string;
  channel: string;
  ts: string;
  status: string;
  uuid: string;
  title: string;
  signature?: string;
  text: string;
};

// minimal frontmatter parse: ---\nkey: value\n---\n<body>
function parseMsgFile(path: string, fallbackSeq: number): Msg | null {
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return null; }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fm: Record<string, string> = {};
  let text = raw;
  if (m) {
    text = m[2];
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const seq = Number(fm.seq) || fallbackSeq;
  return {
    seq,
    from: fm.from || "?",
    to: fm.to || "all",
    channel: fm.channel || "",
    ts: fm.ts || "",
    status: fm.status || "discussion",
    uuid: fm.uuid || "",
    title: fm.title || "msg",
    signature: fm.signature || fm.hmac,
    text: text.trim(),
  };
}

// GET /wait?since=<seq>&channel=<name>&tail=<n> -> {ok, messages, cursor}
function handleWait(url: URL): Response {
  const channel = (url.searchParams.get("channel") || "fleet").toLowerCase();
  if (!VALID_CHANNEL.test(channel)) {
    return Response.json({ ok: false, error: "invalid channel" }, { status: 400 });
  }
  const since = Number(url.searchParams.get("since") || 0);
  const tail = Math.min(Math.max(Number(url.searchParams.get("tail") || 200), 1), 1000);
  const dir = join(SQUAWK_ROOT, channel);
  let files: string[];
  try { files = readdirSync(dir); } catch { files = []; }
  // filenames start with <seq>-... so filter by name before reading
  const msgs: Msg[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const seq = Number(f.split("-")[0]);
    if (!Number.isFinite(seq) || seq <= since) continue;
    const msg = parseMsgFile(join(dir, f), seq);
    if (msg) msgs.push(msg);
  }
  msgs.sort((a, b) => a.seq - b.seq);
  const sliced = msgs.slice(-tail);
  const cursor = sliced.length ? sliced[sliced.length - 1].seq : since;
  return Response.json({ ok: true, messages: sliced, cursor });
}

// GET /channels -> {ok, channels: [...]}
function handleChannels(): Response {
  let dirs: string[];
  try { dirs = readdirSync(SQUAWK_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
  catch { dirs = []; }
  return Response.json({ ok: true, channels: dirs.filter(d => VALID_CHANNEL.test(d)).sort() });
}

// GET /roster (+ /api/agents/roster): agent activity cards for #fleet.
// Borrowed from fleet-roster.ts buildRoster — same shape the fleet UI expects.
// Optional ?channel=<name> returns channel membership from _meta.json (cmd_roster).
function handleRoster(url: URL): Response {
  const channel = (url.searchParams.get("channel") || "").trim().toLowerCase();
  if (channel) {
    if (!VALID_CHANNEL.test(channel)) {
      return Response.json({ ok: false, error: "invalid channel" }, { status: 400 });
    }
    const metaPath = join(SQUAWK_ROOT, channel, "_meta.json");
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      let messages = 0;
      try {
        messages = readdirSync(join(SQUAWK_ROOT, channel)).filter((f) => /^\d+-.*\.md$/.test(f)).length;
      } catch {}
      return Response.json({
        ok: true,
        channel: meta.channel || channel,
        topic: meta.topic || "",
        members: meta.members || [],
        messages,
      });
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 404 });
    }
  }
  // Default: fleet agent activity roster (fleet-roster / fleet-feed contract).
  return Response.json({ ok: true, agents: buildRoster() });
}



// Shim screening is the default (Chris 2026-10-05): the shared
// sidechat_shim pipeline (estate allowlist -> preflight gate ->
// format_safe) runs on every UI send. Fail-open: if the shim is
// unreachable, the original text goes through unchanged.
function shimScreen(text: string): { text: string; flagged: string | null } {
  try {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    const r = spawnSync("python3", ["-c",
      "import sys; sys.path.insert(0, \"/home/toxic/hatch\"); " +
      "import sidechat_shim as s, base64, json; " +
      "t = base64.b64decode(sys.argv[1]).decode(); " +
      "al = s.is_estate_allowlisted(t); " +
      "flag = None; " +
      "if not al: " +
      "clean, detail = s._preflight_check(t); " +
      "flag = None if clean else detail; " +
      "sys.stdout.write(json.dumps({\"text\": s.format_safe(t), \"flag\": flag}))", b64],
      { timeout: 45000, encoding: "utf8" });
    if (r.status === 0 && r.stdout) {
      const doc = JSON.parse(r.stdout.trim());
      return { text: doc.text || text, flagged: doc.flag || null };
    }
  } catch {}
  return { text, flagged: null };
}

// Canonical seq allocation (2026-10-05 seq-divergence fix): every writer must
// allocate via chat_core._next_seq (mkdir lock + durable .seqhigh mark), never
// Date.now(). Timestamp-domain seqs once made allocator-domain messages
// invisible to seq-gated consumers after the high-water passed them.
function allocSeq(channel: string): number {
  try {
    const r = spawnSync("python3",
      ["/home/toxic/estate/ranch/squawk/seq_alloc.py", SQUAWK_ROOT, channel],
      { timeout: 15000, encoding: "utf8" });
    if (r.status === 0 && r.stdout) {
      const n = parseInt(r.stdout.trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {}
  console.error("squawk-ui: seq allocator unreachable, falling back to timestamp (divergence risk)");
  return Date.now();
}

// POST /send {channel, text, human?} -> {ok, seq}
// Borrow chat.py relay-in: never hand-write message files. The relay
// identity HMAC-signs; human attribution rides as HMAC-covered
// relayed_from + human frontmatter (fleet-chat-v3). See chat_commands
// cmd_relay_in / _post_message — "never hand-write message files."
async function handleSend(req: Request): Promise<Response> {
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const channel = String(body.channel || "").trim().toLowerCase();
  const text = String(body.text || "").trim();
  const human = String(body.human || process.env.SQUAWK_UI_HUMAN || "chris").trim().toLowerCase();
  if (!VALID_CHANNEL.test(channel)) {
    return Response.json({ ok: false, error: "invalid channel" }, { status: 400 });
  }
  if (!text) {
    return Response.json({ ok: false, error: "empty text" }, { status: 400 });
  }
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(human)) {
    return Response.json({ ok: false, error: "invalid human" }, { status: 400 });
  }
  // Emergency opt-out: {direct: true} skips shim screening.
  const direct = body.direct === true || body.direct === "1";
  const screened = direct ? { text, flagged: null } : shimScreen(text);
  if (screened.flagged) console.error(`squawk-ui: preflight flagged (${screened.flagged.slice(0, 120)}); sending anyway (fail-open)`);
  const safeText = screened.text;
  // Hot path: ui_relay_post.py (same _post_message writer, no argparse).
  // Forge race 2026-10-07: thin ~63ms VALID vs CLI relay-in ~73ms — first valid wins.
  // Hedge: fall back to chat.py relay-in if thin fails.
  const env = { ...process.env, AGENT_CHAT_ROOT: SQUAWK_ROOT };
  const spawnOpts = { timeout: 20000, encoding: "utf8" as const, cwd: SQUAWK_DIR, env };
  try {
    let r = spawnSync(
      "python3",
      [
        join(SQUAWK_DIR, "ui_relay_post.py"),
        "--root", SQUAWK_ROOT,
        "--channel", channel,
        "--from", human,
        "--text", safeText,
        "--title", "msg",
      ],
      spawnOpts,
    );
    if (r.status !== 0) {
      console.error("squawk-ui: thin post failed, hedging to relay-in:", (r.stderr || r.stdout || "").trim().slice(0, 200));
      r = spawnSync(
        "python3",
        [
          join(SQUAWK_DIR, "chat.py"),
          "--root", SQUAWK_ROOT,
          "relay-in",
          "--channel", channel,
          "--from", human,
          "--text", safeText,
          "--title", "msg",
        ],
        spawnOpts,
      );
    }
    if (r.status !== 0) {
      const err = (r.stderr || r.stdout || "relay-in failed").trim().slice(0, 400);
      console.error("squawk-ui: signed send failed:", err);
      return Response.json({ ok: false, error: err }, { status: 500 });
    }
    const m = /relayed #(\d+)/.exec(r.stdout || "");
    const seq = m ? parseInt(m[1], 10) : 0;
    return Response.json({ ok: true, seq, human });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// --- UI bundle: prebuilt Svelte 5 bundle, cached by mtime (hot-reload) ---
// Build with: mise run build  (or: bun ui/build.ts)
let bundleJs = "";
let bundleMtimeMs = 0;
async function uiBundle(): Promise<string> {
  let mtime = 0;
  try { mtime = statSync(UI_ENTRY).mtimeMs; } catch { /* fall through to error below */ }
  if (!mtime) throw new Error("ui bundle missing: run `mise run build` in squawk/");
  if (mtime !== bundleMtimeMs || !bundleJs) {
    bundleJs = readFileSync(UI_ENTRY, "utf8");
    bundleMtimeMs = mtime;
  }
  return bundleJs;
}

// --- UI stylesheet: first-class design asset at ui/design.css, cached by
// --- mtime like the JS bundle, so CSS edits land on page refresh (no
// --- daemon restart needed). Extracted from inline by Worker A (2026-10-03).
const CSS_PATH = join(SQUAWK_DIR, "ui", "design.css");
let uiCss = "";
let cssMtimeMs = 0;
function uiStyle(): string {
  let mtime = 0;
  try { mtime = statSync(CSS_PATH).mtimeMs; } catch { /* fall through */ }
  if (!mtime) throw new Error("ui stylesheet missing: ui/design.css");
  if (mtime !== cssMtimeMs || !uiCss) {
    uiCss = readFileSync(CSS_PATH, "utf8");
    cssMtimeMs = mtime;
  }
  return uiCss;
}

async function uiHtml(): Promise<string> {
  const js = await uiBundle();
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>SQUAWK</title><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0b0908"><style>${uiStyle()}</style></head>`
    + `<body><div id="root"></div>`
    + `<script>window.SERVER_AUTH=true;</script>`
    + `<script type="module">${js}</script>`
    + `</body></html>`;
}

type SockData = { target: string; backend?: WebSocket; pending: (string | Buffer)[] };

Bun.serve<SockData>({
  port: 25136,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const url = new URL(req.url);
    // --- funnel mount prefix: the UI loads under /fleet on the funnel, so
    // relative fetches arrive as /fleet/wait, /fleet/send, /fleet/squawk-ws...
    // Strip the /fleet segment so both lanes (funnel + tailnet-direct) hit
    // the same handlers below. Anchored to the leading segment only, so
    // /fleet-ui (a different daemon) and similarly-prefixed paths are untouched.
    if (url.pathname === "/fleet" || url.pathname.startsWith("/fleet/")) {
      url.pathname = url.pathname.slice("/fleet".length) || "/";
    }
    // --- websocket upgrade: shuttle to the real backend, don't fetch-proxy ---
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const target = wsTarget(url.pathname, url.search);
      if (target && server.upgrade(req, { data: { target, pending: [] } })) {
        return; // upgraded: the socket now lives in the websocket handlers
      }
      return new Response("no websocket target for " + url.pathname, { status: 404 });
    }
    if (url.pathname === "/" || url.pathname === "/ui") {
      try {
        return new Response(await uiHtml(), { headers: { "Content-Type": "text/html" } });
      } catch (e) {
        return new Response("ui build error: " + String(e), { status: 500, headers: { "Content-Type": "text/plain" } });
      }
    }
    // --- channel-aware endpoints served from the local store ---
    if (url.pathname === "/wait" && req.method === "GET") return handleWait(url);
    if (url.pathname === "/channels" && req.method === "GET") return handleChannels();
    if ((url.pathname === "/roster" || url.pathname === "/api/agents/roster") && req.method === "GET") return handleRoster(url);
    if (url.pathname === "/send" && req.method === "POST") return handleSend(req);
    // proxy everything else to the legacy feed
    // the feed serves everything under /squawk-feed/*; the client speaks
    // bare relative paths, so add the prefix here (unless already present)
    const pfx = url.pathname.startsWith("/squawk-feed/") ? "" : "/squawk-feed";
    const target = FEED + pfx + url.pathname + url.search;
    const resp = await fetch(target, {
      method: req.method,
      headers: authHeaders(req.headers),
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
console.log("squawk-ui on 0.0.0.0:25136 (funnel /fleet + tailnet-direct), ws-aware, server-auth, hot-reload, channel-aware");
