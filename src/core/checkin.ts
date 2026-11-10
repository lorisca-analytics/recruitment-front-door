import { Candidate, EventConfig } from './types';
import { normalizeId } from './ids';
import { findTrack } from './config';

// Event-day check-in. Staff type the number a candidate shows them (3 or 4
// digits is enough). The page greets the candidate by name and tells them which
// colour tag to take and where to sit, so the hall sorts itself by track.

export type CheckInResult =
  | {
      ok: true;
      regId: string;
      firstName: string;
      trackLabel: string;
      zoneColour: string;
      seatingArea: string;
      desk: string | null;
      alreadyCheckedIn: boolean;
    }
  | { ok: false; reason: string };

const ELIGIBLE = new Set(['INVITED', 'CONFIRMED', 'CHECKED_IN', 'NO_SHOW']);

export function lookupForCheckIn(typed: string, candidates: Candidate[], config: EventConfig): CheckInResult {
  const regId = normalizeId(typed, config.idPrefix, config.idPad);
  if (!regId) return { ok: false, reason: 'Type the registration number, for example 17 or DEMO-0017' };
  const c = candidates.find((x) => x.regId === regId);
  if (!c) return { ok: false, reason: `${regId} is not registered for this event` };
  if (!ELIGIBLE.has(c.status)) {
    // Staff see a neutral message. The reason stays in the sheet.
    return { ok: false, reason: `${regId} is not on today's invitation list. Please see the help desk.` };
  }
  const track = findTrack(config, c.finalTrack || c.appliedTrack);
  return {
    ok: true,
    regId,
    firstName: c.fullName.split(/\s+/)[0],
    trackLabel: track.label,
    zoneColour: track.zoneColour,
    seatingArea: track.seatingArea,
    desk: c.desk,
    alreadyCheckedIn: c.status === 'CHECKED_IN',
  };
}

/** Reads the 3 to 4 digit number typed into the attendance confirmation form. */
export function confirmationToId(typed: string, config: EventConfig): string | null {
  return normalizeId(typed, config.idPrefix, config.idPad);
}
