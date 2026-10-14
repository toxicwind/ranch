<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import { cn } from "$lib/utils.js";
	import type { HTMLButtonAttributes } from "svelte/elements";
	import { useSidebar } from "./context.svelte.js";

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		...restProps
	}: HTMLButtonAttributes & {
		variant?: string;
		size?: string;
		ref?: HTMLButtonElement | null;
		onclick?: (e: MouseEvent) => void;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	bind:ref
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn("cn-sidebar-trigger", className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<PanelLeftIcon  />
	<span class="sr-only">Toggle Sidebar</span>
</Button>
