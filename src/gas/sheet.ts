// Spreadsheet adapter. The only file that knows how rows look.
// Everything is found by header name, so form questions can be reordered or
// added without touching code.

import {
  Application,
  Candidate,
  CheckResult,
  Education,
  EventConfig,
  ExperienceLevel,
  HeaderIndex,
  Status,
  Track,
  buildHeaderIndex,
  isStatus,
} from '../core';

export const TAB = {
  registrations: 'Registrations',
  config: 'Config',
  tracks: 'Tracks',
  desks: 'Desks',
  intakeLog: 'Intake Log',
  mockInbox: 'Mock Inbox',
  checks: 'Checks Import',
  attendance: 'Attendance Confirmations',
  card: 'Card',
  monitor: 'Monitor',
};

// Form questions. The first spelling is what the template uses.
export const FORM_FIELDS = {
  submittedAt: 'Timestamp',
  email: ['Email address', 'Email'],
  consent: 'I agree to the data statement',
  fullName: 'Full name (as on ID card)',
  birthDate: 'Date of birth',
  sex: 'Sex',
  whatsapp: 'Active WhatsApp number',
  domicileCity: 'Current city',
  domicileArea: 'Current area',
  education: 'Highest education',
  institution: 'School or university',
  major: 'Major',
  gpa: 'GPA',
  activeStudent: 'Are you still an active student?',
  experienceLevel: 'Which describes you?',
  lastCompany: 'Last company',
  lastRole: 'Last role',
  lastJobStart: 'Last job start (YYYY-MM)',
  lastJobEnd: 'Last job end (YYYY-MM, blank if current)',
  lastPay: 'Last monthly pay',
  hasSalesLicence: 'Do you hold a sales licence?',
  appliedTrack: 'Position applied for',
  source: ['Which job portal sent you this form?', 'Where did you hear about this job?'],
  cvUrl: 'Upload CV',
} as const;

// Columns the system owns, to the right of the form answers.
export const SYSTEM_FIELDS = {
  regId: 'Reg ID',
  status: 'Status',
  idCheck: 'ID Check',
  creditCheck: 'Credit Check',
  docsReceivedAt: 'Docs Received At',
  confirmedAt: 'Confirmed At',
  checkedInAt: 'Checked In At',
  desk: 'Desk',
  interviewer: 'Interviewer',
  interviewNotes: 'Interview Notes',
  finalTrack: 'Final Track',
  paperReasons: 'Paper Reasons',
  duplicateOf: 'Duplicate Of',
  alsoVia: 'Also Came Via',
  log: 'Send Log',
  lastError: 'Last Error',
} as const;

type FormKey = keyof typeof FORM_FIELDS;
type SysKey = keyof typeof SYSTEM_FIELDS;
export type RegKey = FormKey | SysKey;

export interface Row {
  rowNumber: number; // 1-based sheet row
  candidate: Candidate;
  lastError: string;
}

export function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

export function tab(name: string) {
  const sh = ss().getSheetByName(name);
  if (!sh) throw new Error(`Tab "${name}" is missing. Run "Create missing tabs" from the Front Door menu.`);
  return sh;
}

// ---------- value conversion ----------

const tz = () => ss().getSpreadsheetTimeZone();

/** Works for dates from any source, including ones that fail instanceof. */
export function isDate(v: unknown): v is Date {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function iso(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  if (isDate(v)) return v.toISOString();
  return String(v).trim() || null;
}

function ymd(v: unknown): string {
  if (isDate(v)) return Utilities.formatDate(v, tz(), 'yyyy-MM-dd');
  return String(v || '').trim();
}

function ym(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  if (isDate(v)) return Utilities.formatDate(v, tz(), 'yyyy-MM');
  return String(v).trim().slice(0, 7) || null;
}

function yes(v: unknown): boolean {
  return v === true || /^(yes|ya|true|i agree|agree)/i.test(String(v || '').trim());
}

function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

/** Money: keep digits only, so "Rp 4.500.000" and "4,500,000" both read as 4500000. */
function money(v: unknown): number | null {
  if (typeof v === 'number') return v;
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : null;
}

function check(v: unknown): CheckResult {
  const s = String(v || '').trim().toUpperCase();
  return s === 'CLEAR' || s === 'FLAGGED' ? (s as CheckResult) : 'PENDING';
}

// ---------- registrations ----------

export function regIndex(header: unknown[]): HeaderIndex<RegKey> {
  return buildHeaderIndex(header, { ...FORM_FIELDS, ...SYSTEM_FIELDS });
}

export function readRegistrations(): { rows: Row[]; idx: HeaderIndex<RegKey> } {
  const sh = tab(TAB.registrations);
  const values = sh.getDataRange().getValues();
  const idx = regIndex(values[0]);
  const rows: Row[] = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    if (v.every((x) => x === '')) continue;
    const g = (k: RegKey) => v[idx[k]];
    const app: Application = {
      submittedAt: iso(g('submittedAt')) || '',
      email: String(g('email') || '').trim(),
      consent: yes(g('consent')),
      fullName: String(g('fullName') || '').trim(),
      birthDate: ymd(g('birthDate')),
      sex: String(g('sex')).trim().toUpperCase().startsWith('M') ? 'M' : 'F',
      whatsapp: String(g('whatsapp') || ''),
      domicileCity: String(g('domicileCity') || '').trim(),
      domicileArea: String(g('domicileArea') || '').trim(),
      education: String(g('education')).trim() as Education,
      institution: String(g('institution') || '').trim(),
      major: String(g('major') || '').trim(),
      gpa: num(g('gpa')),
      activeStudent: yes(g('activeStudent')),
      experienceLevel: String(g('experienceLevel')).trim() as ExperienceLevel,
      lastCompany: String(g('lastCompany') || '').trim(),
      lastRole: String(g('lastRole') || '').trim(),
      lastJobStart: ym(g('lastJobStart')),
      lastJobEnd: ym(g('lastJobEnd')),
      lastPay: money(g('lastPay')),
      hasSalesLicence: yes(g('hasSalesLicence')),
      appliedTrack: trackCodeFrom(String(g('appliedTrack') || '')),
      source: String(g('source') || '').trim(),
      cvUrl: String(g('cvUrl') || '').split(',')[0].trim(),
    };
    const status = String(g('status') || '').trim();
    const candidate: Candidate = {
      ...app,
      regId: String(g('regId') || '').trim(),
      status: (isStatus(status) ? status : 'REGISTERED') as Status,
      idCheck: check(g('idCheck')),
      creditCheck: check(g('creditCheck')),
      docsReceivedAt: iso(g('docsReceivedAt')),
      confirmedAt: iso(g('confirmedAt')),
      checkedInAt: iso(g('checkedInAt')),
      desk: String(g('desk') || '').trim() || null,
      interviewer: String(g('interviewer') || '').trim() || null,
      interviewNotes: String(g('interviewNotes') || ''),
      finalTrack: String(g('finalTrack') || '').trim() || null,
      paperReasons: String(g('paperReasons') || '').split(',').map((s) => s.trim()).filter(Boolean),
      duplicateOf: String(g('duplicateOf') || '').trim() || null,
      alsoVia: String(g('alsoVia') || '').split(',').map((s) => s.trim()).filter(Boolean),
      log: String(g('log') || '').split(/\s*\|\s*/).filter(Boolean),
    };
    rows.push({ rowNumber: r + 1, candidate, lastError: String(g('lastError') || '') });
  }
  return { rows, idx };
}

/** "Sales Officer (SALES)" or "SALES" both give "SALES". */
export function trackCodeFrom(answer: string): string {
  const m = answer.match(/\(([A-Z_]+)\)\s*$/);
  return (m ? m[1] : answer).trim().toUpperCase();
}

const WRITABLE: SysKey[] = [
  'regId', 'status', 'idCheck', 'creditCheck', 'docsReceivedAt', 'confirmedAt', 'checkedInAt',
  'desk', 'interviewer', 'finalTrack', 'paperReasons', 'duplicateOf', 'alsoVia', 'log', 'lastError',
];

/** Writes system columns for one row. Form answers are never overwritten. */
export function writeSystem(row: Row, idx: HeaderIndex<RegKey>, patch: Partial<Record<SysKey, string>>) {
  const sh = tab(TAB.registrations);
  (Object.keys(patch) as SysKey[]).forEach((k) => {
    if (!WRITABLE.includes(k)) throw new Error(`Column ${k} is not system-owned`);
    sh.getRange(row.rowNumber, idx[k] + 1).setValue(patch[k]);
  });
}

export function systemPatch(c: Candidate): Partial<Record<SysKey, string>> {
  return {
    regId: c.regId,
    status: c.status,
    idCheck: c.idCheck,
    creditCheck: c.creditCheck,
    docsReceivedAt: c.docsReceivedAt || '',
    confirmedAt: c.confirmedAt || '',
    checkedInAt: c.checkedInAt || '',
    desk: c.desk || '',
    interviewer: c.interviewer || '',
    finalTrack: c.finalTrack || '',
    paperReasons: c.paperReasons.join(', '),
    duplicateOf: c.duplicateOf || '',
    alsoVia: c.alsoVia.join(', '),
    log: c.log.join(' | '),
  };
}

// ---------- config ----------

export function readConfig(): EventConfig {
  const kv = new Map<string, unknown>();
  tab(TAB.config)
    .getDataRange()
    .getValues()
    .slice(1)
    .forEach(([k, v]) => k && kv.set(String(k).trim(), v));
  const need = (k: string) => {
    if (!kv.has(k) || kv.get(k) === '') throw new Error(`Config value "${k}" is empty`);
    return kv.get(k);
  };
  return {
    idPrefix: String(need('ID prefix')).trim().toUpperCase(),
    idPad: Number(need('ID digits')),
    eventName: String(need('Event name')),
    eventDate: ymd(need('Event date')),
    eventTime: String(need('Event time')),
    venueLine1: String(need('Venue line 1')),
    venueLine2: String(need('Venue line 2')),
    candidatesPerDesk: Number(need('Candidates per desk')),
    maxPerSession: Number(need('Max per online session')),
    maxEmailsPerRun: Number(need('Max emails per run')),
    tracks: readTracks(),
  };
}

export function configValue(key: string): string {
  const row = tab(TAB.config)
    .getDataRange()
    .getValues()
    .find(([k]) => String(k).trim() === key);
  return row ? String(row[1]).trim() : '';
}

function readTracks(): Track[] {
  const values = tab(TAB.tracks).getDataRange().getValues();
  const idx = buildHeaderIndex(values[0], {
    code: 'Code', label: 'Label', minEducation: 'Min education', minAge: 'Min age', maxAge: 'Max age',
    minGpa: 'Min GPA', requiresSalesLicence: 'Needs sales licence', allowActiveStudents: 'Allows active students',
    zoneColour: 'Zone colour', seatingArea: 'Seating area',
  });
  return values.slice(1).filter((v) => v[idx.code]).map((v) => ({
    code: String(v[idx.code]).trim().toUpperCase(),
    label: String(v[idx.label]),
    minEducation: String(v[idx.minEducation]).trim() as Education,
    minAge: Number(v[idx.minAge]),
    maxAge: Number(v[idx.maxAge]),
    minGpa: num(v[idx.minGpa]),
    requiresSalesLicence: yes(v[idx.requiresSalesLicence]),
    allowActiveStudents: yes(v[idx.allowActiveStudents]),
    zoneColour: String(v[idx.zoneColour]),
    seatingArea: String(v[idx.seatingArea]),
  }));
}
