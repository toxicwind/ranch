#!/usr/bin/env bun
/**
 * flotilla/mcp/server.ts — the android-fleet MCP drop-in.
 *
 * ANY agent can drive the Architect's Pixel 9 Pro XL headlessly:
 * screenshots, open URLs, taps, text, UI-tree reads, freeform floats.
 * Federated via thresher (:25127) — same streamable-HTTP JSON-RPC shape
 * as taas.ts (proven pattern).
 *
 *   POST /mcp  — JSON-RPC 2.0 (initialize / tools/list / tools/call)
 *   GET /health
 *
 * Focus doctrine (flotilla covenant, enforced here): `input tap/text`
 * lands on the FOCUSED window. pixel_tap/pixel_text therefore return the
 * current focus with every result — an agent that taps blind gets shown
 * what window it hit. Nothing on this surface ever steals focus.
 *
 * Port: FLOTILLA_MCP_PORT (default 25245, ports.env SSOT).
 */
import { serve } from "bun";
import { $ } from "bun";

const PORT = Number(process.env.FLOTILLA_MCP_PORT ?? 25245);
const SERIAL_BASE = process.env.FLOTILLA_DEVICE_IP ?? "10.0.0.77";

// ── adb device resolution (keepalive normally keeps this warm) ──────────
let device: string | null = null;

async function liveDevice(): Promise<string | null> {
	const out = await $`adb devices`.quiet().text();
	for (const line of out.split("\n")) {
		if (line.startsWith(`${SERIAL_BASE}:`) && line.trimEnd().endsWith("device"))
			return line.split("\t")[0]!;
	}
	return null;
}

async function scanPorts(): Promise<string[]> {
	const mdns = await $`adb mdns services`.quiet().nothrow().text();
	const fromMdns = [...mdns.matchAll(new RegExp(`${SERIAL_BASE.replace(/\./g, "\\.")}:(\\d+)`, "g"))].map((m) => m[1]!);
	if (fromMdns.length) return fromMdns;
	const nmap = await $`nmap -T4 --open -p 30000-50000 ${SERIAL_BASE}`.quiet().nothrow().text();
	return [...nmap.matchAll(/^(\d+)\/tcp\s+open/gm)].map((m) => m[1]!);
}

async function ensureDevice(): Promise<string> {
	if (device && (await liveDevice()) === device) return device;
	const live = await liveDevice();
	if (live) { device = live; return live; }
	for (const p of await scanPorts()) {
		await $`adb connect ${`${SERIAL_BASE}:${p}`}`.quiet().nothrow();
		const d = await liveDevice();
		if (d) { device = d; return d; }
	}
	throw new Error("no adb route to phone — wireless-debug off or keepalive daemon down");
}

async function sh(...args: string[]): Promise<string> {
	const dev = await ensureDevice();
	return $`adb -s ${dev} ${args}`.quiet().nothrow().text();
}

async function currentFocus(): Promise<string> {
	const out = await sh("shell", "dumpsys window 2>/dev/null | grep mCurrentFocus");
	return out.trim() || "unknown";
}

function content(result: unknown, isError = false) {
	return { content: [{ type: "text", text: JSON.stringify(result) }], ...(isError ? { isError: true } : {}) };
}

// ── tool implementations ────────────────────────────────────────────────
const tools = [
	{
		name: "pixel_connect",
		description: "Ensure adb connectivity to the Pixel (10.0.0.77). Auto-rescues a rotated wireless-debug port via mDNS/nmap. Returns the live device serial.",
		inputSchema: { type: "object", properties: {} },
		run: async () => ({ device: await ensureDevice() }),
	},
	{
		name: "pixel_screenshot",
		description: "Screencap the Pixel to a PNG file on the box. Returns {file, bytes, focus}. Use pixel_ui for coordinates instead of guessing taps.",
		inputSchema: { type: "object", properties: { file: { type: "string", description: "output path (default /tmp/pixel-shot-<ts>.png)" } } },
		run: async (args: Record<string, unknown>) => {
			const file = String(args.file ?? `/tmp/pixel-shot-${Date.now()}.png`);
			const dev = await ensureDevice();
			const png = await $`adb -s ${dev} exec-out screencap -p`.quiet().bytes();
			await Bun.write(file, png);
			return { file, bytes: png.byteLength, focus: await currentFocus() };
		},
	},
	{
		name: "pixel_open",
		description: "Open a URL on the phone, headlessly. http VIEW intents resolve to Firefox as sole default — no chooser ever appears. Does not steal focus from the user's app beyond the launch itself.",
		inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
		run: async (args: Record<string, unknown>) => {
			const out = await sh("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", String(args.url));
			return { launched: out.includes("Starting"), focus: await currentFocus() };
		},
	},
	{
		name: "pixel_openshot",
		description: "Open a URL then screencap once the browser holds focus (polls ~4s, no fixed sleeps). One round trip — use instead of open+shot.",
		inputSchema: { type: "object", properties: { url: { type: "string" }, file: { type: "string" } }, required: ["url"] },
		run: async (args: Record<string, unknown>) => {
			const dev = await ensureDevice();
			await $`adb -s ${dev} shell am start -a android.intent.action.VIEW -d ${String(args.url)}`.quiet().nothrow();
			const file = String(args.file ?? `/tmp/pixel-shot-${Date.now()}.png`);
			const t0 = Date.now();
			while (Date.now() - t0 < 4000) {
				if (/mCurrentFocus=.*(fenix|chrome|WebView)/.test(await sh("shell", "dumpsys window"))) break;
				await Bun.sleep(150);
			}
			const png = await $`adb -s ${dev} exec-out screencap -p`.quiet().bytes();
			await Bun.write(file, png);
			return { file, bytes: png.byteLength, ms: Date.now() - t0, focus: await currentFocus() };
		},
	},
	{
		name: "pixel_tap",
		description: "Tap at x,y. FOCUS DOCTRINE: lands on the focused window — always pixel_ui first, and check the returned focus. Returning focus is the covenant.",
		inputSchema: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] },
		run: async (args: Record<string, unknown>) => {
			await sh("shell", "input", "tap", String(args.x), String(args.y));
			return { tapped: [args.x, args.y], focus: await currentFocus() };
		},
	},
	{
		name: "pixel_text",
		description: "Type text into the focused window. FOCUS DOCTRINE: returns focus so a blind type is immediately visible.",
		inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
		run: async (args: Record<string, unknown>) => {
			await sh("shell", "input", "text", String(args.text).replace(/ /g, "%s"));
			return { typed: String(args.text).length, focus: await currentFocus() };
		},
	},
	{
		name: "pixel_key",
		description: "Send a keyevent (4=BACK, 66=ENTER, 111=ESC, 3=HOME). Returns focus.",
		inputSchema: { type: "object", properties: { keycode: { type: "number" } }, required: ["keycode"] },
		run: async (args: Record<string, unknown>) => {
			await sh("shell", "input", "keyevent", String(args.keycode));
			return { keyed: args.keycode, focus: await currentFocus() };
		},
	},
	{
		name: "pixel_ui",
		description: "Dump + return the UI hierarchy XML (tap targets, labels, bounds). The safe prelude to any tap.",
		inputSchema: { type: "object", properties: {} },
		run: async () => {
			await sh("shell", "uiautomator", "dump", "/sdcard/pixel-ui.xml");
			const dev = await ensureDevice();
			await $`adb -s ${dev} pull /sdcard/pixel-ui.xml /tmp/pixel-ui.xml`.quiet().nothrow();
			const xml = await Bun.file("/tmp/pixel-ui.xml").text();
			return { file: "/tmp/pixel-ui.xml", bytes: xml.length, xml: xml.slice(0, 60000) };
		},
	},
	{
		name: "pixel_focus",
		description: "Which window owns the screen right now.",
		inputSchema: { type: "object", properties: {} },
		run: async () => ({ focus: await currentFocus() }),
	},
	{
		name: "flotilla_float",
		description: "Float a URL in a freeform window on the phone (flotilla: picture-in-picture card over the user's SSH session). Uses the flotilla CLI so the alpha-tax levers (windowingMode 5) stay in one place.",
		inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
		run: async (args: Record<string, unknown>) => {
			const out = await $`flotilla open ${String(args.url)}`.quiet().nothrow().text();
			return { floated: !out.includes("error"), out: out.trim().slice(0, 400), focus: await currentFocus() };
		},
	},
];

// ── streamable-HTTP JSON-RPC surface (taas.ts shape) ────────────────────
const server = serve({
	hostname: "127.0.0.1",
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({ ok: true, service: "flotilla-mcp", device });
		}
		if (url.pathname === "/mcp" && request.method === "POST") {
			const rpc = (await request.json()) as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
			const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, result });
			if (rpc.method === "initialize")
				return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "flotilla-mcp", version: "1.0.0" } });
			if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
			if (rpc.method === "tools/list")
				return reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
			if (rpc.method === "tools/call") {
				const name = rpc.params?.name ?? "";
				const tool = tools.find((t) => t.name === name);
				if (!tool) return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32602, message: `unknown tool ${name}` } }, { status: 400 });
				try {
					return reply(content(await tool.run(rpc.params?.arguments ?? {})));
				} catch (err) {
					return reply(content({ error: err instanceof Error ? err.message : String(err) }, true));
				}
			}
			return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: `unknown method ${rpc.method}` } }, { status: 400 });
		}
		return Response.json({ ok: false, error: "not found" }, { status: 404 });
	},
});

console.log(`flotilla-mcp: http://127.0.0.1:${PORT}/mcp (phone bridge, focus-covenant on)`);
