<script lang="ts">
  import { mdBlock, esc } from "./markdown";
  import MessageCard from "./MessageCard.svelte";
  import AddChannelDialog from "./AddChannelDialog.svelte";

  type Msg = {
    seq: number; from: string; to: string; channel: string;
    ts: string; status: string; uuid: string; title: string;
    signature?: string; text: string;
  };
  type TabState = { messages: Msg[]; cursor: number; scrollTop: number };
  type ConnState = "live" | "degraded" | "reconnecting";

  const VALID_NAME = /^[a-z0-9-_]{1,32}$/;

  // --- state (Svelte 5 runes) ---
  let tabs = $state<Record<string, TabState>>({
    fleet: { messages: [], cursor: 0, scrollTop: 0 },
  });
  let activeName = $state("fleet");
  let conn = $state<ConnState>("reconnecting");
  let latency = $state(0);
  let sysLines = $state<string[]>([]);
  let showDlg = $state(false);
  let draft = $state("");
  let sending = $state(false);

  let active = $derived(tabs[activeName] ?? { messages: [], cursor: 0, scrollTop: 0 });
  let dotClass = $derived(conn === "live" ? "live" : conn === "degraded" ? "recon" : "recon");
  let connLabel = $derived(conn === "live" ? "live" : conn === "degraded" ? "degraded — auto-fallback" : "reconnecting…");

  let logEl: HTMLDivElement | null = $state(null);
  let ws: WebSocket | null = null;
  let pollTimer: number | undefined;
  let wsFailTimer: number | undefined;
  let reconnectDelay = 1000;
  let running = true;
  let useWs = $state(false); // transport: ws primary, poll fallback (automatic, no user choice)

  function sysLine(s: string) {
    sysLines = [...sysLines.slice(-19), s];
  }

  function ingest(channel: string, msgs: Msg[], cursor: number) {
    const t = tabs[channel];
    if (!t) return;
    const seen = new Set(t.messages.map(m => m.seq));
    const fresh = msgs.filter(m => !seen.has(m.seq));
    const newCursor = Math.max(t.cursor, cursor, ...fresh.map(m => m.seq));
    if (!fresh.length && newCursor === t.cursor) return;
    tabs[channel] = {
      ...t,
      messages: [...t.messages, ...fresh].sort((a, b) => a.seq - b.seq),
      cursor: newCursor,
    };
  }

  // --- transport: WebSocket primary, automatic fallback to long-poll ---
  function wsUrl(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const base = location.pathname.replace(/\/[^/]*$/, "");
    return `${proto}//${location.host}${base}/squawk-ws`;
  }

  function connectWs() {
    if (!running) return;
    let sock: WebSocket;
    try { sock = new WebSocket(wsUrl()); }
    catch { startPoll("ws unavailable"); return; }
    ws = sock;
    conn = "reconnecting";

    wsFailTimer = window.setTimeout(() => {
      sysLine("live push unavailable — auto-fallback to polling");
      try { sock.close(); } catch {}
      startPoll("ws protocol timeout");
    }, 8000);

    sock.onopen = () => {
      try { sock.send(JSON.stringify({ op: "subscribe", channel: activeName })); } catch {}
    };
    sock.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        const msgs: Msg[] = Array.isArray(d) ? d : d.messages ? d.messages : [d];
        if (!msgs.length || !msgs[0].seq) return;
        window.clearTimeout(wsFailTimer);
        if (!useWs) { useWs = true; conn = "live"; sysLine("live push connected"); }
        reconnectDelay = 1000;
        ingest(activeName, msgs, Math.max(...msgs.map(m => m.seq)));
      } catch {}
    };
    const onFail = () => {
      window.clearTimeout(wsFailTimer);
      if (ws === sock) { ws = null; startPoll("push disconnected"); }
    };
    sock.onerror = onFail;
    sock.onclose = () => { if (ws === sock) onFail(); };
  }

  async function pollOnce(channel: string, cursor: number): Promise<boolean> {
    const t0 = performance.now();
    try {
      const r = await fetch(`wait?since=${cursor}&channel=${encodeURIComponent(channel)}&tail=200`);
      if (!r.ok) throw new Error("http " + r.status);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "bad response");
      latency = Math.round(performance.now() - t0);
      ingest(channel, d.messages || [], d.cursor ?? cursor);
      return true;
    } catch { return false; }
  }

  function startPoll(reason: string) {
    if (!running) return;
    if (useWs) { useWs = false; sysLine(reason + " — on polling fallback"); }
    conn = "degraded";
    const loop = async () => {
      if (!running || useWs) return;
      const t = tabs[activeName];
      const ok = t ? await pollOnce(activeName, t.cursor) : false;
      if (!running || useWs) return;
      conn = ok ? "degraded" : "reconnecting";
      // opportunistically retry ws in the background
      if (ok && navigator.onLine) { tryReconnectWs(); }
      pollTimer = window.setTimeout(loop, ok ? 2500 : 5000);
    };
    loop();
  }

  function tryReconnectWs() {
    // single background ws probe; if it connects, we flip back to live push
    if (ws || !running || useWs) return;
    let sock: WebSocket;
    try { sock = new WebSocket(wsUrl()); } catch { return; }
    const kill = window.setTimeout(() => { try { sock.close(); } catch {} }, 6000);
    sock.onopen = () => {
      try { sock.send(JSON.stringify({ op: "subscribe", channel: activeName })); } catch {}
    };
    sock.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        const msgs: Msg[] = Array.isArray(d) ? d : d.messages ? d.messages : [d];
        if (!msgs.length || !msgs[0].seq) return;
        window.clearTimeout(kill);
        // promote: adopt this socket as the live channel
        if (ws) { try { ws.close(); } catch {} }
        ws = sock;
        useWs = true; conn = "live";
        window.clearTimeout(pollTimer);
        sysLine("live push restored");
        reconnectDelay = 1000;
        ingest(activeName, msgs, Math.max(...msgs.map(m => m.seq)));
        // rewire handlers to the live path
        sock.onmessage = (e2) => {
          try {
            const d2 = JSON.parse(e2.data);
            const m2: Msg[] = Array.isArray(d2) ? d2 : d2.messages ? d2.messages : [d2];
            if (m2.length && m2[0].seq) ingest(activeName, m2, Math.max(...m2.map(m => m.seq)));
          } catch {}
        };
        sock.onclose = sock.onerror = () => {
          if (ws === sock) { ws = null; scheduleReconnect(); }
        };
      } catch {}
    };
    sock.onerror = sock.onclose = () => window.clearTimeout(kill);
  }

  function scheduleReconnect() {
    if (!running) return;
    useWs = false;
    conn = "reconnecting";
    sysLine(`push lost — retrying in ${Math.round(reconnectDelay / 1000)}s`);
    window.setTimeout(() => {
      if (!running || useWs) return;
      connectWs();
      if (!useWs) startPoll("reconnect attempt");
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }

  // --- boot: snapshot then live transport ---
  $effect(() => {
    running = true;
    sysLine("tuned in — pulling the latest traffic…");
    (async () => {
      const t = tabs[activeName];
      if (t) await pollOnce(activeName, t.cursor);
      if (running) connectWs();
      if (running && !useWs && !ws) startPoll("initial");
    })();
    const onOnline = () => { if (running && !useWs) connectWs(); };
    window.addEventListener("online", onOnline);
    return () => {
      running = false;
      window.removeEventListener("online", onOnline);
      window.clearTimeout(pollTimer);
      window.clearTimeout(wsFailTimer);
      try { ws?.close(); } catch {}
      ws = null;
    };
  });

  // --- scroll: stick to bottom when new messages arrive ---
  $effect(() => {
    const el = logEl;
    const n = active.messages.length;
    const name = activeName;
    if (!el || !n) return;
    // run after DOM updates
    queueMicrotask(() => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (atBottom) el.scrollTop = el.scrollHeight;
    });
  });

  function showTab(name: string) {
    if (logEl && tabs[activeName]) {
      tabs[activeName] = { ...tabs[activeName], scrollTop: logEl.scrollTop };
    }
    activeName = name;
    queueMicrotask(() => {
      const t = tabs[name];
      if (logEl && t) logEl.scrollTop = t.scrollTop || logEl.scrollHeight;
    });
    // resubscribe live push to the new channel
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ op: "subscribe", channel: name })); } catch {}
    }
  }

  function addTab(name: string) {
    if (tabs[name]) { showTab(name); showDlg = false; return; }
    tabs[name] = { messages: [], cursor: 0, scrollTop: 0 };
    showDlg = false;
    sysLine(`channel #${name} added — tuned in`);
    showTab(name);
    // pull its snapshot immediately
    pollOnce(name, 0).then(() => { if (!useWs) startPoll("new channel"); });
  }

  function closeTab(name: string) {
    if (!tabs[name] || Object.keys(tabs).length <= 1) return;
    const { [name]: _, ...rest } = tabs;
    tabs = rest;
    if (name === activeName) showTab(Object.keys(rest)[0]);
  }

  async function sendMsg() {
    const text = draft.trim();
    if (!text || sending || !activeName) return;
    sending = true;
    try {
      const r = await fetch("send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeName, text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "http " + r.status);
      draft = "";
      // the live loop renders it; no optimistic duplicate needed
    } catch (e: any) {
      sysLine("send failed: " + (e.message || e) + " — retrying is safe");
    } finally {
      sending = false;
    }
  }
</script>

<header>
  <h1>SQUAWK</h1>
  <span class="transport" title={useWs ? "live push via websocket" : "polling fallback — push unavailable"}>
    {useWs ? "push" : "poll"}
  </span>
</header>

<div id="tabs" role="tablist">
  {#each Object.keys(tabs) as name (name)}
    <div
      role="tab"
      aria-selected={name === activeName}
      class="tab"
      class:active={name === activeName}
      onclick={() => showTab(name)}
      onkeydown={(e) => e.key === "Enter" && showTab(name)}
      tabindex="0"
    >
      <span>#{name}</span>
      {#if Object.keys(tabs).length > 1}
        <span
          class="x"
          title={`close #${name}`}
          role="button"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); closeTab(name); }}
          onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); closeTab(name); } }}
        >×</span>
      {/if}
    </div>
  {/each}
  <button id="addTab" onclick={() => (showDlg = true)} title="add channel" aria-label="add channel">+</button>
</div>

<div id="log" bind:this={logEl}>
  {#each sysLines as s, i (i)}
    <div class="sys">{s}</div>
  {/each}
  {#each active.messages as m (m.seq)}
    <MessageCard {m} />
  {/each}
</div>

<div id="composer">
  <input
    id="msg"
    bind:value={draft}
    onkeydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
    placeholder={`message #${activeName}…  (enter to send)`}
    autocomplete="off"
    aria-label="message"
    disabled={sending}
  />
  <button id="send" onclick={sendMsg} disabled={sending || !draft.trim()}>send</button>
</div>

<div id="statusbar">
  <span><span class="dot {dotClass}"></span>{connLabel}</span>
  <span>seq {active.cursor || "—"}</span>
  <span>{latency ? `${latency}ms` : ""}</span>
</div>

{#if showDlg}
  <AddChannelDialog onClose={() => (showDlg = false)} onAdd={addTab} />
{/if}

<style>
  .transport {
    margin-left: auto;
    font-size: 11px;
    color: var(--faint);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
</style>
