// HTML version of the candidate card, same layout as the Card tab.
// Used to render the sample PDF in this repo without a Google account.
import { CandidateCard, CardField, escapeHtml as e } from '../src/core';

const fields = (fs: CardField[]) =>
  fs
    .map((f) => `<tr><th>${e(f.label)}</th><td>${f.href ? `<a href="${e(f.href)}">${e(f.value)}</a>` : e(f.value)}</td></tr>`)
    .join('');

export function cardHtml(card: CandidateCard): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(card.regId)} ${e(card.name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2a37; font-size: 11px; margin: 0; }
  .sample { color: #a33; font-weight: bold; font-size: 10px; letter-spacing: 1px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #3d5a99; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 22px; margin: 4px 0 2px; }
  .headline { color: #4a5a70; font-size: 12px; }
  .id { text-align: right; font-size: 15px; font-weight: bold; }
  .status { font-size: 10px; color: #4a5a70; font-weight: normal; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 22px; }
  h2 { font-size: 10px; letter-spacing: 1px; color: #4a5a70; margin: 0 0 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; color: #4a5a70; font-weight: normal; width: 34%; padding: 3px 6px 3px 0; vertical-align: top; }
  td { padding: 3px 0; }
  a { color: #2e5aa8; }
  ul { margin: 0; padding-left: 16px; } li { margin-bottom: 5px; line-height: 1.35; }
  .trail th { width: 17%; }
  .notes { border: 1px solid #b8c2d0; min-height: 120px; padding: 8px; margin-top: 4px; white-space: pre-wrap; }
  @media screen { body { padding: 28px 32px; } }
  .result { margin-top: 16px; font-size: 10px; color: #4a5a70; }
</style></head><body>
<div class="sample">SAMPLE. SYNTHETIC DATA</div>
<header>
  <div><h1>${e(card.name)}</h1><div class="headline">${e(card.headline)}</div></div>
  <div class="id">${e(card.regId)}<br><span class="status">${e(card.status)}</span></div>
</header>
<div class="grid">
  <section><h2>BASICS</h2><table>${fields(card.basics)}</table></section>
  <section><h2>WORK</h2><table>${fields(card.work)}</table></section>
  <section><h2>EDUCATION</h2><table>${fields(card.education)}</table></section>
  <section><h2>PROBE POINTS FOR THIS CANDIDATE</h2><ul>${card.probes.map((p) => `<li>${e(p)}</li>`).join('')}</ul></section>
</div>
<h2 style="margin-top:18px">DECISION TRAIL</h2>
<table class="trail">${card.trail.map((t) => `<tr><th>${e(t.step)}</th><td>${e(t.detail)}</td></tr>`).join('')}</table>
<h2 style="margin-top:14px">INTERVIEW NOTES</h2>
<div class="notes">${e(card.notes)}</div>
<div class="result">Result: OK / NOT OK / REFER &nbsp;&nbsp;&nbsp; Final track: ______________ &nbsp;&nbsp;&nbsp; Interviewer: ______________</div>
</body></html>`;
}
