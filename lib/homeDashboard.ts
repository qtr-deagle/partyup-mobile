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
