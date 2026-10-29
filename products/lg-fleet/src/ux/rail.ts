/** @slate/ux — rail (Netflix poster rail) — collapse-when-empty + windowed. */

/** A rail renders only when it has items, or is loading (skeleton). */
export function railVisible(items: readonly unknown[], isLoading: boolean): boolean {
	return isLoading || items.length > 0;
}

/** Windowed slice for rail paging (see-all / scroll pages). */
export function railWindow<T>(items: readonly T[], page: number, perPage: number): T[] {
	return items.slice(page * perPage, (page + 1) * perPage);
}
