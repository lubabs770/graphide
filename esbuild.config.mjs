import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const webviewOnly = process.argv.includes('--webview');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: !watch,
};

const webviewConfig = {
  entryPoints: ['webview-src/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  sourcemap: true,
  minify: !watch,
};

const configs = webviewOnly
  ? [webviewConfig]
  : [extensionConfig, webviewConfig];

if (watch) {
  const contexts = await Promise.all(configs.map(c => esbuild.context(c)));
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('Watching for changes...');
} else {
  await Promise.all(configs.map(c => esbuild.build(c)));
  console.log('Build complete.');
}
