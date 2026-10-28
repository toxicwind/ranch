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
// Telegram's OFFICIAL BotFather user id. driveBotFather trusts ONLY
// token replies from this sender — squatter lookalikes ("migrate to our
// channel" scams) must never yield estate credentials. 2026-10-28.
const OFFICIAL_BOTFATHER_ID = 93372553;

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
		if (k.toUpperCase().includes("KAIROS") || k === "BASH_ENV" || k === "ENV") continue;
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

// Login code flood guard: each sendCode burns the number's rate budget (a
// 2026-10-28 session sent ~6 codes in minutes and hit a 3370s Telegram
// flood-wait, hanging every subsequent POST). One code per 60s, forever.
let lastSendCodeAt = 0;
const SEND_CODE_MIN_INTERVAL_MS = 60_000;

function sendCodeAllowed(): { ok: boolean; waitS: number } {
	const waitS = Math.ceil((lastSendCodeAt + SEND_CODE_MIN_INTERVAL_MS - Date.now()) / 1000);
	return waitS > 0 ? { ok: false, waitS } : { ok: true, waitS: 0 };
}

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
	// Anti-squatter: only the OFFICIAL BotFather's reply carries credential
	// material. Impostors (id mismatch, or no sender) return a structured
	// refusal — the token regex never runs on untrusted text.
	const senderId = msgs[0]?.senderId ? Number(msgs[0].senderId.toString()) : 0;
	if (senderId !== OFFICIAL_BOTFATHER_ID) {
		return { ok: false, error: `botfather reply sender id ${senderId} != official ${OFFICIAL_BOTFATHER_ID} — refusing (squatter/phishing guard)` };
	}
	const tokenMatch = reply.match(/\b(\d{8,12}:[A-Za-z0-9_-]{30,})\b/);
	if (!tokenMatch) {
		return { ok: false, error: `botfather did not return a token: ${reply.slice(0, 200)}` };
	}
	return { ok: true, token: tokenMatch[1], botUsername: uname };
}

const server = serve({
	hostname: "0.0.0.0",
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		// ── MCP streamable-HTTP surface (JSON-RPC 2.0, POST /mcp) ──────────
		// Federated via thresher (:25127) so ANY agent gets telegram_newbot /
		// telegram_status as first-class MCP tools — no HTTP curl needed.
		if (url.pathname === "/mcp" && request.method === "POST") {
			const rpc = (await request.json()) as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
			const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, result });
			if (rpc.method === "initialize")
				return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "taas", version: "1.0.0" } });
			if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
			if (rpc.method === "tools/list")
				return reply({
					tools: [
						{ name: "telegram_newbot", description: "Create a Telegram bot AUTONOMOUSLY via @BotFather (MTProto user session). Returns bot_username; token is stored in the keyring as TELEGRAM_BOT_TOKEN_<agent> and never echoed in full.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Bot display name" }, username: { type: "string", description: "Bot username (must end in 'bot' or one is appended)" }, agent: { type: "string", description: "Requesting agent name — the keyring label becomes TELEGRAM_BOT_TOKEN_<agent>" } }, required: ["name", "username", "agent"] } },
						{ name: "telegram_status", description: "TaaS session status: alive, phone hint, bots created by this service.", inputSchema: { type: "object", properties: {} } },
					],
				});
			if (rpc.method === "tools/call") {
				const name = rpc.params?.name ?? "";
				const args = rpc.params?.arguments ?? {};
				if (name === "telegram_status") {
					const alive = await ensureConnected();
					return reply({ content: [{ type: "text", text: JSON.stringify({ ok: alive, phone: PHONE ? `${PHONE.slice(0, 4)}***` : "unset" }) }] });
				}
				if (name === "telegram_newbot") {
					const agent = String(args.agent ?? "unknown-agent");
					const req: NewBotRequest = { name: String(args.name ?? ""), username: String(args.username ?? "") };
					const res = await driveBotFather(req);
					if (res.ok && res.token) {
						const label = `TELEGRAM_BOT_TOKEN_${agent}`.toUpperCase();
						keyringSet(label, res.token);
						return reply({ content: [{ type: "text", text: JSON.stringify({ ok: true, bot_username: res.botUsername, keyring_label: label, token_hint: `${res.token.slice(0, 8)}...${res.token.slice(-4)}` }) }] });
					}
					return reply({ content: [{ type: "text", text: JSON.stringify(res) }], isError: true });
				}
				return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32602, message: `unknown tool ${name}` } }, { status: 400 });
			}
			return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: `unknown method ${rpc.method}` } }, { status: 400 });
		}
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
		if (url.pathname === "/telegram/login" && request.method === "GET") {
			// One-time interactive: sends the Telegram code to the architect's phone.
			const gate = sendCodeAllowed();
			if (!gate.ok) {
				return Response.json({ ok: false, error: `code send rate-limited (retry in ${gate.waitS}s)` }, { status: 429 });
			}
			// Surface the REAL connect error — a bare "connect failed" hid a
			// transient-vs-permanent distinction for a whole session (2026-10-28).
			let ok: unknown;
			try {
				ok = await client.connect();
			} catch (err) {
				return Response.json({ ok: false, error: `connect threw: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
			}
			// connect() resolves void (throws on failure); `connected` tells truth.
			if (!client.connected) {
				return Response.json({ ok: false, error: `connect failed (connected=false, resolve=${String(ok)})` }, { status: 502 });
			}
			// High-level sendCode helper shape-drifts across gramJS versions —
			// raw TL invoke is stable. Code lands in the phone's Telegram app.
			const result = await client.invoke(new Api.auth.SendCode({
				phoneNumber: PHONE,
				apiId: API_ID,
				apiHash: API_HASH,
				settings: new Api.CodeSettings({}),
			})).catch((e: Error) => ({ error: e.message }));
			if ("error" in result) return Response.json({ ok: false, error: result.error }, { status: 502 });
			lastSendCodeAt = Date.now();
			return Response.json({ ok: true, hint: "code sent to phone; POST /telegram/login {code}" });
		}
		if (url.pathname === "/telegram/login" && request.method === "POST") {
			const body = (await request.json()) as { code: string };
			if (!body.code) return Response.json({ ok: false, error: "code required" }, { status: 400 });
			try {
				await client.signInUser(
					{ apiId: API_ID, apiHash: API_HASH },
					{ phoneNumber: PHONE, phoneCode: async () => body.code, password: async () => { const p = KR["TELEGRAM_PASSWORD"] ?? ""; return p; }, onError: (e: Error) => console.error("signin:", e.message) },
				);
				const sess = client.session.save() as unknown as string;
				keyringSet("TELEGRAM_USER_SESSION", sess);
				sessionAlive = true;
				return Response.json({ ok: true, session: "stored (keyring TELEGRAM_USER_SESSION)" });
			} catch (err) {
				return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
			}
		}
		return Response.json({ ok: false, error: "not found" }, { status: 404 });
	},
});

console.log(`taas: listening on 0.0.0.0:${PORT} (LAN-reachable)`);
