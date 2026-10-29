#!/usr/bin/env bun
// slate-assets.ts — generate SLATE brand assets (icon, largeIcon, splash, hero).
// SVG-native → PNG via ffmpeg (present in service/bin + system). Own aesthetic:
// slate blue (#4f7cff) on midnight (#0a0a0c) — distinct from Stremio/Loom/Netflix.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = Bun.env.SLATE_ASSETS ?? "/home/toxic/pens/ranch/products/nuvio/nuvio-webos/app";
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/assets`, { recursive: true });

const ACCENT = "#4f7cff";
const ACCENT_HOT = "#7aa2ff";
const BG = "#0a0a0c";
const BLACK = "#000000";

/** SLATE wordmark icon — beveled slate stone + brand accent. */
const iconSvg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="#05070f"/>
    </linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT_HOT}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <g filter="url(#glow)">
    <path d="M256 96 L400 176 L400 336 L256 416 L112 336 L112 176 Z"
          fill="none" stroke="url(#stone)" stroke-width="18" stroke-linejoin="round"/>
    <path d="M256 168 L344 216 L344 296 L256 344 L168 296 L168 216 Z"
          fill="url(#stone)" opacity="0.9"/>
  </g>
  <text x="256" y="470" font-family="Arial, Helvetica, sans-serif" font-size="56"
        font-weight="700" fill="${ACCENT_HOT}" text-anchor="middle"
        letter-spacing="14">SLATE</text>
</svg>`;

/** Splash — floating slate stone + wordmark on deep midnight (webOS splash.png 1920x1080). */
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.42" r="1.1">
      <stop offset="0" stop-color="#161a2b"/>
      <stop offset="0.5" stop-color="#0e1017"/>
      <stop offset="1" stop-color="#05070f"/>
    </radialGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b7bac4"/>
      <stop offset="0.5" stop-color="#8a8ea6"/>
      <stop offset="1" stop-color="#5b5f70"/>
    </linearGradient>
    <filter id="stoneShade" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="sh"/>
      <feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f7cff" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#4f7cff" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <!-- soft horizon band (no sharp line) -->
  <path d="M0 840 C640 780 1280 800 1920 860 L1920 1080 L0 1080 Z" fill="#000000" opacity="0.35"/>
  <path d="M0 840 C640 790 1280 810 1920 870 L1920 1080 L0 1080 Z" fill="url(#ridge)"/>
  <!-- floating stone: no enclosing box -->
  <g transform="translate(960,520)" filter="url(#stoneShade)">
    <path d="M0 -140 L130 -78 L130 78 L0 140 L-130 78 L-130 -78 Z"
          fill="url(#stone)" filter="url(#stoneShade)"/>
    <path d="M0 -90 L80 -46 L80 46 L0 90 L-80 46 L-80 -46 Z"
          fill="#c9cdd6"/>
  </g>
  <text x="960" y="720" font-family="Arial, Helvetica, sans-serif" font-size="120"
        font-weight="800" fill="#f5f5f7" text-anchor="middle"
        letter-spacing="32">SLATE</text>
  <text x="960" y="800" font-family="Arial, Helvetica, sans-serif" font-size="24"
        fill="#4f7cff" text-anchor="middle"
        letter-spacing="8">cinematic tv · live · your library</text>
</svg>
`;

/** Hero billboard placeholder — cinematic 16:9 gradient w/ vignette. */
const heroSvg = (title = "SLATE ORIGINAL") => `
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c1220"/>
      <stop offset="0.5" stop-color="#0a0a0c"/>
      <stop offset="1" stop-color="#05070f"/>
    </linearGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.85"/>
    </radialGradient>
    <linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <path d="M0 760 L340 640 L560 720 L880 600 L1200 700 L1560 620 L1920 700 L1920 1080 L0 1080 Z" fill="url(#ridge)"/>
  <rect width="1920" height="1080" fill="url(#vig)"/>
  <text x="120" y="920" font-family="Arial, Helvetica, sans-serif" font-size="64"
        font-weight="700" fill="#f5f5f7" letter-spacing="8">${title}</text>
  <text x="120" y="975" font-family="Arial, Helvetica, sans-serif" font-size="30"
        fill="${ACCENT_HOT}" letter-spacing="4">SLATE · billboard placeholder</text>
</svg>`;

async function raster(svg: string, out: string, size?: string): Promise<void> {
	writeFileSync(`/tmp/${out.replace("/", "-")}.svg`, svg);
	const tmpSvg = `/tmp/${out.replace("/", "-")}.svg`;
	// ffmpeg SVG demuxing is limited; prefer rsvg-convert if present, else ffmpeg -i svg
	const tryRsvg = Bun.spawnSync(["bash", "-c", `command -v rsvg-convert >/dev/null && rsvg-convert ${size ? `-w ${size.split("x")[0]}` : ""} -o "${join(OUT, out)}" "${tmpSvg}" || ffmpeg -y -loglevel error -i "${tmpSvg}" "${join(OUT, out)}"`]);
	if (tryRsvg.exitCode !== 0) throw new Error(`raster failed for ${out}: ${tryRsvg.stderr.toString().slice(0, 200)}`);
}

await raster(iconSvg(512), "icon.png");
await raster(iconSvg(320), "largeIcon.png");
await raster(splashSvg, "splash.png");
await raster(heroSvg(), "assets/hero-slate.png");

// poster fallback (2:3 portrait rail card)
const posterSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141418"/>
      <stop offset="1" stop-color="#05070f"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" rx="16" fill="url(#p)"/>
  <rect x="16" y="16" width="368" height="420" rx="10" fill="#0c1018"/>
  <path d="M200 210 L260 245 L260 315 L200 350 L140 315 L140 245 Z" fill="${ACCENT}" opacity="0.85"/>
  <text x="200" y="480" font-family="Arial" font-size="28" fill="#8e8e96" text-anchor="middle">SLATE</text>
  <text x="200" y="515" font-family="Arial" font-size="20" fill="#4f7cff" text-anchor="middle">poster fallback</text>
</svg>`;
await raster(posterSvg, "assets/poster-fallback.png");

console.log(`assets → ${OUT}`);
console.log(Bun.spawnSync(["ls", "-la", OUT, `${OUT}/assets`]).stdout.toString());