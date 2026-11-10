import { ALL_STATUSES, canMove, move } from '../src/core';

describe('status rules', () => {
  test('nothing leaves a paper rejection, including a strong interview', () => {
    for (const s of ALL_STATUSES) expect(canMove('PAPER_REJECT', s)).toBe(false);
    expect(() => move('PAPER_REJECT', 'INVITED')).toThrow('cannot move from PAPER_REJECT to INVITED');
  });

  test('no one is interviewed without passing on paper first', () => {
    expect(canMove('REGISTERED', 'CHECKED_IN')).toBe(false);
    expect(canMove('PAPER_HOLD', 'INVITED')).toBe(false);
    expect(canMove('PAPER_PASS', 'INVITED')).toBe(true);
  });

  test('a referred candidate can be invited again', () => {
    expect(canMove('INTERVIEW_REFER', 'INVITED')).toBe(true);
  });

  test('staying put is always allowed', () => {
    expect(move('JOINED', 'JOINED')).toBe('JOINED');
  });
});
