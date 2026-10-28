#!/usr/bin/env bun
// swarm.ts — one swarm agent.
//
// Runs the coordinator loop for a single agent: reads frames off its own
// inbox, executes recognized tasks (echo/upper/reverse — the demo handshake),
// and emits results back through its outbox as result/chat frames. Also posts
// chat frames to squawk via bin/squawk-bridge.ts when the agent is told to.
//
// Usage: bun bin/swarm.ts <agent-name> [--squawk-room <room>]
//
// The agent is intentionally dumb-execute: it proves the transport, not
// intelligence. Real workloads plug a model/tool executor into `TASKS`.

import { appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadFrames } from "../src/protocol.ts";
import { ROOT, AGENT_DIRS, computeAgentDir, INIT } from "../src/protocol.ts";

const here = dirname(fileURLToPath(import.meta.url));

// ── agent identity ───────────────────────────────────────────────────────────
const name = process.argv[2];
if (!name || !AGENT_DIRS.includes(name)) {
	console.error(`usage: bun bin/swarm.ts <agent-name>  (one of ${AGENT_DIRS.join(", ")})`);
	process.exit(1);
}
const myDir = computeAgentDir(name);
const inboxPath = join(myDir, "inbox.jsonl");
const outboxPath = join(myDir, "outbox.jsonl");

// ── task executor: prove the round-trip, no model needed ─────────────────────
const TASKS: Record<string, (payload: unknown) => unknown> = {
	echo: (p) => p,
	upper: (p) => (typeof p === "string" ? p.toUpperCase() : p),
	reverse: (p) => (typeof p === "string" ? [...p].reverse().join("") : p),
};

function executeTask(task: string, payload: unknown): unknown {
	const fn = TASKS[task];
	if (!fn) throw new Error(`unknown task '${task}' (known: ${Object.keys(TASKS).join(", ")})`);
	return fn(payload);
}

// ── outbox emit ───────────────────────────────────────────────────────────────
let seq = 0;
async function emit(kind: string, to: string, payload: unknown): Promise<void> {
	seq += 1;
	const frame = {
		id: `${name}-${Date.now()}-${seq}`,
		from: name,
		to,
		kind,
		payload,
		ts: new Date().toISOString(),
	};
	await appendFile(outboxPath, `${JSON.stringify(frame)}\n`, { flag: "a" });
}

// ── inbox loop ────────────────────────────────────────────────────────────────
const handled = new Set<string>();

async function processFrame(frame: { id: string; from: string; to: string; kind: string; payload?: unknown }): Promise<void> {
	if (handled.has(frame.id)) return; // idempotent
	handled.add(frame.id);

	if (frame.kind === "task") {
		const task = typeof frame.payload?.task === "string" ? frame.payload.task : "";
		const payload = frame.payload?.payload;
		try {
			const result = executeTask(task, payload);
			await emit("result", frame.from, { task, result, ackOf: frame.id });
		} catch (err) {
			await emit("error", frame.from, { task, error: String(err), ackOf: frame.id });
		}
	} else if (frame.kind === "chat") {
		// A chat frame to us is a broadcast ping; echo it back as chat so the
		// coordinator/stdout shows the conversation (durable mailbox, not live IRC).
		await emit("chat", "all", { from: name, echo: frame.payload });
	}
}

async function drainOnce(): Promise<void> {
	try {
		const frames = await loadFrames(inboxPath);
		for (const frame of frames) await processFrame(frame);
	} catch {
		// inbox missing — wait for first delivery
	}
}

const POLL_MS = 500;
console.log(`[swarm-agent:${name}] inbox=${inboxPath} outbox=${outboxPath} — waiting for tasks`);
for (;;) {
	await drainOnce();
	await Bun.sleep(POLL_MS);
}