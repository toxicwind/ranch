import { describe, test, expect } from "bun:test";
import { createEPG, getRail, nowNextFor } from "../src/epg";

const now = Date.now();
const prog = (id: string, ch: string, startOff: number, dur: number, title: string) => ({
	id: `prog-${id}` as any,
	channelId: ch as any,
	title,
	startMs: now + startOff,
	endMs: now + startOff + dur,
	durationMs: dur,
} as any);

describe("netflix-ux: EPG rails", () => {
	test("createEPG groups programs by channel and sorts by start", () => {
		const state = createEPG([
			prog("b", "ch2", 60000, 1800, "later"),
			prog("a", "ch1", 0, 1800, "earlier"),
			prog("c", "ch2", 0, 1800, "earlier ch2"),
		]);
		expect(state.rails.length).toBe(2);
		const ch1 = state.rails.find((r) => r.channelId === "ch1");
		expect(ch1?.channelNumber).toBe(1);
		const ch2 = state.rails.find((r) => r.channelId === "ch2");
		expect(ch2?.channelNumber).toBe(2);
		expect(ch2!.programs[0].title).toBe("earlier ch2");
		expect(ch2!.programs[1].title).toBe("later");
	});

	test("createEPG numbers channels sequentially by channelId sort", () => {
		const state = createEPG([
			prog("x", "zzz", 0, 600, "z"),
			prog("y", "aaa", 0, 600, "a"),
		]);
		const aaa = state.rails.find((r) => r.channelId === "aaa");
		const zzz = state.rails.find((r) => r.channelId === "zzz");
		expect(aaa!.channelNumber).toBe(1);
		expect(zzz!.channelNumber).toBe(2);
	});

	test("nowNextFor returns now/next at current time", () => {
		const state = createEPG([
			prog("now", "ch1", -600000, 1200000, "airing now"),
			prog("later", "ch1", 600000, 600000, "up next"),
		]);
		const nn = nowNextFor(state, "ch1");
		expect(nn.now?.title).toBe("airing now");
		expect(nn.next?.title).toBe("up next");
	});

	test("nowNextFor returns undefined for unknown channel", () => {
		const state = createEPG([prog("a", "ch1", 0, 600, "x")]);
		expect(nowNextFor(state, "nope")).toEqual({ now: undefined, next: undefined });
	});

	test("getRail returns rail by channel", () => {
		const state = createEPG([prog("a", "ch9", 0, 600, "nine")]);
		const rail = getRail(state, "ch9");
		expect(rail?.channelName).toBe("nine");
		expect(getRail(state, "missing")).toBeUndefined();
	});

	test("next program is the first starting after now", () => {
		const state = createEPG([
			prog("p1", "ch1", -10000, 5000, "past"),
			prog("p2", "ch1", 5000, 5000, "future 1"),
			prog("p3", "ch1", 15000, 5000, "future 2"),
		]);
		expect(nowNextFor(state, "ch1").next?.title).toBe("future 1");
	});
});
