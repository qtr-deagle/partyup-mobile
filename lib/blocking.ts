import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type BlockedUser = { blocked_id: string; display_name: string; avatar_url: string | null; blocked_at: string };

export async function blockUser(userId: string) {
  return withRequestTimeout(supabase.rpc('block_user', { p_user_id: userId }), 'Blocking user');
}

export async function unblockUser(userId: string) {
  return withRequestTimeout(supabase.rpc('unblock_user', { p_user_id: userId }), 'Unblocking user');
}

export async function listBlockedUsers() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_blocked_users'), 'Loading blocked users');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load blocked users.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as BlockedUser[], error };
}
