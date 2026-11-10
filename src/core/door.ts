import { Candidate } from './types';
import { normalizeName } from './bgcheck';
import { normalizeWhatsapp } from './phone';
import { move } from './status';

// The one door. Candidates arrive from many job portals, each of which has
// already run its own first screening. Recruiters send everyone who passed the
// same form link, and the form asks which portal they came through.
//
// The same person often passes screening on two portals and registers twice.
// At the door, a second registration is matched to the first by email,
// WhatsApp number, or name plus birth date. The person keeps one record and
// one ID. The extra portal is noted on that record.

export function identityKeys(c: Candidate): string[] {
  const keys: string[] = [];
  const email = c.email.trim().toLowerCase();
  if (email) keys.push(`email:${email}`);
  const wa = normalizeWhatsapp(c.whatsapp);
  if (wa) keys.push(`wa:${wa}`);
  const name = normalizeName(c.fullName);
  if (name && c.birthDate) keys.push(`person:${name}|${c.birthDate}`);
  return keys;
}

export interface DoorResult {
  candidates: Candidate[];
  newDuplicates: { regId: string; duplicateOf: string; via: string }[];
}

/**
 * Checks every new registration against everyone who came in earlier.
 * Earlier means earlier submission time, so the first registration always wins.
 * Records already marked keep their marking, so the check can run again safely.
 */
export function checkDuplicates(all: Candidate[]): DoorResult {
  const order = [...all].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.regId.localeCompare(b.regId));
  const owner = new Map<string, string>(); // identity key -> regId of the first registration
  const byId = new Map(all.map((c) => [c.regId, { ...c, alsoVia: [...c.alsoVia] }]));
  const newDuplicates: DoorResult['newDuplicates'] = [];

  for (const c of order) {
    const current = byId.get(c.regId)!;
    if (current.status === 'DUPLICATE') continue;
    const keys = identityKeys(current);
    const firstId = keys.map((k) => owner.get(k)).find((id) => id && id !== current.regId);
    if (firstId && current.status === 'REGISTERED') {
      const first = byId.get(firstId)!;
      current.status = move(current.status, 'DUPLICATE');
      current.duplicateOf = firstId;
      if (current.source !== first.source && !first.alsoVia.includes(current.source)) first.alsoVia.push(current.source);
      newDuplicates.push({ regId: current.regId, duplicateOf: firstId, via: current.source });
      continue;
    }
    keys.forEach((k) => {
      if (!owner.has(k)) owner.set(k, current.regId);
    });
  }
  return { candidates: all.map((c) => byId.get(c.regId)!), newDuplicates };
}
