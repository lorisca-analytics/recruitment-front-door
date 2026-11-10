import { Status } from './types';

// One status column, moved only along these edges. This replaces several
// free-text tracking columns where "done", "Done" and TRUE all meant the same thing.
//
// PAPER_REJECT has no way out. That is the rule the whole design rests on:
// a hard-rule rejection cannot be reversed by someone who likes the candidate.

const EDGES: Record<Status, Status[]> = {
  REGISTERED: ['DOCS_RECEIVED', 'PAPER_REJECT', 'DUPLICATE', 'WITHDRAWN'],
  DUPLICATE: [],
  DOCS_RECEIVED: ['PAPER_PASS', 'PAPER_HOLD', 'PAPER_REJECT', 'WITHDRAWN'],
  PAPER_HOLD: ['PAPER_PASS', 'PAPER_REJECT', 'WITHDRAWN'],
  PAPER_REJECT: [],
  PAPER_PASS: ['INVITED', 'PAPER_REJECT', 'WITHDRAWN'],
  INVITED: ['CONFIRMED', 'NO_SHOW', 'CHECKED_IN', 'PAPER_REJECT', 'WITHDRAWN'],
  CONFIRMED: ['CHECKED_IN', 'NO_SHOW', 'PAPER_REJECT', 'WITHDRAWN'],
  CHECKED_IN: ['INTERVIEW_OK', 'INTERVIEW_NOT_OK', 'INTERVIEW_REFER', 'WITHDRAWN'],
  NO_SHOW: ['CHECKED_IN', 'INVITED', 'PAPER_REJECT', 'WITHDRAWN'],
  INTERVIEW_OK: ['OFFER_SENT', 'WITHDRAWN'],
  INTERVIEW_REFER: ['INVITED', 'INTERVIEW_NOT_OK', 'WITHDRAWN'],
  INTERVIEW_NOT_OK: [],
  OFFER_SENT: ['JOINED', 'WITHDRAWN'],
  JOINED: [],
  WITHDRAWN: [],
};

export const ALL_STATUSES = Object.keys(EDGES) as Status[];

export function canMove(from: Status, to: Status): boolean {
  return EDGES[from].includes(to);
}

export function move(from: Status, to: Status): Status {
  if (from === to) return to;
  if (!canMove(from, to)) {
    throw new Error(`Status cannot move from ${from} to ${to}.`);
  }
  return to;
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && value in EDGES;
}
