/**
 * EPG rails — channel lineup with now/next programs, sorted by channel
 * number. Pure; the render layer paints rails horizontally.
 */

import type { Program, EPGRail } from "./types";

export interface EPGState {
	rails: EPGRail[];
	byChannel: Map<string, EPGRail>;
}

export function createEPG(programs: Program[]): EPGState {
	const byCh = new Map<string, Program[]>();
	for (const p of programs) {
		if (!p.channelId) continue;
		const arr = byCh.get(p.channelId) ?? [];
		arr.push(p);
		byCh.set(p.channelId, arr);
	}

	const channelIds = Array.from(byCh.keys()).sort();
	const rails: EPGRail[] = [];
	let channelNumber = 1;
	for (const channelId of channelIds) {
		const progs = byCh.get(channelId)!;
		progs.sort((a, b) => a.startMs - b.startMs);
		const now = progs.find(
			(p) => p.startMs <= Date.now() && Date.now() < p.endMs,
		);
		const nextIdx = progs.findIndex((p) => p.startMs > Date.now());
		const next = nextIdx >= 0 ? progs[nextIdx] : undefined;
		rails.push({
			channelId,
			channelNumber: channelNumber++,
			channelName: progs[0]?.title ?? channelId,
			now,
			next,
			programs: progs,
		});
	}

	const byChannel = new Map(rails.map((r) => [r.channelId, r]));
	return { rails, byChannel };
}

export function getRail(state: EPGState, channelId: string): EPGRail | undefined {
	return state.byChannel.get(channelId);
}

export function nowNextFor(state: EPGState, channelId: string) {
	const rail = state.byChannel.get(channelId);
	return rail ? { now: rail.now, next: rail.next } : { now: undefined, next: undefined };
}
