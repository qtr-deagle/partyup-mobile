// Supabase Edge Function: send-sos-push
//
// Sends a high-priority Expo push notification for an SOS alert to every
// trusted-circle member who received the in-app `safety` notification.
//
//   1. Confirms the caller owns the sos_alerts row (via their JWT).
//   2. Finds the notifications fanned out by trigger_sos_alert() for it.
//   3. Pushes to each recipient's registered Expo tokens on the `sos`
//      Android channel, and prunes tokens Expo reports as unregistered.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type SafetyNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  let sosAlertId: string | undefined;
  try {
    ({ sosAlertId } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!sosAlertId) {
    return jsonResponse({ error: 'sosAlertId is required' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: alert } = await adminClient
    .from('sos_alerts')
    .select('id, user_id')
    .eq('id', sosAlertId)
    .maybeSingle();
  if (!alert || alert.user_id !== userData.user.id) {
    return jsonResponse({ error: 'SOS alert not found' }, 404);
  }

  const { data: notifications, error: notificationsError } = await adminClient
    .from('notifications')
    .select('id, user_id, title, message, data')
    .eq('type', 'safety')
    .eq('data->>sos_alert_id', sosAlertId);
  if (notificationsError) {
    return jsonResponse({ error: notificationsError.message }, 500);
  }

  const rows = (notifications ?? []) as SafetyNotification[];
  if (rows.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const { data: tokens } = await adminClient
    .from('push_tokens')
    .select('token, user_id')
    .in('user_id', rows.map((row) => row.user_id));

  const byUser = new Map(rows.map((row) => [row.user_id, row]));
  const messages = (tokens ?? []).map(({ token, user_id }) => {
    const row = byUser.get(user_id)!;
    return {
      to: token,
      title: `🚨 ${row.title}`,
      body: row.message,
      sound: 'default',
      priority: 'high',
      channelId: 'sos',
      interruptionLevel: 'time-sensitive',
      data: { type: 'sos', notification_id: row.id, ...(row.data ?? {}) },
    };
  });

  if (messages.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  const staleTokens: string[] = [];
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
    const result = await response.json().catch(() => null);
    const tickets: { status: string; details?: { error?: string } }[] = result?.data ?? [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        staleTokens.push(chunk[index].to);
      }
    });
  }

  if (staleTokens.length > 0) {
    await adminClient.from('push_tokens').delete().in('token', staleTokens);
  }

  return jsonResponse({ sent: messages.length - staleTokens.length });
});
