import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const esbuild = createRequire(new URL('../scratchpiler/package.json', import.meta.url))('esbuild');

const isWatch = process.argv.includes('--watch');
const [meta, pkg] = await Promise.all([
    fs.readFile(new URL('./src/meta.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('./package.json', import.meta.url), 'utf8'),
]);
const { version } = JSON.parse(pkg);

const context = await esbuild.context({
    entryPoints: ['src/userscript.js'],
    bundle: true,
    outfile: 'rebugger.user.js',
    format: 'iife',
    banner: { js: meta.replace(/(@version\s+)\S+/, `$1${version}`).trimEnd() },
    sourcemap: isWatch ? 'inline' : false,
});

if (isWatch) {
    await context.watch();
    console.log(`Watching for changes… [v${version}]`);
} else {
    await context.rebuild();
    await context.dispose();
    console.log(`Build complete. [v${version}]`);
}
