// Runs the built Apps Script bundle (dist/Code.js) against an in-memory fake of
// the Sheets, Mail, Lock and Html services. This checks the glue between the
// sheet and the core logic, end to end, without a Google account.
// Run `npm run build` and `npm run seed` first (CI does both).

import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

class FakeSheet {
  constructor(public name: string, public data: unknown[][]) {}
  getName() { return this.name; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getSheetId() { return 1; }
  getDataRange() {
    return { getValues: () => this.data.map((r) => [...r]) };
  }
  getRange(row: number, col: number, nr = 1, nc = 1) {
    const sheet = this;
    const ensure = (r: number, c: number) => {
      while (sheet.data.length < r) sheet.data.push([]);
      const width = Math.max(...sheet.data.map((x) => x.length), c);
      sheet.data.forEach((x) => { while (x.length < width) x.push(''); });
    };
    return {
      setValue(v: unknown) { ensure(row, col); sheet.data[row - 1][col - 1] = v; return this; },
      setValues(vs: unknown[][]) { ensure(row + nr - 1, col + nc - 1); vs.forEach((r, i) => r.forEach((v, j) => (sheet.data[row - 1 + i][col - 1 + j] = v))); return this; },
      getRow() { return row; },
      getColumn() { return col; },
      getLastColumn() { return col + nc - 1; },
      getNumRows() { return nr; },
      getNumColumns() { return nc; },
      getSheet() { return sheet; },
      getValue() { return (sheet.data[row - 1] || [])[col - 1] ?? ''; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (sheet.data[row - 1 + i] || [])[col - 1 + j] ?? '')); },
    };
  }
  appendRow(r: unknown[]) { this.data.push(r); }
  clearContents() { this.data = []; }
}

function load(path: string) {
  return parseCsv(readFileSync(path, 'utf8'));
}

if (!existsSync('dist/Code.js') || !existsSync('sample/registrations.csv')) {
  throw new Error('Run `npm run build` and `npm run seed` before the tests.');
}

describe('Apps Script flow on fake services', () => {
  const sent: { to: string; subject: string; htmlBody: string }[] = [];
  let quota = 1000;
  const regs = load('sample/registrations.csv');
  const header = regs[0];
  const sysStart = header.indexOf('Reg ID');
  // A fresh event: first 40 applications, system columns empty.
  const fresh: unknown[][] = [header, ...regs.slice(1, 41).map((r) => r.map((v, i) => (i >= sysStart ? '' : v)))];
  // Real sheets hand dates back as Date objects. Make some rows do the same.
  const tsCol = header.indexOf('Timestamp');
  const dobCol = header.indexOf('Date of birth');
  for (let i = 1; i <= 10; i++) {
    fresh[i][tsCol] = new Date(String(fresh[i][tsCol]));
    fresh[i][dobCol] = new Date(String(fresh[i][dobCol]) + 'T00:00:00Z');
  }
  const sheets = new Map<string, FakeSheet>([
    ['Registrations', new FakeSheet('Registrations', fresh)],
    ['Config', new FakeSheet('Config', load('sample/config.csv'))],
    ['Tracks', new FakeSheet('Tracks', load('sample/tracks.csv'))],
    ['Desks', new FakeSheet('Desks', load('sample/desks.csv'))],
    ['Intake Log', new FakeSheet('Intake Log', [['Message ID', 'Logged at', 'Reg ID', 'Result', 'Detail']])],
    ['Mock Inbox', new FakeSheet('Mock Inbox', [['Message ID', 'Received at', 'From', 'Subject', 'Attachments']])],
    ['Checks Import', new FakeSheet('Checks Import', [['Reg ID', 'Name', 'ID Check', 'Credit Check', 'Import Result']])],
    ['Monitor', new FakeSheet('Monitor', [])],
  ]);
  const book = {
    getSheetByName: (n: string) => sheets.get(n) || null,
    insertSheet: (n: string) => { const sh = new FakeSheet(n, []); sheets.set(n, sh); return sh; },
    getSpreadsheetTimeZone: () => 'UTC',
    toast: () => undefined,
    getId: () => 'x',
  };
  const lock = { waitLock: () => undefined, tryLock: () => true, releaseLock: () => undefined };
  const ctx: Record<string, unknown> = {
    console: { log: () => undefined },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, flush: () => undefined },
    LockService: { getDocumentLock: () => lock, getScriptLock: () => lock },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail: (m: { to: string; subject: string; htmlBody: string }) => { if (quota <= 0) throw new Error('quota'); quota--; sent.push(m); },
    },
    HtmlService: { createHtmlOutputFromFile: (n: string) => ({ getContent: () => readFileSync(`dist/${n}.html`, 'utf8') }) },
    Utilities: {
      sleep: () => undefined,
      formatDate: (d: Date, _tz: string, fmt: string) => (fmt === 'yyyy-MM' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10)),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync('dist/Code.js', 'utf8'), ctx);
  const run = (fn: string, ...args: unknown[]) => (ctx[fn] as (...a: unknown[]) => unknown)(...args);

  const reg = () => sheets.get('Registrations')!;
  const col = (name: string) => reg().data[0].indexOf(name);
  const rows = () => reg().data.slice(1);
  const statusOf = (id: string) => rows().find((r) => r[col('Reg ID')] === id)![col('Status')];

  test('IDs are assigned once, in order, in one format', () => {
    run('assignMissingIds');
    run('assignMissingIds');
    const ids = rows().map((r) => r[col('Reg ID')]);
    expect(ids[0]).toBe('DEMO-0001');
    expect(ids[39]).toBe('DEMO-0040');
    expect(new Set(ids).size).toBe(40);
  });

  test('paper decisions reject on the form alone and leave the rest registered', () => {
    run('runPaperDecisions');
    const statuses = rows().map((r) => r[col('Status')]);
    expect(statuses.filter((s) => s === 'PAPER_REJECT').length).toBeGreaterThan(0);
    expect(new Set(statuses)).toEqual(new Set(['REGISTERED', 'PAPER_REJECT']));
  });

  test('emails go out 20 per run, each kind once, and the log blocks repeats', () => {
    run('sendDueEmails');
    expect(sent).toHaveLength(20);
    run('sendDueEmails');
    expect(sent).toHaveLength(40);
    run('sendDueEmails');
    expect(sent).toHaveLength(40);
    const rejected = rows().filter((r) => r[col('Status')] === 'PAPER_REJECT');
    expect(sent.filter((m) => m.subject === 'Update on your application')).toHaveLength(rejected.length);
    expect(sent.every((m) => !/\{\{/.test(m.htmlBody))).toBe(true);
  });

  test('quota running out stops the run without losing anyone', () => {
    const before = sent.length;
    quota = 0;
    run('assignMissingIds');
    reg().data.push([...fresh[1].map((v, i) => (i === col('Email address') ? 'late.person@example.com' : i >= sysStart ? '' : v))]);
    run('assignMissingIds');
    run('runPaperDecisions');
    run('sendDueEmails');
    expect(sent.length).toBe(before);
    quota = 1000;
    run('sendDueEmails');
    expect(sent[sent.length - 1].to).toBe('late.person@example.com');
  });

  test('documents and checks move clean candidates to paper pass, then an invite', () => {
    const waiting = rows().filter((r) => r[col('Status')] === 'REGISTERED').slice(0, 3);
    const inbox = sheets.get('Mock Inbox')!;
    const checks = sheets.get('Checks Import')!;
    waiting.forEach((r, i) => {
      inbox.data.push([`m${i}`, '2026-03-01T00:00:00Z', r[col('Email address')], `Documents ${r[col('Reg ID')]}`, 'id-card.pdf, cv.pdf']);
      checks.data.push([r[col('Reg ID')], r[col('Full name (as on ID card)')], 'CLEAR', i === 2 ? 'FLAGGED' : 'CLEAR', '']);
    });
    checks.data.push([waiting[0][col('Reg ID')], 'Wrong Person', 'CLEAR', 'CLEAR', '']);
    run('processInbox');
    run('processInbox'); // rerun logs nothing new
    expect(sheets.get('Intake Log')!.data).toHaveLength(4);
    run('importChecks');
    expect(checks.data[4][4]).toMatch(/^NAME_MISMATCH/);
    const [a, b, c] = waiting.map((r) => r[col('Reg ID')] as string);
    expect([statusOf(a), statusOf(b), statusOf(c)]).toEqual(['PAPER_PASS', 'PAPER_PASS', 'PAPER_REJECT']);
    run('sendDueEmails');
    expect(statusOf(a)).toBe('INVITED');
    expect(sent.filter((m) => m.subject.startsWith('Interview invitation'))).toHaveLength(2);
  });

  test('check-in, desk routing and monitor', () => {
    const invited = rows().find((r) => r[col('Status')] === 'INVITED')!;
    const id = invited[col('Reg ID')] as string;
    const r1 = run('checkIn', id.split('-')[1].replace(/^0+/, '')) as { ok: boolean; alreadyCheckedIn: boolean };
    expect(r1).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(statusOf(id)).toBe('CHECKED_IN');
    expect(run('checkIn', id)).toMatchObject({ alreadyCheckedIn: true });
    run('routeDesks');
    expect(rows().find((r) => r[col('Reg ID')] === id)![col('Desk')]).toMatch(/^Desk \d\d$/);
    run('planOnlineSessions');
    expect(sheets.get('Sessions')!.data.length).toBeGreaterThan(1);
    run('refreshMonitor');
    const mon = sheets.get('Monitor')!.data;
    expect(mon.find((r) => r[0] === 'Registered')![1]).toBeGreaterThan(30);
    expect(mon.find((r) => r[0] === 'Checked in')![1]).toBe(1);
  });

  test('a hand-typed illegal status is put back, a legal one stays', () => {
    const rejected = rows().findIndex((r) => r[col('Status')] === 'PAPER_REJECT') + 2;
    const cell = reg().getRange(rejected, col('Status') + 1);
    cell.setValue('INVITED');
    run('onStatusEdit', { range: cell, oldValue: 'PAPER_REJECT', value: 'INVITED' });
    expect(cell.getValue()).toBe('PAPER_REJECT');
    expect(reg().getRange(rejected, col('Last Error') + 1).getValue()).toBe('Status cannot move from PAPER_REJECT to INVITED');

    const here = rows().findIndex((r) => r[col('Status')] === 'CHECKED_IN') + 2;
    const ok = reg().getRange(here, col('Status') + 1);
    ok.setValue('INTERVIEW_OK');
    run('onStatusEdit', { range: ok, oldValue: 'CHECKED_IN', value: 'INTERVIEW_OK' });
    expect(ok.getValue()).toBe('INTERVIEW_OK');
  });

  test('attendance form answers are matched by header, not position', () => {
    const invited = rows().find((r) => r[col('Status')] === 'INVITED');
    if (!invited) return;
    const att = new FakeSheet('Attendance Confirmations', [['Timestamp', 'Email', 'Registration number', 'Match result']]);
    sheets.set('Attendance Confirmations', att);
    att.data.push(['2026-03-10', 'x@example.com', String(invited[col('Reg ID')]).split('-')[1], '']);
    run('onAttendanceSubmit', { range: att.getRange(2, 1, 1, 3) });
    expect(att.data[1][3]).toMatch(/^Matched/);
    expect(statusOf(invited[col('Reg ID')] as string)).toBe('CONFIRMED');
  });

  test('dates from real sheets are read correctly', () => {
    // Rows 1 to 10 hold Date objects. The age rule must have run on them without error.
    const firstTen = rows().slice(0, 10);
    expect(firstTen.every((r) => !String(r[col('Last Error')]).startsWith('Paper:'))).toBe(true);
    expect(firstTen.every((r) => r[col('Status')] !== '')).toBe(true);
  });

  test('a second registration from another portal is caught at the door', () => {
    const firstRow = rows().find((r) => r[col('Status')] === 'REGISTERED')!;
    const repeat = firstRow.map((v, i) => (i >= sysStart ? '' : v));
    repeat[col('Which job portal sent you this form?')] = 'Job portal Z';
    repeat[col('Timestamp')] = '2026-03-01T00:00:00Z';
    reg().data.push(repeat);
    const before = sent.length;
    run('onRegistrationSubmit', { range: reg().getRange(reg().data.length, 1) });
    const last = rows()[rows().length - 1];
    expect(last[col('Status')]).toBe('DUPLICATE');
    expect(last[col('Duplicate Of')]).toBe(firstRow[col('Reg ID')]);
    expect(rows().find((r) => r[col('Reg ID')] === firstRow[col('Reg ID')])![col('Also Came Via')]).toBe('Job portal Z');
    run('sendDueEmails');
    expect(sent.slice(before).some((m) => m.subject.includes(String(last[col('Reg ID')])))).toBe(false);
  });
});
