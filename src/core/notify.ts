import { Candidate } from './types';

// Which email each candidate is owed, worked out from status plus a send log.
// The original fired emails from an edit trigger on one column. Pasting a block
// of decisions only reached the top row, and a re-edit could double-send.
// Here a sender job looks at every row, every time, and the log makes each send
// happen at most once.

export type MessageKind = 'confirmation' | 'invite' | 'reject';

export const LOG_KEY: Record<MessageKind, string> = {
  confirmation: 'sent:confirmation',
  invite: 'sent:invite',
  reject: 'sent:reject',
};

export function hasSent(c: Candidate, kind: MessageKind): boolean {
  return c.log.includes(LOG_KEY[kind]);
}

/** The one message this candidate is owed right now, or null. */
export function dueMessage(c: Candidate): MessageKind | null {
  if (c.status === 'PAPER_REJECT') {
    // Rejections from the form alone go out before we ever ask for an ID card.
    return hasSent(c, 'reject') ? null : 'reject';
  }
  if (c.status === 'WITHDRAWN' || c.status === 'DUPLICATE') return null;
  if (!hasSent(c, 'confirmation')) return 'confirmation';
  if (c.status === 'PAPER_PASS' && !hasSent(c, 'invite')) return 'invite';
  return null;
}

export interface SendPlan {
  send: { regId: string; kind: MessageKind }[];
  invalid: { regId: string; reason: string }[];
  stoppedBy: 'quota' | 'run-limit' | null;
  leftover: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Picks what to send in this run. Stops before the daily mail quota runs out
 * and caps each run so one execution stays inside the Apps Script time limit.
 * Whatever is left is picked up by the next run, because the log only records
 * sends that actually happened.
 */
export function planSends(candidates: Candidate[], quotaRemaining: number, maxPerRun: number): SendPlan {
  const plan: SendPlan = { send: [], invalid: [], stoppedBy: null, leftover: 0 };
  const budget = Math.min(quotaRemaining, maxPerRun);
  for (const c of candidates) {
    const kind = dueMessage(c);
    if (!kind) continue;
    if (!EMAIL_RE.test(c.email.trim())) {
      plan.invalid.push({ regId: c.regId, reason: 'Email missing or malformed' });
      continue;
    }
    if (plan.send.length >= budget) {
      plan.leftover += 1;
      if (!plan.stoppedBy) plan.stoppedBy = quotaRemaining <= maxPerRun ? 'quota' : 'run-limit';
      continue;
    }
    plan.send.push({ regId: c.regId, kind });
  }
  return plan;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fills {{placeholders}}. Values are HTML-escaped. An unknown placeholder throws,
 * so a typo in a template never reaches a candidate as raw "{{name}}".
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`Template uses {{${key}}} but no value was given`);
    return escapeHtml(vars[key]);
  });
}
