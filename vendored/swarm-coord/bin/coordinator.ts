#!/usr/bin/env bun
/**
 * coordinator.ts — Swarm file-bus hub with single-writer invariant guards,
 * dead-letter routing, and squawk event bridging.
 *
 * Architecture Invariants:
 * - Only agent-N writes agent-N/outbox.jsonl.
 * - Only coordinator writes agent-N/inbox.jsonl and bus/messages.jsonl.
 * - All frame routing is idempotent (seen-set warmed from bus on cold start).
 * - Unroutable messages route to bus/dead-letter.jsonl with structured error receipt.
 */

import { watch } from "node:fs/promises";
import { join } from "node:path";
import type { SwarmFrame } from "../src/protocol.ts";
import {
	ROOT,
	AGENT_DIRS,
	BUS_FILE,
	computeAgentDir,
	loadFramesDetailed,
	appendFrameAtomic,
	emitInbox,
	emitDeadLetter,
	Result,
} from "../src/protocol.ts";
import { postFrame } from "./squawk-bridge.ts";

interface SeenStore {
	bySource: Map<string, Set<string>>;
}

const seen: SeenStore = { bySource: new Map() };

function markSeen(frame: SwarmFrame): void {
	const set = seen.bySource.get(frame.from) ?? new Set<string>();
	set.add(frame.id);
	seen.bySource.set(frame.from, set);
}

function isSeen(frame: SwarmFrame): boolean {
	return seen.bySource.get(frame.from)?.has(frame.id) ?? false;
}

/** Append a frame to the bus (idempotent by id), returning true if new. */
async function publish(frame: SwarmFrame): Promise<boolean> {
	if (isSeen(frame)) return false;

	const success = await appendFrameAtomic(BUS_FILE, frame);
	if (success) {
		markSeen(frame);
		// Announce to squawk asynchronously (anti-blocking)
		void postFrame(frame).catch(() => {});
		return true;
	}
	return false;
}

/** Deliver a frame into target inboxes or route to dead-letter. */
async function route(frame: SwarmFrame): Promise<void> {
	if (frame.to === "all") {
		// Broadcast to all known agents except sender
		const targets = AGENT_DIRS.filter(a => a !== frame.from);
		for (const agent of targets) {
			await emitInbox(agent, frame);
		}
		return;
	}

	if (frame.to === "coordinator" || frame.to === "system") {
		// System-level consumption; already published to bus
		return;
	}

	if (AGENT_DIRS.includes(frame.to)) {
		await emitInbox(frame.to, frame);
	} else {
		// Unroutable destination: dead-letter store
		console.warn(`[coordinator] Unroutable destination '${frame.to}' for frame ${frame.id}. Diverting to dead-letter.`);
		await emitDeadLetter(frame, `NO_SUCH_AGENT_${frame.to}`);

		// Return error ack to sender
		if (AGENT_DIRS.includes(frame.from)) {
			const errorAck: SwarmFrame = {
				id: `dlq-${crypto.randomUUID().slice(0, 8)}`,
				from: "coordinator",
				to: frame.from,
				kind: "error",
				payload: {
					task: frame.id,
					error: `Destination '${frame.to}' is unroutable`,
					ackOf: frame.id,
				},
				ts: new Date().toISOString(),
			};
			await emitInbox(frame.from, errorAck);
		}
	}
}

async function drainOutbox(agent: string): Promise<number> {
	const outboxPath = join(computeAgentDir(agent), "outbox.jsonl");
	const { frames, warnings } = await loadFramesDetailed(outboxPath);

	if (warnings.length > 0) {
		console.warn(`[coordinator] Outbox ${agent} had ${warnings.length} unparseable lines skipped.`);
	}

	let routedCount = 0;
	for (const frame of frames) {
		const isNew = await publish(frame);
		if (isNew) {
			await route(frame);
			routedCount += 1;
		}
	}

	return routedCount;
}

async function drainAll(): Promise<void> {
	for (const agent of AGENT_DIRS) {
		await drainOutbox(agent);
	}
}

const DEBOUNCE_MS = 150;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDrain(): void {
	if (drainTimer) return;
	drainTimer = setTimeout(async () => {
		drainTimer = null;
		await drainAll();
	}, DEBOUNCE_MS);
}

async function main(): Promise<void> {
	console.log(`[coordinator] Booting swarm coordinator hub...`);

	// 1. Warm idempotency cache from existing bus
	const { frames: busFrames } = await loadFramesDetailed(BUS_FILE);
	for (const frame of busFrames) {
		markSeen(frame);
	}
	console.log(`[coordinator] Warmed seen-cache with ${busFrames.length} historical frames.`);

	// 2. Initial drain of all outboxes
	await drainAll();

	// 3. Watch each agent outbox
	const cleanupFns: Array<() => void> = [];
	for (const agent of AGENT_DIRS) {
		const outboxPath = join(computeAgentDir(agent), "outbox.jsonl");
		try {
			const watcher = watch(outboxPath, { persistent: true });
			watcher.on("change", scheduleDrain);
			watcher.on("error", scheduleDrain);
			cleanupFns.push(() => watcher.close());
		} catch {
			// Outbox file may not exist yet
		}
	}

	const onShutdown = (): void => {
		console.log(`[coordinator] Shutting down.`);
		for (const close of cleanupFns) close();
		process.exit(0);
	};

	process.on("SIGINT", onShutdown);
	process.on("SIGTERM", onShutdown);
	process.on("SIGHUP", onShutdown);

	console.log(`[coordinator] Online. Monitoring ${AGENT_DIRS.join(", ")}.`);
	await Bun.sleep(Number.MAX_SAFE_INTEGER);
}

if (import.meta.main) {
	await main();
}
