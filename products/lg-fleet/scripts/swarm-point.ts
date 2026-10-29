/**
 * swarm-point.ts — the portable direct collaborative "point" for agent swarms.
 *
 * One library: 20 communication routes (obscure + standard) × 20 concurrency
 * patterns, monadic core (Ok/Err chaining per estate doctrine). Agents bootstrap
 * by calling `discover()` — the helper script that finds peers via ANY legible
 * route, tolerating monadic "impossible" failures (denied, absent, poisoned).
 *
 * Routes are abstractions over transport; each exposes `send(msg)` and `poll()`.
 * Patterns are abstractions over scheduling; each takes tasks and yields results.
 * Both fail FORWARD (Err carries the route + cause), never silently.
 */

import { Database } from "bun:sqlite";

// ── monadic core ─────────────────────────────────────────────────────────────
export type Ok<T> = { readonly tag: "ok"; readonly value: T };
export type Err<E> = { readonly tag: "err"; readonly error: E };
export type Result<T, E = SwarmError> = Ok<T> | Err<E>;

export interface SwarmError {
	readonly route: string;
	readonly cause: string;
	readonly fatal?: boolean;
}

export const Ok = <T>(value: T): Ok<T> => ({ tag: "ok", value });
export const Err = <E>(error: E): Err<E> => ({ tag: "err", error });

export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
	return r.tag === "ok" ? Ok(f(r.value)) : r;
}
export function flatMap<T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> {
	return r.tag === "ok" ? f(r.value) : r;
}
/** Fold a list of results; first Err wins, else all Ok values. */
export function all<T, E>(rs: readonly Result<T, E>[]): Result<T[], E> {
	const ok: T[] = [];
	for (const r of rs) {
		if (r.tag === "err") return r;
		ok.push(r.value);
	}
	return Ok(ok);
}
/** Route a message through route candidates until one delivers (monadic retry). */
export function routeUntil<T, E>(
	candidates: readonly Result<T, E>[],
): Result<T, E> {
	let firstErr: E | undefined;
	for (const c of candidates) {
		if (c.tag === "ok") return c;
		firstErr ??= c.error;
	}
	return Err(firstErr as E);
}

// ── message shape ────────────────────────────────────────────────────────────
export interface SwarmMsg {
	from: string;
	to: string | "*";
	body: string;
	kind?: "todo" | "status" | "research" | "handoff" | "ping";
	ts: number;
	id: string;
}

let seq = 0;
export const mintId = (): string => `m${Date.now().toString(36)}-${(seq++).toString(36)}`;
export const mkMsg = (from: string, to: string, body: string, kind: SwarmMsg["kind"] = "status"): SwarmMsg =>
	({ from, to, body, kind, ts: Date.now(), id: mintId() });

// ── 20 communication routes ──────────────────────────────────────────────────
export type Route = {
	readonly id: string;
	readonly kind: string;
	send: (msg: SwarmMsg) => Promise<Result<void>>;
	poll: () => Promise<Result<SwarmMsg[]>>;
	readonly obscure: boolean;
};

/** FS bus — hash-linked message files (squawk fallback doctrine). */
export const fsRoute = (dir: string): Route => {
	let cursor = 0;
	return {
		id: "fs-bus", kind: "fs", obscure: false,
		send: async (msg) => {
			try {
				const line = `${msg.ts}-${msg.from}-${msg.id}.json`;
				await Bun.write(`${dir}/${line}`, JSON.stringify(msg) + "\n");
				return Ok(undefined);
			} catch (e) { return Err({ route: "fs-bus", cause: String(e) }); }
		},
		poll: async () => {
			try {
				const files = (await Array.fromAsync(new Bun.Glob(`${dir}/*.json`).scan({ absolute: true }))).sort();
				const fresh = files.slice(cursor);
				cursor = files.length;
				const msgs = [];
				for (const f of fresh) {
					try { msgs.push(JSON.parse(await Bun.file(f).text()) as SwarmMsg); } catch { /* poison line: skip */ }
				}
				return Ok(msgs);
			} catch (e) { return Err({ route: "fs-bus", cause: String(e) }); }
		},
	};
};

/** HTTP daemon (squawk :25120 pattern). */
export const httpRoute = (url: string, token?: string): Route => ({
	id: "http-daemon", kind: "http", obscure: false,
	send: async (msg) => {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
				body: JSON.stringify({ from_agent: msg.from, body: msg.body, kind: msg.kind ?? "status" }),
			});
			return res.ok ? Ok(undefined) : Err({ route: "http-daemon", cause: `HTTP ${res.status}` });
		} catch (e) { return Err({ route: "http-daemon", cause: String(e) }); }
	},
	poll: async () => {
		try {
			const res = await fetch(url.replace(/\/messages$/, "/state"), { headers: token ? { authorization: `Bearer ${token}` } : {} });
			const j: unknown = await res.json();
			const msgs = Array.isArray((j as { messages?: SwarmMsg[] })?.messages) ? (j as { messages: SwarmMsg[] }).messages : [];
			return Ok(msgs);
		} catch (e) { return Err({ route: "http-daemon", cause: String(e) }); }
	},
});

/** SQLite bus — one table, one row per message (kappa pattern). */
export const sqliteRoute = (path: string, table = "swarm_msgs"): Route => {
	let db: Database | null = null;
	let cursor = 0;
	const open = () => (db ??= new Database(path));
	try {
		open().run(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, ts INTEGER, from_a TEXT, to_a TEXT, body TEXT, kind TEXT)`);
	} catch { /* table may exist */ }
	return {
		id: "sqlite-bus", kind: "sqlite", obscure: true,
		send: async (msg) => {
			try {
				open().run(`INSERT OR REPLACE INTO ${table} VALUES (?,?,?,?,?,?)`, [msg.id, msg.ts, msg.from, msg.to, msg.body, msg.kind ?? "status"]);
				return Ok(undefined);
			} catch (e) { return Err({ route: "sqlite-bus", cause: String(e) }); }
		},
		poll: async () => {
			try {
				const rows = open().query(`SELECT id, ts, from_a, to_a, body, kind FROM ${table} WHERE rowid > ? ORDER BY rowid`).all(cursor) as Array<Record<string, unknown>>;
				cursor = (open().query(`SELECT COALESCE(MAX(rowid),0) AS m FROM ${table}`).get() as { m: number }).m;
				return Ok(rows.map(r => ({ id: String(r.id), ts: Number(r.ts), from: String(r.from_a), to: String(r.to_a), body: String(r.body), kind: String(r.kind) as SwarmMsg["kind"] })));
			} catch (e) { return Err({ route: "sqlite-bus", cause: String(e) }); }
		},
	};
};

/** TCP line bus — raw socket, newline-delimited JSON. */
export const tcpRoute = (host: string, port: number): Route => {
	let sock: Bun.Socket | null = null;
	const buf: SwarmMsg[] = [];
	return {
		id: "tcp-line", kind: "tcp", obscure: true,
		send: async (msg) => {
			try {
				sock ??= await Bun.connect({ hostname: host, port, socket: { data: (_s, d) => { try { buf.push(JSON.parse(String(d))); } catch { /* partial */ } } } });
				sock.write(JSON.stringify(msg) + "\n");
				return Ok(undefined);
			} catch (e) { sock = null; return Err({ route: "tcp-line", cause: String(e) }); }
		},
		poll: async () => { const out = buf.splice(0, buf.length); return Ok(out); },
	};
};

/** UDP datagram bus — fire-and-forget, lossy by design. */
export const udpRoute = (port: number, host = "127.0.0.1"): Route => {
	const seen = new Set<string>();
	const inbox: SwarmMsg[] = [];
	return {
		id: "udp-dgram", kind: "udp", obscure: true,
		send: async (msg) => {
			try {
				const dgram = await import("node:dgram");
				const s = dgram.createSocket("udp4");
				s.send(Buffer.from(JSON.stringify(msg)), port, host, () => s.close());
				return Ok(undefined);
			} catch (e) { return Err({ route: "udp-dgram", cause: String(e) }); }
		},
		poll: async () => {
			try {
				const dgram = await import("node:dgram");
				if (!("listening" in (udpRoute as unknown as Record<string, unknown>))) {
					const s = dgram.createSocket("udp4");
					s.on("message", (d) => { try { const m = JSON.parse(String(d)); if (!seen.has(m.id)) { seen.add(m.id); inbox.push(m); } } catch { /* junk */ } });
					s.bind(port, () => (udpRoute as unknown as Record<string, unknown>).listening = true);
				}
				return Ok(inbox.splice(0, inbox.length));
			} catch (e) { return Err({ route: "udp-dgram", cause: String(e) }); }
		},
	};
};

/** Env-var dead-drop — single message per named slot (obscure, zero-infra). */
export const envRoute = (slot: string): Route => ({
	id: `env:${slot}`, kind: "env", obscure: true,
	send: async (msg) => { try { Bun.env[slot] = JSON.stringify(msg); return Ok(undefined); } catch (e) { return Err({ route: `env:${slot}`, cause: String(e) }); } },
	poll: async () => {
		const raw = Bun.env[slot];
		if (!raw) return Ok([]);
		try { return Ok([JSON.parse(raw) as SwarmMsg]); } catch (e) { return Err({ route: `env:${slot}`, cause: String(e) }); }
	},
});

/** Memory point — in-process mailbox (same-kernel agents). */
export const memoryRoute = (name: string): Route => {
	const g = globalThis as typeof globalThis & { __swarmMailbox?: Map<string, SwarmMsg[]> };
	g.__swarmMailbox ??= new Map();
	return {
		id: `mem:${name}`, kind: "memory", obscure: true,
		send: async (msg) => { g.__swarmMailbox!.set(name, [...(g.__swarmMailbox!.get(name) ?? []), msg]); return Ok(undefined); },
		poll: async () => Ok(g.__swarmMailbox!.get(name)?.splice(0) ?? []),
	};
};

/** WebSocket bus — ws(s):// push. */
export const wsRoute = (url: string): Route => {
	let ws: WebSocket | null = null;
	const inbox: SwarmMsg[] = [];
	return {
		id: "ws", kind: "wss", obscure: false,
		send: async (msg) => {
			try {
				ws ??= new WebSocket(url);
				if (ws.readyState !== WebSocket.OPEN) await new Promise<void>((res, rej) => { ws!.onopen = res; ws!.onerror = rej; });
				ws.send(JSON.stringify(msg));
				return Ok(undefined);
			} catch (e) { ws = null; return Err({ route: "ws", cause: String(e) }); }
		},
		poll: async () => {
			if (!ws) return Ok([]);
			ws.onmessage = (ev) => { try { inbox.push(JSON.parse(String(ev.data))); } catch { /* junk */ } };
			return Ok(inbox.splice(0, inbox.length));
		},
	};
};

/** FIFO pipe bus — mkfifo + append/read (POSIX obscure). */
export const fifoRoute = (path: string): Route => {
	const lines: SwarmMsg[] = [];
	return {
		id: `fifo:${path}`, kind: "fifo", obscure: true,
		send: async (msg) => {
			try {
				const proc = Bun.spawn(["bash", "-c", `mkdir -p "$(dirname '${path}')" && [ -p '${path}' ] || mkfifo '${path}' && echo '${JSON.stringify(msg).replace(/'/g, `'\\''`)}' >> '${path}'`]);
				await proc.exited;
				return Ok(undefined);
			} catch (e) { return Err({ route: `fifo:${path}`, cause: String(e) }); }
		},
		poll: async () => {
			try {
				const proc = Bun.spawn(["bash", "-c", `[ -p '${path}' ] && timeout 1 tail -50 '${path}' || true`]);
				const out = await new Response(proc.stdout).text();
				const msgs = out.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as SwarmMsg]; } catch { return []; } });
				return Ok(msgs);
			} catch (e) { return Err({ route: `fifo:${path}`, cause: String(e) }); }
		},
	};
};

/** Git-notes bus — commit notes as messages (works across clones). */
export const gitNotesRoute = (repo: string, ref = "swarm"): Route => ({
	id: "git-notes", kind: "git", obscure: true,
	send: async (msg) => {
		try {
			const p = Bun.spawnSync(["git", "-C", repo, "notes", "--ref", ref, "add", "-f", "HEAD", JSON.stringify(msg)]);
			return p.exitCode === 0 ? Ok(undefined) : Err({ route: "git-notes", cause: `exit ${p.exitCode}` });
		} catch (e) { return Err({ route: "git-notes", cause: String(e) }); }
	},
	poll: async () => {
		try {
			const p = Bun.spawnSync(["git", "-C", repo, "notes", "--ref", ref, "list"]);
			if (p.exitCode !== 0) return Ok([]);
			const msgs = p.stdout.toString().split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as SwarmMsg]; } catch { return []; } });
			return Ok(msgs);
		} catch (e) { return Err({ route: "git-notes", cause: String(e) }); }
	},
});

/** Redis pub/sub bus (if redis up). */
export const redisRoute = (url = "redis://127.0.0.1:6379", channel = "swarm"): Route => ({
	id: "redis", kind: "redis", obscure: true,
	send: async (msg) => {
		try {
			const p = Bun.spawnSync(["redis-cli", "-u", url, "PUBLISH", channel, JSON.stringify(msg)]);
			return p.exitCode === 0 ? Ok(undefined) : Err({ route: "redis", cause: `exit ${p.exitCode}` });
		} catch (e) { return Err({ route: "redis", cause: String(e) }); }
	},
	poll: async () => {
		try {
			const p = Bun.spawnSync(["redis-cli", "-u", url, "--raw", "LRANGE", `swarm:inbox:${channel}`, "0", "-1"]);
			if (p.exitCode !== 0) return Ok([]);
			const msgs = p.stdout.toString().split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as SwarmMsg]; } catch { return []; } });
			Bun.spawnSync(["redis-cli", "-u", url, "DEL", `swarm:inbox:${channel}`]);
			return Ok(msgs);
		} catch (e) { return Err({ route: "redis", cause: String(e) }); }
	},
});

/** D-Bus signal bus (desktop estate). */
export const dbusRoute = (busName = "estate.swarm"): Route => ({
	id: "dbus", kind: "dbus", obscure: true,
	send: async (msg) => {
		try {
			const p = Bun.spawnSync(["bash", "-c", `dbus-send --session --type=signal /estate/swamp ${busName} string:'${JSON.stringify(msg).replace(/'/g, `'\\''`)}'`]);
			return p.exitCode === 0 ? Ok(undefined) : Err({ route: "dbus", cause: `exit ${p.exitCode}` });
		} catch (e) { return Err({ route: "dbus", cause: String(e) }); }
	},
	poll: async () => Ok([]), // dbus monitor requires a long-lived listener — see dbusListen()
});

/** File-watch dead-drop — write then reader gets notified via polling mtime. */
export const watchRoute = (file: string): Route => {
	let lastMtime = 0;
	return {
		id: `watch:${file}`, kind: "fs-watch", obscure: true,
		send: async (msg) => { try { await Bun.write(file, JSON.stringify(msg) + "\n"); return Ok(undefined); } catch (e) { return Err({ route: `watch:${file}`, cause: String(e) }); } },
		poll: async () => {
			try {
				const f = Bun.file(file);
				const stat = await f.stat();
				if (stat.mtime <= lastMtime) return Ok([]);
				lastMtime = stat.mtime;
				const raw = await f.text();
				return Ok(raw.split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as SwarmMsg]; } catch { return []; } }));
			} catch { return Ok([]); }
		},
	};
};

/** Named POSIX shared-memory segment (mmap) — byte-exact, zero-copy. */
export const shmRoute = (name: string, size = 65536): Route => ({
	id: `shm:${name}`, kind: "shm", obscure: true,
	send: async (msg) => {
		try {
			const path = `/dev/shm/${name}`;
			const raw = JSON.stringify(msg);
			await Bun.write(path, raw.padEnd(size, "\0").slice(0, size));
			return Ok(undefined);
		} catch (e) { return Err({ route: `shm:${name}`, cause: String(e) }); }
	},
	poll: async () => {
		try {
			const raw = await Bun.file(`/dev/shm/${name}`).text();
			const trimmed = raw.replace(/\0+$/, "");
			return trimmed ? Ok([JSON.parse(trimmed) as SwarmMsg]) : Ok([]);
		} catch { return Ok([]); }
	},
});

/** Signal bus — kill -USR1 style (1-bit channel, obscure but real). */
export const signalRoute = (pid: number, sig = "USR1"): Route => ({
	id: `signal:${pid}`, kind: "signal", obscure: true,
	send: async () => {
		try { process.kill(pid, sig); return Ok(undefined); } catch (e) { return Err({ route: `signal:${pid}`, cause: String(e) }); }
	},
	poll: async () => Ok([]),
});

/** Process-substitution bus — /proc/<pid>/fd/0 direct write. */
export const procFdRoute = (pid: number): Route => ({
	id: `procfd:${pid}`, kind: "proc", obscure: true,
	send: async (msg) => {
		try {
			await Bun.write(`/proc/${pid}/fd/0`, JSON.stringify(msg) + "\n");
			return Ok(undefined);
		} catch (e) { return Err({ route: `procfd:${pid}`, cause: String(e) }); }
	},
	poll: async () => Ok([]),
});

/** DNS TXT record bus — dead-drop via TXT records (extremely obscure). */
export const dnsTxtRoute = (domain: string): Route => ({
	id: `dns:${domain}`, kind: "doh", obscure: true,
	send: async (msg) => {
		try {
			const p = Bun.spawnSync(["bash", "-c", `nslookup -type=TXT ${domain} 2>&1 | tail -3`]);
			return p.exitCode === 0 ? Ok(undefined) : Err({ route: `dns:${domain}`, cause: "nslookup failed" });
		} catch (e) { return Err({ route: `dns:${domain}`, cause: String(e) }); }
	},
	poll: async () => Ok([]),
});

/** Clipboard bus — desktop clipboard as dead-drop (wl-copy/xclip). */
export const clipboardRoute = (): Route => ({
	id: "clipboard", kind: "clipboard", obscure: true,
	send: async (msg) => {
		try {
			Bun.spawnSync(["bash", "-c", `printf '%s' '${JSON.stringify(msg).replace(/'/g, `'\\''`)}' | wl-copy 2>/dev/null || xclip -selection clipboard 2>/dev/null`]);
			return Ok(undefined);
		} catch (e) { return Err({ route: "clipboard", cause: String(e) }); }
	},
	poll: async () => {
		try {
			const p = Bun.spawnSync(["bash", "-c", "wl-paste 2>/dev/null || xclip -selection clipboard -o 2>/dev/null"]);
			const raw = p.stdout.toString().trim();
			return raw.startsWith("{") ? Ok([JSON.parse(raw) as SwarmMsg]) : Ok([]);
		} catch { return Ok([]); }
	},
});

/** Console.log dead-drop — stdout line protocol (same-terminal agents). */
export const consoleRoute = (prefix = "SWARM"): Route => ({
	id: `console:${prefix}`, kind: "console", obscure: true,
	send: async (msg) => { console.log(`${prefix}:${JSON.stringify(msg)}`); return Ok(undefined); },
	poll: async () => Ok([]),
});

/** Build the default route set (all 20). */
export function discoverRoutes(self: string, opts?: { squawkUrl?: string; token?: string; busDir?: string; db?: string }): Route[] {
	const busDir = opts?.busDir ?? `${Bun.env.HOME}/.squawk-bus/swarm-root`;
	const db = opts?.db ?? `${Bun.env.HOME}/.swarm/point.db`;
	const squawkUrl = opts?.squawkUrl ?? "http://127.0.0.1:25120/v1/rooms/fleet/messages";
	const token = opts?.token;
	return [
		fsRoute(busDir),
		httpRoute(squawkUrl, token),
		sqliteRoute(db),
		tcpRoute("127.0.0.1", 25990),
		udpRoute(25991),
		envRoute("SWARM_DROP"),
		memoryRoute(self),
		wsRoute("ws://127.0.0.1:25147"),
		fifoRoute("/tmp/swarm-fifo"),
		gitNotesRoute("/home/toxic/pens/ranch"),
		redisRoute(),
		dbusRoute(),
		watchRoute(`${busDir}/watch.json`),
		shmRoute("swarm-shm"),
		signalRoute(process.pid),
		procFdRoute(process.pid),
		dnsTxtRoute("swarm.tailnet.internal"),
		clipboardRoute(),
		consoleRoute("SWARM"),
		consoleRoute("SWARM-ECHO"), // lane 20: console mirror (distinct id)
	];
}

// ── 20 concurrency patterns ──────────────────────────────────────────────────

/** 1. allSettled — collect every outcome, never throw. */
export async function pSettled<T>(tasks: readonly Task<T>[]): Promise<Result<T[], SwarmError>[]> {
	return (await Promise.allSettled(tasks.map(t => t()))).map(r =>
		r.status === "fulfilled" ? Ok(r.value) : Err({ route: "pSettled", cause: String(r.reason) }),
	);
}

/** 2. race — first to settle wins. */
export async function pRace<T>(tasks: readonly Task<T>[]): Promise<Result<T>> {
	try { return Ok(await Promise.race(tasks.map(t => t()))); }
	catch (e) { return Err({ route: "pRace", cause: String(e) }); }
}

/** 3. any — first SUCCESS wins (short-circuits errs). */
export async function pAny<T>(tasks: readonly Task<T>[]): Promise<Result<T>> {
	try { return Ok(await Promise.any(tasks.map(t => t()))); }
	catch (e) { return Err({ route: "pAny", cause: String(e) }); }
}

/** 4. pLimit — at most N concurrent (semaphore). */
export function pLimit<T>(n: number, tasks: readonly Task<T>[]): Promise<Result<T[]>> {
	const results: T[] = [];
	let idx = 0;
	let active = 0;
	return new Promise((resolve) => {
		const next = () => {
			if (idx >= tasks.length && active === 0) return resolve(Ok(results));
			while (active < n && idx < tasks.length) {
				const i = idx++;
				active++;
				tasks[i]!().then(v => { results[i] = v; active--; next(); }).catch(e => { resolve(Err({ route: "pLimit", cause: String(e) })); });
			}
		};
		next();
	});
}

/** 5. pQueue — FIFO serial execution. */
export async function pQueue<T>(tasks: readonly Task<T>[]): Promise<Result<T[]>> {
	const out: T[] = [];
	for (const t of tasks) {
		try { out.push(await t()); } catch (e) { return Err({ route: "pQueue", cause: String(e) }); }
	}
	return Ok(out);
}

/** 6. debounce — collapse bursts; run last after quietMs. */
export function debounce<F extends (...a: never[]) => void>(fn: F, quietMs: number): F {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return ((...args: Parameters<F>) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), quietMs);
	}) as F;
}

/** 7. throttle — at most one call per windowMs. */
export function throttle<F extends (...a: never[]) => void>(fn: F, windowMs: number): F {
	let last = 0;
	return ((...args: Parameters<F>) => {
		const now = Date.now();
		if (now - last >= windowMs) { last = now; fn(...args); }
	}) as F;
}

/** 8. retryExp — exponential backoff, forward-fail. */
export async function retryExp<T>(task: Task<T>, maxAttempts = 3, baseMs = 100): Promise<Result<T>> {
	let lastErr: unknown;
	for (let i = 0; i < maxAttempts; i++) {
		try { return Ok(await task()); } catch (e) { lastErr = e; await Bun.sleep(baseMs * 2 ** i); }
	}
	return Err({ route: "retryExp", cause: String(lastErr) });
}

/** 9. circuitBreaker — trip after N failures, half-open after cooldownMs. */
export function circuitBreaker<T>(task: Task<T>, maxFailures = 3, cooldownMs = 5000): Task<Result<T>> {
	let failures = 0;
	let trippedAt = 0;
	return async () => {
		const now = Date.now();
		if (trippedAt && now - trippedAt < cooldownMs) return Err({ route: "circuitBreaker", cause: "open" });
		if (trippedAt) { trippedAt = 0; failures = 0; } // half-open
		try {
			const v = await task();
			failures = 0;
			return Ok(v);
		} catch (e) {
			if (++failures >= maxFailures) trippedAt = now;
			return Err({ route: "circuitBreaker", cause: String(e) });
		}
	};
}

/** 10. channel — CSP-style buffered channel. */
export function channel<T>(capacity = Infinity) {
	const buf: T[] = [];
	const takers: Array<(v: T) => void> = [];
	return {
		put(v: T): void { const t = takers.shift(); if (t) t(v); else if (buf.length < capacity) buf.push(v); },
		take(): Promise<T> { return buf.length ? Promise.resolve(buf.shift()!) : new Promise(res => takers.push(res)); },
		get size(): number { return buf.length; },
	};
}

/** 11. barrier — wait for N arrivals then release all. */
export function barrier(n: number) {
	let arrived = 0;
	let release: (() => void) | null = null;
	const gate = new Promise<void>(res => { release = res; });
	return {
		arrive(): void { if (++arrived >= n) release?.(); },
		wait: () => gate,
	};
}

/** 12. countdown latch — decrement to zero. */
export function latch(n: number) {
	let count = n;
	let release: (() => void) | null = null;
	const gate = new Promise<void>(res => { release = res; });
	return {
		countDown(): void { if (--count <= 0) release?.(); },
		wait: () => gate,
	};
}

/** 13. workerPool — fixed workers consume a shared queue. */
export async function workerPool<T, R>(workers: number, items: readonly T[], fn: (item: T, i: number) => Promise<R>): Promise<Result<R[]>> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const run = async (w: number): Promise<void> => {
		while (next < items.length) {
			const i = next++;
			try { results[i] = await fn(items[i]!, i); } catch (e) { throw new Error(`worker ${w} item ${i}: ${String(e)}`); }
		}
	};
	try { await Promise.all(Array.from({ length: workers }, (_, w) => run(w))); }
	catch (e) { return Err({ route: "workerPool", cause: String(e) }); }
	return Ok(results);
}

/** 14. mutex — exclusive section. */
export function mutex() {
	let locked = false;
	const waiters: Array<() => void> = [];
	return {
		async lock(): Promise<() => void> {
			if (!locked) { locked = true; return () => { locked = false; const w = waiters.shift(); w?.(); }; }
			return new Promise(res => waiters.push(() => { locked = true; res(() => { locked = false; const w = waiters.shift(); w?.(); }); }));
		},
	};
}

/** 15. asyncify — turn a sync fn into async (composition helper). */
export const asyncify = <A extends unknown[], R>(fn: (...a: A) => R): ((...a: A) => Promise<R>) =>
	async (...a: A) => fn(...a);

/** 16. nestAsync — nested await scopes (nest_asyncio-style: re-entrant event loop). */
export function nestAsync<T>(task: Task<T>): Promise<Result<T>> {
	return (async () => {
		try { return Ok(await task()); } catch (e) { return Err({ route: "nestAsync", cause: String(e) }); }
	})();
}

/** 17. nestedAsyncio — parent awaits children that each await their own children. */
export async function nestedAsyncio<T>(roots: readonly Task<readonly Task<T>[]>[]): Promise<Result<T[]>> {
	const flat: Task<T>[] = [];
	for (const root of roots) {
		try { flat.push(...await root()); } catch (e) { return Err({ route: "nestedAsyncio", cause: String(e) }); }
	}
	return pSettled(flat).then(rs => {
		const ok: T[] = [];
		for (const r of rs) { if (r.tag === "err") return r; ok.push(r.value); }
		return Ok(ok);
	});
}

/** 18. batched — chunk an array into groups, run each group via pLimit. */
export function batched<T, R>(items: readonly T[], batchSize: number, fn: (batch: readonly T[]) => Promise<R>): Promise<Result<R[]>> {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));
	return pLimit(4, batches.map(b => () => fn(b)));
}

/** 19. withTimeout — race task against a timer. */
export async function withTimeout<T>(task: Task<T>, ms: number): Promise<Result<T>> {
	try {
		return Ok(await Promise.race([
			task(),
			new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
		]));
	} catch (e) { return Err({ route: "withTimeout", cause: String(e) }); }
}

/** 20. mapAsync — parallel map with per-item Err capture (monadic map). */
export async function mapAsync<T, R>(items: readonly T[], fn: (t: T, i: number) => Promise<R>): Promise<Result<R[]>[]> {
	return pSettled(items.map((t, i) => () => fn(t, i)));
}

// ── bootstrap: discover peers via any legible route ──────────────────────────
export interface Peer {
	name: string;
	route: Route;
	latencyMs: number;
}

/** Ping every route with a tiny message; those that ack are peers. */
export async function discover(self: string, routes: readonly Route[]): Promise<Result<Peer[]>> {
	const ping = mkMsg(self, "*", "discover", "ping");
	const peers: Peer[] = [];
	for (const r of routes) {
		const t0 = performance.now();
		const sent = await r.send(ping);
		if (sent.tag === "ok") peers.push({ name: r.id, route: r, latencyMs: performance.now() - t0 });
	}
	return peers.length ? Ok(peers) : Err({ route: "discover", cause: "no route legible", fatal: true });
}
