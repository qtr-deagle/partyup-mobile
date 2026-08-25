import type { SearchProfile } from '@/lib/social';

const DESTINATIONS = ['Batangas', 'Baguio', 'Tagaytay', 'Palawan', 'Cebu', 'Siargao', 'La Union', 'Bohol', 'Vigan', 'Zambales'];
const FALLBACK_ORIGINS = ['Makati', 'Quezon City', 'Pasig', 'Taguig', 'Mandaluyong', 'Manila'];
const PURPOSES = ['Vacation', 'Business', 'Backpacking', 'Study'] as const;
const BUDGET_TIERS = ['Budget', 'Mid-range', 'Luxury'] as const;
const VIBE_TAGS = ['Instagram Hunter', 'Foodie', 'Night Owl', 'Early Riser', 'Adventure Seeker', 'Culture Buff'];

export type Purpose = (typeof PURPOSES)[number];
export type BudgetTier = (typeof BUDGET_TIERS)[number];

// distanceKm stands in for real geofencing (no GPS capture exists yet); everything else here is
// deterministic per profile id so the same card always shows the same trip details.
export type MockTripData = {
  distanceKm: number;
  route: { origin: string; destination: string };
  dates: { start: Date; end: Date };
  purpose: Purpose;
  budgetTier: BudgetTier;
  vibeTag: string;
  carpoolAvailable: boolean;
};

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

export function getAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = now.getMonth() > dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function getMockTripData(profile: SearchProfile): MockTripData {
  const random = mulberry32(hashSeed(profile.id));

  const origin = profile.city ?? pick(random, FALLBACK_ORIGINS);
  const destination = pick(random, DESTINATIONS.filter((place) => place !== origin));

  const startOffsetDays = 5 + Math.floor(random() * 90);
  const tripLengthDays = 1 + Math.floor(random() * 4);
  const start = new Date();
  start.setDate(start.getDate() + startOffsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + tripLengthDays);

  return {
    distanceKm: Math.round((0.5 + random() * 12) * 10) / 10,
    route: { origin, destination },
    dates: { start, end },
    purpose: pick(random, PURPOSES),
    budgetTier: pick(random, BUDGET_TIERS),
    vibeTag: pick(random, VIBE_TAGS),
    carpoolAvailable: random() > 0.5,
  };
}

export function formatDateShort(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
