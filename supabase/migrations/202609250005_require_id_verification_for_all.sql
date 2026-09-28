begin;

-- ID verification is now required to use the app at all, not just to create
-- trips. The app gates every screen client-side; this migration covers the
-- server side:
--   1. Submitting an ID now actually flips profiles.verification_status to
--      'pending' (previously nothing did, so the app could never show
--      "under review" and users looked unverified until staff decided).
--   2. join_public_trip / join_trip_via_invite now require an approved ID,
--      matching create_trip.

-- 1a. protect_profile_sensitive_fields reverts any verification_status change
-- made while auth.uid() is the profile owner -- which includes a trigger
-- fired by the owner's own id_verifications insert. Let that one transition
-- through when the submission trigger below has flagged it for this
-- transaction.
create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and not public.is_staff_or_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    if not (
      current_setting('partyup.id_submission', true) = 'on'
      and old.verification_status in ('unverified', 'rejected')
      and new.verification_status = 'pending'
    ) then
      new.verification_status := old.verification_status;
    end if;
  end if;

  return new;
end;
$$;

-- 1b. Mark the profile pending whenever a new ID submission lands.
create or replace function public.mark_profile_verification_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform set_config('partyup.id_submission', 'on', true);
    update public.profiles
    set verification_status = 'pending'
    where id = new.user_id and verification_status in ('unverified', 'rejected');
    perform set_config('partyup.id_submission', 'off', true);
  end if;

  return new;
end;
$$;

drop trigger if exists mark_profile_verification_pending on public.id_verifications;
create trigger mark_profile_verification_pending
after insert on public.id_verifications
for each row execute function public.mark_profile_verification_pending();

-- 1c. Backfill: users whose latest submission is still awaiting review.
update public.profiles p
set verification_status = 'pending'
where p.verification_status in ('unverified', 'rejected')
  and exists (
    select 1 from public.id_verifications v
    where v.user_id = p.id
      and v.status = 'pending'
      and v.submitted_at = (select max(v2.submitted_at) from public.id_verifications v2 where v2.user_id = p.id)
  );

-- 2. Joining trips requires an approved ID.
create or replace function public.join_public_trip(p_trip_id uuid)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before joining a trip';
  end if;

  select * into v_trip from public.trips where id = p_trip_id and visibility = 'public';
  if v_trip.id is null then
    raise exception 'Trip not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting participants';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  insert into public.trip_members (trip_id, user_id, member_role, status, joined_at)
  values (v_trip.id, auth.uid(), 'member', 'accepted', now());

  insert into public.notifications (user_id, type, title, message)
  values (
    v_trip.creator_id, 'trip', 'New participant joined',
    (select display_name from public.profiles where id = auth.uid()) || ' joined "' || v_trip.title || '".'
  );

  return query select v_trip.id, 'accepted'::text;
end;
$$;

grant execute on function public.join_public_trip(uuid) to authenticated;

create or replace function public.join_trip_via_invite(p_invite_code text, p_referrer_user_id uuid default null)
returns table (trip_id uuid, member_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips;
  v_existing public.trip_members;
  v_referrer uuid;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.profiles where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'You must complete ID verification before joining a trip';
  end if;

  select * into v_trip from public.trips where invite_code = p_invite_code;
  if v_trip.id is null then
    raise exception 'Invite not found';
  end if;

  if v_trip.creator_id = auth.uid() then
    raise exception 'You created this trip';
  end if;

  select tm.* into v_existing from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = auth.uid();
  if v_existing.id is not null then
    return query select v_trip.id, v_existing.status;
    return;
  end if;

  if v_trip.status <> 'open' then
    raise exception 'This trip is no longer accepting riders';
  end if;

  if v_trip.seats_total is not null and coalesce(v_trip.seats_available, 0) <= 0 then
    raise exception 'This trip is full';
  end if;

  v_referrer := null;
  if p_referrer_user_id is not null and exists (
    select 1 from public.trip_members tm where tm.trip_id = v_trip.id and tm.user_id = p_referrer_user_id and tm.status = 'accepted'
  ) then
    v_referrer := p_referrer_user_id;
  end if;

  v_new_status := case when v_trip.visibility = 'public' then 'accepted' else 'pending' end;

  insert into public.trip_members (trip_id, user_id, member_role, status, invited_by_user_id, joined_at)
  values (v_trip.id, auth.uid(), 'member', v_new_status, v_referrer, case when v_new_status = 'accepted' then now() else null end);

  insert into public.notifications (user_id, type, title, message)
  select
    v_trip.creator_id, 'trip',
    case when v_new_status = 'accepted' then 'New rider joined' else 'Join request received' end,
    (select display_name from public.profiles where id = auth.uid()) ||
      case when v_new_status = 'accepted' then ' joined your trip "' || v_trip.title || '".'
           else ' requested to join your trip "' || v_trip.title || '".' end;

  return query select v_trip.id, v_new_status;
end;
$$;

grant execute on function public.join_trip_via_invite(text, uuid) to authenticated;

commit;
