import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';
import * as Location from 'expo-location';

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
  accuracy_m: number | null;
  status: 'active' | 'resolved';
  recipient_count: number;
  resolved_by: string | null;
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
  announceAlert(result.data);
  return result;
}

// Tells the banner, then pushes the trusted circle. The RPCs return the
// already-active alert on a repeat press or an escalation race, so only a
// newly created alert pushes again.
function announceAlert(alert: SosAlert | null) {
  if (!alert?.id) {
    return;
  }
  emitSosChange(alert);
  if (Date.now() - new Date(alert.created_at).getTime() < 60000) {
    void sendSosPush(alert.id);
  }
}

// Lets ActiveSosBanner react instantly to the user's own SOS without waiting
// for the realtime round trip.
const sosListeners = new Set<(alert: SosAlert) => void>();

export function onSosChange(listener: (alert: SosAlert) => void) {
  sosListeners.add(listener);
  return () => {
    sosListeners.delete(listener);
  };
}

function emitSosChange(alert: SosAlert) {
  sosListeners.forEach((listener) => listener(alert));
}

const SOS_FIX_TIMEOUT_MS = 5000;

// Best-effort fresh GPS fix for the alert. A slow or missing fix must never
// block the SOS itself, so this falls back to the last known position, then to
// nothing (the server then uses the last saved current_locations row).
async function getSosFix() {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      return null;
    }
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SOS_FIX_TIMEOUT_MS)),
    ]);
    return fresh ?? (await Location.getLastKnownPositionAsync());
  } catch {
    return null;
  }
}

export async function triggerSosAlert(tripId?: string | null) {
  const fix = await getSosFix();
  const result = (await withRequestTimeout(
    supabase.rpc('trigger_sos_alert', {
      p_trip_id: tripId ?? null,
      p_safety_session_id: null,
      p_trigger_reason: 'manual',
      p_latitude: fix?.coords.latitude ?? null,
      p_longitude: fix?.coords.longitude ?? null,
      p_accuracy: fix?.coords.accuracy ?? null,
    }),
    'Sending emergency alert'
  )) as { data: SosAlert | null; error: Error | null };
  announceAlert(result.data);
  return result;
}

export async function markSosSafe(alertId: string) {
  const result = (await withRequestTimeout(supabase.rpc('mark_sos_safe', { p_alert_id: alertId }), 'Ending emergency alert')) as {
    data: SosAlert | null;
    error: Error | null;
  };
  if (result.data) {
    emitSosChange(result.data);
  }
  return result;
}

export async function getMyActiveSosAlert(userId: string) {
  const { data } = await supabase
    .from('sos_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SosAlert | null) ?? null;
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
