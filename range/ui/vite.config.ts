import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { compression } from "vite-plugin-compression2";
import path from "node:path";

// KaTeX's CSS lists woff2/woff/ttf fallbacks per font-face, but browsers only
// ever fetch the first format they support (woff2, universally today) - the
// other two formats are never downloaded, they just bloat the build output
// (and the Go binary it's embedded into). Strip them at build time.
function stripKatexFontFallbacks(): Plugin {
  return {
    name: "strip-katex-font-fallbacks",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("katex.min.css")) return null;
      return code.replace(
        /url\(([^)]+\.woff2)\) format\("woff2"\),url\([^)]+\.woff\) format\("woff"\),url\([^)]+\.ttf\) format\("truetype"\)/g,
        'url($1) format("woff2")',
      );
    },
  };
}

// Already-compressed formats: re-compressing them wastes build time and only
// bloats the embedded assets with .gz/.br copies nobody benefits from.
const compressionExclude = [/\.(br|gz)$/, /\.(png|jpe?g|gif|webp|avif|ico)$/, /\.(woff2?)$/];

// The master UI frames every daemon that serves a page (see src/lib/surfaces.ts),
// so those origins must be reachable from the dev server's proxy. It is served
// separately from herd and reaches herd's API through the apiBase shim, so the
// dev proxy keeps the same-origin dev experience the embedded build had.
export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    stripKatexFontFallbacks(),
    // The option is `algorithms` (plural) - the plugin ignores unknown keys and
    // silently runs both gzip and brotli, whose second pass also compresses
    // files the exclude filter already rejected.
    compression({
      algorithms: ["brotliCompress"],
      exclude: compressionExclude,
      threshold: 1024,
    }),
  ],
  base: "/ui/",
  resolve: {
    alias: {
      $lib: path.resolve(__dirname, "./src/lib"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // The playground chunk (markdown/KaTeX/highlight.js) is deferred and
    // loaded only after initial mount, so its size doesn't affect first paint.
    chunkSizeWarningLimit: 700,
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.UI_DEV_PORT ?? 25100 + 1),
    proxy: {
      // herd, the API this UI is herd-shaped against (README provenance table).
      "/api/herd": { target: "http://127.0.0.1:25100", changeOrigin: true },
      "/api/flock": { target: "http://127.0.0.1:25193", changeOrigin: true },
    },
  },
});
