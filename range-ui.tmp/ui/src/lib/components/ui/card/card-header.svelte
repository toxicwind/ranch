<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: klass = "", children, ...restProps }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div class={["flex flex-col gap-1.5 p-6", klass].join(" ")} {...restProps}>
	{@render children?.()}
</div>
