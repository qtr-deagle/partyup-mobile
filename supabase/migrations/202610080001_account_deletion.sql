begin;

-- Self-service account deletion with a 30-day grace period.
--
-- request_account_deletion() deactivates the account (is_active = false
-- already hides it from search, nearby and friends) and schedules it for
-- deletion 30 days out. Signing back in during that window lets the user
-- restore it. A daily job calls the `purge-deleted-accounts` edge function,
-- which deletes the user's storage files and then the auth user; every FK to
-- profiles is CASCADE or SET NULL, so that removes the rest.
--
-- Deletion is refused while it would take other people's data with it
-- (hosted trips, a guild with members) or while money is in flight.
--
-- The purge job reuses the vault secrets from 202609250007_push_dispatch.sql
-- (`project_url`, `push_webhook_secret`); until they exist it does nothing.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz,
  add column if not exists deletion_restore_active boolean,
  add column if not exists deletion_reason text;

create index if not exists profiles_deletion_scheduled_for_idx
  on public.profiles(deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- ---------------------------------------------------------------------
-- Profile guard: same as 202610010016, plus the deletion columns (and
-- is_active) may only change inside the RPCs below, which set a
-- transaction-local flag clients can't set.
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.is_staff_or_admin() then
    if not (
      current_setting('partyup.leader_handover', true) = 'on'
      and old.role = 'guild_leader'
      and new.role = 'traveler'
    ) then
      new.role := old.role;
    end if;
    if current_setting('partyup.account_deletion', true) is distinct from 'on' then
      new.is_active := old.is_active;
      new.deletion_requested_at := old.deletion_requested_at;
      new.deletion_scheduled_for := old.deletion_scheduled_for;
      new.deletion_restore_active := old.deletion_restore_active;
      new.deletion_reason := old.deletion_reason;
    end if;
    if not (
      current_setting('partyup.id_submission', true) = 'on'
      and old.verification_status in ('unverified', 'rejected')
      and new.verification_status = 'pending'
    ) then
      new.verification_status := old.verification_status;
    end if;
    if new.city is distinct from old.city
      and not (old.verification_status in ('unverified', 'rejected') or old.city is null) then
      new.city := old.city;
    end if;
    if not (old.verification_status in ('unverified', 'rejected') or old.last_name is null) then
      new.first_name := old.first_name;
      new.middle_name := old.middle_name;
      new.last_name := old.last_name;
      new.name_suffix := old.name_suffix;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- What has to be resolved before an account can be deleted.
-- ---------------------------------------------------------------------
create or replace function public.account_deletion_blockers(p_user_id uuid default null)
returns table (kind text, label text, ref_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is not null and v_user <> auth.uid() and not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  return query
  select 'hosted_trip'::text,
         'Cancel or finish your trip "' || t.title || '"',
         t.id
  from public.trips t
  where t.creator_id = v_user
    and t.status in ('open', 'full', 'ongoing');

  return query
  select 'ongoing_trip'::text,
         'Finish or leave the trip in progress "' || t.title || '"',
         t.id
  from public.trip_members tm
  join public.trips t on t.id = tm.trip_id
  where tm.user_id = v_user
    and tm.status = 'accepted'
    and t.status = 'ongoing'
    and t.creator_id <> v_user;

  return query
  select 'guild_leader'::text,
         'Hand "' || g.name || '" to another member, or ask PartyUp support to disband it',
         g.id
  from public.guilds g
  where g.leader_id = v_user
    and exists (
      select 1 from public.guild_members gm
      where gm.guild_id = g.id and gm.user_id <> v_user
    );

  return query
  select 'pending_payment'::text,
         'Wait for your payment for "' || t.title || '" to go through',
         tm.id
  from public.trip_members tm
  join public.trips t on t.id = tm.trip_id
  where tm.user_id = v_user
    and tm.payment_status = 'pending'
    and t.status <> 'cancelled';

  return query
  select 'pending_payment'::text,
         'Wait for a pending payment to go through',
         ph.id
  from public.payment_history ph
  where ph.user_id = v_user
    and ph.status = 'pending';
end;
$$;

grant execute on function public.account_deletion_blockers(uuid) to authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;

-- Shared by the self-service and admin paths. Raises if anything blocks it.
create or replace function public.schedule_account_deletion_internal(p_user_id uuid, p_reason text, p_actor uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_blockers text;
  v_when timestamptz := now() + interval '30 days';
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null then
    raise exception 'Account not found';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'Admin accounts can''t be deleted here';
  end if;
  if v_profile.deletion_scheduled_for is not null then
    return v_profile.deletion_scheduled_for;
  end if;

  select string_agg(b.label, E'\n') into v_blockers
  from public.account_deletion_blockers(p_user_id) b;
  if v_blockers is not null then
    raise exception 'Before deleting this account: %', v_blockers;
  end if;

  perform set_config('partyup.account_deletion', 'on', true);
  update public.profiles
  set deletion_requested_at = now(),
      deletion_scheduled_for = v_when,
      deletion_restore_active = v_profile.is_active,
      deletion_reason = nullif(trim(p_reason), ''),
      is_active = false
  where id = p_user_id;
  perform set_config('partyup.account_deletion', 'off', true);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'Scheduled account deletion', 'profile', p_user_id,
    jsonb_build_object('scheduled_for', v_when, 'by_admin', p_actor is distinct from p_user_id));

  return v_when;
end;
$$;

revoke all on function public.schedule_account_deletion_internal(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.cancel_account_deletion_internal(p_user_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if v_profile.id is null or v_profile.deletion_scheduled_for is null then
    return;
  end if;

  perform set_config('partyup.account_deletion', 'on', true);
  update public.profiles
  set deletion_requested_at = null,
      deletion_scheduled_for = null,
      is_active = coalesce(v_profile.deletion_restore_active, true),
      deletion_restore_active = null,
      deletion_reason = null
  where id = p_user_id;
  perform set_config('partyup.account_deletion', 'off', true);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'Cancelled account deletion', 'profile', p_user_id,
    jsonb_build_object('by_admin', p_actor is distinct from p_user_id));
end;
$$;

revoke all on function public.cancel_account_deletion_internal(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Self-service.
-- ---------------------------------------------------------------------
create or replace function public.request_account_deletion(p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  return public.schedule_account_deletion_internal(auth.uid(), p_reason, auth.uid());
end;
$$;

grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  perform public.cancel_account_deletion_internal(auth.uid(), auth.uid());
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------
-- Admin.
-- ---------------------------------------------------------------------
create or replace function public.admin_schedule_account_deletion(p_user_id uuid, p_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete accounts';
  end if;
  return public.schedule_account_deletion_internal(p_user_id, p_reason, auth.uid());
end;
$$;

grant execute on function public.admin_schedule_account_deletion(uuid, text) to authenticated;

create or replace function public.admin_cancel_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore accounts';
  end if;
  perform public.cancel_account_deletion_internal(p_user_id, auth.uid());
end;
$$;

grant execute on function public.admin_cancel_account_deletion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Purge job.
-- ---------------------------------------------------------------------
create or replace function public.due_account_deletions()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
  where deletion_scheduled_for is not null
    and deletion_scheduled_for <= now()
    and role <> 'admin'
  order by deletion_scheduled_for
  limit 50;
$$;

revoke all on function public.due_account_deletions() from public, anon, authenticated;
grant execute on function public.due_account_deletions() to service_role;

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
  if not exists (select 1 from public.due_account_deletions()) then
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

do $$
begin
  perform cron.unschedule('purge-deleted-accounts')
  where exists (select 1 from cron.job where jobname = 'purge-deleted-accounts');
  perform cron.schedule('purge-deleted-accounts', '0 3 * * *', 'select public.enqueue_account_purge()');
exception when others then
  raise notice 'pg_cron unavailable, skipping schedule: %', sqlerrm;
end;
$$;

commit;
