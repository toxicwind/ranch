// TDD: data wire — SLATE fetches channels from IPTV-BRIDGE and renders EPG rail.
// Contract: GET {bridge}/stream/live.json → { channels: [{id,name,streamUrl,logo}] }
// Failing first: the wire module doesn't exist.
import { describe, test, expect } from "bun:test";
import { join } from "node:path";

const mod = await import(join(import.meta.dir, "../src/ux/wire.ts"));

describe("slate wire (bridge → UI data contract)", () => {
	test("fetchLiveChannels returns channels array from bridge json", async () => {
		const { fetchLiveChannels } = mod;
		const fake = { channels: [{ id: "c1", name: "KRON", streamUrl: "http://x/1.m3u8", logo: "http://l/1.png" }] };
		let called = "";
		const got = await fetchLiveChannels(async (url: string) => {
			called = url;
			return fake;
		}, "http://bridge:9/manifest.json");
		expect(called).toBe("http://bridge:9/manifest.json");
		expect(Array.isArray(got)).toBe(true);
		expect(got.length).toBe(1);
		expect(got[0]!.name).toBe("KRON");
	});

	test("fetchLiveChannels throws on malformed payload (unreliable narrator)", async () => {
		const { fetchLiveChannels } = mod;
		await expect(fetchLiveChannels(async () => ({ channels: "no" } as never), "http://b/m")).rejects.toThrow();
	});

	test("fetchLiveChannelsFromCatalog maps stremio metas to channels", async () => {
		const { fetchLiveChannelsFromCatalog } = mod;
		const fake = { metas: [{ id: "m1", name: "CBS", poster: "http://p/1.jpg", stream: "http://s/1.m3u8" }] };
		const got = await fetchLiveChannelsFromCatalog(async () => fake, "http://bridge:9/catalog/live/tv.json");
		expect(got.length).toBe(1);
		expect(got[0]!.name).toBe("CBS");
		expect(got[0]!.logo).toBe("http://p/1.jpg");
		expect(got[0]!.streamUrl).toBe("http://s/1.m3u8");
	});

	test("fetchLiveChannelsFromCatalog throws on malformed catalog", async () => {
		const { fetchLiveChannelsFromCatalog } = mod;
		await expect(fetchLiveChannelsFromCatalog(async () => ({}), "http://b/c")).rejects.toThrow();
	});

	test("toEpgItems maps channels+epg into rail render shape", async () => {
		const { toEpgItems } = mod;
		const chans = [{ id: "c1", name: "KRON", streamUrl: "u", logo: "l" }];
		const epg = new Map([["c1", [{ title: "News", start: 1, end: 2, channelId: "c1", id: "p1", description: "" }]]]);
		const items = toEpgItems(chans, epg, 1); // epoch ms 1 ∈ [start=1, end=2)
		expect(items.length).toBe(1);
		expect(items[0]!.title).toBe("KRON");
		expect(items[0]!.now).toBe("News");
	});
});
