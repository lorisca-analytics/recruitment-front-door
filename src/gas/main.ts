// Apps Script entry points. Each function here is thin: read the sheet, call
// the tested logic in src/core, write the result back.

import {
  Candidate,
  CheckRow,
  Desk,
  EventConfig,
  InboxMessage,
  LOG_KEY,
  MessageKind,
  applyPaperDecision,
  checkDuplicates,
  crossPortalDuplicates,
  canMove,
  isStatus,
  planSessions,
  buildCard,
  bySource,
  confirmationToId,
  daysUntil,
  findTrack,
  funnel,
  lookupForCheckIn,
  matchChecks,
  move,
  newMessages,
  nextId,
  normalizeWhatsapp,
  parseIntake,
  planSends,
  rejectReasons,
  renderTemplate,
  routeToDesks,
  whatsappLink,
  buildHeaderIndex,
} from '../core';
import { FORM_FIELDS, Row, isDate, SYSTEM_FIELDS, TAB, configValue, readConfig, readRegistrations, tab, writeSystem, ss } from './sheet';
import { exportCardPdf, renderCardTab } from './cardExport';

// ---------- menu ----------

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Front Door')
    .addItem('Check duplicates at the door', 'checkDuplicatesAtDoor')
    .addItem('Run paper decisions', 'runPaperDecisions')
    .addItem('Send due emails now', 'sendDueEmails')
    .addItem('Process document inbox', 'processInbox')
    .addItem('Import background checks', 'importChecks')
    .addSeparator()
    .addItem('Open check-in panel', 'openCheckInPanel')
    .addItem('Plan online interview sessions', 'planOnlineSessions')
    .addItem('Route checked-in candidates to desks', 'routeDesks')
    .addItem('Show card for selected row', 'showCardForSelection')
    .addItem('Export card PDF for selected row', 'exportCardForSelection')
    .addItem('Export all cards for a desk', 'exportDeskCards')
    .addItem('Refresh monitor', 'refreshMonitor')
    .addSeparator()
    .addItem('Create missing tabs (run once)', 'setupWorkbook')
    .addItem('Setup triggers (run once)', 'setupTriggers')
    .addToUi();
}

/** Logs every message, and toasts it for anyone looking at the sheet. */
function tell(message: string) {
  console.log(message);
  try {
    ss().toast(message, 'Front Door', 8);
  } catch (_e) {
    // no open sheet in this context
  }
}

/**
 * Every function that writes to Registrations runs under the same document lock,
 * so a form submit, a check import and the email sender never overwrite each
 * other's changes from a stale read.
 */
function withLock<T>(fn: () => T): T {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------- 1. intake + ID ----------

/** Installable onFormSubmit trigger on the registration form. */
export function onRegistrationSubmit(e: GoogleAppsScript.Events.SheetsOnFormSubmit) {
  if (e.range.getSheet().getName() !== TAB.registrations) return;
  withLock(() => {
    assignIds();
    doorCheck();
    paperDecisions();
  });
}

/** Menu version of the duplicate check, for rows pasted in by hand. */
export function checkDuplicatesAtDoor() {
  withLock(() => {
    doorCheck();
    paperDecisions();
  });
}

/**
 * The same person often passes screening on two portals and registers twice.
 * The later registration is folded into the first one: no second ID in play,
 * no second set of emails. The first record notes the extra portal.
 */
function doorCheck() {
  const { rows, idx } = readRegistrations();
  const withIds = rows.filter((r) => r.candidate.regId);
  const { candidates, newDuplicates } = checkDuplicates(withIds.map((r) => r.candidate));
  const byId = new Map(withIds.map((r) => [r.candidate.regId, r]));
  for (const c of candidates) {
    const row = byId.get(c.regId)!;
    if (c.status === 'DUPLICATE' && row.candidate.status !== 'DUPLICATE') {
      writeSystem(row, idx, { status: c.status, duplicateOf: c.duplicateOf || '' });
    }
    if (c.alsoVia.join(', ') !== row.candidate.alsoVia.join(', ')) {
      writeSystem(row, idx, { alsoVia: c.alsoVia.join(', ') });
    }
  }
  if (newDuplicates.length) tell(`Caught at the door: ${newDuplicates.length} repeat registration(s) from another portal`);
}

/**
 * Gives every row without an ID the next number. Runs under a document lock, so
 * two submissions landing in the same second cannot get the same ID.
 */
export function assignMissingIds() {
  withLock(assignIds);
}

function assignIds() {
  const config = readConfig();
  const { rows, idx } = readRegistrations();
  const taken = rows.map((r) => r.candidate.regId);
  for (const r of rows) {
    if (r.candidate.regId) continue;
    const id = nextId(taken, config.idPrefix, config.idPad);
    taken.push(id);
    writeSystem(r, idx, { regId: id, status: 'REGISTERED' });
  }
  SpreadsheetApp.flush();
}

// ---------- 2. paper decision ----------

export function runPaperDecisions() {
  withLock(paperDecisions);
}

function paperDecisions() {
  const config = readConfig();
  const { rows, idx } = readRegistrations();
  let changed = 0;
  for (const r of rows) {
    if (!r.candidate.regId) continue;
    try {
      const next = applyPaperDecision(r.candidate, config);
      if (next.status !== r.candidate.status || next.paperReasons.join() !== r.candidate.paperReasons.join()) {
        writeSystem(r, idx, { status: next.status, paperReasons: next.paperReasons.join(', '), lastError: '' });
        changed++;
      }
    } catch (err) {
      writeSystem(r, idx, { lastError: `Paper: ${(err as Error).message}` });
    }
  }
  tell(`Paper decisions updated: ${changed}`);
}

// ---------- 3. notifications ----------

const TEMPLATE_FILE: Record<MessageKind, string> = {
  confirmation: 'email-confirmation',
  invite: 'email-invite',
  reject: 'email-reject',
};

function subjectFor(kind: MessageKind, c: Candidate, config: EventConfig) {
  if (kind === 'confirmation') return `Registration received: ${c.regId}`;
  if (kind === 'invite') return `Interview invitation: ${config.eventName}`;
  return 'Update on your application';
}

function varsFor(c: Candidate, config: EventConfig): Record<string, string> {
  const track = findTrack(config, c.finalTrack || c.appliedTrack);
  return {
    firstName: c.fullName.split(/\s+/)[0],
    regId: c.regId,
    trackLabel: track.label,
    eventName: config.eventName,
    eventDate: config.eventDate,
    eventTime: config.eventTime,
    venueLine1: config.venueLine1,
    venueLine2: config.venueLine2,
    docsInbox: configValue('Documents inbox'),
    confirmFormUrl: configValue('Attendance form URL'),
  };
}

/**
 * Time-driven every 10 minutes, or from the menu. Looks at every row each time,
 * so a pasted block of decisions is never missed. Stops before the daily quota
 * runs out. The log records only sends that succeeded, so the next run picks up
 * the rest.
 */
export function sendDueEmails() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return; // another run holds the sheet, the next run picks this up
  try {
    const config = readConfig();
    const { rows, idx } = readRegistrations();
    const byId = new Map(rows.map((r) => [r.candidate.regId, r]));
    const quota = MailApp.getRemainingDailyQuota();
    const plan = planSends(rows.map((r) => r.candidate).filter((c) => c.regId), quota, config.maxEmailsPerRun);

    plan.invalid.forEach((i) => writeSystem(byId.get(i.regId)!, idx, { lastError: i.reason }));

    let sent = 0;
    for (const item of plan.send) {
      const row = byId.get(item.regId)!;
      const c = row.candidate;
      try {
        const html = renderTemplate(HtmlService.createHtmlOutputFromFile(TEMPLATE_FILE[item.kind]).getContent(), varsFor(c, config));
        MailApp.sendEmail({ to: c.email, subject: subjectFor(item.kind, c, config), body: stripTags(html), htmlBody: html, name: config.eventName });
        const log = [...c.log, LOG_KEY[item.kind]];
        const status = item.kind === 'invite' ? move(c.status, 'INVITED') : c.status;
        writeSystem(row, idx, { log: log.join(' | '), status, lastError: '' });
        sent++;
        Utilities.sleep(1000);
      } catch (err) {
        writeSystem(row, idx, { lastError: `Email ${item.kind}: ${(err as Error).message}` });
        Utilities.sleep(3000);
      }
    }
    const tail = plan.stoppedBy ? `. ${plan.leftover} waiting (${plan.stoppedBy === 'quota' ? 'daily quota reached' : 'next run'})` : '';
    tell(`Emails sent: ${sent}${tail}`);
  } finally {
    lock.releaseLock();
  }
}

function stripTags(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------- 4. document intake ----------

/**
 * Reads new document emails, either from Gmail (label set on the Config tab)
 * or from the Mock Inbox tab when "Inbox mode" is MOCK. Valid messages mark the
 * candidate's documents as received. Every message is logged once by its ID.
 */
export function processInbox() {
  withLock(inbox);
}

function inbox() {
  const config = readConfig();
  const { rows, idx } = readRegistrations();
  const log = tab(TAB.intakeLog);
  const logged = new Set(log.getDataRange().getValues().slice(1).map((v) => String(v[0])));
  const known = new Set(rows.map((r) => r.candidate.regId));
  const emails = new Map(rows.map((r) => [r.candidate.regId, r.candidate.email]));
  const byId = new Map(rows.map((r) => [r.candidate.regId, r]));

  const messages = newMessages(configValue('Inbox mode').toUpperCase() === 'GMAIL' ? gmailMessages(logged) : mockMessages(), logged);
  let ok = 0;
  for (const m of messages) {
    const res = parseIntake(m, config.idPrefix, config.idPad, known, emails);
    log.appendRow([m.messageId, new Date(), res.regId || '', res.ok ? 'SAVED' : 'PROBLEM', res.ok ? `${res.idCardFile}, ${res.cvFile}` : res.problem]);
    if (res.ok) {
      const row = byId.get(res.regId)!;
      if (!row.candidate.docsReceivedAt) writeSystem(row, idx, { docsReceivedAt: m.receivedAt });
      ok++;
    }
  }
  tell(`Inbox: ${messages.length} new, ${ok} accepted`);
  paperDecisions();
}

function mockMessages(): InboxMessage[] {
  const values = tab(TAB.mockInbox).getDataRange().getValues();
  const idx = buildHeaderIndex(values[0], { id: 'Message ID', at: 'Received at', from: 'From', subject: 'Subject', files: 'Attachments' });
  return values.slice(1).filter((v) => v[idx.id]).map((v) => ({
    messageId: String(v[idx.id]),
    receivedAt: isDate(v[idx.at]) ? (v[idx.at] as Date).toISOString() : String(v[idx.at]),
    from: String(v[idx.from]),
    subject: String(v[idx.subject]),
    attachments: String(v[idx.files]).split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({
      name,
      mimeType: /\.pdf$/i.test(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'other',
    })),
  }));
}

/** Already-logged messages are skipped before anything is saved, so reruns never duplicate files. */
function gmailMessages(logged: Set<string>): InboxMessage[] {
  const label = configValue('Gmail label');
  const folderId = configValue('Documents folder ID');
  const folder = folderId ? DriveApp.getFolderById(folderId) : null;
  const out: InboxMessage[] = [];
  GmailApp.search(`label:"${label}" newer_than:30d`, 0, 100).forEach((thread) =>
    thread.getMessages().forEach((msg) => {
      if (logged.has(msg.getId())) return;
      const atts = msg.getAttachments();
      if (folder) atts.forEach((a) => folder.createFile(a.copyBlob()).setName(`${msg.getId()}-${a.getName()}`));
      out.push({
        messageId: msg.getId(),
        receivedAt: msg.getDate().toISOString(),
        from: msg.getFrom(),
        subject: msg.getSubject(),
        attachments: atts.map((a) => ({ name: a.getName(), mimeType: a.getContentType() })),
      });
    }),
  );
  return out;
}

// ---------- 5. background check import ----------

export function importChecks() {
  withLock(checks);
}

function checks() {
  const config = readConfig();
  const { rows, idx } = readRegistrations();
  const sh = tab(TAB.checks);
  const values = sh.getDataRange().getValues();
  const h = buildHeaderIndex(values[0], { regId: 'Reg ID', name: 'Name', idCheck: 'ID Check', creditCheck: 'Credit Check', outcome: 'Import Result' });
  const checkRows: CheckRow[] = values.slice(1).map((v) => ({
    regId: String(v[h.regId]),
    name: String(v[h.name]),
    idCheck: String(v[h.idCheck]),
    creditCheck: String(v[h.creditCheck]),
  }));
  const regs = new Map(rows.map((r) => [r.candidate.regId, r.candidate.fullName]));
  const byId = new Map(rows.map((r) => [r.candidate.regId, r]));
  const results = matchChecks(checkRows, regs, config.idPrefix, config.idPad);
  results.forEach((res, i) => {
    sh.getRange(i + 2, h.outcome + 1).setValue(res.status === 'APPLIED' ? 'Applied' : `${res.status}: ${res.detail}`);
    if (res.status === 'APPLIED') writeSystem(byId.get(res.regId)!, idx, { idCheck: res.idCheck, creditCheck: res.creditCheck });
  });
  const applied = results.filter((r) => r.status === 'APPLIED').length;
  tell(`Checks applied: ${applied}. Not applied: ${results.length - applied} (see Import Result)`);
  paperDecisions();
}

// ---------- 6. attendance confirmation ----------

/** Installable onFormSubmit trigger on the short "confirm you are coming" form. */
export function onAttendanceSubmit(e: GoogleAppsScript.Events.SheetsOnFormSubmit) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TAB.attendance) return;
  withLock(() => {
    const config = readConfig();
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const h = buildHeaderIndex(header, { number: 'Registration number', result: 'Match result' });
    const typed = String(sheet.getRange(e.range.getRow(), h.number + 1).getValue() || '');
    const note = sheet.getRange(e.range.getRow(), h.result + 1);
    const regId = confirmationToId(typed, config);
    const { rows, idx } = readRegistrations();
    const row = rows.find((r) => r.candidate.regId === regId);
    if (!row) return note.setValue('No match');
    const c = row.candidate;
    if (c.status !== 'INVITED') return note.setValue(`Ignored: status ${c.status}`);
    writeSystem(row, idx, { status: move(c.status, 'CONFIRMED'), confirmedAt: new Date().toISOString() });
    note.setValue(`Matched ${regId}`);
  });
}

/** Click-to-chat reminder links for invited candidates who have not confirmed. */
export function reminderLinks(): { regId: string; link: string | null }[] {
  const config = readConfig();
  return readRegistrations()
    .rows.map((r) => r.candidate)
    .filter((c) => c.status === 'INVITED')
    .map((c) => ({
      regId: c.regId,
      link: whatsappLink(
        normalizeWhatsapp(c.whatsapp),
        `Hello ${c.fullName.split(' ')[0]}, please confirm your attendance for ${config.eventName} on ${config.eventDate} using your number ${c.regId}: ${configValue('Attendance form URL')}`,
      ),
    }));
}

// ---------- 7. check-in panel ----------

/**
 * Opens the check-in page as a sidebar inside the spreadsheet. It runs as the
 * person at the check-in desk, who already has access to the sheet. There is no
 * public web app, so no one outside the sheet's sharing list can call anything.
 */
export function openCheckInPanel() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('checkin').setTitle('Check-in'));
}

/** Called from the check-in panel. Marks the candidate as arrived. */
export function checkIn(typed: string) {
  return withLock(() => {
    const config = readConfig();
    const { rows, idx } = readRegistrations();
    const result = lookupForCheckIn(typed, rows.map((r) => r.candidate), config);
    if (result.ok && !result.alreadyCheckedIn) {
      const row = rows.find((r) => r.candidate.regId === result.regId)!;
      writeSystem(row, idx, { status: move(row.candidate.status, 'CHECKED_IN'), checkedInAt: new Date().toISOString() });
    }
    return result;
  });
}

// ---------- 8. desk router ----------

export function routeDesks() {
  withLock(desksRun);
}

function desksRun() {
  const config = readConfig();
  const { rows, idx } = readRegistrations();
  const values = tab(TAB.desks).getDataRange().getValues();
  const h = buildHeaderIndex(values[0], { id: 'Desk', interviewer: 'Interviewer', areas: 'Areas' });
  const desks: Desk[] = values.slice(1).filter((v) => v[h.id]).map((v) => ({
    id: String(v[h.id]).trim(),
    interviewer: String(v[h.interviewer]).trim(),
    areas: String(v[h.areas]).split(',').map((s) => s.trim()).filter(Boolean),
  }));
  const here = rows.filter((r) => r.candidate.status === 'CHECKED_IN');
  const { assignments, overflow } = routeToDesks(here.map((r) => r.candidate), desks, config.candidatesPerDesk);
  for (const r of here) {
    const desk = assignments.get(r.candidate.regId);
    if (desk && desk !== r.candidate.desk) {
      writeSystem(r, idx, { desk, interviewer: desks.find((d) => d.id === desk)!.interviewer });
    }
  }
  tell(`Routed ${assignments.size}. No desk capacity left for ${overflow.length}`);
}

// ---------- 9. candidate card ----------

function selectedRow(): Row {
  const sel = SpreadsheetApp.getActiveRange();
  if (sel.getSheet().getName() !== TAB.registrations) throw new Error('Select a row on the Registrations tab first');
  const row = readRegistrations().rows.find((r) => r.rowNumber === sel.getRow());
  if (!row) throw new Error('That row is empty');
  return row;
}

export function showCardForSelection() {
  const config = readConfig();
  renderCardTab(buildCard(selectedRow().candidate, config));
  tab(TAB.card).activate();
}

export function exportCardForSelection() {
  const config = readConfig();
  const file = exportCardPdf(buildCard(selectedRow().candidate, config));
  try {
    const html = HtmlService.createHtmlOutput(
      `<p>Saved <b>${file.getName()}</b>.</p><p><a href="${file.getUrl()}" target="_blank">Open, download or print</a></p>`,
    ).setWidth(360).setHeight(140);
    SpreadsheetApp.getUi().showModalDialog(html, 'Card exported');
  } catch (_e) {
    console.log(`Card exported: ${file.getUrl()}`);
  }
}

/** One PDF per candidate at a desk, so each interviewer gets their cards before the session. */
export function exportDeskCards() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('Export cards', 'Desk name (as on the Desks tab):', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const desk = answer.getResponseText().trim();
  const config = readConfig();
  const list = readRegistrations().rows.map((r) => r.candidate).filter((c) => c.desk === desk);
  let done = 0;
  for (const c of list) {
    exportCardPdf(buildCard(c, config)); // retries once on rate limiting
    done++;
    Utilities.sleep(2000); // Google throttles rapid export calls
  }
  tell(`Exported ${done} cards for ${desk}`);
}

// ---------- online sessions ----------

/**
 * Splits everyone who passed on paper into online interview sessions of at most
 * "Max per online session", grouped by home area, and lists them on a Sessions tab.
 */
export function planOnlineSessions() {
  const config = readConfig();
  const ready = readRegistrations().rows.map((r) => r.candidate).filter((c) => ['PAPER_PASS', 'INVITED', 'CONFIRMED'].includes(c.status));
  const sessions = planSessions(ready, config.maxPerSession);
  const byId = new Map(ready.map((c) => [c.regId, c]));
  const out: (string | number)[][] = [['Session', 'Reg ID', 'Name', 'Area']];
  sessions.forEach((ids, i) => ids.forEach((id) => out.push([i + 1, id, byId.get(id)!.fullName, byId.get(id)!.domicileArea])));
  const sh = ss().getSheetByName('Sessions') || ss().insertSheet('Sessions');
  sh.clearContents();
  sh.getRange(1, 1, out.length, 4).setValues(out);
  tell(`${ready.length} candidates in ${sessions.length} sessions`);
}

// ---------- 10. monitor ----------

export function refreshMonitor() {
  const config = readConfig();
  const people = readRegistrations().rows.map((r) => r.candidate).filter((c) => c.regId);
  const sh = tab(TAB.monitor);
  sh.clearContents();
  const out: (string | number)[][] = [
    [config.eventName, ''],
    ['Updated', Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm')],
    ['Days to event', daysUntil(config.eventDate, new Date())],
    ['Repeat registrations caught at the door', crossPortalDuplicates(people)],
    ['', ''],
    ['Stage', 'People', 'From previous stage'],
  ];
  funnel(people).forEach((f) => out.push([f.stage, f.count, f.fromPrevious === null ? '' : Math.round(f.fromPrevious * 100) + '%']));
  out.push(['', ''], ['Source', 'Registered', 'Passed on paper', 'Checked in', 'Interview OK']);
  bySource(people).forEach((s) => out.push([s.source, s.registered, s.passedPaper, s.checkedIn, s.ok]));
  out.push(['', ''], ['Paper rejection reason', 'Count']);
  rejectReasons(people).forEach((r) => out.push([r.rule, r.count]));
  const width = Math.max(...out.map((r) => r.length));
  sh.getRange(1, 1, out.length, width).setValues(out.map((r) => [...r, ...Array(width - r.length).fill('')]));
}

// ---------- setup ----------

/** Creates any missing tab with its header row, so a blank spreadsheet becomes a working one. */
export function setupWorkbook() {
  const book = ss();
  const make = (name: string, header: string[], rows: (string | number)[][] = []) => {
    const existing = book.getSheetByName(name);
    if (existing) {
      // A tab made by linking a form already has the form columns. Add whatever header is missing.
      const have = existing.getRange(1, 1, 1, Math.max(existing.getLastColumn(), 1)).getValues()[0].map((h) => String(h).trim());
      const missing = header.filter((h) => h && !have.includes(h));
      if (missing.length) existing.getRange(1, have.filter(Boolean).length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      return;
    }
    const sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    sh.setFrozenRows(1);
  };
  make(TAB.registrations, [...Object.values(FORM_FIELDS).map((f) => (typeof f === 'string' ? f : f[0])), ...Object.values(SYSTEM_FIELDS)]);
  make(TAB.config, ['Key', 'Value'], [
    ['ID prefix', 'REG'], ['ID digits', 4], ['Event name', ''], ['Event date', ''], ['Event time', ''],
    ['Venue line 1', ''], ['Venue line 2', ''], ['Candidates per desk', 10], ['Max per online session', 50],
    ['Max emails per run', 20], ['Documents inbox', ''], ['Attendance form URL', ''], ['Inbox mode', 'MOCK'],
    ['Gmail label', ''], ['Documents folder ID', ''], ['Card folder ID', ''],
  ]);
  make(TAB.tracks, ['Code', 'Label', 'Min education', 'Min age', 'Max age', 'Min GPA', 'Needs sales licence', 'Allows active students', 'Zone colour', 'Seating area']);
  make(TAB.desks, ['Desk', 'Interviewer', 'Areas']);
  make(TAB.intakeLog, ['Message ID', 'Logged at', 'Reg ID', 'Result', 'Detail']);
  make(TAB.mockInbox, ['Message ID', 'Received at', 'From', 'Subject', 'Attachments']);
  make(TAB.checks, ['Reg ID', 'Name', 'ID Check', 'Credit Check', 'Import Result']);
  make(TAB.attendance, ['Timestamp', 'Registration number', 'Match result']);
  protectSystemColumns();
  make(TAB.card, ['']);
  make(TAB.monitor, ['']);
  tell('Tabs ready. Fill in Config, Tracks and Desks next.');
}

/** Warns anyone who edits a system column by hand. The edit check below reverts illegal status moves. */
function protectSystemColumns() {
  const sh = tab(TAB.registrations);
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const first = header.indexOf(SYSTEM_FIELDS.regId) + 1;
  if (first < 1) return;
  sh.getRange(1, first, sh.getMaxRows(), header.length - first + 1)
    .protect()
    .setDescription('System columns. Change status only through the menu or a legal move.')
    .setWarningOnly(true);
}

/**
 * Installable onEdit trigger. If someone types a status that the rules do not
 * allow (for example moving a paper rejection to INVITED), the cell goes back
 * to its old value and the row says why. Interview results typed by staff go
 * through the same check.
 */
export function onStatusEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TAB.registrations || e.range.getRow() < 2) return;
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const statusCol = header.indexOf(SYSTEM_FIELDS.status) + 1;
  const errorCol = header.indexOf(SYSTEM_FIELDS.lastError) + 1;
  if (statusCol < e.range.getColumn() || statusCol > e.range.getLastColumn()) return;
  if (e.range.getNumRows() > 1 || e.range.getNumColumns() > 1) {
    // A pasted block carries no old values, so it cannot be checked. Flag it instead.
    sheet.getRange(e.range.getRow(), errorCol).setValue('Status was pasted as a block, so it could not be checked. Change status one cell at a time.');
    return;
  }
  const from = String(e.oldValue || 'REGISTERED');
  const to = String(e.value || '').trim();
  const reject = (why: string) => {
    e.range.setValue(e.oldValue || '');
    sheet.getRange(e.range.getRow(), errorCol).setValue(why);
  };
  if (!isStatus(to)) return reject(`"${to}" is not a status`);
  if (!isStatus(from)) return;
  if (!canMove(from, to) && from !== to) reject(`Status cannot move from ${from} to ${to}`);
}

export function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  const book = ss();
  ScriptApp.newTrigger('onRegistrationSubmit').forSpreadsheet(book).onFormSubmit().create();
  ScriptApp.newTrigger('onAttendanceSubmit').forSpreadsheet(book).onFormSubmit().create();
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('sendDueEmails').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('refreshMonitor').timeBased().everyMinutes(15).create();
  tell('Triggers ready');
}
