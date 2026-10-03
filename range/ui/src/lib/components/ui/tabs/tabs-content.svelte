<script lang="ts">
	import type { Snippet } from "svelte";
	import { Tabs as TabsPrimitive } from "bits-ui";

	let { class: klass = "", children, ...restProps }: TabsPrimitive.ContentProps & { children?: Snippet } = $props();
</script>

<TabsPrimitive.Content class={klass} {...restProps}>
	{@render children?.()}
</TabsPrimitive.Content>
