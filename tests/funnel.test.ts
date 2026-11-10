import { bySource, daysUntil, dedupePeople, funnel, rejectReasons } from '../src/core';
import { makeCandidate } from './fixtures';

const docs = '2026-02-21T10:00:00Z';

describe('funnel', () => {
  const rows = [
    makeCandidate({ regId: 'DEMO-0001' }),
    makeCandidate({ regId: 'DEMO-0002', fullName: 'B Person', status: 'PAPER_REJECT', paperReasons: ['age'] }),
    makeCandidate({ regId: 'DEMO-0003', fullName: 'C Person', status: 'INVITED', docsReceivedAt: docs, source: 'Job fair' }),
    makeCandidate({ regId: 'DEMO-0004', fullName: 'D Person', status: 'JOINED', docsReceivedAt: docs, confirmedAt: docs, checkedInAt: docs }),
    // Same person as DEMO-0004, registered twice. Counted once.
    makeCandidate({ regId: 'DEMO-0005', fullName: 'd  person', status: 'REGISTERED' }),
  ];

  test('dedupes repeat applicants, keeping the furthest record', () => {
    const people = dedupePeople(rows);
    expect(people).toHaveLength(4);
    expect(people.find((p) => p.fullName.toLowerCase().startsWith('d'))!.regId).toBe('DEMO-0004');
  });

  test('stage counts and step conversion', () => {
    const f = funnel(rows);
    const get = (s: string) => f.find((r) => r.stage === s)!;
    expect(get('Registered').count).toBe(4);
    expect(get('Passed on paper').count).toBe(2);
    expect(get('Invited').count).toBe(2);
    expect(get('Checked in').count).toBe(1);
    expect(get('Joined').count).toBe(1);
    expect(get('Documents in').fromPrevious).toBeCloseTo(0.5);
  });

  test('source table and reject reasons', () => {
    expect(bySource(rows).find((r) => r.source === 'Job fair')).toEqual({
      source: 'Job fair',
      registered: 1,
      passedPaper: 1,
      checkedIn: 0,
      ok: 0,
    });
    expect(rejectReasons(rows)).toEqual([{ rule: 'age', count: 1 }]);
  });

  test('countdown', () => {
    expect(daysUntil('2026-03-14', new Date('2026-03-10T23:00:00Z'))).toBe(4);
  });
});
