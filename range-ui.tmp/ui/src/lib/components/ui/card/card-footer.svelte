<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let { class: klass = "", children, ...restProps }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div class={["flex items-center p-6 pt-0", klass].join(" ")} {...restProps}>
	{@render children?.()}
</div>
