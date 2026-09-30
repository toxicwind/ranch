const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');

const opts = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  loader: { '.ts': 'ts' },
  tsconfig: 'tsconfig.json',
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.watch();
    console.log('[esbuild] watching');
  } else {
    await esbuild.build(opts);
    console.log('[esbuild] built');
  }
})();
