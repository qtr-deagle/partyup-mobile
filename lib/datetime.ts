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

export type Countdown = {
  /** Small caption above the value: "Pickup in" or "Pickup". */
  lead: string;
  /** The big part: "45", "5h 20m", "Tomorrow", "11". */
  value: string;
  /** Smaller unit next to the value, if any: "min", "days". */
  unit: string | null;
  /** The exact time, e.g. "Today · 5:00 PM", "Wed, Oct 21 · 5:00 AM". */
  when: string;
  /** Under an hour away: worth highlighting. */
  soon: boolean;
};

// Calendar day in Manila as a day number, so "tomorrow" means the next date,
// not "within 24 hours".
function manilaDayNumber(date: Date) {
  // en-US numeric ("10/21/2026") formats the same on every JS engine.
  const [month, day, year] = date
    .toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: MANILA_TZ })
    .split('/')
    .map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * How long until `startAt`, worded for a glance: "45 min", "5h 20m",
 * "Tomorrow", "3 days", with the exact time underneath. Null once it has
 * passed or when unset.
 */
export function describeCountdown(startAt: string | null | undefined, now: Date = new Date()): Countdown | null {
  if (!startAt) {
    return null;
  }
  const start = parseTimestamp(startAt);
  const diffMs = start.getTime() - now.getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return null;
  }

  const minutes = Math.ceil(diffMs / 60_000);
  const dayGap = manilaDayNumber(start) - manilaDayNumber(now);
  const clock = formatClockTime(start);
  const dateLabel = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: MANILA_TZ });

  if (minutes < 60) {
    return { lead: 'Pickup in', value: String(minutes), unit: minutes === 1 ? 'min' : 'mins', when: `${dayGap === 0 ? 'Today' : 'Tomorrow'} · ${clock}`, soon: true };
  }
  if (dayGap === 0) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return { lead: 'Pickup in', value: rest ? `${hours}h ${rest}m` : `${hours}h`, unit: null, when: `Today · ${clock}`, soon: false };
  }
  if (dayGap === 1) {
    return { lead: 'Pickup', value: 'Tomorrow', unit: null, when: `${dateLabel} · ${clock}`, soon: false };
  }
  return { lead: 'Pickup in', value: String(dayGap), unit: 'days', when: `${dateLabel} · ${clock}`, soon: false };
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
