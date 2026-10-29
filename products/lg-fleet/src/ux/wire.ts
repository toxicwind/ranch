/** @slate/ux — wire: IPTV-BRIDGE → SLATE UI data contract. */

export interface LiveChannel {
	id: string;
	name: string;
	streamUrl: string;
	logo?: string;
}

/** Fetch the live channel list from the bridge manifest; throws on malformed payload. */
export async function fetchLiveChannels(
	fetchJson: (url: string) => Promise<unknown>,
	manifestUrl: string,
): Promise<LiveChannel[]> {
	const raw = await fetchJson(manifestUrl);
	const isObj = raw !== null && typeof raw === "object";
	const channels = isObj ? (raw as { channels?: unknown }).channels : undefined;
	if (!Array.isArray(channels)) throw new Error(`bridge manifest malformed: ${manifestUrl}`);
	return channels.map(c => {
		const o = c as Record<string, unknown>;
		return {
			id: String(o.id ?? ""),
			name: String(o.name ?? ""),
			streamUrl: String(o.streamUrl ?? ""),
			logo: o.logo === undefined ? undefined : String(o.logo),
		};
	});
}

/** Map channels + an EPG map into EPG-rail render items (now-airing per channel). */
export function toEpgItems(
	channels: readonly LiveChannel[],
	epg: Map<string, { title: string; start: number; end: number; channelId: string; id: string; description: string }[]>,
	atMs: number,
): Array<{ id: string; title: string; logo?: string; now?: string; progress: number; channelId: string }> {
	return channels.map(c => {
		const list = (epg.get(c.id) ?? []).sort((a, b) => a.start - b.start);
		const now = list.find(p => p.start <= atMs && atMs < p.end);
		const progress = now ? (atMs - now.start) / (now.end - now.start) : 0;
		return {
			id: c.id,
			title: c.name,
			logo: c.logo,
			channelId: c.id,
			now: now?.title,
			progress: Math.max(0, Math.min(1, progress)),
		};
	});
}
