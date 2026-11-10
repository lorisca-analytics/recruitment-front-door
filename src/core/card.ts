import { Candidate, EventConfig } from './types';
import { ageOn } from './screening';
import { findTrack } from './config';
import { whatsappLink, normalizeWhatsapp } from './phone';
import { decisionTrail } from './trail';

// The one-glance case file. Every candidate's form answers are laid out on the
// same one-page card, so an interviewer can read a candidate in under a minute
// and handle about ten in a session. The card also lists probe points: things
// in this candidate's own record worth asking about. They are prompts for the
// interviewer, never a fixed script.

export interface CardField {
  label: string;
  value: string;
  href?: string;
}

export interface CandidateCard {
  regId: string;
  name: string;
  headline: string;
  status: string;
  basics: CardField[];
  work: CardField[];
  education: CardField[];
  probes: string[];
  trail: { step: string; detail: string }[];
  notes: string;
}

export function monthsBetween(startYm: string, endYm: string): number {
  const [y1, m1] = startYm.split('-').map(Number);
  const [y2, m2] = endYm.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** Months worked, counting both the first and last month. Oct to Dec is 3. */
export function tenureMonths(startYm: string, endYm: string): number {
  return monthsBetween(startYm, endYm) + 1;
}

export function probePoints(c: Candidate, config: EventConfig): string[] {
  const out: string[] = [];
  const eventYm = config.eventDate.slice(0, 7);
  const track = findTrack(config, c.finalTrack || c.appliedTrack);
  const hasJob = Boolean(c.lastCompany && c.lastJobStart);

  if (hasJob) {
    const end = c.lastJobEnd || eventYm;
    const tenure = tenureMonths(c.lastJobStart!, end);
    if (tenure < 12) {
      out.push(`Stayed ${tenure} months at ${c.lastCompany}. Ask what made them leave and what they would need to stay.`);
    }
    if (!c.lastJobEnd) {
      out.push(`Still working at ${c.lastCompany}. Ask about notice period and why they are moving now.`);
    } else {
      const gap = monthsBetween(c.lastJobEnd, eventYm);
      if (gap >= 6) out.push(`${gap} months since the last job ended. Ask how they spent that time.`);
    }
  }

  if (c.experienceLevel === 'Fresh graduate, no work experience' && hasJob) {
    out.push('Marked as having no work experience but lists a last employer. Clarify which is right.');
  }

  if (track.code !== 'ADVISOR' && hasJob && !/sales|account|business|marketing|relationship/i.test(c.lastRole)) {
    out.push(`Last role was ${c.lastRole}. Ask for one time they changed someone's mind about buying or joining something.`);
  }

  if (!hasJob && c.experienceLevel !== 'Fresh graduate, no work experience') {
    out.push('Work history left blank. Ask about any part-time, family business or campus work.');
  }

  if (c.gpa !== null && track.minGpa !== null && c.gpa - track.minGpa < 0.15) {
    out.push(`GPA ${c.gpa.toFixed(2)} is at or just above the minimum. Look for evidence of effort outside grades.`);
  }

  const eventCity = config.venueLine2.trim().toLowerCase();
  if (c.domicileCity.trim().toLowerCase() !== eventCity) {
    out.push(`Lives in ${c.domicileCity}. Ask whether they would relocate or commute to ${config.venueLine2}.`);
  }

  if (!out.length) out.push('No flags on paper. Pick one line of the work history and ask for a concrete example.');
  return out;
}

export function buildCard(c: Candidate, config: EventConfig): CandidateCard {
  const track = findTrack(config, c.finalTrack || c.appliedTrack);
  const wa = normalizeWhatsapp(c.whatsapp);
  const tenure =
    c.lastJobStart ? `${tenureMonths(c.lastJobStart, c.lastJobEnd || config.eventDate.slice(0, 7))} months` : '';
  return {
    regId: c.regId,
    name: c.fullName,
    headline: `${track.label} | ${c.domicileArea === c.domicileCity ? c.domicileCity : `${c.domicileArea}, ${c.domicileCity}`}`,
    status: c.status,
    basics: [
      { label: 'Age', value: `${ageOn(c.birthDate, config.eventDate)}` },
      { label: 'WhatsApp', value: wa ? `+${wa}` : 'Invalid number', href: whatsappLink(wa, `Hello ${c.fullName.split(' ')[0]}`) || undefined },
      { label: 'Email', value: c.email, href: `mailto:${c.email}` },
      { label: 'CV', value: 'Open CV', href: c.cvUrl },
      { label: 'Came through', value: c.alsoVia.length ? `${c.source} (also ${c.alsoVia.join(', ')})` : c.source },
      { label: 'Desk', value: c.desk ? `${c.desk}${c.interviewer ? ' with ' + c.interviewer : ''}` : 'Not assigned' },
    ],
    work: [
      { label: 'Level', value: c.experienceLevel },
      { label: 'Last company', value: c.lastCompany || 'None' },
      { label: 'Last role', value: c.lastRole || 'None' },
      { label: 'Period', value: c.lastJobStart ? `${c.lastJobStart} to ${c.lastJobEnd || 'now'} (${tenure})` : 'None' },
      { label: 'Last pay', value: c.lastPay ? c.lastPay.toLocaleString('en-US') : 'Not given' },
    ],
    education: [
      { label: 'Level', value: c.education },
      { label: 'Institution', value: c.institution },
      { label: 'Major', value: c.major },
      { label: 'GPA', value: c.gpa === null ? 'Not given' : c.gpa.toFixed(2) },
    ],
    probes: probePoints(c, config),
    trail: decisionTrail(c, config),
    notes: c.interviewNotes,
  };
}
