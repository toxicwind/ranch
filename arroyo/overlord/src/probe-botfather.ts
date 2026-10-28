// probe-botfather.ts — who actually replied as "BotFather"?
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
const { execSync } = require("node:child_process");
function keyring(): Record<string,string> {
  const out = execSync("secretsmith env", { encoding: "utf8", timeout: 30000 });
  const k: Record<string,string> = {};
  for (const m of out.matchAll(/^([A-Z_0-9]+)='(.*)'$/gm)) k[m[1]!] = m[2]!;
  return k;
}
const K = keyring();
const API_ID = Number(K.YOTE_TELEGRAM_API_ID);
const API_HASH = K.YOTE_TELEGRAM_API_HASH!;
const session = new StringSession(K.TELEGRAM_USER_SESSION ?? "");
const client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 2 });
await client.connect();
const ent = await client.getInputEntity("botfather");
const full = await client.getEntity("botfather");
console.log("botfather entity id:", full.id.toString(), "| username:", full.username, "| verified:", (full as any).verified);
const msgs = await client.getMessages("botfather", { limit: 6 });
for (const m of msgs) {
  const sender = m.sender ? `${(m.sender as any).username ?? ""} id=${m.sender.id.toString()}` : "?";
  const body = (m.message ?? "<media>").replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[TOKEN-REDACTED]").slice(0, 110);
  console.log(`[${m.date?.toISOString?.() ?? m.date}] from=${sender} :: ${body}`);
}
await client.disconnect();
