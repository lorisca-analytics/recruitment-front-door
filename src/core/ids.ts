// Registration IDs. One format everywhere: PREFIX-0001.
// The original system ended up with two formats side by side (REG001 and REG-0006),
// which broke lookups between tabs. Here every input is parsed back to one shape.

export function formatId(prefix: string, n: number, pad: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid sequence number: ${n}`);
  return `${prefix}-${String(n).padStart(pad, '0')}`;
}

/**
 * Reads whatever a candidate or staff member typed and returns the sequence number.
 * Accepts "17", "0017", "DEMO-0017", "demo0017", " Demo 17 ".
 * Returns null when the text is not an ID for this prefix.
 */
export function parseIdNumber(input: unknown, prefix: string): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().toUpperCase().replace(/\s+/g, '');
  if (!text) return null;
  const p = prefix.toUpperCase();
  const m = text.match(new RegExp(`^(?:${p}-?)?(\\d{1,6})$`));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

export function normalizeId(input: unknown, prefix: string, pad: number): string | null {
  const n = parseIdNumber(input, prefix);
  return n === null ? null : formatId(prefix, n, pad);
}

/** Next ID = highest existing number + 1. Gaps are never reused. */
export function nextId(existing: unknown[], prefix: string, pad: number): string {
  let max = 0;
  for (const v of existing) {
    const n = parseIdNumber(v, prefix);
    if (n !== null && n > max) max = n;
  }
  return formatId(prefix, max + 1, pad);
}
