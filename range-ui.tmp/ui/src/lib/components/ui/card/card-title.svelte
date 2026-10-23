<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: klass = "", children, ...restProps }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div class={["leading-none font-semibold tracking-tight", klass].join(" ")} {...restProps}>
	{@render children?.()}
</div>
