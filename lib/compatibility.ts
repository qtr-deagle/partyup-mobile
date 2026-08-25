import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MockTripData } from '@/lib/discover-mock';
import type { SearchProfile } from '@/lib/social';

const MY_TRIP_STORAGE_KEY = 'partyup:discover:my-trip';

export type MyTrip = {
  origin: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
};

export const EMPTY_MY_TRIP: MyTrip = { origin: '', destination: '', startDate: null, endDate: null };

export async function loadMyTrip(): Promise<MyTrip> {
  try {
    const raw = await AsyncStorage.getItem(MY_TRIP_STORAGE_KEY);
    if (!raw) return EMPTY_MY_TRIP;
    return { ...EMPTY_MY_TRIP, ...JSON.parse(raw) };
  } catch {
    return EMPTY_MY_TRIP;
  }
}

export async function saveMyTrip(trip: MyTrip): Promise<void> {
  await AsyncStorage.setItem(MY_TRIP_STORAGE_KEY, JSON.stringify(trip));
}

export type CompatibilityScore = {
  interestOverlap: number;
  dateAlignment: number;
  routeCompatibility: number;
  distanceProximity: number;
  communityTrust: number;
  overall: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function scoreInterestOverlap(myInterests: string[], candidateInterests: string[]): number {
  if (myInterests.length === 0 || candidateInterests.length === 0) return 50;
  const mine = new Set(myInterests.map((interest) => interest.toLowerCase()));
  const theirs = new Set(candidateInterests.map((interest) => interest.toLowerCase()));
  const intersectionSize = [...mine].filter((interest) => theirs.has(interest)).length;
  const unionSize = new Set([...mine, ...theirs]).size;
  return Math.round((intersectionSize / unionSize) * 100);
}

function scoreDateAlignment(myTrip: MyTrip, candidateDates: { start: Date; end: Date }): number {
  if (!myTrip.startDate || !myTrip.endDate) return 50;
  const myStart = new Date(myTrip.startDate).getTime();
  const myEnd = new Date(myTrip.endDate).getTime();
  const candStart = candidateDates.start.getTime();
  const candEnd = candidateDates.end.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  const overlapMs = Math.min(myEnd, candEnd) - Math.max(myStart, candStart);
  if (overlapMs > 0) {
    const totalSpanMs = Math.max(myEnd - myStart, candEnd - candStart, dayMs);
    return Math.round(clamp(70 + 30 * (overlapMs / totalSpanMs), 70, 100));
  }

  const gapDays = Math.abs(Math.max(myStart - candEnd, candStart - myEnd)) / dayMs;
  return Math.round(clamp(60 - gapDays * 3, 5, 60));
}

function scoreRouteCompatibility(myTrip: MyTrip, candidateRoute: { origin: string; destination: string }): number {
  if (!myTrip.destination.trim()) return 50;
  const destMatch = candidateRoute.destination.trim().toLowerCase() === myTrip.destination.trim().toLowerCase();
  const originMatch = myTrip.origin.trim() !== '' && candidateRoute.origin.trim().toLowerCase() === myTrip.origin.trim().toLowerCase();
  if (destMatch && originMatch) return 100;
  if (destMatch) return 85;
  if (originMatch) return 55;
  return 25;
}

function scoreDistanceProximity(distanceKm: number): number {
  return Math.round(clamp(100 - distanceKm * 7, 10, 100));
}

function scoreCommunityTrust(trustScore: number | null | undefined, trustCount: number | undefined): number {
  if (!trustCount || trustScore === null || trustScore === undefined) return 65;
  return Math.round((trustScore / 5) * 100);
}

export function computeCompatibility(profile: SearchProfile, myInterests: string[], myTrip: MyTrip, candidateTrip: MockTripData): CompatibilityScore {
  const interestOverlap = scoreInterestOverlap(myInterests, profile.interests);
  const dateAlignment = scoreDateAlignment(myTrip, candidateTrip.dates);
  const routeCompatibility = scoreRouteCompatibility(myTrip, candidateTrip.route);
  const distanceProximity = scoreDistanceProximity(candidateTrip.distanceKm);
  const communityTrust = scoreCommunityTrust(profile.trust_score, profile.trust_count);

  // interestOverlap, distanceProximity, and communityTrust are always computable from data we
  // already have. dateAlignment and routeCompatibility only mean something once "My Trip" is
  // set, so they're excluded from the overall average (rather than padded with a neutral score)
  // until then — otherwise every candidate would look artificially less compatible by default.
  const knownDimensions = [interestOverlap, distanceProximity, communityTrust];
  if (myTrip.startDate && myTrip.endDate) knownDimensions.push(dateAlignment);
  if (myTrip.destination.trim()) knownDimensions.push(routeCompatibility);

  const overall = Math.round(knownDimensions.reduce((sum, value) => sum + value, 0) / knownDimensions.length);

  return { interestOverlap, dateAlignment, routeCompatibility, distanceProximity, communityTrust, overall };
}
