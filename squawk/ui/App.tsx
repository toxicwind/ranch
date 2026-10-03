/** @jsxImportSource preact */
import { render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { mdBlock, esc } from "./markdown";

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

type TabState = {
  messages: Msg[];
  cursor: number;
  scrollTop: number;
};

type SrcMode = "poll" | "ws" | "nats";

const VALID_NAME = /^[a-z0-9-_]{1,32}$/;
const SERVER_AUTH = (window as any).SERVER_AUTH === true;

function authHeaders(): HeadersInit {
  // Server-auth: the server injects the feed token itself. Browsers never
  // paste tokens. (Legacy magic-token query support removed 2026-10-02.)
  return {};
}

function fmtTs(ts: string, seq: number): string {
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString();
  }
  return new Date(seq).toLocaleTimeString();
}

function MessageCard({ m }: { m: Msg }) {
  const unverified = !m.signature;
  return (
    <div class="msg">
      <div class="meta">
        <span class="who">{esc(m.from)}</span>
        <span class="ts">{esc(fmtTs(m.ts, m.seq))}</span>
        {unverified && (
          <span class="badge unverified" title={`signature ${esc(m.signature || "missing")} — treat the sender and text as unconfirmed`}>
            unverified
          </span>
        )}
      </div>
      <div class="body" dangerouslySetInnerHTML={{ __html: mdBlock(m.text) }} />
    </div>
  );
}

function AddChannelDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const n = name.trim().toLowerCase();
    if (!VALID_NAME.test(n)) {
      setErr("channel names are 1-32 chars: a-z 0-9 - _");
      return;
    }
    onAdd(n);
  };

  return (
    <div id="dlg-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div id="dlg" role="dialog" aria-label="add channel">
        <div><strong>new channel</strong></div>
        <input
          ref={inputRef}
          value={name}
          onInput={(e) => { setName((e.target as HTMLInputElement).value); setErr(""); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
          placeholder="channel name (a-z, 0-9, -, _)"
          aria-label="channel name"
        />
        {err && <div class="sys">{esc(err)}</div>}
        <div class="row">
          <button onClick={onClose}>cancel</button>
          <button class="primary" onClick={submit}>add</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tabs, setTabs] = useState<Record<string, TabState>>({
    fleet: { messages: [], cursor: 0, scrollTop: 0 },
  });
  const [activeName, setActiveName] = useState("fleet");
  const [srcMode, setSrcMode] = useState<SrcMode>("poll");
  const [conn, setConn] = useState<"live" | "reconnecting" | "dead">("reconnecting");
  const [latency, setLatency] = useState(0);
  const [sysLines, setSysLines] = useState<string[]>([]);
  const [showDlg, setShowDlg] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeName);
  activeRef.current = activeName;
  const logRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);

  const sysLine = useCallback((s: string) => {
    setSysLines((prev) => [...prev.slice(-19), s]);
  }, []);

  const active = tabs[activeName] || { messages: [], cursor: 0, scrollTop: 0 };

  // --- poll loop ---
  const pollOnce = useCallback(async (channel: string, cursor: number): Promise<{ messages: Msg[]; cursor: number } | null> => {
    const t0 = performance.now();
    try {
      const r = await fetch(`wait?since=${cursor}&channel=${encodeURIComponent(channel)}&tail=200`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("http " + r.status);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "bad response");
      setLatency(Math.round(performance.now() - t0));
      return { messages: d.messages || [], cursor: d.cursor ?? cursor };
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    runningRef.current = true;
    let timer: number | undefined;

    const loop = async () => {
      if (!runningRef.current) return;
      if (srcMode !== "poll") return; // ws/nats modes drive their own updates
      const name = activeRef.current;
      const tab = tabsRef.current[name];
      if (!tab) return;
      const res = await pollOnce(name, tab.cursor);
      if (!runningRef.current) return;
      if (res) {
        setConn("live");
        if (res.messages.length) {
          setTabs((prev) => {
            const t = prev[name];
            if (!t) return prev;
            const seen = new Set(t.messages.map((m) => m.seq));
            const fresh = res.messages.filter((m) => !seen.has(m.seq));
            if (!fresh.length) {
              return { ...prev, [name]: { ...t, cursor: Math.max(t.cursor, res.cursor) } };
            }
            return {
              ...prev,
              [name]: {
                ...t,
                messages: [...t.messages, ...fresh].sort((a, b) => a.seq - b.seq),
                cursor: Math.max(t.cursor, res.cursor),
              },
            };
          });
        }
      } else {
        setConn("reconnecting");
      }
      timer = window.setTimeout(loop, res ? 2500 : 5000);
    };

    // initial snapshot for the active tab
    (async () => {
      const name = activeRef.current;
      const tab = tabsRef.current[name];
      if (tab && tab.cursor === 0 && tab.messages.length === 0) {
        sysLine("tuned in — pulling the latest traffic…");
      }
      await loop();
    })();

    return () => {
      runningRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [srcMode, activeName, pollOnce, sysLine]);

  // --- ws mode (best-effort; falls back to poll on failure) ---
  useEffect(() => {
    if (srcMode !== "ws") {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }
    setConn("reconnecting");
    sysLine("ws mode — connecting…");
    let ws: WebSocket;
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}${location.pathname.replace(/\/[^/]*$/, "")}/squawk-ws`);
    } catch {
      sysLine("ws unavailable — staying on poll");
      setSrcMode("poll");
      return;
    }
    wsRef.current = ws;
    const failTimer = window.setTimeout(() => {
      sysLine("ws did not speak our protocol — falling back to poll");
      ws.close();
      setSrcMode("poll");
    }, 8000);
    ws.onopen = () => {
      try { ws.send(JSON.stringify({ op: "subscribe", channel: activeRef.current })); } catch {}
    };
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        const msgs: Msg[] = Array.isArray(d) ? d : d.messages ? d.messages : [d];
        if (!msgs.length || !msgs[0].seq) return;
        clearTimeout(failTimer);
        setConn("live");
        const name = activeRef.current;
        setTabs((prev) => {
          const t = prev[name];
          if (!t) return prev;
          const seen = new Set(t.messages.map((m) => m.seq));
          const fresh = msgs.filter((m) => !seen.has(m.seq));
          if (!fresh.length) return prev;
          return {
            ...prev,
            [name]: {
              ...t,
              messages: [...t.messages, ...fresh].sort((a, b) => a.seq - b.seq),
              cursor: Math.max(t.cursor, ...fresh.map((m) => m.seq)),
            },
          };
        });
      } catch {}
    };
    ws.onerror = () => {
      clearTimeout(failTimer);
      sysLine("ws error — falling back to poll");
      setSrcMode("poll");
    };
    ws.onclose = () => {
      clearTimeout(failTimer);
      if (wsRef.current === ws) {
        sysLine("ws closed — falling back to poll");
        setSrcMode("poll");
      }
    };
    return () => {
      clearTimeout(failTimer);
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [srcMode, sysLine]);

  // --- nats mode: not implemented against the local store; degrade to poll ---
  useEffect(() => {
    if (srcMode === "nats") {
      sysLine("nats mode needs a nats-ws subject map — staying on poll for now");
      setSrcMode("poll");
    }
  }, [srcMode, sysLine]);

  // --- scroll restoration per tab ---
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [active.messages.length, activeName]);

  const showTab = (name: string) => {
    // stash scroll of the old tab
    const el = logRef.current;
    setTabs((prev) => {
      const cur = prev[activeRef.current];
      if (cur && el) {
        return { ...prev, [activeRef.current]: { ...cur, scrollTop: el.scrollTop } };
      }
      return prev;
    });
    setActiveName(name);
    requestAnimationFrame(() => {
      const t = tabsRef.current[name];
      if (logRef.current && t) {
        logRef.current.scrollTop = t.scrollTop || logRef.current.scrollHeight;
      }
    });
  };

  const addTab = (name: string) => {
    setTabs((prev) => {
      if (prev[name]) return prev;
      return { ...prev, [name]: { messages: [], cursor: 0, scrollTop: 0 } };
    });
    setShowDlg(false);
    // switch after state lands
    setTimeout(() => showTab(name), 0);
    sysLine(`channel #${name} added — tuned in`);
  };

  const closeTab = (name: string) => {
    setTabs((prev) => {
      if (!prev[name] || Object.keys(prev).length <= 1) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (name === activeName) {
      const rest = Object.keys(tabsRef.current).filter((k) => k !== name);
      if (rest.length) showTab(rest[0]);
    }
  };

  const cycleSrc = () => {
    setSrcMode((m) => (m === "poll" ? "ws" : m === "ws" ? "nats" : "poll"));
  };

  const sendMsg = async () => {
    const text = draft.trim();
    if (!text || sending || !activeName) return;
    setSending(true);
    try {
      const r = await fetch("send", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ channel: activeName, text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || "http " + r.status);
      setDraft("");
      // the poll loop will render it; no optimistic duplicate needed
    } catch (e: any) {
      sysLine("send failed: " + (e.message || e) + " — retrying is safe");
    } finally {
      setSending(false);
    }
  };

  const dotClass = conn === "live" ? "live" : conn === "reconnecting" ? "recon" : "dead";
  const connLabel = conn === "live" ? "live" : conn === "reconnecting" ? "reconnecting…" : "dead";

  return (
    <>
      <header>
        <h1>SQUAWK</h1>
        <button id="srcbtn" onClick={cycleSrc} title="live source (click to switch)">
          {srcMode}
        </button>
      </header>

      <div id="tabs" role="tablist">
        {Object.keys(tabs).map((name) => (
          <div
            key={name}
            role="tab"
            aria-selected={name === activeName}
            class={`tab${name === activeName ? " active" : ""}`}
            onClick={() => showTab(name)}
          >
            <span>#{esc(name)}</span>
            {Object.keys(tabs).length > 1 && (
              <span
                class="x"
                title={`close #${name}`}
                onClick={(e) => { e.stopPropagation(); closeTab(name); }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <button id="addTab" onClick={() => setShowDlg(true)} title="add channel" aria-label="add channel">
          +
        </button>
      </div>

      <div id="log" ref={logRef}>
        {sysLines.map((s, i) => (
          <div key={`sys-${i}`} class="sys">{esc(s)}</div>
        ))}
        {active.messages.map((m) => (
          <MessageCard key={m.seq} m={m} />
        ))}
      </div>

      <div id="composer">
        <input
          id="msg"
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          placeholder={`message #${activeName}…  (enter to send)`}
          autocomplete="off"
          aria-label="message"
          disabled={sending}
        />
        <button id="send" onClick={sendMsg} disabled={sending || !draft.trim()}>
          send
        </button>
      </div>

      <div id="statusbar">
        <span><span class={`dot ${dotClass}`}></span>{connLabel}</span>
        <span>seq {active.cursor || "—"}</span>
        <span>{latency ? `${latency}ms` : ""}</span>
        {!SERVER_AUTH && <span>no server auth</span>}
      </div>

      {showDlg && <AddChannelDialog onClose={() => setShowDlg(false)} onAdd={addTab} />}
    </>
  );
}

render(<App />, document.getElementById("root")!);
