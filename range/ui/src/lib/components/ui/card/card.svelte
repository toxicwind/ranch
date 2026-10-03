<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: klass = "", children, ...restProps }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div class={["bg-card text-card-foreground rounded-xl border shadow", klass].join(" ")} {...restProps}>
	{@render children?.()}
</div>
