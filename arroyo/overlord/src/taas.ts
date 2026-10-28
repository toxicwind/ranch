#!/usr/bin/env bun
/**
 * taas.ts — Telegram-as-a-Service on yote: ANY rig/agent can create its own
 * Telegram bot autonomously.
 *
 * Flow (proven live by inbound-probe: real user MTProto, bot-to-bot blocked):
 *   1. Client auth: YOTE_TELEGRAM_API_ID/HASH + StringSession from keyring
 *      TELEGRAM_USER_SESSION (or interactive login on first run → stored).
 *   2. POST /telegram/newbot {name, username, description?}:
 *      - message @BotFather: /newbot → "name" → username (must end 'bot')
 *      - parse the token from BotFather's reply
 *      - keyring store TELEGRAM_BOT_TOKEN_<agent> (stdin path, env-emits)
 *      - return { token_hint, bot_username }
 *   3. GET  /telegram/status — session alive, bots created so far.
 *
 * Surfaces: HTTP API on VANS_TAAS_PORT (default 25243, loopback) + MCP tool
 * registered via the gatehouse->thresher federation (same shape as geode).
 */
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { serve } from "bun";

const PORT = Number(process.env.VANS_TAAS_PORT ?? 25243);
const BOTFATHER = "botfather"; // lowercase username for GramJS

// --- keyring (env emitter; stdin-path set) — NO pipes into secretsmith ---
function keyring(): Record<string, string> {
	const { execSync } = require("node:child_process") as typeof import("node:child_process");
	const out = execSync("secretsmith env", { encoding: "utf8", timeout: 30_000, env: cleanEnv() });
	const keys: Record<string, string> = {};
	for (const m of out.matchAll(/^([A-Z_0-9]+)='(.*)'$/gm)) keys[m[1]!] = m[2]!;
	return keys;
}
function cleanEnv(): Record<string, string> {
	const e: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if ("KAIROS" in k.toUpperCase() || k === "BASH_ENV" || k === "ENV") continue;
		e[k] = v as string;
	}
	return e;
}
function keyringSet(label: string, secret: string): boolean {
	try {
		const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
		execFileSync("secretsmith", ["set", "--label", label], {
			input: secret,
			encoding: "utf8",
			timeout: 30_000,
			env: cleanEnv(),
		});
		return true;
	} catch {
		return false;
	}
}

const KR = keyring();
const API_ID = Number(KR["YOTE_TELEGRAM_API_ID"] ?? 0);
const API_HASH = KR["YOTE_TELEGRAM_API_HASH"] ?? "";
const PHONE = KR["YOTE_TELEGRAM_PHONE"] ?? "";
const SESSION = KR["TELEGRAM_USER_SESSION"] ?? "";

if (!API_ID || !API_HASH) {
	console.error("taas: missing YOTE_TELEGRAM_API_ID/HASH in keyring");
	process.exit(1);
}

const client = new TelegramClient(
	new StringSession(SESSION),
	API_ID,
	API_HASH,
	{ connectionRetries: 3 },
);

let sessionAlive = false;

async function ensureConnected(): Promise<boolean> {
	if (sessionAlive) return true;
	try {
		await client.connect();
		sessionAlive = await client.checkAuthorization();
		return sessionAlive;
	} catch (err) {
		console.error("taas connect err:", err instanceof Error ? err.message : err);
		return false;
	}
}

interface NewBotRequest {
	name: string;
	username: string;
	description?: string;
}

async function driveBotFather(req: NewBotRequest): Promise<{ ok: boolean; token?: string; botUsername?: string; error?: string }> {
	await client.sendMessage("botfather", { message: "/newbot" });
	await Bun.sleep(1500);

	await client.sendMessage("botfather", { message: req.name });
	await Bun.sleep(1500);

	// Telegram requires bot usernames to end in 'bot' (case-insensitive).
	const uname = req.username.endsWith("bot") ? req.username : `${req.username}_bot`;
	await client.sendMessage("botfather", { message: uname });
	await Bun.sleep(2500);

	// Read the reply (last message from BotFather).
	const msgs = await client.getMessages("botfather", { limit: 1 });
	const reply = msgs[0]?.message ?? "";
	const tokenMatch = reply.match(/\b(\d{8,12}:[A-Za-z0-9_-]{30,})\b/);
	if (!tokenMatch) {
		return { ok: false, error: `botfather did not return a token: ${reply.slice(0, 200)}` };
	}
	return { ok: true, token: tokenMatch[1], botUsername: uname };
}

const server = serve({
	hostname: "127.0.0.1",
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({ ok: true, service: "taas", session: sessionAlive });
		}
		if (url.pathname === "/telegram/status" && request.method === "GET") {
			const alive = await ensureConnected();
			return Response.json({ ok: alive, phone: PHONE ? `${PHONE.slice(0, 4)}***` : "unset" });
		}
		if (url.pathname === "/telegram/newbot" && request.method === "POST") {
			let body: NewBotRequest;
			try {
				body = (await request.json()) as NewBotRequest;
			} catch {
				return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
			}
			if (!body.name || !body.username) {
				return Response.json({ ok: false, error: "name and username required" }, { status: 400 });
			}
			const alive = await ensureConnected();
			if (!alive) {
				return Response.json({ ok: false, error: "MTProto session not authorized" }, { status: 503 });
			}
			const result = await driveBotFather(body);
			if (result.ok && result.token) {
				// Keyring store: per-agent bot token, env-emitted (stdin path).
				const label = `TELEGRAM_BOT_TOKEN_${(body.username.replace(/[^a-z0-9]/gi, "_").toUpperCase().slice(0, 20))}`;
				keyringSet(label, result.token);
				// Persist the session if it rotated.
				const sess = client.session.save() as unknown as string;
				if (sess && sess !== SESSION) keyringSet("TELEGRAM_USER_SESSION", sess);
				return Response.json({
					ok: true,
					botUsername: result.botUsername,
					tokenKeyringLabel: label,
					tokenLast4: result.token.slice(-4),
				});
			}
			return Response.json(result, { status: 502 });
		}
		return Response.json({ ok: false, error: "not found" }, { status: 404 });
	},
});

console.log(`taas: listening on 127.0.0.1:${PORT}`);
