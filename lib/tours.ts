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

// Each tour picks exactly one category. It is saved as the first interest
// tag (see trips_interest_tags_valid), so Browse/Discover filters still work.
export const TOUR_CATEGORIES = [
  'Beach',
  'Mountain & Hiking',
  'Food Trip',
  'Heritage & Churches',
  'Nature & Falls',
  'City & Nightlife',
  'Pilgrimage',
  'Road Trip',
] as const;

export type TourCategory = (typeof TOUR_CATEGORIES)[number];

export type TourDestination = {
  name: string;
  area: string;
  latitude: number;
  longitude: number;
};

// Preset destinations so organizers pick instead of typing. Coordinates are
// approximate (town/site level) -- enough for the map pin and arrival checks.
export const TOUR_DESTINATIONS: TourDestination[] = [
  // Bulacan
  { name: 'Biak-na-Bato National Park', area: 'San Miguel, Bulacan', latitude: 15.1053, longitude: 121.0806 },
  { name: 'Madlum Cave', area: 'San Miguel, Bulacan', latitude: 15.0957, longitude: 121.0567 },
  { name: 'Mt. Manalmon', area: 'San Miguel, Bulacan', latitude: 15.0993, longitude: 121.0607 },
  { name: 'Barasoain Church', area: 'Malolos, Bulacan', latitude: 14.8476, longitude: 120.813 },
  { name: 'Malolos Cathedral', area: 'Malolos, Bulacan', latitude: 14.8434, longitude: 120.8116 },
  { name: 'Casa Real Shrine', area: 'Malolos, Bulacan', latitude: 14.8429, longitude: 120.8121 },
  { name: 'Kakarong de Sili Shrine', area: 'Pandi, Bulacan', latitude: 14.878, longitude: 120.956 },
  { name: 'Angat Dam', area: 'Norzagaray, Bulacan', latitude: 14.9105, longitude: 121.1548 },
  { name: 'Pinagrealan Cave', area: 'Norzagaray, Bulacan', latitude: 14.933, longitude: 121.083 },
  { name: 'Obando Church', area: 'Obando, Bulacan', latitude: 14.7108, longitude: 120.9372 },
  { name: 'Grotto of Our Lady of Lourdes', area: 'San Jose del Monte, Bulacan', latitude: 14.8137, longitude: 121.0617 },
  // Nearby provinces
  { name: 'Mt. Pinatubo Crater', area: 'Tarlac / Zambales', latitude: 15.1429, longitude: 120.3496 },
  { name: 'Minalungao National Park', area: 'General Tinio, Nueva Ecija', latitude: 15.327, longitude: 121.117 },
  { name: 'Clark Freeport', area: 'Angeles, Pampanga', latitude: 15.185, longitude: 120.546 },
  { name: 'Wawa Dam', area: 'Rodriguez, Rizal', latitude: 14.729, longitude: 121.192 },
  { name: 'Intramuros', area: 'Manila', latitude: 14.5896, longitude: 120.9747 },
  { name: 'Tagaytay', area: 'Cavite', latitude: 14.1153, longitude: 120.9621 },
  { name: 'Anawangin Cove', area: 'San Antonio, Zambales', latitude: 14.8853, longitude: 120.0806 },
  { name: 'Laiya Beach', area: 'San Juan, Batangas', latitude: 13.675, longitude: 121.406 },
  { name: 'San Juan Surf Town', area: 'San Juan, La Union', latitude: 16.6646, longitude: 120.324 },
  { name: 'Baguio City', area: 'Benguet', latitude: 16.4023, longitude: 120.596 },
  { name: 'Vigan Heritage Village', area: 'Ilocos Sur', latitude: 17.5747, longitude: 120.3869 },
  { name: 'Boracay', area: 'Malay, Aklan', latitude: 11.9674, longitude: 121.9248 },
];

export function formatTourDestination(destination: TourDestination) {
  return `${destination.name}, ${destination.area}`;
}

// Itinerary days are built from these instead of free text.
export const TOUR_ACTIVITIES = [
  'Travel',
  'Sightseeing',
  'Hiking',
  'Swimming',
  'Island hopping',
  'Food stop',
  'Photo op',
  'Church visit',
  'Museum tour',
  'Shopping',
  'Camping',
  'Free time',
] as const;

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
