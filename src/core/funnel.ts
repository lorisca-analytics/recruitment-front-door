import { Candidate } from './types';
import { normalizeName } from './bgcheck';

// Live funnel for the event. People who registered twice are counted once, which
// the original monitor did through a separate helper tab.

export const STAGES = [
  'Registered',
  'Documents in',
  'Passed on paper',
  'Invited',
  'Confirmed',
  'Checked in',
  'Interviewed',
  'Interview OK',
  'Offer sent',
  'Joined',
] as const;
export type Stage = (typeof STAGES)[number];

const INTERVIEWED = new Set(['INTERVIEW_OK', 'INTERVIEW_NOT_OK', 'INTERVIEW_REFER', 'OFFER_SENT', 'JOINED']);
const OK = new Set(['INTERVIEW_OK', 'OFFER_SENT', 'JOINED']);
const PAST_PAPER = new Set(['PAPER_PASS', 'INVITED', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW', ...INTERVIEWED]);
const PAST_INVITE = new Set(['INVITED', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW', ...INTERVIEWED]);

export function stagesReached(c: Candidate): Set<Stage> {
  const s = new Set<Stage>(['Registered']);
  if (c.docsReceivedAt) s.add('Documents in');
  if (PAST_PAPER.has(c.status)) s.add('Passed on paper');
  if (PAST_INVITE.has(c.status)) s.add('Invited');
  if (c.confirmedAt) s.add('Confirmed');
  if (c.checkedInAt) s.add('Checked in');
  if (INTERVIEWED.has(c.status)) s.add('Interviewed');
  if (OK.has(c.status)) s.add('Interview OK');
  if (c.status === 'OFFER_SENT' || c.status === 'JOINED') s.add('Offer sent');
  if (c.status === 'JOINED') s.add('Joined');
  return s;
}

/** Keeps the furthest-along record for each person (same name and birth date). */
export function dedupePeople(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    if (c.status === 'DUPLICATE') continue; // already folded into the first record at the door
    const key = `${normalizeName(c.fullName)}|${c.birthDate}`;
    const prev = best.get(key);
    if (!prev || stagesReached(c).size > stagesReached(prev).size) best.set(key, c);
  }
  return [...best.values()];
}

export interface FunnelRow {
  stage: Stage;
  count: number;
  fromPrevious: number | null; // share of the previous stage, 0 to 1
}

export function funnel(candidates: Candidate[]): FunnelRow[] {
  const people = dedupePeople(candidates);
  const counts = STAGES.map((stage) => people.filter((c) => stagesReached(c).has(stage)).length);
  return STAGES.map((stage, i) => ({
    stage,
    count: counts[i],
    fromPrevious: i === 0 || counts[i - 1] === 0 ? null : counts[i] / counts[i - 1],
  }));
}

export function bySource(candidates: Candidate[]) {
  const people = dedupePeople(candidates);
  const rows = new Map<string, { registered: number; passedPaper: number; checkedIn: number; ok: number }>();
  for (const c of people) {
    const r = rows.get(c.source) || { registered: 0, passedPaper: 0, checkedIn: 0, ok: 0 };
    const st = stagesReached(c);
    r.registered += 1;
    if (st.has('Passed on paper')) r.passedPaper += 1;
    if (st.has('Checked in')) r.checkedIn += 1;
    if (st.has('Interview OK')) r.ok += 1;
    rows.set(c.source, r);
  }
  return [...rows.entries()]
    .map(([source, r]) => ({ source, ...r }))
    .sort((a, b) => b.registered - a.registered);
}

/** How many paper rejections each hard rule caused. One candidate can fail several. */
export function rejectReasons(candidates: Candidate[]): { rule: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const c of dedupePeople(candidates)) {
    if (c.status !== 'PAPER_REJECT') continue;
    for (const r of c.paperReasons) tally.set(r, (tally.get(r) || 0) + 1);
  }
  return [...tally.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
}

export function daysUntil(eventDate: string, now: Date): number {
  const ev = new Date(eventDate + 'T00:00:00Z').getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((ev - today) / 86400000);
}

/** People who passed screening on more than one portal and were caught at the door. */
export function crossPortalDuplicates(candidates: Candidate[]): number {
  return candidates.filter((c) => c.status === 'DUPLICATE').length;
}
