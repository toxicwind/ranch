<script lang="ts">
	import type { Snippet } from "svelte";
	import { Tabs as TabsPrimitive } from "bits-ui";

	let {
		class: klass = "",
		value = $bindable(),
		children,
		...restProps
	}: TabsPrimitive.RootProps & { children?: Snippet } = $props();
</script>

<TabsPrimitive.Root bind:value class={["flex flex-col gap-2", klass].join(" ")} {...restProps}>
	{@render children?.()}
</TabsPrimitive.Root>
