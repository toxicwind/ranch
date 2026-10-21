import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class values the way shadcn/svelte expects: `cn("px-2", cond && "px-4")`
 * must let the conditional win, which plain clsx does not do.
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

// Type helpers the shadcn-svelte component skeletons are generated against.
// They were dropped from this file during the range-level trim, but every
// restored component skeleton still imports them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
