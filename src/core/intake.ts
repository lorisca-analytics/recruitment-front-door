// Document intake. Candidates email their ID card and CV with their registration
// ID in the subject. Each message is matched to a registration, checked for the
// right attachments and logged once, keyed on the message ID.
// The Apps Script layer feeds this either from Gmail or from a Mock Inbox tab.

import { normalizeId } from './ids';

export interface InboxMessage {
  messageId: string;
  receivedAt: string;
  from: string;
  subject: string;
  attachments: { name: string; mimeType: string }[];
}

export type IntakeResult =
  | { ok: true; regId: string; idCardFile: string; cvFile: string }
  | { ok: false; regId: string | null; problem: string };

const ID_CARD_HINT = /(id[\s_-]?card|ktp|identity)/i;
const CV_HINT = /(cv|resume|curriculum)/i;
const ACCEPTED_ID = ['application/pdf', 'image/png', 'image/jpeg'];

export function parseIntake(
  msg: InboxMessage,
  prefix: string,
  pad: number,
  knownIds: Set<string>,
  emailById: Map<string, string>,
): IntakeResult {
  const token = msg.subject.match(new RegExp(`${prefix}[\\s-]?\\d{1,6}`, 'i'));
  const regId = token ? normalizeId(token[0], prefix, pad) : null;
  if (!regId) return { ok: false, regId: null, problem: 'No registration ID in subject' };
  if (!knownIds.has(regId)) return { ok: false, regId, problem: 'Registration ID not found' };

  const registered = (emailById.get(regId) || '').trim().toLowerCase();
  const sender = (msg.from.match(/<([^>]+)>/)?.[1] || msg.from).trim().toLowerCase();
  if (!registered) return { ok: false, regId, problem: 'No email on the registration to match against' };
  if (sender !== registered) {
    return { ok: false, regId, problem: 'Sender does not match the registered email' };
  }

  const idCard = msg.attachments.find((a) => ID_CARD_HINT.test(a.name) && ACCEPTED_ID.includes(a.mimeType));
  const cv = msg.attachments.find((a) => CV_HINT.test(a.name) && a.mimeType === 'application/pdf');
  if (!idCard && !cv) return { ok: false, regId, problem: 'ID card and CV both missing' };
  if (!idCard) return { ok: false, regId, problem: 'ID card missing or wrong file type' };
  if (!cv) return { ok: false, regId, problem: 'CV missing or not a PDF' };
  return { ok: true, regId, idCardFile: idCard.name, cvFile: cv.name };
}

/** Messages already in the log are skipped, so the job can run again safely. */
export function newMessages(messages: InboxMessage[], loggedIds: Set<string>): InboxMessage[] {
  return messages.filter((m) => !loggedIds.has(m.messageId));
}
