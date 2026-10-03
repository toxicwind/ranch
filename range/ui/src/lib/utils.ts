import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class values the way shadcn/svelte expects: `cn("px-2", cond && "px-4")`
 * must let the conditional win, which plain clsx does not do.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}