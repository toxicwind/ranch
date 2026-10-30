/**
 * Hero billboard carousel — the Netflix "big hero image" that autoplays
 * previews and cycles featured content. Pure state machine; render layer is
 * the consumer's responsibility (React/preact/vanilla DOM).
 */

import type { Program, Billboard } from "./types";

export interface BillboardState extends Billboard {
	elapsedMs: number; // ms since last autoplay tick
}

export function createBillboard(
	items: Program[],
	opts: { autoplay?: boolean; intervalMs?: number; startIndex?: number } = {},
): BillboardState {
	const index = clamp(opts.startIndex ?? 0, 0, Math.max(0, items.length - 1));
	return {
		items,
		index,
		autoplay: opts.autoplay ?? true,
		intervalMs: opts.intervalMs ?? 6000,
		elapsedMs: 0,
	};
}

export function tickBillboard(state: BillboardState, dtMs: number): BillboardState {
	if (state.items.length === 0) return state;
	const next = { ...state, elapsedMs: state.elapsedMs + dtMs };
	if (!state.autoplay) return next;
	if (next.elapsedMs >= next.intervalMs) {
		next.elapsedMs = 0;
		next.index = (next.index + 1) % next.items.length;
	}
	return next;
}

export function selectBillboardItem(
	state: BillboardState,
	index: number,
): BillboardState {
	if (index < 0 || index >= state.items.length) return state;
	return { ...state, index, autoplay: false }; // user selection pauses autoplay
}

export function currentBillboardItem(state: BillboardState): Program | undefined {
	return state.items[state.index];
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}
