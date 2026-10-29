/** @slate/ux — hero billboard: full-bleed rotating spotlight (LoomTV lacks this). */

export interface HeroItem {
	id: string;
	title: string;
	backdrop: string;
	overview: string;
}

export interface Hero {
	current(): HeroItem | undefined;
	rotate(): void;
	get index(): number;
}

export function createHero(items: readonly HeroItem[], initialIndex = 0, onRotate?: (item: HeroItem) => void): Hero {
	let idx = items.length ? Math.min(Math.max(0, initialIndex), items.length - 1) : 0;
	return {
		current(): HeroItem | undefined {
			return items[idx];
		},
		rotate(): void {
			if (!items.length) return;
			idx = (idx + 1) % items.length;
			onRotate?.(items[idx]!);
		},
		get index(): number {
			return idx;
		},
	};
}
