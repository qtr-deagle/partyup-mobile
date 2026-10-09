// Supabase Edge Function: purge-deleted-accounts
//
// Permanently deletes accounts whose 30-day deletion grace period has ended
// (see request_account_deletion() in 202610080001_account_deletion.sql).
// Called daily by the database's `purge-deleted-accounts` cron job via pg_net,
// authenticated by the shared x-push-secret header.
//
// For each due account:
//   1. Re-checks account_deletion_blockers(); anything new since the request
//      (it shouldn't happen, the account is inactive) skips the account.
//   2. Removes the user's storage files. Most buckets are keyed by user id;
//      chat-media is keyed by thread, so their photos are found by message.
//   3. Deletes the auth user, which cascades to profiles and everything else.
//   4. Emails the user that their account is gone.
//
// It also emails a reminder to accounts within 3 days of deletion
// (due_deletion_reminders, 202610080002_account_deletion_emails.sql).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { firstNameOf, sendAccountEmail } from '../_shared/account-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Buckets whose objects live under `${userId}/...`.
const USER_FOLDER_BUCKETS = ['avatars', 'id-verifications', 'vehicle-verifications', 'report-evidence'];

async function removeUserFolder(admin: SupabaseClient, bucket: string, userId: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100, offset });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    if (!data?.length) break;
    paths.push(...data.filter((f) => f.id).map((f) => `${userId}/${f.name}`));
    if (data.length < 100) break;
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
  return paths.length;
}

async function removeChatPhotos(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('chat_messages')
    .select('image_path')
    .eq('sender_id', userId)
    .not('image_path', 'is', null);
  if (error) throw new Error(`chat-media: ${error.message}`);
  const paths = (data ?? []).map((row) => row.image_path as string);
  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await admin.storage.from('chat-media').remove(paths.slice(i, i + 100));
    if (removeError) throw new Error(`chat-media: ${removeError.message}`);
  }
  return paths.length;
}

type Recipient = { email: string; name: string | null; firstName: string; scheduledFor: string | null };

async function loadRecipient(admin: SupabaseClient, userId: string): Promise<Recipient | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('email, display_name, first_name, deletion_scheduled_for')
    .eq('id', userId)
    .maybeSingle();
  let email = (profile?.email as string | null) ?? null;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser.user?.email ?? null;
  }
  if (!email) return null;
  return {
    email,
    name: profile?.display_name ?? null,
    firstName: firstNameOf(profile),
    scheduledFor: profile?.deletion_scheduled_for ?? null,
  };
}

async function sendReminders(admin: SupabaseClient) {
  const { data: due, error } = await admin.rpc('due_deletion_reminders');
  if (error) {
    console.error('reminders:', error.message);
    return 0;
  }
  let sent = 0;
  for (const userId of (due ?? []) as string[]) {
    const recipient = await loadRecipient(admin, userId);
    if (recipient) {
      const sendError = await sendAccountEmail(
        'deletion_reminder',
        { email: recipient.email, name: recipient.name },
        { firstName: recipient.firstName, scheduledFor: recipient.scheduledFor }
      );
      if (sendError) {
        console.error(`reminder failed: ${sendError}`);
        continue;
      }
      sent += 1;
    }
    await admin.from('profiles').update({ deletion_reminder_sent_at: new Date().toISOString() }).eq('id', userId);
  }
  return sent;
}

async function hashId(id: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const pushSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!pushSecret || req.headers.get('x-push-secret') !== pushSecret) {
    return jsonResponse({ error: 'Not allowed' }, 401);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const remindersSent = await sendReminders(admin);

  const { data: due, error: dueError } = await admin.rpc('due_account_deletions');
  if (dueError) {
    return jsonResponse({ error: dueError.message }, 500);
  }

  let purged = 0;
  const skipped: { user: string; reason: string }[] = [];

  for (const userId of (due ?? []) as string[]) {
    const userHash = await hashId(userId);
    try {
      const { data: blockers, error: blockersError } = await admin.rpc('account_deletion_blockers', {
        p_user_id: userId,
      });
      if (blockersError) throw new Error(blockersError.message);
      if (blockers?.length) {
        const reason = (blockers as { label: string }[]).map((b) => b.label).join('; ');
        await admin.from('audit_logs').insert({
          action: 'Account purge skipped',
          entity_type: 'profile',
          entity_id: userId,
          metadata: { reason },
        });
        skipped.push({ user: userHash, reason });
        continue;
      }

      // Read before the delete; afterwards there's no profile left to email.
      const recipient = await loadRecipient(admin, userId);

      let files = await removeChatPhotos(admin, userId);
      for (const bucket of USER_FOLDER_BUCKETS) {
        files += await removeUserFolder(admin, bucket, userId);
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) throw new Error(deleteError.message);

      // Written after the delete so the row doesn't point at the profile.
      await admin.from('audit_logs').insert({
        action: 'Account purged',
        entity_type: 'profile',
        metadata: { user_hash: userHash, files_removed: files },
      });
      purged += 1;

      if (recipient) {
        const sendError = await sendAccountEmail(
          'account_deleted',
          { email: recipient.email, name: recipient.name },
          { firstName: recipient.firstName }
        );
        if (sendError) console.error(`deleted email failed for ${userHash}: ${sendError}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`purge failed for ${userHash}: ${reason}`);
      skipped.push({ user: userHash, reason });
    }
  }

  return jsonResponse({ purged, skipped, remindersSent });
});
