import { build } from 'esbuild';

await build({
  entryPoints: ['src/launch.mjs'],
  outfile: 'dist/launch.js',
  bundle: true,
  format: 'iife',
  globalName: 'SparkLaunch',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  inject: ['src/shim.mjs'],
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info'
});
