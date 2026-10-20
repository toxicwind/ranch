#!/usr/bin/env bun
// scripts/overlord-login-env.ts
// Non-interactive login using env vars for phone/code/password

import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions/index.js";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const API_ID = Number(process.env.YOTE_TELEGRAM_API_ID);
const API_HASH = process.env.YOTE_TELEGRAM_API_HASH;
const PHONE = process.env.YOTE_TELEGRAM_PHONE || "3036673831";
const CODE = process.env.YOTE_TELEGRAM_CODE;
const PASSWORD = process.env.YOTE_TELEGRAM_2FA_PASSWORD;
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

    const result = await client.start({
      phoneNumber: async () => {
        console.log(`Using phone: ${PHONE}`);
        return PHONE;
      },
      password: async () => {
        if (PASSWORD) {
          console.log("Using 2FA password from env");
          return PASSWORD;
        }
        console.error("2FA password required - set YOTE_TELEGRAM_2FA_PASSWORD");
        process.exit(1);
      },
      phoneCode: async () => {
        if (CODE) {
          console.log("Using code from env");
          return CODE;
        }
        console.error("Code required - set YOTE_TELEGRAM_CODE (check Telegram app)");
        process.exit(1);
      },
      onError: (e: any) => console.error("Auth error:", e),
    });

    await client.disconnect();

    const ss = session.save() as unknown as string;
    console.log("Session string length:", ss?.length ?? 0);

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