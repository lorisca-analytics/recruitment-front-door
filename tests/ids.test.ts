import { formatId, nextId, normalizeId, parseIdNumber } from '../src/core';

describe('registration IDs', () => {
  test('formats with prefix and padding', () => {
    expect(formatId('DEMO', 7, 4)).toBe('DEMO-0007');
  });

  test('reads every shape staff or candidates type', () => {
    for (const v of ['17', '0017', 'DEMO-0017', 'demo0017', ' Demo 17 ', 'DEMO-17']) {
      expect(parseIdNumber(v, 'DEMO')).toBe(17);
    }
  });

  test('rejects other prefixes and junk', () => {
    expect(parseIdNumber('REG-0017', 'DEMO')).toBeNull();
    expect(parseIdNumber('abc', 'DEMO')).toBeNull();
    expect(parseIdNumber('0', 'DEMO')).toBeNull();
    expect(parseIdNumber('', 'DEMO')).toBeNull();
    expect(parseIdNumber(null, 'DEMO')).toBeNull();
  });

  test('two old formats collapse into one', () => {
    expect(normalizeId('DEMO006', 'DEMO', 4)).toBe(normalizeId('DEMO-0006', 'DEMO', 4));
  });

  test('next ID is max plus one and never reuses gaps', () => {
    expect(nextId(['DEMO-0001', 'DEMO-0009', '', 'DEMO003', 'note'], 'DEMO', 4)).toBe('DEMO-0010');
    expect(nextId([], 'DEMO', 4)).toBe('DEMO-0001');
  });
});
