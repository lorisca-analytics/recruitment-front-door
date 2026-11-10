// Builds a synthetic event: 400 applicants run through the real pipeline logic.
// Fixed seed, so every run produces the same files.
// Nothing here comes from a real event. Names are random pairs from common
// first and last names, emails use example.com, phone numbers start 0000 so
// they can never reach anyone, and there are no ID numbers at all.

import { mkdirSync, writeFileSync } from 'node:fs';
import {
  Application,
  Candidate,
  DEMO_CONFIG,
  Desk,
  Education,
  ExperienceLevel,
  LOG_KEY,
  applyPaperDecision,
  checkDuplicates,
  dueMessage,
  formatId,
  move,
  routeToDesks,
} from '../src/core';
import { FORM_FIELDS, SYSTEM_FIELDS } from '../src/gas/sheet';

// ---------- deterministic randomness ----------
let state = 20260314;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const weighted = <T>(pairs: [T, number][]): T => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
};

// ---------- pools ----------
const FIRST_F = ['Ayu', 'Dewi', 'Rina', 'Sari', 'Putri', 'Nadia', 'Intan', 'Maya', 'Fitri', 'Lestari', 'Wulan', 'Citra', 'Anisa', 'Rizka', 'Tika'];
const FIRST_M = ['Budi', 'Agus', 'Rizal', 'Dimas', 'Fajar', 'Hendra', 'Yoga', 'Bayu', 'Arif', 'Rendy', 'Eko', 'Galih', 'Ilham', 'Teguh', 'Wahyu'];
const LAST = ['Pratama', 'Saputra', 'Wijaya', 'Kurniawan', 'Hidayat', 'Nugroho', 'Santoso', 'Permata', 'Maharani', 'Utami', 'Setiawan', 'Rahayu', 'Purnama', 'Anggraini', 'Firmansyah'];
const AREAS = ['North', 'South', 'East', 'West', 'Central'];
const OTHER_TOWNS = ['Sample Town', 'Harbour City', 'Hill Town'];
// Stage 1 channels. Each one runs its own first screening before sending candidates the form link.
const SOURCES: [string, number][] = [['Job portal A', 34], ['Job portal B', 26], ['Job portal C', 18], ['Job portal D', 10], ['Campus job fair', 12]];
const UNIS = ['Demo State University', 'Northfield Polytechnic', 'Sample Institute of Business', 'Eastside University', 'Central Academy of Finance'];
const MAJORS = ['Management', 'Accounting', 'Communication', 'Economics', 'Informatics', 'Psychology', 'Agriculture', 'Law'];
const COMPANIES = ['Sample Retail Co', 'Demo Telco Store', 'Northwind Finance', 'Sample Cafe', 'Example Logistics', 'Demo Insurance Agency', 'Contoso Motors', 'Fabrikam Foods'];
const ROLES = ['Sales Associate', 'Account Officer', 'Barista', 'Admin Staff', 'Customer Service', 'Marketing Staff', 'Cashier', 'Relationship Officer', 'Field Collector'];

const EDU: [Education, number][] = [['High school', 10], ['Diploma 1-2', 3], ['Diploma 3', 24], ['Bachelor', 59], ['Master', 4]];
const TRACK: [string, number][] = [['SALES', 50], ['TRAINEE', 30], ['ADVISOR', 20]];

const ev = DEMO_CONFIG.eventDate;
const pad2 = (n: number) => String(n).padStart(2, '0');

function makeApplication(i: number): Application {
  const sex = chance(0.55) ? 'F' : 'M';
  const first = pick(sex === 'F' ? FIRST_F : FIRST_M);
  const last = pick(LAST);
  const age = weighted<number>([[int(19, 21), 10], [int(22, 26), 62], [int(27, 30), 20], [int(31, 40), 8]]);
  const birthDate = `${2026 - age}-${pad2(int(1, 12))}-${pad2(int(1, 28))}`;
  const education = weighted(EDU);
  const level = weighted<ExperienceLevel>([
    ['Fresh graduate, no work experience', 35],
    ['Fresh graduate, some work experience', 25],
    ['Experienced', 40],
  ]);
  const working = level !== 'Fresh graduate, no work experience' || chance(0.06); // a few contradict themselves
  const startY = 2026 - int(1, 5);
  const start = `${startY}-${pad2(int(1, 12))}`;
  const stillThere = chance(0.3);
  const endMonths = int(2, 30);
  const endDate = new Date(Date.UTC(2026, 2 - endMonths, 1));
  let end: string | null = stillThere ? null : `${endDate.getUTCFullYear()}-${pad2(endDate.getUTCMonth() + 1)}`;
  if (end && end < start) end = `${startY}-12`;
  const local = chance(0.85);
  const town = local ? 'Demo City' : pick(OTHER_TOWNS);
  const submitted = new Date(Date.UTC(2026, 1, 1) + int(0, 34) * 86400000 + int(0, 86399) * 1000).toISOString();

  const appliedTrack = weighted(TRACK);
  return {
    hasSalesLicence: chance(appliedTrack === 'ADVISOR' ? 0.75 : 0.2),
    submittedAt: submitted,
    email: `${first}.${last}.${i}@example.com`.toLowerCase(),
    consent: !chance(0.01),
    fullName: `${first} ${last}`,
    birthDate,
    sex,
    whatsapp: `0000 ${int(1000, 9999)} ${int(1000, 9999)}`,
    domicileCity: town,
    domicileArea: local ? pick(AREAS) : town,
    education,
    institution: education === 'High school' ? 'Demo Senior High School' : pick(UNIS),
    major: education === 'High school' ? 'General' : pick(MAJORS),
    gpa: education === 'High school' ? null : Math.round((2.65 + rand() * 1.33) * 100) / 100,
    activeStudent: chance(0.06),
    experienceLevel: level,
    lastCompany: working ? pick(COMPANIES) : '',
    lastRole: working ? pick(ROLES) : '',
    lastJobStart: working ? start : null,
    lastJobEnd: working ? end : null,
    lastPay: working ? int(30, 80) * 100000 : null,
    appliedTrack,
    source: weighted(SOURCES),
    cvUrl: '',
  };
}

function blank(app: Application, regId: string): Candidate {
  return {
    ...app,
    cvUrl: `https://example.com/cv/${regId}.pdf`,
    regId,
    status: 'REGISTERED',
    idCheck: 'PENDING',
    creditCheck: 'PENDING',
    docsReceivedAt: null,
    confirmedAt: null,
    checkedInAt: null,
    desk: null,
    interviewer: null,
    interviewNotes: '',
    finalTrack: null,
    paperReasons: [],
    duplicateOf: null,
    alsoVia: [],
    log: [],
  };
}

function sendAll(c: Candidate): Candidate {
  let x = c;
  for (let guard = 0; guard < 3; guard++) {
    const kind = dueMessage(x);
    if (!kind) break;
    x = { ...x, log: [...x.log, LOG_KEY[kind]], status: kind === 'invite' ? move(x.status, 'INVITED') : x.status };
  }
  return x;
}

const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();

// ---------- run the event ----------
const N = 400;
let cands: Candidate[] = [];
for (let i = 1; i <= N; i++) {
  const regId = formatId(DEMO_CONFIG.idPrefix, i, DEMO_CONFIG.idPad);
  // About 2% are repeat registrations by someone already in the list.
  // About 5% passed screening on a second portal and registered again, sometimes with a new email.
  let app: Application;
  if (i > 20 && chance(0.05)) {
    const prev = cands[int(0, cands.length - 1)];
    const fresh = makeApplication(i);
    const otherPortal = SOURCES.map(([s]) => s).filter((s) => s !== prev.source)[int(0, SOURCES.length - 2)];
    app = { ...prev, submittedAt: fresh.submittedAt, source: otherPortal, email: chance(0.5) ? prev.email : `${prev.fullName.toLowerCase().replace(/\s+/g, '.')}.${i}@example.com` };
  } else {
    app = makeApplication(i);
  }
  cands.push(blank(app, regId));
}
cands.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
cands = cands.map((c, i) => {
  const regId = formatId(DEMO_CONFIG.idPrefix, i + 1, DEMO_CONFIG.idPad);
  return { ...c, regId, cvUrl: `https://example.com/cv/${regId}.pdf` };
});

// The door: fold repeat registrations into the first one.
cands = checkDuplicates(cands).candidates;

// Paper decision on the form alone, then confirmation or rejection.
cands = cands.map((c) => sendAll(applyPaperDecision(c, DEMO_CONFIG)));

// Documents and background checks for those still in.
cands = cands.map((c) => {
  if (c.status !== 'REGISTERED') return c;
  const docs = chance(0.82) ? addHours(c.submittedAt, int(2, 96)) : null;
  if (!docs) return c;
  const roll = () => weighted<'CLEAR' | 'FLAGGED' | 'PENDING'>([['CLEAR', 90], ['FLAGGED', 4], ['PENDING', 6]]);
  return { ...c, docsReceivedAt: docs, idCheck: roll(), creditCheck: roll() };
});
cands = cands.map((c) => sendAll(applyPaperDecision(c, DEMO_CONFIG)));

// Attendance, check-in.
cands = cands.map((c) => {
  if (c.status !== 'INVITED') return c;
  if (!chance(0.78)) return chance(0.5) ? { ...c, status: move(c.status, 'NO_SHOW') } : c;
  const confirmed = { ...c, status: move(c.status, 'CONFIRMED'), confirmedAt: addHours(c.docsReceivedAt!, int(24, 120)) };
  if (!chance(0.84)) return { ...confirmed, status: move(confirmed.status, 'NO_SHOW') };
  const at = `${ev}T0${int(7, 9)}:${pad2(int(0, 59))}:00+07:00`;
  return { ...confirmed, status: move(confirmed.status, 'CHECKED_IN'), checkedInAt: new Date(at).toISOString() };
});

// Desks.
const desks: Desk[] = [
  { id: 'Desk 01', interviewer: 'Interviewer A', areas: ['North'] },
  { id: 'Desk 02', interviewer: 'Interviewer B', areas: ['North', 'Central'] },
  { id: 'Desk 03', interviewer: 'Interviewer C', areas: ['South'] },
  { id: 'Desk 04', interviewer: 'Interviewer D', areas: ['South', 'Central'] },
  { id: 'Desk 05', interviewer: 'Interviewer E', areas: ['East'] },
  { id: 'Desk 06', interviewer: 'Interviewer F', areas: ['West'] },
  { id: 'Desk 07', interviewer: 'Interviewer G', areas: ['West', 'East'] },
  { id: 'Desk 08', interviewer: 'Interviewer H', areas: [] },
];
const here = cands.filter((c) => c.status === 'CHECKED_IN');
const routing = routeToDesks(here, desks, DEMO_CONFIG.candidatesPerDesk + 4);
cands = cands.map((c) => {
  const desk = routing.assignments.get(c.regId);
  return desk ? { ...c, desk, interviewer: desks.find((d) => d.id === desk)!.interviewer } : c;
});

// Interview outcomes. Invented ratios.
cands = cands.map((c) => {
  if (c.status !== 'CHECKED_IN' || !c.desk) return c;
  const result = weighted<'INTERVIEW_OK' | 'INTERVIEW_NOT_OK' | 'INTERVIEW_REFER'>([
    ['INTERVIEW_OK', 46], ['INTERVIEW_NOT_OK', 40], ['INTERVIEW_REFER', 14],
  ]);
  let x: Candidate = { ...c, status: move(c.status, result), finalTrack: c.appliedTrack };
  if (result === 'INTERVIEW_REFER') x.finalTrack = pick(['SALES', 'TRAINEE', 'ADVISOR'].filter((t) => t !== c.appliedTrack));
  if (result === 'INTERVIEW_OK' && chance(0.85)) {
    x = { ...x, status: move(x.status, 'OFFER_SENT') };
    if (chance(0.8)) x = { ...x, status: move(x.status, 'JOINED') };
  }
  return x;
});

// ---------- write files ----------
mkdirSync('sample', { recursive: true });
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const header = (f: string | readonly string[]) => (typeof f === 'string' ? f : f[0]);
const yn = (b: boolean) => (b ? 'Yes' : 'No');

const formHeaders = Object.values(FORM_FIELDS).map(header);
const sysHeaders = Object.values(SYSTEM_FIELDS) as string[];
const regRows = cands.map((c) => [
  c.submittedAt, c.email, yn(c.consent), c.fullName, c.birthDate, c.sex === 'F' ? 'Female' : 'Male', c.whatsapp,
  c.domicileCity, c.domicileArea, c.education, c.institution, c.major, c.gpa ?? '', yn(c.activeStudent),
  c.experienceLevel, c.lastCompany, c.lastRole, c.lastJobStart ?? '', c.lastJobEnd ?? '', c.lastPay ?? '',
  yn(c.hasSalesLicence), c.appliedTrack, c.source, c.cvUrl,
  c.regId, c.status, c.idCheck, c.creditCheck, c.docsReceivedAt ?? '', c.confirmedAt ?? '', c.checkedInAt ?? '',
  c.desk ?? '', c.interviewer ?? '', c.interviewNotes, c.finalTrack ?? '', c.paperReasons.join(', '), c.duplicateOf ?? '', c.alsoVia.join(', '), c.log.join(' | '), '',
]);
writeFileSync('sample/registrations.csv', toCsv([[...formHeaders, ...sysHeaders], ...regRows]));

writeFileSync('sample/config.csv', toCsv([
  ['Key', 'Value'],
  ['ID prefix', DEMO_CONFIG.idPrefix], ['ID digits', DEMO_CONFIG.idPad], ['Event name', DEMO_CONFIG.eventName],
  ['Event date', DEMO_CONFIG.eventDate], ['Event time', DEMO_CONFIG.eventTime], ['Venue line 1', DEMO_CONFIG.venueLine1],
  ['Venue line 2', DEMO_CONFIG.venueLine2], ['Candidates per desk', DEMO_CONFIG.candidatesPerDesk],
  ['Max per online session', DEMO_CONFIG.maxPerSession], ['Max emails per run', DEMO_CONFIG.maxEmailsPerRun],
  ['Documents inbox', 'documents@example.com'], ['Attendance form URL', 'https://example.com/confirm'],
  ['Inbox mode', 'MOCK'], ['Gmail label', ''], ['Documents folder ID', ''], ['Card folder ID', ''],
]));
writeFileSync('sample/tracks.csv', toCsv([
  ['Code', 'Label', 'Min education', 'Min age', 'Max age', 'Min GPA', 'Needs sales licence', 'Allows active students', 'Zone colour', 'Seating area'],
  ...DEMO_CONFIG.tracks.map((t) => [t.code, t.label, t.minEducation, t.minAge, t.maxAge, t.minGpa ?? '', yn(t.requiresSalesLicence), yn(t.allowActiveStudents), t.zoneColour, t.seatingArea]),
]));
writeFileSync('sample/desks.csv', toCsv([['Desk', 'Interviewer', 'Areas'], ...desks.map((d) => [d.id, d.interviewer, d.areas.join(', ')])]));

// A mock inbox with a few problem emails, to show the intake log at work.
const withDocs = cands.filter((c) => c.docsReceivedAt).slice(0, 25);
const inbox: unknown[][] = [['Message ID', 'Received at', 'From', 'Subject', 'Attachments']];
withDocs.forEach((c, i) => inbox.push([`msg-${1000 + i}`, c.docsReceivedAt, c.email, `Documents ${c.regId}`, 'id-card.pdf, cv.pdf']));
inbox.push(['msg-2001', `${ev}T01:00:00Z`, 'someone@example.com', 'my documents', 'id-card.pdf, cv.pdf']);
inbox.push(['msg-2002', `${ev}T01:05:00Z`, cands[5].email, `Documents ${cands[5].regId}`, 'cv.docx']);
writeFileSync('sample/mock-inbox.csv', toCsv(inbox));

const checks: unknown[][] = [['Reg ID', 'Name', 'ID Check', 'Credit Check', 'Import Result']];
cands.filter((c) => c.docsReceivedAt).slice(0, 30).forEach((c) => checks.push([c.regId, c.fullName, c.idCheck, c.creditCheck, '']));
checks.push([cands[3].regId, 'Wrong Person', 'CLEAR', 'CLEAR', '']); // will be caught as a name mismatch
writeFileSync('sample/checks-import.csv', toCsv(checks));

writeFileSync('sample/candidates.json', JSON.stringify(cands, null, 1));

const counts = cands.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] || 0) + 1), m), {});
console.log(`Wrote ${cands.length} synthetic candidates.`, counts, `overflow ${routing.overflow.length}`);
