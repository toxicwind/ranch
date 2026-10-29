// @slate/ux — netflix-max TV primitives for SLATE (vanilla JS, zero deps).
// Beyond-fork: the five primitives LoomTV lacks + own rail/token system.
// TDD: failing first where the module doesn't exist yet.

import { describe, test, expect } from "bun:test";

// ── tokens ───────────────────────────────────────────────────────────────────
describe("slate tokens", () => {
	test("token set exists with TV-safe overscan margins", async () => {
		const { SLATE_TOKENS } = await import("../src/ux/tokens.ts");
		expect(SLATE_TOKENS.overscanPx).toBeGreaterThanOrEqual(32);
		expect(SLATE_TOKENS.colors.background).toBe("#000000");
		expect(SLATE_TOKENS.motion.focusMs).toBeGreaterThan(0);
	});

	test("tokens inject as CSS custom properties", async () => {
		const { tokenCss } = await import("../src/ux/tokens.ts");
		const css = tokenCss();
		expect(css).toContain("--slate-overscan: 32px");
		expect(css).toContain("--slate-accent");
	});
});

// ── spatial LRUD focus engine ────────────────────────────────────────────────
describe("slate-focus (spatial LRUD)", () => {
	test("moves focus to nearest rect in direction", async () => {
		const { createFocusEngine } = await import("../src/ux/focus.ts");
		const rects = new Map([
			["a", { x: 0, y: 0, w: 100, h: 50 }],
			["b", { x: 200, y: 0, w: 100, h: 50 }],
			["c", { x: 0, y: 100, w: 100, h: 50 }],
		]);
		const engine = createFocusEngine(rects, "a");
		const next = engine.move("right");
		expect(next).toBe("b");
	});
	test("prefers aligned candidates over distant ones", async () => {
		const { createFocusEngine } = await import("../src/ux/focus.ts");
		const rects = new Map([
			["a", { x: 0, y: 0, w: 100, h: 50 }],
			["aligned", { x: 0, y: 100, w: 100, h: 50 }],
			["distant", { x: 500, y: 120, w: 100, h: 50 }],
		]);
		const engine = createFocusEngine(rects, "a");
		expect(engine.move("down")).toBe("aligned");
	});
	test("blocked edge returns current focus", async () => {
		const { createFocusEngine } = await import("../src/ux/focus.ts");
		const engine = createFocusEngine(new Map([["solo", { x: 0, y: 0, w: 10, h: 10 }]]), "solo");
		expect(engine.move("up")).toBe("solo");
		expect(engine.move("left")).toBe("solo");
	});
	test("move fires focus callback with ids", async () => {
		const { createFocusEngine } = await import("../src/ux/focus.ts");
		const rects = new Map([
			["a", { x: 0, y: 0, w: 10, h: 10 }],
			["b", { x: 100, y: 0, w: 10, h: 10 }],
		]);
		const seen: Array<[string | undefined, string | undefined]> = [];
		const engine = createFocusEngine(rects, "a", { onFocus: (from, to) => seen.push([from, to]) });
		engine.move("right");
		expect(seen[0]).toEqual(["a", "b"]);
	});
});

// ── rail collapse + skeleton ─────────────────────────────────────────────────
describe("slate-rail", () => {
	test("empty rail collapses (never renders)", async () => {
		const { railVisible } = await import("../src/ux/rail.ts");
		expect(railVisible([], false)).toBe(false);
		expect(railVisible([1, 2], false)).toBe(true);
		expect(railVisible([], true)).toBe(true); // loading keeps skeleton visible
	});
	test("rail pagination window", async () => {
		const { railWindow } = await import("../src/ux/rail.ts");
		const items = Array.from({ length: 50 }, (_, i) => i);
		expect(railWindow(items, 0, 20)).toEqual(items.slice(0, 20));
		expect(railWindow(items, 1, 20)).toEqual(items.slice(20, 40));
	});
});

// ── EPG rail (now/next) ──────────────────────────────────────────────────────
describe("slate-epg-rail", () => {
	test("channels render with now playing program", async () => {
		const { epgRailItems } = await import("../src/ux/epg.ts");
		const now = Date.parse("2026-10-29T12:00:00Z");
		const channels = [
			{ id: "ch1", name: "News", programs: [{ channelId: "ch1", title: "Morning", start: now - 3600_000, end: now + 1800_000, description: "", id: "p1" }] },
			{ id: "ch2", name: "Sports", programs: [] },
		];
		const items = epgRailItems(channels, now);
		expect(items[0]!.name).toBe("News");
		expect(items[0]!.now?.title).toBe("Morning");
		expect(items[1]!.now).toBeUndefined();
	});
});

// ── OSD channel switcher ─────────────────────────────────────────────────────
describe("slate-osd", () => {
	test("digit buffer accumulates and times out", async () => {
		const { createOsd } = await import("../src/ux/osd.ts");
		const osd = createOsd(3000);
		osd.digit("1"); osd.digit("2");
		expect(osd.buffer()).toBe("12");
		await Bun.sleep(3100);
		expect(osd.buffer()).toBe("");
	});
	test("osd commits on exact channel match", async () => {
		const { createOsd } = await import("../src/ux/osd.ts");
		const picked: string[] = [];
		const osd = createOsd(3000, { channels: ["ch1", "ch12"], onCommit: id => picked.push(id) });
		osd.digit("1");
		// exact numeric match (1 == ch1) commits immediately — Netflix-real behavior
		expect(picked).toEqual(["ch1"]);
	});
	test("osd disambiguates multi-digit prefix", async () => {
		const { createOsd } = await import("../src/ux/osd.ts");
		const picked: string[] = [];
		const osd = createOsd(3000, { channels: ["ch15", "ch152"], onCommit: id => picked.push(id) });
		osd.digit("1"); osd.digit("5");
		expect(picked).toEqual(["ch15"]); // unique 2-digit prefix commit
	});
});

// ── hero billboard ───────────────────────────────────────────────────────────
describe("slate-hero", () => {
	test("hero picks first item and exposes rotate", async () => {
		const { createHero } = await import("../src/ux/hero.ts");
		const items = [
			{ id: "m1", title: "One", backdrop: "a.jpg", overview: "first" },
			{ id: "m2", title: "Two", backdrop: "b.jpg", overview: "second" },
		];
		const hero = createHero(items, 0);
		expect(hero.current().title).toBe("One");
		hero.rotate();
		expect(hero.current().title).toBe("Two");
		hero.rotate(); // wraps
		expect(hero.current().title).toBe("One");
	});
	test("hero empty safe", async () => {
		const { createHero } = await import("../src/ux/hero.ts");
		const hero = createHero([], 0);
		expect(hero.current()).toBeUndefined();
	});
});
