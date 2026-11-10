import { CheckResult } from './types';
import { normalizeId } from './ids';

// Background check results come back as a list keyed by registration ID.
// A result is only applied when the name on it matches the name on the
// registration too. A typo in one ID would otherwise attach a flagged result
// to the wrong person, or a clear result to someone who was never checked.

export interface CheckRow {
  regId: string;
  name: string;
  idCheck: string;
  creditCheck: string;
}

export type MatchOutcome =
  | { regId: string; status: 'APPLIED'; idCheck: CheckResult; creditCheck: CheckResult }
  | { regId: string; status: 'NAME_MISMATCH' | 'UNKNOWN_ID' | 'BAD_VALUE'; detail: string };

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCheck(value: string): CheckResult | null {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return 'PENDING';
  if (v === 'CLEAR' || v === 'CLEAN') return 'CLEAR';
  if (v === 'FLAGGED' || v === 'NOT CLEAN') return 'FLAGGED';
  if (v === 'PENDING') return 'PENDING';
  return null;
}

export function matchChecks(
  rows: CheckRow[],
  registrations: Map<string, string>, // regId -> registered name
  prefix: string,
  pad: number,
): MatchOutcome[] {
  return rows.map((r) => {
    const regId = normalizeId(r.regId, prefix, pad);
    if (!regId || !registrations.has(regId)) {
      return { regId: r.regId, status: 'UNKNOWN_ID', detail: 'No registration with this ID' };
    }
    if (normalizeName(registrations.get(regId)!) !== normalizeName(r.name)) {
      return { regId, status: 'NAME_MISMATCH', detail: 'Name on the check does not match the registration' };
    }
    const idCheck = parseCheck(r.idCheck);
    const creditCheck = parseCheck(r.creditCheck);
    if (!idCheck || !creditCheck) {
      return { regId, status: 'BAD_VALUE', detail: 'Use CLEAR, FLAGGED or PENDING' };
    }
    return { regId, status: 'APPLIED', idCheck, creditCheck };
  });
}
