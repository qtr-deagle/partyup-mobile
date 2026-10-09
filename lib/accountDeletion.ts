import { supabase } from '@/lib/supabase';
import { withRequestTimeout } from '@/lib/social';

// Self-service account deletion (202610080001_account_deletion.sql).
// Requesting deactivates the account now and deletes it after a 30-day
// grace period; cancelling during that window restores it.

export type DeletionBlocker = {
  kind: 'hosted_trip' | 'ongoing_trip' | 'guild_leader' | 'pending_payment';
  label: string;
  ref_id: string;
};

function toError(error: { message: string } | null) {
  if (!error) return null;
  // request_account_deletion() raises "Before deleting this account: ..." with the blockers.
  return new Error(error.message);
}

export async function getDeletionBlockers() {
  const { data, error } = await withRequestTimeout(supabase.rpc('account_deletion_blockers'), 'Checking your account');
  return { data: (data ?? []) as DeletionBlocker[], error: toError(error) };
}

export async function requestAccountDeletion(reason?: string) {
  const { data, error } = await withRequestTimeout(
    supabase.rpc('request_account_deletion', { p_reason: reason ?? null }),
    'Deleting your account'
  );
  return { data: (data ?? null) as string | null, error: toError(error) };
}

export async function cancelAccountDeletion() {
  const { error } = await withRequestTimeout(supabase.rpc('cancel_account_deletion'), 'Restoring your account');
  return { error: toError(error) };
}

export function formatDeletionDate(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
