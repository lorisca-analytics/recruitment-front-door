import { DEMO_CONFIG, ageOn, applyPaperDecision, findTrack, paperDecision } from '../src/core';
import { makeCandidate } from './fixtures';

const sales = findTrack(DEMO_CONFIG, 'SALES');
const advisor = findTrack(DEMO_CONFIG, 'ADVISOR');
const day = DEMO_CONFIG.eventDate;
const ready = { docsReceivedAt: '2026-02-21T10:00:00Z', idCheck: 'CLEAR' as const, creditCheck: 'CLEAR' as const };

describe('age', () => {
  test('counts birthdays correctly', () => {
    expect(ageOn('2000-03-14', '2026-03-14')).toBe(26);
    expect(ageOn('2000-03-15', '2026-03-14')).toBe(25);
  });
});

describe('paper decision', () => {
  test('clean file with checks back passes', () => {
    expect(paperDecision(makeCandidate(ready), sales, day).outcome).toBe('PASS');
  });

  test('missing inputs make it wait, not pass', () => {
    const d = paperDecision(makeCandidate(), sales, day);
    expect(d.outcome).toBe('WAIT');
    expect(d.waitingFor.map((w) => w.rule)).toEqual(['documents', 'id-check', 'credit-check']);
  });

  test('each hard rule rejects on its own', () => {
    const cases = [
      { over: { consent: false }, rule: 'consent' },
      { over: { education: 'High school' as const }, rule: 'education' },
      { over: { birthDate: '1990-01-01' }, rule: 'age' },
      { over: { gpa: 2.5 }, rule: 'gpa' },
      { over: { activeStudent: true }, rule: 'active-student' },
      { over: { idCheck: 'FLAGGED' as const }, rule: 'id-check' },
      { over: { creditCheck: 'FLAGGED' as const }, rule: 'credit-check' },
    ];
    for (const { over, rule } of cases) {
      const d = paperDecision(makeCandidate({ ...ready, ...over }), sales, day);
      expect(d.outcome).toBe('REJECT');
      expect(d.failed.map((f) => f.rule)).toEqual([rule]);
    }
  });

  test('licence rule only applies to tracks that need it', () => {
    expect(paperDecision(makeCandidate(ready), advisor, day).failed.map((f) => f.rule)).toEqual(['licence']);
    expect(paperDecision(makeCandidate({ ...ready, hasSalesLicence: true }), advisor, day).outcome).toBe('PASS');
  });

  test('a broken hard rule decides even while checks are pending', () => {
    const d = paperDecision(makeCandidate({ education: 'High school' }), sales, day);
    expect(d.outcome).toBe('REJECT');
  });

  test('an unknown education value is an error, never a silent rejection', () => {
    const c = makeCandidate({ ...ready, education: 'S1' as never });
    expect(() => paperDecision(c, sales, day)).toThrow('Unknown education value "S1"');
  });

  test('no GPA given is not held against the candidate', () => {
    expect(paperDecision(makeCandidate({ ...ready, gpa: null }), sales, day).outcome).toBe('PASS');
  });
});

describe('applying the decision to status', () => {
  test('form-only rejection happens before any document is asked for', () => {
    const c = applyPaperDecision(makeCandidate({ birthDate: '1985-01-01' }), DEMO_CONFIG);
    expect(c.status).toBe('PAPER_REJECT');
    expect(c.paperReasons).toEqual(['age']);
  });

  test('registered with nothing missing but documents stays registered', () => {
    expect(applyPaperDecision(makeCandidate(), DEMO_CONFIG).status).toBe('REGISTERED');
  });

  test('documents in, checks pending goes on hold', () => {
    const c = applyPaperDecision(makeCandidate({ docsReceivedAt: '2026-02-21T10:00:00Z' }), DEMO_CONFIG);
    expect(c.status).toBe('PAPER_HOLD');
  });

  test('hold moves to pass when checks come back clear', () => {
    const held = makeCandidate({ ...ready, status: 'PAPER_HOLD' });
    expect(applyPaperDecision(held, DEMO_CONFIG).status).toBe('PAPER_PASS');
  });

  test('a late flagged check pulls a pass back to reject', () => {
    const c = makeCandidate({ ...ready, status: 'PAPER_PASS', creditCheck: 'FLAGGED' });
    expect(applyPaperDecision(c, DEMO_CONFIG).status).toBe('PAPER_REJECT');
  });

  test('a rejection stays a rejection, even if the data is corrected later', () => {
    const c = makeCandidate({ ...ready, status: 'PAPER_REJECT' });
    expect(applyPaperDecision(c, DEMO_CONFIG).status).toBe('PAPER_REJECT');
  });

  test('a check flagged after the invitation still rejects before the interview', () => {
    const c = makeCandidate({ ...ready, status: 'CONFIRMED', idCheck: 'FLAGGED' });
    const out = applyPaperDecision(c, DEMO_CONFIG);
    expect(out.status).toBe('PAPER_REJECT');
    expect(out.paperReasons).toEqual(['id-check']);
  });

  test('an invited candidate with a clean file stays invited', () => {
    const c = makeCandidate({ ...ready, status: 'INVITED' });
    expect(applyPaperDecision(c, DEMO_CONFIG).status).toBe('INVITED');
  });

  test('candidates past the paper stage are left alone', () => {
    const c = makeCandidate({ ...ready, status: 'CHECKED_IN', creditCheck: 'FLAGGED' });
    expect(applyPaperDecision(c, DEMO_CONFIG).status).toBe('CHECKED_IN');
  });
});
