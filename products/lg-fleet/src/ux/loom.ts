/**
 * @slate/ux — loom adapter: patterns derived from LoomTV (vendored-copy decision,
 * 2026-10-29). LoomTV is React+radix-heavy; @slate/ux is vanilla-zero-dep, so a
 * submodule would drag its whole tree for two primitives. Instead: the two
 * patterns are re-derived here (AST-audited from ~/.cache/slate-research/):
 *
 * 1. MediaRail's "show skeleton while empty, collapse rail when no items" —
 *    already owned by rail.ts (shouldRender). NOT duplicated here.
 * 2. Discover's focus-anchor paging: when the focused cell crosses the rail's
 *    visible window, the window scrolls by a page (not per-cell) — this file.
 */

export interface FocusWindow {
	/** index of the first visible item */
	start: number;
	/** items visible per page */
	page: number;
	/** total items */
	total: number;
}

/** Page-scroll the visible window so `focus` stays inside [start, start+page). */
export function pageWindow(win: FocusWindow, focus: number): FocusWindow {
	const page = Math.max(1, win.page);
	const total = Math.max(0, win.total);
	const clamped = Math.max(0, Math.min(focus, total - 1));
	let start = win.start;
	if (clamped < start) start = Math.max(0, clamped - page + 1);
	else if (clamped >= start + page) start = clamped;
	return { start, page, total };
}

/** Which cells are visible for a window (indexes into the rail items). */
export function visibleIndexes(win: FocusWindow): number[] {
	const out: number[] = [];
	for (let i = win.start; i < Math.min(win.start + win.page, win.total); i++) out.push(i);
	return out;
}
