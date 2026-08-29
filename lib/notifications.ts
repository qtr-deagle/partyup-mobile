import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type AppNotification = {
  id: string;
  type: 'system' | 'trip' | 'message' | 'match' | 'safety';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
};

export async function listNotifications() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_notifications'), 'Loading notifications');
  } catch (error) {
    return { data: [], error: error instanceof Error ? error : new Error('Unable to load notifications.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as AppNotification[], error };
}

export async function markNotificationRead(id: string) {
  return withRequestTimeout(supabase.rpc('mark_notification_read', { p_notification_id: id }), 'Updating notification');
}
