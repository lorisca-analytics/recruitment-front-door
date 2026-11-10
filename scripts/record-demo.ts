// Records docs/checkin-demo.gif from the static demo page.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

async function main() {
  const html = readFileSync('docs/demo/index.html', 'utf8');
  const ids = [...html.matchAll(/Try (\d+), (\d+), (\d+) \(invited\), (\d+) \(rejected/g)][0];
  const seq = [ids[1], ids[4], '999', ids[1]];
  rmSync('/tmp/frames', { recursive: true, force: true });
  mkdirSync('/tmp/frames');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 560, height: 560 } });
  await page.goto('file://' + process.cwd() + '/docs/demo/index.html');
  let n = 0;
  const snap = async (times = 1) => {
    for (let i = 0; i < times; i++) await page.screenshot({ path: `/tmp/frames/f${String(n++).padStart(3, '0')}.png` });
  };
  await snap(3);
  for (const id of seq) {
    for (const ch of id) {
      await page.type('#code', ch);
      await snap(1);
    }
    await page.click('button');
    await page.waitForTimeout(150);
    await snap(10);
  }
  await browser.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '4', '-i', '/tmp/frames/f%03d.png',
    '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', 'docs/checkin-demo.gif']);
  console.log(`GIF with ${n} frames`);
}
main();
