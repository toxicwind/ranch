/** @slate/ux — EPG rail: live channels with now/next (the primitive LoomTV lacks). */

export interface EpgProgram {
	id: string;
	channelId: string;
	title: string;
	description: string;
	start: number;
	end: number;
}

export interface EpgChannel {
	id: string;
	name: string;
	programs: readonly EpgProgram[];
}

export interface EpgRailItem {
	id: string;
	name: string;
	now?: EpgProgram;
	next?: EpgProgram;
	progressFraction?: number;
}

/** Build rail items with now/next per channel at instant `atMs`. */
export function epgRailItems(channels: readonly EpgChannel[], atMs: number): EpgRailItem[] {
	return channels.map(channel => {
		const sorted = [...channel.programs].sort((a, b) => a.start - b.start);
		const now = sorted.find(p => p.start <= atMs && atMs < p.end);
		const next = now ? sorted.find(p => p.start >= now.end) : sorted.find(p => p.start > atMs);
		const progressFraction = now ? Math.min(1, Math.max(0, (atMs - now.start) / (now.end - now.start))) : undefined;
		return { id: channel.id, name: channel.name, now, next, progressFraction };
	});
}
