import { DEMO_CONFIG, checkDuplicates, decisionTrail, dueMessage, funnel, crossPortalDuplicates, nextStep } from '../src/core';
import { makeCandidate } from './fixtures';

const at = (d: number) => `2026-02-${String(d).padStart(2, '0')}T09:00:00Z`;

describe('one door: same person through two portals', () => {
  const first = makeCandidate({ regId: 'DEMO-0001', submittedAt: at(1), source: 'Job portal A', email: 'sari@example.com', whatsapp: '0000 1111 2222' });

  test('matched by email', () => {
    const again = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), source: 'Job portal B', email: 'SARI@example.com ', whatsapp: '0000 9999 9999', fullName: 'Other Name' });
    const { candidates, newDuplicates } = checkDuplicates([first, again]);
    expect(candidates[1]).toMatchObject({ status: 'DUPLICATE', duplicateOf: 'DEMO-0001' });
    expect(candidates[0].alsoVia).toEqual(['Job portal B']);
    expect(newDuplicates).toEqual([{ regId: 'DEMO-0002', duplicateOf: 'DEMO-0001', via: 'Job portal B' }]);
  });

  test('matched by WhatsApp number in another format', () => {
    const again = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), email: 'other@example.com', whatsapp: '+62 000-1111-2222', fullName: 'Other Name' });
    expect(checkDuplicates([first, again]).candidates[1].status).toBe('DUPLICATE');
  });

  test('matched by name and birth date, ignoring case and spacing', () => {
    const again = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), email: 'other@example.com', whatsapp: '0000 5555 6666', fullName: ' test  PERSON ' });
    expect(checkDuplicates([first, again]).candidates[1].status).toBe('DUPLICATE');
  });

  test('the earlier registration wins, whatever the row order', () => {
    const later = makeCandidate({ regId: 'DEMO-0009', submittedAt: at(5), source: 'Job portal C' });
    const out = checkDuplicates([later, { ...first, regId: 'DEMO-0010' }]).candidates;
    expect(out.find((c) => c.regId === 'DEMO-0009')!.status).toBe('DUPLICATE');
    expect(out.find((c) => c.regId === 'DEMO-0010')!.status).toBe('REGISTERED');
  });

  test('different people are left alone', () => {
    const other = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), email: 'b@example.com', whatsapp: '0000 3333 4444', fullName: 'Budi Demo', birthDate: '1999-01-01' });
    expect(checkDuplicates([first, other]).newDuplicates).toEqual([]);
  });

  test('running the check again changes nothing', () => {
    const again = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), source: 'Job portal B' });
    const once = checkDuplicates([first, again]).candidates;
    const twice = checkDuplicates(once);
    expect(twice.newDuplicates).toEqual([]);
    expect(twice.candidates[0].alsoVia).toEqual(['Job portal B']);
  });

  test('only brand-new registrations are folded in', () => {
    const invited = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), status: 'INVITED' });
    expect(checkDuplicates([first, invited]).candidates[1].status).toBe('INVITED');
  });

  test('a duplicate gets no emails and is not counted twice', () => {
    const again = makeCandidate({ regId: 'DEMO-0002', submittedAt: at(3), source: 'Job portal B' });
    const out = checkDuplicates([first, again]).candidates;
    expect(dueMessage(out[1])).toBeNull();
    expect(funnel(out)[0].count).toBe(1);
    expect(crossPortalDuplicates(out)).toBe(1);
  });
});

describe('decision trail', () => {
  test('rejection is explained in one line with every failed rule', () => {
    const c = makeCandidate({ status: 'PAPER_REJECT', education: 'High school', birthDate: '1980-01-01' });
    const trail = decisionTrail(c, DEMO_CONFIG);
    expect(trail[0]).toEqual({ step: 'Came through', detail: 'Job portal A. Registered 2026-02-20' });
    expect(trail[1].detail).toBe(
      'Not eligible for Sales Officer: High school is below the Diploma 3 minimum for Sales Officer. Age 46 is outside 20 to 30 for Sales Officer',
    );
    expect(trail[trail.length - 1]).toEqual({ step: 'Next', detail: 'Closed' });
  });

  test('pending checks are named, and the next step is clear', () => {
    const c = makeCandidate({ docsReceivedAt: '2026-02-21T10:00:00Z', status: 'PAPER_HOLD', idCheck: 'CLEAR' });
    const trail = decisionTrail(c, DEMO_CONFIG);
    expect(trail[1].detail).toBe('All rules met so far. Waiting on: Credit record check pending');
    expect(nextStep(c)).toBe('Wait for background check results');
  });

  test('extra portals show on the first record', () => {
    const c = makeCandidate({ alsoVia: ['Job portal B'] });
    expect(decisionTrail(c, DEMO_CONFIG)[0].detail).toBe('Job portal A, also via Job portal B. Registered 2026-02-20');
  });

  test('a duplicate points to the record that handles it', () => {
    const c = makeCandidate({ status: 'DUPLICATE', duplicateOf: 'DEMO-0001' });
    expect(decisionTrail(c, DEMO_CONFIG).map((s) => s.detail)).toEqual([
      'Job portal A. Registered 2026-02-20',
      'Same person as DEMO-0001. No second record opened',
      'None. Handled under DEMO-0001',
    ]);
  });
});
