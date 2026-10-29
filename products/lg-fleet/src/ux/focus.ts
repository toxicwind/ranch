/** @slate/ux — spatial LRUD focus engine (D-pad deterministic, rail-aware). */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface FocusOptions {
	onFocus?: (from: string | undefined, to: string) => void;
}

/**
 * Nearest-rect spatial navigation. Unlike naive DOM order, this walks the
 * geometry: candidates are ranked by (directional distance, alignment penalty),
 * so "down" from a poster prefers the poster below over one slightly right.
 */
export function createFocusEngine(
	rects: ReadonlyMap<string, Rect>,
	initial: string,
	options: FocusOptions = {},
) {
	let current = initial;

	function center(r: Rect): { cx: number; cy: number } {
		return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
	}

	function move(dir: "up" | "down" | "left" | "right"): string {
		const from = rects.get(current);
		if (!from) return current;
		const fc = center(from);
		let best: { id: string; score: number } | undefined;
		for (const [id, r] of rects) {
			if (id === current) continue;
			const c = center(r);
			const dx = c.cx - fc.cx;
			const dy = c.cy - fc.cy;
			// must actually be in the direction
			if (dir === "right" && dx <= 0) continue;
			if (dir === "left" && dx >= 0) continue;
			if (dir === "down" && dy <= 0) continue;
			if (dir === "up" && dy >= 0) continue;
			// primary axis distance + alignment penalty (orthogonal offset)
			const primary = dir === "up" || dir === "down" ? Math.abs(dy) : Math.abs(dx);
			const ortho = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
			const score = primary + ortho * 2;
			if (!best || score < best.score) best = { id, score };
		}
		if (!best) return current; // blocked edge — focus stays
		const prev = current;
		current = best.id;
		options.onFocus?.(prev, current);
		return current;
	}

	return {
		move,
		get current(): string {
			return current;
		},
		set(id: string): void {
			if (rects.has(id)) {
				const prev = current;
				current = id;
				options.onFocus?.(prev, id);
			}
		},
	};
}
