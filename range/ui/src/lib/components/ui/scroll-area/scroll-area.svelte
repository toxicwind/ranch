<script lang="ts">
	import type { Snippet } from "svelte";
	import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";

	let {
		class: klass = "",
		children,
		...restProps
	}: ScrollAreaPrimitive.Props & { children?: Snippet } = $props();
</script>

<ScrollAreaPrimitive.Root class={["relative", klass].join(" ")} {...restProps}>
	{@render children?.()}
	<ScrollAreaPrimitive.Scrollbar
		orientation="vertical"
		class="flex w-2.5 touch-none select-none border-l border-l-transparent p-px transition-colors"
	>
		<ScrollAreaPrimitive.Thumb class="bg-border relative flex-1 rounded-full" />
	</ScrollAreaPrimitive.Scrollbar>
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
