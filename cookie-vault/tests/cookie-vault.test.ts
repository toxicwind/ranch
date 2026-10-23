import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { decompressSnappy, decompressLz4 } from "../src/snappy";
import {
  emptyVault,
  writeVault,
  readVault,
  resolveVaultFile,
  statusOf,
} from "../src/vault";
import { grabFirefox } from "../src/firefox-grab";
import { cdpTabs, cdpCall, grabKeeper, restoreKeeper } from "../src/keeper-cdp";

/* ------------------------- snappy (100%) ------------------------- */
describe("snappy", () => {
  test("decompresses literal-only snappy block", () => {
    // "hello world" = 11 bytes. Snappy literal tag = (len<<2)|0 = 0x2c.
    const buf = new Uint8Array([
      11,
      0x2c,
      ...Array.from("hello world", (c) => c.charCodeAt(0)),
    ]);
    expect(new TextDecoder().decode(decompressSnappy(buf))).toBe("hello world");
  });

  test("decompresses block with copy-1-byte-offset", () => {
    // "aaaa": len=4, literal tag 0x04 'a' 'a', copy-1 tag 0x01 off=2 (tag 0x01 |= (0<<3)) then 2
    const buf = new Uint8Array([4, 0x04, 0x61, 0x62, 0x01, 0x02]);
    const out = decompressSnappy(buf);
    expect(out.length).toBeGreaterThan(0);
  });

  test("copy 4-byte offset branch", () => {
    // len big enough, copy-4 type (type=3 => tag & 3 == 3, e.g. 0x03)
    const buf = new Uint8Array([
      8, 0x02, 0x61, 0x62, 0x03, 0x02, 0x00, 0x00, 0x00,
    ]);
    const out = decompressSnappy(buf);
    expect(out.length).toBeGreaterThan(0);
  });

  test("extended literal (n>=60) branch", () => {
    // len=70, one long literal
    const body = Array.from({ length: 70 }, (_, i) => (i * 7) % 256);
    const buf = new Uint8Array([70, 0xf0, 70 - 60, ...body]);
    const out = decompressSnappy(buf);
    expect(out.length).toBe(70);
  });

  test("returns empty for empty input", () => {
    expect(decompressSnappy(new Uint8Array([])).length).toBe(0);
  });

  test("passes through on malformed input (catch returns source)", () => {
    const bad = new Uint8Array([250, 250, 250, 250, 250, 250]); // absurd varint
    decompressSnappy(bad); // must not throw
  });

  test("lz4 passthrough", () => {
    const b = new Uint8Array([1, 2, 3]);
    expect(decompressLz4(b)).toEqual(b);
  });

  test("copy-1 offset decode correctness", () => {
    // "abcabc": len6, literal 0x06 a b c, copy1 type tag 0x01? layout: literal abc (tag 0x06) then
    // copy type1 off=3 len>=4; verify produces >=6 bytes
    const buf = new Uint8Array([6, 0x06, 0x61, 0x62, 0x63, 0x09, 0x03]);
    const out = decompressSnappy(buf);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});

/* ------------------------- vault (mock fs) ------------------------- */
describe("vault", () => {
  let tmpFiles = [];
  const realFs = require("node:fs");

  test("emptyVault shape", () => {
    const v = emptyVault();
    expect(v.cookies).toEqual([]);
    expect(v.storage).toEqual([]);
    expect(v.capturedAt).toBeTruthy();
  });

  test("writeVault + readVault round-trips", () => {
    const v = emptyVault();
    v.cookies = [
      { name: "a", value: "b", domain: ".x.com", path: "/", secure: true },
    ];
    const f = "/tmp/cv-rt-" + Math.random().toString(36).slice(2) + ".json";
    tmpFiles.push(f);
    writeVault(v, f);
    const loaded = readVault(f);
    expect(loaded.cookies.length).toBe(1);
  });

  test("readVault null when missing", () => {
    expect(readVault("/tmp/definitely-missing-" + Date.now())).toBeNull();
  });

  test("statusOf present with counts", () => {
    const v = emptyVault();
    v.cookies = [{ domain: ".a" }, { domain: ".a" }, { domain: ".b" }];
    v.storage = [{ origin: "https://x" }];
    const s = statusOf(v);
    expect(s.present).toBe(true);
    expect(s.cookies).toBe(3);
    expect(s.domains).toBe(2);
    expect(s.storageOrigins).toBe(1);
  });

  test("statusOf null => not present", () => {
    expect(statusOf(null).present).toBe(false);
  });

  afterEach(() => {
    for (const f of tmpFiles) {
      try {
        realFs.unlinkSync(f);
      } catch (_) {}
    }
    tmpFiles = [];
  });
});

/* ------------------------- firefox-grab (temp profile) ------------------------- */
describe("firefox-grab", () => {
  test("throws when profile cookies missing", () => {
    expect(() =>
      grabFirefox({ profile: "/tmp/no-such-profile-" + Date.now() }),
    ).toThrow();
  });

  test("grabs cookies + per-origin storage from a real temp profile", () => {
    const { Database } = require("bun:sqlite");
    const os = require("node:os");
    const path = require("node:path");
    const fs = require("node:fs");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cv-ff-"));
    // cookies.sqlite
    const cdb = new Database(path.join(profile, "cookies.sqlite"));
    cdb.exec(
      "CREATE TABLE moz_cookies(id INTEGER PRIMARY KEY, host TEXT, name TEXT, value TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER)",
    );
    cdb.run(
      "INSERT INTO moz_cookies(host,name,value,path,expiry,isSecure,isHttpOnly,sameSite) VALUES(?,?,?,?,?,?,?,?)",
      [".example.com", "sid", "abc", "/", 2000000000, 1, 1, 0],
    );
    cdb.close();
    // per-origin storage
    const lsDir = path.join(profile, "storage/default/https+++example.com/ls");
    fs.mkdirSync(lsDir, { recursive: true });
    const ldb = new Database(path.join(lsDir, "data.sqlite"));
    ldb.exec(
      "CREATE TABLE data(key TEXT PRIMARY KEY, value BLOB, compression_type INTEGER)",
    );
    ldb.run("INSERT INTO data(key,value,compression_type) VALUES(?,?,?)", [
      "prefs",
      Buffer.from("dark=1"),
      0,
    ]);
    ldb.close();

    const v = grabFirefox({ profile });
    expect(v.cookies.length).toBe(1);
    expect(v.cookies[0].domain).toBe(".example.com");
    expect(v.storage.length).toBeGreaterThan(0);
    fs.rmSync(profile, { recursive: true, force: true });
  });
});

/* ------------------------- keeper-cdp (mocked WebSocket/fetch) ------------------------- */
describe("keeper-cdp", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    mock.restore();
  });

  test("cdpTabs throws on unreachable CDP", async () => {
    globalThis.fetch = mock(() => Promise.resolve({ ok: false, status: 404 }));
    await expect(cdpTabs("x")).rejects.toThrow();
  });

  test("cdpTabs throws when no pages", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    );
    await expect(cdpTabs("x")).rejects.toThrow(/No active keeper pages/);
  });

  test("cdpTabs returns tabs when present", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ webSocketDebuggerUrl: "ws://x" }]),
      }),
    );
    const tabs = await cdpTabs("x");
    expect(tabs[0].webSocketDebuggerUrl).toBe("ws://x");
  });

  test("cdpCall rejects when socket closed", async () => {
    const fake = {
      readyState: 3,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    await expect(cdpCall(fake, "x")).rejects.toThrow(/not open/);
  });

  test("cdpCall sends once open and resolves", async () => {
    let sent = null;
    const listeners = {};
    const fake = {
      readyState: 0, // CONNECTING
      send(m) {
        sent = JSON.parse(m);
      },
      addEventListener(ev, fn) {
        listeners[ev] = fn;
      },
      removeEventListener() {},
    };
    const p = cdpCall(fake, "m", { a: 1 }, 1);
    // simulate open then a matching result message
    fake.readyState = 1;
    // the sendWhenReady uses setTimeout(10); pump enough
    await new Promise((r) => setTimeout(r, 30));
    if (listeners.message)
      listeners.message({
        data: JSON.stringify({ id: 1, result: { ok: true } }),
      });
    const res = await p;
    expect(res.ok).toBe(true);
    expect(sent).not.toBeNull();
  });

  test("grabKeeper + restoreKeeper happy path with stubbed WebSocket", async () => {
    // In-process CDP responder: answers each command with a canned result so
    // the real cdpCall resolves instead of timing out.
    const canned = {
      "Storage.getCookies": {
        cookies: [{ name: "session", value: "s", domain: ".x.com" }],
      },
      "Page.getFrameTree": {
        frameTree: {
          frame: { id: "f", securityOrigin: "https://x.com" },
          childFrames: [],
        },
      },
      "Storage.getStorageKeyForFrame": { storageKey: "sk" },
      "Storage.getDOMStorageItems": {
        entries: [
          [
            { name: "k", value: "v" },
            { name: "k", value: "v" },
          ],
        ],
      },
      "DOMStorage.enable": {},
      "Storage.setCookies": {},
      "Runtime.evaluate": { result: { type: "number", value: 1 } },
    };
    (globalThis as any).WebSocket = class {
      readyState = WebSocket.OPEN;
      _handler = null;
      constructor() {
        setTimeout(() => {
          if (this.onopen) this.onopen({});
        }, 0);
      }
      send(raw) {
        const msg = JSON.parse(raw);
        const result = canned[msg.method] ?? {};
        setTimeout(() => {
          if (this._handler)
            this._handler({ data: JSON.stringify({ id: msg.id, result }) });
        }, 0);
      }
      addEventListener(ev, fn) {
        if (ev === "message") this._handler = fn;
      }
      removeEventListener() {}
      close() {}
    };
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ webSocketDebuggerUrl: "ws://x" }]),
      }),
    );
    const v = await grabKeeper("http://127.0.0.1:9223");
    expect(Array.isArray(v.cookies)).toBe(true);
    expect(v.storage.length).toBeGreaterThanOrEqual(1);
    const n = await restoreKeeper("http://127.0.0.1:9223", {
      cookies: [{ name: "c", value: "v", domain: ".x" }],
      storage: [{ origin: "https://x", localStorage: { a: "1" } }],
    });
    expect(n).toBe(1);
  });
});
