// Builds docs/demo/index.html: the real check-in page plus a bundled copy of
// the lookup logic and a slim slice of the synthetic candidates.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const all = JSON.parse(readFileSync('sample/candidates.json', 'utf8'));
const slim = all.map((c) => ({
  regId: c.regId, fullName: c.fullName, status: c.status === 'CHECKED_IN' || c.status.startsWith('INTERVIEW') || c.status === 'OFFER_SENT' || c.status === 'JOINED' ? 'CONFIRMED' : c.status,
  appliedTrack: c.appliedTrack, finalTrack: null, desk: c.desk,
}));
writeFileSync('scripts/demo/candidates.slim.json', JSON.stringify(slim));

const out = await build({ entryPoints: ['scripts/demo/entry.ts'], bundle: true, format: 'iife', target: 'es2019', write: false, minify: true });
const js = out.outputFiles[0].text;

const tryIds = slim.filter((c) => c.status === 'CONFIRMED').slice(0, 3).map((c) => Number(c.regId.split('-')[1]));
const rejected = slim.find((c) => c.status === 'PAPER_REJECT');
const note = `<p class="sub" style="margin-top:24px">Demo on synthetic data. Try ${tryIds.join(', ')} (invited), ${Number(rejected.regId.split('-')[1])} (rejected on paper) or 999 (not registered). Check in the same number twice to see the repeat warning.</p>`;

let html = readFileSync('src/html/checkin.html', 'utf8');
html = html.replace('<base target="_top">', () => '<title>Check-in demo</title>');
html = html.replace('<div id="out" aria-live="polite"></div>', () => '<div id="out" aria-live="polite"></div>\n  ' + note);
html = html.replace('</body>', () => `<script>${js}</script>\n</body>`);
mkdirSync('docs/demo', { recursive: true });
writeFileSync('docs/demo/index.html', html);
console.log('Built docs/demo/index.html');
