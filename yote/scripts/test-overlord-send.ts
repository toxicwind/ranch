#!/usr/bin/env bun
// Test MTProto overlord sending a message

import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import { resolve } from "path";

const API_ID = Number(process.env.YOTE_TELEGRAM_API_ID);
const API_HASH = process.env.YOTE_TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("Set YOTE_TELEGRAM_API_ID and YOTE_TELEGRAM_API_HASH");
  process.exit(1);
}

const session = new StoreSession("./sessions/overlord");
const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 5,
  autoReconnect: true,
});

async function main() {
  await client.connect();
  console.log("MTProto connected");

  // Send a test message to the bot's chat
  const result = await client.sendMessage(716302190, { message: "hello from MTProto overlord" });
  console.log("Sent via MTProto:", result);

  await client.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });