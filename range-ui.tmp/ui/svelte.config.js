import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Tailwind is wired as a Vite plugin (see vite.config.ts), so no postcss config.
export default { preprocess: vitePreprocess() };
