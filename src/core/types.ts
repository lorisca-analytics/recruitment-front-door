// Shared shapes. Every module works on these plain objects, so the logic can be
// tested without a spreadsheet. The Apps Script layer maps sheet rows to them.

export type Education =
  | 'High school'
  | 'Diploma 1-2'
  | 'Diploma 3'
  | 'Bachelor'
  | 'Master'
  | 'Doctorate';

export type CheckResult = 'CLEAR' | 'FLAGGED' | 'PENDING';

export type ExperienceLevel =
  | 'Fresh graduate, no work experience'
  | 'Fresh graduate, some work experience'
  | 'Experienced';

/** What the candidate typed into the standardized application form. */
export interface Application {
  submittedAt: string; // ISO timestamp
  email: string;
  consent: boolean;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  sex: 'F' | 'M';
  whatsapp: string; // raw, as typed
  domicileCity: string;
  domicileArea: string;
  education: Education;
  institution: string;
  major: string;
  gpa: number | null; // 0 to 4 scale
  activeStudent: boolean;
  experienceLevel: ExperienceLevel;
  lastCompany: string;
  lastRole: string;
  lastJobStart: string | null; // YYYY-MM
  lastJobEnd: string | null; // YYYY-MM, null means still working there
  lastPay: number | null;
  hasSalesLicence: boolean;
  appliedTrack: string; // track code from Config, e.g. SALES
  source: string; // the job portal or channel where they passed first screening
  cvUrl: string;
}

/** The single status field. Replaces the many free-text "done / Done / TRUE" columns. */
export type Status =
  | 'REGISTERED'
  | 'DUPLICATE'
  | 'DOCS_RECEIVED'
  | 'PAPER_REJECT'
  | 'PAPER_HOLD'
  | 'PAPER_PASS'
  | 'INVITED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'NO_SHOW'
  | 'INTERVIEW_OK'
  | 'INTERVIEW_NOT_OK'
  | 'INTERVIEW_REFER'
  | 'OFFER_SENT'
  | 'JOINED'
  | 'WITHDRAWN';

export interface Candidate extends Application {
  regId: string;
  status: Status;
  idCheck: CheckResult; // identity and history check
  creditCheck: CheckResult; // credit record check
  docsReceivedAt: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  desk: string | null;
  interviewer: string | null;
  interviewNotes: string;
  finalTrack: string | null;
  paperReasons: string[];
  duplicateOf: string | null; // set on a second registration by the same person
  alsoVia: string[]; // other portals this person came through
  log: string[]; // send log keys, e.g. "sent:confirmation"
}

export interface Track {
  code: string;
  label: string;
  minEducation: Education;
  minAge: number;
  maxAge: number;
  minGpa: number | null;
  requiresSalesLicence: boolean;
  allowActiveStudents: boolean;
  zoneColour: string;
  seatingArea: string;
}

export interface EventConfig {
  idPrefix: string;
  idPad: number;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  eventTime: string; // HH:mm
  venueLine1: string;
  venueLine2: string;
  candidatesPerDesk: number;
  maxPerSession: number;
  maxEmailsPerRun: number;
  tracks: Track[];
}
