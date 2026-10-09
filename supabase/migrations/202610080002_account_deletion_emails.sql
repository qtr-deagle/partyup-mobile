begin;

-- Email the user about their account deletion (202610080001_account_deletion.sql):
--   deletion scheduled      -> send-account-email, from the trigger below
--   deletion cancelled      -> send-account-email, from the trigger below
--   3 days before deletion  -> purge-deleted-accounts (daily job), once per request
--   permanently deleted     -> purge-deleted-accounts, just after the purge
--
-- Uses the same vault secrets as push and verification emails, and the same
-- Brevo secrets as send-verification-email.

alter table public.profiles
  add column if not exists deletion_reminder_sent_at timestamptz;

create or replace function public.enqueue_account_email(p_user_id uuid, p_kind text, p_by_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-account-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('userId', p_user_id, 'kind', p_kind, 'byAdmin', p_by_admin)
  );
exception when others then
  -- Email is best-effort: never fail the request that triggered it.
  raise warning 'enqueue_account_email failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_account_email(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.email_account_deletion_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deletion_scheduled_for is null and new.deletion_scheduled_for is not null then
    perform public.enqueue_account_email(new.id, 'deletion_scheduled', auth.uid() is distinct from new.id);
  elsif old.deletion_scheduled_for is not null and new.deletion_scheduled_for is null then
    perform public.enqueue_account_email(new.id, 'deletion_cancelled', auth.uid() is distinct from new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists email_account_deletion_change on public.profiles;
create trigger email_account_deletion_change
after update of deletion_scheduled_for on public.profiles
for each row execute function public.email_account_deletion_change();

-- Accounts within 3 days of deletion that haven't had a reminder for this
-- request yet (a restore and a new request gets a new reminder).
create or replace function public.due_deletion_reminders()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where deletion_scheduled_for is not null
    and deletion_scheduled_for > now()
    and deletion_scheduled_for <= now() + interval '3 days'
    and (deletion_reminder_sent_at is null or deletion_reminder_sent_at < deletion_requested_at)
  limit 200;
$$;

revoke all on function public.due_deletion_reminders() from public, anon, authenticated;
grant execute on function public.due_deletion_reminders() to service_role;

-- The daily job now also wakes the function for reminders.
create or replace function public.enqueue_account_purge()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.due_account_deletions())
    and not exists (select 1 from public.due_deletion_reminders()) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/purge-deleted-accounts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := '{}'::jsonb
  );
exception when others then
  raise warning 'enqueue_account_purge failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_account_purge() from public, anon, authenticated;

commit;
