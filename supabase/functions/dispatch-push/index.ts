// Supabase Edge Function: dispatch-push
//
// Called by the database (enqueue_push, via pg_net) whenever a notification
// row or chat message is inserted. It receives only { kind, id }, re-reads the
// row with the service role, and sends an Expo push to each recipient's
// registered devices, pruning tokens Expo reports as unregistered.
//
// Auth: the caller must send the shared PUSH_WEBHOOK_SECRET in x-push-secret
// (verify_jwt is off in config.toml since the database has no user JWT).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Must match the channels created in lib/push.ts.
const CHANNEL_BY_TYPE: Record<string, string> = {
  message: 'messages',
  trip: 'trips',
  match: 'social',
  system: 'default',
};

type Push = {
  userIds: string[];
  title: string;
  body: string;
  channelId: string;
  data: Record<string, unknown>;
  // Collapses repeated pushes (e.g. a busy chat) into one on the device.
  threadId?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function buildNotificationPush(admin: SupabaseClient, id: string): Promise<Push | null> {
  const { data: row } = await admin
    .from('notifications')
    .select('id, user_id, type, title, message, data')
    .eq('id', id)
    .maybeSingle();
  if (!row || row.type === 'safety') {
    return null;
  }
  return {
    userIds: [row.user_id],
    title: row.title,
    body: row.message,
    channelId: CHANNEL_BY_TYPE[row.type] ?? 'default',
    data: { ...(row.data ?? {}), type: row.type, notification_id: row.id },
  };
}

async function buildChatPush(admin: SupabaseClient, id: string): Promise<Push | null> {
  const { data: message } = await admin
    .from('chat_messages')
    .select('id, thread_id, sender_id, message_type, body')
    .eq('id', id)
    .maybeSingle();
  if (!message || message.message_type === 'system') {
    return null;
  }

  const [{ data: participants }, { data: sender }, { data: thread }, { data: blocks }] = await Promise.all([
    // Muted chats stay silent, until a timed mute runs out (muted_until, migration 202610090012).
    admin
      .from('chat_participants')
      .select('user_id')
      .eq('thread_id', message.thread_id)
      .neq('user_id', message.sender_id)
      .or(`muted.eq.false,muted_until.lt.${new Date().toISOString()}`),
    admin.from('profiles').select('display_name').eq('id', message.sender_id).maybeSingle(),
    admin.from('chat_threads').select('thread_type, title').eq('id', message.thread_id).maybeSingle(),
    // Anyone who blocked the sender gets nothing.
    admin.from('blocked_users').select('blocker_id').eq('blocked_id', message.sender_id),
  ]);

  const blockedBy = new Set((blocks ?? []).map((row) => row.blocker_id));
  const userIds = (participants ?? []).map((row) => row.user_id).filter((userId) => !blockedBy.has(userId));
  if (userIds.length === 0) {
    return null;
  }

  const senderName = sender?.display_name ?? 'New message';
  const isGroup = thread?.thread_type !== 'direct' && thread?.title;
  const preview = message.message_type === 'location' ? '📍 Shared a location' : message.message_type === 'image' ? '📷 Sent a photo' : message.body;
  return {
    userIds,
    title: isGroup ? thread.title : senderName,
    body: isGroup ? `${senderName}: ${preview}` : preview,
    channelId: 'messages',
    threadId: message.thread_id,
    data: { type: 'message', thread_id: message.thread_id, message_id: message.id, sender_id: message.sender_id },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let kind: string | undefined;
  let id: string | undefined;
  try {
    ({ kind, id } = await req.json());
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!id || (kind !== 'notification' && kind !== 'chat_message')) {
    return jsonResponse({ error: 'kind and id are required' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const push = kind === 'notification' ? await buildNotificationPush(admin, id) : await buildChatPush(admin, id);
  if (!push) {
    return jsonResponse({ sent: 0 });
  }

  const { data: tokens } = await admin.from('push_tokens').select('token').in('user_id', push.userIds);
  const messages = (tokens ?? []).map(({ token }) => ({
    to: token,
    title: push.title,
    body: push.body,
    sound: 'default',
    channelId: push.channelId,
    data: push.data,
    ...(push.threadId ? { threadId: push.threadId } : {}),
  }));
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
    await admin.from('push_tokens').delete().in('token', staleTokens);
  }

  return jsonResponse({ sent: messages.length - staleTokens.length });
});
