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

function startOfTodayManila() {
  // Manila is UTC+8 with no DST.
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  now.setUTCHours(0, 0, 0, 0);
  return new Date(now.getTime() - 8 * 3600 * 1000).toISOString();
}

// Relies on staff/admin RLS, which lets these roles read every row.
export async function getStaffOverview() {
  const count = (query: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(query).then((result) => (result.error ? 0 : result.count ?? 0));
  const profiles = () => supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'traveler');
  const trips = () => supabase.from('trips').select('id', { count: 'exact', head: true });

  try {
    const [pendingIds, pendingVehicles, openReports, totalTravelers, verifiedTravelers, newToday, openTrips, ongoingTrips, sosResult] =
      await withRequestTimeout(
        Promise.all([
          count(supabase.from('id_verifications').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
          count(supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending')),
          count(supabase.from('reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing'])),
          count(profiles()),
          count(profiles().eq('verification_status', 'approved')),
          count(profiles().gte('created_at', startOfTodayManila())),
          count(trips().in('status', ['open', 'full'])),
          count(trips().eq('status', 'ongoing')),
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

    const data: StaffOverview = {
      pending_ids: pendingIds,
      pending_vehicles: pendingVehicles,
      open_reports: openReports,
      active_sos: alerts.map((alert) => ({
        ...alert,
        latitude: alert.latitude == null ? null : Number(alert.latitude),
        longitude: alert.longitude == null ? null : Number(alert.longitude),
        display_name: nameById.get(alert.user_id) ?? 'Unknown traveler',
      })) as StaffSosAlert[],
      total_travelers: totalTravelers,
      verified_travelers: verifiedTravelers,
      new_travelers_today: newToday,
      open_trips: openTrips,
      ongoing_trips: ongoingTrips,
    };
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load staff overview.') };
  }
}
