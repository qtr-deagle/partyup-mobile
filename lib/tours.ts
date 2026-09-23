import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import type { TripStatus, TripType, TripVisibility } from '@/lib/carpool';

export const TOUR_INTEREST_TAGS = [
  'Hiking',
  'Beaches',
  'Museums',
  'Food',
  'Photography',
  'History',
  'Nature',
  'Shopping',
  'Nightlife',
  'Adventure',
  'Art',
  'Relaxation',
] as const;

export type TourInterestTag = (typeof TOUR_INTEREST_TAGS)[number];

export type TourCard = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  duration_days: number | null;
  status: TripStatus;
  visibility: TripVisibility;
  seats_total: number | null;
  seats_available: number | null;
  rider_count: number;
  total_cost: number | null;
  price_per_person: number | null;
  interest_tags: string[];
  organizer_id: string;
  organizer_display_name: string;
  organizer_avatar_url: string | null;
  organizer_verified: boolean;
  is_favorited: boolean;
  created_at: string;
};

export type TourDetail = {
  id: string;
  title: string;
  origin: string;
  destination: string;
  start_at: string | null;
  end_at: string | null;
  duration_days: number | null;
  status: TripStatus;
  visibility: TripVisibility;
  notes: string | null;
  seats_total: number | null;
  seats_available: number | null;
  rider_count: number;
  price_per_person: number | null;
  total_cost: number | null;
  interest_tags: string[];
  organizer_id: string;
  organizer_display_name: string;
  organizer_avatar_url: string | null;
  organizer_verified: boolean;
  is_creator: boolean;
  my_status: string | null;
  is_favorited: boolean;
};

export type ItineraryDay = {
  id: string;
  day_number: number;
  description: string;
};

export async function listBrowseTours(search?: string, tripType: TripType = 'tour') {
  let response;
  try {
    response = await withRequestTimeout(
      supabase.rpc('list_browse_trips', { p_trip_type: tripType, p_search: search?.trim() || null }),
      'Loading tours'
    );
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load tours.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as TourCard[], error };
}

export async function listFavoriteTours(tripType: TripType = 'tour') {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_favorite_trips', { p_trip_type: tripType }), 'Loading favorites');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load favorites.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as TourCard[], error };
}

export async function toggleTripFavorite(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('toggle_trip_favorite', { p_trip_id: tripId }), 'Updating favorite');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to update favorite.') };
  }
  const { data, error } = response;
  return { data: (data ?? null) as boolean | null, error };
}

export async function getTourDetail(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_tour_detail', { p_trip_id: tripId }), 'Loading tour');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load tour.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as TourDetail[];
  return { data: rows[0] ?? null, error: null };
}

export async function listTripItinerary(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_trip_itinerary', { p_trip_id: tripId }), 'Loading itinerary');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load itinerary.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as ItineraryDay[], error };
}

export async function joinPublicTrip(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('join_public_trip', { p_trip_id: tripId }), 'Joining tour');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to join tour.') };
  }
  const { data, error } = response;
  if (error) {
    return { data: null, error };
  }
  const rows = (data ?? []) as { trip_id: string; member_status: string }[];
  return { data: rows[0] ?? null, error: null };
}
