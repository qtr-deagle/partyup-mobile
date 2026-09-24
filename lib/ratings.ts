import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type GivenRating = { target_user_id: string; rating: number; comment: string | null };

export async function submitUserRating(targetUserId: string, tripId: string, rating: number, comment?: string) {
  return withRequestTimeout(
    supabase.rpc('submit_user_rating', {
      p_target_user_id: targetUserId,
      p_trip_id: tripId,
      p_rating: rating,
      p_comment: comment?.trim() || null,
    }),
    'Submitting rating'
  );
}

export async function listMyGivenRatings(tripId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_my_given_ratings', { p_trip_id: tripId }), 'Loading your ratings');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load ratings.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as GivenRating[], error };
}

export type ProfileStats = {
  avg_rating: number | null;
  rating_count: number;
  trips_completed: number;
  carpools_completed: number;
  tours_completed: number;
  places_visited: number;
};

export type UserReview = {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

export async function getProfileStats(userId: string) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_profile_stats', { p_user_id: userId }).maybeSingle(), 'Loading profile stats');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unable to load profile stats.') };
  }
  const { data, error } = response;
  if (!data) {
    return { data: null, error };
  }
  const row = data as Record<string, unknown>;
  return {
    data: {
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
      rating_count: Number(row.rating_count ?? 0),
      trips_completed: Number(row.trips_completed ?? 0),
      carpools_completed: Number(row.carpools_completed ?? 0),
      tours_completed: Number(row.tours_completed ?? 0),
      places_visited: Number(row.places_visited ?? 0),
    } as ProfileStats,
    error,
  };
}

export async function listUserReviews(userId: string, limit = 10) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_user_reviews', { p_user_id: userId, p_limit: limit }), 'Loading reviews');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load reviews.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as UserReview[], error };
}
