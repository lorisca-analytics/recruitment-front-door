import { Candidate, EventConfig, Status } from './types';
import { paperDecision } from './screening';
import { findTrack } from './config';
import { move } from './status';

// Applies the paper decision to a candidate's status. Runs after every change:
// a new registration, documents in, background check results imported.
// Every step goes through the status rules, so an illegal jump throws.

const PAPER_STAGE = new Set<Status>(['REGISTERED', 'DOCS_RECEIVED', 'PAPER_HOLD', 'PAPER_PASS']);
// Invited but not yet interviewed. A check that comes back flagged late still rejects.
const BEFORE_INTERVIEW = new Set<Status>(['INVITED', 'CONFIRMED', 'NO_SHOW']);

export function applyPaperDecision(c: Candidate, config: EventConfig): Candidate {
  if (!PAPER_STAGE.has(c.status) && !BEFORE_INTERVIEW.has(c.status)) return c; // interviewed, or closed
  const d = paperDecision(c, findTrack(config, c.appliedTrack), config.eventDate);
  if (BEFORE_INTERVIEW.has(c.status)) {
    return d.outcome === 'REJECT' ? { ...c, status: move(c.status, 'PAPER_REJECT'), paperReasons: d.failed.map((f) => f.rule) } : c;
  }

  const path: Status[] = [];
  if (d.outcome === 'REJECT') {
    path.push('PAPER_REJECT');
  } else if (c.docsReceivedAt) {
    if (c.status === 'REGISTERED') path.push('DOCS_RECEIVED');
    const target: Status = d.outcome === 'PASS' ? 'PAPER_PASS' : 'PAPER_HOLD';
    const steppingBack = c.status === 'PAPER_PASS' && target === 'PAPER_HOLD';
    if (!steppingBack) path.push(target);
  }

  let status = c.status;
  for (const s of path) status = move(status, s);
  return { ...c, status, paperReasons: d.failed.map((f) => f.rule) };
}
