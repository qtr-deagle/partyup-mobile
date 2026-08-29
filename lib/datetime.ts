/**
 * Supabase/Postgres returns timestamptz values like "2026-08-28 06:04:48.537453+00"
 * (space separator, no colon in the offset). That format is outside the strict
 * ISO 8601 subset required by the spec, so `new Date(...)` parses it inconsistently
 * across JS engines (works on V8, can be misread as local time on Hermes/JSC) —
 * normalize it to a strict ISO string before parsing so the UTC offset is always honored.
 */
export function parseTimestamp(value: string): Date {
  const trimmed = value.trim();
  let iso = trimmed.replace(' ', 'T');

  const offsetMatch = iso.match(/(Z)$|([+-])(\d{2}):?(\d{2})?$/i);
  if (!offsetMatch) {
    iso += 'Z';
  } else if (offsetMatch[2]) {
    const sign = offsetMatch[2];
    const hours = offsetMatch[3];
    const minutes = offsetMatch[4] ?? '00';
    iso = iso.slice(0, iso.length - offsetMatch[0].length) + `${sign}${hours}:${minutes}`;
  }

  return new Date(iso);
}
