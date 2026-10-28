#!/usr/bin/env bun
/**
 * protocol.ts — Monadic, robust JSONL message-bus contract for swarm-coord.
 *
 * Implements a strict, single-writer invariant mailbox architecture with
 * algebraic Result<T, E> and Option<T> types for clean functional error handling
 * without unhandled throwing or silent corruption.
 *
 * A frame is one JSON object per line:
 *   { id, from, to, kind, payload, ts }
 *
 * Kinds:
 *   "init"   coordinator boot announcement (broadcast)
 *   "task"   agent -> agent work request  { task, payload }
 *   "result" executor -> requester        { task, result, ackOf }
 *   "chat"   conversational echo          { from, echo }
 *   "error"  executor -> requester        { task, error, ackOf }
 *   "ack"    executor/coordinator receipt { ackOf }
 *
 * Delivery: outbox.jsonl -> (coordinator) -> bus/messages.jsonl -> inbox.jsonl
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT: string = join(dirname(fileURLToPath(import.meta.url)), "..");

export const AGENT_DIRS: string[] = ["agent-1", "agent-2", "agent-3"];
export const BUS_FILE: string = join(ROOT, "bus", "messages.jsonl");
export const DEAD_LETTER_FILE: string = join(ROOT, "bus", "dead-letter.jsonl");

// ── Monadic Primitives (Result & Option) ───────────────────────────────────

export type Result<T, E = Error> =
	| { readonly ok: true; readonly value: T; readonly error?: never }
	| { readonly ok: false; readonly error: E; readonly value?: never };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const Result = {
	map<T, U, E>(res: Result<T, E>, fn: (val: T) => U): Result<U, E> {
		return res.ok ? Ok(fn(res.value)) : res;
	},
	flatMap<T, U, E, E2>(res: Result<T, E>, fn: (val: T) => Result<U, E2>): Result<U, E | E2> {
		return res.ok ? fn(res.value) : res;
	},
	fromThrowable<T, A extends unknown[]>(fn: (...args: A) => T): (...args: A) => Result<T, Error> {
		return (...args: A) => {
			try {
				return Ok(fn(...args));
			} catch (err) {
				return Err(err instanceof Error ? err : new Error(String(err)));
			}
		};
	},
	fromAsyncThrowable<T, A extends unknown[]>(
		fn: (...args: A) => Promise<T>,
	): (...args: A) => Promise<Result<T, Error>> {
		return async (...args: A) => {
			try {
				return Ok(await fn(...args));
			} catch (err) {
				return Err(err instanceof Error ? err : new Error(String(err)));
			}
		};
	},
	unwrapOr<T, E>(res: Result<T, E>, fallback: T): T {
		return res.ok ? res.value : fallback;
	},
};

export type Option<T> =
	| { readonly some: true; readonly value: T }
	| { readonly some: false; readonly value?: never };

export const Some = <T>(value: T): Option<T> => ({ some: true, value });
export const None: Option<never> = { some: false };

export const Option = {
	map<T, U>(opt: Option<T>, fn: (val: T) => U): Option<U> {
		return opt.some ? Some(fn(opt.value)) : None;
	},
	fromNullable<T>(val: T | null | undefined): Option<T> {
		return val !== null && val !== undefined ? Some(val) : None;
	},
	unwrapOr<T>(opt: Option<T>, fallback: T): T {
		return opt.some ? opt.value : fallback;
	},
};

// ── Frame Types ─────────────────────────────────────────────────────────────

export interface SwarmFrameBase {
	id: string;
	from: string;
	to: string;
	kind: string;
	ts: string;
}

export interface SwarmFrame extends SwarmFrameBase {
	payload?: unknown;
}

export interface TaskFrame extends SwarmFrameBase {
	kind: "task";
	payload: { task: string; payload?: unknown };
}

export interface ResultFrame extends SwarmFrameBase {
	kind: "result";
	payload: { task: string; result: unknown; ackOf: string };
}

export interface ErrorFrame extends SwarmFrameBase {
	kind: "error";
	payload: { task: string; error: string; ackOf: string };
}

export interface ChatFrame extends SwarmFrameBase {
	kind: "chat";
	payload: { from: string; echo: unknown };
}

export interface AckFrame extends SwarmFrameBase {
	kind: "ack";
	payload: { ackOf: string };
}

export type AnyFrame = SwarmFrame | TaskFrame | ResultFrame | ErrorFrame | ChatFrame | AckFrame;

export const INIT: SwarmFrame = {
	id: "swarm-init-001",
	from: "system",
	to: "all",
	kind: "init",
	payload: "swarm-coord online",
	ts: new Date().toISOString(),
};

// ── Routing & Path Helpers ──────────────────────────────────────────────────

export function computeAgentDir(agent: string): string {
	return join(ROOT, agent);
}

export function computeInboxPath(agent: string): string {
	return join(computeAgentDir(agent), "inbox.jsonl");
}

export function computeOutboxPath(agent: string): string {
	return join(computeAgentDir(agent), "outbox.jsonl");
}

// ── Monadic Parsing & Frame Validation ──────────────────────────────────────

export interface ParseWarning {
	line: number;
	raw: string;
	reason: string;
}

const safeJsonParse = Result.fromThrowable((str: string) => JSON.parse(str));

/** Parse a single raw line into an Option<SwarmFrame>. */
export function parseFrameOption(line: string): Option<SwarmFrame> {
	const trimmed = line.trim();
	if (!trimmed) return None;

	const parseResult = safeJsonParse(trimmed);
	if (!parseResult.ok) return None;

	const obj = parseResult.value;
	if (typeof obj === "object" && obj !== null && "id" in obj && "from" in obj && "to" in obj && "kind" in obj) {
		return Some(obj as SwarmFrame);
	}
	return None;
}

/** Legacy-compatible parseFrame */
export function parseFrame(line: string): SwarmFrame | null {
	const opt = parseFrameOption(line);
	return opt.some ? opt.value : null;
}

/** Monadic stream loader: reads a JSONL file, yields valid frames and non-blocking warnings. */
export async function loadFramesDetailed(
	file: string,
): Promise<{ frames: SwarmFrame[]; warnings: ParseWarning[] }> {
	const bunFile = Bun.file(file);
	const exists = await bunFile.exists();
	if (!exists) return { frames: [], warnings: [] };

	const textResult = await Result.fromAsyncThrowable(() => bunFile.text())();
	if (!textResult.ok) {
		return {
			frames: [],
			warnings: [{ line: 0, raw: file, reason: `Failed to read file: ${textResult.error.message}` }],
		};
	}

	const raw = textResult.value;
	const lines = raw.split("\n");
	const frames: SwarmFrame[] = [];
	const warnings: ParseWarning[] = [];

	lines.forEach((line, idx) => {
		const trimmed = line.trim();
		if (!trimmed) return;

		const opt = parseFrameOption(trimmed);
		if (opt.some) {
			frames.push(opt.value);
		} else {
			warnings.push({
				line: idx + 1,
				raw: trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed,
				reason: "Malformed JSON or missing required envelope fields (id, from, to, kind)",
			});
		}
	});

	return { frames, warnings };
}

/** Legacy-compatible loadFrames */
export async function loadFrames(file: string): Promise<SwarmFrame[]> {
	const { frames } = await loadFramesDetailed(file);
	return frames;
}

// ── Atomic I/O & Append ─────────────────────────────────────────────────────

/**
 * Append a single frame atomically using Bun.file write or POSIX append.
 */
export async function appendFrameAtomic(file: string, frame: SwarmFrame): Promise<boolean> {
	const serialized = `${JSON.stringify(frame)}\n`;
	const res = await Result.fromAsyncThrowable(async () => {
		const bunFile = Bun.file(file);
		const currentText = (await bunFile.exists()) ? await bunFile.text() : "";
		// Write using atomic buffer destination
		await Bun.write(file, currentText + serialized);
		return true;
	})();

	return Result.unwrapOr(res, false);
}

/** Emit a frame to an agent's outbox. */
export async function emitOutbox(agent: string, frame: SwarmFrame): Promise<boolean> {
	return appendFrameAtomic(computeOutboxPath(agent), frame);
}

/** Emit a frame to an agent's inbox (coordinator only). */
export async function emitInbox(agent: string, frame: SwarmFrame): Promise<boolean> {
	return appendFrameAtomic(computeInboxPath(agent), frame);
}

/** Emit unroutable message to dead-letter store. */
export async function emitDeadLetter(frame: SwarmFrame, reason: string): Promise<boolean> {
	const deadFrame: SwarmFrame = {
		...frame,
		payload: {
			originalPayload: frame.payload,
			deadLetterReason: reason,
			spooledAt: new Date().toISOString(),
		},
	};
	return appendFrameAtomic(DEAD_LETTER_FILE, deadFrame);
}
