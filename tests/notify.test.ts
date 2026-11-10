import { dueMessage, planSends, renderTemplate } from '../src/core';
import { makeCandidate } from './fixtures';

describe('what each candidate is owed', () => {
  test('new registration gets a confirmation once', () => {
    expect(dueMessage(makeCandidate())).toBe('confirmation');
    expect(dueMessage(makeCandidate({ log: ['sent:confirmation'] }))).toBeNull();
  });

  test('paper pass gets an invite after the confirmation', () => {
    expect(dueMessage(makeCandidate({ status: 'PAPER_PASS', log: ['sent:confirmation'] }))).toBe('invite');
    expect(dueMessage(makeCandidate({ status: 'PAPER_PASS', log: ['sent:confirmation', 'sent:invite'] }))).toBeNull();
  });

  test('form-only rejection skips the confirmation and goes straight to the rejection', () => {
    expect(dueMessage(makeCandidate({ status: 'PAPER_REJECT' }))).toBe('reject');
    expect(dueMessage(makeCandidate({ status: 'PAPER_REJECT', log: ['sent:reject'] }))).toBeNull();
  });

  test('withdrawn candidates get nothing', () => {
    expect(dueMessage(makeCandidate({ status: 'WITHDRAWN' }))).toBeNull();
  });
});

describe('send planning', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => makeCandidate({ regId: `DEMO-${i + 1}`, email: `p${i}@example.com` }));

  test('a pasted block of 30 decisions reaches everyone across two runs', () => {
    const rows = many(30);
    const first = planSends(rows, 1000, 20);
    expect(first.send).toHaveLength(20);
    expect(first.leftover).toBe(10);
    expect(first.stoppedBy).toBe('run-limit');
    const sentIds = new Set(first.send.map((s) => s.regId));
    const after = rows.map((r) => (sentIds.has(r.regId) ? { ...r, log: ['sent:confirmation'] } : r));
    const second = planSends(after, 1000, 20);
    expect(second.send).toHaveLength(10);
    expect(second.stoppedBy).toBeNull();
  });

  test('stops before the daily quota runs out', () => {
    const plan = planSends(many(10), 3, 20);
    expect(plan.send).toHaveLength(3);
    expect(plan.stoppedBy).toBe('quota');
  });

  test('bad emails are reported, not attempted, and do not use budget', () => {
    const rows = [makeCandidate({ regId: 'DEMO-1', email: '' }), makeCandidate({ regId: 'DEMO-2', email: 'nope' }), ...many(2)];
    const plan = planSends(rows, 100, 2);
    expect(plan.invalid.map((i) => i.regId)).toEqual(['DEMO-1', 'DEMO-2']);
    expect(plan.send).toHaveLength(2);
  });
});

describe('templates', () => {
  test('fills and escapes values', () => {
    expect(renderTemplate('Hi {{ name }}, ID {{regId}}', { name: '<b>Sari</b>', regId: 'DEMO-0001' })).toBe(
      'Hi &lt;b&gt;Sari&lt;/b&gt;, ID DEMO-0001',
    );
  });

  test('unknown placeholder throws instead of sending raw braces', () => {
    expect(() => renderTemplate('Hi {{nmae}}', { name: 'Sari' })).toThrow('{{nmae}}');
  });
});
