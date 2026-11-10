import { DEMO_CONFIG, Desk, buildCard, move, lookupForCheckIn, planSessions, probePoints, routeToDesks } from '../src/core';
import { makeCandidate } from './fixtures';

describe('check-in', () => {
  const people = [
    makeCandidate({ regId: 'DEMO-0017', fullName: 'Rina Demo', status: 'CONFIRMED', appliedTrack: 'TRAINEE' }),
    makeCandidate({ regId: 'DEMO-0018', status: 'PAPER_REJECT' }),
    makeCandidate({ regId: 'DEMO-0019', status: 'CHECKED_IN', desk: 'Desk 02' }),
  ];

  test('short number finds the candidate and their zone', () => {
    expect(lookupForCheckIn('17', people, DEMO_CONFIG)).toMatchObject({
      ok: true,
      regId: 'DEMO-0017',
      firstName: 'Rina',
      zoneColour: 'Pink',
      seatingArea: 'Centre',
    });
  });

  test('not invited gets a neutral message', () => {
    const r = lookupForCheckIn('18', people, DEMO_CONFIG);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining('help desk') });
  });

  test('second scan says already checked in and shows the desk', () => {
    expect(lookupForCheckIn('DEMO-0019', people, DEMO_CONFIG)).toMatchObject({ alreadyCheckedIn: true, desk: 'Desk 02' });
  });

  test('someone marked as no-show who turns up late can still check in', () => {
    const late = [makeCandidate({ regId: 'DEMO-0020', status: 'NO_SHOW' })];
    const r = lookupForCheckIn('20', late, DEMO_CONFIG);
    expect(r).toMatchObject({ ok: true, alreadyCheckedIn: false });
    expect(move('NO_SHOW', 'CHECKED_IN')).toBe('CHECKED_IN');
  });

  test('unknown and malformed input', () => {
    expect(lookupForCheckIn('999', people, DEMO_CONFIG)).toMatchObject({ ok: false });
    expect(lookupForCheckIn('hello', people, DEMO_CONFIG)).toMatchObject({ ok: false });
  });
});

describe('desk routing', () => {
  const desks: Desk[] = [
    { id: 'Desk 01', interviewer: 'Interviewer A', areas: ['North'] },
    { id: 'Desk 02', interviewer: 'Interviewer B', areas: ['North'] },
    { id: 'Desk 03', interviewer: 'Interviewer C', areas: ['South'] },
    { id: 'Desk 09', interviewer: 'Interviewer D', areas: [] },
  ];
  const at = (i: number) => `2026-03-14T08:${String(i).padStart(2, '0')}:00Z`;

  test('balances load inside an area', () => {
    const cs = [1, 2, 3, 4].map((i) => makeCandidate({ regId: `DEMO-000${i}`, domicileArea: 'North', checkedInAt: at(i) }));
    const r = routeToDesks(cs, desks, 10);
    expect([...r.assignments.values()]).toEqual(['Desk 01', 'Desk 02', 'Desk 01', 'Desk 02']);
  });

  test('areas with no desk go to the general desk', () => {
    const r = routeToDesks([makeCandidate({ domicileArea: 'East', checkedInAt: at(1) })], desks, 10);
    expect(r.assignments.get('DEMO-0001')).toBe('Desk 09');
  });

  test('keeps existing seats, spills to the any-area desk, then reports overflow', () => {
    const cs = [
      makeCandidate({ regId: 'DEMO-0001', domicileArea: 'South', desk: 'Desk 03' }),
      makeCandidate({ regId: 'DEMO-0002', domicileArea: 'South', checkedInAt: at(2) }),
      makeCandidate({ regId: 'DEMO-0003', domicileArea: 'South', checkedInAt: at(3) }),
    ];
    const r = routeToDesks(cs, desks, 1);
    expect(r.assignments.get('DEMO-0001')).toBe('Desk 03');
    expect(r.assignments.get('DEMO-0002')).toBe('Desk 09');
    expect(r.overflow).toEqual(['DEMO-0003']);
  });

  test('sessions never exceed the cap', () => {
    const cs = Array.from({ length: 123 }, (_, i) =>
      makeCandidate({ regId: `DEMO-${String(i + 1).padStart(4, '0')}`, domicileArea: ['North', 'South', 'East'][i % 3] }),
    );
    const s = planSessions(cs, 50);
    expect(s.map((x) => x.length)).toEqual([50, 50, 23]);
    expect(new Set(s.flat()).size).toBe(123);
  });
});

describe('candidate card', () => {
  test('probe points come from this candidate, not a script', () => {
    const c = makeCandidate({
      lastCompany: 'Sample Cafe',
      lastRole: 'Barista',
      lastJobStart: '2025-01',
      lastJobEnd: '2025-07',
      domicileCity: 'Other Town',
    });
    const probes = probePoints(c, DEMO_CONFIG);
    expect(probes).toEqual([
      'Stayed 7 months at Sample Cafe. Ask what made them leave and what they would need to stay.',
      '8 months since the last job ended. Ask how they spent that time.',
      "Last role was Barista. Ask for one time they changed someone's mind about buying or joining something.",
      'Lives in Other Town. Ask whether they would relocate or commute to Demo City.',
    ]);
  });

  test('a clean file still gets one concrete prompt', () => {
    expect(probePoints(makeCandidate(), DEMO_CONFIG)).toEqual([
      'No flags on paper. Pick one line of the work history and ask for a concrete example.',
    ]);
  });

  test('contradiction between level and history is flagged', () => {
    const c = makeCandidate({ experienceLevel: 'Fresh graduate, no work experience' });
    expect(probePoints(c, DEMO_CONFIG)[0]).toContain('Clarify which is right');
  });

  test('card carries working links', () => {
    const card = buildCard(makeCandidate(), DEMO_CONFIG);
    const wa = card.basics.find((f) => f.label === 'WhatsApp')!;
    expect(wa.href).toMatch(/^https:\/\/wa\.me\/62/);
    expect(card.basics.find((f) => f.label === 'CV')!.href).toBe('https://example.com/cv/test.pdf');
    expect(card.headline).toBe('Sales Officer | North, Demo City');
  });
});
