/** @slate/ux — design tokens (own values: darker + more cinematic than Loom). */

export const SLATE_TOKENS = {
	/** TV overscan-safe margin — content never starts closer than this to the edge. */
	overscanPx: 32,
	colors: {
		background: "#000000",
		panel: "#0a0a0c",
		raised: "#141418",
		text: "#f5f5f7",
		muted: "#8e8e96",
		accent: "#4f7cff",   // slate blue — distinct from Loom/Netflix red
		accentHot: "#7aa2ff",
		focus: "#ffffff",
		danger: "#ff3366",
	},
	motion: {
		focusMs: 140,       // focus ring transition
		heroRotateMs: 8000, // billboard rotation
		osdFadeMs: 3200,    // OSD auto-hide
	},
	typography: {
		base: "20px",       // 10-foot UI floor
		hero: "56px",
	},
} as const;

export function tokenCss(): string {
	const c = SLATE_TOKENS;
	return `:root {
--slate-overscan: ${c.overscanPx}px;
--slate-bg: ${c.colors.background};
--slate-panel: ${c.colors.panel};
--slate-raised: ${c.colors.raised};
--slate-text: ${c.colors.text};
--slate-muted: ${c.colors.muted};
--slate-accent: ${c.colors.accent};
--slate-accent-hot: ${c.colors.accentHot};
--slate-focus: ${c.colors.focus};
--slate-danger: ${c.colors.danger};
--slate-focus-ms: ${c.motion.focusMs}ms;
--slate-hero-ms: ${c.motion.heroRotateMs}ms;
--slate-osd-fade-ms: ${c.motion.osdFadeMs}ms;
}`;
}
