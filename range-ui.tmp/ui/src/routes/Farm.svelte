<script lang="ts">
	// Farm.svelte — the AI Harvest Moon living map. Villagers = rigs,
	// buildings = daemons, speech bubbles = squawk, day/night = poll cadence.
	import { onMount, onDestroy } from "svelte";

	interface Daemon {
		name: string;
		status: string;
		port?: number;
	}
	interface Villager {
		name: string;
		sprite: string;
		x: number;
		y: number;
		speech: string;
	}
	interface SquawkMsg {
		from_agent: string;
		body: string;
	}

	const VILLAGERS = [
		{ name: "tau", sprite: "Character-Base", x: 50, y: 55 },
		{ name: "kappa", sprite: "Archer-Green", x: 62, y: 50 },
		{ name: "geode", sprite: "Archer-Purple", x: 20, y: 60 },
		{ name: "hephaistos", sprite: "Character-Base", x: 35, y: 45 },
		{ name: "skopos", sprite: "Archer-Green", x: 75, y: 62 },
		{ name: "muse", sprite: "Archer-Purple", x: 15, y: 40 },
		{ name: "keryx", sprite: "Character-Base", x: 82, y: 40 },
		{ name: "kryptos", sprite: "Archer-Green", x: 40, y: 70 },
		{ name: "kairos", sprite: "Archer-Purple", x: 55, y: 75 },
		{ name: "ergane", sprite: "Character-Base", x: 28, y: 78 },
		{ name: "hestia", sprite: "Archer-Green", x: 68, y: 80 },
		{ name: "tack", sprite: "Archer-Purple", x: 45, y: 35 },
	];

	// The core estate daemons rendered as farm buildings.
	const BUILDINGS = [
		{ name: "rhodochrosite", label: "Gem House", x: 12, y: 18, port: 25193 },
		{ name: "bornite", label: "Barn", x: 30, y: 12, port: 25100 },
		{ name: "keypool", label: "Key Shed", x: 48, y: 16, port: 25109 },
		{ name: "squawk", label: "Campfire", x: 66, y: 14, port: 25121 },
		{ name: "rig", label: "Village Hall", x: 82, y: 20, port: 25196 },
		{ name: "forge", label: "Smithy", x: 88, y: 48, port: 25155 },
		{ name: "ergo-irc", label: "Watchtower", x: 8, y: 48, port: 25241 },
	];

	let daemons: Daemon[] = $state([]);
	let speeches: Map<string, string> = $state(new Map());
	let hourOfDay = $state(new Date().getHours());
	let lastUpdated = $state("");

	async function fetchDaemons() {
		try {
			const r = await fetch("/api/pitchfork/status", { signal: AbortSignal.timeout(5000) });
			const list = (await r.json()) as Array<{ name: string; status: string }>;
			daemons = BUILDINGS.map((b) => {
				const found = list.find((d) => d.name === b.name);
				return { name: b.name, status: found?.status ?? "unknown", port: b.port };
			});
		} catch {
			// relay down — render with last-known or unknown
		}
		lastUpdated = new Date().toLocaleTimeString();
	}

	async function fetchSquawk() {
		try {
			const r = await fetch("/api/squawk/recent", { signal: AbortSignal.timeout(5000) });
			const msgs = (await r.json()) as SquawkMsg[];
			const map = new Map<string, string>();
			for (const m of msgs.slice(0, 12)) {
				if (!map.has(m.from_agent)) map.set(m.from_agent, m.body.slice(0, 80));
			}
			speeches = map;
		} catch {
			/* offline */
		}
	}

	function isLit(b: { name: string }): boolean {
		const d = daemons.find((x) => x.name === b.name);
		return d ? d.status.toLowerCase().includes("running") : false;
	}

	function speechFor(name: string): string {
		return speeches.get(name) ?? "";
	}

	// Day/night: t in [0,1) — 0 = midnight, 0.5 = noon.
	function isNight(): boolean {
		return hourOfDay < 6 || hourOfDay >= 19;
	}
	function skyColor(): string {
		const h = hourOfDay;
		if (h >= 6 && h < 8) return "#f5c98a"; // dawn
		if (h >= 8 && h < 17) return "#8ecae6"; // day
		if (h >= 17 && h < 19) return "#f4a261"; // dusk
		return "#1d3557"; // night
	}

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		fetchDaemons();
		fetchSquawk();
		interval = setInterval(() => {
			hourOfDay = new Date().getHours();
			fetchDaemons();
			fetchSquawk();
		}, 30_000);
	});
	onDestroy(() => clearInterval(interval));
</script>

<div class="farm" style="--sky: {skyColor()}">
	<header>
		<h2>🏛 Estate Farm</h2>
		<span class="clock" class:night={isNight()}>
			{isNight() ? "🌙" : "☀️"} {lastUpdated}
		</span>
	</header>

	<div class="world">
		<!-- sky band -->
		<div class="sky"></div>

		<!-- buildings -->
		{#each BUILDINGS as b (b.name)}
			{@const lit = isLit(b)}
			<div class="building" style="left: {b.x}%; top: {b.y}%;" title="{b.label} ({b.name}) — {lit ? 'running' : 'down'}">
				<div class="house" class:lit>
					<div class="roof"></div>
					<div class="window"></div>
				</div>
				<span class="blabel">{b.label}</span>
			</div>
		{/each}

		<!-- villagers -->
		{#each VILLAGERS as v (v.name)}
			<div class="villager" style="left: {v.x}%; top: {v.y}%;">
				{#if speechFor(v.name)}
					<div class="bubble">{speechFor(v.name)}</div>
				{/if}
				<div class="body">
					<div class="head"></div>
					<div class="torso"></div>
				</div>
				<span class="vname">{v.name}</span>
			</div>
		{/each}

		<!-- ground band -->
		<div class="ground"></div>
	</div>

	<footer>
		{daemons.filter((d) => d.status.toLowerCase().includes("running")).length}/{daemons.length} buildings lit ·
		{VILLAGERS.length} villagers · 30s poll cadence
	</footer>
</div>

<style>
	.farm {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: 100%;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.clock.night {
		color: #a8dadc;
	}
	.world {
		position: relative;
		flex: 1;
		min-height: 420px;
		border-radius: 12px;
		overflow: hidden;
		background: linear-gradient(to bottom, var(--sky) 0%, var(--sky) 38%, #7cb56b 38%, #5e9450 100%);
		transition: background 2s;
	}
	.sky {
		position: absolute;
		inset: 0 0 62% 0;
		pointer-events: none;
	}
	.building {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		transform: translate(-50%, -50%);
	}
	.house {
		width: 34px;
		height: 26px;
		background: #a5713f;
		border: 2px solid #5c3d1e;
		border-radius: 2px;
		position: relative;
		opacity: 0.9;
	}
	.house .window {
		position: absolute;
		top: 6px;
		left: 50%;
		transform: translateX(-50%);
		width: 10px;
		height: 10px;
		background: #333;
		border-radius: 1px;
	}
	.house.lit .window {
		background: #ffd166;
		box-shadow: 0 0 8px 2px #ffd16688;
	}
	.roof {
		position: absolute;
		top: -12px;
		left: -3px;
		right: -3px;
		height: 0;
		border-left: 17px solid transparent;
		border-right: 17px solid transparent;
		border-bottom: 12px solid #8b4513;
	}
	.blabel,
	.vname {
		font-size: 0.62rem;
		color: #fff;
		text-shadow: 0 1px 2px #0008;
		white-space: nowrap;
	}
	.villager {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1px;
		transform: translate(-50%, -50%);
	}
	.body {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.head {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #f1c27d;
		border: 1px solid #0004;
	}
	.torso {
		width: 12px;
		height: 14px;
		border-radius: 3px 3px 0 0;
		background: #457b9d;
		border: 1px solid #0004;
	}
	.bubble {
		position: absolute;
		bottom: 130%;
		left: 50%;
		transform: translateX(-50%);
		background: #fff;
		color: #222;
		font-size: 0.6rem;
		padding: 3px 6px;
		border-radius: 6px;
		max-width: 140px;
		box-shadow: 0 1px 4px #0004;
		pointer-events: none;
		white-space: normal;
	}
	.bubble::after {
		content: "";
		position: absolute;
		top: 100%;
		left: 50%;
		margin-left: -4px;
		border: 4px solid transparent;
		border-top-color: #fff;
	}
	footer {
		font-size: 0.72rem;
		opacity: 0.7;
	}
</style>
