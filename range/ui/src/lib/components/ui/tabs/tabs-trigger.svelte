<script lang="ts">
	import type { Snippet } from "svelte";
	import { Tabs as TabsPrimitive } from "bits-ui";

	let { class: klass = "", children, ...restProps }: TabsPrimitive.TriggerProps & { children?: Snippet } = $props();
</script>

<TabsPrimitive.Trigger
	class={[
		"data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
		klass,
	].join(" ")}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.Trigger>
