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
