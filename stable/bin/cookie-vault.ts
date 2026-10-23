#!/usr/bin/env bun
/**
 * cookie-vault.ts — first-class cookie & session grab/restore utility for browserless & keeper.
 *
 * Commands:
 *   bun bin/cookie-vault.ts grab-firefox   Extracts all cookies and sessions from live Firefox (handles SQLite locks safely).
 *   bun bin/cookie-vault.ts grab-keeper    Snapshots live cookies from keeper Chromium (CDP :9223).
 *   bun bin/cookie-vault.ts restore-keeper Injects the vault snapshot into keeper Chromium.
 *   bun bin/cookie-vault.ts sync           Grabs from Firefox and syncs directly into keeper Chromium in one shot.
 *   bun bin/cookie-vault.ts status         Displays count and domains stored in vault.
 */

import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VAULT_DIR = "/home/toxic/.browserless/vault";
const BACKUP_FILE = join(VAULT_DIR, "cookies-vault.json");
const KEEPER_BACKUP_FILE = "/home/toxic/.browserless/cookies-backup.json";
const CDP_URL = process.env.BROWSER_KEEPER_CDP || "http://127.0.0.1:9223";

interface VaultCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires?: number;
  sameSite?: "Strict" | "Lax" | "None";
}

function findFirefoxDb(): string | null {
  const base = "/home/toxic/.mozilla/firefox";
  if (!existsSync(base)) return null;
  const profiles = ["7c8v85fg.default-nightly", "default-release", "default"];
  for (const p of profiles) {
    const candidate = join(base, p, "cookies.sqlite");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function grabFirefoxCookies(): VaultCookie[] {
  const dbPath = findFirefoxDb();
  if (!dbPath) throw new Error("Firefox cookies.sqlite not found");

  mkdirSync("/tmp/cookie-vault", { recursive: true });
  const tmpCopy = `/tmp/cookie-vault/ff-cookies-${Date.now()}.sqlite`;
  copyFileSync(dbPath, tmpCopy);

  const cookies: VaultCookie[] = [];
  try {
    const db = new Database(tmpCopy, { readonly: true });
    const rows = db.query(
      "SELECT host, name, value, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies"
    ).all() as Array<{
      host: string;
      name: string;
      value: string;
      path: string;
      expiry: number;
      isSecure: number;
      isHttpOnly: number;
      sameSite: number;
    }>;

    for (const r of rows) {
      let exp = r.expiry;
      if (exp && exp > 1_000_000_000_000) exp = Math.floor(exp / 1_000_000);
      else if (exp && exp > 10_000_000_000) exp = Math.floor(exp / 1_000);

      cookies.push({
        name: r.name,
        value: r.value,
        domain: r.host,
        path: r.path || "/",
        secure: Boolean(r.isSecure),
        httpOnly: Boolean(r.isHttpOnly),
        expires: exp > 0 ? exp : undefined,
        sameSite: r.sameSite === 1 ? "Lax" : r.sameSite === 2 ? "Strict" : "None",
      });
    }
    db.close();
  } finally {
    try { unlinkSync(tmpCopy); } catch {}
  }

  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(BACKUP_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[cookie-vault] Extracted ${cookies.length} cookies from Firefox -> ${BACKUP_FILE}`);
  return cookies;
}

export async function grabKeeperCookies(): Promise<VaultCookie[]> {
  const res = await fetch(`${CDP_URL}/json/version`);
  if (!res.ok) throw new Error(`Keeper CDP unreachable on ${CDP_URL}`);

  // Fetch all cookies via Network.getAllCookies over CDP websocket
  const tabsRes = await fetch(`${CDP_URL}/json/list`);
  const tabs = (await tabsRes.json()) as Array<{ webSocketDebuggerUrl?: string }>;
  if (!tabs.length || !tabs[0].webSocketDebuggerUrl) throw new Error("No active keeper pages found");

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  const cookies = await new Promise<VaultCookie[]>((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: "Storage.getCookies" }));
    };
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data.toString());
      if (data.id === 1) {
        ws.close();
        resolve(data.result?.cookies || []);
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => { ws.close(); reject(new Error("CDP timeout")); }, 5000);
  });

  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(BACKUP_FILE, JSON.stringify(cookies, null, 2));
  writeFileSync(KEEPER_BACKUP_FILE, JSON.stringify(cookies, null, 2));
  console.log(`[cookie-vault] Captured ${cookies.length} live cookies from keeper Chromium -> ${BACKUP_FILE}`);
  return cookies;
}

export async function restoreKeeperCookies(cookieList?: VaultCookie[]): Promise<number> {
  let list = cookieList;
  if (!list) {
    const file = existsSync(BACKUP_FILE) ? BACKUP_FILE : existsSync(KEEPER_BACKUP_FILE) ? KEEPER_BACKUP_FILE : null;
    if (!file) throw new Error("No cookie backup found in vault");
    list = JSON.parse(readFileSync(file, "utf8")) as VaultCookie[];
  }

  const tabsRes = await fetch(`${CDP_URL}/json/list`);
  const tabs = (await tabsRes.json()) as Array<{ webSocketDebuggerUrl?: string }>;
  if (!tabs.length || !tabs[0].webSocketDebuggerUrl) throw new Error("No active keeper pages found");

  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  return new Promise<number>((resolve, reject) => {
    ws.onopen = () => {
      const formatted = list!.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? false,
        expires: c.expires,
        sameSite: c.sameSite,
      }));
      ws.send(JSON.stringify({ id: 2, method: "Storage.setCookies", params: { cookies: formatted } }));
    };
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data.toString());
      if (data.id === 2) {
        ws.close();
        console.log(`[cookie-vault] Restored ${list!.length} cookies into keeper Chromium!`);
        resolve(list!.length);
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => { ws.close(); reject(new Error("CDP restore timeout")); }, 5000);
  });
}

const cmd = process.argv[2] || "status";
switch (cmd) {
  case "grab-firefox":
    grabFirefoxCookies();
    break;
  case "grab-keeper":
    await grabKeeperCookies();
    break;
  case "restore-keeper":
    await restoreKeeperCookies();
    break;
  case "sync":
    const cookies = grabFirefoxCookies();
    await restoreKeeperCookies(cookies);
    break;
  case "status":
    const file = existsSync(BACKUP_FILE) ? BACKUP_FILE : existsSync(KEEPER_BACKUP_FILE) ? KEEPER_BACKUP_FILE : null;
    if (!file) {
      console.log("[cookie-vault] No backup present.");
    } else {
      const data = JSON.parse(readFileSync(file, "utf8")) as VaultCookie[];
      const domains = new Set(data.map((c) => c.domain));
      console.log(`[cookie-vault] Stored: ${data.length} cookies across ${domains.size} domains (${file})`);
    }
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
}
