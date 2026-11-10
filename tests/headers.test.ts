import { buildHeaderIndex } from '../src/core';

describe('header lookup', () => {
  test('finds columns by name, whatever the order or spacing', () => {
    const idx = buildHeaderIndex(['Timestamp', ' Email ', 'Full  Name'], {
      name: 'full name',
      email: ['E-mail', 'Email'],
    });
    expect(idx).toEqual({ name: 2, email: 1 });
  });

  test('adding a column does not move anything', () => {
    const before = buildHeaderIndex(['A', 'Status'], { status: 'Status' });
    const after = buildHeaderIndex(['A', 'New question', 'Status'], { status: 'Status' });
    expect(after.status).toBe(2);
    expect(before.status).toBe(1);
  });

  test('lists every missing header in one error', () => {
    expect(() => buildHeaderIndex(['A'], { x: 'X', y: 'Y' })).toThrow('Missing column(s): X, Y');
  });
});
