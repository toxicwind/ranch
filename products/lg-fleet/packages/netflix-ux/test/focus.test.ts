import { describe, test, expect } from "bun:test";
import {
	createFocus,
	moveFocus,
	jumpFocus,
	setFocusedId,
	type FocusMoveResult,
} from "../src/focus";

describe("netflix-ux: focus engine", () => {
	test("createFocus clamps start position into grid", () => {
		const s = createFocus(5, 4, -1, 99);
		expect(s.x).toBe(0);
		expect(s.y).toBe(3);
	});

	test("createFocus sets wrap flag", () => {
		expect(createFocus(3, 3, 0, 0, false).wrap).toBe(false);
		expect(createFocus(3, 3, 0, 0, true).wrap).toBe(true);
	});

	test("moveFocus right within grid", () => {
		const s = createFocus(5, 4, 0, 0);
		const r = moveFocus(s, "right");
		expect(r.moved).toBe(true);
		expect(r.x).toBe(1);
		expect(r.y).toBe(0);
	});

	test("moveFocus stops at grid edge without wrap", () => {
		const s = createFocus(5, 4, 4, 0);
		const r = moveFocus(s, "right");
		expect(r.moved).toBe(false);
		expect(r.x).toBe(4);
		expect(r.y).toBe(0);
	});

	test("moveFocus wraps at grid edge", () => {
		const s = createFocus(5, 4, 4, 0, true);
		const r = moveFocus(s, "right");
		expect(r.moved).toBe(true);
		expect(r.x).toBe(0);
	});

	test("moveFocus all four directions", () => {
		const s = createFocus(5, 4, 2, 2);
		expect(moveFocus(s, "left")).toMatchObject({ x: 1, y: 2, moved: true });
		expect(moveFocus(s, "up")).toMatchObject({ x: 2, y: 1, moved: true });
		expect(moveFocus(s, "down")).toMatchObject({ x: 2, y: 3, moved: true });
		expect(moveFocus(s, "right")).toMatchObject({ x: 3, y: 2, moved: true });
	});

	test("moveFocus up/down edge without wrap is no-op", () => {
		const s = createFocus(5, 4, 2, 0);
		const r = moveFocus(s, "up");
		expect(r.moved).toBe(false);
		expect(r.y).toBe(0);
		const s2 = createFocus(5, 4, 2, 3);
		const r2 = moveFocus(s2, "down");
		expect(r2.moved).toBe(false);
		expect(r2.y).toBe(3);
	});

	test("moveFocus wraps vertically", () => {
		const s = createFocus(5, 4, 2, 0, true);
		const r = moveFocus(s, "up");
		expect(r.moved).toBe(true);
		expect(r.y).toBe(3);
		const s2 = createFocus(5, 4, 2, 3, true);
		const r2 = moveFocus(s2, "down");
		expect(r2.moved).toBe(true);
		expect(r2.y).toBe(0);
	});

	test("LRUD: moving down then up returns to last row in column", () => {
		// grid 2 cols x 3 rows, start (0,0)
		const s = createFocus(2, 3, 0, 0, false);
		// move down to (0,1)
		const d1 = moveFocus(s, "down");
		expect(d1.y).toBe(1);
		// move right to (1,1)
		const d2 = moveFocus(d1, "right");
		expect(d2.x).toBe(1);
		expect(d2.y).toBe(1);
		// move down to (1,2)
		const d3 = moveFocus(d2, "down");
		expect(d3.y).toBe(2);
		// move up — LRUD restores row in col 1 that was last visited: row 1
		const u1 = moveFocus(d3, "up");
		expect(u1.y).toBe(1);
		expect(u1.x).toBe(1);
	});

	test("LRUD: moving right then left returns to last col in row", () => {
		const s = createFocus(3, 2, 0, 0, false);
		// move right to (1,0)
		const r1 = moveFocus(s, "right");
		expect(r1.x).toBe(1);
		// move down to (1,1)
		const d1 = moveFocus(r1, "down");
		expect(d1.y).toBe(1);
		// move right to (2,1)
		const r2 = moveFocus(d1, "right");
		expect(r2.x).toBe(2);
		// move left — LRUD restores col in row 1: col 1
		const l1 = moveFocus(r2, "left");
		expect(l1.x).toBe(1);
		expect(l1.y).toBe(1);
	});

	test("jumpFocus to absolute cell", () => {
		const s = createFocus(5, 4, 0, 0);
		const r = jumpFocus(s, 4, 3);
		expect(r.moved).toBe(true);
		expect(r.x).toBe(4);
		expect(r.y).toBe(3);
		const r2 = jumpFocus(r, 4, 3);
		expect(r2.moved).toBe(false);
	});

	test("jumpFocus clamps out of bounds", () => {
		const s = createFocus(5, 4, 0, 0);
		const r = jumpFocus(s, 99, -5);
		expect(r.x).toBe(4);
		expect(r.y).toBe(0);
	});

	test("setFocusedId sets id at current cell", () => {
		const s = setFocusedId(createFocus(5, 4, 2, 2), "prog-42");
		expect(s.focusedId).toBe("prog-42");
		expect(s.x).toBe(2);
		expect(s.y).toBe(2);
	});

	test("moveFocus result shape", () => {
		const s = createFocus(5, 4, 0, 0);
		const r = moveFocus(s, "right");
		expect(r.focusedId).toBeNull();
		expect(typeof r.moved).toBe("boolean");
		expect(typeof r.x).toBe("number");
		expect(typeof r.y).toBe("number");
		expect(typeof r.gridW).toBe("number");
		expect(typeof r.gridH).toBe("number");
		expect(typeof r.wrap).toBe("boolean");
	});
});
