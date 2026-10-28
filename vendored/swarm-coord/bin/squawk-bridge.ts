#!/usr/bin/env bun
/**
 * squawk-bridge.ts — Bridge swarm bus events to the estate squawk daemon.
 *
 * Implements strict Anti-IRC Storm Controls:
 * - Rate limiting: 1 message per 2 seconds per agent, burst capacity of 5.
 * - Loop detection: Sliding 60s window detecting duplicate payloads (>10 triggers alert & circuit trip).
 * - Bounded retry queue: bus/squawk-outbox.jsonl capped at 500 lines, pruning oldest non-critical entries.
 */

import { join } from "node:path";
import type { SwarmFrame } from "../src/protocol.ts";
import {
	ROOT,
	appendFrameAtomic,
	loadFramesDetailed,
	Result,
	Option,
	Some,
	None,
} from "../src/protocol.ts";

const SQUAWK_URL = `http://127.0.0.1:${process.env.SQUAWK_CHAT_PORT || "25120"}`;
const TOKEN_FILE = `${process.env.HOME || "/home/toxic"}/.config/estate-chat-token`;
const OUTBOX_FILE = join(ROOT, "bus", "squawk-outbox.jsonl");

const MAX_QUEUE_LINES = 500;
const PRUNE_QUEUE_LINES = 250;

// ── Rate Limiter (Token Bucket per Agent) ───────────────────────────────────

interface TokenBucket {
	tokens: number;
	lastRefillMs: number;
}

const BUCKET_BURST = 5;
const REFILL_INTERVAL_MS = 2000; // 1 token every 2s
const agentBuckets = new Map<string, TokenBucket>();

function checkRateLimit(agent: string): boolean {
	const now = Date.now();
	let bucket = agentBuckets.get(agent);
	if (!bucket) {
		bucket = { tokens: BUCKET_BURST, lastRefillMs: now };
		agentBuckets.set(agent, bucket);
	} else {
		const elapsed = now - bucket.lastRefillMs;
		const addedTokens = Math.floor(elapsed / REFILL_INTERVAL_MS);
		if (addedTokens > 0) {
			bucket.tokens = Math.min(BUCKET_BURST, bucket.tokens + addedTokens);
			bucket.lastRefillMs = now;
		}
	}

	if (bucket.tokens > 0) {
		bucket.tokens -= 1;
		return true; // allowed
	}
	return false; // throttled
}

// ── Loop Detector (Sliding 60s Window) ──────────────────────────────────────

interface PayloadEntry {
	payloadText: string;
	timestampMs: number;
}

const LOOP_WINDOW_MS = 60_000;
const LOOP_THRESHOLD = 10;
const agentHistory = new Map<string, PayloadEntry[]>();
const trippedAgents = new Set<string>();

function detectLoop(agent: string, payloadText: string): boolean {
	const now = Date.now();
	const entries = (agentHistory.get(agent) ?? []).filter(e => now - e.timestampMs < LOOP_WINDOW_MS);
	entries.push({ payloadText, timestampMs: now });
	agentHistory.set(agent, entries);

	const matchCount = entries.filter(e => e.payloadText === payloadText).length;
	if (matchCount > LOOP_THRESHOLD) {
		trippedAgents.add(agent);
		return true; // Loop detected!
	}
	return false;
}

export function resetAgentCircuit(agent: string): void {
	trippedAgents.delete(agent);
	agentHistory.delete(agent);
}

// ── Auth & Message Formatting ──────────────────────────────────────────────

async function getAuthToken(): Promise<string> {
	const res = await Result.fromAsyncThrowable(async () => {
		const file = Bun.file(TOKEN_FILE);
		return (await file.text()).trim();
	})();
	return Result.unwrapOr(res, "");
}

function formatBody(frame: SwarmFrame): string {
	const who = frame.from;
	const p = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));
	switch (frame.kind) {
		case "init":
			return `[swarm-init] ${p(frame.payload)}`;
		case "task":
			return `[swarm-task] ${who} -> ${frame.to}: ${p(frame.payload)}`;
		case "result":
			return `[swarm-result] ${who} -> ${frame.to}: ${p(frame.payload)}`;
		case "error":
			return `[swarm-error] ${who} reported: ${p(frame.payload)}`;
		case "chat":
			return `[swarm-chat] <${who}> ${p(frame.payload)}`;
		case "ack":
			return `[swarm-ack] ${who} acknowledged ${p(frame.payload)}`;
		default:
			return `[swarm-${frame.kind}] ${who}: ${p(frame.payload)}`;
	}
}

/** POST one event body to squawk rooms; true if any room accepted. */
async function sendToSquawk(fromAgent: string, body: string): Promise<boolean> {
	const token = await getAuthToken();
	if (!token) return false;

	for (const room of ["general", "main", "village"]) {
		const sendRes = await Result.fromAsyncThrowable(async () => {
			const res = await fetch(`${SQUAWK_URL}/v1/rooms/${room}/messages`, {
				method: "POST",
				headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
				body: JSON.stringify({ from_agent: fromAgent, body, kind: "chat" }),
				signal: AbortSignal.timeout(3000),
			});
			return res.ok;
		})();

		if (sendRes.ok && sendRes.value) return true;
	}
	return false;
}

// ── Queue Management & Pruning ─────────────────────────────────────────────

async function reloadQueue(): Promise<SwarmFrame[]> {
	const { frames } = await loadFramesDetailed(OUTBOX_FILE);
	return frames;
}

async function pruneOutbox(): Promise<void> {
	const items = await reloadQueue();
	if (items.length <= MAX_QUEUE_LINES) return;

	// Keep critical events (task, result, error) preferentially
	const critical = items.filter(f => ["task", "result", "error"].includes(f.kind));
	const nonCritical = items.filter(f => !["task", "result", "error"].includes(f.kind));

	const kept = [...critical, ...nonCritical.slice(-Math.max(0, PRUNE_QUEUE_LINES - critical.length))].slice(
		-PRUNE_QUEUE_LINES,
	);

	await Bun.write(OUTBOX_FILE, kept.map(f => JSON.stringify(f)).join("\n") + "\n");
}

/** Post a frame to squawk with anti-loop, rate-limit, and spool fallback. */
export async function postFrame(frame: SwarmFrame): Promise<boolean> {
	if (trippedAgents.has(frame.from)) {
		console.warn(`[squawk-bridge] Circuit tripped for agent ${frame.from}; dropping broadcast.`);
		return false;
	}

	const payloadStr = JSON.stringify(frame.payload ?? "");
	if (detectLoop(frame.from, payloadStr)) {
		console.error(`[squawk-bridge] ALERT: Loop detected for ${frame.from} (>10 repeats in 60s). Halting queue.`);
		await sendToSquawk("system", `[ALERT] Swarm loop breaker tripped for ${frame.from}. Broadcasts throttled.`);
		return false;
	}

	if (!checkRateLimit(frame.from)) {
		// Rate limit reached: enqueue for paced delivery
		await appendFrameAtomic(OUTBOX_FILE, frame);
		await pruneOutbox();
		return false;
	}

	const body = formatBody(frame);
	if (await sendToSquawk(frame.from, body)) return true;

	// Squawk unreachable: spool to outbox
	await appendFrameAtomic(OUTBOX_FILE, frame);
	await pruneOutbox();
	return false;
}

/** Flush queued frames once squawk is back. */
export async function flushQueue(): Promise<number> {
	const items = await reloadQueue();
	if (items.length === 0) return 0;

	let sent = 0;
	const remaining: SwarmFrame[] = [];

	for (const frame of items) {
		if (trippedAgents.has(frame.from)) {
			remaining.push(frame);
			continue;
		}

		if (!checkRateLimit(frame.from)) {
			remaining.push(frame);
			continue;
		}

		const body = formatBody(frame);
		if (await sendToSquawk(frame.from, body)) {
			sent += 1;
		} else {
			remaining.push(frame);
		}
	}

	await Bun.write(
		OUTBOX_FILE,
		remaining.map(f => JSON.stringify(f)).join("\n") + (remaining.length ? "\n" : ""),
	);
	return sent;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.includes("--flush")) {
		console.log(`[squawk-bridge] flushed ${await flushQueue()} queued messages`);
	} else {
		const ok = await sendToSquawk("swarm-test", args.join(" ") || "swarm test ping");
		console.log(`[squawk-bridge] test message sent: ${ok}`);
	}
}
