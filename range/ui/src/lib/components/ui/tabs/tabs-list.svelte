<script lang="ts">
	import type { Snippet } from "svelte";
	import { Tabs as TabsPrimitive } from "bits-ui";

	let { class: klass = "", children, ...restProps }: TabsPrimitive.ListProps & { children?: Snippet } = $props();
</script>

<TabsPrimitive.List
	class={[
		"text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px]",
		klass,
	].join(" ")}
	{...restProps}
>
	{@render children?.()}
</TabsPrimitive.List>
