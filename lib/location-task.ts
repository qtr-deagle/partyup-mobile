import { supabase } from '@/lib/supabase';
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';

export const LOCATION_TASK_NAME = 'partyup-background-location';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[location-task] background location error', error);
    return;
  }

  const locations = (data as { locations?: LocationObject[] } | undefined)?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) {
    return;
  }

  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return;
  }

  const capturedAt = new Date(latest.timestamp).toISOString();
  const { latitude, longitude, accuracy } = latest.coords;

  await supabase.from('current_locations').upsert(
    {
      user_id: userId,
      latitude,
      longitude,
      accuracy_m: accuracy,
      updated_at: capturedAt,
    },
    { onConflict: 'user_id' }
  );

  await supabase.from('location_history').insert({
    user_id: userId,
    latitude,
    longitude,
    accuracy_m: accuracy,
    captured_at: capturedAt,
  });

  try {
    const { data: session } = await supabase
      .from('safety_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'monitoring')
      .lte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (session) {
      await supabase.rpc('escalate_safety_session', { p_session_id: session.id });
    }
  } catch (escalationError) {
    console.error('[location-task] auto-escalation sweep failed', escalationError);
  }
});
