// Columns are found by header name, never by position. In the original, every
// script used fixed column numbers, so adding one form question shifted everything.

export type HeaderIndex<K extends string> = Record<K, number>;

export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Maps logical field names to 0-based column positions.
 * `spec` maps each field to the header text (or several accepted spellings).
 * Throws one error listing every missing header, so setup problems show up at once.
 */
export function buildHeaderIndex<K extends string>(
  headerRow: unknown[],
  spec: Record<K, string | readonly string[]>,
): HeaderIndex<K> {
  const positions = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key && !positions.has(key)) positions.set(key, i);
  });
  const out = {} as HeaderIndex<K>;
  const missing: string[] = [];
  (Object.keys(spec) as K[]).forEach((field) => {
    const names: string[] = typeof spec[field] === 'string' ? [spec[field] as string] : [...(spec[field] as readonly string[])];
    const hit = names.map(normalizeHeader).find((n) => positions.has(n));
    if (hit === undefined) missing.push(names[0]);
    else out[field] = positions.get(hit)!;
  });
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}`);
  return out;
}
