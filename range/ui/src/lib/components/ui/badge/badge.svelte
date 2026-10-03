<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { Badge as BadgePrimitive } from "bits-ui";

	const VARIANT: Record<string, string> = {
		default: "border-transparent bg-primary text-primary-foreground",
		secondary: "border-transparent bg-secondary text-secondary-foreground",
		destructive: "border-transparent bg-destructive text-destructive-foreground shadow-sm",
		outline: "text-foreground",
	};

	let {
		class: klass = "",
		variant = "default",
		children,
		...restProps
	}: BadgePrimitive.Props &
		HTMLAttributes<HTMLDivElement> & {
			variant?: keyof typeof VARIANT;
			children?: Snippet;
		} = $props();

	let classes = $derived(
		[
			"inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3",
			VARIANT[variant] ?? VARIANT.default,
			klass,
		]
			.filter(Boolean)
			.join(" "),
	);
</script>

<BadgePrimitive.Root class={classes} {...restProps}>
	{@render children?.()}
</BadgePrimitive.Root>
