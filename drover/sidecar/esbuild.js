const esbuild = require("esbuild");
esbuild.build({
  entryPoints: ["src/sidecar.ts"],
  bundle: true,
  outfile: "dist/sidecar.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
}).catch(() => process.exit(1));
