// Before and after the door, on synthetic data.
// "Before": the same candidates as three portal exports would show them, each
// in its own shape. Recruiters had to read and re-type these by hand.
// "After": the same people as one form record each, with one ID, the portal
// they came through, and the repeat registration folded in.
// The portal layouts are invented to show typical differences. They do not
// copy any real portal's export format.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Candidate, normalizeWhatsapp } from '../src/core';

const all: Candidate[] = JSON.parse(readFileSync('sample/candidates.json', 'utf8'));
const shown = ['Job portal A', 'Job portal B', 'Job portal C'];
const dup = all.find((c) => c.status === 'DUPLICATE' && shown.includes(c.source) && shown.includes(all.find((o) => o.regId === c.duplicateOf)!.source))!;
const original = all.find((c) => c.regId === dup.duplicateOf)!;
const pick = (portal: string, n: number) =>
  all.filter((c) => c.source === portal && c.status !== 'DUPLICATE' && c.regId !== original.regId).slice(0, n);

const people: { portal: string; c: Candidate }[] = [
  { portal: original.source, c: original },
  { portal: dup.source, c: dup },
  ...pick('Job portal A', 2).map((c) => ({ portal: 'Job portal A', c })),
  ...pick('Job portal B', 2).map((c) => ({ portal: 'Job portal B', c })),
  ...pick('Job portal C', 2).map((c) => ({ portal: 'Job portal C', c })),
];

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const dmy = (ymd: string) => ymd.split('-').reverse().join('/');
const age = (ymd: string) => 2026 - Number(ymd.slice(0, 4));
const degreeWords: Record<string, string> = {
  'High school': 'Senior high school',
  'Diploma 1-2': 'D1/D2',
  'Diploma 3': 'D3 / Associate',
  Bachelor: "Bachelor's degree",
  Master: "Master's degree",
  Doctorate: 'PhD',
};

const shapes: Record<string, { header: string[]; row: (c: Candidate) => unknown[] }> = {
  'Job portal A': {
    header: ['Applicant Name', 'Phone', 'E-mail', 'DOB (DD/MM/YYYY)', 'Last Education', 'Applied For'],
    row: (c) => [c.fullName.toUpperCase(), '+62 ' + c.whatsapp.slice(1).replace(/\s/g, '-'), c.email, dmy(c.birthDate), c.education.toUpperCase(), 'Sales'],
  },
  'Job portal B': {
    header: ['first_name', 'last_name', 'mobile', 'email', 'birth_date', 'degree', 'resume_link'],
    row: (c) => [c.fullName.split(' ')[0], c.fullName.split(' ').slice(1).join(' '), c.whatsapp.replace(/\s/g, ''), c.email, c.birthDate, degreeWords[c.education], c.cvUrl],
  },
  'Job portal C': {
    header: ['Candidate', 'Contact', 'Age', 'Education level', 'Notes'],
    row: (c) => [c.fullName, `${c.email} / ${c.whatsapp}`, age(c.birthDate), degreeWords[c.education], c.lastRole ? `ex ${c.lastRole}` : ''],
  },
};

mkdirSync('sample/before-after', { recursive: true });
for (const portal of Object.keys(shapes)) {
  const rows = people.filter((p) => p.portal === portal).map((p) => shapes[portal].row(p.c));
  const file = `sample/before-after/before-${portal.toLowerCase().replace(/\s+/g, '-')}.csv`;
  writeFileSync(file, toCsv([shapes[portal].header, ...rows]));
}

const after = [
  ['Reg ID', 'Full name', 'Date of birth', 'WhatsApp', 'Email', 'Highest education', 'Came through', 'Also came via', 'Status', 'Duplicate of'],
  ...people.map(({ c }) => [
    c.regId, c.fullName, c.birthDate, normalizeWhatsapp(c.whatsapp), c.email, c.education, c.source, c.alsoVia.join(', '), c.status, c.duplicateOf ?? '',
  ]),
];
writeFileSync('sample/before-after/after-one-door.csv', toCsv(after));

console.log(`Before/after built for ${people.length} registrations. Repeat: ${dup.regId} -> ${original.regId}`);
