// Renders one synthetic candidate card to sample/candidate-card-sample.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { Candidate, DEMO_CONFIG, buildCard } from '../src/core';
import { cardHtml } from './cardHtml';

const all: Candidate[] = JSON.parse(readFileSync('sample/candidates.json', 'utf8'));
const pick = all
  .filter((c) => c.checkedInAt && c.desk && c.lastCompany)
  .map((c) => ({ c, n: buildCard(c, DEMO_CONFIG).probes.length + (c.alsoVia.length ? 10 : 0) }))
  .sort((a, b) => b.n - a.n || a.c.regId.localeCompare(b.c.regId))[0].c;

const card = buildCard({ ...pick, status: 'CHECKED_IN', interviewNotes: '' }, DEMO_CONFIG);
const html = cardHtml(card);
writeFileSync('sample/candidate-card-sample.html', html);

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.setContent(html);
  await page.pdf({ path: 'sample/candidate-card-sample.pdf', format: 'A4', printBackground: true });
  await page.setViewportSize({ width: 820, height: 600 });
  await page.screenshot({ path: 'docs/candidate-card.png', fullPage: true });
  await browser.close();
  console.log(`Sample card: ${card.regId}, ${card.probes.length} probe points`);
}
main();
