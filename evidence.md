# Evidence

How the problem was solved, and why each call was made. The design choices, with the options and what each one gives up, are in [DECISIONS.md](DECISIONS.md).

## Where the claims come from

| Claim in the README | Where it comes from |
|---|---|
| 10,000+ CVs a year, hiring turnaround about 80% lower, admin work about 60% lower | My own record of the real operation. The data here is synthetic, so this repo can't re-measure them |
| Daily online sessions of 40 to 50 candidates, multi-city walk-in interview days | The real operation |
| Recruiters sent the form link, the form recorded the portal, repeat registrations across portals were caught | My original design. The rebuild re-implements it in [door.ts](src/core/door.ts) |
| Each rule and module behaves as described | The tests in [tests/](tests/), run on every push |
| Example candidates, portal export shapes, funnel ratios | Synthetic, made by [seed.ts](scripts/seed.ts) and [before-after.ts](scripts/before-after.ts) with a fixed seed |

## How the problem was solved

1. Find where the time went. The trouble sat after the portals: re-typing, duplicates, and eligibility judged by reading CVs.
2. Put one door in front of the operation, so there is one record shape and one ID per person.
3. Split the decision in two. Rules that never change from candidate to candidate run on paper. The interview is kept for choosing among people who already qualify.
4. Give the interviewer the same one-page case file for everyone, with probe points from that person's own record.
5. Make the sheet safe to run by a team: one lock for every writer, a send log so jobs can rerun, a planned stop before the mail quota, and a status column that only moves along fixed steps.

## What was checked, and what wasn't

- Checked: every core rule has unit tests. The built Apps Script bundle runs against fake Sheets, Mail and Lock services, including the mail quota running out halfway.
- Not checked: Gmail inbox mode and the real PDF export call. Both need one live test event on a real sheet.
