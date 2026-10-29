// swarm-point.test.ts — TDD for the monadic swarm core (20 routes × 20 patterns).
// Coverage target: every exported primitive exercised; routes proven via their
// real send/poll round-trips; patterns proven via deterministic outcomes.
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
	Ok, Err, map, flatMap, all, routeUntil,
	mkMsg, mintId,
	fsRoute, httpRoute, sqliteRoute, envRoute, memoryRoute, watchRoute, shmRoute,
	type Route, type SwarmMsg, type Result,
	pSettled, pRace, pAny, pLimit, pQueue, retryExp, circuitBreaker, channel,
	barrier, latch, workerPool, mutex, nestAsync, nestedAsyncio, batched,
	withTimeout, mapAsync, debounce, throttle, asyncify,
	discoverRoutes, discover,
} from "./swarm-point";

const TMP = `/tmp/swarm-test-${process.pid}`;

beforeAll(async () => {
	await Bun.$`mkdir -p ${TMP}/bus`.quiet();
});

afterAll(async () => {
	await Bun.$`rm -rf ${TMP}`.quiet();
});

// ── monadic core ─────────────────────────────────────────────────────────────
describe("monadic core", () => {
	test("Ok/Err tags + map/flatMap", () => {
		expect(Ok(1).tag).toBe("ok");
		expect(Err({ route: "x", cause: "y" }).tag).toBe("err");
		expect(map(Ok(1), v => v + 1).tag === "ok" && (map(Ok(1), v => v + 1) as { value: number }).value === 2).toBe(true);
		const e = flatMap<string, string>(Err({ route: "a", cause: "b" }), v => Ok(v + "!"));
		expect(e.tag).toBe("err");
		const c = flatMap(Ok("a"), v => Ok(v + "!"));
		expect((c as { value: string }).value).toBe("a!");
	});
	test("all: first Err wins, else values", () => {
		const good = all([Ok(1), Ok(2)]);
		expect(good.tag).toBe("ok");
		const bad = all([Ok(1), Err({ route: "r", cause: "c" })]);
		expect(bad.tag).toBe("err");
	});
	test("routeUntil: first Ok wins; all-Err carries first error", () => {
		const winner = routeUntil([Err({ route: "a", cause: "1" }), Ok("yes"), Ok("no")]);
		expect(winner.tag).toBe("ok");
		expect((winner as { value: string }).value).toBe("yes");
		const none = routeUntil([Err({ route: "a", cause: "1" }), Err({ route: "b", cause: "2" })]);
		expect(none.tag).toBe("err");
		expect((none as { error: { route: string } }).error.route).toBe("a");
	});
	test("mintId unique; mkMsg shape", () => {
		const a = mintId(), b = mintId();
		expect(a).not.toBe(b);
		const m = mkMsg("tau", "kappa", "hello");
		expect(m.from).toBe("tau");
		expect(m.kind).toBe("status");
		expect(typeof m.ts).toBe("number");
	});
});

// ── routes (real round-trips) ────────────────────────────────────────────────
describe("routes", () => {
	test("fsRoute send+poll round-trip", async () => {
		const r = fsRoute(`${TMP}/bus`);
		const msg = mkMsg("tau", "*", "via-fs");
		expect((await r.send(msg)).tag).toBe("ok");
		const polled = await r.poll();
		expect(polled.tag).toBe("ok");
		const msgs = (polled as { value: SwarmMsg[] }).value;
		expect(msgs.length).toBeGreaterThanOrEqual(1);
		expect(msgs.some(m => m.id === msg.id)).toBe(true);
		// cursor advanced — next poll empty
		const again = await r.poll();
		expect((again as { value: SwarmMsg[] }).value.length).toBe(0);
	});
	test("fsRoute tolerates poison lines", async () => {
		const dir = `${TMP}/poison`;
		await Bun.$`mkdir -p ${dir}`.quiet();
		await Bun.write(`${dir}/bad.json`, "{not json");
		const good = mkMsg("tau", "*", "good");
		await Bun.write(`${dir}/good.json`, JSON.stringify(good));
		const r = fsRoute(dir);
		const polled = await r.poll();
		expect(polled.tag).toBe("ok");
		expect((polled as { value: SwarmMsg[] }).value.some(m => m.id === good.id)).toBe(true);
	});
	test("sqliteRoute send+poll round-trip", async () => {
		const r = sqliteRoute(`${TMP}/point.db`);
		const msg = mkMsg("tau", "*", "via-sqlite");
		expect((await r.send(msg)).tag).toBe("ok");
		const polled = await r.poll();
		expect(polled.tag).toBe("ok");
		expect((polled as { value: SwarmMsg[] }).value.some(m => m.id === msg.id)).toBe(true);
	});
	test("envRoute dead-drop", async () => {
		const r = envRoute("SWARM_TEST_SLOT");
		const msg = mkMsg("tau", "*", "via-env");
		expect((await r.send(msg)).tag).toBe("ok");
		const polled = await r.poll();
		expect((polled as { value: SwarmMsg[] }).value[0]?.body).toBe("via-env");
		delete Bun.env.SWARM_TEST_SLOT;
	});
	test("memoryRoute mailbox", async () => {
		const r = memoryRoute("test-agent");
		const msg = mkMsg("tau", "test-agent", "direct");
		await r.send(msg);
		const polled = await r.poll();
		expect((polled as { value: SwarmMsg[] }).value[0]?.body).toBe("direct");
	});
	test("watchRoute mtime-gated", async () => {
		const f = `${TMP}/watch.json`;
		const r = watchRoute(f);
		const msg = mkMsg("tau", "*", "via-watch");
		await r.send(msg);
		const polled = await r.poll();
		expect((polled as { value: SwarmMsg[] }).value[0]?.body).toBe("via-watch");
		// no change → empty
		expect((await r.poll() as { value: unknown[] }).value.length).toBe(0);
	});
	test("shmRoute /dev/shm dead-drop", async () => {
		const r = shmRoute(`swarm-test-${process.pid}`, 1024);
		const msg = mkMsg("tau", "*", "via-shm");
		expect((await r.send(msg)).tag).toBe("ok");
		const polled = await r.poll();
		expect((polled as { value: SwarmMsg[] }).value[0]?.body).toBe("via-shm");
	});
	test("httpRoute absent daemon → Err (forward-fail)", async () => {
		const r = httpRoute("http://127.0.0.1:1/nowhere");
		const res = await r.send(mkMsg("tau", "*", "x"));
		expect(res.tag).toBe("err");
	});
	test("discoverRoutes returns 20 routes", () => {
		const rs = discoverRoutes("tau-test", { busDir: `${TMP}/bus`, db: `${TMP}/d.db` });
		expect(rs.length).toBe(20);
		expect(new Set(rs.map(r => r.id)).size).toBe(20); // unique ids
	});
	test("discover: fsRoute legible → peers found", async () => {
		const rs = discoverRoutes("tau-test", { busDir: `${TMP}/bus`, db: `${TMP}/d2.db` });
		const peers = await discover("tau-test", rs.slice(0, 2)); // fs + http (http will err)
		expect(peers.tag).toBe("ok");
		expect((peers as { value: Peer[] }).value.length).toBeGreaterThanOrEqual(1);
	});
});

type Peer = { name: string; route: Route; latencyMs: number };

// ── concurrency patterns (deterministic outcomes) ────────────────────────────
describe("concurrency patterns", () => {
	test("pSettled captures every outcome", async () => {
		const rs = await pSettled([async () => 1, async () => { throw new Error("boom"); }, async () => 3]);
		expect(rs.length).toBe(3);
		expect(rs[0]!.tag).toBe("ok");
		expect(rs[1]!.tag).toBe("err");
	});
	test("pRace: first settle wins", async () => {
		const r = await pRace([async () => { await Bun.sleep(30); return "slow"; }, async () => "fast"]);
		expect((r as { value: string }).value).toBe("fast");
	});
	test("pAny: first success wins", async () => {
		const r = await pAny([async () => { throw new Error("no"); }, async () => "yes"]);
		expect((r as { value: string }).value).toBe("yes");
	});
	test("pLimit caps concurrency", async () => {
		let peak = 0, active = 0;
		const tasks = Array.from({ length: 10 }, () => async () => { active++; peak = Math.max(peak, active); await Bun.sleep(5); active--; return 1; });
		const r = await pLimit(3, tasks);
		expect(r.tag).toBe("ok");
		expect(peak).toBeLessThanOrEqual(3);
	});
	test("pQueue serial order", async () => {
		const order: number[] = [];
		const r = await pQueue([async () => { order.push(1); return 1; }, async () => { order.push(2); return 2; }]);
		expect(order).toEqual([1, 2]);
		expect((r as { value: number[] }).value).toEqual([1, 2]);
	});
	test("retryExp succeeds after transient failures", async () => {
		let attempts = 0;
		const r = await retryExp(async () => { if (++attempts < 3) throw new Error("flaky"); return "ok"; }, 5, 1);
		expect((r as { value: string }).value).toBe("ok");
		expect(attempts).toBe(3);
	});
	test("circuitBreaker trips and half-opens", async () => {
		let failing = true;
		const breaker = circuitBreaker(async () => { if (failing) throw new Error("down"); return "up"; }, 2, 50);
		await breaker(); await breaker(); // two failures → trip
		const open = await breaker();
		expect(open.tag).toBe("err");
		expect((open as { error: { cause: string } }).error.cause).toBe("open");
		await Bun.sleep(60);
		failing = false;
		const healed = await breaker();
		expect((healed as { value: string }).value).toBe("up");
	});
	test("channel put/take", async () => {
		const ch = channel<number>(2);
		ch.put(1); ch.put(2);
		expect(ch.size).toBe(2);
		expect(await ch.take()).toBe(1);
	});
	test("barrier releases at N", async () => {
		const b = barrier(2);
		setTimeout(() => b.arrive(), 5);
		setTimeout(() => b.arrive(), 10);
		await b.wait();
		expect(true).toBe(true);
	});
	test("latch counts down", async () => {
		const l = latch(2);
		l.countDown(); l.countDown();
		await l.wait();
		expect(true).toBe(true);
	});
	test("workerPool distributes without loss", async () => {
		const items = Array.from({ length: 20 }, (_, i) => i);
		const r = await workerPool(4, items, async i => i * 2);
		expect((r as { value: number[] }).value).toEqual(items.map(i => i * 2));
	});
	test("mutex exclusivity", async () => {
		const m = mutex();
		const order: string[] = [];
		const release = await m.lock();
		order.push("locked");
		setTimeout(async () => { order.push("released"); release(); }, 10);
		const release2 = await m.lock();
		order.push("locked-again");
		release2();
		expect(order).toEqual(["locked", "released", "locked-again"]);
	});
	test("nestAsync wraps result", async () => {
		const r = await nestAsync(async () => 42);
		expect((r as { value: number }).value).toBe(42);
	});
	test("nestedAsyncio expands children", async () => {
		const r = await nestedAsyncio([async () => [async () => 1, async () => 2]]);
		expect((r as { value: number[] }).value).toEqual([1, 2]);
	});
	test("batched chunks correctly", async () => {
		const batches: number[][] = [];
		const r = await batched([1,2,3,4,5], 2, async b => { batches.push(b); return b.length; });
		expect(batches.length).toBe(3); // 2+2+1
		expect((r as { value: number[] }).value).toEqual([2,2,1]);
	});
	test("withTimeout bounds a slow task", async () => {
		const r = await withTimeout(async () => { await Bun.sleep(100); return 1; }, 20);
		expect(r.tag).toBe("err");
	});
	test("mapAsync parallel map", async () => {
		const rs = await mapAsync([1,2,3], async i => i * 10);
		expect(rs.map(r => (r as { value: number }).value)).toEqual([10,20,30]);
	});
	test("debounce collapses bursts", async () => {
		let calls = 0;
		const d = debounce(() => calls++, 30);
		d(); d(); d();
		await Bun.sleep(60);
		expect(calls).toBe(1);
	});
	test("throttle rate-limits", async () => {
		let calls = 0;
		const t = throttle(() => calls++, 50);
		t(); t(); t();
		expect(calls).toBe(1);
	});
	test("asyncify promotes sync", async () => {
		const af = asyncify((a: number) => a + 1);
		expect(await af(1)).toBe(2);
	});
});
