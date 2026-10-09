// Supabase Edge Function: send-account-email
//
// Called by the database via pg_net (enqueue_account_email in
// 202610080002_account_deletion_emails.sql) when an account deletion is
// scheduled or cancelled:
//   { userId, kind: 'deletion_scheduled' | 'deletion_cancelled', byAdmin? }
// It re-reads the profile with the service role, so a forged call can at worst
// re-send an email that matches the account's current state.
//
// The reminder and "account deleted" emails are sent by purge-deleted-accounts.
// Auth: x-push-secret, like send-verification-email.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { firstNameOf, sendAccountEmail } from '../_shared/account-email.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { userId, kind, byAdmin = false } = (await req.json().catch(() => ({}))) as {
    userId?: string;
    kind?: string;
    byAdmin?: boolean;
  };
  if (!userId || (kind !== 'deletion_scheduled' && kind !== 'deletion_cancelled')) {
    return jsonResponse({ error: 'Missing userId or unknown kind' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await admin
    .from('profiles')
    .select('email, display_name, first_name, deletion_scheduled_for')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) {
    return jsonResponse({ skipped: 'Profile not found' });
  }

  // Only send what still matches the account (e.g. not "scheduled" after a quick restore).
  const scheduled = profile.deletion_scheduled_for !== null;
  if ((kind === 'deletion_scheduled') !== scheduled) {
    return jsonResponse({ skipped: 'Account state changed' });
  }

  let email = profile.email as string | null;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser.user?.email ?? null;
  }
  if (!email) {
    return jsonResponse({ skipped: 'User has no email address' });
  }

  const error = await sendAccountEmail(
    kind,
    { email, name: profile.display_name },
    { firstName: firstNameOf(profile), scheduledFor: profile.deletion_scheduled_for, byAdmin }
  );
  if (error) {
    console.error('[send-account-email]', error);
    return jsonResponse({ error }, 502);
  }
  return jsonResponse({ sent: kind });
});
