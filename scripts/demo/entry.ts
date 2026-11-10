// Static demo of the check-in page. Same lookup logic as the Apps Script
// version, running in the browser on synthetic data. Check-ins live in memory
// only and reset when the page reloads.
import { Candidate, DEMO_CONFIG, lookupForCheckIn } from '../../src/core';
import data from './candidates.slim.json';

const people = data as unknown as Candidate[];

(window as unknown as { demoCheckIn: (t: string) => unknown }).demoCheckIn = (typed: string) => {
  const r = lookupForCheckIn(typed, people, DEMO_CONFIG);
  if (r.ok && !r.alreadyCheckedIn) {
    const c = people.find((p) => p.regId === r.regId)!;
    c.status = 'CHECKED_IN';
  }
  return r;
};
