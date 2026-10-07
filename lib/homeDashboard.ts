import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type ActiveTripSummary = {
  trip_id: string;
  title: string;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  status: 'draft' | 'open' | 'full' | 'ongoing' | 'completed' | 'cancelled';
  start_at: string | null;
  is_driver: boolean;
  buddy_user_id: string | null;
  buddy_display_name: string | null;
};

export type SafetyOverview = {
  trust_score: number;
  verification_status: string;
  geofence_status: 'in_zone' | 'out_of_zone' | 'unavailable';
  geofence_distance_km: number | null;
  geofence_label: string;
  buddy_distance_km: number | null;
  buddy_display_name: string | null;
};

export async function getActiveTripSummary() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_active_trip_summary'), 'Loading your active trip');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load your active trip.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as ActiveTripSummary[];
  return { data: rows[0] ?? null, error: null };
}

export async function getSafetyOverview() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_safety_overview'), 'Loading safety overview');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load your safety overview.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as SafetyOverview[];
  return { data: rows[0] ?? null, error: null };
}

export type TrustBreakdown = {
  verified: boolean;
  has_avatar: boolean;
  has_bio: boolean;
  has_phone: boolean;
  has_city: boolean;
  completed_trips: number;
  trust_score: number;
};

export type TrustItem = {
  key: string;
  label: string;
  detail: string;
  earned: number;
  max: number;
  done: boolean;
  actionLabel: string | null;
  route: '/verify-id' | '/profile' | '/edit-profile' | '/carpooling' | null;
};

// Mirrors the weights in public.get_trust_score.
const TRIP_POINTS = 5;
const MAX_TRIPS = 6;

export function trustItems(breakdown: TrustBreakdown): TrustItem[] {
  const trips = Math.min(breakdown.completed_trips, MAX_TRIPS);
  const flag = (key: string, label: string, detail: string, done: boolean, max: number, actionLabel: string, route: TrustItem['route']): TrustItem => ({
    key,
    label,
    detail,
    earned: done ? max : 0,
    max,
    done,
    actionLabel: done ? null : actionLabel,
    route: done ? null : route,
  });
  return [
    flag('verified', 'Verify your ID', 'Approved government ID', breakdown.verified, 50, 'Verify', '/verify-id'),
    flag('avatar', 'Add a profile photo', 'Helps travelers recognize you', breakdown.has_avatar, 5, 'Add photo', '/profile'),
    flag('bio', 'Write a bio', 'Tell others a bit about you', breakdown.has_bio, 5, 'Add bio', '/edit-profile'),
    flag('phone', 'Add a phone number', 'So your group can reach you', breakdown.has_phone, 5, 'Add phone', '/edit-profile'),
    flag('city', 'Set your city', 'Your home municipality', breakdown.has_city, 5, 'Set city', '/edit-profile'),
    {
      key: 'trips',
      label: 'Complete trips',
      detail: `${trips} of ${MAX_TRIPS} trips · ${TRIP_POINTS} pts each`,
      earned: trips * TRIP_POINTS,
      max: MAX_TRIPS * TRIP_POINTS,
      done: trips >= MAX_TRIPS,
      actionLabel: trips >= MAX_TRIPS ? null : 'Find a ride',
      route: trips >= MAX_TRIPS ? null : '/carpooling',
    },
  ];
}

export async function getTrustBreakdown() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_trust_breakdown'), 'Loading your trust score');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load your trust score.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as TrustBreakdown[];
  return { data: rows[0] ?? null, error: null };
}

export type StaffSosAlert = {
  id: string;
  user_id: string;
  display_name: string;
  trigger_reason: 'manual' | 'auto_escalation';
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

export type StaffOverview = {
  pending_ids: number;
  pending_vehicles: number;
  open_reports: number;
  active_sos: StaffSosAlert[];
  total_travelers: number;
  verified_travelers: number;
  new_travelers_today: number;
  open_trips: number;
  ongoing_trips: number;
};

type OverviewCounts = Record<
  'pending_ids' | 'pending_vehicles' | 'open_reports' | 'total_travelers' | 'verified_travelers' | 'new_travelers_today' | 'open_trips' | 'ongoing_trips',
  number | string
>;

// Counts come from get_staff_overview_counts() (leaders can't read every
// row anymore); active SOS alerts are readable by admins only (leaders get
// an empty list from RLS).
export async function getStaffOverview() {
  try {
    const [countsResult, sosResult] =
      await withRequestTimeout(
        Promise.all([
          supabase.rpc('get_staff_overview_counts'),
          supabase
            .from('sos_alerts')
            .select('id, user_id, trigger_reason, latitude, longitude, created_at')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5),
        ]),
        'Loading staff overview'
      );

    const alerts = sosResult.data ?? [];
    const userIds = [...new Set(alerts.map((alert) => alert.user_id))];
    const { data: names } = userIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const nameById = new Map((names ?? []).map((row) => [row.id, row.display_name]));
    const counts = ((countsResult.data as OverviewCounts[] | null) ?? [])[0];
    const n = (key: keyof OverviewCounts) => Number(counts?.[key] ?? 0);

    const data: StaffOverview = {
      pending_ids: n('pending_ids'),
      pending_vehicles: n('pending_vehicles'),
      open_reports: n('open_reports'),
      active_sos: alerts.map((alert) => ({
        ...alert,
        latitude: alert.latitude == null ? null : Number(alert.latitude),
        longitude: alert.longitude == null ? null : Number(alert.longitude),
        display_name: nameById.get(alert.user_id) ?? 'Unknown traveler',
      })) as StaffSosAlert[],
      total_travelers: n('total_travelers'),
      verified_travelers: n('verified_travelers'),
      new_travelers_today: n('new_travelers_today'),
      open_trips: n('open_trips'),
      ongoing_trips: n('ongoing_trips'),
    };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load staff overview.') };
  }
}

// The calling guild leader's own guild (get_leader_guild_snapshot): size,
// this month's points and rank, and what's waiting on them. Null when the
// leader has no guild yet.
export type LeaderGuildSnapshot = {
  guild_id: string;
  name: string;
  member_count: number;
  member_cap: number | null;
  points_this_month: number;
  month_rank: number;
  guild_count: number;
  open_reports: number;
  pending_join_requests: number;
  upcoming_partyups: number;
  next_partyup_title: string | null;
  next_partyup_at: string | null;
};

export async function getLeaderGuildSnapshot() {
  try {
    const { data, error } = await withRequestTimeout(supabase.rpc('get_leader_guild_snapshot'), 'Loading your guild');
    if (error) throw error;
    const row = ((data as Record<string, unknown>[] | null) ?? [])[0];
    if (!row) return { data: null, error: null };
    const n = (key: string) => Number(row[key] ?? 0);
    const snapshot: LeaderGuildSnapshot = {
      guild_id: row.guild_id as string,
      name: row.name as string,
      member_count: n('member_count'),
      member_cap: row.member_cap == null ? null : n('member_cap'),
      points_this_month: n('points_this_month'),
      month_rank: n('month_rank'),
      guild_count: n('guild_count'),
      open_reports: n('open_reports'),
      pending_join_requests: n('pending_join_requests'),
      upcoming_partyups: n('upcoming_partyups'),
      next_partyup_title: (row.next_partyup_title as string | null) ?? null,
      next_partyup_at: (row.next_partyup_at as string | null) ?? null,
    };
    return { data: snapshot, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load your guild.') };
  }
}
