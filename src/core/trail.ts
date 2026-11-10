import { Candidate, EventConfig } from './types';
import { paperDecision } from './screening';
import { findTrack } from './config';

// Decision trail. For any candidate, anyone can see where they came from,
// what the paper gate decided and why, and what happens next. A rejection
// can always be explained in one line.

export interface TrailStep {
  step: string;
  detail: string;
}

const DATE = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function nextStep(c: Candidate): string {
  switch (c.status) {
    case 'REGISTERED':
      return c.docsReceivedAt ? 'Paper decision' : 'Send ID card and CV';
    case 'DUPLICATE':
      return `None. Handled under ${c.duplicateOf}`;
    case 'DOCS_RECEIVED':
    case 'PAPER_HOLD':
      return 'Wait for background check results';
    case 'PAPER_PASS':
      return 'Invitation email';
    case 'INVITED':
      return 'Confirm attendance';
    case 'CONFIRMED':
      return 'Check in on event day';
    case 'NO_SHOW':
      return 'Re-invite or close';
    case 'CHECKED_IN':
      return 'Interview';
    case 'INTERVIEW_OK':
      return 'Offer';
    case 'INTERVIEW_REFER':
      return 'Re-invite for the referred track';
    case 'OFFER_SENT':
      return 'Join date';
    default:
      return 'Closed';
  }
}

export function decisionTrail(c: Candidate, config: EventConfig): TrailStep[] {
  const steps: TrailStep[] = [];
  const via = c.alsoVia.length ? `${c.source}, also via ${c.alsoVia.join(', ')}` : c.source;
  steps.push({ step: 'Came through', detail: `${via}. Registered ${DATE(c.submittedAt)}` });

  if (c.status === 'DUPLICATE') {
    steps.push({ step: 'At the door', detail: `Same person as ${c.duplicateOf}. No second record opened` });
    steps.push({ step: 'Next', detail: nextStep(c) });
    return steps;
  }

  const track = findTrack(config, c.appliedTrack);
  const d = paperDecision(c, track, config.eventDate);
  if (c.status === 'PAPER_REJECT' || d.outcome === 'REJECT') {
    steps.push({ step: 'Paper gate', detail: `Not eligible for ${track.label}: ${d.failed.map((f) => f.message).join('. ')}` });
  } else if (d.outcome === 'WAIT') {
    steps.push({ step: 'Paper gate', detail: `All rules met so far. Waiting on: ${d.waitingFor.map((w) => w.message).join('. ')}` });
  } else {
    steps.push({ step: 'Paper gate', detail: `Eligible for ${track.label}. Every rule met, checks clear` });
  }
  if (c.docsReceivedAt) steps.push({ step: 'Documents', detail: `Received ${DATE(c.docsReceivedAt)}` });
  if (c.log.includes('sent:invite')) steps.push({ step: 'Invited', detail: `${config.eventName}, ${config.eventDate}` });
  if (c.confirmedAt) steps.push({ step: 'Confirmed', detail: DATE(c.confirmedAt) });
  if (c.checkedInAt) steps.push({ step: 'Checked in', detail: `${DATE(c.checkedInAt)}${c.desk ? `, ${c.desk}` : ''}` });
  steps.push({ step: 'Next', detail: nextStep(c) });
  return steps;
}
