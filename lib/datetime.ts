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

/**
 * Formats the time remaining until `startAt` as a short countdown label
 * (e.g. "2.3h", "45m"), or null if it's already passed / unset.
 */
export function formatCountdown(startAt: string | null | undefined): string | null {
  if (!startAt) {
    return null;
  }
  const diffMs = parseTimestamp(startAt).getTime() - Date.now();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return null;
  }
  const diffMinutes = diffMs / 60000;
  if (diffMinutes < 60) {
    return `${Math.round(diffMinutes)}m`;
  }
  return `${(diffMinutes / 60).toFixed(1)}h`;
}

/**
 * Short relative label for a past timestamp ("just now", "5m ago", "3h ago", "2d ago").
 */
export function formatTimeAgo(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - parseTimestamp(value).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Clock times are always 12-hour Manila time ("3:45 PM"), whatever the
// phone's 24-hour setting or locale. The admin website uses the same rules
// (PartyUp-main/client/src/lib/datetime.ts).
const MANILA_TZ = 'Asia/Manila';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseTimestamp(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "3:45 PM" */
export function formatClockTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date
    ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: MANILA_TZ })
    : '';
}

/** "Oct 6, 2026, 3:45 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date
    ? date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: MANILA_TZ,
      })
    : '';
}
