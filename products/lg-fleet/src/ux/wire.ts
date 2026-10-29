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

/**
 * Bridge catalog adapter — IPTV-BRIDGE serves the Stremio contract:
 * GET {bridge}/catalog/{type}/{id}.json → { metas: [{id, name, poster, ...}] }.
 * Maps metas into LiveChannel for the rails (poster→logo).
 */
export async function fetchLiveChannelsFromCatalog(
	fetchJson: (url: string) => Promise<unknown>,
	catalogUrl: string,
): Promise<LiveChannel[]> {
	const raw = await fetchJson(catalogUrl);
	const isObj = raw !== null && typeof raw === "object";
	const metas = isObj ? (raw as { metas?: unknown }).metas : undefined;
	if (!Array.isArray(metas)) throw new Error(`bridge catalog malformed: ${catalogUrl}`);
	return metas.map(m => {
		const o = m as Record<string, unknown>;
		return {
			id: String(o.id ?? ""),
			name: String(o.name ?? ""),
			streamUrl: String(o.stream ?? o.url ?? ""),
			logo: o.poster === undefined ? undefined : String(o.poster),
		};
	});
}

/**
 * Hero rotation — metas carrying a `background` (TMDB/xtream backdrop) become
 * hero-eligible; index wraps. Placeholder art is only a fallback, never a hero.
 */
export interface HeroPick { id: string; name: string; backdrop: string }
export function pickHero(
	metas: readonly Record<string, unknown>[],
	index: number,
): HeroPick | undefined {
	const eligible = metas
		.map(m => ({ id: String(m.id ?? ""), name: String(m.name ?? ""), backdrop: m.background === undefined ? "" : String(m.background) }))
		.filter(m => m.backdrop.length > 0);
	if (eligible.length === 0) return undefined;
	return eligible[index % eligible.length];
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
