import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// The master UI frames every daemon that serves a page (see src/lib/surfaces.ts),
// so those origins must be reachable from the dev server's proxy and allowed by
// CORS. Cross-origin framing needs the response headers below on the target side.
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    port: Number(process.env.UI_DEV_PORT ?? 25100 + 1),
    proxy: {
      // herd, the API this UI is herd-shaped against (README provenance table).
      "/api/herd": { target: "http://127.0.0.1:25100", changeOrigin: true },
      "/api/flock": { target: "http://127.0.0.1:25193", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});