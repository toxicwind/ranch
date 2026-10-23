#!/usr/bin/env bun
// scripts/overlord-login-auto.ts
// Non-interactive login using known phone

import { TelegramClient } from "telegram";
import { StringSession, StoreSession } from "telegram/sessions/index.js";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const API_ID = Number(process.env.YOTE_TELEGRAM_API_ID);
const API_HASH = process.env.YOTE_TELEGRAM_API_HASH;
const PHONE = "3036673831"; // from TELEGRAM_ALLOWED_USERS
const ENV_PATH = resolve(process.cwd(), ".env");

if (!API_ID || !API_HASH) {
  console.error("Set YOTE_TELEGRAM_API_ID and YOTE_TELEGRAM_API_HASH in .env first");
  process.exit(1);
}

const session = new StoreSession("./sessions/overlord");
const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 5,
  autoReconnect: true,
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to Telegram MTProto");

    // Start login - we need to handle 2FA if enabled
    const result = await client.start({
      phoneNumber: async () => PHONE,
      password: async () => {
        // If 2FA is enabled, we need the password
        console.error("2FA password required - set YOTE_TELEGRAM_2FA_PASSWORD env var or run interactive");
        process.exit(1);
      },
      phoneCode: async () => {
        console.error("Code sent to Telegram app - enter it via YOTE_TELEGRAM_CODE env var or run interactive");
        process.exit(1);
      },
      onError: (e: any) => console.error("Auth error:", e),
    });

    const ss = client.session.save() as unknown as string;
    await client.disconnect();

    // Save session to .env
    let env = "";
    try { env = readFileSync(ENV_PATH, "utf8"); } catch {}
    if (env.includes("YOTE_TELEGRAM_SESSION=")) {
      env = env.replace(/YOTE_TELEGRAM_SESSION=.*/, "YOTE_TELEGRAM_SESSION=" + ss);
    } else {
      env += `\nYOTE_TELEGRAM_SESSION=${ss}\n`;
    }
    writeFileSync(ENV_PATH, env);

    console.log("\nPermanent session saved to .env");
  } catch (e: any) {
    console.error("Error:", e.message ?? e);
    process.exit(1);
  }
}

main();