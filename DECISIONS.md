# Decisions

The design choices in this rebuild, with the options I weighed and what each choice gives up.

## 1. Google Sheets and Apps Script as the platform

- Options: a hiring tool (ATS), a small web app with a database, or Google Sheets with Apps Script.
- Picked: Sheets with Apps Script.
- Why: the team had to run it without me, and the bank already worked in Google Workspace. A sheet everyone could open beat a tool nobody had access to.
- Given up: access tiers, a retention policy and real database constraints. Apps Script also has daily quotas, so the email sender has to stop and resume (decision 6). The logic in `src/core` has no Google dependency, so it can move to a database later.

## 2. One door, with repeat registrations caught at the door

- Options: take each portal's export as it came and clean it later, or send every screened candidate the same form and match repeats on entry.
- Picked: one form for everyone. A second registration is matched to the first by email, WhatsApp number, or name plus birth date ([door.ts](src/core/door.ts)).
- Why: the same person often passed screening on two portals. One record per person means one ID, one set of emails and one place to look.
- Given up: any single match is enough, so two different people who share one phone number would be folded into one record. The first record keeps "Also came via", and the duplicate points to it, so staff can see and undo the match.
- The first registration always wins, and records already marked keep their marking, so the check can run again with no harm.

## 3. Hard rules run on form data at submit

- Options: collect every document first and judge eligibility afterwards, or apply the hard rules to the form answers straight away.
- Picked: rules first, on the form answers ([screening.ts](src/core/screening.ts)). Rules live on a Tracks tab, not in code.
- Why: candidates who fail are told at once, and no ID card is collected from them.
- Given up: the form answers are self-reported. A check that comes back flagged after the invitation still rejects before the interview. A missing check means hold, never a guess. Changing a Tracks rule only affects candidates who have no decision yet.

## 4. A sender job with a send log, not an edit trigger

- Options: fire an email from an edit trigger, or run a job that works out what each candidate is owed.
- Picked: a time-driven job that reads every row and a send log per candidate ([notify.ts](src/core/notify.ts)).
- Why: the original edit trigger read only the top row of an edit, so a pasted block of decisions could reach one person. The log records only sends that succeeded, so the job can run again with no double emails.
- Given up: emails go out on the next run (every 10 minutes), not the instant a decision is typed.

## 5. One document lock for every writer

- Options: let each script read and write on its own, or make every writer take the same lock.
- Picked: every function that writes to Registrations runs under one document lock. IDs are assigned under that lock, so two submissions in the same second never share an ID.
- Why: a check import and the email run could each read the sheet, change it and write back over each other.
- Given up: writers wait for each other. The email job gives up after 10 seconds and leaves the work to its next run.

## 6. Stop before the daily mail quota

- Options: send until Google refuses, or plan each run against the quota left.
- Picked: at most 20 per run, and never past the remaining daily quota. The rest wait for the next run.
- Why: a run that dies halfway leaves no trace of who was emailed. A planned stop always does.
- Given up: on a big event day, emails can spread over several runs.

## 7. A background check result needs the ID and the name to agree

- Options: match results by ID only, or by ID and name.
- Picked: ID and name ([bgcheck.ts](src/core/bgcheck.ts)).
- Why: one mistyped ID could attach a flag to the wrong person.
- Given up: a result with a misspelt name is left unmatched and has to be fixed by hand.

## 8. Columns by header name, one status column

- Options: address columns by number and track progress in free-text columns, or find columns by header and keep one status with fixed moves.
- Picked: header names ([headers.ts](src/core/headers.ts)) and one status column ([status.ts](src/core/status.ts)).
- Why: in the original, adding one form question shifted every column, and "done", "Done" and TRUE all meant the same thing.
- Given up: renaming a header breaks setup. It fails loudly instead of writing to the wrong column.

## 9. Check-in as a panel inside the sheet

- Options: a public Apps Script web app on the check-in laptop, or a sidebar panel inside the sheet.
- Picked: the sidebar panel.
- Why: a review of the first version found that a public web app would let anyone in the company run any script in the project. A panel only works for people the sheet is shared with.
- Given up: the check-in laptop needs the sheet open and shared with whoever runs the desk.
