import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

export type SafetySessionStatus = 'monitoring' | 'cancelled' | 'escalated';

export type SafetySession = {
  id: string;
  user_id: string;
  trip_id: string | null;
  started_at: string;
  expires_at: string;
  status: SafetySessionStatus;
  resolved_at: string | null;
  created_at: string;
};

export type SosAlert = {
  id: string;
  user_id: string;
  trip_id: string | null;
  safety_session_id: string | null;
  trigger_reason: 'manual' | 'auto_escalation';
  latitude: number | null;
  longitude: number | null;
  status: 'active' | 'resolved';
  recipient_count: number;
  resolved_at: string | null;
  created_at: string;
};

export async function startSafetySession(tripId?: string | null, durationSeconds = 60) {
  return withRequestTimeout(
    supabase.rpc('start_safety_session', { p_trip_id: tripId ?? null, p_duration_seconds: durationSeconds }),
    'Starting Warning Mode'
  ) as Promise<{ data: SafetySession | null; error: Error | null }>;
}

export async function cancelSafetySession(sessionId: string) {
  return withRequestTimeout(supabase.rpc('cancel_safety_session', { p_session_id: sessionId }), 'Cancelling Warning Mode');
}

// Fire-and-forget: the in-app notification rows already exist, this adds the
// high-priority push so trusted contacts see it even with the app closed.
export async function sendSosPush(sosAlertId: string) {
  const { error } = await supabase.functions.invoke('send-sos-push', { body: { sosAlertId } });
  if (error) {
    console.error('[safety] SOS push failed', error);
  }
}

export async function escalateSafetySession(sessionId: string) {
  const result = (await withRequestTimeout(
    supabase.rpc('escalate_safety_session', { p_session_id: sessionId }),
    'Escalating safety alert'
  )) as { data: SosAlert | null; error: Error | null };
  if (result.data?.id) {
    void sendSosPush(result.data.id);
  }
  return result;
}

export async function triggerSosAlert(tripId?: string | null) {
  const result = (await withRequestTimeout(
    supabase.rpc('trigger_sos_alert', { p_trip_id: tripId ?? null, p_safety_session_id: null, p_trigger_reason: 'manual' }),
    'Sending emergency alert'
  )) as { data: SosAlert | null; error: Error | null };
  if (result.data?.id) {
    void sendSosPush(result.data.id);
  }
  return result;
}

export async function setSafetyPreferences(prefs: { warningAlertsEnabled?: boolean; emergencySosEnabled?: boolean }) {
  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return { error: new Error('You are not signed in.') };
  }

  const update: Record<string, boolean> = {};
  if (prefs.warningAlertsEnabled !== undefined) update.warning_alerts_enabled = prefs.warningAlertsEnabled;
  if (prefs.emergencySosEnabled !== undefined) update.emergency_sos_enabled = prefs.emergencySosEnabled;

  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  return { error };
}
