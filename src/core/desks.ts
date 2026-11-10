import { Candidate } from './types';

// Interview desk routing. Each desk covers one or more home areas, so candidates
// meet an interviewer from the branch they would join. Within an area the
// least-loaded desk gets the next candidate. Assignments already made are kept,
// so rerunning the router never shuffles people who are already seated.

export interface Desk {
  id: string; // e.g. "Desk 03"
  interviewer: string;
  areas: string[]; // home areas this desk covers. Empty means any area.
}

export interface Routing {
  assignments: Map<string, string>; // regId -> desk id
  overflow: string[]; // regIds with no desk capacity left
}

export function routeToDesks(candidates: Candidate[], desks: Desk[], capacity: number): Routing {
  const load = new Map<string, number>(desks.map((d) => [d.id, 0]));
  const assignments = new Map<string, string>();
  const overflow: string[] = [];

  // Keep existing seats first.
  for (const c of candidates) {
    if (c.desk && load.has(c.desk)) {
      assignments.set(c.regId, c.desk);
      load.set(c.desk, load.get(c.desk)! + 1);
    }
  }

  const waiting = candidates
    .filter((c) => !assignments.has(c.regId))
    .sort((a, b) => (a.checkedInAt || a.regId).localeCompare(b.checkedInAt || b.regId));

  for (const c of waiting) {
    const area = c.domicileArea.trim().toLowerCase();
    const covering = desks.filter((d) => d.areas.some((a) => a.trim().toLowerCase() === area));
    const anyArea = desks.filter((d) => d.areas.length === 0);
    const hasRoom = (d: Desk) => load.get(d.id)! < capacity;
    // Area desks first. When they are full, or none cover the area, use the any-area desks.
    let open = covering.filter(hasRoom);
    if (!open.length) open = anyArea.filter(hasRoom);
    if (!open.length) {
      overflow.push(c.regId);
      continue;
    }
    open.sort((a, b) => load.get(a.id)! - load.get(b.id)! || a.id.localeCompare(b.id));
    const pick = open[0];
    assignments.set(c.regId, pick.id);
    load.set(pick.id, load.get(pick.id)! + 1);
  }
  return { assignments, overflow };
}

/**
 * Splits a day of online interviews into sessions of at most `maxPerSession`
 * candidates, keeping people from the same area in the same session where possible.
 */
export function planSessions(candidates: Candidate[], maxPerSession: number): string[][] {
  if (maxPerSession < 1) throw new Error('maxPerSession must be at least 1');
  const byArea = new Map<string, string[]>();
  for (const c of [...candidates].sort((a, b) => a.regId.localeCompare(b.regId))) {
    const k = c.domicileArea;
    if (!byArea.has(k)) byArea.set(k, []);
    byArea.get(k)!.push(c.regId);
  }
  const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length);
  const sessions: string[][] = [];
  for (const [, ids] of areas) {
    for (const id of ids) {
      let s = sessions.find((x) => x.length < maxPerSession);
      if (!s) {
        s = [];
        sessions.push(s);
      }
      s.push(id);
    }
  }
  return sessions;
}
