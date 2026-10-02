import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type Gender = 'male' | 'female';
export type ChoiceCategory = 'ride' | 'destination' | 'food';

export type TravelPlan = {
  user_id: string;
  ride: string[];
  destination: string[];
  food: string[];
  missions: boolean;
  description: string | null;
  gender: Gender | null;
  preferred_gender: Gender[];
};

export type PlanPicks = Pick<TravelPlan, 'ride' | 'destination' | 'food' | 'missions' | 'description'>;

// Fixed choices so every plan can be compared. Values must match the checks in
// 202610020004_travel_plans.sql.
export const PLAN_CATEGORIES: { key: ChoiceCategory; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'ride', label: 'How you ride', options: [{ value: 'motor', label: 'Motor riding' }, { value: 'car', label: 'Car riding' }] },
  { key: 'destination', label: 'Where you go', options: [{ value: 'beach', label: 'Beach' }, { value: 'mountain', label: 'Mountain' }, { value: 'cities', label: 'Cities' }] },
  { key: 'food', label: 'Food & drinks', options: [{ value: 'food_finding', label: 'Food finding' }, { value: 'resto_search', label: 'Best resto search' }, { value: 'drink_search', label: 'Drink search' }] },
];

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export const MAX_PICKS_PER_CATEGORY = 2;
export const PLAN_DESCRIPTION_MAX = 200;

export const EMPTY_PICKS: PlanPicks = { ride: [], destination: [], food: [], missions: false, description: null };

export function choiceLabel(value: string) {
  for (const category of PLAN_CATEGORIES) {
    const option = category.options.find((item) => item.value === value);
    if (option) return option.label;
  }
  return value;
}

// A plan counts once all three required choice categories have a pick.
export function hasCompletePlan(plan: TravelPlan | null | undefined): plan is TravelPlan {
  return !!plan && plan.ride.length > 0 && plan.destination.length > 0 && plan.food.length > 0;
}

const COLUMNS = 'user_id, ride, destination, food, missions, description, gender, preferred_gender';

export async function getPlans(userIds: string[]) {
  const plans = new Map<string, TravelPlan>();
  if (userIds.length === 0) return { data: plans, error: null };
  let response;
  try {
    response = await withRequestTimeout(supabase.from('travel_plans').select(COLUMNS).in('user_id', userIds), 'Loading plans');
  } catch (error) {
    return { data: plans, error: error instanceof Error ? error : new Error('Unable to load plans.') };
  }
  const { data, error } = response;
  for (const row of (data ?? []) as TravelPlan[]) plans.set(row.user_id, row);
  return { data: plans, error };
}

export async function getMyPlan(userId: string) {
  const { data, error } = await getPlans([userId]);
  return { data: data.get(userId) ?? null, error };
}

// Upserts only the columns passed, so saving picks keeps gender prefs and vice versa.
export async function saveMyPlan(userId: string, picks: PlanPicks) {
  const description = picks.description?.trim() ? picks.description.trim().slice(0, PLAN_DESCRIPTION_MAX) : null;
  return withRequestTimeout(
    supabase.from('travel_plans').upsert({ user_id: userId, ...picks, description, updated_at: new Date().toISOString() }),
    'Saving plan'
  );
}

export async function saveGenderPrefs(userId: string, gender: Gender | null, preferredGender: Gender[]) {
  return withRequestTimeout(
    supabase.from('travel_plans').upsert({ user_id: userId, gender, preferred_gender: preferredGender, updated_at: new Date().toISOString() }),
    'Saving preferences'
  );
}

// ----- Compatibility -----

export type PlanCompatibility = {
  ride: number;
  destination: number;
  food: number;
  gender: number;
  // null when the viewer didn't opt into missions, so the category isn't scored.
  missions: number | null;
  overall: number;
};

// Required categories share 100% (25% each). When the viewer opts into the
// optional missions category it takes 15% and the other four split 85%.
const MISSIONS_WEIGHT = 0.15;

// 100 for identical picks, partial when picks only overlap (e.g. Beach vs Beach + Mountain = 50).
function scoreChoices(mine: string[], theirs: string[]) {
  if (mine.length === 0 || theirs.length === 0) return 0;
  const shared = mine.filter((value) => theirs.includes(value)).length;
  return Math.round((shared / Math.max(mine.length, theirs.length)) * 100);
}

function fits(gender: Gender | null, preferred: Gender[]) {
  // No preference set = open to anyone.
  if (preferred.length === 0) return true;
  return gender !== null && preferred.includes(gender);
}

// Both ways: they fit what I want, and I fit what they want.
function scoreGender(mine: TravelPlan, theirs: TravelPlan) {
  const theyFitMe = fits(theirs.gender, mine.preferred_gender);
  const iFitThem = fits(mine.gender, theirs.preferred_gender);
  if (theyFitMe && iFitThem) return 100;
  if (theyFitMe || iFitThem) return 50;
  return 0;
}

export function computePlanCompatibility(mine: TravelPlan, theirs: TravelPlan): PlanCompatibility {
  const ride = scoreChoices(mine.ride, theirs.ride);
  const destination = scoreChoices(mine.destination, theirs.destination);
  const food = scoreChoices(mine.food, theirs.food);
  const gender = scoreGender(mine, theirs);
  const missions = mine.missions ? (theirs.missions ? 100 : 0) : null;

  const required = (ride + destination + food + gender) / 4;
  const overall = missions === null ? required : required * (1 - MISSIONS_WEIGHT) + missions * MISSIONS_WEIGHT;

  return { ride, destination, food, gender, missions, overall: Math.round(overall) };
}
