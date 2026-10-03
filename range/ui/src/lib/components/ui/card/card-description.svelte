<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: klass = "", children, ...restProps }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div class={["text-muted-foreground text-sm", klass].join(" ")} {...restProps}>
	{@render children?.()}
</div>
