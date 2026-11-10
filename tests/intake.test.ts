import { InboxMessage, matchChecks, newMessages, normalizeName, parseCheck, parseIntake } from '../src/core';

const known = new Set(['DEMO-0012']);
const emails = new Map([['DEMO-0012', 'sari.demo@example.com']]);
const msg = (over: Partial<InboxMessage> = {}): InboxMessage => ({
  messageId: 'm1',
  receivedAt: '2026-02-21T10:00:00Z',
  from: 'Sari Demo <Sari.Demo@example.com>',
  subject: 'Documents DEMO-12',
  attachments: [
    { name: 'id-card.pdf', mimeType: 'application/pdf' },
    { name: 'CV Sari.pdf', mimeType: 'application/pdf' },
  ],
  ...over,
});

describe('document intake', () => {
  test('matches subject ID and attachments', () => {
    expect(parseIntake(msg(), 'DEMO', 4, known, emails)).toEqual({
      ok: true,
      regId: 'DEMO-0012',
      idCardFile: 'id-card.pdf',
      cvFile: 'CV Sari.pdf',
    });
  });

  test('explains each failure', () => {
    const p = (m: InboxMessage) => (parseIntake(m, 'DEMO', 4, known, emails) as { problem: string }).problem;
    expect(p(msg({ subject: 'my documents' }))).toBe('No registration ID in subject');
    expect(p(msg({ subject: 'DEMO-0099' }))).toBe('Registration ID not found');
    expect(p(msg({ from: 'someone@example.com' }))).toBe('Sender does not match the registered email');
    expect(p(msg({ attachments: [{ name: 'cv.pdf', mimeType: 'application/pdf' }] }))).toBe('ID card missing or wrong file type');
    expect(p(msg({ attachments: [{ name: 'ktp.png', mimeType: 'image/png' }, { name: 'cv.docx', mimeType: 'application/msword' }] }))).toBe(
      'CV missing or not a PDF',
    );
  });

  test('already logged messages are skipped on rerun', () => {
    expect(newMessages([msg(), msg({ messageId: 'm2' })], new Set(['m1'])).map((m) => m.messageId)).toEqual(['m2']);
  });
});

describe('background check matching', () => {
  const regs = new Map([['DEMO-0012', 'Sari  Demo-Putri']]);

  test('names compare without case, spacing or punctuation noise', () => {
    expect(normalizeName(' sari demo putri ')).toBe(normalizeName('SARI DEMO-PUTRI'));
  });

  test('applies only when ID and name agree', () => {
    const out = matchChecks(
      [
        { regId: '12', name: 'SARI DEMO PUTRI', idCheck: 'Clear', creditCheck: 'flagged' },
        { regId: 'DEMO-0012', name: 'Someone Else', idCheck: 'CLEAR', creditCheck: 'CLEAR' },
        { regId: 'DEMO-0077', name: 'Sari Demo Putri', idCheck: 'CLEAR', creditCheck: 'CLEAR' },
        { regId: 'DEMO-0012', name: 'Sari Demo Putri', idCheck: 'maybe', creditCheck: '' },
      ],
      regs,
      'DEMO',
      4,
    );
    expect(out.map((o) => o.status)).toEqual(['APPLIED', 'NAME_MISMATCH', 'UNKNOWN_ID', 'BAD_VALUE']);
    expect(out[0]).toMatchObject({ idCheck: 'CLEAR', creditCheck: 'FLAGGED' });
  });

  test('blank result means pending', () => {
    expect(parseCheck('')).toBe('PENDING');
    expect(parseCheck('Not Clean')).toBe('FLAGGED');
  });
});
