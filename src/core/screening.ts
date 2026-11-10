import { Candidate, Education, Track } from './types';

// The paper decision. Hard rules settle most cases before anyone meets the
// candidate, the way a visa file is checked against the requirements first.
// Every reason is recorded, so a rejection can always be explained.

export const EDUCATION_ORDER: Education[] = [
  'High school',
  'Diploma 1-2',
  'Diploma 3',
  'Bachelor',
  'Master',
  'Doctorate',
];

export type PaperOutcome = 'PASS' | 'REJECT' | 'WAIT';

export interface Finding {
  rule: string;
  message: string;
}

export interface PaperDecision {
  outcome: PaperOutcome;
  failed: Finding[]; // hard rules broken. Any one of these means REJECT.
  waitingFor: Finding[]; // missing inputs. Decision waits, nothing is assumed.
}

export function ageOn(birthDate: string, onDate: string): number {
  const b = new Date(birthDate + 'T00:00:00Z');
  const d = new Date(onDate + 'T00:00:00Z');
  if (isNaN(b.getTime()) || isNaN(d.getTime())) throw new Error('Invalid date for age');
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    d.getUTCMonth() < b.getUTCMonth() ||
    (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function meetsEducation(has: Education, min: Education): boolean {
  const a = EDUCATION_ORDER.indexOf(has);
  const b = EDUCATION_ORDER.indexOf(min);
  // An unknown value must never turn into a silent rejection or a silent pass.
  if (a < 0) throw new Error(`Unknown education value "${has}". Use one of: ${EDUCATION_ORDER.join(', ')}`);
  if (b < 0) throw new Error(`Unknown minimum education "${min}" on the Tracks tab`);
  return a >= b;
}

export function paperDecision(c: Candidate, track: Track, eventDate: string): PaperDecision {
  const failed: Finding[] = [];
  const waitingFor: Finding[] = [];

  if (!c.consent) failed.push({ rule: 'consent', message: 'Consent statement not accepted' });

  if (!meetsEducation(c.education, track.minEducation)) {
    failed.push({
      rule: 'education',
      message: `${c.education} is below the ${track.minEducation} minimum for ${track.label}`,
    });
  }

  const age = ageOn(c.birthDate, eventDate);
  if (age < track.minAge || age > track.maxAge) {
    failed.push({
      rule: 'age',
      message: `Age ${age} is outside ${track.minAge} to ${track.maxAge} for ${track.label}`,
    });
  }

  if (track.minGpa !== null && c.gpa !== null && c.gpa < track.minGpa) {
    failed.push({ rule: 'gpa', message: `GPA ${c.gpa.toFixed(2)} is below ${track.minGpa.toFixed(2)}` });
  }

  if (c.activeStudent && !track.allowActiveStudents) {
    failed.push({ rule: 'active-student', message: 'Still an active student. This track needs full-time availability' });
  }

  if (track.requiresSalesLicence && !c.hasSalesLicence) {
    failed.push({ rule: 'licence', message: `${track.label} requires a sales licence` });
  }

  if (c.idCheck === 'FLAGGED') failed.push({ rule: 'id-check', message: 'Identity and history check flagged' });
  if (c.creditCheck === 'FLAGGED') failed.push({ rule: 'credit-check', message: 'Credit record check flagged' });

  if (!c.docsReceivedAt) waitingFor.push({ rule: 'documents', message: 'ID card and CV not received yet' });
  if (c.idCheck === 'PENDING') waitingFor.push({ rule: 'id-check', message: 'Identity and history check pending' });
  if (c.creditCheck === 'PENDING') waitingFor.push({ rule: 'credit-check', message: 'Credit record check pending' });

  // A broken hard rule decides the case even while other inputs are missing.
  // There is no reason to wait for a credit check on someone who is under age.
  const outcome: PaperOutcome = failed.length ? 'REJECT' : waitingFor.length ? 'WAIT' : 'PASS';
  return { outcome, failed, waitingFor };
}
