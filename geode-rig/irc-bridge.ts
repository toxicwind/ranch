#!/usr/bin/env bun
/**
 * irc-bridge.ts — the village on IRC. One connection per rig: geode, muse,
 * skopos, ... each speaking in its OWN nick on #village (ergo :25241).
 *
 *   squawk fleet room  ──filter: from_agent==rig──▶  PRIVMSG as <rig> nick
 *   server PING        ────────────────────────────▶  PONG (keepalive, all 11)
 *
 * The old single-nick relay (village-bridge) is retired: a village where
 * everyone speaks through one mouth is not a village.
 */
import { readFileSync } from "node:fs";

const IRC_HOST = "127.0.0.1";
const IRC_PORT = 25241;
const CHANNEL = "#village";
const SQUAWK = "http://127.0.0.1:25120";
const TOKEN = readFileSync("/home/toxic/.config/estate-chat-token", "utf8").trim();
const MANIFEST = "/home/toxic/pens/ranch/geode-rig/rig-manifest.json";

type Rig = { name: string; sigil?: string };
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { rigs?: Array<{ name?: string }> };
const rigNames = (manifest.rigs ?? []).map((r) => r.name ?? "").filter(Boolean);
const NICKS = [...rigNames, "tau", "kappa"].map((n) => n.slice(0, 16));

class IrcBot {
	private sock?: Bun.TCPSocket;
	private buf = "";
	private lastSeq = 0;
	private constructor(readonly nick: string) {}

	static async spawn(nick: string): Promise<IrcBot> {
		const bot = new IrcBot(nick);
		await bot.connect();
		return bot;
	}

	private async connect(): Promise<void> {
		this.sock = await Bun.connect({
			hostname: IRC_HOST,
			port: IRC_PORT,
			socket: {
				data: (_, data) => this.onData(new TextDecoder().decode(data)),
				error: () => this.scheduleReconnect(),
				close: () => this.scheduleReconnect(),
			},
		});
		this.send(`NICK ${this.nick}`);
		this.send(`USER ${this.nick} 0 * :${this.nick} (estate village rig)`);
		this.send(`JOIN ${CHANNEL}`);
	}

	private onData(chunk: string): void {
		this.buf += chunk;
		let idx: number;
		while ((idx = this.buf.indexOf("\r\n")) >= 0) {
			const line = this.buf.slice(0, idx);
			this.buf = this.buf.slice(idx + 2);
			if (line.startsWith("PING")) this.send(line.replace("PING", "PONG"));
		}
	}

	private send(line: string): void {
		this.sock?.write(`${line}\r\n`);
	}

	private scheduleReconnect(): void {
		if (this.sock) { try { this.sock.end(); } catch { /* dead */ } this.sock = undefined; }
		setTimeout(() => void this.connect().catch(() => this.scheduleReconnect()), 15_000);
	}

	say(text: string): void {
		for (const part of text.match(/.{1,350}(\s|$)/g) ?? [text]) {
			this.send(`PRIVMSG ${CHANNEL} :${part.trim()}`);
		}
	}

	setSeq(seq: number): void { this.lastSeq = seq; }
	get seq(): number { return this.lastSeq; }
}

const bots = new Map<string, IrcBot>();
for (const n of NICKS) {
	try { bots.set(n, await IrcBot.spawn(n)); } catch { console.error(`[${n}] spawn failed; retry loop will pick it up`); }
}

// ── squawk poller: one pass, fan-out to the right nick ─────────────────────
async function pollOnce(): Promise<void> {
	let doc: { messages?: Array<{ seq: number; from_agent?: string; body?: string }> };
	try {
		const res = await fetch(`${SQUAWK}/v1/rooms/fleet/messages?since=${Math.min(...[...bots.values()].map(b => b.seq), Number.MAX_SAFE_INTEGER)}`, {
			headers: { Authorization: `Bearer ${TOKEN}` },
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return;
		doc = await res.json();
	} catch { return; }
	for (const m of doc.messages ?? []) {
		const who = (m.from_agent ?? "").toLowerCase().slice(0, 16);
		const bot = bots.get(who);
		if (!bot || !m.body) continue;
		bot.setSeq(Math.max(bot.seq, m.seq));
		bot.say(m.body.slice(0, 400));
	}
}

const POLL_MS = 5_000;
setInterval(() => void pollOnce(), POLL_MS);
console.log(`irc-bridge: ${bots.size} village nicks on ${CHANNEL} @ ${IRC_HOST}:${IRC_PORT}`);
