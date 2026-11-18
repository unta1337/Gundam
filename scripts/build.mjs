import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('www', { recursive: true });
await build({
  entryPoints: ['mobile/native.js'], bundle: true, minify: true,
  format: 'iife', target: ['chrome110', 'safari15'], outfile: 'www/native.js',
});
const source = await readFile('gunpla_spend_tracker_editable_price.html', 'utf8');
const output = source.replace('    <!-- Application Script Logic -->',
  '    <script src="native.js"></script>\n    <!-- Application Script Logic -->');
if (output === source) throw new Error('Application script marker is missing.');
await writeFile('www/index.html', output);
console.log('Built www/index.html and native.js');
