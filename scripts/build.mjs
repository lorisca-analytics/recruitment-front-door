// Bundles src/gas into one Code.js for Apps Script.
// Apps Script only sees top-level functions, so each exported entry point gets
// a small global wrapper that calls into the bundle.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

await build({
  entryPoints: ['src/gas/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'App',
  target: 'es2019',
  outfile: 'dist/bundle.js',
  logLevel: 'warning',
});

const src = readFileSync('src/gas/main.ts', 'utf8');
const entries = [...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
const stubs = entries.map((n) => `function ${n}(e) { return App.${n}(e); }`).join('\n');
writeFileSync('dist/Code.js', readFileSync('dist/bundle.js', 'utf8') + '\n' + stubs + '\n');
rmSync('dist/bundle.js');

for (const f of readdirSync('src/html')) cpSync(`src/html/${f}`, `dist/${f}`);
cpSync('appsscript.json', 'dist/appsscript.json');
console.log(`Built dist/Code.js with ${entries.length} entry points: ${entries.join(', ')}`);
